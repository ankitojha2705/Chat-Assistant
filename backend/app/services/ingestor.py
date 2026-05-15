import io
import logging
import uuid
from typing import Optional

import tiktoken
from openai import AsyncOpenAI, APIError, APITimeoutError
from sqlalchemy import update
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
from unstructured.partition.auto import partition

from app.core.config import settings
from app.core.database import AsyncSessionLocal, Document, DocumentChunk

_client = AsyncOpenAI(api_key=settings.openai_api_key)
_enc = tiktoken.get_encoding("cl100k_base")
logger = logging.getLogger(__name__)

_RETRY = dict(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception_type((APIError, APITimeoutError)),
    reraise=True,
)

CHUNK_SIZE = 512
CHUNK_OVERLAP = 50
EMBED_BATCH_SIZE = 100


def _split_text(text: str) -> list[str]:
    tokens = _enc.encode(text)
    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        end = min(start + CHUNK_SIZE, len(tokens))
        chunks.append(_enc.decode(tokens[start:end]))
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


@retry(**_RETRY)
async def _embed_batch(texts: list[str]) -> list[list[float]]:
    resp = await _client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
        dimensions=settings.embedding_dimensions,
    )
    return [item.embedding for item in resp.data]


def _mime_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "html": "text/html",
        "htm": "text/html",
        "txt": "text/plain",
        "md": "text/plain",
    }.get(ext, "application/octet-stream")


async def process_document(
    file_bytes: bytes,
    filename: str,
    doc_id: str,
    dept: str,
    sensitivity: str,
    allowed_groups: list[str],
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            elements = partition(
                file=io.BytesIO(file_bytes),
                content_type=_mime_type(filename),
            )

            records: list[dict] = []
            for element in elements:
                text = str(element).strip()
                if len(text) < 40:
                    continue
                page: Optional[int] = getattr(element.metadata, "page_number", None)
                section: Optional[str] = getattr(element.metadata, "category", None)
                for chunk_text in _split_text(text):
                    records.append({"text": chunk_text, "page": page, "section": section})

            # Embed in batches
            all_embeddings: list[list[float]] = []
            for i in range(0, len(records), EMBED_BATCH_SIZE):
                batch_texts = [r["text"] for r in records[i : i + EMBED_BATCH_SIZE]]
                all_embeddings.extend(await _embed_batch(batch_texts))

            for record, embedding in zip(records, all_embeddings):
                db.add(
                    DocumentChunk(
                        id=str(uuid.uuid4()),
                        doc_id=doc_id,
                        filename=filename,
                        page=record["page"],
                        section=record["section"],
                        content=record["text"],
                        embedding=embedding,
                        allowed_groups=allowed_groups,
                        dept=dept,
                        sensitivity=sensitivity,
                    )
                )

            await db.execute(
                update(Document)
                .where(Document.id == doc_id)
                .values(status="indexed", chunk_count=len(records))
            )
            await db.commit()

        except Exception:
            await db.execute(
                update(Document)
                .where(Document.id == doc_id)
                .values(status="error")
            )
            await db.commit()
            raise
