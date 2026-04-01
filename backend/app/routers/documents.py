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


def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return isinstance(exc, httpx.ConnectError) or "getaddrinfo failed" in message or "name or service not known" in message

def ensure_supabase_available() -> None:
    if settings.supabase_offline_mode:
        raise HTTPException(
            status_code=503,
            detail="Supabase offline mode is enabled. Disable SUPABASE_OFFLINE_MODE to use database.",
        )

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
    allowed_types = get_allowed_doc_types(user.role)
    supabase = get_supabase_admin()
    
    try:
        query = supabase.table("documents").select("*", count="exact").in_("doc_type", allowed_types)
        if doc_type:
            query = query.eq("doc_type", doc_type)
            
        offset = (page - 1) * per_page
        res = query.range(offset, offset + per_page - 1).execute()
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
        ) for d in (res.data or [])
    ]

    return DocumentListResponse(documents=docs, total=res.count or len(docs), page=page, per_page=per_page)
