"""Sesiones de login en BD con un token opaco en una cookie httpOnly.

El navegador nunca ve el token desde JavaScript (HttpOnly) y la BD solo guarda su hash, así que
una copia de la BD no sirve para suplantar sesiones. Las sesiones se pueden revocar (logout) y se
renuevan solas mientras se usan (caducidad deslizante).
"""

import secrets
from datetime import timedelta

from fastapi import Response
from sqlmodel import Session, delete

from app.core.config import get_settings
from app.core.security import hash_token
from app.models import User, UserSession
from app.models.common import utcnow

COOKIE_NAME = "tareas_session"


def _lifetime() -> timedelta:
    return timedelta(days=get_settings().session_days)


def create_session(db: Session, user: User) -> str:
    """Abre una sesión para el usuario y devuelve el token que va en la cookie."""
    now = utcnow()
    # De paso, limpia las sesiones caducadas de este usuario.
    db.exec(
        delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at <= now)
    )
    token = secrets.token_urlsafe(32)
    db.add(UserSession(id=hash_token(token), user_id=user.id, expires_at=now + _lifetime()))
    db.commit()
    return token


def get_session_user(db: Session, token: str) -> tuple[User, bool] | None:
    """Usuario de la sesión y si se ha renovado (hay que reenviar la cookie), o None si no vale."""
    session = db.get(UserSession, hash_token(token))
    now = utcnow()
    if session is None or session.expires_at <= now:
        return None
    user = db.get(User, session.user_id)
    # Sin email verificado no se entra (también invalida sesiones abiertas antes de exigirlo).
    if user is None or not user.is_active or not user.email_verified:
        return None

    # Renovación deslizante: cuando queda menos de la mitad de la vida, se alarga otra vez entera.
    renewed = session.expires_at - now < _lifetime() / 2
    if renewed:
        session.expires_at = now + _lifetime()
        db.add(session)
        db.commit()
    return user, renewed


def delete_session(db: Session, token: str) -> None:
    db.exec(delete(UserSession).where(UserSession.id == hash_token(token)))
    db.commit()


def delete_user_sessions(db: Session, user: User) -> None:
    db.exec(delete(UserSession).where(UserSession.user_id == user.id))


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(_lifetime().total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        COOKIE_NAME, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/"
    )
