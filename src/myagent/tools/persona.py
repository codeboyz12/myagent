import json
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[3]
PERSONA_DIR = PROJECT_DIR / "data" / "personas"


def get_persona(persona_id: str) -> str:
    """
    Retrieve a persona profile.
    """

    persona_path = PERSONA_DIR / f"{persona_id}.json"

    if not persona_path.is_file():
        return "No persona profile found."

    with open(persona_path, "r", encoding="utf-8") as f:
        persona = json.load(f)

    return json.dumps(
        persona,
        ensure_ascii=False,
        indent=2
    )


def update_persona(
    persona_id: str,
    field: str,
    value: str,
    confidence: str,
    evidence: str
) -> str:
    """
    Add or update a persona attribute.
    """

    allowed_fields = {
        "goals",
        "interests",
        "priorities",
        "preferences",
        "pain_points",
        "objections"
    }

    allowed_confidence = {
        "high",
        "medium",
        "low"
    }

    if field not in allowed_fields:
        return f"Error: unsupported field '{field}'."

    if confidence not in allowed_confidence:
        return "Error: confidence must be high, medium, or low."

    PERSONA_DIR.mkdir(parents=True, exist_ok=True)

    persona_path = PERSONA_DIR / f"{persona_id}.json"

    # Load existing profile or initialize a new one.
    if persona_path.is_file():
        with open(persona_path, "r", encoding="utf-8") as f:
            persona = json.load(f)
    else:
        persona = {
            "goals": [],
            "interests": [],
            "priorities": [],
            "preferences": [],
            "pain_points": [],
            "objections": []
        }

    entry = {
        "value": value,
        "confidence": confidence,
        "evidence": evidence
    }

    # Avoid duplicate entries.
    persona[field] = [
        item for item in persona[field]
        if item["value"] != value
    ]

    persona[field].append(entry)

    with open(persona_path, "w", encoding="utf-8") as f:
        json.dump(
            persona,
            f,
            ensure_ascii=False,
            indent=2
        )

    return f"Persona updated: {field} = {value}"
