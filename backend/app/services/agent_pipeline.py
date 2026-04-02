"""
Agent Pipeline Service
RAG Pipeline using:
- Pinecone (Vector Search with Intent Extraction)
- HuggingFace (Local Embeddings)
- Supabase (Conversation Persistence)
- OpenRouter (LLM Generation & Intent Extraction)
"""

import uuid
import json
import httpx
import logging
import datetime
import re
import asyncio
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any

from app.config import settings
from app.models.schemas import SourceCitation, AgentQueryResponse
from app.middleware.rbac import get_allowed_doc_types
from app.services.pinecone_client import pinecone_client
from app.services.document_processor import get_single_embedding
from app.services.supabase_client import get_supabase_admin
from app.services.audit import log_audit_event
from app.services.agent_moderation import detect_local_moderation
from app.services.agent_intent_router import (
    is_fast_smalltalk_query,
    should_filter_recent_documents,
    infer_intent_from_query,
    enrich_intent_with_profile,
)
from app.services.agent_directory import (
    fetch_course_faculty_snapshot,
    should_use_course_faculty_snapshot,
    append_intent_navigation_links,
    build_course_faculty_answer,
)

logger = logging.getLogger(__name__)

# Capability flags to avoid repeated failing schema probes on every request.
_DOCUMENTS_HAS_UPLOADED_AT: Optional[bool] = None
_OPENROUTER_CLIENT: Optional[httpx.AsyncClient] = None
_PINECONE_EMBEDDING_DISABLED = False
_OFFENSE_STATE_CACHE: dict[str, dict[str, Any]] = {}
MAX_MODERATION_WARNINGS = 2
_ADMIN_ALLOWED_INTENT_TYPES = {
    "count_users",
    "count_documents",
    "list_documents",
    "document_date_lookup",
    "holiday_check",
    "count_courses",
    "list_courses",
    "count_faculty",
    "list_faculty",
    "faculty_profile",
    "course_faculty_map",
}
_ADMIN_ALLOWED_TARGETS = {
    "users",
    "students",
    "faculty",
    "admins",
    "documents",
    "notices",
    "courses",
    "audit",
    "logs",
    "moderation",
    "appeals",
    "system",
    "metrics",
    "pipeline",
}


def get_openrouter_client() -> httpx.AsyncClient:
    global _OPENROUTER_CLIENT
    if _OPENROUTER_CLIENT is None:
        timeout_seconds = max(5, int(settings.openrouter_timeout_seconds or 20))
        _OPENROUTER_CLIENT = httpx.AsyncClient(timeout=float(timeout_seconds))
    return _OPENROUTER_CLIENT

def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    if isinstance(exc, httpx.RequestError):
        return True
    return "getaddrinfo failed" in message or "name or service not known" in message or "nodename nor servname provided" in message


def _is_embedding_runtime_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "fbgemm.dll" in message or "winerror 126" in message or "error loading" in message


def _is_pinecone_timeout_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "timed out" in message
        or "connecttimeout" in message
        or "readtimeout" in message
        or "connection to" in message and "timeout" in message
    )


