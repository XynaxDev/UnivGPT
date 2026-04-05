# Copyright (c) 2026 XynaxDev
# Contact: akashkumar.cs27@gmail.com

import re
from typing import Any


_PERSON_REFERENCE = re.compile(
    r"\b(?:dr|prof(?:essor)?|sir|madam|ma['â€™]?am|teacher|faculty|dean)\b",
    re.IGNORECASE,
)
_ROLE_GROUP_REFERENCE = re.compile(
    r"\b(?:faculty|faculties|teachers?|professors?|staff|students?|admins?|deans?)\b",
    re.IGNORECASE,
)
_TARGETED_PERSON_QUERY = re.compile(
    r"\bwhy\s+.{0,80}\b(?:dr|prof(?:essor)?|sir|madam|ma['â€™]?am|teacher|faculty|dean)\b.{0,30}\b(?:is|are|was|were)\b.{1,60}\??$",
    re.IGNORECASE,
)
_TARGETED_PERSON_STATEMENT = re.compile(
    r"\b(?:dr|prof(?:essor)?|sir|madam|ma['â€™]?am|teacher|faculty|dean)\b.{0,30}\b(?:is|are|was|were)\b.{1,60}$",
    re.IGNORECASE,
)
_DEGRADING_LANGUAGE = re.compile(
    r"\b(?:shit(?:ty)?|crap|trash|useless|garbage|pathetic|stupid|idiot(?:ic)?|worthless|piece\s+of\s+shit)\b",
    re.IGNORECASE,
)
_IDENTITY_TARGETING = re.compile(
    r"\b(?:gay|lesbian|bisexual|trans(?:gender)?|queer|homo(?:sexual)?)\b",
    re.IGNORECASE,
)
_GROUP_ATTACK_PATTERN = re.compile(
    r"\b(?:why\s+(?:my|the)\s+)?(?:faculty|faculties|teachers?|professors?|staff|students?|admins?|deans?)\b.{0,40}\b(?:is|are|was|were)\b.{0,50}\b(?:shit(?:ty)?|crap|trash|useless|garbage|pathetic|stupid|idiot(?:ic)?|worthless|piece\s+of\s+shit)\b",
    re.IGNORECASE,
)
_ACADEMIC_CONTEXT = re.compile(
    r"\b(?:course|class|lecture|syllabus|subject|exam|deadline|assignment|notice|policy|office\s*hours|department|semester|program|curriculum)\b",
    re.IGNORECASE,
)


def detect_local_moderation(query: str, *, strict: bool = False) -> dict[str, Any]:
    """
    Emergency local moderation fallback.
    Keep this narrow and provider-independent: it should only catch obvious
    targeted abuse or personal attacks when the model path misses or is unavailable.
    """
    text = str(query or "").strip()
    if not text:
        return {"is_flagged": False}

    has_person_reference = bool(_PERSON_REFERENCE.search(text))
    has_role_group_reference = bool(_ROLE_GROUP_REFERENCE.search(text))
    in_academic_context = bool(_ACADEMIC_CONTEXT.search(text))
    has_degrading_language = bool(_DEGRADING_LANGUAGE.search(text))
    identity_targeting = bool(_IDENTITY_TARGETING.search(text))

    high_confidence_targeting = bool(_TARGETED_PERSON_QUERY.search(text))
    medium_confidence_targeting = has_person_reference and bool(_TARGETED_PERSON_STATEMENT.search(text))
    role_group_attack = bool(_GROUP_ATTACK_PATTERN.search(text))

    if high_confidence_targeting and not in_academic_context:
        return {
            "is_flagged": True,
            "reason": "Targeted personal/identity-focused query about an individual.",
            "intent_type": "general",
            "target_entity": "general",
        }

    if strict and medium_confidence_targeting and not in_academic_context:
        return {
            "is_flagged": True,
            "reason": "Potentially abusive targeted statement about an individual.",
            "intent_type": "general",
            "target_entity": "general",
        }

    if strict and identity_targeting and (has_person_reference or high_confidence_targeting or medium_confidence_targeting) and not in_academic_context:
        return {
            "is_flagged": True,
            "reason": "Targeted personal or identity-focused query about an individual.",
            "intent_type": "general",
            "target_entity": "general",
        }

    if strict and role_group_attack:
        return {
            "is_flagged": True,
            "reason": "Abusive degrading language directed at a university role group.",
            "intent_type": "general",
            "target_entity": "general",
        }

    if strict and has_role_group_reference and has_degrading_language:
        return {
            "is_flagged": True,
            "reason": "Abusive degrading language directed at people in the university context.",
            "intent_type": "general",
            "target_entity": "general",
        }

    return {"is_flagged": False}


