# Copyright (c) 2026 XynaxDev
# Contact: akashkumar.cs27@gmail.com

import asyncio
import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402


def _provider_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = [
        {
            "label": "intent",
            "provider": "OpenRouter",
            "model": (settings.openrouter_intent_model or "").strip(),
            "base_url": (settings.openrouter_base_url or "").strip().rstrip("/"),
            "token": (settings.openrouter_api_key or "").strip(),
            "endpoint": "/chat/completions",
        },
        {
            "label": "generation_primary",
            "provider": "Generation model",
            "model": (settings.ollama_generation_model or "").strip(),
            "base_url": (settings.ollama_base_url or "").strip().rstrip("/"),
            "token": (settings.ollama_api_key or "").strip(),
            "endpoint": "/v1/chat/completions",
        },
    ]
    for fallback_model in settings.openrouter_generation_fallback_models_list:
        rows.append(
            {
                "label": f"generation_fallback:{fallback_model}",
                "provider": "OpenRouter fallback",
                "model": fallback_model.strip(),
                "base_url": (settings.openrouter_base_url or "").strip().rstrip("/"),
                "token": (settings.openrouter_api_key or "").strip(),
                "endpoint": "/chat/completions",
            }
        )
    return rows


async def _check_provider(row: dict[str, str]) -> dict[str, str]:
    missing = []
    if not row["model"]:
        missing.append("model")
    if not row["base_url"]:
        missing.append("base_url")
    if not row["token"]:
        missing.append("api_key")
    if missing:
        return {
            "label": row["label"],
            "provider": row["provider"],
            "status": "config_incomplete",
            "details": f"Missing: {', '.join(missing)}",
        }

    payload = {
        "model": row["model"],
        "messages": [{"role": "user", "content": "Reply with OK only."}],
        "max_tokens": 12,
        "temperature": 0,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{row['base_url']}{row['endpoint']}",
                headers={
                    "Authorization": f"Bearer {row['token']}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            message = ((data.get("choices") or [{}])[0].get("message") or {})
            content = message.get("content")
            if isinstance(content, list):
                parts = []
                for block in content:
                    if isinstance(block, dict) and isinstance(block.get("text"), str):
                        parts.append(block["text"])
                content = "\n".join(parts).strip()
            return {
                "label": row["label"],
                "provider": row["provider"],
                "status": "ok",
                "details": str(content or "").strip()[:120] or "Connected successfully.",
            }
    except httpx.HTTPStatusError as exc:
        body = ""
        try:
            body = exc.response.text[:240]
        except Exception:
            body = str(exc)
        return {
            "label": row["label"],
            "provider": row["provider"],
            "status": f"http_{exc.response.status_code}",
            "details": body or str(exc),
        }
    except Exception as exc:
        return {
            "label": row["label"],
            "provider": row["provider"],
            "status": "error",
            "details": str(exc),
        }


async def main() -> None:
    print("--- LLM Provider Diagnostics ---")
    rows = _provider_rows()
    results = await asyncio.gather(*[_check_provider(row) for row in rows])
    for result in results:
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
