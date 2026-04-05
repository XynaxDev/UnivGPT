# Copyright (c) 2026 XynaxDev
# Contact: akashkumar.cs27@gmail.com

"""
Audit Logging Service
Records significant user actions for monitoring in Supabase.
Audit writes are queued off the request path to keep API latency low.
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from app.config import settings
from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
_LAST_QUERY_PRUNE_MONO = 0.0

def is_network_error(exc: Exception) -> bool:
    message = str(exc).lower()
    if isinstance(exc, httpx.RequestError):
        return True
    return "getaddrinfo failed" in message or "name or service not known" in message or "nodename nor servname provided" in message

def _write_audit_event_sync(
    user_id: Optional[str],
    action: str,
    payload: dict | None = None,
    ip_address: Optional[str] = None,
) -> None:
    supabase = get_supabase_admin()
    record = {
        "user_id": user_id,
        "action": action,
        "payload": payload or {},
        "ip_address": ip_address,
    }
    try:
        supabase.table("audit_logs").insert(record).execute()
    except Exception as exc:
        message = str(exc).lower()
        missing_profile_fk = (
            user_id
            and ("audit_logs_user_id_fkey" in message or 'is not present in table "profiles"' in message)
        )
        if not missing_profile_fk:
            raise

        fallback_payload = dict(payload or {})
        fallback_payload.setdefault("original_user_id", user_id)
        supabase.table("audit_logs").insert(
            {
                "user_id": None,
                "action": action,
                "payload": fallback_payload,
                "ip_address": ip_address,
            }
        ).execute()


def _handle_audit_error(exc: Exception) -> None:
    if is_network_error(exc):
        logger.info("[AUDIT] Supabase unreachable. Skipping audit log.")
        return
    logger.error(f"[AUDIT] Error logging event to Supabase: {exc}")


def _prune_old_query_audits_sync() -> None:
    retention_days = max(1, int(getattr(settings, "audit_query_retention_days", 14) or 14))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    supabase = get_supabase_admin()
    (
        supabase.table("audit_logs")
        .delete()
        .eq("action", "agent_query")
        .lt("timestamp", cutoff)
        .execute()
    )


async def log_audit_event(
    user_id: Optional[str],
    action: str,
    payload: dict = None,
    ip_address: Optional[str] = None,
) -> None:
    if settings.supabase_offline_mode:
        logger.info("[AUDIT] Supabase offline mode enabled. Skipping audit log.")
        return

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # Fallback path for non-async contexts.
        try:
            _write_audit_event_sync(user_id, action, payload, ip_address)
        except Exception as exc:
            _handle_audit_error(exc)
        return

    async def _write():
        try:
            await asyncio.to_thread(
                _write_audit_event_sync,
                user_id,
                action,
                payload,
                ip_address,
            )
        except Exception as exc:
            _handle_audit_error(exc)

    loop.create_task(_write())

    # Keep noisy query logs bounded in storage.
    global _LAST_QUERY_PRUNE_MONO
    if action == "agent_query":
        now_mono = time.monotonic()
        min_interval = float(getattr(settings, "audit_prune_interval_seconds", 900) or 900)
        if (now_mono - _LAST_QUERY_PRUNE_MONO) >= max(30.0, min_interval):
            _LAST_QUERY_PRUNE_MONO = now_mono

            async def _prune():
                try:
                    await asyncio.to_thread(_prune_old_query_audits_sync)
                except Exception as exc:
                    _handle_audit_error(exc)

            loop.create_task(_prune())


