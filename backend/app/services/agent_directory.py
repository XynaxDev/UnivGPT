# Copyright (c) 2026 XynaxDev
# Contact: akashkumar.cs27@gmail.com

import datetime
import re
from typing import Any, Optional

from app.services.demo_directory_seed import DEMO_COURSES, DEMO_FACULTY


def _normalize(value: Any) -> str:
    return str(value or "").strip().lower()


def _safe_iso(raw: Optional[str]) -> str:
    if not raw:
        return ""
    try:
        parsed = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return parsed.isoformat()
    except Exception:
        return str(raw)


def _format_short_date(raw: Optional[str]) -> str:
    if not raw:
        return "-"
    try:
        parsed = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d")
    except Exception:
        return str(raw)


def parse_date_string(raw: Optional[str]) -> Optional[datetime.date]:
    if not raw:
        return None
    raw = str(raw).strip()
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


def _slugify_course(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return text.strip("-") or "general"


def _fetch_documents_for_directory(
    supabase,
    allowed_types: list[str],
    limit: int = 320,
) -> list[dict[str, Any]]:
    if not supabase or not allowed_types:
        return []

    query_attempts = [
        ("id,filename,doc_type,department,course,tags,uploader_id,uploaded_at,created_at", "created_at"),
        ("id,filename,doc_type,department,course,tags,uploader_id,uploaded_at", "uploaded_at"),
        ("id,filename,doc_type,department,course,tags,uploader_id,created_at", "created_at"),
        ("id,filename,doc_type,department,course,tags,uploaded_at,created_at", "created_at"),
    ]

    for select_columns, order_column in query_attempts:
        try:
            res = (
                supabase.table("documents")
                .select(select_columns)
                .in_("doc_type", allowed_types)
                .order(order_column, desc=True)
                .limit(limit)
                .execute()
            )
            return res.data or []
        except Exception:
            continue
    return []


def _is_directory_doc_relevant(doc: dict[str, Any], user_role: str, user_profile: dict[str, Any]) -> bool:
    role = _normalize(user_role)
    if role == "admin":
        return True

    user_dept = _normalize(user_profile.get("department"))
    user_program = _normalize(user_profile.get("program"))
    doc_dept = _normalize(doc.get("department"))
    doc_course = _normalize(doc.get("course"))

    if not doc_dept and not doc_course:
        return True
    if user_dept and doc_dept and user_dept == doc_dept:
        return True
    if user_program and doc_course and (user_program in doc_course or doc_course in user_program):
        return True
    return False


def _normalize_email(value: Any) -> str:
    return str(value or "").strip().lower()


def _append_demo_faculty_if_missing(faculty_by_id: dict[str, dict[str, Any]]) -> None:
    existing_emails = {_normalize_email(row.get("email")) for row in faculty_by_id.values() if _normalize_email(row.get("email"))}
    for row in DEMO_FACULTY:
        email = _normalize_email(row.get("email"))
        if email and email in existing_emails:
            continue
        demo_id = str(row.get("id") or "")
        if not demo_id:
            continue
        if demo_id in faculty_by_id:
            continue
        faculty_by_id[demo_id] = {
            "id": demo_id,
            "full_name": str(row.get("full_name") or "Faculty"),
            "email": str(row.get("email") or ""),
            "department": row.get("department"),
            "program": row.get("program"),
        }


def _inject_demo_courses_if_empty(
    courses_map: dict[str, dict[str, Any]],
    faculty_by_id: dict[str, dict[str, Any]],
    limit: int,
) -> None:
    if courses_map:
        return

    _append_demo_faculty_if_missing(faculty_by_id)
    email_to_faculty_id: dict[str, str] = {
        _normalize_email(row.get("email")): fid
        for fid, row in faculty_by_id.items()
        if _normalize_email(row.get("email"))
    }

    for row in DEMO_COURSES[: max(3, limit)]:
        title = str(row.get("title") or "").strip()
        if not title:
            continue
        key = _slugify_course(title)
        uploader_email = _normalize_email(row.get("uploader"))
        mapped_faculty_ids: list[str] = []
        mapped_id = email_to_faculty_id.get(uploader_email)
        if mapped_id:
            mapped_faculty_ids.append(mapped_id)
        else:
            for fid in row.get("faculty_ids", []) or []:
                fid_str = str(fid)
                if fid_str in faculty_by_id and fid_str not in mapped_faculty_ids:
                    mapped_faculty_ids.append(fid_str)

        courses_map[key] = {
            "id": key,
            "code": str(row.get("code") or title.upper().replace(" ", "-")),
            "title": title,
            "department": str(row.get("department") or "").strip() or None,
            "next_update_at": None,
            "notice_count": int(row.get("notice_count", 0) or 0),
            "faculty_ids": mapped_faculty_ids[:5],
        }


def fetch_course_faculty_snapshot(
    supabase,
    user_role: str,
    user_profile: dict[str, Any],
    allowed_types: list[str],
    limit: int = 120,
) -> dict[str, Any]:
    snapshot: dict[str, Any] = {"courses": [], "faculty_by_id": {}, "visible_faculty_ids": []}
    if not supabase:
        return snapshot

    docs = _fetch_documents_for_directory(supabase, allowed_types, limit=max(180, limit * 3))
    relevant_docs = [doc for doc in docs if _is_directory_doc_relevant(doc, user_role, user_profile)]

    faculty_rows: list[dict[str, Any]] = []
    try:
        faculty_res = (
            supabase.table("profiles")
            .select("id,full_name,email,department,program,role")
            .eq("role", "faculty")
            .limit(350)
            .execute()
        )
        faculty_rows = faculty_res.data or []
    except Exception:
        try:
            faculty_res = (
                supabase.table("profiles")
                .select("id,full_name,email,department,role")
                .eq("role", "faculty")
                .limit(350)
                .execute()
            )
            faculty_rows = faculty_res.data or []
        except Exception:
            faculty_rows = []

    faculty_by_id: dict[str, dict[str, Any]] = {
        str(row.get("id")): {
            "id": str(row.get("id")),
            "full_name": str(row.get("full_name") or "Faculty"),
            "email": str(row.get("email") or ""),
            "department": row.get("department"),
            "program": row.get("program"),
        }
        for row in faculty_rows
        if row.get("id")
    }
    faculty_by_department: dict[str, list[str]] = {}
    faculty_program_map: dict[str, str] = {}
    for row in faculty_rows:
        fid = str(row.get("id") or "").strip()
        if not fid:
            continue
        dept = _normalize(row.get("department"))
        if dept:
            faculty_by_department.setdefault(dept, []).append(fid)
        faculty_program_map[fid] = _normalize(row.get("program"))

    courses_map: dict[str, dict[str, Any]] = {}
    for doc in relevant_docs:
        course_name = str(doc.get("course") or "").strip()
        if not course_name:
            continue
        key = _slugify_course(course_name)
        uploader_id = str(doc.get("uploader_id") or "").strip()
        uploaded_at = _safe_iso(doc.get("uploaded_at") or doc.get("created_at"))
        existing = courses_map.get(key)
        if not existing:
            faculty_ids: list[str] = []
            if uploader_id and uploader_id in faculty_by_id:
                faculty_ids.append(uploader_id)
            courses_map[key] = {
                "id": key,
                "code": course_name.upper().replace(" ", "-"),
                "title": course_name,
                "department": str(doc.get("department") or "").strip() or None,
                "next_update_at": uploaded_at or None,
                "notice_count": 1,
                "faculty_ids": faculty_ids[:5],
            }
            continue

        existing["notice_count"] = int(existing.get("notice_count", 0)) + 1
        if uploader_id and uploader_id in faculty_by_id:
            current_ids = list(existing.get("faculty_ids", []))
            if uploader_id not in current_ids:
                current_ids.append(uploader_id)
                existing["faculty_ids"] = current_ids[:5]
        current_dt = parse_date_string(str(existing.get("next_update_at") or ""))
        incoming_dt = parse_date_string(str(uploaded_at or ""))
        if incoming_dt and (not current_dt or incoming_dt > current_dt):
            existing["next_update_at"] = uploaded_at

    for course_item in courses_map.values():
        if course_item.get("faculty_ids"):
            continue
        course_title = _normalize(course_item.get("title"))
        program_matches = [
            faculty_id
            for faculty_id, program in faculty_program_map.items()
            if program and (program in course_title or course_title in program)
        ]
        if program_matches:
            course_item["faculty_ids"] = program_matches[:5]
            continue
        dept = _normalize(course_item.get("department"))
        if dept and dept in faculty_by_department:
            course_item["faculty_ids"] = faculty_by_department[dept][:5]

    _inject_demo_courses_if_empty(courses_map, faculty_by_id, limit=limit)

    if not courses_map and user_profile.get("program"):
        user_program = str(user_profile.get("program"))
        key = _slugify_course(user_program)
        default_faculty_ids = faculty_by_department.get(_normalize(user_profile.get("department")), [])[:5]
        courses_map[key] = {
            "id": key,
            "code": user_program.upper().replace(" ", "-"),
            "title": user_program,
            "department": user_profile.get("department"),
            "next_update_at": None,
            "notice_count": 0,
            "faculty_ids": default_faculty_ids,
        }

    courses = sorted(
        list(courses_map.values()),
        key=lambda item: str(item.get("next_update_at") or ""),
        reverse=True,
    )[:limit]

    user_role_norm = _normalize(user_role)
    user_dept_norm = _normalize(user_profile.get("department"))
    if user_role_norm == "admin":
        visible_faculty_ids = list(faculty_by_id.keys())
    else:
        from_courses = {
            str(fid)
            for item in courses
            for fid in (item.get("faculty_ids") or [])
            if str(fid)
        }
        dept_scoped = {
            fid for fid, row in faculty_by_id.items()
            if not user_dept_norm or _normalize(row.get("department")) == user_dept_norm
        }
        visible_faculty_ids = list(from_courses.union(dept_scoped)) if (from_courses or dept_scoped) else list(faculty_by_id.keys())

    snapshot["courses"] = courses
    snapshot["faculty_by_id"] = faculty_by_id
    snapshot["visible_faculty_ids"] = visible_faculty_ids
    return snapshot


def should_use_course_faculty_snapshot(query: str, intent: dict[str, Any]) -> bool:
    text = _normalize(query)
    target = _normalize(intent.get("target_entity"))
    intent_type = _normalize(intent.get("intent_type"))
    faculty_intents = {"count_faculty", "list_faculty", "faculty_profile", "course_faculty_map"}
    course_intents = {"count_courses", "list_courses", "course_faculty_map"}
    faculty_targets = {"faculty", "faculties", "teachers", "professors", "mentors", "instructors"}
    course_targets = {"courses", "course", "subjects", "curriculum", "syllabus"}
    teaching_markers = ("teach", "teaches", "teaching", "taught", "subject", "subjects", "handles")
    return (
        intent_type in faculty_intents
        or intent_type in course_intents
        or target in faculty_targets
        or target in course_targets
        or bool(str(intent.get("course") or "").strip())
        or any(marker in text for marker in teaching_markers)
    )


def _name_tokens(value: str) -> list[str]:
    ignore = {"dr", "prof", "mr", "mrs", "ms", "sir", "madam"}
    return [
        token
        for token in re.findall(r"[a-z]{2,}", _normalize(value))
        if token not in ignore
    ]


def _find_requested_faculty(
    query_text: str,
    faculty_by_id: dict[str, dict[str, Any]],
    visible_faculty_ids: list[str],
) -> Optional[tuple[str, dict[str, Any]]]:
    if not faculty_by_id:
        return None

    visible_set = {str(fid) for fid in visible_faculty_ids if str(fid)}
    candidates: list[tuple[int, str, dict[str, Any]]] = []

    for fid, row in faculty_by_id.items():
        fid_str = str(fid)
        if visible_set and fid_str not in visible_set:
            continue

        full_name = str(row.get("full_name") or "")
        normalized_full_name = _normalize(full_name)
        if not normalized_full_name:
            continue

        score = 0
        if normalized_full_name in query_text:
            score += 100

        tokens = _name_tokens(full_name)
        if tokens:
            token_hits = sum(1 for token in tokens if token in query_text)
            if token_hits >= 2:
                score += 50 + token_hits
            elif token_hits == 1 and len(tokens) == 1:
                score += 20

        if score > 0:
            candidates.append((score, fid_str, row))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    _, match_id, match_row = candidates[0]
    return match_id, match_row


def _find_requested_courses(
    query_text: str,
    courses: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for item in courses:
        title = _normalize(item.get("title"))
        code = _normalize(item.get("code"))
        if not title and not code:
            continue
        if title and title in query_text:
            matches.append(item)
            continue
        if code and code in query_text:
            matches.append(item)
            continue

        title_tokens = [token for token in re.findall(r"[a-z0-9]{3,}", title) if token not in {"btech", "course"}]
        hits = sum(1 for token in title_tokens if token in query_text)
        if hits >= 2:
            matches.append(item)

    dedup: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in matches:
        key = str(item.get("id") or item.get("title") or "")
        if key and key not in seen:
            seen.add(key)
            dedup.append(item)
    return dedup


def _navigation_block(links: list[tuple[str, str]], title: str = "Related pages") -> str:
    deduped: list[tuple[str, str]] = []
    seen: set[str] = set()
    for label, href in links:
        key = f"{label}|{href}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append((label, href))
    if not deduped:
        return ""
    lines = [f"{title}:"]
    lines.extend(f"- [{label}]({href})" for label, href in deduped)
    return "\n" + "\n".join(lines)


def append_navigation_links(answer: str, links: list[tuple[str, str]], title: str = "Related pages") -> str:
    if not answer or not links:
        return answer
    return answer + "\n\n" + _navigation_block(links, title=title)


def append_intent_navigation_links(answer: str, user_role: str, intent: dict[str, Any]) -> str:
    if not answer or "(/dashboard/" in answer or "Related pages:" in answer or "Quick links:" in answer:
        return answer

    intent_type = _normalize(intent.get("intent_type"))
    target_entity = _normalize(intent.get("target_entity"))
    role_norm = _normalize(user_role)
    links: list[tuple[str, str]] = []

    faculty_intents = {"count_faculty", "list_faculty", "faculty_profile", "course_faculty_map"}
    course_intents = {"count_courses", "list_courses", "course_faculty_map"}
    document_intents = {"count_documents", "list_documents", "document_date_lookup", "holiday_check"}

    if intent_type in faculty_intents or target_entity in {"faculty", "faculties", "teachers", "professors", "mentors"}:
        links.append(("Open Faculty Directory", "/dashboard/faculty"))
    if intent_type in course_intents or target_entity == "courses":
        links.append(("Open Courses", "/dashboard/courses"))
    if intent_type in document_intents or target_entity in {"documents", "notices"}:
        if role_norm in {"admin", "faculty"}:
            links.append(("Open Documents", "/dashboard/documents"))
        elif role_norm == "student":
            links.append(("Open Courses", "/dashboard/courses"))
            links.append(("Open Full Timetable", "/dashboard/timetable"))
        links.append(("Open Notifications", "/dashboard/notifications"))
    if intent_type == "count_users" and role_norm == "admin":
        links.append(("Open User Management", "/dashboard/users"))
        links.append(("Open Audit Logs", "/dashboard/audit"))
    if role_norm == "admin":
        if intent_type in {"count_appeals", "list_appeals"} or target_entity in {"appeal", "appeals", "moderation"}:
            links.append(("Open Dean Appeals", "/dashboard/dean"))
            links.append(("Open Audit Logs", "/dashboard/audit"))
        if intent_type == "audit_summary" or target_entity in {"audit", "logs"}:
            links.append(("Open Audit Logs", "/dashboard/audit"))
            links.append(("Open User Management", "/dashboard/users"))

    return append_navigation_links(answer, links)


def build_course_faculty_context(
    query: str,
    intent: dict[str, Any],
    snapshot: dict[str, Any],
) -> Optional[dict[str, Any]]:
    courses = snapshot.get("courses") or []
    faculty_by_id = snapshot.get("faculty_by_id") or {}
    visible_faculty_ids = snapshot.get("visible_faculty_ids") or []
    text = _normalize(query)
    target_entity = _normalize(intent.get("target_entity"))
    intent_type = _normalize(intent.get("intent_type"))
    count_request = bool(re.search(r"\b(how many|count|number of|total)\b", text))
    faculty_intents = {"count_faculty", "list_faculty", "faculty_profile", "course_faculty_map"}
    course_intents = {"count_courses", "list_courses", "course_faculty_map"}
    faculty_targets = {"faculty", "faculties", "teachers", "professors", "mentors", "instructors"}
    course_targets = {"courses", "course", "subjects", "curriculum", "syllabus"}
    course_related = intent_type in course_intents or target_entity in course_targets
    faculty_related = intent_type in faculty_intents or target_entity in faculty_targets
    requested_course = _normalize(intent.get("course"))

    scoped_courses = courses
    if requested_course:
        requested_filtered = [
            item
            for item in courses
            if requested_course in _normalize(item.get("title"))
            or requested_course in _normalize(item.get("code"))
        ]
        if requested_filtered:
            scoped_courses = requested_filtered
    else:
        query_matched_courses = _find_requested_courses(text, courses)
        if query_matched_courses:
            scoped_courses = query_matched_courses

    requested_faculty = _find_requested_faculty(text, faculty_by_id, [str(fid) for fid in visible_faculty_ids])
    faculty_profile_requested = intent_type == "faculty_profile" or (
        bool(requested_faculty) and (target_entity in faculty_targets or intent_type in {"general", "list_faculty", "course_faculty_map"})
    )
    if requested_faculty and faculty_profile_requested:
        faculty_id, faculty_row = requested_faculty
        mapped_courses = [
            item
            for item in scoped_courses
            if faculty_id in {str(fid) for fid in (item.get("faculty_ids") or [])}
        ]
        name = str(faculty_row.get("full_name") or "Faculty")
        context_lines = [
            "[Structured Faculty Profile Match]",
            f"- Name: {name}",
            f"- Department: {faculty_row.get('department') or 'Department not set'}",
        ]
        if faculty_row.get("email"):
            context_lines.append(f"- Email: {faculty_row.get('email')}")
        context_lines.append(f"- Courses taught in accessible scope: {len(mapped_courses)}")
        for item in mapped_courses[:8]:
            context_lines.append(
                f"- Course: {item.get('title')} | notices: {int(item.get('notice_count', 0))}"
            )
        return {
            "context": "\n".join(context_lines),
            "directive": (
                "Answer only from the structured faculty profile snapshot. "
                "If the accessible course count is 0, say so clearly and do not invent teaching assignments."
            ),
            "links": [
                (f"Open {name} Profile", f"/dashboard/faculty/{faculty_id}"),
                ("Open Faculty Directory", "/dashboard/faculty"),
                ("Open Courses", "/dashboard/courses"),
            ],
        }

    if (count_request and course_related) or intent_type == "count_courses":
        context_lines = [
            "[Structured Course Directory Snapshot]",
            f"- Matching course count: {len(scoped_courses)}",
        ]
        if intent.get("course"):
            context_lines.append(f"- Requested course filter: {intent.get('course')}")
        for item in scoped_courses[:6]:
            context_lines.append(
                f"- Course: {item.get('title')} | notices: {int(item.get('notice_count', 0))}"
            )
        return {
            "context": "\n".join(context_lines),
            "directive": (
                "Answer using the structured course directory snapshot only. "
                "State the exact matching course count and mention only the top relevant matches."
            ),
            "links": [("Open Courses", "/dashboard/courses"), ("Open Faculty Directory", "/dashboard/faculty")],
        }

    if (count_request and faculty_related) or intent_type == "count_faculty":
        faculty_ids = {
            str(fid)
            for item in scoped_courses
            for fid in (item.get("faculty_ids") or [])
            if str(fid)
        } or {str(fid) for fid in visible_faculty_ids if str(fid)}
        return {
            "context": (
                "[Structured Faculty Directory Snapshot]\n"
                f"- Accessible faculty count: {len(faculty_ids)}"
            ),
            "directive": (
                "Answer using the structured faculty directory snapshot only. "
                "State the exact accessible faculty count and do not imply access beyond the user's scope."
            ),
            "links": [("Open Faculty Directory", "/dashboard/faculty"), ("Open Courses", "/dashboard/courses")],
        }

    if course_related and faculty_related:
        context_lines = [
            "[Structured Course-Faculty Mapping Snapshot]",
            f"- Matching course count: {len(scoped_courses)}",
        ]
        for item in scoped_courses[:8]:
            faculty_names = [
                str((faculty_by_id.get(str(fid)) or {}).get("full_name") or "Unassigned")
                for fid in (item.get("faculty_ids") or [])
            ]
            faculty_text = ", ".join(faculty_names) if faculty_names else "No faculty mapped yet"
            context_lines.append(f"- {item.get('title')}: {faculty_text}")
        return {
            "context": "\n".join(context_lines),
            "directive": (
                "Answer only from the structured course-faculty mapping snapshot. "
                "If the course count is 0, say there are no mapped faculty in the current scope."
            ),
            "links": [("Open Courses", "/dashboard/courses"), ("Open Faculty Directory", "/dashboard/faculty")],
        }

    if intent_type == "list_courses" or (course_related and not faculty_related and not count_request):
        context_lines = [
            "[Structured Course Directory Snapshot]",
            f"- Matching course count: {len(scoped_courses)}",
        ]
        for item in scoped_courses[:10]:
            context_lines.append(
                f"- {item.get('title')} | notices: {int(item.get('notice_count', 0))}"
                f"{f' | latest: {_format_short_date(item.get('next_update_at'))}' if item.get('next_update_at') else ''}"
            )
        return {
            "context": "\n".join(context_lines),
            "directive": (
                "Answer using the structured course directory snapshot only. "
                "Summarize the relevant courses in the user's scope and do not invent missing course records."
            ),
            "links": [("Open Courses", "/dashboard/courses"), ("Open Documents", "/dashboard/documents")],
        }

    if intent_type == "list_faculty" or (faculty_related and not course_related and not count_request):
        visible_ids = [str(fid) for fid in visible_faculty_ids if str(fid)]
        context_lines = [
            "[Structured Faculty Directory Snapshot]",
            f"- Visible faculty count: {len(visible_ids)}",
        ]
        for fid in visible_ids[:12]:
            row = faculty_by_id.get(fid) or {}
            name = row.get("full_name") or "Faculty"
            context_lines.append(
                f"- Faculty: {name} | department: {row.get('department') or 'Department not set'} | profile: /dashboard/faculty/{fid}"
            )
        return {
            "context": "\n".join(context_lines),
            "directive": (
                "Answer using the structured faculty directory snapshot only. "
                "List relevant faculty in scope and mention profile links only when present in context."
            ),
            "links": [("Open Faculty Directory", "/dashboard/faculty"), ("Open Courses", "/dashboard/courses")],
        }

    if faculty_related:
        visible_ids = [str(fid) for fid in visible_faculty_ids if str(fid)]
        context_lines = [
            "[Structured Faculty Directory Snapshot]",
            f"- Visible faculty count: {len(visible_ids)}",
        ]
        for fid in visible_ids[:8]:
            row = faculty_by_id.get(fid) or {}
            name = row.get("full_name") or "Faculty"
            context_lines.append(
                f"- Faculty: {name} | department: {row.get('department') or 'Department not set'} | profile: /dashboard/faculty/{fid}"
            )
        return {
            "context": "\n".join(context_lines),
            "directive": (
                "Answer using the structured faculty directory snapshot only. "
                "If there are 0 faculty records, say that clearly."
            ),
            "links": [("Open Faculty Directory", "/dashboard/faculty"), ("Open Courses", "/dashboard/courses")],
        }

    if course_related:
        context_lines = [
            "[Structured Course Directory Snapshot]",
            f"- Matching course count: {len(scoped_courses)}",
        ]
        for item in scoped_courses[:8]:
            context_lines.append(
                f"- Course: {item.get('title')} | notices: {int(item.get('notice_count', 0))}"
            )
        return {
            "context": "\n".join(context_lines),
            "directive": (
                "Answer using the structured course directory snapshot only. "
                "If there are 0 courses, say that clearly and avoid inventing course titles."
            ),
            "links": [("Open Courses", "/dashboard/courses"), ("Open Documents", "/dashboard/documents")],
        }

    return None


