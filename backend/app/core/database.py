import uuid
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import text
from pgvector.sqlalchemy import Vector

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    dept = Column(String, default="general")
    sensitivity = Column(String, default="internal")
    status = Column(String, default="processing")  # processing | indexed | error
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    doc_id = Column(String, index=True, nullable=False)
    filename = Column(String, nullable=False)
    page = Column(Integer, nullable=True)
    section = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)
    allowed_groups = Column(ARRAY(String), default=list)
    dept = Column(String, default="general")
    sensitivity = Column(String, default="internal")


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        # GIN index for full-text search
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chunks_fts
            ON document_chunks
            USING gin(to_tsvector('english', content))
        """))
        # HNSW index for ANN vector search
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chunks_hnsw
            ON document_chunks
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """))
