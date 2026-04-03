"""
Admin Router
Provides admin-only endpoints for metrics and audit logs.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.middleware.auth import AuthenticatedUser
from app.middleware.auth import is_academic_email
from app.middleware.rbac import require_roles
from app.models.schemas import UserRole, DeanAppealDecisionRequest
from app.config import settings
from app.services.pinecone_client import pinecone_client
from app.services.supabase_client import get_supabase_admin
from app.services.audit import log_audit_event
from app.services.email_service import EmailService
from app.services.agent_pipeline import (
    list_moderation_appeals,
    review_user_moderation_appeal,
    admin_reset_user_moderation_flags,
    moderation_meta_from_state,
)

router = APIRouter(tags=["Admin"])
logger = logging.getLogger(__name__)


def utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def iso(dt: datetime.datetime) -> str:
    return dt.astimezone(datetime.timezone.utc).isoformat()


class AdminUserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    avatar_url: Optional[str] = None


def _require_dean_access(user: AuthenticatedUser) -> None:
    dean_emails = set(settings.dean_emails_list)
    smtp_user = (settings.smtp_user or "").strip().lower()
    if smtp_user:
        dean_emails.add(smtp_user)
    if not dean_emails:
        # Dev fallback: if dean list is not configured, allow admin access.
        return
    if (user.email or "").strip().lower() not in dean_emails:
        raise HTTPException(status_code=403, detail="Dean access required.")


def _fetch_target_profile_for_appeal_mail(supabase, target_user_id: str) -> tuple[str | None, str]:
    try:
        res = (
            supabase.table("profiles")
            .select("email,full_name")
            .eq("id", target_user_id)
            .limit(1)
            .execute()
        )
        row = (res.data or [{}])[0]
        email = (row.get("email") or "").strip() or None
        name = (row.get("full_name") or "User").strip() or "User"
        return email, name
    except Exception as exc:
        logger.warning("Failed to fetch target profile for appeal email: %s", exc)
        return None, "User"


async def _send_appeal_status_email_if_possible(
    *,
    receiver_email: str | None,
    full_name: str,
    approved: bool,
    decision_note: str | None,
) -> None:
    if not receiver_email:
        return
    try:
        await asyncio.to_thread(
            EmailService.send_appeal_status_email,
            receiver_email,
            full_name,
            approved,
            decision_note,
        )
    except Exception as exc:
        logger.warning("Appeal status email dispatch failed: %s", exc)


@router.get("/admin/metrics")
async def get_admin_metrics(
    include_vector_stats: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    supabase = get_supabase_admin()

    docs_res = supabase.table("documents").select("id", count="exact").execute()
    conv_res = supabase.table("conversations").select("id", count="exact").execute()
    users_res = supabase.table("profiles").select("id", count="exact").execute()

    total_documents = docs_res.count or 0
    total_conversations = conv_res.count or 0
    total_users = users_res.count or 0

    total_embeddings = 0
    # Pinecone describe call may add noticeable latency on dashboards.
    # Keep dashboard fast by default and allow explicit opt-in when needed.
    if include_vector_stats and pinecone_client.index:
        try:
            stats = pinecone_client.index.describe_index_stats()
            # Pinecone returns a dict with `total_vector_count` on most versions.
            total_embeddings = int(stats.get("total_vector_count") or 0)
        except Exception:
            total_embeddings = 0

    # Time series from audit logs (last 7 days)
    start = utc_now() - datetime.timedelta(days=6)
    start_iso = iso(start.replace(hour=0, minute=0, second=0, microsecond=0))

    audit_res = (
        supabase.table("audit_logs")
        .select("action,timestamp", count="exact")
        .gte("timestamp", start_iso)
        .order("timestamp", desc=False)
        .execute()
    )
    audit_rows = audit_res.data or []

    buckets: dict[str, dict[str, int]] = {}
    for i in range(7):
        day = (start + datetime.timedelta(days=i)).date().isoformat()
        buckets[day] = {"queries": 0, "uploads": 0, "admin": 0, "auth": 0}

    for row in audit_rows:
        ts = row.get("timestamp")
        if not ts:
            continue
        try:
            day = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).date().isoformat()
        except Exception:
            continue

        if day not in buckets:
            continue

        action = (row.get("action") or "").lower()
        if action == "agent_query":
            buckets[day]["queries"] += 1
        elif action == "document_upload":
            buckets[day]["uploads"] += 1
        elif "login" in action or "signup" in action or "reset_password" in action:
            buckets[day]["auth"] += 1
        else:
            buckets[day]["admin"] += 1

    timeseries = [
        {"date": day, **counts}
        for day, counts in sorted(buckets.items(), key=lambda x: x[0])
    ]

    # Breakdown: users by role and documents by doc_type
    role_counts = {"student": 0, "faculty": 0, "admin": 0}
    try:
        role_rows = supabase.table("profiles").select("role").execute().data or []
        for r in role_rows:
            role = (r.get("role") or "").lower()
            if role in role_counts:
                role_counts[role] += 1
    except Exception:
        pass

    doc_type_counts = {"public": 0, "student": 0, "faculty": 0, "admin": 0}
    try:
        doc_rows = supabase.table("documents").select("doc_type").execute().data or []
        for d in doc_rows:
            dt = (d.get("doc_type") or "").lower()
            if dt in doc_type_counts:
                doc_type_counts[dt] += 1
    except Exception:
        pass

    return {
        "stats": {
            "total_documents": total_documents,
            "total_embeddings": total_embeddings,
            "total_conversations": total_conversations,
            "total_users": total_users,
            "total_chats": total_conversations,
        },
        "breakdowns": {
            "users_by_role": role_counts,
            "documents_by_type": doc_type_counts,
        },
        "timeseries": {
            "last_7_days": timeseries,
        },
    }


@router.get("/admin/audit")
async def get_audit_logs(
    page: int = 1,
    per_page: int = 50,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    page = max(1, int(page))
    per_page = max(1, min(int(per_page), 200))

    supabase = get_supabase_admin()
    offset = (page - 1) * per_page
    res = (
        supabase.table("audit_logs")
        .select("*", count="exact")
        .order("timestamp", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )

    rows = res.data or []
    user_ids = {row.get("user_id") for row in rows if row.get("user_id")}
    profiles: dict[str, dict[str, str]] = {}

    if user_ids:
        prof_res = (
            supabase.table("profiles")
            .select("id,email,full_name,role")
            .in_("id", list(user_ids))
            .execute()
        )
        for p in prof_res.data or []:
            profiles[p["id"]] = {
                "email": p.get("email", ""),
                "full_name": p.get("full_name", ""),
                "role": p.get("role", ""),
            }

    def map_row(row: dict[str, Any]) -> dict[str, Any]:
        uid = row.get("user_id")
        return {
            "id": str(row.get("id", "")),
            "action": row.get("action", ""),
            "user_id": uid,
            "user": profiles.get(uid) if uid else None,
            "payload": row.get("payload") or {},
            "ip_address": row.get("ip_address"),
            "status": row.get("status"),
            "timestamp": row.get("timestamp"),
        }

    return {
        "logs": [map_row(r) for r in rows],
        "total": res.count or len(rows),
        "page": page,
        "per_page": per_page,
    }


@router.get("/admin/users")
async def list_admin_users(
    page: int = 1,
    per_page: int = 50,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    page = max(1, int(page))
    per_page = max(1, min(int(per_page), 200))

    supabase = get_supabase_admin()
    offset = (page - 1) * per_page
    res = (
        supabase.table("profiles")
        .select("id,email,full_name,role,department,avatar_url,created_at", count="exact")
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )

    rows = res.data or []

    def map_profile(p: dict[str, Any]) -> dict[str, Any]:
        email = p.get("email", "")
        return {
            "id": str(p.get("id", "")),
            "email": email,
            "full_name": p.get("full_name", ""),
            "role": (p.get("role") or "student").lower(),
            "department": p.get("department"),
            "avatar_url": p.get("avatar_url"),
            "created_at": str(p.get("created_at")) if p.get("created_at") else None,
            "academic_verified": is_academic_email(email),
            "identity_provider": None,
        }

    return {
        "users": [map_profile(p) for p in rows],
        "total": res.count or len(rows),
        "page": page,
        "per_page": per_page,
    }


@router.patch("/admin/users/{target_user_id}")
async def update_admin_user(
    target_user_id: str,
    body: AdminUserUpdateRequest,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    update_payload: dict[str, Any] = {}
    if body.full_name is not None:
        update_payload["full_name"] = body.full_name
    if body.department is not None:
        update_payload["department"] = body.department
    if body.avatar_url is not None:
        update_payload["avatar_url"] = body.avatar_url
    if body.role is not None:
        try:
            update_payload["role"] = UserRole(body.role).value
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid role")

    if not update_payload:
        raise HTTPException(status_code=400, detail="No fields provided")

    supabase = get_supabase_admin()
    res = (
        supabase.table("profiles")
        .update(update_payload)
        .eq("id", target_user_id)
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")

    audit_user_id = None if user.id.startswith("dummy-id-") else user.id
    await log_audit_event(
        user_id=audit_user_id,
        action="admin_user_update",
        payload={"target_user_id": target_user_id, **update_payload},
    )

    p = res.data[0]
    email = p.get("email", "")
    return {
        "user": {
            "id": str(p.get("id", "")),
            "email": email,
            "full_name": p.get("full_name", ""),
            "role": (p.get("role") or "student").lower(),
            "department": p.get("department"),
            "avatar_url": p.get("avatar_url"),
            "created_at": str(p.get("created_at")) if p.get("created_at") else None,
            "academic_verified": is_academic_email(email),
            "identity_provider": None,
        }
    }


@router.get("/admin/dean/appeals")
async def get_dean_appeals(
    status: str = "pending",
    limit: int = 100,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    _require_dean_access(user)
    supabase = get_supabase_admin()
    normalized_status = str(status or "pending").strip().lower()
    if normalized_status not in {"pending", "approved", "rejected", "all"}:
        raise HTTPException(status_code=400, detail="Invalid status filter.")
    items = list_moderation_appeals(supabase, status=normalized_status, limit=max(1, min(limit, 500)))
    return {"appeals": items, "total": len(items), "status": normalized_status}


@router.post("/admin/dean/appeals/{target_user_id}/approve")
async def approve_dean_appeal(
    target_user_id: str,
    body: DeanAppealDecisionRequest,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    _require_dean_access(user)
    supabase = get_supabase_admin()
    target_email, target_name = _fetch_target_profile_for_appeal_mail(supabase, target_user_id)
    state = review_user_moderation_appeal(
        supabase=supabase,
        target_user_id=target_user_id,
        approved=True,
        reviewer_id=user.id,
        reviewer_email=user.email,
        decision_note=body.note,
    )
    await log_audit_event(
        user_id=None if user.id.startswith("dummy-id-") else user.id,
        action="dean_appeal_approved",
        payload={"target_user_id": target_user_id, "note": body.note},
    )
    await _send_appeal_status_email_if_possible(
        receiver_email=target_email,
        full_name=target_name,
        approved=True,
        decision_note=body.note,
    )
    return {"status": "success", "message": "Appeal approved and user flags reset.", "moderation": moderation_meta_from_state(state)}


@router.post("/admin/dean/appeals/{target_user_id}/reject")
async def reject_dean_appeal(
    target_user_id: str,
    body: DeanAppealDecisionRequest,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    _require_dean_access(user)
    supabase = get_supabase_admin()
    target_email, target_name = _fetch_target_profile_for_appeal_mail(supabase, target_user_id)
    state = review_user_moderation_appeal(
        supabase=supabase,
        target_user_id=target_user_id,
        approved=False,
        reviewer_id=user.id,
        reviewer_email=user.email,
        decision_note=body.note,
    )
    await log_audit_event(
        user_id=None if user.id.startswith("dummy-id-") else user.id,
        action="dean_appeal_rejected",
        payload={"target_user_id": target_user_id, "note": body.note},
    )
    await _send_appeal_status_email_if_possible(
        receiver_email=target_email,
        full_name=target_name,
        approved=False,
        decision_note=body.note,
    )
    return {"status": "success", "message": "Appeal rejected. User remains blocked.", "moderation": moderation_meta_from_state(state)}


@router.post("/admin/dean/users/{target_user_id}/reset-flags")
async def reset_user_flags(
    target_user_id: str,
    body: DeanAppealDecisionRequest,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    _require_dean_access(user)
    supabase = get_supabase_admin()
    state = admin_reset_user_moderation_flags(
        supabase=supabase,
        target_user_id=target_user_id,
        reviewer_id=user.id,
        reviewer_email=user.email,
        note=body.note,
    )
    await log_audit_event(
        user_id=None if user.id.startswith("dummy-id-") else user.id,
        action="dean_flags_reset",
        payload={"target_user_id": target_user_id, "note": body.note},
    )
    return {"status": "success", "message": "User flags reset and chat access restored.", "moderation": moderation_meta_from_state(state)}
