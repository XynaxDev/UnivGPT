# Copyright (c) 2026 XynaxDev
# Contact: akashkumar.cs27@gmail.com

import re
from typing import Any


def _normalize(value: Any) -> str:
    return str(value or "").strip().lower()

def _contains_any(text: str, markers: tuple[str, ...]) -> bool:
    return any(marker in text for marker in markers)


def is_fast_smalltalk_query(query: str) -> bool:
    text = _normalize(re.sub(r"[^a-z0-9\s?]", " ", query))
    text = re.sub(r"\s+", " ", text).strip()
    if not text or len(text) > 120:
        return False

    domain_markers = (
        "document",
        "documents",
        "notice",
        "announcement",
        "circular",
        "course",
        "semester",
        "department",
        "holiday",
        "policy",
        "deadline",
        "student",
        "faculty",
        "admin",
    )
    if any(marker in text for marker in domain_markers):
        return False

    greeting_markers = ("hi", "hii", "hello", "hey", "good morning", "good afternoon", "good evening")

    starts_with_greeting = any(text.startswith(marker) for marker in greeting_markers)
    return starts_with_greeting


def should_filter_recent_documents(query: str, intent: dict[str, Any]) -> bool:
    if intent.get("date_reference") in {"today", "tomorrow", "yesterday"}:
        return True
    if intent.get("document_date"):
        return True
    text = _normalize(query)
    markers = ("recent", "latest", "new", "present", "today", "this week", "this month")
    return any(marker in text for marker in markers)


def infer_intent_from_query(
    query: str,
    intent: dict[str, Any],
    allow_deterministic_fallback: bool = False,
) -> dict[str, Any]:
    text = _normalize(query)
    hydrated = dict(intent or {})
    count_request = bool(re.search(r"\b(how many|count|number of|total)\b", text))
    list_request = bool(re.search(r"\b(list|show|display|summarize|latest|recent)\b", text))

    if not hydrated.get("intent_type"):
        hydrated["intent_type"] = "general"

    if not hydrated.get("target_entity"):
        hydrated["target_entity"] = "general"

    # Deterministic keyword routing is strictly fallback-only.
    if not allow_deterministic_fallback:
        return hydrated

    if not hydrated.get("date_reference"):
        for marker in ("today", "tomorrow", "yesterday"):
            if marker in text:
                hydrated["date_reference"] = marker
                break

    # Deterministic fallback routing when LLM intent extraction is unavailable/partial.
    appeal_request = _contains_any(
        text,
        (
            "appeal",
            "appeals",
            "dean",
            "violation",
            "violations",
            "flag reset",
            "apology",
        ),
    )
    audit_request = _contains_any(
        text,
        (
            "audit",
            "audit log",
            "audit logs",
            "activity log",
            "event log",
            "logs",
        ),
    ) and not appeal_request
    moderation_request = _contains_any(
        text,
        (
            "moderation",
            "flagged",
            "blocked",
            "warnings",
            "warning",
        ),
    ) or appeal_request

    if appeal_request:
        if count_request and hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "count_appeals"
        elif hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "list_appeals"
        hydrated["target_entity"] = "appeals"
    elif audit_request:
        if hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "audit_summary"
        hydrated["target_entity"] = "audit"
    elif moderation_request and hydrated.get("target_entity") in {"", "general"}:
        hydrated["target_entity"] = "moderation"

    if _contains_any(text, ("user", "users", "student", "students", "faculty", "admin", "admins")):
        if count_request and hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "count_users"
        if hydrated.get("target_entity") in {"", "general"}:
            if "students" in text or "student" in text:
                hydrated["target_entity"] = "students"
            elif "faculty" in text:
                hydrated["target_entity"] = "faculty"
            elif "admins" in text or "admin" in text:
                hydrated["target_entity"] = "admins"
            else:
                hydrated["target_entity"] = "users"

    if _contains_any(text, ("document", "documents", "notice", "notices", "upload", "uploads")):
        if count_request and hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "count_documents"
        elif list_request and hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "list_documents"
        if hydrated.get("target_entity") in {"", "general"}:
            hydrated["target_entity"] = "documents"

    if _contains_any(text, ("course", "courses", "curriculum", "syllabus")):
        if count_request and hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "count_courses"
        elif list_request and hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "list_courses"
        if hydrated.get("target_entity") in {"", "general"}:
            hydrated["target_entity"] = "courses"

    if _contains_any(text, ("teacher", "teachers", "professor", "professors", "faculty", "mentor", "mentors")):
        if count_request and hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "count_faculty"
        elif list_request and hydrated.get("intent_type") in {"", "general"}:
            hydrated["intent_type"] = "list_faculty"
        if hydrated.get("target_entity") in {"", "general"}:
            hydrated["target_entity"] = "faculty"

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


