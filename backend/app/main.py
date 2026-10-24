"""
Application entry point.
Registers routers, middleware, exception handlers, and creates DB tables on startup.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import engine, Base
from .errors import AppError, app_error_handler, generic_error_handler

# ── Import all models so SQLAlchemy registers them before create_all ──────────
from . import models  # noqa: F401

# ── Routers (imported lazily so missing files don't crash startup) ─────────────
from .routers import meetings, items, duplicates, members, dashboard

logger = logging.getLogger(__name__)
settings = get_settings()


# ═══════════════════════════════════════════════════════════════════════════════
# Lifespan (startup / shutdown)
# ═══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────────
    logger.info("Starting up Meeting-to-Execution Automation Agent...")

    # Create all tables (idempotent — safe to call on every startup)
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ensured.")

    # Start scheduler if enabled
    if settings.ENABLE_SCHEDULER:
        from .services.scheduler import start_scheduler
        start_scheduler()
        logger.info("APScheduler started.")

    yield

    # ── Shutdown ───────────────────────────────────────────────────────────────
    if settings.ENABLE_SCHEDULER:
        from .services.scheduler import stop_scheduler
        stop_scheduler()
        logger.info("APScheduler stopped.")

    logger.info("Shutting down.")


# ═══════════════════════════════════════════════════════════════════════════════
# App factory
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # open for development — restrict in production
    allow_credentials=False,       # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ────────────────────────────────────────────────────────
# Order matters: most specific first.
app.add_exception_handler(AppError, app_error_handler)

# Let FastAPI's own HTTPException pass through naturally (404, 405, etc.)
# Only catch truly unexpected non-HTTP exceptions as a last resort.
@app.exception_handler(Exception)
async def _catch_all(request, exc):
    # Re-raise HTTPException so FastAPI handles it normally
    if isinstance(exc, HTTPException):
        raise exc
    return await generic_error_handler(request, exc)

# Pydantic validation errors → consistent shape
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed.",
                "details": exc.errors(),
            }
        },
    )

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(meetings.router,   tags=["Meetings"])
app.include_router(items.router,      tags=["Items"])
app.include_router(duplicates.router, tags=["Duplicates"])
app.include_router(members.router,    tags=["Members"])
app.include_router(dashboard.router,  tags=["Dashboard"])

# ── Logging config ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
