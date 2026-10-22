"""Recuperación de contraseña por correo.

Flujo: el usuario pide un enlace con su email → recibe {APP_URL}/reset-password?token=… → con ese
token pone una contraseña nueva. El token es aleatorio (256 bits), de un solo uso, caduca a los
PASSWORD_RESET_MINUTES y en la BD solo se guarda su hash. Las cuentas solo de Google también
pueden usarlo para crearse una contraseña: el correo prueba que son dueñas del email.
"""

import secrets
from datetime import timedelta
from html import escape
from pathlib import Path
from string import Template

from sqlmodel import Session, delete, select

from app.core.config import get_settings
from app.core.email import send_email
from app.core.security import hash_password, hash_token
from app.core.sessions import delete_user_sessions
from app.db import engine
from app.models import PasswordReset, User
from app.models.common import utcnow
from app.services.email_verification import mark_verified
from app.services.users import get_by_email

# Un enlace por minuto como mucho por usuario: evita usar el formulario para inundar un buzón.
COOLDOWN = timedelta(seconds=60)

# HTML con estilos en línea (los clientes de correo ignoran <style>); $link y $minutes.
RESET_TEMPLATE = Template(
    (Path(__file__).parents[1] / "templates" / "password_reset.html").read_text("utf-8")
)


def request_reset(db: Session, email: str) -> tuple[User, str] | None:
    """Crea un enlace nuevo (anulando los anteriores) y devuelve el usuario y el token en claro.
    None si no hay cuenta activa con ese email o si ya pidió uno hace menos de COOLDOWN."""
    user = get_by_email(db, email)
    if user is None or not user.is_active:
        return None

    now = utcnow()
    recent = db.exec(
        select(PasswordReset).where(
            PasswordReset.user_id == user.id, PasswordReset.created_at > now - COOLDOWN
        )
    ).first()
    if recent is not None:
        return None

    db.exec(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    token = secrets.token_urlsafe(32)
    minutes = get_settings().password_reset_minutes
    db.add(
        PasswordReset(
            id=hash_token(token), user_id=user.id, expires_at=now + timedelta(minutes=minutes)
        )
    )
    db.commit()
    return user, token


def send_reset_link(email: str) -> None:
    """Tarea en segundo plano de POST /auth/forgot-password. Abre su propia sesión de BD para que
    la respuesta HTTP tarde lo mismo exista o no la cuenta."""
    with Session(engine) as db:
        result = request_reset(db, email)
        if result is None:
            return
        user, token = result
        recipient = user.email  # leído con la sesión abierta (tras el commit se recarga)
    settings = get_settings()
    link = f"{settings.app_url.rstrip('/')}/reset-password?token={token}"
    subject, html, text = reset_email(link, settings.password_reset_minutes)
    send_email(recipient, subject, html, text)


def find_valid_user(db: Session, token: str) -> User | None:
    """Usuario del enlace si el token existe, no ha caducado y la cuenta está activa. No lo gasta:
    sirve para que la página del enlace diga al abrirse si sigue valiendo."""
    reset = db.get(PasswordReset, hash_token(token))
    if reset is None or reset.expires_at <= utcnow():
        return None
    user = db.get(User, reset.user_id)
    if user is None or not user.is_active:
        return None
    return user


def reset_password(db: Session, token: str, password: str) -> User | None:
    """Pone la contraseña nueva si el token es válido. Anula todos los enlaces del usuario y cierra
    todas sus sesiones. None si el token no existe o ha caducado."""
    user = find_valid_user(db, token)
    if user is None:
        return None

    user.hashed_password = hash_password(password)
    db.add(user)
    db.exec(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    delete_user_sessions(db, user)
    mark_verified(db, user)  # el enlace llegó a su buzón: el email es suyo
    db.commit()
    db.refresh(user)
    return user


def reset_email(link: str, minutes: int) -> tuple[str, str, str]:
    """Asunto, HTML y texto del correo."""
    subject = "Crea una contraseña nueva para Tareas"
    text = (
        "Hola:\n\n"
        "Recibimos una solicitud para crear una contraseña nueva para tu cuenta de Tareas.\n\n"
        f"Ábrela aquí: {link}\n\n"
        f"El enlace caduca en {minutes} minutos y solo se puede usar una vez.\n"
        "Si no lo pediste tú, ignora este correo: tu contraseña no cambiará.\n"
    )
    html = RESET_TEMPLATE.substitute(link=escape(link, quote=True), minutes=minutes)
    return subject, html, text
