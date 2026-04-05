# Copyright (c) 2026 XynaxDev
# Contact: akashkumar.cs27@gmail.com

"""
Documents Router
Hybrid: Supabase (Metadata) + Pinecone (Vectors).
"""

import uuid
import asyncio
import json
import datetime
import httpx
from mimetypes import guess_type
from urllib.parse import urljoin
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, Query
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Any, Optional

from app.config import settings
from app.models.schemas import (
    DocumentResponse, DocumentListResponse, UserRole, DocType
)
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.middleware.rbac import require_roles, get_allowed_doc_types
from app.services.supabase_client import get_supabase_admin
from app.services.document_processor import (
    SUPPORTED_EXTENSIONS,
    derive_document_tags,
    derive_route_targets,
    derive_route_targets_from_metadata,
    is_supported_document,
    process_document,
)
from app.services.pinecone_client import pinecone_client
from app.services.audit import log_audit_event
from app.services.email_service import EmailService

router = APIRouter(tags=["Documents"])

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024


def utc_now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class DocumentUpdateRequest(BaseModel):
    doc_type: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    tags: Optional[list[str]] = None
    visibility: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None


class ServeNoticeRequest(BaseModel):
    title: str
    message: str
    target: str = "students"  # students | faculty | both
    department: Optional[str] = None
    course: Optional[str] = None
    attachment_document_id: Optional[str] = None
    tags: list[str] = []


def get_allowed_upload_doc_types(role: str) -> list[str]:
    if role == UserRole.ADMIN.value:
        return [DocType.STUDENT.value, DocType.FACULTY.value]
    if role == UserRole.FACULTY.value:
        # Faculty can only serve student-facing documents.
        return [DocType.STUDENT.value]
    return []


def parse_json_field(raw: str, default):
    try:
        return json.loads(raw) if raw else default
    except json.JSONDecodeError:
        return default


def parse_document_timestamp(raw: Any) -> Optional[datetime.datetime]:
    if not raw:
        return None
    try:
        return datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00")).astimezone(
            datetime.timezone.utc
        )
    except Exception:
        return None


def is_served_notice_row(row: dict[str, Any]) -> bool:
    tags = {
        str(tag).strip().lower()
        for tag in (row.get("tags") or [])
        if str(tag).strip()
    }
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    notice_type = str(metadata.get("notice_type") or "").strip().lower()
    filename = str(row.get("filename") or "").strip().lower()
    return (
        "served-notice" in tags
        or "served_notice" in tags
        or notice_type == "served"
        or filename.startswith("notice_")
    )


def can_view_served_notice_console_row(row: dict[str, Any], user: AuthenticatedUser) -> bool:
    role = str(user.role or "").strip().lower()
    if role == UserRole.ADMIN.value:
        return True

    if role != UserRole.FACULTY.value:
        return False

    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    uploader_id = str(row.get("uploader_id") or "").strip()
    served_by_email = str(metadata.get("served_by_email") or "").strip().lower()
    user_email = str(user.email or "").strip().lower()

    return bool(
        (uploader_id and uploader_id == str(user.id or "").strip())
        or (served_by_email and served_by_email == user_email)
    )


