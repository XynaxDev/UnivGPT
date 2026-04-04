# Copyright (c) 2026 XynaxDev
# Contact: akashkumar.cs27@gmail.com

"""
Role-Based Access Control (RBAC) Middleware
Provides dependency factories that enforce role requirements on endpoints.
"""

from fastapi import Depends, HTTPException
from functools import wraps
from typing import Callable

from app.middleware.auth import AuthenticatedUser, get_current_user
from app.models.schemas import UserRole


def require_roles(*allowed_roles: UserRole):
    """
    Dependency factory that creates a role-checking dependency.

    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_roles(UserRole.ADMIN))])
        async def admin_endpoint():
            ...

    Or inject the user:
        @router.get("/faculty")
        async def faculty_endpoint(user = Depends(require_roles(UserRole.FACULTY, UserRole.ADMIN))):
            ...
    """

    async def role_checker(
        user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        if user.role not in [r.value for r in allowed_roles]:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role(s): {', '.join(r.value for r in allowed_roles)}. Your role: {user.role}",
            )
        return user

    return role_checker


def get_allowed_doc_types(role: str) -> list[str]:
    """
    Returns the document types a user role is allowed to access.
    Students get student docs.
    Faculty get faculty + student docs.
    Admins get everything.
    """
    role_permissions = {
        "student": ["student"],
        "faculty": ["faculty", "student"],
        "admin": ["student", "faculty", "admin"],
    }
    return role_permissions.get(role, ["student"])


def is_sensitive_query(query: str) -> bool:
    """
    Checks if a query is requesting sensitive personal data
    that should NOT be answered purely from RAG.
    """
    sensitive_keywords = [
        "my grades", "my gpa", "my transcript",
        "my financial", "my tuition", "my scholarship",
        "my disciplinary", "my records", "my salary",
        "my evaluation", "my performance review",
        "social security", "ssn", "bank account",
    ]
    query_lower = query.lower()
    return any(kw in query_lower for kw in sensitive_keywords)


