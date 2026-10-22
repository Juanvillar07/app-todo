"""Verificación del email de la cuenta.

Al registrarse con email y contraseña se envía {APP_URL}/verify-email?token=…; al confirmar, la
cuenta queda con email_verified_at y se abre sesión. Sin verificar no se puede entrar: el login
responde 403 y las sesiones no valen (core/sessions.py). Las cuentas de Google llegan verificadas.
Mismo diseño de token que la recuperación de contraseña: aleatorio, de un solo uso, con caducidad
y solo su hash en la BD.
"""

import secrets
import uuid
from datetime import timedelta
from html import escape
from pathlib import Path
from string import Template

from sqlmodel import Session, delete, select

from app.core.config import get_settings
from app.core.email import send_email
from app.core.security import hash_token
from app.db import engine
from app.models import EmailVerification, User
from app.models.common import utcnow

# Un enlace por minuto como mucho por usuario (el botón "Reenviar" no sirve para inundar un buzón).
COOLDOWN = timedelta(seconds=60)

# HTML con estilos en línea (los clientes de correo ignoran <style>); $link y $hours.
VERIFY_TEMPLATE = Template(
    (Path(__file__).parents[1] / "templates" / "verify_email.html").read_text("utf-8")
)


def create_verification(db: Session, user: User) -> str | None:
    """Crea un enlace nuevo (anulando los anteriores) y devuelve el token en claro. None si la
    cuenta ya está verificada o si pidió uno hace menos de COOLDOWN."""
    if user.email_verified:
        return None
    now = utcnow()
    recent = db.exec(
        select(EmailVerification).where(
            EmailVerification.user_id == user.id, EmailVerification.created_at > now - COOLDOWN
        )
    ).first()
    if recent is not None:
        return None

    db.exec(delete(EmailVerification).where(EmailVerification.user_id == user.id))
    token = secrets.token_urlsafe(32)
    hours = get_settings().email_verification_hours
    db.add(
        EmailVerification(
            id=hash_token(token), user_id=user.id, expires_at=now + timedelta(hours=hours)
        )
    )
    db.commit()
    return token


def send_verification_link(user_id: uuid.UUID) -> None:
    """Tarea en segundo plano tras el registro. Abre su propia sesión de BD."""
    with Session(engine) as db:
        _send(db, db.get(User, user_id))


def resend_verification_link(email: str) -> None:
    """Tarea en segundo plano de "Reenviar enlace" (pública: se pide con el email, antes de poder
    entrar). La respuesta HTTP es la misma exista o no la cuenta."""
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == email.lower())).first()
        _send(db, user)


def _send(db: Session, user: User | None) -> None:
    if user is None or not user.is_active:
        return
    token = create_verification(db, user)
    if token is None:
        return
    recipient = user.email
    settings = get_settings()
    link = f"{settings.app_url.rstrip('/')}/verify-email?token={token}"
    subject, html, text = verification_email(link, settings.email_verification_hours)
    send_email(recipient, subject, html, text)


def find_valid_user(db: Session, token: str) -> User | None:
    """Usuario del enlace si el token existe, no ha caducado y la cuenta está activa. No lo gasta:
    sirve para que la página del enlace diga al abrirse si sigue valiendo."""
    verification = db.get(EmailVerification, hash_token(token))
    if verification is None or verification.expires_at <= utcnow():
        return None
    user = db.get(User, verification.user_id)
    if user is None or not user.is_active:
        return None
    return user


def verify_email(db: Session, token: str) -> User | None:
    """Marca el email como verificado si el token vale y anula los enlaces del usuario. None si
    el token no existe o ha caducado."""
    user = find_valid_user(db, token)
    if user is None:
        return None

    mark_verified(db, user)
    db.commit()
    db.refresh(user)
    return user


def mark_verified(db: Session, user: User) -> None:
    """Marca el email como verificado (sin commit) y borra sus enlaces pendientes."""
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
        db.add(user)
    db.exec(delete(EmailVerification).where(EmailVerification.user_id == user.id))


def verification_email(link: str, hours: int) -> tuple[str, str, str]:
    """Asunto, HTML y texto del correo."""
    subject = "Confirma tu email en Tareas"
    text = (
        "Hola:\n\n"
        "Gracias por crear tu cuenta en Tareas. Confirma que este email es tuyo:\n\n"
        f"{link}\n\n"
        f"El enlace caduca en {hours} horas.\n"
        "Si no creaste esta cuenta, ignora este correo.\n"
    )
    html = VERIFY_TEMPLATE.substitute(link=escape(link, quote=True), hours=hours)
    return subject, html, text