def normalize_scope_value(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if not text:
        return ""
    normalized = "".join(ch if ch.isalnum() else " " for ch in text)
    return " ".join(normalized.split())


def build_scope_variants(raw: Any) -> set[str]:
    collapsed = normalize_scope_value(raw)
    if not collapsed:
        return set()
    parts = [part for part in collapsed.split(" ") if part]
    variants = {collapsed, collapsed.replace(" ", "")}
    if len(parts) > 1:
        variants.add("".join(part[0] for part in parts))
    return {variant for variant in variants if variant}


def scope_matches(user_value: Any, doc_value: Any) -> bool:
    user_variants = build_scope_variants(user_value)
    doc_variants = build_scope_variants(doc_value)
    if not user_variants or not doc_variants:
        return False
    if user_variants & doc_variants:
        return True
    for user_variant in user_variants:
        for doc_variant in doc_variants:
            if len(user_variant) >= 2 and len(doc_variant) >= 2 and (
                user_variant in doc_variant or doc_variant in user_variant
            ):
                return True
    return False


def normalize_route_targets(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for entry in value:
        text = str(entry or "").strip().lower()
        if text and text not in result:
            result.append(text)
    return result


def get_doc_route_targets(doc: dict[str, Any]) -> list[str]:
    metadata = doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}
    return normalize_route_targets(metadata.get("route_targets"))


def is_document_relevant_for_user(doc: dict[str, Any], user: AuthenticatedUser) -> bool:
    doc_type = str(doc.get("doc_type") or "").strip().lower()
    role = str(user.role or "").strip().lower()
    route_targets = get_doc_route_targets(doc)
    if role == UserRole.ADMIN.value:
        allowed = True
    elif route_targets:
        allowed = role in route_targets
    elif role == UserRole.FACULTY.value:
        allowed = doc_type in {UserRole.FACULTY.value, UserRole.STUDENT.value}
    else:
        allowed = doc_type in {UserRole.STUDENT.value}
    if not allowed:
        return False

    user_dept = str(user.department or "").strip()
    user_program = str(user.program or "").strip()
    doc_dept = str(doc.get("department") or "").strip()
    doc_course = str(doc.get("course") or "").strip()

    if role == UserRole.ADMIN.value:
        return True

    if route_targets:
        if role not in route_targets:
            return False
        if not doc_dept and not doc_course:
            return True

    # Faculty-scoped documents should remain visible to faculty even when
    # optional department/program metadata is missing or not normalized.
    if role == UserRole.FACULTY.value and doc_type == UserRole.FACULTY.value:
        return True

    if not doc_dept and not doc_course:
        return True

    if scope_matches(user_dept, doc_dept):
        return True
    if scope_matches(user_program, doc_course):
        return True
    if scope_matches(user_dept, doc_course):
        return True
    if scope_matches(user_program, doc_dept):
        return True
    return False


def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return isinstance(exc, httpx.ConnectError) or "getaddrinfo failed" in message or "name or service not known" in message


def build_storage_path(document_id: str, filename: str) -> str:
    safe_name = "".join(ch if ch.isalnum() or ch in {".", "-", "_"} else "_" for ch in (filename or "document"))
    return f"documents/{document_id}/{safe_name}"


def upload_document_binary_to_storage(
    supabase,
    document_id: str,
    filename: str,
    file_bytes: bytes,
    content_type: str | None,
) -> tuple[str | None, str | None]:
    bucket = str(settings.supabase_storage_bucket or "").strip()
    if not bucket:
        return None, None
    storage_path = build_storage_path(document_id, filename)
    try:
        supabase.storage.from_(bucket).upload(
            storage_path,
            file_bytes,
            file_options={
                "content-type": content_type or "application/octet-stream",
                "upsert": "true",
            },
        )
        return bucket, storage_path
    except Exception:
        return None, None


def remove_document_binary_from_storage(supabase, metadata: dict[str, Any] | None) -> None:
    meta = metadata if isinstance(metadata, dict) else {}
    bucket = str(meta.get("storage_bucket") or settings.supabase_storage_bucket or "").strip()
    storage_path = str(meta.get("storage_path") or "").strip()
    if not bucket or not storage_path:
        return
    try:
        supabase.storage.from_(bucket).remove([storage_path])
    except Exception:
        pass


def create_storage_signed_url(supabase, metadata: dict[str, Any] | None) -> str | None:
    meta = metadata if isinstance(metadata, dict) else {}
    bucket = str(meta.get("storage_bucket") or settings.supabase_storage_bucket or "").strip()
    storage_path = str(meta.get("storage_path") or "").strip()
    if not bucket or not storage_path:
        return None
    try:
        signed = supabase.storage.from_(bucket).create_signed_url(storage_path, 60 * 60)
        signed_url = None
        if isinstance(signed, dict):
            signed_url = signed.get("signedURL") or signed.get("signed_url") or signed.get("url")
        else:
            signed_url = getattr(signed, "signedURL", None) or getattr(signed, "signed_url", None)
        if not signed_url:
            public_payload = supabase.storage.from_(bucket).get_public_url(storage_path)
            if isinstance(public_payload, dict):
                signed_url = (
                    public_payload.get("publicURL")
                    or public_payload.get("public_url")
                    or public_payload.get("url")
                )
            else:
                signed_url = (
                    getattr(public_payload, "publicURL", None)
                    or getattr(public_payload, "public_url", None)
                    or getattr(public_payload, "url", None)
                )
        if not signed_url:
            return None
        return signed_url if str(signed_url).startswith("http") else urljoin(f"{settings.supabase_url}/", str(signed_url).lstrip("/"))
    except Exception:
        return None


def download_document_binary_from_storage(
    supabase,
    metadata: dict[str, Any] | None,
) -> tuple[bytes | None, str | None]:
    meta = metadata if isinstance(metadata, dict) else {}
    bucket = str(meta.get("storage_bucket") or settings.supabase_storage_bucket or "").strip()
    storage_path = str(meta.get("storage_path") or "").strip()
    mime_type = str(meta.get("mime_type") or "").strip() or None
    if not bucket or not storage_path:
        return None, mime_type
    try:
        data = supabase.storage.from_(bucket).download(storage_path)
        if isinstance(data, (bytes, bytearray)):
            return bytes(data), mime_type
    except Exception:
        pass
    return None, mime_type


def build_notice_app_link(document_id: str) -> str:
    base = str(settings.frontend_app_url or "").rstrip("/")
    if not base:
        return "/dashboard/notifications"
    return f"{base}/dashboard/notifications"


def fetch_notice_recipients(
    supabase,
    notice_rows: list[dict[str, Any]],
    served_by_user_id: str | None = None,
) -> list[dict[str, Any]]:
    if not notice_rows:
        return []
    try:
        rows = (
            supabase.table("profiles")
            .select("id,email,full_name,role,department,program,preferences")
            .limit(2000)
            .execute()
        ).data or []
    except Exception:
        return []

    recipients: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for row in rows:
        profile_id = str(row.get("id") or "").strip()
        role = str(row.get("role") or "").strip().lower()
        email = str(row.get("email") or "").strip()
        if not profile_id or not email or role not in {UserRole.STUDENT.value, UserRole.FACULTY.value}:
            continue
        if served_by_user_id and profile_id == served_by_user_id:
            # Recipient fan-out is only for the targeted audience.
            continue
        preferences = row.get("preferences") if isinstance(row.get("preferences"), dict) else {}
        settings_payload = preferences.get("settings") if isinstance(preferences.get("settings"), dict) else {}
        if settings_payload.get("emailNotifications") is False:
            continue

        pseudo_user = AuthenticatedUser(
            id=profile_id,
            email=email,
            full_name=str(row.get("full_name") or "User").strip() or "User",
            role=role,
            department=str(row.get("department") or "").strip() or None,
            program=str(row.get("program") or "").strip() or None,
            semester=None,
            section=None,
            roll_number=None,
            academic_verified=True,
            created_at=None,
            avatar_url=None,
            identity_provider=None,
        )
        matched_notice = next((notice for notice in notice_rows if is_document_relevant_for_user(notice, pseudo_user)), None)
        if not matched_notice or profile_id in seen_ids:
            continue
        seen_ids.add(profile_id)
        recipients.append(
            {
                "id": profile_id,
                "email": email,
                "full_name": pseudo_user.full_name,
                "role": role,
                "department": pseudo_user.department,
                "program": pseudo_user.program,
                "notice": matched_notice,
            }
        )
    return recipients


def resolve_document_row_for_user(
    supabase,
    document_id: str,
    user: AuthenticatedUser,
) -> dict[str, Any]:
    allowed_types = get_allowed_doc_types(user.role)
    try:
        res = (
            supabase.table("documents")
            .select("id,filename,doc_type,department,course,tags,uploaded_at,updated_at,metadata,mime_type,file_size")
            .eq("id", document_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
            )
        raise

    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found")

    row = res.data[0]
    doc_type = str(row.get("doc_type") or "").strip().lower()
    route_targets = get_doc_route_targets(row)
    if not route_targets and doc_type not in {str(t).strip().lower() for t in allowed_types}:
        raise HTTPException(status_code=403, detail="You are not allowed to preview this document.")
    if not is_document_relevant_for_user(row, user):
        raise HTTPException(status_code=403, detail="You are not allowed to preview this document.")
    return row


def ensure_supabase_available() -> None:
    if settings.supabase_offline_mode:
        raise HTTPException(
            status_code=503,
            detail="Supabase offline mode is enabled. Disable SUPABASE_OFFLINE_MODE to use database.",
        )


def normalize_notice_target(value: str) -> str:
    text = str(value or "").strip().lower()
    if text in {"student", "students"}:
        return "students"
    if text in {"faculty"}:
        return "faculty"
    if text in {"both", "all"}:
        return "both"
    raise HTTPException(status_code=400, detail="Invalid notice target. Use students, faculty, or both.")


def resolve_actor_profile_id(supabase, user: AuthenticatedUser) -> str | None:
    raw_id = str(user.id or "").strip()
    try:
        uuid.UUID(raw_id)
        return raw_id
    except Exception:
        pass

    email = str(user.email or "").strip().lower()
    if not email:
        return None

    try:
        rows = (
            supabase.table("profiles")
            .select("id,email,role")
            .eq("email", email)
            .limit(10)
            .execute()
        ).data or []
    except Exception:
        return None

    if not rows:
        return None

    requested_role = str(user.role or "").strip().lower()
    for row in rows:
        candidate_id = str(row.get("id") or "").strip()
        candidate_role = str(row.get("role") or "").strip().lower()
        if candidate_id and candidate_role == requested_role:
            return candidate_id

    for row in rows:
        candidate_id = str(row.get("id") or "").strip()
        if candidate_id:
            return candidate_id
    return None


def notice_doc_types_for_target(target: str) -> list[str]:
    if target == "students":
        return [DocType.STUDENT.value]
    if target == "faculty":
        return [DocType.FACULTY.value]
    return [DocType.STUDENT.value, DocType.FACULTY.value]


@router.get("/documents/{document_id}/file")
async def serve_document_file(
    document_id: str,
    request: Request,
    download: bool = Query(False),
    user: AuthenticatedUser = Depends(get_current_user),
):
    ensure_supabase_available()
    try:
        uuid.UUID(str(document_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid document id for preview.")

    supabase = get_supabase_admin()
    row = resolve_document_row_for_user(supabase, document_id, user)
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    source_url = create_storage_signed_url(supabase, metadata)
    if not source_url:
        raise HTTPException(status_code=404, detail="Original file is not available for this document.")

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            file_response = await client.get(source_url)
            file_response.raise_for_status()
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach document storage right now. Please retry in a moment.",
            )
        raise HTTPException(status_code=502, detail="Unable to fetch the original document file.")

    filename = str(row.get("filename") or "document")
    mime_type = str(row.get("mime_type") or metadata.get("mime_type") or "").strip() or None
    resolved_type = mime_type or guess_type(filename)[0] or "application/octet-stream"
    disposition = "attachment" if download else "inline"
    return Response(
        content=file_response.content,
        media_type=resolved_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Cache-Control": "private, max-age=900",
        },
    )


@router.get("/documents/{document_id}/preview")
async def preview_document(
    document_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
):
    ensure_supabase_available()
    try:
        uuid.UUID(str(document_id))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid document id for preview.",
        )
    supabase = get_supabase_admin()
    row = resolve_document_row_for_user(supabase, document_id, user)
    doc_type = str(row.get("doc_type") or "").strip().lower()

    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    uploaded_at = row.get("uploaded_at") or row.get("updated_at")
    parsed_uploaded = parse_document_timestamp(uploaded_at)
    mime_type = str(row.get("mime_type") or metadata.get("mime_type") or "").strip() or None
    file_url = create_storage_signed_url(supabase, metadata)
    viewer_url = str(request.url_for("serve_document_file", document_id=document_id))
    download_url = f"{viewer_url}?download=1"
    preview_limit = 8
    chunk_count = int(metadata.get("chunk_count") or 0)

    snippet_chunks: list[dict[str, Any]] = []
    if pinecone_client.index:
        try:
            candidate_count = preview_limit if chunk_count <= 0 else min(preview_limit, chunk_count)
            ids = [f"doc_{document_id}_chunk_{idx}" for idx in range(candidate_count)]
            fetch_res = pinecone_client.index.fetch(ids=ids)

            vectors = {}
            if isinstance(fetch_res, dict):
                vectors = fetch_res.get("vectors") or {}
            else:
                vectors = getattr(fetch_res, "vectors", {}) or {}

            for vec_id, vec_data in vectors.items():
                meta = {}
                if isinstance(vec_data, dict):
                    meta = vec_data.get("metadata") or {}
                else:
                    meta = getattr(vec_data, "metadata", {}) or {}
                content = str(meta.get("content") or "").strip()
                if not content:
                    continue
                chunk_index = meta.get("chunk_index")
                if chunk_index is None:
                    try:
                        chunk_index = int(str(vec_id).split("_chunk_")[-1])
                    except Exception:
                        chunk_index = 0
                snippet_chunks.append(
                    {
                        "chunk_index": int(chunk_index),
                        "content": content,
                    }
                )
            snippet_chunks.sort(key=lambda item: item["chunk_index"])
            snippet_chunks = snippet_chunks[:preview_limit]
        except Exception:
            snippet_chunks = []

    return {
        "id": str(row.get("id") or document_id),
        "filename": str(row.get("filename") or "Document"),
        "doc_type": doc_type,
        "department": row.get("department"),
        "course": row.get("course"),
        "tags": row.get("tags") or [],
        "uploaded_at": parsed_uploaded.isoformat() if parsed_uploaded else (str(uploaded_at) if uploaded_at else None),
        "mime_type": mime_type,
        "file_url": file_url,
        "viewer_url": viewer_url,
        "download_url": download_url,
        "file_size": row.get("file_size"),
        "chunk_count": chunk_count,
        "chunks": snippet_chunks,
        "has_preview": len(snippet_chunks) > 0,
        "preview_source": "pinecone" if len(snippet_chunks) > 0 else "none",
        "is_notice": bool((metadata or {}).get("notice_type") == "served"),
        "notice_title": str((metadata or {}).get("notice_title") or "").strip() or None,
        "notice_message": str((metadata or {}).get("notice_message") or "").strip() or None,
        "attachment_document_id": str((metadata or {}).get("attachment_document_id") or "").strip() or None,
        "attachment_filename": str((metadata or {}).get("attachment_filename") or "").strip() or None,
    }

@router.post("/admin/notices/serve")
async def serve_notice(
    body: ServeNoticeRequest,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN, UserRole.FACULTY)),
):
    ensure_supabase_available()
    supabase = get_supabase_admin()
    title = str(body.title or "").strip()
    message = str(body.message or "").strip()
    if len(title) < 3:
        raise HTTPException(status_code=400, detail="Notice title must be at least 3 characters.")
    if len(message) < 8:
        raise HTTPException(status_code=400, detail="Notice message must be at least 8 characters.")

    target = normalize_notice_target(body.target)
    if user.role == UserRole.FACULTY.value and target != "students":
        raise HTTPException(
            status_code=403,
            detail="Faculty can send notices to students only.",
        )

    attachment_document_id = str(body.attachment_document_id or "").strip() or None
    attachment_filename: Optional[str] = None
    attachment_bytes: bytes | None = None
    attachment_mime_type: str | None = None
    if attachment_document_id:
        try:
            attachment_res = (
                supabase.table("documents")
                .select("id,filename,doc_type,department,course,metadata,mime_type")
                .eq("id", attachment_document_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            if is_network_error(exc):
                raise HTTPException(
                    status_code=503,
                    detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
                )
            raise
        attachment_rows = attachment_res.data or []
        if not attachment_rows:
            raise HTTPException(status_code=400, detail="Attachment document not found.")
        attachment_row = attachment_rows[0]
        if not is_document_relevant_for_user(attachment_row, user):
            raise HTTPException(status_code=403, detail="Attachment is outside your access scope.")
        attachment_filename = str(attachment_row.get("filename") or "Attachment")
        attachment_metadata = attachment_row.get("metadata") if isinstance(attachment_row.get("metadata"), dict) else {}
        attachment_bytes, attachment_mime_type = download_document_binary_from_storage(supabase, attachment_metadata)
        attachment_mime_type = str(attachment_row.get("mime_type") or attachment_mime_type or "").strip() or None

    selected_doc_types = notice_doc_types_for_target(target)
    department = str(body.department or user.department or "").strip()
    course = str(body.course or "").strip()
    manual_tags = [str(tag).strip() for tag in (body.tags or []) if str(tag).strip()]
    audit_user_id = resolve_actor_profile_id(supabase, user)
    if not audit_user_id:
        raise HTTPException(
            status_code=503,
            detail="Could not resolve your faculty/admin profile for notice delivery. Please sign in again and retry.",
        )

    created: list[dict[str, Any]] = []
    created_rows: list[dict[str, Any]] = []
    failures: list[str] = []
    now_iso = utc_now_iso()
    for doc_type in selected_doc_types:
        notice_id = str(uuid.uuid4())
        route_targets = derive_route_targets(doc_type)
        tags = derive_document_tags(
            filename=f"Notice - {title}",
            doc_type=doc_type,
            department=department,
            course=course,
            tags=manual_tags + ["notice", "announcement", "served_notice"],
            metadata={"notice_type": "served"},
        )
        payload_base = {
            "id": notice_id,
            "uploader_id": audit_user_id,
            "filename": f"NOTICE_{title}",
            "doc_type": doc_type,
            "department": department,
            "course": course,
            "tags": tags,
            "visibility": True,
        }
        payload_extended = {
            **payload_base,
            "metadata": {
                "notice_type": "served",
                "notice_title": title,
                "notice_message": message,
                "served_target": target,
                "served_doc_type": doc_type,
                "served_by_role": user.role,
                "served_by_email": user.email,
                "served_at": now_iso,
                "route_targets": route_targets,
                "attachment_document_id": attachment_document_id,
                "attachment_filename": attachment_filename,
            },
            "mime_type": "text/notice",
        }
        try:
            supabase.table("documents").insert(payload_extended).execute()
            created_rows.append(payload_extended)
            created.append(
                {
                    "id": notice_id,
                    "doc_type": doc_type,
                    "department": department or None,
                    "course": course or None,
                    "title": title,
                }
                )
        except Exception as exc:
            if any(marker in str(exc).lower() for marker in ("metadata", "mime_type")):
                try:
                    supabase.table("documents").insert(payload_base).execute()
                    created_rows.append(payload_extended)
                    created.append(
                        {
                            "id": notice_id,
                            "doc_type": doc_type,
                            "department": department or None,
                            "course": course or None,
                            "title": title,
                        }
                    )
                except Exception as inner_exc:
                    failures.append(f"{doc_type}: {inner_exc}")
            else:
                failures.append(f"{doc_type}: {exc}")

    if not created:
        raise HTTPException(status_code=500, detail=f"Failed to serve notice: {'; '.join(failures)}")

    await log_audit_event(
        user_id=audit_user_id,
        action="notice_served",
        payload={
            "title": title,
            "message": message,
            "target": target,
            "department": department or None,
            "course": course or None,
            "created_count": len(created),
            "notice_doc_ids": [item["id"] for item in created],
        },
    )

    try:
        from app.routers import auth as auth_router

        auth_router._DOCUMENTS_FEED_CACHE.clear()
        if audit_user_id:
            auth_router._clear_user_runtime_caches(audit_user_id)
        recipients = fetch_notice_recipients(
            supabase,
            notice_rows=created_rows,
            served_by_user_id=audit_user_id,
        )
        for recipient in recipients:
            auth_router._clear_user_runtime_caches(str(recipient.get("id") or ""))
    except Exception:
        recipients = []

    if recipients:
        app_link = build_notice_app_link(created[0]["id"])
        await asyncio.gather(
            *[
                asyncio.to_thread(
                    EmailService.send_served_notice_email,
                    receiver_email=str(recipient.get("email") or "").strip(),
                    user_name=str(recipient.get("full_name") or "User").strip() or "User",
                    subject=title,
                    message=message,
                    served_by=user.email,
                    served_at=now_iso,
                    course=course or None,
                    department=department or None,
                    attachment_filename=attachment_filename,
                    attachment_bytes=attachment_bytes,
                    attachment_mime_type=attachment_mime_type,
                    app_link=app_link,
                )
                for recipient in recipients
                if str(recipient.get("email") or "").strip()
            ],
            return_exceptions=True,
        )

    return {
        "status": "success",
        "message": f"Notice sent to {target}.",
        "target": target,
        "created": created,
        "failed": failures,
        "recipients": len(recipients) if 'recipients' in locals() else 0,
    }


@router.get("/admin/notices/served")
async def list_served_notices(
    limit: int = Query(default=80, ge=1, le=400),
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN, UserRole.FACULTY)),
):
    ensure_supabase_available()
    supabase = get_supabase_admin()
    fetch_limit = max(limit * 6, 240)
    try:
        rows = (
            supabase.table("documents")
            .select("id,filename,doc_type,department,course,tags,uploaded_at,updated_at,metadata,uploader_id")
            .order("uploaded_at", desc=True)
            .limit(fetch_limit)
            .execute()
        ).data or []
    except Exception as exc:
        lower = str(exc).lower()
        if "uploaded_at" in lower or "created_at" in lower:
            try:
                rows = (
                    supabase.table("documents")
                    .select("id,filename,doc_type,department,course,tags,uploaded_at,updated_at,metadata,uploader_id")
                    .order("updated_at", desc=True)
                    .limit(fetch_limit)
                    .execute()
                ).data or []
            except Exception:
                rows = (
                    supabase.table("documents")
                    .select("id,filename,doc_type,department,course,tags,uploaded_at,updated_at,metadata,uploader_id")
                    .limit(fetch_limit)
                    .execute()
                ).data or []
        else:
            raise

    served_rows = [row for row in rows if is_served_notice_row(row)]
    scoped_rows = [row for row in served_rows if can_view_served_notice_console_row(row, user)]
    result: list[dict[str, Any]] = []
    for row in scoped_rows:
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        result.append(
            {
                "id": str(row.get("id") or ""),
                "title": str(metadata.get("notice_title") or row.get("filename") or "Notice"),
                "message": str(metadata.get("notice_message") or "").strip(),
                "doc_type": str(row.get("doc_type") or ""),
                "department": row.get("department"),
                "course": row.get("course"),
                "uploaded_at": str(row.get("uploaded_at") or row.get("updated_at") or ""),
                "attachment_document_id": str(metadata.get("attachment_document_id") or "").strip() or None,
                "attachment_filename": str(metadata.get("attachment_filename") or "").strip() or None,
            }
        )

    result.sort(
        key=lambda item: parse_document_timestamp(item.get("uploaded_at"))
        or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
        reverse=True,
    )
    return {"items": result[:limit], "total": len(result)}


