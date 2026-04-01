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
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any

from app.config import settings
from app.models.schemas import SourceCitation, AgentQueryResponse
from app.middleware.rbac import get_allowed_doc_types
from app.services.pinecone_client import pinecone_client
from app.services.document_processor import get_single_embedding
from app.services.supabase_client import get_supabase_admin
from app.services.audit import log_audit_event

logger = logging.getLogger(__name__)

# Capability flags to avoid repeated failing schema probes on every request.
_DOCUMENTS_HAS_UPLOADED_AT: Optional[bool] = None

def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    if isinstance(exc, httpx.RequestError):
        return True
    return "getaddrinfo failed" in message or "name or service not known" in message or "nodename nor servname provided" in message

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


def _matches_filter(value: Any, expected: str) -> bool:
    return expected in _normalize(value)


def should_filter_recent_documents(query: str, intent: dict[str, Any]) -> bool:
    if intent.get("date_reference") in {"today", "tomorrow", "yesterday"}:
        return True
    if intent.get("document_date"):
        return True
    text = _normalize(query)
    markers = ("recent", "latest", "new", "present", "today", "this week", "this month")
    return any(marker in text for marker in markers)


def infer_intent_from_query(query: str, intent: dict[str, Any]) -> dict[str, Any]:
    text = _normalize(query)
    hydrated = dict(intent or {})

    count_requested = bool(
        re.search(r"\b(how many|count|number of|total)\b", text)
    )
    notices_requested = any(
        marker in text for marker in ("notice", "notices", "announcement", "announcements", "circular", "circulars")
    )
    documents_requested = notices_requested or any(
        marker in text for marker in ("document", "documents", "doc", "docs", "uploaded", "uploads")
    )

    if not hydrated.get("date_reference"):
        for marker in ("today", "tomorrow", "yesterday"):
            if marker in text:
                hydrated["date_reference"] = marker
                break

    if not hydrated.get("intent_type"):
        if count_requested and any(marker in text for marker in ("student", "students")):
            hydrated["intent_type"] = "count_users"
            hydrated["target_entity"] = "students"
        elif count_requested and any(marker in text for marker in ("faculty", "professor", "teachers")):
            hydrated["intent_type"] = "count_users"
            hydrated["target_entity"] = "faculty"
        elif count_requested and any(marker in text for marker in ("admin", "admins", "administrator")):
            hydrated["intent_type"] = "count_users"
            hydrated["target_entity"] = "admins"
        elif count_requested and any(marker in text for marker in ("user", "users")):
            hydrated["intent_type"] = "count_users"
            hydrated["target_entity"] = "users"
        elif count_requested and documents_requested:
            hydrated["intent_type"] = "count_documents"
            hydrated["target_entity"] = "notices" if notices_requested else "documents"
        elif notices_requested:
            hydrated["intent_type"] = "list_documents"
            hydrated["target_entity"] = "notices"

    if not hydrated.get("target_entity"):
        if notices_requested:
            hydrated["target_entity"] = "notices"
        elif documents_requested:
            hydrated["target_entity"] = "documents"

    if not hydrated.get("course"):
        course_patterns = [
            r"\b(btech(?:\s+[a-z]{2,10}){1,3})\b",
            r"\b([a-z]{2,6}\s?\d{2,4})\b",
        ]
        for pattern in course_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                candidate = re.sub(r"\bcourse\b", "", match.group(1), flags=re.IGNORECASE).strip()
                if len(candidate) >= 4:
                    hydrated["course"] = candidate
                    break

    return hydrated


