"""
Agent Router
Hybrid: Supabase (Chat History) + Pinecone (Search).
"""

from fastapi import APIRouter, HTTPException, Depends
import httpx

from app.models.schemas import (
    AgentQueryRequest, AgentQueryResponse,
    ConversationResponse, ConversationListResponse, UserRole
)
from app.config import settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.services.agent_pipeline import run_agent_pipeline
from app.services.supabase_client import get_supabase_admin

router = APIRouter(tags=["Agent"])

def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    if isinstance(exc, httpx.RequestError):
        return True
    return "getaddrinfo failed" in message or "name or service not known" in message or "nodename nor servname provided" in message

def get_primary_academic_domain() -> str:
    domains = [
        value.strip().lower().lstrip("@")
        for value in (settings.academic_email_domains or "").split(",")
        if value.strip()
    ]
    return domains[0] if domains else "yourcollege.edu"

@router.post("/agent/query", response_model=AgentQueryResponse)
async def agent_query(
    body: AgentQueryRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    # Keep strict verification for student-facing query access.
    # Admin/faculty should not be blocked from operational assistant usage.
    should_enforce_verification = user.role == UserRole.STUDENT.value
    access_verified = user.academic_verified

    if (
        settings.require_verified_academic_email_for_queries
        and should_enforce_verification
        and not user.id.startswith("dummy-id-")
        and not access_verified
    ):
        domain = get_primary_academic_domain()
        raise HTTPException(
            status_code=403,
            detail=(
                "Query access is locked for this account. Sign in using your academic email "
                f"(ending with @{domain}) to continue."
            ),
        )

    try:
        return await run_agent_pipeline(
            query=body.query,
            user_id=user.id,
            user_role=user.role,
            conversation_id=body.conversation_id,
            context=body.context,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/agent/history", response_model=ConversationListResponse)
async def get_history(user: AuthenticatedUser = Depends(get_current_user)):
    if settings.supabase_offline_mode:
        return ConversationListResponse(conversations=[], total=0)
    supabase = get_supabase_admin()
    try:
        res = supabase.table("conversations").select("*").eq("user_id", user.id).order("last_active", desc=True).execute()
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Cannot reach Supabase. Check SUPABASE_URL, DNS/VPN, or your internet connection.",
            )
        raise
    
    convs = [
        ConversationResponse(
            id=c["id"], title=c["title"], role=UserRole(c["role"]),
            messages=c.get("messages", []), last_active=str(c.get("last_active"))
        ) for c in res.data
    ]
    return ConversationListResponse(conversations=convs, total=len(convs))
