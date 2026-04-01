"""
UnivGPT API - Main Application
Updated for Supabase + Pinecone Hybrid Stack.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import asyncio

from app.config import settings
from app.routers import auth, documents, agent, admin
from app.models.schemas import HealthResponse
from app.services.pinecone_client import pinecone_client
from app.services.document_processor import get_embeddings_model
from app.services.demo_directory_seed import ensure_demo_directory_seed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("unigpt")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
uvicorn_access_logger = logging.getLogger("uvicorn.access")
uvicorn_access_logger.setLevel(logging.WARNING)
uvicorn_access_logger.propagate = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("UnivGPT Hybrid API starting...")
    pinecone_client.initialize()
    if settings.seed_demo_directory_data:
        try:
            logger.info("Ensuring demo faculty/course seed data...")
            await asyncio.to_thread(ensure_demo_directory_seed)
        except Exception as exc:
            logger.warning("Demo seed step failed and was skipped: %s", exc)
    if settings.preload_embeddings_on_startup and not settings.mock_llm:
        try:
            logger.info("Preloading embedding model during startup...")
            await asyncio.to_thread(get_embeddings_model)
            logger.info("Embedding model preloaded.")
        except Exception as exc:
            logger.warning(
                "Embedding preload failed; model will load lazily on first embedding call: %s",
                exc,
            )
    yield
    logger.info("UnivGPT Hybrid API shutting down...")


app = FastAPI(title="UnivGPT", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(agent.router)
app.include_router(admin.router)


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", environment=settings.environment)
