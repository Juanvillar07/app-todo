import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime
from sqlmodel import Field, SQLModel

from app.models.common import timestamp_column, utcnow


class User(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(max_length=255, unique=True, index=True)
    full_name: str | None = Field(default=None, max_length=255)
    # None si la cuenta solo entra con Google.
    hashed_password: str | None = None
    # Identificador estable de la cuenta de Google ("sub" del ID token).
    google_sub: str | None = Field(default=None, max_length=255, unique=True, index=True)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utcnow, sa_column=timestamp_column())
    # Cuándo confirmó que el email es suyo (enlace del correo, Google o recuperación de contraseña).
    email_verified_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None
