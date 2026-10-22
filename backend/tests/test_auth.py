"""Registro, login y logout con email y contraseña; sesión en cookie httpOnly y CSRF."""

import hashlib
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core import sessions
from app.core.sessions import COOKIE_NAME
from app.db import engine
from app.main import app
from app.models import User, UserSession
from app.models.common import utcnow
from tests.conftest import TEST_ORIGIN, login, register, signup


def set_cookie_header(response) -> str:
    return response.headers.get("set-cookie", "")


def session_row(token: str) -> UserSession | None:
    with Session(engine) as db:
        return db.get(UserSession, hashlib.sha256(token.encode()).hexdigest())


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# --- Registro y login ---


def test_register_creates_unverified_account_without_session(client):
    r = register(client, email="Ana@Example.com")
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "ana@example.com"
    assert body["full_name"] == "Ana"
    assert body["email_verified"] is False
    assert "hashed_password" not in body
    assert "google_sub" not in body

    # Hasta confirmar el email no hay sesión.
    assert f"{COOKIE_NAME}=" not in set_cookie_header(r)
    assert client.get("/api/users/me").status_code == 401


def test_register_duplicate_email(client):
    register(client)
    assert register(client, email="ANA@example.com").status_code == 409


def test_register_validates_input(client):
    assert register(client, email="no-es-email").status_code == 422
    assert register(client, password="corta").status_code == 422


def test_login_opens_session(client):
    signup(client)
    client.cookies.clear()
    r = login(client, email="ANA@EXAMPLE.COM")
    assert r.status_code == 200
    assert r.json()["email"] == "ana@example.com"

    cookie = set_cookie_header(r)
    assert f"{COOKIE_NAME}=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert "Max-Age=2592000" in cookie  # 30 días
    assert "Secure" not in cookie  # COOKIE_SECURE=false en tests (http)

    # El cliente guarda la cookie como un navegador: ya hay sesión.
    assert client.get("/api/users/me").json()["email"] == "ana@example.com"


def test_login_requires_verified_email(client):
    register(client)
    r = login(client)
    assert r.status_code == 403
    assert r.json()["detail"].startswith("Confirma tu email")
    assert f"{COOKIE_NAME}=" not in set_cookie_header(r)
    # Con una contraseña incorrecta no se revela que la cuenta existe sin verificar.
    assert login(client, password="incorrecta").status_code == 401


def test_session_of_unverified_account_is_rejected(client):
    register(client)
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == "ana@example.com")).one()
        token = sessions.create_session(db, user)  # p. ej. abierta antes de exigir verificación
    client.cookies.set(COOKIE_NAME, token)
    assert client.get("/api/users/me").status_code == 401


def test_login_wrong_password_or_unknown_user(client):
    signup(client)
    assert login(client, password="incorrecta").status_code == 401
    assert login(client, email="nadie@example.com").status_code == 401


def test_token_is_stored_hashed(client):
    signup(client)
    token = client.cookies[COOKIE_NAME]
    row = session_row(token)
    assert row is not None
    assert row.id != token


# --- Sesión ---


def test_me_requires_session(client):
    r = client.get("/api/users/me")
    assert r.status_code == 401
    assert r.json()["detail"] == "No has iniciado sesión"


def test_me_rejects_unknown_cookie(client):
    client.cookies.set(COOKIE_NAME, "inventada")
    assert client.get("/api/users/me").status_code == 401


def test_logout_revokes_session_and_clears_cookie(client):
    signup(client)
    token = client.cookies[COOKIE_NAME]
    r = client.post("/api/auth/logout")
    assert r.status_code == 204
    assert "Max-Age=0" in set_cookie_header(r) or "expires=" in set_cookie_header(r).lower()
    assert session_row(token) is None

    # Aunque alguien guardara el token, ya no sirve.
    client.cookies.set(COOKIE_NAME, token)
    assert client.get("/api/users/me").status_code == 401


def test_logout_without_session_is_fine(client):
    assert client.post("/api/auth/logout").status_code == 204


def test_expired_session_is_rejected(client):
    signup(client)
    token = client.cookies[COOKIE_NAME]
    with Session(engine) as db:
        row = db.get(UserSession, session_row(token).id)
        row.expires_at = utcnow() - timedelta(minutes=1)
        db.add(row)
        db.commit()
    assert client.get("/api/users/me").status_code == 401


def test_session_is_renewed_when_half_used(client):
    signup(client)
    token = client.cookies[COOKIE_NAME]

    fresh = client.get("/api/users/me")
    assert COOKIE_NAME not in set_cookie_header(fresh)  # recién creada: no se renueva

    with Session(engine) as db:
        row = db.get(UserSession, session_row(token).id)
        row.expires_at = utcnow() + timedelta(days=2)
        db.add(row)
        db.commit()

    r = client.get("/api/users/me")
    assert r.status_code == 200
    assert f"{COOKIE_NAME}={token}" in set_cookie_header(r)
    assert session_row(token).expires_at > utcnow() + timedelta(days=29)


def test_inactive_user_loses_access(client):
    signup(client)
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == "ana@example.com")).one()
        user.is_active = False
        db.add(user)
        db.commit()
    assert client.get("/api/users/me").status_code == 401
    assert login(client).status_code == 401


def test_each_session_returns_its_own_user(client, auth_headers, other_headers):
    assert client.get("/api/users/me", headers=auth_headers).json()["email"] == "ana@example.com"
    assert client.get("/api/users/me", headers=other_headers).json()["email"] == "beto@example.com"


def test_bearer_tokens_are_not_accepted_anymore(client):
    assert client.get("/api/users/me", headers={"Authorization": "Bearer algo"}).status_code == 401


# --- CSRF ---


def test_mutation_from_foreign_origin_is_blocked(client, auth_headers):
    r = client.post(
        "/api/tasks",
        json={"title": "x"},
        headers={**auth_headers, "Origin": "https://malicioso.example"},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Origen no permitido"


def test_login_from_foreign_origin_is_blocked(client):
    signup(client)
    r = client.post(
        "/api/auth/login",
        json={"email": "ana@example.com", "password": "secreto123"},
        headers={"Origin": "https://malicioso.example"},
    )
    assert r.status_code == 403


def test_reads_from_any_origin_are_not_blocked(client, auth_headers):
    r = client.get("/api/tasks", headers={**auth_headers, "Origin": "https://otro.example"})
    assert r.status_code == 200


def test_cookie_without_origin_needs_allowed_referer(auth_headers):
    with TestClient(app) as bare:  # sin Origin, como algunos navegadores en peticiones antiguas
        assert bare.post("/api/tasks", json={"title": "x"}, headers=auth_headers).status_code == 403
        ok = bare.post(
            "/api/tasks",
            json={"title": "x"},
            headers={**auth_headers, "Referer": f"{TEST_ORIGIN}/list"},
        )
        assert ok.status_code == 201


def test_requests_without_cookie_or_origin_are_allowed(auth_headers):
    """curl o scripts sin sesión pueden registrarse/entrar (no hay sesión que robar)."""
    with TestClient(app) as bare:
        r = bare.post("/api/auth/register", json={"email": "c@example.com", "password": "12345678"})
        assert r.status_code == 201
