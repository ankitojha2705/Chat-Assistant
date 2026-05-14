from typing import Optional

from pydantic import BaseModel


class Citation(BaseModel):
    id: int
    doc: str
    page: Optional[int] = None
    section: Optional[str] = None
    snippet: str


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    transcript: Optional[str] = None  # populated for voice queries
    cache_hit: bool = False
    latency_ms: int


class TextQueryRequest(BaseModel):
    query: str
    session_id: Optional[str] = None


class IngestResponse(BaseModel):
    job_id: str
    status: str
    filename: str


class JobStatus(BaseModel):
    job_id: str
    status: str  # processing | indexed | error
    chunk_count: Optional[int] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    redis: bool
    database: bool
