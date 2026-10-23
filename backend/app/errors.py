"""
Typed exceptions and consistent HTTP error response handling.

Every domain error is a subclass of AppError.
The global exception handler in main.py converts them to JSON:
  { "error": { "code": "...", "message": "...", "details": {...} } }
"""
from typing import Any, Dict, Optional
from fastapi import Request
from fastapi.responses import JSONResponse


# ═══════════════════════════════════════════════════════════════════════════════
# Base
# ═══════════════════════════════════════════════════════════════════════════════

class AppError(Exception):
    """Base class for all application errors."""
    http_status: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        code: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if code:
            self.code = code

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


# ═══════════════════════════════════════════════════════════════════════════════
# Domain errors
# ═══════════════════════════════════════════════════════════════════════════════

class NotFoundError(AppError):
    http_status = 404
    code = "NOT_FOUND"


class InvalidTransitionError(AppError):
    """Raised by the state machine when a transition is not allowed."""
    http_status = 409
    code = "INVALID_TRANSITION"


class ValidationError(AppError):
    """Domain-level validation failure (distinct from Pydantic's 422)."""
    http_status = 422
    code = "VALIDATION_ERROR"


class PipelineError(AppError):
    """AI extraction pipeline failure."""
    http_status = 500
    code = "PIPELINE_ERROR"


class IntegrationError(AppError):
    """Trello / Slack / external service failure."""
    http_status = 502
    code = "INTEGRATION_ERROR"


class GateError(AppError):
    """
    Raised when code attempts to push / notify for a non-APPROVED item.
    This should never reach the user normally — it means there is a bug.
    """
    http_status = 409
    code = "GATE_VIOLATION"


class DuplicateResolutionError(AppError):
    http_status = 409
    code = "DUPLICATE_RESOLUTION_ERROR"


# ═══════════════════════════════════════════════════════════════════════════════
# FastAPI exception handlers (register these in main.py)
# ═══════════════════════════════════════════════════════════════════════════════

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content=exc.to_dict())


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unexpected errors — never expose stack traces in production."""
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred.",
                "details": {},
            }
        },
    )
