from functools import lru_cache

from sentence_transformers import SentenceTransformer

MODEL_NAME = "intfloat/multilingual-e5-small"


@lru_cache(maxsize=1)
def get_model():
    return SentenceTransformer(MODEL_NAME, device="cpu")


def embed_query(text: str) -> list[float]:
    vector = get_model().encode(
        f"query: {text}",
        normalize_embeddings=True,
    )
    return vector.tolist()


def embed_documents(texts: list[str]) -> list[list[float]]:
    vectors = get_model().encode(
        [f"passage: {text}" for text in texts],
        normalize_embeddings=True,
    )
    return vectors.tolist()