def _load_offense_state(supabase, user_id: str) -> dict[str, Any]:
    def _default_state() -> dict[str, Any]:
        return {
            "warning_count": 0,
            "offensive_messages": [],
            "offense_total": 0,
            "blocked": False,
            "blocked_at": None,
            "appeal": {
                "status": "none",  # none | pending | approved | rejected
                "message": None,
                "submitted_at": None,
                "reviewed_at": None,
                "reviewed_by": None,
                "decision_note": None,
            },
        }

    def _normalize_state(raw: dict[str, Any]) -> dict[str, Any]:
        base = _default_state()
        raw_state = raw if isinstance(raw, dict) else {}
        warning_count = int(raw_state.get("warning_count", 0) or 0)
        history = raw_state.get("offensive_messages")
        history = [str(item) for item in history] if isinstance(history, list) else []
        offense_total = int(raw_state.get("offense_total", 0) or 0)
        blocked = bool(raw_state.get("blocked", False))
        blocked_at = str(raw_state.get("blocked_at")) if raw_state.get("blocked_at") else None
        appeal_raw = raw_state.get("appeal") if isinstance(raw_state.get("appeal"), dict) else {}
        appeal = {
            "status": str(appeal_raw.get("status") or "none"),
            "message": str(appeal_raw.get("message")) if appeal_raw.get("message") else None,
            "submitted_at": str(appeal_raw.get("submitted_at")) if appeal_raw.get("submitted_at") else None,
            "reviewed_at": str(appeal_raw.get("reviewed_at")) if appeal_raw.get("reviewed_at") else None,
            "reviewed_by": str(appeal_raw.get("reviewed_by")) if appeal_raw.get("reviewed_by") else None,
            "decision_note": str(appeal_raw.get("decision_note")) if appeal_raw.get("decision_note") else None,
        }
        base.update(
            {
                "warning_count": warning_count,
                "offensive_messages": history[-12:],
                "offense_total": offense_total,
                "blocked": blocked,
                "blocked_at": blocked_at,
                "appeal": appeal,
            }
        )
        return base

    cached = _OFFENSE_STATE_CACHE.get(user_id)
    if cached:
        return _normalize_state(cached)

    base_state = _default_state()
    if not supabase or not user_id or user_id.startswith("dummy-id-"):
        return base_state

    try:
        res = (
            supabase.table("profiles")
            .select("preferences")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        row = (res.data or [{}])[0]
        preferences = row.get("preferences") if isinstance(row.get("preferences"), dict) else {}
        moderation = preferences.get("moderation") if isinstance(preferences.get("moderation"), dict) else {}
        state = _normalize_state(moderation)
        _OFFENSE_STATE_CACHE[user_id] = state
        return state
    except Exception:
        return base_state


def _persist_offense_state(supabase, user_id: str, state: dict[str, Any]) -> None:
    normalized = {
        "warning_count": int(state.get("warning_count", 0) or 0),
        "offensive_messages": [str(item) for item in (state.get("offensive_messages") or [])][-12:],
        "offense_total": int(state.get("offense_total", 0) or 0),
        "blocked": bool(state.get("blocked", False)),
        "blocked_at": str(state.get("blocked_at")) if state.get("blocked_at") else None,
        "appeal": (
            state.get("appeal")
            if isinstance(state.get("appeal"), dict)
            else {
                "status": "none",
                "message": None,
                "submitted_at": None,
                "reviewed_at": None,
                "reviewed_by": None,
                "decision_note": None,
            }
        ),
    }
    _OFFENSE_STATE_CACHE[user_id] = normalized

    if not supabase or not user_id or user_id.startswith("dummy-id-"):
        return

    try:
        profile_res = (
            supabase.table("profiles")
            .select("preferences")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        existing = (profile_res.data or [{}])[0]
        preferences = existing.get("preferences") if isinstance(existing.get("preferences"), dict) else {}
        preferences["moderation"] = normalized
        supabase.table("profiles").update({"preferences": preferences}).eq("id", user_id).execute()
    except Exception as exc:
        logger.warning("Failed to persist moderation state: %s", exc)


def _build_moderation_meta(state: dict[str, Any]) -> dict[str, Any]:
    appeal = state.get("appeal") if isinstance(state.get("appeal"), dict) else {}
    appeal_status = str(appeal.get("status") or "none")
    return {
        "blocked": bool(state.get("blocked", False)),
        "warning_count": int(state.get("warning_count", 0) or 0),
        "max_warnings": MAX_MODERATION_WARNINGS,
        "offense_total": int(state.get("offense_total", 0) or 0),
        "appeal_required": bool(state.get("blocked", False)),
        "appeal_status": appeal_status,
        "appeal_submitted_at": appeal.get("submitted_at"),
        "blocked_at": state.get("blocked_at"),
    }


def moderation_meta_from_state(state: dict[str, Any]) -> dict[str, Any]:
    return _build_moderation_meta(state)


def get_user_moderation_state(supabase, user_id: str) -> dict[str, Any]:
    return _load_offense_state(supabase, user_id)


def submit_user_moderation_appeal(
    supabase,
    user_id: str,
    appeal_message: str,
) -> dict[str, Any]:
    state = _load_offense_state(supabase, user_id)
    appeal_text = str(appeal_message or "").strip()
    if not appeal_text:
        raise ValueError("Appeal message is required.")
    if not bool(state.get("blocked")):
        raise ValueError("Appeal is available only for blocked users.")

    state["appeal"] = {
        "status": "pending",
        "message": appeal_text,
        "submitted_at": utc_now_iso(),
        "reviewed_at": None,
        "reviewed_by": None,
        "decision_note": None,
    }
    _persist_offense_state(supabase, user_id, state)
    return state


def review_user_moderation_appeal(
    supabase,
    target_user_id: str,
    approved: bool,
    reviewer_id: str,
    reviewer_email: str,
    decision_note: Optional[str] = None,
) -> dict[str, Any]:
    state = _load_offense_state(supabase, target_user_id)
    decision_time = utc_now_iso()
    appeal = state.get("appeal") if isinstance(state.get("appeal"), dict) else {}
    appeal["reviewed_at"] = decision_time
    appeal["reviewed_by"] = reviewer_id or reviewer_email
    appeal["decision_note"] = str(decision_note or "").strip() or None

    if approved:
        # Full reset after dean approval.
        state["warning_count"] = 0
        state["offense_total"] = 0
        state["offensive_messages"] = []
        state["blocked"] = False
        state["blocked_at"] = None
        appeal["status"] = "approved"
    else:
        state["blocked"] = True
        if not state.get("blocked_at"):
            state["blocked_at"] = decision_time
        appeal["status"] = "rejected"

    state["appeal"] = appeal
    _persist_offense_state(supabase, target_user_id, state)
    return state


def admin_reset_user_moderation_flags(
    supabase,
    target_user_id: str,
    reviewer_id: str,
    reviewer_email: str,
    note: Optional[str] = None,
) -> dict[str, Any]:
    state = _load_offense_state(supabase, target_user_id)
    state["warning_count"] = 0
    state["offense_total"] = 0
    state["offensive_messages"] = []
    state["blocked"] = False
    state["blocked_at"] = None
    state["appeal"] = {
        "status": "approved",
        "message": None,
        "submitted_at": None,
        "reviewed_at": utc_now_iso(),
        "reviewed_by": reviewer_id or reviewer_email,
        "decision_note": str(note or "").strip() or "Flags reset by dean.",
    }
    _persist_offense_state(supabase, target_user_id, state)
    return state


def list_moderation_appeals(
    supabase,
    status: str = "pending",
    limit: int = 100,
) -> list[dict[str, Any]]:
    if not supabase:
        return []
    try:
        rows = (
            supabase.table("profiles")
            .select("id,email,full_name,role,department,preferences")
            .limit(limit)
            .execute()
        ).data or []
    except Exception:
        return []

    normalized_status = str(status or "pending").strip().lower()
    items: list[dict[str, Any]] = []
    for row in rows:
        preferences = row.get("preferences") if isinstance(row.get("preferences"), dict) else {}
        moderation = preferences.get("moderation") if isinstance(preferences.get("moderation"), dict) else {}
        state = {
            "warning_count": int(moderation.get("warning_count", 0) or 0),
            "offensive_messages": moderation.get("offensive_messages") or [],
            "offense_total": int(moderation.get("offense_total", 0) or 0),
            "blocked": bool(moderation.get("blocked", False)),
            "blocked_at": moderation.get("blocked_at"),
            "appeal": moderation.get("appeal") if isinstance(moderation.get("appeal"), dict) else {},
        }
        appeal = state.get("appeal") if isinstance(state.get("appeal"), dict) else {}
        appeal_status = str(appeal.get("status") or "none").lower()
        if normalized_status != "all" and appeal_status != normalized_status:
            continue
        if appeal_status == "none":
            continue
        items.append(
            {
                "user_id": str(row.get("id") or ""),
                "email": row.get("email"),
                "full_name": row.get("full_name"),
                "role": row.get("role"),
                "department": row.get("department"),
                "blocked": bool(state.get("blocked")),
                "blocked_at": state.get("blocked_at"),
                "offense_total": int(state.get("offense_total", 0) or 0),
                "warning_count": int(state.get("warning_count", 0) or 0),
                "offensive_messages": [str(msg) for msg in (state.get("offensive_messages") or [])][-12:],
                "appeal": {
                    "status": appeal_status,
                    "message": appeal.get("message"),
                    "submitted_at": appeal.get("submitted_at"),
                    "reviewed_at": appeal.get("reviewed_at"),
                    "reviewed_by": appeal.get("reviewed_by"),
                    "decision_note": appeal.get("decision_note"),
                },
            }
        )

    items.sort(key=lambda item: str((item.get("appeal") or {}).get("submitted_at") or ""), reverse=True)
    return items

def _safe_iso(raw: Optional[str]) -> str:
    if not raw:
        return ""
    try:
        parsed = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.isoformat()
    except Exception:
        return str(raw)

def _format_short_date(raw: Optional[str]) -> str:
    if not raw:
        return "-"
    try:
        parsed = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d")
    except Exception:
        return str(raw)

def parse_date_string(raw: Optional[str]) -> Optional[datetime.date]:
    if not raw:
        return None
    raw = raw.strip()
    iso_match = re.search(r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b", raw)
    if iso_match:
        try:
            return datetime.date(int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3)))
        except ValueError:
            return None
    alt_match = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b", raw)
    if alt_match:
        try:
            return datetime.date(int(alt_match.group(3)), int(alt_match.group(2)), int(alt_match.group(1)))
        except ValueError:
            return None
    if raw.lower() == "today":
        return datetime.datetime.now().date()
    if raw.lower() == "tomorrow":
        return datetime.datetime.now().date() + datetime.timedelta(days=1)
    if raw.lower() == "yesterday":
        return datetime.datetime.now().date() - datetime.timedelta(days=1)
    return None

class IntentPayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    is_flagged: bool = False
    reason: Optional[str] = None
    conversation_mode: Optional[str] = None
    intent_type: Optional[str] = None
    target_entity: Optional[str] = None
    document_date: Optional[str] = None
    date_reference: Optional[str] = None
    doc_type: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    tags: Optional[list[str]] = None

def fetch_admin_snapshot(supabase) -> dict:
    snapshot: dict[str, Any] = {
        "counts": {},
        "users_by_role": {},
        "recent_documents": [],
        "recent_users": [],
        "recent_audits": [],
    }
    if not supabase:
        return snapshot

    def safe_count(table: str, action_filter: Optional[str] = None) -> int:
        try:
            query = supabase.table(table).select("id", count="exact")
            if action_filter:
                query = query.eq("action", action_filter)
            res = query.execute()
            return int(res.count or 0)
        except Exception:
            return 0

    def safe_role_count(role: str) -> int:
        try:
            res = supabase.table("profiles").select("id", count="exact").eq("role", role).execute()
            return int(res.count or 0)
        except Exception:
            return 0

    snapshot["counts"] = {
        "total_users": safe_count("profiles"),
        "total_documents": safe_count("documents"),
        "total_conversations": safe_count("conversations"),
        "total_queries": safe_count("audit_logs", "agent_query"),
    }
    snapshot["users_by_role"] = {
        "student": safe_role_count("student"),
        "faculty": safe_role_count("faculty"),
        "admin": safe_role_count("admin"),
    }

    # Recent documents
    try:
        try:
            doc_res = (
                supabase.table("documents")
                .select("id, filename, doc_type, department, course, tags, uploaded_at, created_at, uploader_id")
                .order("uploaded_at", desc=True)
                .limit(25)
                .execute()
            )
        except Exception as exc:
            if "uploaded_at" in str(exc):
                doc_res = (
                    supabase.table("documents")
                    .select("id, filename, doc_type, department, course, tags, created_at, uploader_id")
                    .order("created_at", desc=True)
                    .limit(25)
                    .execute()
                )
            else:
                raise
        for row in doc_res.data or []:
            snapshot["recent_documents"].append(
                {
                    "id": row.get("id"),
                    "filename": row.get("filename"),
                    "doc_type": row.get("doc_type"),
                    "department": row.get("department") or "",
                    "course": row.get("course") or "",
                    "tags": row.get("tags") or [],
                    "uploaded_at": _safe_iso(row.get("uploaded_at") or row.get("created_at")),
                    "uploader_id": row.get("uploader_id"),
                }
            )
    except Exception:
        snapshot["recent_documents"] = []

    # Recent users
    try:
        user_res = (
            supabase.table("profiles")
            .select("id, email, full_name, role, department, created_at, academic_verified, identity_provider")
            .order("created_at", desc=True)
            .limit(15)
            .execute()
        )
        for row in user_res.data or []:
            snapshot["recent_users"].append(
                {
                    "id": row.get("id"),
                    "email": row.get("email"),
                    "full_name": row.get("full_name"),
                    "role": row.get("role"),
                    "department": row.get("department") or "",
                    "created_at": _safe_iso(row.get("created_at")),
                    "academic_verified": row.get("academic_verified"),
                    "identity_provider": row.get("identity_provider"),
                }
            )
    except Exception:
        snapshot["recent_users"] = []

    # Recent audits (lightweight)
    try:
        audit_res = (
            supabase.table("audit_logs")
            .select("action, user_id, created_at")
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        snapshot["recent_audits"] = audit_res.data or []
    except Exception:
        snapshot["recent_audits"] = []

    return snapshot

def fetch_documents_for_date(supabase, target_date: datetime.date) -> list[dict]:
    if not supabase:
        return []
    start = datetime.datetime.combine(target_date, datetime.time.min).isoformat()
    end = (datetime.datetime.combine(target_date, datetime.time.min) + datetime.timedelta(days=1)).isoformat()
    try:
        try:
            res = (
                supabase.table("documents")
                .select("id, filename, doc_type, department, course, tags, uploaded_at, created_at")
                .gte("uploaded_at", start)
                .lt("uploaded_at", end)
                .order("uploaded_at", desc=False)
                .execute()
            )
        except Exception as exc:
            if "uploaded_at" in str(exc):
                res = (
                    supabase.table("documents")
                    .select("id, filename, doc_type, department, course, tags, created_at")
                    .gte("created_at", start)
                    .lt("created_at", end)
                    .order("created_at", desc=False)
                    .execute()
                )
            else:
                raise
        return res.data or []
    except Exception:
        return []

def render_admin_snapshot(snapshot: dict) -> str:
    counts = snapshot.get("counts", {})
    users_by_role = snapshot.get("users_by_role", {})
    recent_docs = snapshot.get("recent_documents", [])
    recent_users = snapshot.get("recent_users", [])

    today = datetime.datetime.now().date()
    tomorrow = today + datetime.timedelta(days=1)

    lines = [
        "ADMIN LIVE DATA SNAPSHOT:",
        f"- Today: {today.isoformat()}",
        f"- Tomorrow: {tomorrow.isoformat()}",
        f"- Total users: {counts.get('total_users', 0)}",
        f"- Users by role: students {users_by_role.get('student', 0)}, faculty {users_by_role.get('faculty', 0)}, admins {users_by_role.get('admin', 0)}",
        f"- Total documents: {counts.get('total_documents', 0)}",
        f"- Total conversations: {counts.get('total_conversations', 0)}",
        f"- Total queries (audit): {counts.get('total_queries', 0)}",
    ]

    if recent_docs:
        lines.append("Recent documents (latest 25):")
        for doc in recent_docs:
            date_str = _format_short_date(doc.get("uploaded_at"))
            tags = ", ".join(doc.get("tags") or []) if isinstance(doc.get("tags"), list) else ""
            lines.append(
                f"- {date_str} | {doc.get('doc_type') or 'unknown'} | {doc.get('filename') or 'untitled'}"
                f" | dept: {doc.get('department') or '-'} | course: {doc.get('course') or '-'}"
                f"{f' | tags: {tags}' if tags else ''}"
            )
    else:
        lines.append("Recent documents: none (0 total).")

    if recent_users:
        lines.append("Recent users (latest 15):")
        for user in recent_users:
            joined = _format_short_date(user.get("created_at"))
            lines.append(
                f"- {joined} | {user.get('email') or 'unknown'} | role: {user.get('role') or 'unknown'}"
            )
    else:
        lines.append("Recent users: none (0 total).")

    lines.append("If asked about holidays, check document titles/tags for 'holiday' or 'closed'. If none, state that no documents indicate a holiday.")
    return "\n".join(lines)


def fetch_user_profile_context(supabase, user_id: str) -> dict[str, Any]:
    if not supabase or not user_id:
        return {}
    try:
        res = (
            supabase.table("profiles")
            .select("*")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        return (res.data or [{}])[0]
    except Exception:
        return {}


def _doc_datetime(row: dict[str, Any]) -> Optional[datetime.datetime]:
    raw = row.get("uploaded_at") or row.get("created_at")
    if not raw:
        return None
    try:
        return datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except Exception:
        return None


def _normalize(value: Any) -> str:
    return str(value or "").strip().lower()


def role_badge_for(role: str) -> str:
    role_norm = _normalize(role)
    if role_norm == "admin":
        return "Admin Assistant"
    if role_norm == "faculty":
        return "Faculty Assistant"
    return "Student Assistant"


def is_admin_scope_intent(intent: dict[str, Any]) -> bool:
    conversation_mode = _normalize(intent.get("conversation_mode"))
    if conversation_mode == "casual":
        return True

    intent_type = _normalize(intent.get("intent_type"))
    target_entity = _normalize(intent.get("target_entity"))
    if intent_type in _ADMIN_ALLOWED_INTENT_TYPES:
        return True
    if target_entity in _ADMIN_ALLOWED_TARGETS:
        return True
    return False


def _matches_filter(value: Any, expected: str) -> bool:
    return expected in _normalize(value)


async def build_fast_smalltalk_answer(
    query: str,
    user_role: str,
    user_profile: Optional[dict[str, Any]] = None,
    conversation_mode: str = "task",
    has_recent_assistant_turn: bool = False,
) -> str:
    profile = user_profile or {}
    role_norm = str(user_role or "student").strip().lower()
    role_guidance = {
        "admin": "ops, users, audit, and document governance scope",
        "faculty": "teaching, course notices, and department coordination scope",
        "student": "course notices, deadlines, and policy support scope",
    }.get(role_norm, "role-scoped university support")
    role_capability_focus = {
        "admin": "user counts, audit trends, and document pipeline status",
        "faculty": "course notices, class updates, and faculty/course mappings",
        "student": "course notices, deadlines, faculty/course mappings, and policy guidance",
    }.get(role_norm, "role-scoped university workflows")

    mode_instruction = (
        "The user is in casual conversation. Reply in 1 short line, warm but professional. "
        "Do not over-greet or restate broad capability lists."
        if conversation_mode == "casual"
        else "The user asked for capabilities. Reply in 2 short lines with concrete, role-scoped help areas only."
    )
    continuity_instruction = (
        "The assistant already replied recently in this conversation. Continue naturally and do not start with greeting words like Hi/Hey."
        if has_recent_assistant_turn
        else "If the user greets, you may greet once; otherwise respond directly without opening pleasantries."
    )

    profile_hints: list[str] = []
    if profile.get("department"):
        profile_hints.append(f"department={profile.get('department')}")
    if profile.get("program"):
        profile_hints.append(f"program={profile.get('program')}")
    if profile.get("semester"):
        profile_hints.append(f"semester={profile.get('semester')}")
    profile_hint_text = ", ".join(profile_hints) if profile_hints else "not available"

    system_prompt = (
        "You are UnivGPT, the university assistant. "
        f"The user role is `{role_norm}` with {role_guidance}. "
        f"Focus capabilities on: {role_capability_focus}. "
        f"Profile hints: {profile_hint_text}. "
        f"{mode_instruction} "
        f"{continuity_instruction} "
        "Do not mention the user's name unless they explicitly ask you to. "
        "Do not use bullet points. Keep it concise, natural, and non-repetitive. "
        "Avoid generic filler such as 'I can help with anything' or 'just chatting'. "
        "Answer the exact user ask directly."
    )

    user_prompt = query

    try:
        llm_text = await asyncio.wait_for(
            call_llm(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=110,
                temperature=0.65,
                allow_fallback_models=True,
                max_retries_override=1,
            ),
            timeout=8.0,
        )
        cleaned = str(llm_text or "").strip()
        if cleaned and cleaned != "I'm sorry, I'm having trouble connecting to my brain right now.":
            return cleaned
    except Exception:
        pass

    # Minimal emergency fallback only when all model calls fail.
    return "I couldn't generate a reply just now. Please retry."


def fetch_filtered_documents(
    supabase,
    allowed_types: list[str],
    intent: dict[str, Any],
    context: Optional[dict],
    query: str,
) -> list[dict[str, Any]]:
    global _DOCUMENTS_HAS_UPLOADED_AT
    if not supabase:
        return []
    if not allowed_types:
        return []

    def query_documents(order_column: str):
        select_columns = "id,filename,doc_type,department,course,tags,created_at"
        if order_column == "uploaded_at":
            select_columns = "id,filename,doc_type,department,course,tags,uploaded_at,created_at"
        return (
            supabase.table("documents")
            .select(select_columns)
            .in_("doc_type", allowed_types)
            .order(order_column, desc=True)
            .limit(500)
            .execute()
        )

    try:
        if _DOCUMENTS_HAS_UPLOADED_AT is False:
            res = query_documents("created_at")
        else:
            try:
                # Default to created_at to avoid schema-induced 400s on older tables.
                res = query_documents("created_at")
            except Exception as exc:
                logger.info("Documents query fallback to uploaded_at due to created_at query failure: %s", exc)
                res = query_documents("uploaded_at")
                _DOCUMENTS_HAS_UPLOADED_AT = True
    except Exception:
        return []

    rows = res.data or []
    doc_type_filter = _normalize(intent.get("doc_type") or intent.get("role"))
    department_filter = _normalize(intent.get("department") or (context or {}).get("dept"))
    course_filter = _normalize(intent.get("course") or (context or {}).get("course"))
    tags_filter = [str(tag).strip().lower() for tag in (intent.get("tags") or []) if str(tag).strip()]
    target_entity = _normalize(intent.get("target_entity"))
    notice_mode = any(marker in target_entity for marker in ("notice", "announcement", "circular")) or any(
        marker in _normalize(query) for marker in ("notice", "announcement", "circular")
    )
    recent_mode = should_filter_recent_documents(query, intent)
    exact_date = parse_date_string(str(intent.get("document_date") or intent.get("date_reference") or ""))
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    filtered: list[dict[str, Any]] = []
    for row in rows:
        doc_type = _normalize(row.get("doc_type"))
        if doc_type_filter and doc_type != doc_type_filter:
            continue
        if department_filter and not _matches_filter(row.get("department"), department_filter):
            continue
        if course_filter and not _matches_filter(row.get("course"), course_filter):
            continue

        tags = [str(tag).strip().lower() for tag in (row.get("tags") or []) if str(tag).strip()]
        if tags_filter and not all(tag in tags for tag in tags_filter):
            continue

        if notice_mode:
            filename = _normalize(row.get("filename"))
            is_notice = any(marker in filename for marker in ("notice", "announcement", "circular")) or any(
                marker in tags for marker in ("notice", "announcement", "circular")
            )
            if not is_notice:
                continue

        if recent_mode:
            dt = _doc_datetime(row)
            if not dt:
                continue
            if (now_utc - dt.astimezone(datetime.timezone.utc)) > datetime.timedelta(days=30):
                continue

        if exact_date:
            dt = _doc_datetime(row)
            if not dt:
                continue
            if dt.date() != exact_date:
                continue

        filtered.append(row)

    filtered.sort(
        key=lambda item: _doc_datetime(item) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
        reverse=True,
    )
    return filtered


def utc_now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


async def call_llm(
    messages: list,
    response_format: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    allow_fallback_models: bool = True,
    max_retries_override: Optional[int] = None,
) -> str:
    """Helper to call OpenRouter LLM."""
    if settings.mock_llm:
        return "This is a mock response from the agent."

    client = get_openrouter_client()
    candidate_models: list[str] = []
    primary_model = (model or settings.openrouter_model or "").strip()
    if primary_model:
        candidate_models.append(primary_model)
    if allow_fallback_models:
        for fallback in settings.openrouter_fallback_models_list:
            if fallback not in candidate_models:
                candidate_models.append(fallback)

    configured_retries = settings.openrouter_max_retries if max_retries_override is None else max_retries_override
    max_retries = max(0, int(configured_retries or 0))
    backoff = max(0.1, float(settings.openrouter_retry_backoff_seconds or 0.8))

    last_exception: Optional[Exception] = None
    for selected_model in candidate_models or [settings.openrouter_model]:
        for attempt in range(max_retries + 1):
            payload = {
                "model": selected_model,
                "messages": messages,
            }
            if response_format == "json":
                payload["response_format"] = {"type": "json_object"}
            if max_tokens is not None:
                payload["max_tokens"] = int(max_tokens)
            if temperature is not None:
                payload["temperature"] = float(temperature)
            try:
                response = await client.post(
                    f"{settings.openrouter_base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.openrouter_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()

                message = ((data.get("choices") or [{}])[0].get("message") or {})
                content = message.get("content")

                if isinstance(content, list):
                    text_parts: list[str] = []
                    for block in content:
                        if isinstance(block, dict):
                            block_text = block.get("text")
                            if isinstance(block_text, str):
                                text_parts.append(block_text)
                    content = "\n".join(text_parts).strip()

                if isinstance(content, str) and content.strip():
                    return content

                if response_format == "json":
                    return "{}"
                return "I'm sorry, I'm having trouble connecting to my brain right now."
            except httpx.HTTPStatusError as exc:
                last_exception = exc
                status = exc.response.status_code
                retriable = status in {408, 409, 425, 429, 500, 502, 503, 504}
                if retriable and attempt < max_retries:
                    await asyncio.sleep(backoff * (2 ** attempt))
                    continue
                if status == 429:
                    logger.warning("OpenRouter rate limited on model %s (attempt %s).", selected_model, attempt + 1)
                else:
                    logger.error("LLM HTTP error on model %s: %s", selected_model, exc)
                break
            except Exception as exc:
                last_exception = exc
                if attempt < max_retries:
                    await asyncio.sleep(backoff * (2 ** attempt))
                    continue
                logger.error("LLM Call failed on model %s: %s", selected_model, exc)
                break

    if last_exception:
        logger.error("LLM call failed after retries/fallbacks: %s", last_exception)
    if response_format == "json":
        return "{}"
    return "I'm sorry, I'm having trouble connecting to my brain right now."


def _safe_json_dict(content: Any) -> dict[str, Any]:
    if isinstance(content, dict):
        return content
    if isinstance(content, (bytes, bytearray)):
        parsed = json.loads(content.decode("utf-8", errors="replace"))
        return parsed if isinstance(parsed, dict) else {}
    parsed = json.loads(str(content))
    return parsed if isinstance(parsed, dict) else {}


async def run_backup_moderation_check(query: str, history_context: str = "") -> Dict[str, Any]:
    """
    Secondary model-only moderation check.
    Used when the main intent+moderation extraction fails or returns invalid JSON.
    """
    backup_prompt = f"""
    You are a strict safety classifier for UnivGPT.
    Recent conversation history:
    {history_context}

    Classify only the latest user query.
    Set "is_flagged": true when the query contains hate speech, harassment, abusive/disrespectful personal attacks,
    threats, or demeaning comments about a person (including teacher/faculty/staff/student).
    Set "is_flagged": false for normal academic questions, neutral policy questions, and mild non-targeted frustration.

    Return ONLY valid JSON:
    {{
      "is_flagged": boolean,
      "reason": "short reason when flagged, else empty string"
    }}
    """

    try:
        timeout_seconds = max(3, min(8, int(settings.openrouter_timeout_seconds or 20) // 2 or 4))
        model_name = settings.openrouter_model
        content = await asyncio.wait_for(
            call_llm(
                [
                    {"role": "system", "content": backup_prompt},
                    {"role": "user", "content": f"Query: {query}"},
                ],
                response_format="json",
                model=model_name,
                max_tokens=120,
                temperature=0.0,
                allow_fallback_models=True,
                max_retries_override=1,
            ),
            timeout=float(timeout_seconds),
        )
        raw = _safe_json_dict(content)
        if raw.get("is_flagged") is True:
            return {
                "is_flagged": True,
                "reason": str(raw.get("reason") or "Abusive or unsafe content detected."),
                "intent_type": "general",
                "target_entity": "general",
            }
    except Exception as exc:
        logger.warning("Backup moderation check failed: %s", exc)

    # Provider-independent fallback when moderation model is unavailable or inconclusive.
    strict_local = detect_local_moderation(query, strict=True)
    if strict_local.get("is_flagged"):
        return strict_local

    return {"is_flagged": False}


async def extract_query_intent(query: str, history_context: str = "") -> Dict[str, Any]:
    """
    Extract dynamic filtering metadata from the user's query.
    Returns any potential metadata filters as a JSON object.
    """
    system_prompt = f"""
    You are an intent extraction and safety moderation assistant for the UnivGPT system.
    Recent conversation history for context:
    {history_context}

    Task 1 (Moderation): Analyze the user's latest query for abusive/disrespectful content.
    Set `"is_flagged": true` when the user message contains:
    - hate speech or slurs
    - harassment, insults, demeaning personal attacks, or identity-based targeting
    - direct threats
    - abusive allegations about a specific teacher/faculty/staff/student/person
    Keep `"is_flagged": false` for normal academic questions, neutral policy questions, mild frustration, general complaints, apologies, or references to moderation itself.
    Task 2 (Conversation Mode): classify whether the query is primarily casual chit-chat/emotional venting or an actionable university data/task query.
    Task 3 (Intent Routing): Extract structured intent metadata so downstream tools can filter data before the main LLM response.

    Return ONLY a valid JSON object with these fields when applicable:
    - is_flagged: boolean
    - reason: string (if flagged)
    - conversation_mode: one of ["casual","task"]
    - intent_type: one of ["count_users","count_documents","list_documents","document_date_lookup","holiday_check","count_courses","list_courses","count_faculty","list_faculty","faculty_profile","course_faculty_map","general"]
    - target_entity: string (e.g., "students", "faculty", "admins", "users", "documents", "notices", "courses")
    - document_date: "YYYY-MM-DD" if asking for uploads on a date (use today/tomorrow/yesterday if referenced)
    - date_reference: one of ["today","tomorrow","yesterday"] if explicitly used
    - doc_type, role, department, course, tags (if relevant)

    Example 1: {{"conversation_mode":"task","intent_type":"count_users","target_entity":"students","is_flagged": false}}
    Example 2: {{"conversation_mode":"task","intent_type":"document_date_lookup","document_date":"2026-03-14","is_flagged": false}}
    Example 3: {{"is_flagged": true, "reason": "Severe hate speech"}}
    Example 4: {{"conversation_mode":"casual","intent_type":"general","target_entity":"general","is_flagged": false}}
    """

    local_moderation = detect_local_moderation(query)
    if local_moderation.get("is_flagged"):
        return local_moderation

    if is_fast_smalltalk_query(query):
        return {"is_flagged": False, "conversation_mode": "casual", "intent_type": "general", "target_entity": "general"}

    try:
        intent_timeout = max(4, min(12, int(settings.openrouter_timeout_seconds or 20)))
        content = await asyncio.wait_for(
            call_llm(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Query: {query}"},
                ],
                response_format="json",
                model=getattr(settings, "openrouter_intent_model", "") or settings.openrouter_model,
                max_tokens=220,
                temperature=0.0,
                allow_fallback_models=True,
                max_retries_override=1,
            ),
            timeout=float(intent_timeout),
        )

        raw = _safe_json_dict(content)
        if not isinstance(raw, dict):
            backup_flag = await run_backup_moderation_check(query, history_context=history_context)
            if backup_flag.get("is_flagged"):
                return backup_flag
            return {}
        try:
            validated = IntentPayload.model_validate(raw)
            result = validated.model_dump(exclude_none=True)
            if "is_flagged" not in result:
                backup_flag = await run_backup_moderation_check(query, history_context=history_context)
                if backup_flag.get("is_flagged"):
                    return backup_flag
            return result
        except Exception:
            backup_flag = await run_backup_moderation_check(query, history_context=history_context)
            if backup_flag.get("is_flagged"):
                return backup_flag
            return raw
    except asyncio.TimeoutError:
        logger.warning("Intent extraction timed out; falling back to deterministic routing.")
        backup_flag = await run_backup_moderation_check(query, history_context=history_context)
        if backup_flag.get("is_flagged"):
            return backup_flag
        if is_fast_smalltalk_query(query):
            return {"is_flagged": False, "conversation_mode": "casual", "intent_type": "general", "target_entity": "general"}
        return {}
    except Exception as e:
        logger.warning(f"Intent extraction/moderation failed: {e}")
        backup_flag = await run_backup_moderation_check(query, history_context=history_context)
        if backup_flag.get("is_flagged"):
            return backup_flag
        if is_fast_smalltalk_query(query):
            return {"is_flagged": False, "conversation_mode": "casual", "intent_type": "general", "target_entity": "general"}
        return {}


async def run_agent_pipeline(
    query: str,
    user_id: str,
    user_role: str,
    conversation_id: Optional[str] = None,
    context: Optional[dict] = None,
    user_profile: Optional[dict[str, Any]] = None,
) -> AgentQueryResponse:
    global _PINECONE_EMBEDDING_DISABLED

    conversation_id = conversation_id or str(uuid.uuid4())
    audit_user_id = None if str(user_id).startswith("dummy-id-") else user_id
    now_iso = utc_now_iso()

    supabase = None if settings.supabase_offline_mode else get_supabase_admin()
    moderation_state = _load_offense_state(supabase, user_id)

    if bool(moderation_state.get("blocked")):
        moderation_meta = _build_moderation_meta(moderation_state)
        appeal_status = str((moderation_state.get("appeal") or {}).get("status") or "none")
        if appeal_status == "pending":
            blocked_answer = (
                "Your chat access is currently blocked due to repeated policy violations. "
                "Your appeal is under review by the Dean section. Please wait for a decision."
            )
        elif appeal_status == "rejected":
            blocked_answer = (
                "Your chat access remains blocked after appeal review. "
                "You may submit a fresh apology appeal for reconsideration."
            )
        else:
            blocked_answer = (
                "Your chat access is blocked due to repeated abusive messages. "
                "Submit an apology appeal to request flag reset and access restoration."
            )

        await log_audit_event(
            user_id=audit_user_id,
            action="blocked_user_query_attempt",
            payload={"conv_id": conversation_id, "appeal_status": appeal_status},
        )
        return AgentQueryResponse(
            answer=blocked_answer,
            sources=[],
            conversation_id=conversation_id,
            role_badge="UnivGPT Safety",
            moderation=moderation_meta,
        )

    # Fast deterministic profanity moderation before remote intent extraction.
    early_moderation = detect_local_moderation(query)

    # Get previous messages for history window (only when not already flagged locally).
    messages = []
    if supabase and not early_moderation.get("is_flagged"):
        try:
            existing = (
                supabase.table("conversations")
                .select("messages")
                .eq("id", conversation_id)
                .execute()
            )
            messages = existing.data[0]["messages"] if existing.data else []
        except Exception as e:
            if is_network_error(e):
                logger.warning("Supabase unreachable. Skipping conversation history for this request.")
                supabase = None
            else:
                logger.error(f"Conversation fetch failed: {e}")

    # Format history for intent extractor
    history_text = "\n".join([f"{m['role']}: {m['content']}" for m in messages[-4:]])

    # 1. Intent extraction + deterministic intent hydration.
    if early_moderation.get("is_flagged"):
        raw_intent = early_moderation
    else:
        raw_intent = await extract_query_intent(query, history_context=history_text)
    effective_user_profile = user_profile or fetch_user_profile_context(supabase, user_id)
    intent = infer_intent_from_query(query, raw_intent)
    intent = enrich_intent_with_profile(intent, effective_user_profile)
    if (
        not intent.get("intent_type")
        and not intent.get("target_entity")
        and is_fast_smalltalk_query(query)
    ):
        intent["conversation_mode"] = "casual"
        intent["intent_type"] = "general"
        intent["target_entity"] = "general"
        intent["is_flagged"] = False
    logger.info(f"Extracted dynamic intent: {intent}")

    if (
        intent.get("is_flagged") is not True
        and _normalize(intent.get("conversation_mode")) == "casual"
        and _normalize(intent.get("intent_type")) in {"", "general"}
    ):
        has_recent_assistant_turn = any(
            str(m.get("role") or "").strip().lower() == "assistant"
            for m in messages[-4:]
            if isinstance(m, dict)
        )
        answer = await build_fast_smalltalk_answer(
            query=query,
            user_role=user_role,
            user_profile=effective_user_profile,
            conversation_mode="casual",
            has_recent_assistant_turn=has_recent_assistant_turn,
        )
        answer = append_intent_navigation_links(answer, user_role, intent)
        await log_audit_event(
            user_id=audit_user_id,
            action="agent_query",
            payload={"conv_id": conversation_id, "intent": {"intent_type": "general", "conversation_mode": "casual"}},
        )
        return AgentQueryResponse(
            answer=answer,
            sources=[],
            conversation_id=conversation_id,
            role_badge=role_badge_for(user_role),
        )

    # Moderation Intercept
    if intent.get("is_flagged") is True:
        logger.warning(f"Flagged query from {user_id}: {query}")

        user_email = "Unknown"
        user_name = "Unknown"
        if supabase:
            try:
                profile_res = (
                    supabase.table("profiles")
                    .select("email, full_name")
                    .eq("id", user_id)
                    .execute()
                )
                user_email = profile_res.data[0]["email"] if profile_res.data else "Unknown"
                user_name = profile_res.data[0]["full_name"] if profile_res.data else "Unknown"
            except Exception as e:
                if is_network_error(e):
                    logger.info("Supabase unreachable. Using fallback user identity for alert email.")
                    supabase = None
                else:
                    logger.warning(f"Profile lookup failed for alert email: {e}")

        moderation_state = _load_offense_state(supabase, user_id)
        prior_messages = moderation_state.get("offensive_messages") or []
        warning_count = int(moderation_state.get("warning_count", 0) or 0) + 1
        offense_total = int(moderation_state.get("offense_total", 0) or 0) + 1
        offensive_messages = [*prior_messages, query][-12:]
        next_state = {
            **moderation_state,
            "warning_count": warning_count,
            "offense_total": offense_total,
            "offensive_messages": offensive_messages,
        }

        if warning_count <= MAX_MODERATION_WARNINGS:
            answer = (
                f"Warning {warning_count}/{MAX_MODERATION_WARNINGS}: Your message was flagged for abusive or disrespectful language. "
                "Please keep the conversation professional and respectful. Further violations will be escalated."
            )
            audit_action = "flagged_query_warning"
            _persist_offense_state(supabase, user_id, next_state)
        else:
            # Hard-block user after max warnings and reset warning counter.
            next_state["blocked"] = True
            next_state["blocked_at"] = now_iso
            next_state["warning_count"] = 0
            next_state["appeal"] = {
                "status": "none",
                "message": None,
                "submitted_at": None,
                "reviewed_at": None,
                "reviewed_by": None,
                "decision_note": None,
            }
            _persist_offense_state(supabase, user_id, next_state)

            # Send escalation email with complete offensive history.
            from app.services.email_service import EmailService

            asyncio.create_task(
                asyncio.to_thread(
                    EmailService.send_flagged_alert_email,
                    user_id,
                    user_role,
                    query,
                    user_name,
                    user_email,
                    offensive_messages,
                    offense_total,
                )
            )
            answer = (
                "SAFETY ALERT: Repeated abusive messages were detected. Your chat access is now blocked. "
                "Submit an apology appeal and the Dean section can review your case."
            )
            audit_action = "flagged_query_escalated"

        # Save to history and return
        conversation_id = conversation_id or str(uuid.uuid4())
        if supabase:
            existing = (
                supabase.table("conversations")
                .select("messages")
                .eq("id", conversation_id)
                .execute()
            )
            messages = existing.data[0]["messages"] if existing.data else []
            messages.extend(
                [
                    {"role": "user", "content": query},
                    {"role": "assistant", "content": answer},
                ]
            )

            try:
                supabase.table("conversations").upsert(
                    {
                        "id": conversation_id,
                        "user_id": user_id,
                        "role": user_role,
                        "title": "Flagged Interaction",
                        "messages": messages[-20:],
                        "last_active": now_iso,
                    }
                ).execute()
            except Exception as e:
                if is_network_error(e):
                    logger.info("Supabase unreachable. Skipping flagged conversation persistence.")
                else:
                    logger.error(f"Conversation upsert failed (flagged): {e}")

        await log_audit_event(
            user_id=audit_user_id,
            action=audit_action,
            payload={
                "query": query,
                "user_email": user_email,
                "warning_count": int(next_state.get("warning_count", 0) or 0),
                "offense_total": offense_total,
                "offensive_messages": offensive_messages,
                "blocked": bool(next_state.get("blocked")),
            },
        )

        return AgentQueryResponse(
            answer=answer,
            sources=[],
            conversation_id=conversation_id,
            role_badge="UnivGPT Safety",
            moderation=_build_moderation_meta(next_state),
        )

    # 2. Search Pinecone for context
    allowed_types = get_allowed_doc_types(user_role)
    profile_ctx = effective_user_profile or {}
    user_profile_lines = [
        f"- Name: {profile_ctx.get('full_name') or 'Unknown'}",
        f"- Email: {profile_ctx.get('email') or 'Unknown'}",
        f"- Role: {profile_ctx.get('role') or user_role}",
        f"- Department: {profile_ctx.get('department') or '-'}",
        f"- Program: {profile_ctx.get('program') or '-'}",
        f"- Semester: {profile_ctx.get('semester') or '-'}",
        f"- Section: {profile_ctx.get('section') or '-'}",
    ]
    user_profile_text = "USER PROFILE CONTEXT:\n" + "\n".join(user_profile_lines)

    # Build Pinecone metadata filter dynamically while preserving RBAC.
    base_filter: dict[str, Any] = {"role": {"$in": allowed_types}}
    context = context or {}
    if context.get("dept"):
        base_filter["department"] = str(context.get("dept"))
    if context.get("course"):
        base_filter["course"] = str(context.get("course"))

    requested_type = _normalize(intent.get("doc_type") or intent.get("role"))
    if requested_type and requested_type in allowed_types:
        base_filter["role"] = {"$eq": requested_type}

    requested_department = str(intent.get("department") or "").strip()
    if requested_department:
        base_filter["department"] = requested_department

    requested_course = str(intent.get("course") or "").strip()
    if requested_course:
        base_filter["course"] = requested_course

    chunks = []
    context_text = ""
    structured_sources: list[dict[str, Any]] = []
    forced_answer: Optional[str] = None

    intent_type = _normalize(intent.get("intent_type"))
    target_entity = _normalize(intent.get("target_entity"))
    query_text = _normalize(query)
    count_request = bool(re.search(r"\b(how many|count|number of|total)\b", query_text))

    if _normalize(user_role) == "admin" and not is_admin_scope_intent(intent):
        forced_answer = (
            "I am in **Admin Assistant** mode, so I can only handle operational admin queries.\n\n"
            "I can help with:\n"
            "- user counts and role distribution\n"
            "- document and notice pipeline status\n"
            "- audit and moderation review context\n"
            "- course/faculty directory summaries for governance\n\n"
            "Try one of these:\n"
            "- \"Show today’s uploads and who uploaded them\"\n"
            "- \"How many students, faculty, and admins are active?\"\n"
            "- \"List recent audit actions for admin workflows\""
        )

    course_faculty_snapshot: dict[str, Any] = {}
    should_route_directory = should_use_course_faculty_snapshot(query, intent)
    attach_directory_context = should_route_directory or (
        intent_type in {"", "general"} and target_entity in {"", "general"}
    )

    if supabase and attach_directory_context and forced_answer is None:
        course_faculty_snapshot = fetch_course_faculty_snapshot(
            supabase=supabase,
            user_role=user_role,
            user_profile=profile_ctx,
            allowed_types=allowed_types,
            limit=140,
        )
        courses = course_faculty_snapshot.get("courses") or []
        faculty_by_id = course_faculty_snapshot.get("faculty_by_id") or {}
        visible_ids = [
            str(fid)
            for fid in (course_faculty_snapshot.get("visible_faculty_ids") or [])
            if str(fid)
        ]

        if should_route_directory:
            course_answer = build_course_faculty_answer(
                query=query,
                intent=intent,
                snapshot=course_faculty_snapshot,
            )
            if course_answer:
                forced_answer = course_answer

        if courses or faculty_by_id:
            faculty_preview_names = []
            source_ids = visible_ids if visible_ids else list(faculty_by_id.keys())
            for fid in source_ids[:8]:
                row = faculty_by_id.get(fid) or {}
                name = str(row.get("full_name") or "").strip()
                if name:
                    faculty_preview_names.append(name)

            course_preview_titles = [
                str(item.get("title") or "").strip()
                for item in courses[:6]
                if str(item.get("title") or "").strip()
            ]

            context_text += (
                "\n[Structured Directory Snapshot]\n"
                f"- Faculty total: {len(source_ids) if source_ids else len(faculty_by_id)}\n"
                f"- Course total: {len(courses)}\n"
                f"- Faculty preview: {', '.join(faculty_preview_names) if faculty_preview_names else '-'}\n"
                f"- Course preview: {', '.join(course_preview_titles) if course_preview_titles else '-'}\n"
            )

    doc_keyword_request = any(
        marker in query_text for marker in ("document", "documents", "doc", "docs", "notice", "announcement", "circular", "holiday")
    )
    notice_requested = any(marker in target_entity for marker in ("notice", "announcement", "circular")) or any(
        marker in query_text for marker in ("notice", "announcement", "circular")
    )
    doc_lookup_requested = (
        intent_type in {"count_documents", "list_documents", "document_date_lookup", "holiday_check"}
        or doc_keyword_request
        or (count_request and any(marker in target_entity for marker in ("document", "notice", "announcement", "circular", "holiday")))
    )
    non_retrieval_intent = (
        intent_type in {"", "general"}
        and target_entity in {"", "general"}
        and not doc_keyword_request
        and not should_use_course_faculty_snapshot(query, intent)
    )
    structured_directory_query = (
        should_use_course_faculty_snapshot(query, intent)
        and not doc_keyword_request
        and intent_type not in {"count_documents", "list_documents", "document_date_lookup", "holiday_check"}
    )

    if supabase and doc_lookup_requested and forced_answer is None:
        filtered_docs = fetch_filtered_documents(
            supabase=supabase,
            allowed_types=allowed_types,
            intent=intent,
            context=context,
            query=query,
        )
        doc_count = len(filtered_docs)
        scope_tokens = []
        if intent.get("department") or context.get("dept"):
            scope_tokens.append(f"department `{intent.get('department') or context.get('dept')}`")
        if intent.get("course") or context.get("course"):
            scope_tokens.append(f"course `{intent.get('course') or context.get('course')}`")
        if intent.get("doc_type") or intent.get("role"):
            scope_tokens.append(f"type `{intent.get('doc_type') or intent.get('role')}`")
        scope = ", ".join(scope_tokens) if scope_tokens else "your allowed scope"
        entity_label = "notices" if notice_requested else "documents"

        if doc_count == 0 and (intent_type in {"count_documents", "list_documents", "holiday_check"} or count_request):
            forced_answer = (
                f"I checked the database for {scope} and found **0 {entity_label}** right now."
            )
        elif doc_count > 0 and (intent_type == "count_documents" or count_request):
            preview_lines = []
            for row in filtered_docs[:5]:
                preview_lines.append(
                    f"- {_format_short_date(row.get('uploaded_at') or row.get('created_at'))} | "
                    f"{row.get('doc_type') or 'unknown'} | {row.get('filename') or 'untitled'}"
                )
            preview_block = "\n".join(preview_lines)
            forced_answer = (
                f"I found **{doc_count} {entity_label}** for {scope}.\n\n"
                f"Recent matches:\n{preview_block}"
            )
        elif intent_type == "holiday_check":
            holiday_docs = [
                row
                for row in filtered_docs
                if any(marker in _normalize(row.get("filename")) for marker in ("holiday", "closed"))
                or any(marker in [str(tag).lower() for tag in (row.get("tags") or [])] for marker in ("holiday", "closed"))
            ]
            if holiday_docs:
                top = holiday_docs[0]
                forced_answer = (
                    "I found holiday-related documents in scope.\n\n"
                    f"- Latest: {_format_short_date(top.get('uploaded_at') or top.get('created_at'))} | "
                    f"{top.get('filename') or 'untitled'}"
                )
            else:
                forced_answer = (
                    "I checked the available documents and found **0 holiday notices** for the requested scope."
                )

        if doc_count == 0:
            context_text += "\n[Structured Lookup: 0 documents matched current filters.]\n"
        else:
            context_lines = [f"[Structured Lookup: {doc_count} documents matched current filters.]"]
            for row in filtered_docs[:10]:
                row_date = _format_short_date(row.get("uploaded_at") or row.get("created_at"))
                row_tags = ", ".join(row.get("tags") or []) if isinstance(row.get("tags"), list) else ""
                context_lines.append(
                    f"- {row_date} | {row.get('doc_type') or 'unknown'} | {row.get('filename') or 'untitled'}"
                    f" | dept: {row.get('department') or '-'} | course: {row.get('course') or '-'}"
                    f"{f' | tags: {row_tags}' if row_tags else ''}"
                )
            context_text += "\n" + "\n".join(context_lines) + "\n"

            for row in filtered_docs[:5]:
                structured_sources.append(
                    {
                        "content": (
                            f"{row.get('filename') or 'untitled'} | "
                            f"doc_type: {row.get('doc_type') or 'unknown'}, "
                            f"department: {row.get('department') or '-'}, "
                            f"course: {row.get('course') or '-'}, "
                            f"tags: {', '.join(row.get('tags') or []) if isinstance(row.get('tags'), list) else ''}"
                        ),
                        "filename": row.get("filename") or "Unknown",
                        "document_id": row.get("id"),
                        "metadata": {
                            "doc_type": row.get("doc_type"),
                            "department": row.get("department"),
                            "course": row.get("course"),
                            "tags": row.get("tags") or [],
                            "uploaded_at": row.get("uploaded_at") or row.get("created_at"),
                        },
                    }
                )

    should_run_vector_search = (
        pinecone_client.index is not None
        and forced_answer is None
        and not _PINECONE_EMBEDDING_DISABLED
        and not structured_directory_query
        and not non_retrieval_intent
    )

    if should_run_vector_search:
        try:
            query_vector = get_single_embedding(query)
            pinecone_timeout = max(2.0, float(getattr(settings, "pinecone_query_timeout_seconds", 6) or 6))
            search_res = await asyncio.wait_for(
                asyncio.to_thread(
                    pinecone_client.index.query,
                    vector=query_vector,
                    filter=base_filter,
                    top_k=5,
                    include_metadata=True,
                ),
                timeout=pinecone_timeout,
            )

            for m in search_res.get("matches", []):
                meta = m.get("metadata", {})
                chunk_content = meta.get("content", "")
                # Extract general metadata explicitly
                extra_meta = {
                    k: v
                    for k, v in meta.items()
                    if k
                    not in ["content", "filename", "document_id", "role", "chunk_index"]
                }

                chunks.append(
                    {
                        "content": chunk_content,
                        "filename": meta.get("filename", "Unknown"),
                        "document_id": meta.get("document_id"),
                        "metadata": extra_meta,
                    }
                )

                meta_str = ", ".join(f"{k}: {v}" for k, v in extra_meta.items())
                if meta_str:
                    meta_str = f" [{meta_str}]"

                context_text += f"\n---\nSource: {meta.get('filename')}{meta_str}\n{chunk_content}\n"
        except asyncio.TimeoutError:
            _PINECONE_EMBEDDING_DISABLED = True
            logger.warning(
                "Disabling Pinecone vector search for this runtime due to query timeout > %ss.",
                pinecone_timeout,
            )
            context_text += (
                "\n[System Note: Vector database query timed out and was skipped]\n"
            )
        except Exception as e:
            if _is_embedding_runtime_error(e):
                _PINECONE_EMBEDDING_DISABLED = True
                logger.warning(
                    "Disabling Pinecone embedding search for this runtime due to local embedding dependency error: %s",
                    e,
                )
            elif _is_pinecone_timeout_error(e):
                _PINECONE_EMBEDDING_DISABLED = True
                logger.warning(
                    "Disabling Pinecone vector search for this runtime due to timeout/connectivity error: %s",
                    e,
                )
            else:
                logger.error(f"Pinecone query failed: {e}")
            context_text += (
                "\n[System Note: Vector database unavailable pending configuration]\n"
            )
    else:
        if forced_answer is not None:
            logger.info("Skipping vector search because structured response is already resolved.")
        else:
            logger.warning("Pinecone index not initialized. Skipping vector search.")

    if not chunks and not structured_sources:
        context_text += "\n[System Note: No documents matched the query in the current database (0 documents for current filters).]\n"

    # 3. Generate Answer (using OpenRouter)
    current_time_str = f"Current Date: {datetime.datetime.now().strftime('%A, %B %d, %Y')}. Current Time: {datetime.datetime.now().strftime('%I:%M %p')}"

    admin_snapshot_text = ""
    admin_snapshot: dict[str, Any] = {}
    if user_role == "admin":
        date_hint = parse_date_string(
            intent.get("document_date") if isinstance(intent, dict) else None
        ) or parse_date_string(
            intent.get("date_reference") if isinstance(intent, dict) else None
        )
        date_docs_text = ""
        if supabase and date_hint:
            docs_on_date = fetch_documents_for_date(supabase, date_hint)
            if docs_on_date:
                lines = [f"Documents uploaded on {date_hint.isoformat()} ({len(docs_on_date)}):"]
                for row in docs_on_date:
                    lines.append(
                        f"- {_format_short_date(row.get('uploaded_at') or row.get('created_at'))} | {row.get('doc_type') or 'unknown'} | {row.get('filename') or 'untitled'}"
                    )
                date_docs_text = "\n".join(lines)
            else:
                date_docs_text = f"Documents uploaded on {date_hint.isoformat()}: 0."

        if supabase:
            try:
                admin_snapshot = fetch_admin_snapshot(supabase)
                admin_snapshot_text = render_admin_snapshot(admin_snapshot)
            except Exception:
                admin_snapshot_text = "ADMIN LIVE DATA SNAPSHOT: unavailable."
        else:
            admin_snapshot_text = "ADMIN LIVE DATA SNAPSHOT: unavailable (Supabase offline)."
        if date_docs_text:
            admin_snapshot_text = f"{admin_snapshot_text}\n{date_docs_text}"

        if intent_type == "count_users" and not forced_answer:
            users_by_role = admin_snapshot.get("users_by_role", {}) if isinstance(admin_snapshot, dict) else {}
            total_users = (admin_snapshot.get("counts", {}) or {}).get("total_users", 0)
            if any(marker in target_entity for marker in ("student", "students")):
                forced_answer = f"There are **{int(users_by_role.get('student', 0))} students** in the current database snapshot."
            elif any(marker in target_entity for marker in ("faculty", "teacher", "teachers")):
                forced_answer = f"There are **{int(users_by_role.get('faculty', 0))} faculty users** in the current database snapshot."
            elif any(marker in target_entity for marker in ("admin", "admins", "administrator")):
                forced_answer = f"There are **{int(users_by_role.get('admin', 0))} admin users** in the current database snapshot."
            else:
                forced_answer = f"There are **{int(total_users or 0)} total users** in the current database snapshot."

        system_message = f"""
        You are UnivGPT Admin Assistant, a professional operations copilot for university administrators.
        You are interacting with a user whose role is: {user_role}. Focus on operational clarity, policy accuracy, and concise answers.

        SYSTEM CONTEXT:
        - {current_time_str}
        
        {user_profile_text}

        ADMIN GUARDRAILS:
        1. Professionalism: NEVER speak negatively or disrespectfully about any faculty, staff, student, or the university.
        2. Admin Scope: You may help with operational topics such as system health, audit logs, document ingestion, routing, and user management. If the query is not admin-operational, decline and redirect to admin workflows.
        3. Accuracy (No Hallucinations): If asked about internal policies or data not in context, explicitly say you do not have access to that information.
        4. Privacy: Do not expose credentials, secrets, or sensitive personal data. Summarize or aggregate when possible.

        Extracted Intent Filters: {json.dumps(intent)}

        CONTEXT FROM DATABASE:
        {context_text}

        {admin_snapshot_text}

        RESPONSE FORMAT:
        - Be concise and structured.
        - Use Markdown for clarity when helpful.
        - Avoid emojis.
        - Do not greet repeatedly on every turn.
        - Avoid vague filler like "I can help with anything"; answer the exact ask.
        - If you cite data from context, name the Source document.
        - If total_documents is 0, explicitly say "0 documents" instead of "no access."
        - If asked about dates, use the provided Today/Tomorrow fields.
        - If asked "how many students/faculty/admins/users", use Users by role / Total users from the snapshot.
        """
    else:
        if intent_type == "count_users" and not forced_answer:
            forced_answer = "I can provide user counts only to admin accounts. For your role, I can still help with documents, courses, and notices in your allowed scope."

        common_guardrails = """
        1. Never invent internal data. Use only provided context and structured lookup results.
        2. If no matching records exist, clearly state the count as 0 for the requested scope.
        3. Keep responses focused on university and campus topics.
        4. Stay professional and polite.
        """

        if user_role == "faculty":
            role_directive = """
            ROLE MODE: FACULTY
            - Prioritize faculty workflows: course updates, notices, department circulars, and student-facing policy clarifications.
            - When asked about courses/faculty mappings, use structured directory data first.
            - If a query is outside faculty-visible scope, state the limitation briefly and offer the closest available data.
            - Do not answer admin-only operations (global user counts, privileged audit governance, dean moderation decisions).
            """
        else:
            role_directive = """
            ROLE MODE: STUDENT
            - Prioritize student workflows: course notices, deadlines, policy guidance, and faculty/course mapping in student scope.
            - When asked about courses/faculty mappings, use structured directory data first.
            - Keep responses practical and concise for student actionability.
            """

        system_message = f"""
        You are UnivGPT, the official professional AI assistant for the University.
        You are interacting with a user whose role is: {user_role}. Provide concise, accurate, and helpful answers.

        SYSTEM CONTEXT:
        - {current_time_str}
        
        {user_profile_text}

        {role_directive}

        GUARDRAILS:
        {common_guardrails}

        Extracted Intent Filters: {json.dumps(intent)}

        CONTEXT FROM DATABASE:
        {context_text}

        FORMATTING:
        - Use simple Markdown bullets or tables when useful.
        - Mention source filenames when citing specific document facts.
        - Do not start every turn with greetings; use direct, context-aware answers.
        - Avoid vague filler like "I can help with anything."
        """

    llm_messages = [{"role": "system", "content": system_message}]
    for m in messages[-8:]:
        llm_messages.append({"role": m["role"], "content": m["content"]})

    llm_messages.append({"role": "user", "content": query})

    if forced_answer:
        answer = forced_answer
    else:
        answer = await call_llm(llm_messages)

        # Keep provider/debug details in server logs, not user-facing chat.
        if answer == "I'm sorry, I'm having trouble connecting to my brain right now.":
            logger.error(
                "LLM provider unavailable for user query. Check OPENROUTER_API_KEY, credits, or provider/network health."
            )
            answer = "I'm unable to answer right now due to a temporary service issue. Please try again in a moment."

    answer = append_intent_navigation_links(answer, user_role, intent)

    # 4. Persistence in Supabase (Store Conversations)
    messages.append({"role": "user", "content": query})
    messages.append({"role": "assistant", "content": answer})

    # Limit message history to prevent huge rows
    if len(messages) > 20:
        messages = messages[-20:]

    if supabase:
        try:
            supabase.table("conversations").upsert(
                {
                    "id": conversation_id,
                    "user_id": user_id,
                    "role": user_role,
                    "title": query[:50],
                    "messages": messages,
                    "last_active": now_iso,
                    "updated_at": now_iso,
                }
            ).execute()
        except Exception as e:
            # Do not fail the entire user query if history persistence has issues.
            if is_network_error(e):
                logger.info("Supabase unreachable. Skipping conversation persistence.")
            else:
                logger.error(f"Conversation upsert failed: {e}")

    await log_audit_event(
        user_id=audit_user_id,
        action="agent_query",
        payload={"conv_id": conversation_id, "intent": intent},
    )

    merged_sources: list[dict[str, Any]] = []
    seen_source_keys: set[str] = set()
    for source in chunks + structured_sources:
        source_key = f"{source.get('document_id')}-{source.get('filename')}"
        if source_key in seen_source_keys:
            continue
        seen_source_keys.add(source_key)
        merged_sources.append(source)

    return AgentQueryResponse(
        answer=answer,
        sources=[
            SourceCitation(
                document_id=str(c.get("document_id", "")),
                title=c["filename"],
                snippet=c["content"][:150],
                metadata=c.get("metadata", {}),
            )
            for c in merged_sources
        ],
        conversation_id=conversation_id,
        role_badge=role_badge_for(user_role),
    )

