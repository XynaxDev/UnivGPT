"""
Documents Router
Hybrid: Supabase (Metadata) + Pinecone (Vectors).
"""

import uuid
import json
import datetime
import httpx
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
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
    is_supported_document,
    process_document,
)
from app.services.pinecone_client import pinecone_client
from app.services.audit import log_audit_event

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


def get_allowed_upload_doc_types(role: str) -> list[str]:
    if role == UserRole.ADMIN.value:
        return [doc.value for doc in DocType]
    if role == UserRole.FACULTY.value:
        return [DocType.STUDENT.value, DocType.FACULTY.value, DocType.PUBLIC.value]
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


def is_document_relevant_for_user(doc: dict[str, Any], user: AuthenticatedUser) -> bool:
    doc_type = str(doc.get("doc_type") or "").strip().lower()
    role = str(user.role or "").strip().lower()
    if role == UserRole.ADMIN.value:
        allowed = True
    elif role == UserRole.FACULTY.value:
        allowed = doc_type in {UserRole.FACULTY.value, UserRole.STUDENT.value, "public"}
    else:
        allowed = doc_type in {UserRole.STUDENT.value, "public"}
    if not allowed:
        return False

    user_dept = (user.department or "").strip().lower()
    user_program = (user.program or "").strip().lower()
    doc_dept = str(doc.get("department") or "").strip().lower()
    doc_course = str(doc.get("course") or "").strip().lower()

    if role == UserRole.ADMIN.value:
        return True

    if not doc_dept and not doc_course:
        return True

    if user_dept and doc_dept and user_dept == doc_dept:
        return True
    if user_program and doc_course and user_program in doc_course:
        return True
    return False


def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return isinstance(exc, httpx.ConnectError) or "getaddrinfo failed" in message or "name or service not known" in message

def ensure_supabase_available() -> None:
    if settings.supabase_offline_mode:
        raise HTTPException(
            status_code=503,
            detail="Supabase offline mode is enabled. Disable SUPABASE_OFFLINE_MODE to use database.",
        )


@router.get("/documents/{document_id}/preview")
async def preview_document(
    document_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    ensure_supabase_available()
    allowed_types = get_allowed_doc_types(user.role)
    supabase = get_supabase_admin()

    try:
        res = (
            supabase.table("documents")
            .select("id,filename,doc_type,department,course,tags,uploaded_at,created_at,metadata")
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
    if doc_type not in {str(t).strip().lower() for t in allowed_types}:
        raise HTTPException(status_code=403, detail="You are not allowed to preview this document.")
    if not is_document_relevant_for_user(row, user):
        raise HTTPException(status_code=403, detail="You are not allowed to preview this document.")

    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    uploaded_at = row.get("uploaded_at") or row.get("created_at")
    parsed_uploaded = parse_document_timestamp(uploaded_at)
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
        "chunk_count": chunk_count,
        "chunks": snippet_chunks,
        "has_preview": len(snippet_chunks) > 0,
        "preview_source": "pinecone" if len(snippet_chunks) > 0 else "none",
    }

@router.post("/admin/documents", response_model=DocumentResponse)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    department: str = Form(""),
    course: str = Form(""),
    tags: str = Form("[]"),
    metadata: str = Form("{}"),
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

    derived_tags = derive_document_tags(
        filename=filename,
        doc_type=validated_doc_type.value,
        department=department,
        course=course,
        tags=[str(tag) for tag in parsed_tags],
        metadata=parsed_metadata,
    )
    route_targets = derive_route_targets(validated_doc_type.value)

    # 1. Save metadata to Supabase Postgres
    supabase = get_supabase_admin()
    audit_user_id = None if user.id.startswith("dummy-id-") else user.id
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
    extended_payload = {
        **base_payload,
        "metadata": {**parsed_metadata, "route_targets": route_targets},
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
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
):
    ensure_supabase_available()
    audit_user_id = None if user.id.startswith("dummy-id-") else user.id
    supabase = get_supabase_admin()
    try:
        existing = supabase.table("documents").select("id,filename,doc_type").eq("id", document_id).limit(1).execute()
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
    try:
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
            query = supabase.table("documents").select("*", count="exact").in_("doc_type", allowed_types)
            if selected_doc_type:
                query = query.eq("doc_type", selected_doc_type)
            offset = (page - 1) * per_page
            res = query.range(offset, offset + per_page - 1).execute()
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
                key=lambda row: parse_document_timestamp(row.get("uploaded_at") or row.get("created_at"))
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
            uploaded_at=str(d.get("uploaded_at") or d.get("created_at") or "")
        ) for d in rows
    ]

    return DocumentListResponse(documents=docs, total=total_count, page=page, per_page=per_page)
