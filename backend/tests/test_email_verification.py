"""Verificación del email: obligatoria para entrar; enlace al registrarse, reenvío y Google."""

import re
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlmodel import Session, select

from app.core.sessions import COOKIE_NAME
from app.db import engine
from app.models import EmailVerification, User
from app.services import email_verification, password_reset
from tests.conftest import google_credential, login, register, signup


@pytest.fixture
def outbox(monkeypatch) -> list[dict]:
    """Sustituye el envío por Resend (verificación y recuperación): guarda los correos."""
    sent: list[dict] = []

    def fake_send(to: str, subject: str, html: str, text: str) -> None:
        sent.append({"to": to, "subject": subject, "html": html, "text": text})

    monkeypatch.setattr(email_verification, "send_email", fake_send)
    monkeypatch.setattr(password_reset, "send_email", fake_send)
    return sent


def token_from(mail: dict, path: str = "verify-email") -> str:
    link = re.search(rf"https?://\S+/{path}\?token=\S+", mail["text"]).group(0)
    return parse_qs(urlsplit(link).query)["token"][0]


def verify(client, token: str):
    return client.post("/api/auth/verify-email", json={"token": token})


def validate(client, token: str):
    return client.post("/api/auth/verify-email/validate", json={"token": token})


def resend(client, email: str = "ana@example.com"):
    return client.post("/api/auth/resend-verification", json={"email": email})


def age_links(minutes: int = 2) -> None:
    """Simula que el último enlace se pidió hace un rato (para saltar el cooldown)."""
    with Session(engine) as db:
        for link in db.exec(select(EmailVerification)).all():
            link.created_at -= timedelta(minutes=minutes)
            db.add(link)
        db.commit()


def test_register_sends_link(client, outbox):
    r = register(client)
    assert r.status_code == 201
    assert r.json()["email_verified"] is False
    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["to"] == "ana@example.com"
    assert "http://localhost:5173/verify-email?token=" in mail["text"]
    assert token_from(mail) in mail["html"]


def test_verify_marks_verified_and_opens_session(client, outbox):
    register(client)
    r = verify(client, token_from(outbox[0]))
    assert r.status_code == 200
    assert r.json()["email_verified"] is True
    assert f"{COOKIE_NAME}=" in r.headers["set-cookie"]
    assert client.get("/api/users/me").json()["email"] == "ana@example.com"

    # A partir de ahora también entra con su contraseña.
    client.cookies.clear()
    assert login(client).status_code == 200
    with Session(engine) as db:
        assert db.exec(select(EmailVerification)).first() is None


def test_validate_does_not_consume_the_link(client, outbox):
    register(client)
    token = token_from(outbox[0])
    assert validate(client, token).status_code == 204
    assert validate(client, token).status_code == 204
    assert verify(client, token).status_code == 200
    r = validate(client, token)  # ya usado
    assert r.status_code == 400
    assert r.json()["detail"] == "El enlace no es válido o ha caducado"


def test_token_is_single_use(client, outbox):
    register(client)
    token = token_from(outbox[0])
    assert verify(client, token).status_code == 200
    assert verify(client, token).status_code == 400


def test_invalid_token(client):
    assert verify(client, "inventado").status_code == 400
    assert validate(client, "inventado").status_code == 400


def test_expired_token(client, outbox):
    register(client)
    with Session(engine) as db:
        link = db.exec(select(EmailVerification)).one()
        link.expires_at -= timedelta(days=2)
        db.add(link)
        db.commit()
    token = token_from(outbox[0])
    assert validate(client, token).status_code == 400
    assert verify(client, token).status_code == 400
    assert login(client).status_code == 403  # sigue sin verificar


def test_resend_is_public_and_does_not_reveal_accounts(client, outbox):
    assert resend(client, "nadie@example.com").status_code == 202
    assert outbox == []


def test_resend_respects_cooldown_and_replaces_link(client, outbox):
    register(client)
    assert resend(client).status_code == 202  # dentro del minuto: no se envía otro
    assert len(outbox) == 1

    age_links()
    assert resend(client, "ANA@example.com").status_code == 202
    assert len(outbox) == 2
    assert verify(client, token_from(outbox[0])).status_code == 400  # el anterior ya no vale
    assert verify(client, token_from(outbox[1])).status_code == 200


def test_resend_does_nothing_when_verified(client, outbox):
    signup(client)
    age_links()
    outbox.clear()
    assert resend(client).status_code == 202
    assert outbox == []


def test_new_google_account_is_verified(client, outbox):
    r = client.post("/api/auth/google", json={"credential": google_credential()})
    assert r.json()["email_verified"] is True
    assert outbox == []


def test_google_link_keeps_password_and_sessions_of_verified_account(client):
    signup(client, email="ana@gmail.com")
    old_session = client.cookies[COOKIE_NAME]

    client.cookies.clear()
    r = client.post(
        "/api/auth/google", json={"credential": google_credential(email="ana@gmail.com")}
    )
    assert r.status_code == 200

    # El email ya estaba confirmado: la contraseña y las sesiones abiertas siguen valiendo.
    client.cookies.clear()
    assert login(client, email="ana@gmail.com").status_code == 200
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, old_session)
    assert client.get("/api/users/me").status_code == 200
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == "ana@gmail.com")).one()
        assert user.google_sub == "google-sub-ana"


def test_password_reset_verifies_email(client, outbox):
    register(client)
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    reset_mail = next(m for m in outbox if "reset-password" in m["text"])
    r = client.post(
        "/api/auth/reset-password",
        json={"token": token_from(reset_mail, "reset-password"), "password": "nueva-clave-1"},
    )
    assert r.status_code == 204
    # Recibir el enlace en su buzón prueba que el email es suyo: ya puede entrar.
    assert login(client, password="nueva-clave-1").status_code == 200
