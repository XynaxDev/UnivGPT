"""
Admin Router
Provides admin-only endpoints for metrics and audit logs.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
from collections import Counter
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

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


def parse_iso_datetime(raw: Any) -> Optional[datetime.datetime]:
    if not raw:
        return None
    try:
        return datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00")).astimezone(
            datetime.timezone.utc
        )
    except Exception:
        return None


class AdminUserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    avatar_url: Optional[str] = None


class AdminUserReportNoticeRequest(BaseModel):
    subject: Optional[str] = Field(default=None, max_length=180)
    message: Optional[str] = Field(default=None, max_length=2000)
    include_zero_query_users: bool = True
    max_recipients: int = Field(default=500, ge=1, le=2000)


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


def _safe_profile_role(value: Any) -> str:
    lowered = str(value or "").strip().lower()
    return lowered if lowered in {"student", "faculty", "admin"} else "student"


def _build_user_activity_dataset(
    supabase: Any,
    recipients_max: int,
) -> dict[str, Any]:
    profiles_res = (
        supabase.table("profiles")
        .select("id,email,full_name,role,department,created_at")
        .order("created_at", desc=True)
        .limit(2000)
        .execute()
    )
    profile_rows = profiles_res.data or []
    if not profile_rows:
        raise HTTPException(status_code=400, detail="No users found in profiles table.")

    users_for_report: list[dict[str, Any]] = []
    seen_emails: set[str] = set()
    duplicate_rows_skipped = 0

    for row in profile_rows:
        email = str(row.get("email") or "").strip()
        if not email:
            continue
        email_key = email.lower()
        if email_key in seen_emails:
            duplicate_rows_skipped += 1
            continue
        seen_emails.add(email_key)
        users_for_report.append(
            {
                "id": str(row.get("id") or ""),
                "email": email,
                "full_name": str(row.get("full_name") or "User").strip() or "User",
                "role": _safe_profile_role(row.get("role")),
                "department": str(row.get("department") or "").strip() or None,
                "created_at": row.get("created_at"),
            }
        )
        if len(users_for_report) >= recipients_max:
            break

    if not users_for_report:
        raise HTTPException(status_code=400, detail="No users with valid emails found.")

    query_counts: dict[str, int] = {}
    active_days_30: dict[str, int] = {}
    last_query_at: dict[str, Optional[str]] = {}
    account_age_days: dict[str, int] = {}
    joined_at_map: dict[str, Optional[str]] = {}
    now_utc = utc_now()

    for profile in users_for_report:
        uid = profile["id"]
        joined_dt = parse_iso_datetime(profile.get("created_at"))
        joined_at_map[uid] = iso(joined_dt) if joined_dt else None
        account_age_days[uid] = max(0, (now_utc - joined_dt).days) if joined_dt else 0
        if not uid:
            query_counts[uid] = 0
            active_days_30[uid] = 0
            last_query_at[uid] = None
            continue
        try:
            q_rows = (
                supabase.table("audit_logs")
                .select("timestamp")
                .eq("action", "agent_query")
                .eq("user_id", uid)
                .order("timestamp", desc=True)
                .limit(1200)
                .execute()
            )
            rows = q_rows.data or []
            query_counts[uid] = len(rows)
            if rows:
                newest_ts = rows[0].get("timestamp")
                last_query_at[uid] = iso(parse_iso_datetime(newest_ts)) if newest_ts else None
                active_days_set: set[str] = set()
                for row in rows:
                    dt = parse_iso_datetime(row.get("timestamp"))
                    if not dt:
                        continue
                    if (now_utc - dt).days <= 30:
                        active_days_set.add(dt.date().isoformat())
                active_days_30[uid] = len(active_days_set)
            else:
                last_query_at[uid] = None
                active_days_30[uid] = 0
        except Exception:
            query_counts[uid] = 0
            active_days_30[uid] = 0
            last_query_at[uid] = None

    role_counts = Counter(profile["role"] for profile in users_for_report)
    total_queries = sum(query_counts.get(profile["id"], 0) for profile in users_for_report)
    active_users = sum(1 for profile in users_for_report if query_counts.get(profile["id"], 0) > 0)

    top_users = sorted(
        users_for_report,
        key=lambda item: query_counts.get(item["id"], 0),
        reverse=True,
    )[:5]

    return {
        "users_for_report": users_for_report,
        "query_counts": query_counts,
        "active_days_30": active_days_30,
        "last_query_at": last_query_at,
        "account_age_days": account_age_days,
        "joined_at_map": joined_at_map,
        "role_counts": role_counts,
        "total_queries": total_queries,
        "active_users": active_users,
        "top_users": top_users,
        "duplicate_rows_skipped": duplicate_rows_skipped,
    }


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


@router.post("/admin/reports/user-activity-notice")
async def generate_user_activity_notice(
    body: AdminUserReportNoticeRequest,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    supabase = get_supabase_admin()

    recipients_max = min(max(1, int(body.max_recipients)), 2000)
    dataset = _build_user_activity_dataset(supabase, recipients_max)
    users_for_report = dataset["users_for_report"]
    query_counts = dataset["query_counts"]
    active_days_30 = dataset["active_days_30"]
    last_query_at = dataset["last_query_at"]
    account_age_days = dataset["account_age_days"]
    joined_at_map = dataset["joined_at_map"]
    role_counts = dataset["role_counts"]
    total_queries = dataset["total_queries"]
    active_users = dataset["active_users"]
    top_users = dataset["top_users"]
    duplicate_rows_skipped = dataset["duplicate_rows_skipped"]

    generated_at = iso(utc_now())
    subject = (body.subject or "").strip() or f"UnivGPT User Activity Report - {generated_at[:10]}"
    message = (
        (body.message or "").strip()
        or "Please review your current activity summary. Maintain responsible and professional usage of UnivGPT."
    )

    recipients = (
        users_for_report
        if body.include_zero_query_users
        else [profile for profile in users_for_report if query_counts.get(profile["id"], 0) > 0]
    )

    async def _send(profile: dict[str, Any]) -> bool:
        return await asyncio.to_thread(
            EmailService.send_user_activity_notice_email,
            profile["email"],
            profile["full_name"],
            subject,
            message,
            query_counts.get(profile["id"], 0),
            active_days_30.get(profile["id"], 0),
            account_age_days.get(profile["id"], 0),
            last_query_at.get(profile["id"]),
            user.full_name or user.email or "Admin",
            generated_at,
        )

    sent_count = 0
    failed_count = 0
    for profile in recipients:
        ok = await _send(profile)
        if ok:
            sent_count += 1
        else:
            failed_count += 1

    payload = {
        "subject": subject,
        "message": message,
        "generated_at": generated_at,
        "duplicate_rows_skipped": duplicate_rows_skipped,
        "stats": {
            "total_users": len(users_for_report),
            "total_queries": total_queries,
            "active_users": active_users,
            "queries_per_user_avg": round(total_queries / max(1, len(users_for_report)), 2),
            "users_by_role": {
                "student": int(role_counts.get("student", 0)),
                "faculty": int(role_counts.get("faculty", 0)),
                "admin": int(role_counts.get("admin", 0)),
            },
        },
        "top_users": [
            {
                "id": item["id"],
                "full_name": item["full_name"],
                "email": item["email"],
                "role": item["role"],
                "query_count": int(query_counts.get(item["id"], 0)),
                "active_days_30": int(active_days_30.get(item["id"], 0)),
                "account_age_days": int(account_age_days.get(item["id"], 0)),
                "joined_at": joined_at_map.get(item["id"]),
                "last_query_at": last_query_at.get(item["id"]),
            }
            for item in top_users
        ],
        "recipients_sent": sent_count,
        "recipients_failed": failed_count,
    }

    await log_audit_event(
        user_id=None if user.id.startswith("dummy-id-") else user.id,
        action="admin_user_report_notice",
        payload=payload,
    )

    return {
        "status": "success",
        "message": "User activity report notice generated and dispatched.",
        **payload,
    }


@router.post("/admin/reports/user-activity-notice/preview")
async def preview_user_activity_notice_recipients(
    body: AdminUserReportNoticeRequest,
    user: AuthenticatedUser = Depends(require_roles(UserRole.ADMIN)),
) -> dict[str, Any]:
    supabase = get_supabase_admin()
    recipients_max = min(max(1, int(body.max_recipients)), 2000)

    dataset = _build_user_activity_dataset(supabase, recipients_max)
    users_for_report = dataset["users_for_report"]
    query_counts = dataset["query_counts"]
    active_days_30 = dataset["active_days_30"]
    last_query_at = dataset["last_query_at"]
    account_age_days = dataset["account_age_days"]
    joined_at_map = dataset["joined_at_map"]
    role_counts = dataset["role_counts"]
    total_queries = dataset["total_queries"]
    active_users = dataset["active_users"]
    top_users = dataset["top_users"]
    duplicate_rows_skipped = dataset["duplicate_rows_skipped"]

    recipients = (
        users_for_report
        if body.include_zero_query_users
        else [profile for profile in users_for_report if query_counts.get(profile["id"], 0) > 0]
    )

    preview_limit = 20
    preview_recipients = [
        {
            "id": profile["id"],
            "email": profile["email"],
            "full_name": profile["full_name"],
            "role": profile["role"],
            "query_count": int(query_counts.get(profile["id"], 0)),
            "active_days_30": int(active_days_30.get(profile["id"], 0)),
            "account_age_days": int(account_age_days.get(profile["id"], 0)),
            "joined_at": joined_at_map.get(profile["id"]),
            "last_query_at": last_query_at.get(profile["id"]),
        }
        for profile in recipients[:preview_limit]
    ]

    return {
        "status": "success",
        "message": "Recipient preview generated.",
        "generated_at": iso(utc_now()),
        "duplicate_rows_skipped": duplicate_rows_skipped,
        "recipients_total": len(recipients),
        "preview_limit": preview_limit,
        "preview_recipients": preview_recipients,
        "stats": {
            "total_users": len(users_for_report),
            "total_queries": total_queries,
            "active_users": active_users,
            "queries_per_user_avg": round(total_queries / max(1, len(users_for_report)), 2),
            "users_by_role": {
                "student": int(role_counts.get("student", 0)),
                "faculty": int(role_counts.get("faculty", 0)),
                "admin": int(role_counts.get("admin", 0)),
            },
        },
        "top_users": [
            {
                "id": item["id"],
                "full_name": item["full_name"],
                "email": item["email"],
                "role": item["role"],
                "query_count": int(query_counts.get(item["id"], 0)),
                "active_days_30": int(active_days_30.get(item["id"], 0)),
                "account_age_days": int(account_age_days.get(item["id"], 0)),
                "joined_at": joined_at_map.get(item["id"]),
                "last_query_at": last_query_at.get(item["id"]),
            }
            for item in top_users
        ],
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
        payload={
            "target_user_id": target_user_id,
            "target_user_email": target_email,
            "target_user_name": target_name,
            "reviewer_email": user.email,
            "note": body.note,
        },
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
        payload={
            "target_user_id": target_user_id,
            "target_user_email": target_email,
            "target_user_name": target_name,
            "reviewer_email": user.email,
            "note": body.note,
        },
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
