"""Semantic document retrieval via the vector service."""

import os

import httpx


VECTOR_SERVICE_URL = os.getenv("VECTOR_SERVICE_URL", "http://localhost:8000")


def retrieve_documents(query: str, top_k: int = 3, score_threshold: float | None = None) -> str:
    payload: dict = {"query": query, "top_k": top_k}
    if score_threshold is not None:
        payload["score_threshold"] = score_threshold

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(f"{VECTOR_SERVICE_URL}/retrieve", json=payload)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        return f"Vector service error {exc.response.status_code}: {exc.response.text}"
    except httpx.RequestError as exc:
        return f"Cannot connect to vector service: {exc}"

    results = response.json().get("results", [])
    if not results:
        return "No documents found."

    lines = []
    for i, r in enumerate(results, 1):
        meta = r.get("metadata", {})
        lines.append(f"[{i}] score={r['score']:.3f} | {r['text']} | metadata={meta}")
    return "\n".join(lines)
