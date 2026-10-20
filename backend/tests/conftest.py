import os
from pathlib import Path

import psycopg
import pytest
from sqlalchemy.engine import make_url

# Los tests usan su propia BD en el mismo Postgres (por defecto "<db>_test").
# Debe configurarse antes de importar la app, que lee DATABASE_URL al arrancar.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://todo:todo@localhost:5432/todo_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
# Origen de la app para la protección CSRF y cliente OAuth de Google de prueba.
TEST_ORIGIN = "http://app.test"
TEST_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com"
os.environ["APP_ORIGINS"] = TEST_ORIGIN
os.environ["GOOGLE_CLIENT_ID"] = TEST_GOOGLE_CLIENT_ID
os.environ["COOKIE_SECURE"] = "false"

from datetime import UTC, datetime, timedelta  # noqa: E402
from types import SimpleNamespace  # noqa: E402

import jwt  # noqa: E402
from alembic.config import Config  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel, text  # noqa: E402

from alembic import command  # noqa: E402
from app.core import google, sessions  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.user import UserCreate  # noqa: E402
from app.services import users  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _ensure_database() -> None:
    url = make_url(TEST_DATABASE_URL)
    admin_conninfo = url.set(drivername="postgresql", database="postgres").render_as_string(
        hide_password=False
    )
    with psycopg.connect(admin_conninfo, autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (url.database,))
        if exists.fetchone() is None:
            conn.execute(f'CREATE DATABASE "{url.database}"')


@pytest.fixture(scope="session", autouse=True)
def database():
    """Crea la BD de tests y aplica las migraciones reales de Alembic."""
    _ensure_database()
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    tables = ", ".join(f'"{t.name}"' for t in SQLModel.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture
def client():
    # Como un navegador en la app: manda el Origin permitido y guarda las cookies que recibe.
    with TestClient(app, headers={"Origin": TEST_ORIGIN}) as c:
        yield c


# --- Email y contraseña ---


def register(client: TestClient, email: str = "ana@example.com", password: str = "secreto123"):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "full_name": "Ana"},
    )


def login(client: TestClient, email: str = "ana@example.com", password: str = "secreto123"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def make_headers(email: str) -> dict[str, str]:
    """Crea un usuario con sesión directamente en la BD y devuelve la cookie como header.
    Así cada test puede tener varios usuarios con el mismo cliente."""
    with Session(engine) as db:
        user = users.create_user(db, UserCreate(email=email, password="secreto123"))
        token = sessions.create_session(db, user)
    return {"Cookie": f"{sessions.COOKIE_NAME}={token}"}


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return make_headers("ana@example.com")


@pytest.fixture
def other_headers() -> dict[str, str]:
    """Un segundo usuario, para comprobar el aislamiento."""
    return make_headers("beto@example.com")


# --- Google ---

GOOGLE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
GOOGLE_KID = "google-test-key"


class FakeGoogleJWKS:
    """Sustituye a la JWKS de Google: solo conoce la clave de prueba."""

    def __init__(self) -> None:
        self.unavailable = False

    def get_signing_key_from_jwt(self, token: str):
        if self.unavailable:
            raise jwt.PyJWKClientConnectionError("Google no responde")
        if jwt.get_unverified_header(token).get("kid") != GOOGLE_KID:
            raise jwt.PyJWKClientError("kid desconocido")
        return SimpleNamespace(key=GOOGLE_KEY.public_key())


@pytest.fixture(autouse=True)
def google_jwks(monkeypatch) -> FakeGoogleJWKS:
    fake = FakeGoogleJWKS()
    monkeypatch.setattr(google, "get_google_jwks_client", lambda: fake)
    return fake


def google_credential(
    sub: str = "google-sub-ana",
    email: str = "ana@gmail.com",
    name: str | None = "Ana G.",
    *,
    email_verified: bool = True,
    audience: str = TEST_GOOGLE_CLIENT_ID,
    issuer: str = "https://accounts.google.com",
    expires_in: int = 3600,
    key=GOOGLE_KEY,
    kid: str = GOOGLE_KID,
) -> str:
    """ID token con la forma de los que emite Google Identity Services."""
    now = datetime.now(UTC)
    payload = {
        "iss": issuer,
        "aud": audience,
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "name": name,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": kid})
