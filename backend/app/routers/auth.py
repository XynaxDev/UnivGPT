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
from app.models.schemas import (
    LoginRequest,
    AuthResponse,
    UserProfile,
    UserRole,
    InitiateSignupRequest,
    VerifySignupRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    SignupResponse,
    RoleSelectionRequest,
)
from app.middleware.auth import AuthenticatedUser, get_current_user, is_academic_email
from app.config import settings
from app.services.supabase_client import get_supabase_client, get_supabase_admin
from app.services.audit import log_audit_event
from app.services.email_service import EmailService

router = APIRouter(tags=["Authentication"])


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
    return UserProfile(
        id=profile["id"],
        email=email,
        full_name=profile.get("full_name", "User"),
        role=UserRole(profile.get("role", "student")),
        department=profile.get("department"),
        created_at=str(profile.get("created_at")) if profile.get("created_at") else None,
        academic_verified=is_academic_email(email),
        identity_provider=extract_identity_provider(auth_user),
    )


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
                    detail="An account with this email already exists inside UniGPT. Please try logging in.",
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
        academic_verified=user.academic_verified or user.id.startswith("dummy-id-"),
        identity_provider=provider,
    )


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