@router.post("/admin/documents", response_model=DocumentResponse)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    department: str = Form(""),
    course: str = Form(""),
    tags: str = Form("[]"),
    metadata: str = Form("{}"),
    audiences: str = Form("[]"),
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN, UserRole.FACULTY)),
):
    ensure_supabase_available()
    try:
        validated_doc_type = DocType(doc_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid doc_type")

    allowed_upload_types = get_allowed_upload_doc_types(user.role)
    if validated_doc_type.value not in allowed_upload_types:
        raise HTTPException(
            status_code=403,
            detail=f"{user.role.title()} users cannot upload {validated_doc_type.value} documents.",
        )

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    if not is_supported_document(file.filename):
        supported = ", ".join(sorted(ext.lstrip(".") for ext in SUPPORTED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed formats: {supported}.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds the 25 MB upload limit")

    document_id = str(uuid.uuid4())
    filename = file.filename or "unknown"

    parsed_tags = parse_json_field(tags, [])
    if not isinstance(parsed_tags, list):
        parsed_tags = []

    parsed_metadata = parse_json_field(metadata, {})
    if not isinstance(parsed_metadata, dict):
        parsed_metadata = {}
    parsed_audiences = parse_json_field(audiences, [])
    if not isinstance(parsed_audiences, list):
        parsed_audiences = []
    normalized_audiences = normalize_route_targets(parsed_audiences)
    if normalized_audiences:
        invalid_targets = [target for target in normalized_audiences if target not in allowed_upload_types]
        if invalid_targets:
            raise HTTPException(
                status_code=403,
                detail=f"{user.role.title()} users cannot target: {', '.join(invalid_targets)}.",
            )
        route_targets = [*normalized_audiences]
    else:
        route_targets = derive_route_targets(validated_doc_type.value)
    parsed_metadata["route_targets"] = route_targets

    derived_tags = derive_document_tags(
        filename=filename,
        doc_type=validated_doc_type.value,
        department=department,
        course=course,
        tags=[str(tag) for tag in parsed_tags],
        metadata=parsed_metadata,
    )

    # 1. Save metadata to Supabase Postgres
    supabase = get_supabase_admin()
    audit_user_id = resolve_actor_profile_id(supabase, user)
    if not audit_user_id:
        raise HTTPException(
            status_code=503,
            detail="Could not resolve the sender profile for this upload. Please sign in again and retry.",
        )
    base_payload = {
        "id": document_id,
        "uploader_id": audit_user_id,
        "filename": filename,
        "doc_type": validated_doc_type.value,
        "department": department,
        "course": course,
        "tags": derived_tags,
        "visibility": True,
    }
    storage_bucket, storage_path = upload_document_binary_to_storage(
        supabase,
        document_id=document_id,
        filename=filename,
        file_bytes=file_bytes,
        content_type=file.content_type,
    )

    storage_metadata = {
        "storage_bucket": storage_bucket,
        "storage_path": storage_path,
        "mime_type": file.content_type or "",
    }

    extended_payload = {
        **base_payload,
        "metadata": {**parsed_metadata, **storage_metadata, "route_targets": route_targets},
        "file_size": len(file_bytes),
        "mime_type": file.content_type or "",
    }

    try:
        supabase.table("documents").insert(extended_payload).execute()
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
            )
        # Support both the legacy schema and the richer migration schema.
        missing_column_markers = ["metadata", "file_size", "mime_type"]
        if any(marker in str(exc).lower() for marker in missing_column_markers):
            supabase.table("documents").insert(base_payload).execute()
        else:
            raise

    if not pinecone_client.index:
        # Ensure uploads do not silently skip vector indexing.
        try:
            supabase.table("documents").delete().eq("id", document_id).execute()
        except Exception:
            pass
        raise HTTPException(
            status_code=503,
            detail="Vector store is unavailable. Configure Pinecone and retry upload.",
        )

    # 2. Process and index to Pinecone (HuggingFace local embeddings)
    try:
        processing_result = await process_document(
            file_bytes=file_bytes, filename=filename, document_id=document_id,
            doc_type=validated_doc_type.value, department=department, course=course, tags=derived_tags,
            metadata=parsed_metadata
        )
    except Exception as exc:
        try:
            supabase.table("documents").delete().eq("id", document_id).execute()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Document processing failed: {exc}")

    if processing_result.get("chunk_count", 0) <= 0 or processing_result.get("embedding_count", 0) <= 0:
        try:
            supabase.table("documents").delete().eq("id", document_id).execute()
        except Exception:
            pass
        raise HTTPException(
            status_code=422,
            detail="Document text extraction or embedding failed. Please upload a readable text PDF/DOCX/TXT.",
        )

    # Persist useful processing metadata if the column exists (v2 schema).
    try:
        supabase.table("documents").update(
            {
                "metadata": {
                    **parsed_metadata,
                    "chunk_count": processing_result.get("chunk_count", 0),
                    "embedding_count": processing_result.get("embedding_count", 0),
                    "text_length": processing_result.get("text_length", 0),
                    "route_targets": processing_result.get("route_targets", route_targets),
                    **storage_metadata,
                },
                "updated_at": utc_now_iso(),
            }
        ).eq("id", document_id).execute()
    except Exception:
        pass

    await log_audit_event(
        user_id=audit_user_id,
        action="document_upload",
        payload={
            "doc_id": document_id,
            "filename": filename,
            "doc_type": validated_doc_type.value,
            "tags": derived_tags,
            "chunk_count": processing_result.get("chunk_count", 0),
            "route_targets": processing_result.get("route_targets", route_targets),
            "uploader_email": user.email,
        },
    )

    return DocumentResponse(
        id=document_id, filename=filename, doc_type=validated_doc_type,
        department=department, course=course, tags=derived_tags, visibility=True
    )


@router.patch("/admin/documents/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    body: DocumentUpdateRequest,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
):
    ensure_supabase_available()
    audit_user_id = None if user.id.startswith("dummy-id-") else user.id
    supabase = get_supabase_admin()
    try:
        existing = supabase.table("documents").select("*").eq("id", document_id).limit(1).execute()
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
            )
        raise
    if not existing.data:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = existing.data[0]
    filename = doc.get("filename", "unknown")

    next_doc_type = doc.get("doc_type")
    if body.doc_type is not None:
        try:
            next_doc_type = DocType(body.doc_type).value
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid doc_type")

    next_department = body.department if body.department is not None else doc.get("department") or ""
    next_course = body.course if body.course is not None else doc.get("course") or ""
    manual_tags = body.tags if body.tags is not None else (doc.get("tags") or [])
    next_metadata = body.metadata if body.metadata is not None else (doc.get("metadata") or {})
    if not isinstance(next_metadata, dict):
        next_metadata = {}

    derived_tags = derive_document_tags(
        filename=filename,
        doc_type=next_doc_type,
        department=next_department,
        course=next_course,
        tags=[str(t) for t in manual_tags] if isinstance(manual_tags, list) else [],
        metadata=next_metadata,
    )
    route_targets = derive_route_targets(next_doc_type)

    update_payload: dict[str, Any] = {
        "doc_type": next_doc_type,
        "department": next_department,
        "course": next_course,
        "tags": derived_tags,
    }
    if body.visibility is not None:
        update_payload["visibility"] = bool(body.visibility)
    if "metadata" in doc or body.metadata is not None:
        update_payload["metadata"] = {**next_metadata, "route_targets": route_targets}
    if "updated_at" in doc:
        update_payload["updated_at"] = utc_now_iso()

    try:
        supabase.table("documents").update(update_payload).eq("id", document_id).execute()
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
            )
        raise

    # Best-effort: update Pinecone metadata if we know chunk count.
    try:
        chunk_count = int((doc.get("metadata") or {}).get("chunk_count") or 0)
    except Exception:
        chunk_count = 0

    if pinecone_client.index and chunk_count > 0:
        for i in range(chunk_count):
            vector_id = f"doc_{document_id}_chunk_{i}"
            try:
                pinecone_client.index.update(
                    id=vector_id,
                    set_metadata={
                        "doc_type": next_doc_type,
                        "audience": next_doc_type,
                        "role": next_doc_type,
                        "department": next_department or "",
                        "course": next_course or "",
                        "tags": derived_tags,
                        "route_targets": route_targets,
                    },
                )
            except Exception:
                # Avoid failing the request if vector metadata update is unavailable.
                break

    await log_audit_event(
        user_id=audit_user_id,
        action="document_update",
        payload={
            "doc_id": document_id,
            "doc_type": next_doc_type,
            "tags": derived_tags,
            "route_targets": route_targets,
        },
    )

    return DocumentResponse(
        id=document_id,
        filename=filename,
        doc_type=DocType(next_doc_type),
        department=next_department or None,
        course=next_course or None,
        tags=derived_tags,
        visibility=bool(update_payload.get("visibility", doc.get("visibility", True))),
        uploaded_at=str(doc.get("uploaded_at") or doc.get("created_at") or ""),
    )


