"""Build the AI SDK model used by the CLI."""

import os

import ai


DEFAULT_MODEL = "qwen/qwen3.8-27b"
DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"


def create_model(model_id: str | None = None) -> ai.Model:
    """Configure a direct OpenAI-compatible model endpoint."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY must be set in the environment or .env file."
        )

    provider = ai.get_provider(
        "openai",
        base_url=os.getenv("GROQ_BASE_URL", DEFAULT_BASE_URL),
        api_key=api_key,
    )
    return ai.Model(
        id=model_id or os.getenv("GROQ_MODEL", DEFAULT_MODEL),
        provider=provider,
    )
