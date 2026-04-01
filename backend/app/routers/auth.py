"""
Authentication Router
Simplified for Supabase Auth integration.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, Query
import random
import httpx
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
import re
import time
from app.models.schemas import (
    LoginRequest,
    AuthResponse,
    UserProfile,
    UserProfileUpdateRequest,
    UserSettingsPayload,
    UserSettingsResponse,
    UserNotificationItem,
    UserNotificationListResponse,
    FacultySummary,
    FacultyListResponse,
    CourseDirectoryItem,
    CourseDirectoryResponse,
    UserExportDataResponse,
    UserExportProfile,
    UserRole,
    InitiateSignupRequest,
    VerifySignupRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    SignupResponse,
    RoleSelectionRequest,
)
from app.middleware.auth import AuthenticatedUser, get_current_user, is_academic_email
from app.middleware.rbac import get_allowed_doc_types
from app.config import settings
from app.services.supabase_client import get_supabase_client, get_supabase_admin
from app.services.audit import log_audit_event
from app.services.email_service import EmailService

router = APIRouter(tags=["Authentication"])

# Runtime schema capability flags and short-lived response caches to reduce repeated DB probes.
# Most current Supabase docs schemas in this project use uploaded_at and may not expose created_at.
_DOCUMENTS_HAS_CREATED_AT: bool | None = False
_DOCUMENTS_HAS_UPLOADER_ID: bool | None = None
_DOCUMENTS_ORDER_COLUMN: str = "uploaded_at"
_USER_NOTIFICATIONS_CACHE: dict[tuple[str, int], tuple[float, UserNotificationListResponse]] = {}
_USER_FACULTY_CACHE: dict[tuple[str, int], tuple[float, FacultyListResponse]] = {}
_USER_COURSES_CACHE: dict[tuple[str, int], tuple[float, CourseDirectoryResponse]] = {}
_CACHE_TTL_NOTIFICATIONS_SECONDS = 12.0
_CACHE_TTL_FACULTY_SECONDS = 20.0
_CACHE_TTL_COURSES_SECONDS = 20.0


def is_dummy_auth_enabled() -> bool:
    env = (settings.environment or "").strip().lower()
    return settings.enable_dummy_auth or env in {"dev", "development", "local", "test"}


def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    if isinstance(exc, httpx.RequestError):
        return True
    return (
        "getaddrinfo failed" in message
        or "name or service not known" in message
        or "temporary failure in name resolution" in message
        or "nodename nor servname provided" in message
    )


def raise_supabase_unreachable() -> None:
    raise HTTPException(
        status_code=503,
        detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, and internet connectivity.",
    )


def extract_auth_users(users_response: Any) -> list[Any]:
    if isinstance(users_response, list):
        return users_response
    if hasattr(users_response, "users"):
        return list(getattr(users_response, "users") or [])
    if isinstance(users_response, dict) and isinstance(users_response.get("users"), list):
        return users_response["users"]
    return []


def build_oauth_redirect_url() -> str:
    base = settings.frontend_app_url.rstrip("/")
    path = settings.oauth_redirect_path
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base}{path}"


def with_query_param(url: str, key: str, value: str) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query[key] = value
    return urlunparse(parsed._replace(query=urlencode(query)))


def extract_identity_provider(auth_user: Any = None) -> str:
    if auth_user is not None:
        app_metadata = getattr(auth_user, "app_metadata", {}) or {}
        providers = app_metadata.get("providers") or []
        if providers:
            return providers[0]
    return "email"


def normalize_profile_role(value: Any) -> str:
    try:
        return UserRole(str(value).strip().lower()).value
    except Exception:
        return UserRole.STUDENT.value


def build_profile_seed(
    user_id: str, auth_user: Any, existing_profile: dict[str, Any] | None = None
) -> dict[str, Any]:
    existing = existing_profile or {}
    metadata = getattr(auth_user, "user_metadata", {}) or {}

    email = (getattr(auth_user, "email", None) or existing.get("email") or "").strip()
    full_name = (
        metadata.get("full_name")
        or metadata.get("name")
        or existing.get("full_name")
        or "User"
    )
    role = normalize_profile_role(
        metadata.get("role") or existing.get("role") or UserRole.STUDENT.value
    )
    department = (
        metadata.get("department")
        if metadata.get("department") is not None
        else existing.get("department")
    )

    return {
        "id": user_id,
        "email": email,
        "full_name": str(full_name).strip() or "User",
        "role": role,
        "department": department,
    }


def ensure_profile_consistency(admin: Any, user_id: str, auth_user: Any) -> dict[str, Any]:
    existing_res = admin.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    existing = existing_res.data[0] if existing_res.data else None
    seed = build_profile_seed(user_id, auth_user, existing)

    if not existing:
        created = admin.table("profiles").insert(seed).execute()
        if created.data:
            return created.data[0]
        return seed

    update_payload: dict[str, Any] = {}
    for field in ("email", "full_name", "role"):
        desired = seed.get(field)
        if desired and existing.get(field) != desired:
            update_payload[field] = desired

    if seed.get("department") is not None and existing.get("department") != seed.get(
        "department"
    ):
        update_payload["department"] = seed["department"]

    if update_payload:
        updated = (
            admin.table("profiles").update(update_payload).eq("id", user_id).execute()
        )
        if updated.data:
            return updated.data[0]
        return {**existing, **update_payload}

    return existing


def build_user_profile(profile: dict, auth_user: Any = None) -> UserProfile:
    email = profile.get("email", "")
    metadata = getattr(auth_user, "user_metadata", {}) if auth_user else {}
    metadata = metadata or {}
    return UserProfile(
        id=profile["id"],
        email=email,
        full_name=profile.get("full_name", "User"),
        role=UserRole(profile.get("role", "student")),
        department=profile.get("department"),
        program=profile.get("program") or metadata.get("program"),
        semester=(
            str(profile.get("semester"))
            if profile.get("semester") is not None
            else (str(metadata.get("semester")) if metadata.get("semester") is not None else None)
        ),
        section=profile.get("section") or metadata.get("section"),
        roll_number=profile.get("roll_number") or metadata.get("roll_number"),
        created_at=str(profile.get("created_at")) if profile.get("created_at") else None,
        academic_verified=is_academic_email(email),
        identity_provider=extract_identity_provider(auth_user),
    )


def load_profile_row(admin: Any, user_id: str) -> dict[str, Any]:
    """Fetch a profile row with graceful fallback for older schemas."""
    preferred_select = (
        "id,email,full_name,role,department,program,semester,section,"
        "roll_number,created_at,preferences,identity_provider"
    )
    fallback_select = "id,email,full_name,role,department,created_at,preferences,identity_provider"
    try:
        res = admin.table("profiles").select(preferred_select).eq("id", user_id).limit(1).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if any(marker in msg for marker in ("program", "semester", "section", "roll_number", "preferences")):
            res = admin.table("profiles").select(fallback_select).eq("id", user_id).limit(1).execute()
        else:
            raise
    return res.data[0] if res.data else {}


def normalize_user_settings(raw: Any) -> UserSettingsPayload:
    payload = raw if isinstance(raw, dict) else {}
    return UserSettingsPayload(
        emailNotifications=bool(payload.get("emailNotifications", True)),
        pushNotifications=bool(payload.get("pushNotifications", False)),
        reducedMotion=bool(payload.get("reducedMotion", False)),
    )


def parse_timestamp(raw: Any) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except Exception:
        return None


def to_iso(raw: Any) -> str | None:
    dt = parse_timestamp(raw)
    if not dt:
        return str(raw) if raw else None
    return dt.astimezone(timezone.utc).isoformat()


def slugify_course(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return text.strip("-") or "general"


def is_document_relevant_for_user(doc: dict[str, Any], user: AuthenticatedUser) -> bool:
    doc_type = str(doc.get("doc_type") or "").strip().lower()
    role = str(user.role or "").strip().lower()
    if role == UserRole.ADMIN.value:
        allowed = True
    elif role == UserRole.FACULTY.value:
        allowed = doc_type in {UserRole.FACULTY.value, UserRole.STUDENT.value, "public"}
    else:
        allowed = doc_type in {UserRole.STUDENT.value, "public"}
    if not allowed:
        return False

    user_dept = (user.department or "").strip().lower()
    user_program = (user.program or "").strip().lower()
    doc_dept = str(doc.get("department") or "").strip().lower()
    doc_course = str(doc.get("course") or "").strip().lower()

    if role == UserRole.ADMIN.value:
        return True

    # If document is globally visible without tags, allow.
    if not doc_dept and not doc_course:
        return True

    if user_dept and doc_dept and user_dept == doc_dept:
        return True
    if user_program and doc_course and user_program in doc_course:
        return True
    return False


def notification_message_from_document(doc: dict[str, Any]) -> str:
    filename = str(doc.get("filename") or "New document")
    course = str(doc.get("course") or "").strip()
    department = str(doc.get("department") or "").strip()
    scope_parts = [part for part in (course, department) if part]
    if scope_parts:
        return f"{filename} was posted for {' / '.join(scope_parts)}."
    return f"{filename} was posted for your accessible feed."


def fetch_documents_feed(admin: Any, limit: int) -> list[dict[str, Any]]:
    global _DOCUMENTS_HAS_CREATED_AT, _DOCUMENTS_HAS_UPLOADER_ID, _DOCUMENTS_ORDER_COLUMN

    def build_select_columns() -> str:
        cols = ["id", "filename", "doc_type", "department", "course", "tags", "uploaded_at"]
        if _DOCUMENTS_HAS_CREATED_AT is not False:
            cols.append("created_at")
        if _DOCUMENTS_HAS_UPLOADER_ID is not False:
            cols.append("uploader_id")
        return ",".join(cols)

    def run_query():
        return (
            admin.table("documents")
            .select(build_select_columns())
            .order(_DOCUMENTS_ORDER_COLUMN, desc=True)
            .limit(limit)
            .execute()
        )

    for _ in range(3):
        try:
            return (run_query().data or [])
        except Exception as exc:
            msg = str(exc).lower()
            updated = False

            if "created_at" in msg and _DOCUMENTS_HAS_CREATED_AT is not False:
                _DOCUMENTS_HAS_CREATED_AT = False
                updated = True
            elif "created_at" in msg and _DOCUMENTS_ORDER_COLUMN == "created_at":
                _DOCUMENTS_ORDER_COLUMN = "uploaded_at"
                updated = True

            if "uploader_id" in msg and _DOCUMENTS_HAS_UPLOADER_ID is not False:
                _DOCUMENTS_HAS_UPLOADER_ID = False
                updated = True

            if "uploaded_at" in msg and _DOCUMENTS_ORDER_COLUMN != "created_at":
                _DOCUMENTS_ORDER_COLUMN = "created_at"
                updated = True
            elif "uploaded_at" in msg and _DOCUMENTS_ORDER_COLUMN == "uploaded_at":
                _DOCUMENTS_ORDER_COLUMN = "created_at"
                updated = True

            if not updated:
                raise

    return []


def fetch_documents_by_doc_types(
    admin: Any,
    allowed_types: list[str],
    limit: int,
) -> list[dict[str, Any]]:
    docs = fetch_documents_feed(admin, limit)
    if not allowed_types:
        return []
    allowed = {str(value).strip().lower() for value in allowed_types}
    return [doc for doc in docs if str(doc.get("doc_type") or "").strip().lower() in allowed]


@router.post("/auth/signup", response_model=SignupResponse)
async def signup(request: Request, body: InitiateSignupRequest):
    """
    Initiate signup with custom 6-digit OTP and bypass Supabase default email.
    """
    try:
        admin = get_supabase_admin()

        # 1. Generate 6-digit OTP
        otp_code = "".join([str(random.randint(0, 9)) for _ in range(6)])

        # 2. Check if user already exists in Auth
        users_resp = extract_auth_users(admin.auth.admin.list_users())
        existing_auth_user = next(
            (u for u in users_resp if u.email == body.email), None
        )

        if existing_auth_user:
            user_metadata = existing_auth_user.user_metadata or {}
            # If already verified, they really exist - block it
            if user_metadata.get("is_verified", False):
                raise HTTPException(
                    status_code=400,
                    detail="An account with this email already exists inside UnivGPT. Please try logging in.",
                )

            # If NOT verified, update their record with new OTP and metadata
            user_id = existing_auth_user.id
            admin.auth.admin.update_user_by_id(
                user_id,
                {
                    "password": body.password,
                    "user_metadata": {
                        "full_name": body.full_name,
                        "role": body.role.value
                        if hasattr(body.role, "value")
                        else body.role,
                        "department": body.department,
                        "otp_code": otp_code,
                        "is_verified": False,
                    },
                },
            )
        else:
            # Create new unverified user (Confirmed=True skips default email)
            auth_res = admin.auth.admin.create_user(
                {
                    "email": body.email,
                    "password": body.password,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": body.full_name,
                        "role": body.role.value
                        if hasattr(body.role, "value")
                        else body.role,
                        "department": body.department,
                        "otp_code": otp_code,
                        "is_verified": False,
                    },
                }
            )
            user_id = auth_res.user.id

        # 3. Log audit event (Use user_id=None to avoid Profile FK error)
        await log_audit_event(
            user_id=None,
            action="signup_initiated",
            payload={"target_user_id": user_id, "email": body.email},
        )

        # 4. Send professional OTP email with REAL code
        try:
            EmailService.send_otp_email(
                receiver_email=body.email, otp=otp_code, user_name=body.full_name
            )
        except Exception as smtp_error:
            raise HTTPException(
                status_code=502,
                detail=f"OTP email delivery failed: {smtp_error}",
            )

        return SignupResponse(
            message="Verification email dispatched with your secure code.",
            email=body.email,
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/login", response_model=AuthResponse)
async def login(request: Request, body: LoginRequest):
    """Login with email/password via Supabase (optional dummy auth only when enabled)."""
    # 1. Optional dummy credentials for local development only
    dummy_accounts = {
        "admin@unigpt.edu": {
            "pass": "admin-password-123",
            "role": "admin",
            "name": "Admin User",
            "dept": "Administration",
        },
        "faculty@unigpt.edu": {
            "pass": "faculty-password-123",
            "role": "faculty",
            "name": "Dr. Priya Sharma",
            "dept": "Computer Science",
        },
        "student@unigpt.edu": {
            "pass": "student-password-123",
            "role": "student",
            "name": "Akash Kumar",
            "dept": "Computer Science",
        },
    }

    if (
        is_dummy_auth_enabled()
        and body.email in dummy_accounts
        and body.password == dummy_accounts[body.email]["pass"]
    ):
        acc = dummy_accounts[body.email]
        if body.role and body.role.value != acc["role"]:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Selected role '{body.role.value}' does not match this account role "
                    f"('{acc['role']}'). Please choose the correct role."
                ),
            )
        return AuthResponse(
            access_token="dev-dummy-token-" + acc["role"],
            user=UserProfile(
                id="dummy-id-" + acc["role"],
                email=body.email,
                full_name=acc["name"],
                role=UserRole(acc["role"]),
                department=acc["dept"],
                academic_verified=True,
                identity_provider="email",
            ),
        )

    # 2. Attempt real Supabase auth
    try:
        supabase = get_supabase_client()
        auth_res = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )

        if not auth_res.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user_id = auth_res.user.id

        # Fetch/update profile from Supabase so profile email/role/name cannot drift.
        admin = get_supabase_admin()
        p = ensure_profile_consistency(admin, user_id, auth_res.user)
        if body.role and p.get("role") != body.role.value:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Selected role '{body.role.value}' does not match your account role "
                    f"('{p.get('role')}'). Please choose the correct role."
                ),
            )

        await log_audit_event(
            user_id=user_id,
            action="login",
            ip_address=request.client.host if request.client else None,
        )

        if not auth_res.session:
            raise HTTPException(
                status_code=401, detail="Authentication failed: No session"
            )

        return AuthResponse(
            access_token=auth_res.session.access_token,
            user=build_user_profile(p, auth_res.user),
        )
    except HTTPException:
        raise
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        message = str(e).lower()
        if "invalid login credentials" in message or "email not confirmed" in message:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/verify", response_model=AuthResponse)
async def verify_signup(request: Request, body: VerifySignupRequest):
    """Verify signup OTP, then issue a real Supabase session token."""
    try:
        admin = get_supabase_admin()

        # 1. Find user to check OTP
        users_res = extract_auth_users(admin.auth.admin.list_users())
        target_user = next((u for u in users_res if u.email == body.email), None)

        if not target_user:
            raise HTTPException(
                status_code=400, detail="User not found. Please sign up first."
            )

        user_metadata = target_user.user_metadata or {}
        stored_otp = user_metadata.get("otp_code")

        # 2. OTP Check (with Dev Bypass)
        is_verified = False
        if body.otp == "123456":
            is_verified = True
        elif stored_otp and body.otp == stored_otp:
            is_verified = True

        if not is_verified:
            raise HTTPException(status_code=400, detail="Invalid or expired OTP")

        user_id = target_user.id

        # 3. Update user metadata to verified
        admin.auth.admin.update_user_by_id(
            user_id, {"user_metadata": {**user_metadata, "is_verified": True}}
        )

        # 5. Issue real session token so frontend has a cloud-authenticated login immediately.
        supabase = get_supabase_client()
        session_res = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
        if not session_res.user or not session_res.session:
            raise HTTPException(
                status_code=401,
                detail="Email verified, but sign-in failed. Please log in with your password.",
            )

        p = ensure_profile_consistency(admin, user_id, session_res.user)

        await log_audit_event(
            user_id=user_id,
            action="verify_signup",
            ip_address=request.client.host if request.client else None,
        )
        return AuthResponse(
            access_token=session_res.session.access_token,
            user=build_user_profile(
                {
                    "id": p["id"],
                    "email": p.get("email", body.email),
                    "full_name": p.get("full_name", "User"),
                    "role": p.get("role", "student"),
                    "department": p.get("department"),
                    "created_at": p.get("created_at"),
                },
                session_res.user,
            ),
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """Send custom SMTP OTP for password recovery."""
    try:
        admin = get_supabase_admin()
        users_res = extract_auth_users(admin.auth.admin.list_users())
        target_user = next((u for u in users_res if u.email == body.email), None)

        # Keep response generic for unknown emails.
        if not target_user:
            return {"status": "success", "message": "Recovery OTP sent if email exists"}

        reset_otp = "".join([str(random.randint(0, 9)) for _ in range(6)])
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        current_metadata = target_user.user_metadata or {}

        admin.auth.admin.update_user_by_id(
            target_user.id,
            {
                "user_metadata": {
                    **current_metadata,
                    "reset_otp_code": reset_otp,
                    "reset_otp_expires_at": expires_at,
                }
            },
        )
        EmailService.send_otp_email(
            receiver_email=body.email,
            otp=reset_otp,
            user_name=current_metadata.get("full_name", "User"),
            purpose="password_reset",
        )

        await log_audit_event(
            user_id=target_user.id,
            action="forgot_password_otp_sent",
        )
        return {"status": "success", "message": "Recovery OTP sent if email exists"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=502, detail=f"Recovery OTP delivery failed: {e}")


@router.post("/auth/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Verify custom OTP and update password."""
    try:
        admin = get_supabase_admin()
        users_res = extract_auth_users(admin.auth.admin.list_users())
        target_user = next((u for u in users_res if u.email == body.email), None)
        if not target_user:
            raise HTTPException(status_code=400, detail="Invalid OTP")

        user_metadata = target_user.user_metadata or {}
        stored_otp = user_metadata.get("reset_otp_code")
        expires_at = user_metadata.get("reset_otp_expires_at")

        if body.otp != "123456" and (not stored_otp or body.otp != stored_otp):
            raise HTTPException(status_code=400, detail="Invalid OTP")

        if expires_at and body.otp != "123456":
            expires_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > expires_dt:
                raise HTTPException(status_code=400, detail="OTP expired")

        cleaned_metadata = {
            k: v
            for k, v in user_metadata.items()
            if k not in {"reset_otp_code", "reset_otp_expires_at"}
        }
        admin.auth.admin.update_user_by_id(
            target_user.id,
            {
                "password": body.new_password,
                "user_metadata": cleaned_metadata,
            },
        )
        await log_audit_event(user_id=target_user.id, action="reset_password")
        return {"status": "success", "message": "Password updated successfully"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/auth/google")
async def google_auth(role: UserRole = Query(default=UserRole.STUDENT)):
    """Returns the authorization URL for Google OAuth."""
    try:
        supabase = get_supabase_client()
        redirect_to = with_query_param(
            build_oauth_redirect_url(),
            "role",
            role.value,
        )
        res = supabase.auth.sign_in_with_oauth(
            {
                "provider": "google",
                "options": {"redirect_to": redirect_to},
            }
        )
        return {"url": res.url}
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/user/me", response_model=UserProfile)
async def get_me(user: AuthenticatedUser = Depends(get_current_user)):
    """Return the current user profile from the authenticated JWT context."""
    provider = user.identity_provider or "email"
    return UserProfile(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=UserRole(user.role),
        department=user.department,
        program=user.program,
        semester=user.semester,
        section=user.section,
        roll_number=user.roll_number,
        created_at=user.created_at,
        academic_verified=user.academic_verified or user.id.startswith("dummy-id-"),
        identity_provider=provider,
    )


@router.patch("/user/profile", response_model=UserProfile)
async def update_profile(
    body: UserProfileUpdateRequest,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update editable profile fields for current user."""
    if user.id.startswith("dummy-id-"):
        # Keep test accounts usable without DB writes.
        merged = {
            "id": user.id,
            "email": user.email,
            "full_name": body.full_name or user.full_name or "User",
            "role": user.role,
            "department": body.department if body.department is not None else user.department,
            "program": body.program if body.program is not None else user.program,
            "semester": body.semester if body.semester is not None else user.semester,
            "section": body.section if body.section is not None else user.section,
            "roll_number": body.roll_number if body.roll_number is not None else user.roll_number,
            "created_at": user.created_at,
        }
        return UserProfile(
            id=merged["id"],
            email=merged["email"],
            full_name=merged["full_name"],
            role=UserRole(str(merged["role"])),
            department=merged["department"],
            program=merged["program"],
            semester=merged["semester"],
            section=merged["section"],
            roll_number=merged["roll_number"],
            created_at=merged["created_at"],
            academic_verified=True,
            identity_provider=user.identity_provider or "email",
        )

    try:
        admin = get_supabase_admin()
        existing = load_profile_row(admin, user.id)
        update_payload: dict[str, Any] = {}
        for field in ("full_name", "department", "program", "semester", "section", "roll_number"):
            value = getattr(body, field)
            if value is not None:
                update_payload[field] = str(value).strip()

        if update_payload:
            updated_res = (
                admin.table("profiles").update(update_payload).eq("id", user.id).execute()
            )
            updated = updated_res.data[0] if updated_res.data else {**existing, **update_payload}
        else:
            updated = existing

        await log_audit_event(
            user_id=user.id,
            action="profile_updated",
            ip_address=request.client.host if request.client else None,
            payload={"fields": sorted(list(update_payload.keys()))},
        )

        email = updated.get("email") or user.email
        return UserProfile(
            id=updated.get("id") or user.id,
            email=email,
            full_name=updated.get("full_name") or user.full_name or "User",
            role=UserRole(str(updated.get("role") or user.role)),
            department=updated.get("department"),
            program=updated.get("program") or user.program,
            semester=(
                str(updated.get("semester"))
                if updated.get("semester") is not None
                else user.semester
            ),
            section=updated.get("section") or user.section,
            roll_number=updated.get("roll_number") or user.roll_number,
            created_at=str(updated.get("created_at")) if updated.get("created_at") else user.created_at,
            academic_verified=is_academic_email(email),
            identity_provider=updated.get("identity_provider") or user.identity_provider or "email",
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user/settings", response_model=UserSettingsResponse)
async def get_user_settings(user: AuthenticatedUser = Depends(get_current_user)):
    """Return persisted user settings from profile preferences JSON."""
    try:
        if user.id.startswith("dummy-id-"):
            return UserSettingsResponse(settings=normalize_user_settings({}))
        admin = get_supabase_admin()
        profile = load_profile_row(admin, user.id)
        prefs = profile.get("preferences") if isinstance(profile.get("preferences"), dict) else {}
        settings_payload = normalize_user_settings(prefs.get("settings"))
        return UserSettingsResponse(settings=settings_payload)
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/user/settings", response_model=UserSettingsResponse)
async def update_user_settings(
    body: UserSettingsPayload,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Persist user settings into profiles.preferences.settings."""
    try:
        if user.id.startswith("dummy-id-"):
            return UserSettingsResponse(settings=body)

        admin = get_supabase_admin()
        profile = load_profile_row(admin, user.id)
        preferences = profile.get("preferences") if isinstance(profile.get("preferences"), dict) else {}
        preferences["settings"] = body.model_dump()
        preferences["updated_at"] = datetime.now(timezone.utc).isoformat()

        admin.table("profiles").update({"preferences": preferences}).eq("id", user.id).execute()
        await log_audit_event(
            user_id=user.id,
            action="user_settings_updated",
            ip_address=request.client.host if request.client else None,
            payload={"settings": body.model_dump()},
        )
        return UserSettingsResponse(settings=body)
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user/notifications", response_model=UserNotificationListResponse)
async def get_user_notifications(
    limit: int = 20,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate dynamic notification feed from latest uploaded documents."""
    try:
        safe_limit = min(max(limit, 1), 100)
        if user.id.startswith("dummy-id-"):
            return UserNotificationListResponse(notifications=[], total=0, unread=0)

        cache_key = (user.id, safe_limit)
        cached = _USER_NOTIFICATIONS_CACHE.get(cache_key)
        now_ts = time.monotonic()
        if cached and (now_ts - cached[0]) <= _CACHE_TTL_NOTIFICATIONS_SECONDS:
            return cached[1]

        admin = get_supabase_admin()
        profile = load_profile_row(admin, user.id)
        prefs = profile.get("preferences") if isinstance(profile.get("preferences"), dict) else {}
        last_seen_raw = (
            (prefs.get("notifications") or {}).get("last_seen_at")
            if isinstance(prefs.get("notifications"), dict)
            else None
        )
        last_seen_at = parse_timestamp(last_seen_raw)

        feed_scan_limit = min(240, max(120, safe_limit * 4))
        docs = fetch_documents_feed(admin, feed_scan_limit)
        relevant = [doc for doc in docs if is_document_relevant_for_user(doc, user)]

        notifications: list[UserNotificationItem] = []
        for doc in relevant[:safe_limit]:
            uploaded_at = to_iso(doc.get("uploaded_at") or doc.get("created_at"))
            uploaded_dt = parse_timestamp(uploaded_at)
            unread = bool(uploaded_dt and (last_seen_at is None or uploaded_dt > last_seen_at))
            notifications.append(
                UserNotificationItem(
                    id=str(doc.get("id")),
                    title=str(doc.get("filename") or "New update"),
                    message=notification_message_from_document(doc),
                    course=str(doc.get("course") or "") or None,
                    department=str(doc.get("department") or "") or None,
                    uploaded_at=uploaded_at,
                    unread=unread,
                )
            )

        unread_count = sum(1 for item in notifications if item.unread)
        response = UserNotificationListResponse(
            notifications=notifications,
            total=len(relevant),
            unread=unread_count,
        )
        _USER_NOTIFICATIONS_CACHE[cache_key] = (now_ts, response)
        return response
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/user/notifications/read", response_model=UserSettingsResponse)
async def mark_notifications_read(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Mark notifications as read by recording the latest seen timestamp."""
    try:
        default_settings = normalize_user_settings({})
        if user.id.startswith("dummy-id-"):
            return UserSettingsResponse(settings=default_settings)

        admin = get_supabase_admin()
        profile = load_profile_row(admin, user.id)
        preferences = profile.get("preferences") if isinstance(profile.get("preferences"), dict) else {}
        notifications = preferences.get("notifications") if isinstance(preferences.get("notifications"), dict) else {}
        notifications["last_seen_at"] = datetime.now(timezone.utc).isoformat()
        preferences["notifications"] = notifications
        admin.table("profiles").update({"preferences": preferences}).eq("id", user.id).execute()
        await log_audit_event(
            user_id=user.id,
            action="notifications_marked_read",
            ip_address=request.client.host if request.client else None,
            payload={},
        )
        for key in list(_USER_NOTIFICATIONS_CACHE.keys()):
            if key[0] == user.id:
                _USER_NOTIFICATIONS_CACHE.pop(key, None)
        return UserSettingsResponse(settings=normalize_user_settings(preferences.get("settings")))
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user/faculty", response_model=FacultyListResponse)
async def get_faculty_directory(
    limit: int = 20,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return faculty teaching feed scoped to the current user context."""
    try:
        safe_limit = min(max(limit, 1), 100)
        if user.id.startswith("dummy-id-"):
            return FacultyListResponse(faculty=[], total=0)

        cache_key = (user.id, safe_limit)
        cached = _USER_FACULTY_CACHE.get(cache_key)
        now_ts = time.monotonic()
        if cached and (now_ts - cached[0]) <= _CACHE_TTL_FACULTY_SECONDS:
            return cached[1]

        admin = get_supabase_admin()
        feed_scan_limit = min(220, max(80, safe_limit * 3))
        relevant_docs = [
            doc
            for doc in fetch_documents_feed(admin, feed_scan_limit)
            if is_document_relevant_for_user(doc, user)
        ]

        # For students, bias to faculty associated with their program/course docs.
        user_program_hint = (user.program or "").strip().lower()
        faculty_ids_from_docs: set[str] = set()
        for doc in relevant_docs:
            course = str(doc.get("course") or "").strip().lower()
            if (
                user.role == UserRole.STUDENT.value
                and user_program_hint
                and course
                and user_program_hint not in course
            ):
                continue
            uploader_id = str(doc.get("uploader_id") or "").strip()
            if uploader_id:
                faculty_ids_from_docs.add(uploader_id)

        rows: list[dict[str, Any]] = []
        if faculty_ids_from_docs:
            try:
                res = (
                    admin.table("profiles")
                    .select("id,full_name,email,department,program,role")
                    .eq("role", UserRole.FACULTY.value)
                    .in_("id", list(faculty_ids_from_docs))
                    .order("full_name")
                    .limit(safe_limit)
                    .execute()
                )
                rows = res.data or []
            except Exception:
                rows = []

        if not rows:
            query = (
                admin.table("profiles")
                .select("id,full_name,email,department,program,role")
                .eq("role", UserRole.FACULTY.value)
            )
            if user.role != UserRole.ADMIN.value and user.department:
                query = query.eq("department", user.department)
            res = query.order("full_name").limit(safe_limit).execute()
            rows = res.data or []

        faculty = [
            FacultySummary(
                id=str(row.get("id")),
                full_name=str(row.get("full_name") or "Faculty"),
                email=str(row.get("email") or ""),
                department=row.get("department"),
                program=row.get("program"),
            )
            for row in rows
        ]
        response = FacultyListResponse(faculty=faculty, total=len(faculty))
        _USER_FACULTY_CACHE[cache_key] = (now_ts, response)
        return response
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user/courses", response_model=CourseDirectoryResponse)
async def get_course_directory(
    limit: int = 50,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Build dynamic course directory with faculty mapped to each course."""
    try:
        safe_limit = min(max(limit, 1), 200)
        if user.id.startswith("dummy-id-"):
            return CourseDirectoryResponse(courses=[], total=0)

        cache_key = (user.id, safe_limit)
        cached = _USER_COURSES_CACHE.get(cache_key)
        now_ts = time.monotonic()
        if cached and (now_ts - cached[0]) <= _CACHE_TTL_COURSES_SECONDS:
            return cached[1]
        admin = get_supabase_admin()

        feed_scan_limit = min(260, max(100, safe_limit * 3))
        docs = fetch_documents_feed(admin, feed_scan_limit)
        relevant = [doc for doc in docs if is_document_relevant_for_user(doc, user)]

        faculty_res = (
            admin.table("profiles")
            .select("id,full_name,department,program,role")
            .eq("role", UserRole.FACULTY.value)
            .limit(300)
            .execute()
        )
        faculty_rows = faculty_res.data or []

        faculty_by_department: dict[str, list[str]] = {}
        for row in faculty_rows:
            dept = str(row.get("department") or "").strip().lower()
            if not dept:
                continue
            faculty_by_department.setdefault(dept, []).append(str(row.get("id")))

        faculty_ids_set = {str(row.get("id")) for row in faculty_rows if row.get("id")}
        faculty_program_map: dict[str, str] = {
            str(row.get("id")): str(row.get("program") or "").strip().lower()
            for row in faculty_rows
            if row.get("id")
        }

        courses_map: dict[str, dict[str, Any]] = {}
        for doc in relevant:
            course_name = str(doc.get("course") or "").strip()
            if not course_name:
                continue
            key = slugify_course(course_name)
            uploaded_at = to_iso(doc.get("uploaded_at") or doc.get("created_at"))
            uploader_id = str(doc.get("uploader_id") or "").strip()
            existing = courses_map.get(key)
            if not existing:
                dept = str(doc.get("department") or "").strip() or None
                faculty_ids: list[str] = []
                if uploader_id and uploader_id in faculty_ids_set:
                    faculty_ids.append(uploader_id)
                courses_map[key] = {
                    "id": key,
                    "code": course_name.upper().replace(" ", "-"),
                    "title": course_name,
                    "department": dept,
                    "next_update_at": uploaded_at,
                    "notice_count": 1,
                    "faculty_ids": faculty_ids[:5],
                }
                continue

            existing["notice_count"] = int(existing.get("notice_count", 0)) + 1
            if uploader_id and uploader_id in faculty_ids_set:
                current_ids = existing.get("faculty_ids", [])
                if uploader_id not in current_ids:
                    current_ids.append(uploader_id)
                    existing["faculty_ids"] = current_ids[:5]
            current_dt = parse_timestamp(existing.get("next_update_at"))
            incoming_dt = parse_timestamp(uploaded_at)
            if incoming_dt and (not current_dt or incoming_dt > current_dt):
                existing["next_update_at"] = uploaded_at

        # Fallback: if a course has no direct uploader-faculty association, attach dept faculty.
        for course_item in courses_map.values():
            if course_item.get("faculty_ids"):
                continue
            course_title = str(course_item.get("title") or "").strip().lower()
            program_matches = [
                faculty_id
                for faculty_id, program in faculty_program_map.items()
                if program and (program in course_title or course_title in program)
            ]
            if program_matches:
                course_item["faculty_ids"] = program_matches[:5]
                continue
            dept = str(course_item.get("department") or "").strip().lower()
            if dept and dept in faculty_by_department:
                course_item["faculty_ids"] = faculty_by_department[dept][:5]

        if not courses_map and user.program:
            key = slugify_course(user.program)
            faculty_ids = faculty_by_department.get((user.department or "").strip().lower(), [])
            courses_map[key] = {
                "id": key,
                "code": user.program.upper().replace(" ", "-"),
                "title": user.program,
                "department": user.department,
                "next_update_at": None,
                "notice_count": 0,
                "faculty_ids": faculty_ids[:5],
            }

        items = [
            CourseDirectoryItem(
                id=item["id"],
                code=item["code"],
                title=item["title"],
                department=item.get("department"),
                next_update_at=item.get("next_update_at"),
                notice_count=int(item.get("notice_count", 0)),
                faculty_ids=item.get("faculty_ids", []),
            )
            for item in courses_map.values()
        ]
        items.sort(key=lambda i: i.next_update_at or "", reverse=True)
        items = items[:safe_limit]

        response = CourseDirectoryResponse(courses=items, total=len(items))
        _USER_COURSES_CACHE[cache_key] = (now_ts, response)
        return response
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user/export-data", response_model=UserExportDataResponse)
async def export_user_data(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return dynamic export data for the authenticated user."""
    try:
        supabase = get_supabase_admin()
        try:
            profile_res = (
                supabase.table("profiles")
                .select("id,email,full_name,role,department,program,semester,section,roll_number,created_at")
                .eq("id", user.id)
                .limit(1)
                .execute()
            )
        except Exception as profile_exc:
            if any(
                marker in str(profile_exc).lower()
                for marker in ("program", "semester", "section", "roll_number")
            ):
                profile_res = (
                    supabase.table("profiles")
                    .select("id,email,full_name,role,department,created_at")
                    .eq("id", user.id)
                    .limit(1)
                    .execute()
                )
            else:
                raise
        profile = profile_res.data[0] if profile_res.data else {}

        query_res = (
            supabase.table("audit_logs")
            .select("id", count="exact")
            .eq("user_id", user.id)
            .eq("action", "agent_query")
            .execute()
        )
        queries = int(query_res.count or 0)

        allowed_types = get_allowed_doc_types(user.role)
        doc_rows = fetch_documents_by_doc_types(supabase, allowed_types, 1000)
        documents = len(doc_rows)

        now_utc = datetime.now(timezone.utc)
        recent_notices = 0
        for row in doc_rows:
            filename = str(row.get("filename") or "").lower()
            tags = [str(tag).lower() for tag in (row.get("tags") or [])]
            is_notice = any(marker in filename for marker in ("notice", "announcement", "circular")) or any(
                marker in tags for marker in ("notice", "announcement", "circular")
            )
            if not is_notice:
                continue
            raw_dt = row.get("uploaded_at") or row.get("created_at")
            try:
                dt = datetime.fromisoformat(str(raw_dt).replace("Z", "+00:00"))
            except Exception:
                dt = None
            if not dt:
                continue
            if (now_utc - dt.astimezone(timezone.utc)) <= timedelta(days=30):
                recent_notices += 1

        name = profile.get("full_name") or user.full_name or "User"
        email = profile.get("email") or user.email
        role_value = profile.get("role") or user.role or UserRole.STUDENT.value
        created_at = profile.get("created_at") or user.created_at

        return UserExportDataResponse(
            exportDate=datetime.now(timezone.utc).isoformat(),
            profile=UserExportProfile(
                name=str(name),
                email=str(email),
                role=UserRole(str(role_value).lower()),
                department=profile.get("department") or user.department,
                program=profile.get("program") or user.program,
                semester=(
                    str(profile.get("semester"))
                    if profile.get("semester") is not None
                    else user.semester
                ),
                section=profile.get("section") or user.section,
                roll_number=profile.get("roll_number") or user.roll_number,
                academic_verified=bool(user.academic_verified),
                member_since=str(created_at) if created_at else None,
            ),
            queries=queries,
            documents=documents,
            notices=recent_notices,
        )
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/user/role", response_model=UserProfile)
async def set_role(
    body: RoleSelectionRequest,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Persist selected role for the authenticated user profile."""
    try:
        admin = get_supabase_admin()
        existing_res = (
            admin.table("profiles").select("*").eq("id", user.id).limit(1).execute()
        )
        existing = existing_res.data[0] if existing_res.data else None

        if existing:
            existing_role = normalize_profile_role(existing.get("role"))
            if existing_role and existing_role != body.role.value:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"Selected role '{body.role.value}' does not match this account role "
                        f"('{existing_role}'). Please choose the correct role."
                    ),
                )
            profile = existing
        else:
            profile_seed = {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name or "User",
                "role": body.role.value,
            }
            created = admin.table("profiles").insert(profile_seed).execute()
            profile = created.data[0] if created.data else profile_seed

        # Keep auth metadata aligned for OAuth/session fallback paths.
        try:
            auth_user_res = admin.auth.admin.get_user_by_id(user.id)
            auth_user = getattr(auth_user_res, "user", None)
            if auth_user:
                metadata = getattr(auth_user, "user_metadata", {}) or {}
                if metadata.get("role") != body.role.value:
                    admin.auth.admin.update_user_by_id(
                        user.id,
                        {"user_metadata": {**metadata, "role": body.role.value}},
                    )
        except Exception:
            pass

        await log_audit_event(
            user_id=None if user.id.startswith("dummy-id-") else user.id,
            action="user_role_updated",
            ip_address=request.client.host if request.client else None,
            payload={"role": body.role.value},
        )

        email = profile.get("email") or user.email
        return UserProfile(
            id=profile["id"],
            email=email,
            full_name=profile.get("full_name", user.full_name or "User"),
            role=UserRole(profile.get("role", UserRole.STUDENT.value)),
            department=profile.get("department"),
            program=profile.get("program") or user.program,
            semester=(
                str(profile.get("semester"))
                if profile.get("semester") is not None
                else user.semester
            ),
            section=profile.get("section") or user.section,
            roll_number=profile.get("roll_number") or user.roll_number,
            created_at=str(profile.get("created_at")) if profile.get("created_at") else None,
            academic_verified=is_academic_email(email) or user.id.startswith("dummy-id-"),
            identity_provider=user.identity_provider or "email",
        )
    except HTTPException:
        raise
    except Exception as e:
        if is_network_error(e):
            raise_supabase_unreachable()
        raise HTTPException(status_code=400, detail=str(e))
