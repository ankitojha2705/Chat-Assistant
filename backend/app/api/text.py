import time
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.limiter import limiter
from app.core.cache import get_cached, make_cache_key, set_cached
from app.core.database import ChatMessage, Conversation, get_db
from app.models.schemas import QueryResponse, TextQueryRequest
from app.services import llm, rag

router = APIRouter(prefix="/text", tags=["text"])


async def _get_or_create_conversation(
    conversation_id: str | None,
    user_id: str,
    first_message: str,
    db: AsyncSession,
) -> Conversation:
    if conversation_id:
        conv = await db.get(Conversation, conversation_id)
        if conv and conv.user_id == user_id:
            return conv

    # Auto-title from first 60 chars of the first message
    title = first_message[:60] + ("…" if len(first_message) > 60 else "")
    conv = Conversation(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
    )
    db.add(conv)
    return conv


async def _load_history(conversation_id: str, db: AsyncSession, limit: int = 20) -> list[dict]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    return [{"role": m.role, "content": m.content} for m in messages]


@router.post("/query", response_model=QueryResponse)
@limiter.limit("30/minute")
async def text_query(
    request: Request,
    body: TextQueryRequest,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueryResponse:
    start = time.monotonic()

    conv = await _get_or_create_conversation(
        body.conversation_id, user.sub, body.query, db
    )
    history = await _load_history(conv.id, db) if body.conversation_id else []

    # Use cache only for the very first message (no history yet)
    if not history:
        cache_key = make_cache_key(body.query, user.groups)
        cached = await get_cached(cache_key)
        if cached:
            cached.pop("conversation_id", None)
            cached.pop("cache_hit", None)
            # Still persist the exchange to DB
            db.add(ChatMessage(conversation_id=conv.id, role="user", content=body.query))
            db.add(ChatMessage(
                conversation_id=conv.id, role="assistant",
                content=cached["answer"], citations=cached.get("citations"),
            ))
            conv.updated_at = datetime.utcnow()
            await db.commit()
            return QueryResponse(**cached, conversation_id=conv.id, cache_hit=True)

    chunks, citations = await rag.retrieve(body.query, user.groups, db)

    if not chunks:
        answer, used_citations = "I don't have that information in our internal documents.", []
    else:
        answer, used_citations = await llm.generate(body.query, chunks, citations, history)

    # Persist both turns
    db.add(ChatMessage(conversation_id=conv.id, role="user", content=body.query))
    db.add(ChatMessage(
        conversation_id=conv.id,
        role="assistant",
        content=answer,
        citations=[c.model_dump() for c in used_citations],
    ))
    conv.updated_at = datetime.utcnow()
    await db.commit()

    response = QueryResponse(
        answer=answer,
        citations=used_citations,
        conversation_id=conv.id,
        cache_hit=False,
        latency_ms=int((time.monotonic() - start) * 1000),
    )

    if not history:
        await set_cached(
            make_cache_key(body.query, user.groups),
            response.model_dump(exclude={"conversation_id", "cache_hit"}),
        )

    return response
