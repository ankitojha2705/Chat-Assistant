import time

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.cache import get_cached, make_cache_key, set_cached
from app.core.database import get_db
from app.models.schemas import QueryResponse
from app.services import llm, rag, stt

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/query", response_model=QueryResponse)
async def voice_query(
    audio: UploadFile = File(..., description="Audio file (WebM, WAV, MP3)"),
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueryResponse:
    start = time.monotonic()

    audio_bytes = await audio.read()
    transcript = await stt.transcribe(audio_bytes, audio.filename or "audio.webm")

    cache_key = make_cache_key(transcript, user.groups)
    cached = await get_cached(cache_key)
    if cached:
        return QueryResponse(**cached, transcript=transcript, cache_hit=True)

    chunks, citations = await rag.retrieve(transcript, user.groups, db)

    if not chunks:
        return QueryResponse(
            answer="I don't have that information in our internal documents.",
            citations=[],
            transcript=transcript,
            cache_hit=False,
            latency_ms=int((time.monotonic() - start) * 1000),
        )

    answer, used_citations = await llm.generate(transcript, chunks, citations)
    response = QueryResponse(
        answer=answer,
        citations=used_citations,
        transcript=transcript,
        cache_hit=False,
        latency_ms=int((time.monotonic() - start) * 1000),
    )
    await set_cached(cache_key, response.model_dump(exclude={"transcript", "cache_hit"}))
    return response
