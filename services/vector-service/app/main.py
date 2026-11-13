import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Path
from pydantic import BaseModel, Field, field_validator

from app.embedding import embed_query

app = FastAPI(title="MyAgent Vector Service")

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
COLLECTION = "documents"


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    top_k: int = Field(default=3, ge=1, le=20)
    score_threshold: float | None = Field(default=None, ge=-1.0, le=1.0)

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query must not be blank")
        return value


class SearchResult(BaseModel):
    id: int | str
    text: str
    score: float
    metadata: dict[str, Any]


class RetrieveResponse(BaseModel):
    query: str
    results: list[SearchResult]


@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{QDRANT_URL}/collections")
            response.raise_for_status()

        return {"status": "ok", "qdrant": "connected"}

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to Qdrant",
        ) from exc


@app.post("/retrieve", response_model=RetrieveResponse)
def retrieve(request: RetrieveRequest):
    vector = embed_query(request.query)

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{QDRANT_URL}/collections/{COLLECTION}/points/query",
                json={
                    "query": vector,
                    "limit": request.top_k,
                    "score_threshold": request.score_threshold,
                    "with_payload": True,
                    "with_vector": False,
                },
            )
            response.raise_for_status()

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(
                status_code=503,
                detail="Documents collection not found. Run app.seed first.",
            ) from exc

        raise HTTPException(
            status_code=502,
            detail="Qdrant rejected the search request",
        ) from exc

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to Qdrant",
        ) from exc

    points = response.json()["result"]["points"]

    return RetrieveResponse(
        query=request.query,
        results=[
            SearchResult(
                id=point["id"],
                text=point["payload"]["text"],
                score=point["score"],
                metadata=point["payload"]["metadata"],
            )
            for point in points
        ],
    )

@app.delete("/documents/{document_id}")
def delete_document(document_id: int = Path(ge=1, le=18446744073709551615)):
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{QDRANT_URL}/collections/{COLLECTION}/points/delete",
                params={"wait": "true"},
                json={"points": [document_id]},
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(
                status_code=503,
                detail="Documents collection not found. Run app.seed first.",
            ) from exc
        raise HTTPException(status_code=502, detail="Qdrant rejected the delete request") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Cannot connect to Qdrant") from exc

    return {"status": "ok", "id": document_id}
