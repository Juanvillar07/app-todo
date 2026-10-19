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
os.environ.setdefault("JWT_SECRET", "test-secret-de-al-menos-32-caracteres-xx")

from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, text  # noqa: E402

from alembic import command  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402

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
    with TestClient(app) as c:
        yield c


def register(client: TestClient, email: str = "ana@example.com", password: str = "secreto123"):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "full_name": "Ana"},
    )


def login(client: TestClient, email: str = "ana@example.com", password: str = "secreto123"):
    return client.post("/api/auth/login", data={"username": email, "password": password})


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    register(client)
    token = login(client).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
