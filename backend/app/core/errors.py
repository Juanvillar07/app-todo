"""Errores de dominio que lanzan los servicios; main.py los traduce a respuestas HTTP."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    status_code = 400

    def __init__(self, detail: str):
        self.detail = detail


class NotFoundError(AppError):
    status_code = 404


class ConflictError(AppError):
    status_code = 409


class BadRequestError(AppError):
    status_code = 400


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
