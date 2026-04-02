import re
from typing import Any

_LOCAL_PROFANITY_PATTERNS = [
    re.compile(r"\bsh+i+t+\b", re.IGNORECASE),
    re.compile(r"\bf+u+c+k+\b", re.IGNORECASE),
    re.compile(r"\bb+i+t+c+h+\b", re.IGNORECASE),
    re.compile(r"\bb+a+s+t+a+r+d+\b", re.IGNORECASE),
    re.compile(r"\ba+s+s+h+o+l+e+\b", re.IGNORECASE),
    re.compile(r"\bm+o+t+h+e+r+f+u+c+k+e+r+\b", re.IGNORECASE),
    re.compile(r"\bmf+\b", re.IGNORECASE),
]


def _normalize_for_moderation(raw: str) -> str:
    text = (raw or "").lower()
    leet_map = str.maketrans({
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
        "!": "i",
    })
    text = text.translate(leet_map)
    text = re.sub(r"[^a-z\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _contains_profanity(text: str) -> bool:
    if not text:
        return False
    return any(pattern.search(text) for pattern in _LOCAL_PROFANITY_PATTERNS)


def detect_local_moderation(query: str) -> dict[str, Any]:
    normalized = _normalize_for_moderation(query or "")
    # Keep local moderation minimal and deterministic.
    # Rich harassment/disrespect detection is model-driven in extract_query_intent().
    if _contains_profanity(normalized):
        return {
            "is_flagged": True,
            "reason": "Abusive or profane language detected.",
            "intent_type": "general",
            "target_entity": "general",
        }
    return {"is_flagged": False}

