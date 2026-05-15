import asyncio
import logging

from openai import AsyncOpenAI, APIError, APITimeoutError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.core.database import DocumentChunk
from app.models.schemas import Citation

_client = AsyncOpenAI(api_key=settings.openai_api_key)
logger = logging.getLogger(__name__)

_RETRY = dict(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception_type((APIError, APITimeoutError)),
    reraise=True,
)


@retry(**_RETRY)
async def _embed(query: str) -> list[float]:
    resp = await _client.embeddings.create(
        model=settings.embedding_model,
        input=query,
        dimensions=settings.embedding_dimensions,
    )
    return resp.data[0].embedding


async def _dense_search(
    embedding: list[float], user_groups: list[str], db: AsyncSession, limit: int = 20
) -> list[DocumentChunk]:
    result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.allowed_groups.overlap(user_groups))
        .order_by(DocumentChunk.embedding.cosine_distance(embedding))
        .limit(limit)
    )
    return list(result.scalars().all())


async def _sparse_search(
    query: str, user_groups: list[str], db: AsyncSession, limit: int = 20
) -> list[str]:
    rows = await db.execute(
        text("""
            SELECT id
            FROM document_chunks
            WHERE allowed_groups && :groups
              AND to_tsvector('english', content) @@ plainto_tsquery('english', :query)
            ORDER BY ts_rank(
                to_tsvector('english', content),
                plainto_tsquery('english', :query)
            ) DESC
            LIMIT :limit
        """),
        {"groups": user_groups, "query": query, "limit": limit},
    )
    return [row[0] for row in rows]


def _reciprocal_rank_fusion(
    dense: list[DocumentChunk], sparse_ids: list[str], k: int = 60
) -> dict[str, float]:
    scores: dict[str, float] = {}
    for rank, chunk in enumerate(dense):
        scores[chunk.id] = scores.get(chunk.id, 0.0) + 1.0 / (k + rank + 1)
    for rank, cid in enumerate(sparse_ids):
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
    return scores


async def retrieve(
    query: str,
    user_groups: list[str],
    db: AsyncSession,
    top_k: int = 5,
) -> tuple[list[DocumentChunk], list[Citation]]:
    embedding, sparse_ids = await asyncio.gather(
        _embed(query),
        _sparse_search(query, user_groups, db),
    )

    dense_chunks = await _dense_search(embedding, user_groups, db)
    scores = _reciprocal_rank_fusion(dense_chunks, sparse_ids)

    # Fetch any sparse-only chunks not already in dense results
    dense_ids = {c.id for c in dense_chunks}
    extra_ids = [cid for cid in sparse_ids if cid not in dense_ids]
    if extra_ids:
        extra = await db.execute(
            select(DocumentChunk).where(DocumentChunk.id.in_(extra_ids))
        )
        all_chunks = dense_chunks + list(extra.scalars().all())
    else:
        all_chunks = dense_chunks

    all_chunks.sort(key=lambda c: scores.get(c.id, 0.0), reverse=True)
    top = all_chunks[:top_k]

    citations = [
        Citation(
            id=i + 1,
            doc=c.filename,
            page=c.page,
            section=c.section,
            snippet=c.content[:250],
        )
        for i, c in enumerate(top)
    ]
    return top, citations
