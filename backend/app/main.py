import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import init_db
from app.core.limiter import limiter
from app.core.logging_config import setup_logging
from app.core.telemetry import setup_telemetry
from app.api import conversations, health, ingest, text, voice

setup_logging(level="DEBUG" if settings.debug else "INFO")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", extra={"event": "startup", "debug": settings.debug})
    await init_db()
    yield
    logger.info("shutdown", extra={"event": "shutdown"})


app = FastAPI(
    title="Internal Voice Chatbot",
    description="Voice-enabled RAG chatbot for internal documents",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Rate limiting ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Prometheus metrics at GET /metrics ────────────────────────────────────────
Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    excluded_handlers=["/health", "/metrics"],
).instrument(app).expose(app)

# ── OpenTelemetry (no-op if otel_endpoint not set) ────────────────────────────
setup_telemetry(app)

# ── Global error handler — never expose tracebacks to clients ─────────────────
@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "unhandled_exception",
        exc_info=exc,
        extra={"path": str(request.url.path), "method": request.method},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(voice.router)
app.include_router(text.router)
app.include_router(ingest.router)
app.include_router(conversations.router)
