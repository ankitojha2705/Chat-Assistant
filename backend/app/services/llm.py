import re
from typing import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import settings
from app.core.database import DocumentChunk
from app.models.schemas import Citation

_client = AsyncOpenAI(api_key=settings.openai_api_key)

_SYSTEM = """You are an internal knowledge assistant. Answer ONLY using the provided context.
For each factual claim, add a citation marker like [1], [2] referencing the source number.
If the context does not contain enough information to answer, say exactly:
"I don't have that information in our internal documents."
Do not speculate, invent facts, or use knowledge outside the provided context."""


def _build_context(chunks: list[DocumentChunk], citations: list[Citation]) -> str:
    parts = []
    for citation, chunk in zip(citations, chunks):
        header = f"[{citation.id}] Source: {chunk.filename}"
        if chunk.page:
            header += f", Page {chunk.page}"
        parts.append(f"{header}\n{chunk.content}")
    return "\n\n".join(parts)


async def generate(
    query: str,
    chunks: list[DocumentChunk],
    citations: list[Citation],
) -> tuple[str, list[Citation]]:
    context = _build_context(chunks, citations)
    user_message = f"CONTEXT:\n{context}\n\nQUESTION: {query}"

    response = await _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user_message},
        ],
        max_tokens=1024,
    )
    answer: str = response.choices[0].message.content or ""

    used_ids = {int(m) for m in re.findall(r"\[(\d+)\]", answer)}
    used_citations = [c for c in citations if c.id in used_ids]
    return answer, used_citations


async def generate_stream(
    query: str,
    chunks: list[DocumentChunk],
    citations: list[Citation],
) -> AsyncIterator[str]:
    """Yield answer tokens as Server-Sent Event data strings."""
    context = _build_context(chunks, citations)
    user_message = f"CONTEXT:\n{context}\n\nQUESTION: {query}"

    stream = await _client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user_message},
        ],
        max_tokens=1024,
        stream=True,
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content or ""
        if token:
            yield f"data: {token}\n\n"
