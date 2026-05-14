import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.database import Document, get_db
from app.models.schemas import IngestResponse, JobStatus
from app.services.ingestor import process_document

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {"pdf", "docx", "pptx", "html", "htm", "txt", "md"}


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    dept: str = Form(default="general"),
    sensitivity: str = Form(default="internal"),
    allowed_groups: str = Form(default="all", description="Comma-separated group names"),
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    if _ext(file.filename or "") not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {ALLOWED_EXTENSIONS}")

    file_bytes = await file.read()
    doc_id = str(uuid.uuid4())
    groups = [g.strip() for g in allowed_groups.split(",") if g.strip()]
    if "all" not in groups:
        groups.append("all")

    doc = Document(
        id=doc_id,
        filename=file.filename,
        dept=dept,
        sensitivity=sensitivity,
        status="processing",
        created_at=datetime.utcnow(),
    )
    db.add(doc)
    await db.commit()

    background_tasks.add_task(
        process_document,
        file_bytes,
        file.filename,
        doc_id,
        dept,
        sensitivity,
        groups,
    )
    return IngestResponse(job_id=doc_id, status="processing", filename=file.filename or "")


@router.get("/status/{job_id}", response_model=JobStatus)
async def get_status(
    job_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobStatus:
    result = await db.execute(select(Document).where(Document.id == job_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatus(job_id=job_id, status=doc.status, chunk_count=doc.chunk_count)
