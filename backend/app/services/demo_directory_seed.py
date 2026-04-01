"""
Demo directory seed and fallback helpers.

Keeps faculty/course demo data available for local testing and UI previews.
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.models.schemas import CourseDirectoryItem, CourseDirectoryResponse, FacultyListResponse, FacultySummary
from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)


DEMO_FACULTY = [
    {
        "id": "demo-fac-1",
        "email": "demo.priya.faculty@univgpt.edu",
        "full_name": "Dr. Priya Sharma",
        "department": "Computer Science",
        "program": "BTech CSE Mentor",
        "seed_password": "FacultyDemo@123",
    },
    {
        "id": "demo-fac-2",
        "email": "demo.rohan.faculty@univgpt.edu",
        "full_name": "Prof. Rohan Verma",
        "department": "Computer Science",
        "program": "Academic Coordinator",
        "seed_password": "FacultyDemo@123",
    },
    {
        "id": "demo-fac-3",
        "email": "demo.meera.faculty@univgpt.edu",
        "full_name": "Dr. Meera Nair",
        "department": "Computer Science",
        "program": "Student Advisor",
        "seed_password": "FacultyDemo@123",
    },
]

DEMO_COURSES = [
    {
        "id": "demo-course-1",
        "code": "CS301",
        "title": "Data Structures & Algorithms",
        "department": "Computer Science",
        "notice_count": 3,
        "faculty_ids": ["demo-fac-1", "demo-fac-2"],
        "filename": "BTECH_CSE_CS301_Data_Structures_Notice.pdf",
        "course": "BTech CSE - CS301",
        "doc_type": "student",
        "uploader": "demo.priya.faculty@univgpt.edu",
        "tags": ["notice", "cs301", "btech-cse"],
    },
    {
        "id": "demo-course-2",
        "code": "CS402",
        "title": "Database Management Systems",
        "department": "Computer Science",
        "notice_count": 2,
        "faculty_ids": ["demo-fac-2"],
        "filename": "BTECH_CSE_CS402_DBMS_Assessment_Update.pdf",
        "course": "BTech CSE - CS402",
        "doc_type": "student",
        "uploader": "demo.rohan.faculty@univgpt.edu",
        "tags": ["notice", "dbms", "assessment"],
    },
    {
        "id": "demo-course-3",
        "code": "AI405",
        "title": "Applied Machine Learning",
        "department": "Computer Science",
        "notice_count": 4,
        "faculty_ids": ["demo-fac-3", "demo-fac-1"],
        "filename": "BTECH_CSE_AI405_ML_Lab_Notice.pdf",
        "course": "BTech CSE - AI405",
        "doc_type": "student",
        "uploader": "demo.meera.faculty@univgpt.edu",
        "tags": ["notice", "ml", "lab"],
    },
]


def build_demo_faculty_response(limit: int = 20) -> FacultyListResponse:
    safe_limit = min(max(limit, 1), 100)
    rows = DEMO_FACULTY[:safe_limit]
    return FacultyListResponse(
        faculty=[
            FacultySummary(
                id=row["id"],
                full_name=row["full_name"],
                email=row["email"],
                department=row.get("department"),
                program=row.get("program"),
            )
            for row in rows
        ],
        total=min(len(DEMO_FACULTY), safe_limit),
    )


def build_demo_courses_response(limit: int = 50) -> CourseDirectoryResponse:
    safe_limit = min(max(limit, 1), 200)
    rows = DEMO_COURSES[:safe_limit]
    return CourseDirectoryResponse(
        courses=[
            CourseDirectoryItem(
                id=row["id"],
                code=row["code"],
                title=row["title"],
                department=row.get("department"),
                next_update_at=None,
                notice_count=int(row.get("notice_count", 0)),
                faculty_ids=list(row.get("faculty_ids", [])),
            )
            for row in rows
        ],
        total=min(len(DEMO_COURSES), safe_limit),
    )


def _find_auth_user_by_email(admin: Any, email: str) -> Any:
    users_response = admin.auth.admin.list_users()
    users = getattr(users_response, "users", None)
    if users is None and isinstance(users_response, dict):
        users = users_response.get("users")
    users = users or []
    for user in users:
        candidate = getattr(user, "email", None) or (user.get("email") if isinstance(user, dict) else None)
        if str(candidate or "").strip().lower() == email.strip().lower():
            return user
    return None


def _user_id_from_auth_user(user: Any) -> str:
    if isinstance(user, dict):
        return str(user.get("id") or "")
    return str(getattr(user, "id", "") or "")


def ensure_demo_directory_seed() -> None:
    """
    Ensure 3 faculty users + 3 demo course documents exist in Supabase.
    Safe to run repeatedly.
    """
    if settings.supabase_offline_mode:
        logger.info("Skipping demo seed in offline mode.")
        return

    try:
        admin = get_supabase_admin()
    except Exception as exc:
        logger.warning("Demo seed skipped: failed to build Supabase admin client: %s", exc)
        return

    try:
        faculty_id_by_email: dict[str, str] = {}

        for row in DEMO_FACULTY:
            email = row["email"]
            auth_user = _find_auth_user_by_email(admin, email)
            if not auth_user:
                try:
                    created = admin.auth.admin.create_user(
                        {
                            "email": email,
                            "password": row["seed_password"],
                            "email_confirm": True,
                            "user_metadata": {
                                "full_name": row["full_name"],
                                "role": "faculty",
                                "department": row.get("department"),
                                "program": row.get("program"),
                            },
                        }
                    )
                    auth_user = getattr(created, "user", None)
                except Exception as create_exc:
                    logger.warning("Demo seed auth user create failed for %s: %s", email, create_exc)
                    auth_user = _find_auth_user_by_email(admin, email)

            user_id = _user_id_from_auth_user(auth_user) if auth_user else ""
            if not user_id:
                continue

            faculty_id_by_email[email] = user_id

            try:
                admin.table("profiles").upsert(
                    {
                        "id": user_id,
                        "email": email,
                        "full_name": row["full_name"],
                        "role": "faculty",
                        "department": row.get("department"),
                        "program": row.get("program"),
                    },
                    on_conflict="id",
                ).execute()
            except Exception as profile_exc:
                logger.warning("Demo seed profile upsert failed for %s: %s", email, profile_exc)

        existing_docs_res = (
            admin.table("documents")
            .select("id,filename")
            .in_("filename", [str(c["filename"]) for c in DEMO_COURSES])
            .execute()
        )
        existing_names = {str(row.get("filename") or "") for row in (existing_docs_res.data or [])}

        for course in DEMO_COURSES:
            filename = str(course["filename"])
            if filename in existing_names:
                continue
            uploader_id = faculty_id_by_email.get(str(course.get("uploader") or ""))
            if not uploader_id:
                continue
            try:
                admin.table("documents").insert(
                    {
                        "uploader_id": uploader_id,
                        "filename": filename,
                        "doc_type": course.get("doc_type", "student"),
                        "department": course.get("department"),
                        "course": course.get("course"),
                        "tags": course.get("tags", []),
                        "visibility": True,
                        "metadata": {
                            "seed": "demo-directory",
                            "seed_version": 1,
                            "course_code": course.get("code"),
                        },
                    }
                ).execute()
            except Exception as doc_exc:
                logger.warning("Demo seed document insert failed for %s: %s", filename, doc_exc)

        logger.info("Demo directory seed completed.")
    except Exception as exc:
        logger.warning("Demo directory seed skipped due to runtime error: %s", exc)

