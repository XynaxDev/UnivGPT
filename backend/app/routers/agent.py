"""
Agent Router
Hybrid: Supabase (Chat History) + Pinecone (Search).
"""

from fastapi import APIRouter, HTTPException, Depends
import httpx

from app.models.schemas import (
    AgentQueryRequest, AgentQueryResponse,
    AgentAppealRequest, AgentAppealResponse,
    ConversationResponse, ConversationListResponse, UserRole
)
from app.config import settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.services.agent_pipeline import (
    run_agent_pipeline,
    get_user_moderation_state,
    submit_user_moderation_appeal,
    moderation_meta_from_state,
)
from app.services.supabase_client import get_supabase_admin
from app.services.audit import log_audit_event

router = APIRouter(tags=["Agent"])

def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    if isinstance(exc, httpx.RequestError):
        return True
    return "getaddrinfo failed" in message or "name or service not known" in message or "nodename nor servname provided" in message

@router.post("/agent/query", response_model=AgentQueryResponse)
async def agent_query(
    body: AgentQueryRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        return await run_agent_pipeline(
            query=body.query,
            user_id=user.id,
            user_role=user.role,
            conversation_id=body.conversation_id,
            context=body.context,
            user_profile={
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "department": user.department,
                "program": user.program,
                "semester": user.semester,
                "section": user.section,
                "roll_number": user.roll_number,
            },
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


@router.get("/agent/moderation-state")
async def get_moderation_state(
    user: AuthenticatedUser = Depends(get_current_user),
):
    supabase = None if settings.supabase_offline_mode else get_supabase_admin()
    state = get_user_moderation_state(supabase, user.id)
    return {"moderation": moderation_meta_from_state(state)}


@router.post("/agent/appeal", response_model=AgentAppealResponse)
async def submit_appeal(
    body: AgentAppealRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    if settings.supabase_offline_mode:
        raise HTTPException(status_code=503, detail="Appeal submission unavailable in offline mode.")
    supabase = get_supabase_admin()
    try:
        state = submit_user_moderation_appeal(
            supabase=supabase,
            user_id=user.id,
            appeal_message=body.message,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if is_network_error(exc):
            raise HTTPException(status_code=503, detail="Cannot reach Supabase right now. Please retry.")
        raise

    await log_audit_event(
        user_id=None if user.id.startswith("dummy-id-") else user.id,
        action="moderation_appeal_submitted",
        payload={"message_preview": body.message[:140]},
    )

    return AgentAppealResponse(
        message="Apology appeal submitted successfully. The Dean section will review your request.",
        moderation=moderation_meta_from_state(state),
    )