@router.delete("/admin/documents/{document_id}")
async def delete_document(
    document_id: str,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN, UserRole.FACULTY)),
):
    ensure_supabase_available()
    audit_user_id = None if user.id.startswith("dummy-id-") else user.id
    supabase = get_supabase_admin()
    try:
        existing = (
            supabase.table("documents")
            .select("id,filename,doc_type,department,course,uploader_id,metadata")
            .eq("id", document_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
            )
        raise
    if not existing.data:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = existing.data[0]
    if user.role == UserRole.FACULTY.value:
        uploader_id = str(doc.get("uploader_id") or "").strip()
        metadata = doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}
        served_by_email = str(metadata.get("served_by_email") or "").strip().lower()
        if not (
            (uploader_id and uploader_id == user.id)
            or (served_by_email and served_by_email == str(user.email or "").strip().lower())
        ):
            raise HTTPException(
                status_code=403,
                detail="Faculty can delete only documents or notices they uploaded.",
            )
        if not is_document_relevant_for_user(doc, user):
            raise HTTPException(
                status_code=403,
                detail="This document is outside your role scope.",
            )

    try:
        remove_document_binary_from_storage(supabase, doc.get("metadata"))
        supabase.table("documents").delete().eq("id", document_id).execute()
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
            )
        raise

    if pinecone_client.index:
        try:
            pinecone_client.index.delete(filter={"document_id": {"$eq": document_id}})
        except Exception:
            pass

    await log_audit_event(
        user_id=audit_user_id,
        action="document_delete",
        payload={"doc_id": document_id, "filename": doc.get("filename"), "doc_type": doc.get("doc_type")},
    )

    return {"status": "success", "message": "Document deleted"}


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    page: int = 1, per_page: int = 20, doc_type: str = None, 
    user: AuthenticatedUser = Depends(get_current_user)
):
    ensure_supabase_available()
    page = max(1, page)
    per_page = min(max(1, per_page), 100)
    allowed_types = get_allowed_doc_types(user.role)
    supabase = get_supabase_admin()
    
    try:
        selected_doc_type = str(doc_type or "").strip().lower() if doc_type else None
        if selected_doc_type and selected_doc_type not in {str(t).strip().lower() for t in allowed_types}:
            return DocumentListResponse(documents=[], total=0, page=page, per_page=per_page)

        # Admin users can paginate directly from the source table.
        if str(user.role or "").strip().lower() == UserRole.ADMIN.value:
            query = (
                supabase.table("documents")
                .select("*", count="exact")
                .in_("doc_type", allowed_types)
                .order("uploaded_at", desc=True)
            )
            if selected_doc_type:
                query = query.eq("doc_type", selected_doc_type)
            offset = (page - 1) * per_page
            try:
                res = query.range(offset, offset + per_page - 1).execute()
            except Exception as exc:
                if "uploaded_at" in str(exc).lower() or "created_at" in str(exc).lower():
                    fallback_query = (
                        supabase.table("documents")
                        .select("*", count="exact")
                        .in_("doc_type", allowed_types)
                        .order("updated_at", desc=True)
                    )
                    if selected_doc_type:
                        fallback_query = fallback_query.eq("doc_type", selected_doc_type)
                    res = fallback_query.range(offset, offset + per_page - 1).execute()
                else:
                    raise
            rows = res.data or []
            total_count = int(res.count or len(rows))
        else:
            # Non-admin users get strict in-memory scope filtering to prevent cross-department leakage.
            query = supabase.table("documents").select("*").in_("doc_type", allowed_types)
            if selected_doc_type:
                query = query.eq("doc_type", selected_doc_type)
            rows_all = query.limit(1500).execute().data or []
            scoped_rows = [row for row in rows_all if is_document_relevant_for_user(row, user)]
            scoped_rows.sort(
                key=lambda row: parse_document_timestamp(row.get("uploaded_at") or row.get("updated_at"))
                or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                reverse=True,
            )
            total_count = len(scoped_rows)
            offset = (page - 1) * per_page
            rows = scoped_rows[offset : offset + per_page]
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
            )
        raise

    docs = [
        DocumentResponse(
            id=d["id"], filename=d["filename"], doc_type=DocType(d["doc_type"]),
            department=d.get("department"), course=d.get("course"), tags=d.get("tags", []),
            visibility=bool(d.get("visibility", True)),
            uploaded_at=str(d.get("uploaded_at") or d.get("updated_at") or ""),
            metadata=d.get("metadata") if isinstance(d.get("metadata"), dict) else {},
        ) for d in rows
    ]

    return DocumentListResponse(documents=docs, total=total_count, page=page, per_page=per_page)


