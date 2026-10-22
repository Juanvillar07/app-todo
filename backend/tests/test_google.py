"""Login y registro con Google (ID token de Google Identity Services)."""

from cryptography.hazmat.primitives.asymmetric import rsa
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.sessions import COOKIE_NAME
from app.db import engine
from app.models import User
from tests.conftest import TEST_GOOGLE_CLIENT_ID, google_credential, login, register


def google_login(client, credential: str):
    return client.post("/api/auth/google", json={"credential": credential})


def test_config_exposes_client_id(client):
    assert client.get("/api/auth/config").json() == {"google_client_id": TEST_GOOGLE_CLIENT_ID}


def test_google_disabled_without_client_id(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "google_client_id", "")
    assert client.get("/api/auth/config").json() == {"google_client_id": None}
    assert google_login(client, google_credential()).status_code == 404


def test_first_google_login_creates_account(client):
    r = google_login(client, google_credential(email="Ana@Gmail.com", name="Ana G."))
    assert r.status_code == 200
    assert r.json()["email"] == "ana@gmail.com"
    assert r.json()["full_name"] == "Ana G."
    assert f"{COOKIE_NAME}=" in r.headers["set-cookie"]

    statuses = client.get("/api/statuses").json()
    assert [s["name"] for s in statuses] == ["Por hacer", "En progreso", "Hecho"]


def test_google_only_account_cannot_use_password(client):
    google_login(client, google_credential(email="ana@gmail.com"))
    client.cookies.clear()
    assert login(client, email="ana@gmail.com", password="cualquiera123").status_code == 401


def test_same_google_account_is_the_same_user(client):
    first = google_login(client, google_credential(sub="sub-1")).json()
    client.cookies.clear()
    second = google_login(client, google_credential(sub="sub-1", name="Otro nombre")).json()
    assert second["id"] == first["id"]
    assert len(client.get("/api/statuses").json()) == 3  # sin duplicar estados


def test_google_links_existing_unverified_account(client):
    user_id = register(client, email="ana@gmail.com").json()["id"]

    r = google_login(client, google_credential(email="ana@gmail.com"))
    assert r.status_code == 200
    assert r.json()["id"] == user_id
    assert r.json()["email_verified"] is True

    # Quien creó la cuenta con ese email pudo no ser su dueño (nunca confirmó el email): se anula
    # su contraseña y solo se entra con Google.
    client.cookies.clear()
    assert login(client, email="ana@gmail.com").status_code == 401
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == "ana@gmail.com")).one()
        assert user.google_sub == "google-sub-ana"
        assert user.hashed_password is None


def test_accepts_issuer_without_https(client):
    r = google_login(client, google_credential(issuer="accounts.google.com"))
    assert r.status_code == 200


def assert_rejected(client, credential: str):
    r = google_login(client, credential)
    assert r.status_code == 401, r.text
    assert r.json()["detail"] == "No se pudo verificar la cuenta de Google"
    assert COOKIE_NAME not in client.cookies


def test_rejects_token_for_another_app(client):
    assert_rejected(client, google_credential(audience="otra-app.apps.googleusercontent.com"))


def test_rejects_other_issuer(client):
    assert_rejected(client, google_credential(issuer="https://evil.example"))


def test_rejects_expired_token(client):
    assert_rejected(client, google_credential(expires_in=-60))


def test_rejects_unverified_email(client):
    assert_rejected(client, google_credential(email_verified=False))


def test_rejects_unknown_key(client):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert_rejected(client, google_credential(key=other, kid="otra"))


def test_rejects_forged_token_with_known_kid(client):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert_rejected(client, google_credential(key=other))


def test_rejects_garbage(client):
    assert_rejected(client, "basura")


def test_returns_503_when_google_is_down(client, google_jwks):
    google_jwks.unavailable = True
    assert google_login(client, google_credential()).status_code == 503
