"""Protección CSRF para la sesión en cookie.

La cookie ya va con SameSite=Lax (no se envía en peticiones POST de otros sitios). Además, toda
petición que modifica datos debe venir de un origen de APP_ORIGINS: si trae Origin, se comprueba;
si no lo trae pero lleva la cookie de sesión, se exige un Referer de un origen permitido.
"""

from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.sessions import COOKIE_NAME

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _origin_of(url: str) -> str | None:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else None


def is_allowed(request: Request) -> bool:
    if request.method not in UNSAFE_METHODS:
        return True
    allowed = get_settings().app_origins_list
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/") in allowed
    if COOKIE_NAME not in request.cookies:
        return True  # sin cookie no hay sesión que aprovechar (p. ej. curl a /api/auth/login)
    referer = request.headers.get("referer")
    return bool(referer) and _origin_of(referer) in allowed


def register_csrf_protection(app: FastAPI) -> None:
    @app.middleware("http")
    async def check_origin(request: Request, call_next):
        if not is_allowed(request):
            return JSONResponse(status_code=403, content={"detail": "Origen no permitido"})
        return await call_next(request)
