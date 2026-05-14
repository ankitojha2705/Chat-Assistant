import time

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.cache import get_cached, make_cache_key, set_cached
from app.core.database import get_db
from app.models.schemas import QueryResponse, TextQueryRequest
from app.services import llm, rag

router = APIRouter(prefix="/text", tags=["text"])


@router.post("/query", response_model=QueryResponse)
async def text_query(
    body: TextQueryRequest,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueryResponse:
    start = time.monotonic()

    cache_key = make_cache_key(body.query, user.groups)
    cached = await get_cached(cache_key)
    if cached:
        return QueryResponse(**cached, cache_hit=True)

    chunks, citations = await rag.retrieve(body.query, user.groups, db)

    if not chunks:
        return QueryResponse(
            answer="I don't have that information in our internal documents.",
            citations=[],
            cache_hit=False,
            latency_ms=int((time.monotonic() - start) * 1000),
        )

    answer, used_citations = await llm.generate(body.query, chunks, citations)
    response = QueryResponse(
        answer=answer,
        citations=used_citations,
        cache_hit=False,
        latency_ms=int((time.monotonic() - start) * 1000),
    )
    await set_cached(cache_key, response.model_dump(exclude={"cache_hit"}))
    return response
