"""Build the AI SDK model used by the CLI."""

import hashlib
import json
import os
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import ai
from ai.providers.openai import OpenAIChatCompletionsProtocol


DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
MODEL_CATALOG_CACHE_SECONDS = 180
_MODEL_CATALOG_CACHE: dict[
    tuple[str, str], tuple[float, list[dict[str, str]]]
] = {}
_MODEL_CATALOG_CACHE_LOCK = threading.Lock()


def _fetch_model_catalog(base_url: str, api_key: str | None) -> list[dict[str, str]]:
    """Fetch model IDs and display names from an OpenAI-compatible /models API."""
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    request = Request(f"{base_url.rstrip('/')}/models", headers=headers)
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (
        HTTPError,
        URLError,
        TimeoutError,
        UnicodeDecodeError,
        json.JSONDecodeError,
    ) as error:
        raise RuntimeError(
            f"Could not discover models from {base_url}: {error}"
        ) from error

    models = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(models, list):
        raise RuntimeError("The model endpoint returned an invalid /models response.")
    catalog = []
    for item in models:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if not isinstance(model_id, str) or not model_id:
            continue
        name = item.get("name") or item.get("display_name") or model_id
        entry = {
            "id": model_id,
            "name": name if isinstance(name, str) else model_id,
        }
        aliases = item.get("aliases")
        alias = None
        if isinstance(aliases, list):
            alias = next(
                (
                    value.strip()
                    for value in aliases
                    if isinstance(value, str) and value.strip()
                ),
                None,
            )
        alias = alias or item.get("alias")
        if isinstance(alias, str) and alias.strip():
            entry["alias"] = alias.strip()
        catalog.append(entry)
    if not catalog:
        raise RuntimeError("The model endpoint did not return any model IDs.")
    return catalog


def discover_model_catalog(
    base_url: str,
    api_key: str | None,
) -> list[dict[str, str]]:
    """Read the model catalog cache, refreshing it every three minutes."""
    credential_fingerprint = hashlib.sha256((api_key or "").encode("utf-8")).hexdigest()
    cache_key = (base_url, credential_fingerprint)
    with _MODEL_CATALOG_CACHE_LOCK:
        cached = _MODEL_CATALOG_CACHE.get(cache_key)
        if cached and time.monotonic() - cached[0] < MODEL_CATALOG_CACHE_SECONDS:
            return [dict(model) for model in cached[1]]
        catalog = _fetch_model_catalog(base_url, api_key)
        _MODEL_CATALOG_CACHE[cache_key] = (time.monotonic(), catalog)
        return [dict(model) for model in catalog]


def discover_models(base_url: str, api_key: str | None) -> list[str]:
    """Read model IDs from an OpenAI-compatible endpoint's /models API."""
    return [model["id"] for model in discover_model_catalog(base_url, api_key)]


def create_model(
    model_id: str | None = None,
    *,
    base_url: str | None = None,
    api_key: str | None = None,
) -> ai.Model:
    """Configure a direct OpenAI-compatible model endpoint."""
    api_key = api_key or os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY must be set in the environment or .env file."
        )

    base_url = base_url or os.getenv("GROQ_BASE_URL", DEFAULT_BASE_URL)
    selected_model = model_id or os.getenv("GROQ_MODEL")
    if not selected_model or selected_model.lower() == "auto":
        selected_model = discover_models(base_url, api_key)[0]

    return create_compatible_model(
        base_url=base_url,
        api_key=api_key,
        model_id=selected_model,
    )


def create_compatible_model(
    *,
    base_url: str,
    api_key: str | None,
    model_id: str,
) -> ai.Model:
    """Create a model for a user-supplied OpenAI-compatible endpoint."""
    provider = ai.get_provider(
        "openai",
        base_url=base_url,
        api_key=api_key or "not-needed",
        # OpenAI-compatible endpoints such as llama.cpp and Groq implement
        # Chat Completions. The OpenAI provider name otherwise selects the
        # newer Responses API, which can reject persisted multi-turn history.
        protocol=OpenAIChatCompletionsProtocol(),
    )
    return ai.Model(
        id=model_id,
        provider=provider,
    )


def create_fallback_model() -> ai.Model | None:
    """Configure an optional fallback model from explicit environment settings."""
    base_url = os.getenv("MYAGENT_FALLBACK_BASE_URL")
    api_key = os.getenv("MYAGENT_FALLBACK_API_KEY")
    model_id = os.getenv("MYAGENT_FALLBACK_MODEL")
    configured = (base_url, api_key, model_id)
    if not any(configured):
        return None
    if not all(configured):
        raise RuntimeError(
            "MYAGENT_FALLBACK_BASE_URL, MYAGENT_FALLBACK_API_KEY, and "
            "MYAGENT_FALLBACK_MODEL must all be set."
        )
    return create_model(
        model_id,
        base_url=base_url,
        api_key=api_key,
    )
