"""Recuperación de contraseña por correo (enlace con token de un solo uso)."""

import re
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlmodel import Session, select

from app.core.sessions import COOKIE_NAME
from app.db import engine
from app.models import PasswordReset, UserSession
from app.services import password_reset
from tests.conftest import google_credential, login, register


@pytest.fixture
def outbox(monkeypatch) -> list[dict]:
    """Sustituye el envío por Resend: guarda los correos en una lista."""
    sent: list[dict] = []

    def fake_send(to: str, subject: str, html: str, text: str) -> None:
        sent.append({"to": to, "subject": subject, "html": html, "text": text})

    monkeypatch.setattr(password_reset, "send_email", fake_send)
    return sent


def forgot(client, email: str = "ana@example.com"):
    return client.post("/api/auth/forgot-password", json={"email": email})


def reset(client, token: str, password: str = "nueva-clave-1"):
    return client.post("/api/auth/reset-password", json={"token": token, "password": password})


def token_from(mail: dict) -> str:
    link = re.search(r"https?://\S+/reset-password\?token=\S+", mail["text"]).group(0)
    return parse_qs(urlsplit(link).query)["token"][0]


def test_unknown_email_gets_same_response_and_no_mail(client, outbox):
    r = forgot(client, "nadie@example.com")
    assert r.status_code == 202
    assert outbox == []


def test_known_email_receives_link(client, outbox):
    register(client)
    client.cookies.clear()

    r = forgot(client, "Ana@Example.com")
    assert r.status_code == 202
    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["to"] == "ana@example.com"
    assert "http://localhost:5173/reset-password?token=" in mail["text"]
    token = token_from(mail)
    assert token in mail["html"]

    # En la BD solo queda el hash del token.
    with Session(engine) as db:
        stored = db.exec(select(PasswordReset)).one()
    assert stored.id != token


def test_reset_changes_password(client, outbox):
    register(client)
    client.cookies.clear()
    forgot(client)

    r = reset(client, token_from(outbox[0]))
    assert r.status_code == 204
    assert login(client).status_code == 401
    assert login(client, password="nueva-clave-1").status_code == 200


def test_reset_revokes_all_sessions(client, outbox):
    register(client)  # deja una sesión abierta en este cliente
    assert client.get("/api/users/me").status_code == 200
    forgot(client)

    r = reset(client, token_from(outbox[0]))
    assert r.status_code == 204
    # Limpia la cookie de este navegador.
    assert r.headers["set-cookie"].startswith(f"{COOKIE_NAME}=")
    assert "Max-Age=0" in r.headers["set-cookie"]

    with Session(engine) as db:
        assert db.exec(select(UserSession)).first() is None
        assert db.exec(select(PasswordReset)).first() is None


def test_old_session_token_no_longer_works(client, outbox):
    register(client)
    old_token = client.cookies[COOKIE_NAME]
    forgot(client)
    reset(client, token_from(outbox[0]))

    client.cookies.set(COOKIE_NAME, old_token)
    assert client.get("/api/users/me").status_code == 401


def test_token_is_single_use(client, outbox):
    register(client)
    forgot(client)
    token = token_from(outbox[0])

    assert reset(client, token).status_code == 204
    r = reset(client, token, "otra-clave-2")
    assert r.status_code == 400
    assert r.json()["detail"] == "El enlace no es válido o ha caducado"


def test_invalid_token(client):
    assert reset(client, "inventado").status_code == 400


def test_expired_token(client, outbox):
    register(client)
    forgot(client)
    with Session(engine) as db:
        stored = db.exec(select(PasswordReset)).one()
        stored.expires_at -= timedelta(hours=2)
        db.add(stored)
        db.commit()

    assert reset(client, token_from(outbox[0])).status_code == 400
    assert login(client).status_code == 200  # la contraseña antigua sigue valiendo


def test_new_link_replaces_previous_and_respects_cooldown(client, outbox):
    register(client)
    forgot(client)
    forgot(client)  # dentro del minuto: no se envía otro
    assert len(outbox) == 1
    first = token_from(outbox[0])

    # Pasado el cooldown llega otro y el primero deja de valer.
    with Session(engine) as db:
        stored = db.exec(select(PasswordReset)).one()
        stored.created_at -= timedelta(minutes=2)
        db.add(stored)
        db.commit()
    forgot(client)
    assert len(outbox) == 2
    assert reset(client, first).status_code == 400
    assert reset(client, token_from(outbox[1])).status_code == 204


def test_google_only_account_can_create_password(client, outbox):
    client.post("/api/auth/google", json={"credential": google_credential(email="ana@gmail.com")})
    client.cookies.clear()
    assert login(client, "ana@gmail.com").status_code == 401  # sin contraseña

    forgot(client, "ana@gmail.com")
    assert reset(client, token_from(outbox[0])).status_code == 204
    assert login(client, "ana@gmail.com", "nueva-clave-1").status_code == 200


def test_short_password_rejected(client, outbox):
    register(client)
    forgot(client)
    assert reset(client, token_from(outbox[0]), "corta").status_code == 422
