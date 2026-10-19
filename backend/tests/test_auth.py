import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.core.security import create_access_token
from tests.conftest import login, register


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_register_creates_user(client):
    r = register(client, email="Ana@Example.com")
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "ana@example.com"
    assert body["full_name"] == "Ana"
    assert body["is_active"] is True
    assert "hashed_password" not in body
    assert "password" not in body


def test_register_duplicate_email(client):
    register(client)
    r = register(client, email="ANA@example.com")
    assert r.status_code == 409


def test_register_validates_input(client):
    assert register(client, email="no-es-email").status_code == 422
    assert register(client, password="corta").status_code == 422


def test_login_returns_token(client):
    register(client)
    r = login(client)
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_is_case_insensitive_on_email(client):
    register(client)
    assert login(client, email="ANA@EXAMPLE.COM").status_code == 200


def test_login_wrong_password(client):
    register(client)
    r = login(client, password="incorrecta")
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


def test_login_unknown_user(client):
    assert login(client, email="nadie@example.com").status_code == 401


def test_me_returns_current_user(client, auth_headers):
    r = client.get("/api/users/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "ana@example.com"


def test_me_requires_token(client):
    assert client.get("/api/users/me").status_code == 401


def test_me_rejects_invalid_token(client):
    r = client.get("/api/users/me", headers={"Authorization": "Bearer basura"})
    assert r.status_code == 401


def test_me_rejects_expired_token(client):
    user_id = register(client).json()["id"]
    expired = jwt.encode(
        {"sub": user_id, "exp": datetime.now(UTC) - timedelta(minutes=1)},
        "test-secret-de-al-menos-32-caracteres-xx",
        algorithm="HS256",
    )
    r = client.get("/api/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401


def test_me_rejects_token_of_deleted_user(client):
    token = create_access_token(uuid.uuid4())
    r = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_each_token_returns_its_own_user(client):
    register(client, email="ana@example.com")
    register(client, email="beto@example.com")
    token_beto = login(client, email="beto@example.com").json()["access_token"]
    r = client.get("/api/users/me", headers={"Authorization": f"Bearer {token_beto}"})
    assert r.json()["email"] == "beto@example.com"