def enrich_intent_with_profile(intent: dict[str, Any], user_profile: dict[str, Any]) -> dict[str, Any]:
    hydrated = dict(intent or {})
    if not hydrated.get("department") and user_profile.get("department"):
        hydrated["department"] = str(user_profile.get("department"))
    if not hydrated.get("course"):
        # Fall back to program so student/faculty questions can still use scoped retrieval.
        profile_program = user_profile.get("program")
        if profile_program:
            hydrated["course"] = str(profile_program)
    return hydrated


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
) -> str:
    """Helper to call OpenRouter LLM."""
    if settings.mock_llm:
        return "This is a mock response from the agent."

    payload = {
        "model": model or settings.openrouter_model,
        "messages": messages,
    }
    if response_format == "json":
        payload["response_format"] = {"type": "json_object"}
    if max_tokens is not None:
        payload["max_tokens"] = int(max_tokens)
    if temperature is not None:
        payload["temperature"] = float(temperature)

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=8.0,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"LLM Call failed: {e}")
            return "I'm sorry, I'm having trouble connecting to my brain right now."


async def extract_query_intent(query: str, history_context: str = "") -> Dict[str, Any]:
    """
    Extract dynamic filtering metadata from the user's query.
    Returns any potential metadata filters as a JSON object.
    """
    system_prompt = f"""
    You are an intent extraction and safety moderation assistant for a University GPT system.
    Recent conversation history for context:
    {history_context}

    Task 1 (Moderation): Analyze the user's latest query for explicit hate speech, severe harassment, direct threats, or extreme toxicity directed at the university or its staff. Do NOT flag questions, apologies, mild frustration, general complaints, or references to the moderation/flagging system itself. If an explicit and severe violation is detected, set `"is_flagged": true`. Otherwise, set it to `false`.
    Task 2 (Intent Routing): Extract structured intent metadata so downstream tools can filter data before the main LLM response.

    Return ONLY a valid JSON object with these fields when applicable:
    - is_flagged: boolean
    - reason: string (if flagged)
    - intent_type: one of ["count_users","count_documents","list_documents","document_date_lookup","holiday_check","general"]
    - target_entity: string (e.g., "students", "faculty", "admins", "users", "documents", "notices")
    - document_date: "YYYY-MM-DD" if asking for uploads on a date (use today/tomorrow/yesterday if referenced)
    - date_reference: one of ["today","tomorrow","yesterday"] if explicitly used
    - doc_type, role, department, course, tags (if relevant)

    Example 1: {{"intent_type":"count_users","target_entity":"students","is_flagged": false}}
    Example 2: {{"intent_type":"document_date_lookup","document_date":"2026-03-14","is_flagged": false}}
    Example 3: {{"is_flagged": true, "reason": "Severe hate speech"}}
    """

    try:
        content = await call_llm(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Query: {query}"},
            ],
            response_format="json",
            model=getattr(settings, "openrouter_intent_model", "") or settings.openrouter_model,
            max_tokens=220,
            temperature=0.0,
        )

        raw = json.loads(content)
        if not isinstance(raw, dict):
            return {}
        try:
            validated = IntentPayload.model_validate(raw)
            return validated.model_dump(exclude_none=True)
        except Exception:
            return raw
    except Exception as e:
        logger.warning(f"Intent extraction/moderation failed: {e}")
        return {}


