from fastapi import APIRouter
from sqlalchemy import text

from app.core.cache import redis_client
from app.core.database import engine
from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    redis_ok = False
    db_ok = False

    try:
        await redis_client.ping()
        redis_ok = True
    except Exception:
        pass

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    return HealthResponse(status="ok", redis=redis_ok, database=db_ok)
