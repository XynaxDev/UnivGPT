import datetime
import re
from typing import Any, Optional


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
    course_markers = ("course", "courses", "curriculum", "subject", "subjects", "syllabus")
    faculty_markers = (
        "faculty",
        "teacher",
        "teachers",
        "professor",
        "professors",
        "mentor",
        "mentors",
        "instructor",
        "instructors",
        "teach",
        "teaches",
        "teaching",
        "advisor",
        "adviser",
        "who is",
    )
    return (
        any(marker in text for marker in course_markers + faculty_markers)
        or target in {"courses", "faculty", "teachers", "professors", "mentors"}
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


def append_intent_navigation_links(answer: str, user_role: str, intent: dict[str, Any]) -> str:
    if not answer or "(/dashboard/" in answer or "Related pages:" in answer or "Quick links:" in answer:
        return answer

    intent_type = _normalize(intent.get("intent_type"))
    target_entity = _normalize(intent.get("target_entity"))
    links: list[tuple[str, str]] = []

    faculty_intents = {"count_faculty", "list_faculty", "faculty_profile", "course_faculty_map"}
    course_intents = {"count_courses", "list_courses", "course_faculty_map"}
    document_intents = {"count_documents", "list_documents", "document_date_lookup", "holiday_check"}

    if intent_type in faculty_intents or target_entity in {"faculty", "teachers", "professors", "mentors"}:
        links.append(("Open Faculty Directory", "/dashboard/faculty"))
    if intent_type in course_intents or target_entity == "courses":
        links.append(("Open Courses", "/dashboard/courses"))
    if intent_type in document_intents or target_entity in {"documents", "notices"}:
        links.append(("Open Documents", "/dashboard/documents"))
        links.append(("Open Notifications", "/dashboard/notifications"))
    if intent_type == "count_users" and _normalize(user_role) == "admin":
        links.append(("Open User Management", "/dashboard/users"))
        links.append(("Open Audit Logs", "/dashboard/audit"))

    if not links:
        return answer
    return answer + "\n\n" + _navigation_block(links)


def build_course_faculty_answer(
    query: str,
    intent: dict[str, Any],
    snapshot: dict[str, Any],
) -> Optional[str]:
    courses = snapshot.get("courses") or []
    faculty_by_id = snapshot.get("faculty_by_id") or {}
    visible_faculty_ids = snapshot.get("visible_faculty_ids") or []
    text = _normalize(query)
    target_entity = _normalize(intent.get("target_entity"))
    intent_type = _normalize(intent.get("intent_type"))
    count_request = bool(re.search(r"\b(how many|count|number of|total)\b", text))

    course_code_mentioned = bool(re.search(r"\b[a-z]{2,6}[\s-]?\d{2,4}\b", text))
    course_related = (
        any(marker in text for marker in ("course", "courses", "curriculum", "subject", "subjects"))
        or target_entity == "courses"
        or course_code_mentioned
    )
    faculty_related = any(
        marker in text
        for marker in (
            "faculty",
            "teacher",
            "teachers",
            "professor",
            "professors",
            "mentor",
            "mentors",
            "instructor",
            "instructors",
            "teach",
            "teaches",
            "teaching",
            "advisor",
            "adviser",
            "who is",
        )
    ) or target_entity == "faculty"
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
    faculty_profile_requested = any(
        marker in text
        for marker in (
            "who is",
            "about",
            "tell me",
            "profile",
            "teach",
            "teaches",
            "teaching",
            "what she",
            "what he",
            "what they",
        )
    )
    if requested_faculty and faculty_profile_requested:
        faculty_id, faculty_row = requested_faculty
        mapped_courses = [
            item
            for item in scoped_courses
            if faculty_id in {str(fid) for fid in (item.get("faculty_ids") or [])}
        ]
        name = str(faculty_row.get("full_name") or "Faculty")
        department = str(faculty_row.get("department") or "Department not set")
        email = str(faculty_row.get("email") or "")
        email_line = f"- Email: {email}\n" if email else ""
        if mapped_courses:
            courses_lines = "\n".join(
                f"- {item.get('title')} ({int(item.get('notice_count', 0))} notices)"
                for item in mapped_courses[:8]
            )
            answer = (
                f"Here is the live profile match:\n"
                f"- Name: {name}\n"
                f"- Department: {department}\n"
                f"{email_line}"
                f"- Courses taught in your accessible scope: {len(mapped_courses)}\n"
                f"{courses_lines}"
            )
            answer += "\n\n" + _navigation_block(
                [
                    (f"Open {name} Profile", f"/dashboard/faculty/{faculty_id}"),
                    ("Open Faculty Directory", "/dashboard/faculty"),
                    ("Open Courses", "/dashboard/courses"),
                ],
                title="Quick links",
            )
            return answer
        answer = (
            f"Here is the live profile match:\n"
            f"- Name: {name}\n"
            f"- Department: {department}\n"
            f"{email_line}"
            f"- Courses taught in your accessible scope: 0"
        )
        answer += "\n\n" + _navigation_block(
            [
                (f"Open {name} Profile", f"/dashboard/faculty/{faculty_id}"),
                ("Open Faculty Directory", "/dashboard/faculty"),
                ("Open Courses", "/dashboard/courses"),
            ],
            title="Quick links",
        )
        return answer

    if (count_request and course_related) or intent_type == "count_courses":
        if not scoped_courses:
            scope_label = f" for `{intent.get('course')}`" if intent.get("course") else ""
            answer = f"I checked the live course directory and found **0 courses{scope_label}** in your current access scope."
            return answer + "\n\n" + _navigation_block(
                [("Open Courses", "/dashboard/courses"), ("Open Faculty Directory", "/dashboard/faculty")],
                title="Quick links",
            )
        preview = "\n".join(f"- {item.get('title')} ({item.get('notice_count', 0)} notices)" for item in scoped_courses[:6])
        answer = (
            f"I found **{len(scoped_courses)} courses** in your live directory.\n\n"
            f"Top matches:\n{preview}"
        )
        return answer + "\n\n" + _navigation_block(
            [("Open Courses", "/dashboard/courses"), ("Open Faculty Directory", "/dashboard/faculty")],
            title="Quick links",
        )

    if (count_request and faculty_related) or intent_type == "count_faculty":
        faculty_ids = {
            str(fid)
            for item in scoped_courses
            for fid in (item.get("faculty_ids") or [])
            if str(fid)
        } or {str(fid) for fid in visible_faculty_ids if str(fid)}
        answer = f"I found **{len(faculty_ids)} faculty members** mapped to your accessible courses/scope."
        return answer + "\n\n" + _navigation_block(
            [("Open Faculty Directory", "/dashboard/faculty"), ("Open Courses", "/dashboard/courses")],
            title="Quick links",
        )

    if course_related and faculty_related:
        if not scoped_courses:
            answer = "I checked your live course directory and found **0 matching courses**, so there are no mapped faculty yet."
            return answer + "\n\n" + _navigation_block(
                [("Open Courses", "/dashboard/courses"), ("Open Faculty Directory", "/dashboard/faculty")],
                title="Quick links",
            )
        lines: list[str] = []
        for item in scoped_courses[:8]:
            faculty_names = [
                str((faculty_by_id.get(str(fid)) or {}).get("full_name") or "Unassigned")
                for fid in (item.get("faculty_ids") or [])
            ]
            faculty_text = ", ".join(faculty_names) if faculty_names else "No faculty mapped yet"
            lines.append(f"- {item.get('title')}: {faculty_text}")
        answer = "Here are the faculty mappings from your live course directory:\n" + "\n".join(lines)
        return answer + "\n\n" + _navigation_block(
            [("Open Courses", "/dashboard/courses"), ("Open Faculty Directory", "/dashboard/faculty")],
            title="Quick links",
        )

    if intent_type == "list_courses" or (course_related and any(marker in text for marker in ("list", "show", "which", "available", "my"))):
        if not scoped_courses:
            answer = "I checked your live course directory and found **0 courses** in your current access scope."
            return answer + "\n\n" + _navigation_block(
                [("Open Courses", "/dashboard/courses"), ("Open Documents", "/dashboard/documents")],
                title="Quick links",
            )
        lines = []
        for item in scoped_courses[:10]:
            lines.append(
                f"- {item.get('title')} | notices: {int(item.get('notice_count', 0))}"
                f"{f' | latest: {_format_short_date(item.get('next_update_at'))}' if item.get('next_update_at') else ''}"
            )
        answer = "Here are your live courses from the database:\n" + "\n".join(lines)
        return answer + "\n\n" + _navigation_block(
            [("Open Courses", "/dashboard/courses"), ("Open Documents", "/dashboard/documents")],
            title="Quick links",
        )

    if intent_type == "list_faculty" or (faculty_related and any(marker in text for marker in ("list", "show", "which", "available", "my"))):
        visible_ids = [str(fid) for fid in visible_faculty_ids if str(fid)]
        if not visible_ids:
            answer = "I checked your live faculty directory and found **0 faculty records** in your current scope."
            return answer + "\n\n" + _navigation_block(
                [("Open Faculty Directory", "/dashboard/faculty"), ("Open Courses", "/dashboard/courses")],
                title="Quick links",
            )
        lines = []
        for fid in visible_ids[:12]:
            row = faculty_by_id.get(fid) or {}
            name = row.get("full_name") or "Faculty"
            lines.append(
                f"- {name} ({row.get('department') or 'Department not set'}) "
                f"[Open profile](/dashboard/faculty/{fid})"
            )
        answer = "Here are faculty members from your live directory:\n" + "\n".join(lines)
        return answer + "\n\n" + _navigation_block(
            [("Open Faculty Directory", "/dashboard/faculty"), ("Open Courses", "/dashboard/courses")],
            title="Quick links",
        )

    if faculty_related:
        visible_ids = [str(fid) for fid in visible_faculty_ids if str(fid)]
        if not visible_ids:
            answer = "I checked your live faculty directory and found **0 faculty records** in your current scope."
            return answer + "\n\n" + _navigation_block(
                [("Open Faculty Directory", "/dashboard/faculty")],
                title="Quick links",
            )
        lines = []
        for fid in visible_ids[:8]:
            row = faculty_by_id.get(fid) or {}
            name = row.get("full_name") or "Faculty"
            lines.append(f"- {name} ({row.get('department') or 'Department not set'}) [Open profile](/dashboard/faculty/{fid})")
        answer = "I checked the live faculty directory. Here are relevant faculty profiles:\n" + "\n".join(lines)
        return answer + "\n\n" + _navigation_block(
            [("Open Faculty Directory", "/dashboard/faculty"), ("Open Courses", "/dashboard/courses")],
            title="Quick links",
        )

    if course_related:
        if not scoped_courses:
            answer = "I checked your live course directory and found **0 courses** in your current access scope."
            return answer + "\n\n" + _navigation_block(
                [("Open Courses", "/dashboard/courses")],
                title="Quick links",
            )
        lines = []
        for item in scoped_courses[:8]:
            lines.append(f"- {item.get('title')} ({int(item.get('notice_count', 0))} notices)")
        answer = "I checked the live course directory. Here are relevant courses:\n" + "\n".join(lines)
        return answer + "\n\n" + _navigation_block(
            [("Open Courses", "/dashboard/courses"), ("Open Documents", "/dashboard/documents")],
            title="Quick links",
        )

    return None