async def run_agent_pipeline(
    query: str,
    user_id: str,
    user_role: str,
    conversation_id: Optional[str] = None,
    context: Optional[dict] = None,
) -> AgentQueryResponse:

    conversation_id = conversation_id or str(uuid.uuid4())
    supabase = None if settings.supabase_offline_mode else get_supabase_admin()
    now_iso = utc_now_iso()
    audit_user_id = None if str(user_id).startswith("dummy-id-") else user_id

    # Get previous messages for history window early for moderation
    messages = []
    if supabase:
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
    raw_intent = await extract_query_intent(query, history_context=history_text)
    user_profile = fetch_user_profile_context(supabase, user_id)
    intent = infer_intent_from_query(query, raw_intent)
    intent = enrich_intent_with_profile(intent, user_profile)
    logger.info(f"Extracted dynamic intent: {intent}")

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

        # Send Email Alert to Admin asynchronously
        from app.services.email_service import EmailService
        import asyncio

        asyncio.create_task(
            asyncio.to_thread(
                EmailService.send_flagged_alert_email,
                user_id,
                user_role,
                query,
                user_name,
                user_email,
            )
        )

        answer = "SAFETY ALERT: Your message has been flagged by our automated moderation system for violating the UnivGPT professional conduct policies. Any further attempts to use inappropriate language, harass, or disrespect faculty/staff will result in account suspension. A detailed report of this incident has been forwarded to the University Administration."

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
            action="flagged_query",
            payload={"query": query, "user_email": user_email},
        )

        return AgentQueryResponse(
            answer=answer,
            sources=[],
            conversation_id=conversation_id,
            role_badge="🛡️ UniGPT Safety",
        )

    # 2. Search Pinecone for context
    allowed_types = get_allowed_doc_types(user_role)
    user_profile_lines = [
        f"- Name: {user_profile.get('full_name') or 'Unknown'}",
        f"- Email: {user_profile.get('email') or 'Unknown'}",
        f"- Role: {user_profile.get('role') or user_role}",
        f"- Department: {user_profile.get('department') or '-'}",
        f"- Program: {user_profile.get('program') or '-'}",
        f"- Semester: {user_profile.get('semester') or '-'}",
        f"- Section: {user_profile.get('section') or '-'}",
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

    if supabase and doc_lookup_requested:
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

    should_run_vector_search = pinecone_client.index is not None and forced_answer is None

    if should_run_vector_search:
        try:
            query_vector = get_single_embedding(query)
            search_res = pinecone_client.index.query(
                vector=query_vector, filter=base_filter, top_k=5, include_metadata=True
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
        except Exception as e:
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
        You are UniGPT Admin Assistant, a professional operations copilot for university administrators.
        You are interacting with a user whose role is: {user_role}. Focus on operational clarity, policy accuracy, and concise answers.

        SYSTEM CONTEXT:
        - {current_time_str}
        
        {user_profile_text}

        ADMIN GUARDRAILS:
        1. Professionalism: NEVER speak negatively or disrespectfully about any faculty, staff, student, or the university.
        2. Admin Scope: You may help with operational topics such as system health, audit logs, document ingestion, routing, and user management. Do not provide instructions outside university context.
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
        - If you cite data from context, name the Source document.
        - If total_documents is 0, explicitly say "0 documents" instead of "no access."
        - If asked about dates, use the provided Today/Tomorrow fields.
        - If asked "how many students/faculty/admins/users", use Users by role / Total users from the snapshot.
        """
    else:
        if intent_type == "count_users" and not forced_answer:
            forced_answer = "I can provide user counts only to admin accounts. For your role, I can still help with documents and course notices in your allowed scope."

        system_message = f"""
        You are UniGPT, the official professional AI assistant for the University.
        You are interacting with a user whose role is: {user_role}. Provide concise, accurate, and helpful answers.

        SYSTEM CONTEXT:
        - {current_time_str}
        
        {user_profile_text}

        GUARDRAILS:
        1. Never invent internal data. Use only provided context and structured lookup results.
        2. If no matching documents exist, clearly state "0 documents found" for the requested scope.
        3. Keep responses focused on university and campus topics.
        4. Stay professional and polite.

        Extracted Intent Filters: {json.dumps(intent)}

        CONTEXT FROM DATABASE:
        {context_text}

        FORMATTING:
        - Use simple Markdown bullets or tables when useful.
        - Mention source filenames when citing specific document facts.
        """

    llm_messages = [{"role": "system", "content": system_message}]
    for m in messages[-8:]:
        llm_messages.append({"role": m["role"], "content": m["content"]})

    llm_messages.append({"role": "user", "content": query})

    if forced_answer:
        answer = forced_answer
    else:
        answer = await call_llm(llm_messages)

        # If the LLM failed (e.g. 401 Unauthorized because of bad API keys)
        if answer == "I'm sorry, I'm having trouble connecting to my brain right now.":
            answer = "I'm currently unable to connect to my AI provider (Invalid API Key or out of credits). Please update the `OPENROUTER_API_KEY` in the `.env` file to restore my functionality."

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
        role_badge="Admin Assistant" if user_role == "admin" else f"{user_role.title()} Agent",
    )
