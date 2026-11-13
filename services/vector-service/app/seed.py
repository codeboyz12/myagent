import os
import httpx
import json
from pathlib import Path

from app.embedding import MODEL_NAME, embed_documents

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
COLLECTION = "documents"

DATA_PATH = Path(__file__).with_name("documents.json")


def load_documents():
    with DATA_PATH.open(encoding="utf-8-sig") as file:
        documents = json.load(file)

    if not isinstance(documents, list) or not documents:
        raise ValueError("documents.json must contain a non-empty list")

    ids = set()

    for item in documents:
        if not isinstance(item, dict):
            raise ValueError("Each document must be an object")

        document_id = item.get("id")
        text = item.get("text")
        metadata = item.get("metadata")

        if type(document_id) is not int or not 1 <= document_id <= 18446744073709551615:
            raise ValueError("Each document id must be a positive integer")

        if document_id in ids:
            raise ValueError(f"Duplicate document id: {document_id}")

        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"Document {document_id} must have non-empty text")

        if not isinstance(metadata, dict):
            raise ValueError(f"Document {document_id} must have metadata")

        ids.add(document_id)

    return documents


def main():
    documents = load_documents()
    
    print("Loading model and embedding documents...", flush=True)
    vectors = embed_documents([item["text"] for item in documents])
    vector_size = len(vectors[0])

    with httpx.Client(base_url=QDRANT_URL, timeout=60.0) as client:
        response = client.get(f"/collections/{COLLECTION}")

        if response.status_code == 404:
            response = client.put(
                f"/collections/{COLLECTION}",
                json={
                    "vectors": {
                        "size": vector_size,
                        "distance": "Cosine",
                    }
                },
            )
            response.raise_for_status()
            print(f"Created collection: {COLLECTION}")
        else:
            response.raise_for_status()
            config = response.json()["result"]["config"]["params"]["vectors"]

            if (
                config.get("size") != vector_size
                or config.get("distance") != "Cosine"
            ):
                raise RuntimeError(
                    "Existing collection has incompatible vector settings"
                )

        points = [
            {
                "id": item["id"],
                "vector": vector,
                "payload": {
                    "text": item["text"],
                    "metadata": item["metadata"],
                    "embedding_model": MODEL_NAME,
                },
            }
            for item, vector in zip(documents, vectors)
        ]

        response = client.put(
            f"/collections/{COLLECTION}/points",
            params={"wait": "true"},
            json={"points": points},
        )
        response.raise_for_status()

        response = client.post(
            f"/collections/{COLLECTION}/points/count",
            json={"exact": True},
        )
        response.raise_for_status()

        count = response.json()["result"]["count"]
        print(f"Upserted {len(points)} sample documents")
        print(f"Total points in collection: {count}")


if __name__ == "__main__":
    main()
