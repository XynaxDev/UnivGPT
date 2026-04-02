from typing import Any

def detect_local_moderation(query: str) -> dict[str, Any]:
    # Model-first moderation: intent extractor decides is_flagged/reason.
    # Keep this hook as a no-op extension point for emergency local rules.
    return {"is_flagged": False}
