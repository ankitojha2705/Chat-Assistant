from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.core.telemetry import setup_telemetry
from app.api import health, ingest, text, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Internal Voice Chatbot",
    description="Voice-enabled RAG chatbot for internal documents",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_telemetry(app)

app.include_router(health.router)
app.include_router(voice.router)
app.include_router(text.router)
app.include_router(ingest.router)
