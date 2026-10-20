import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import timestamp_column, utcnow


class UserSession(SQLModel, table=True):
    """Sesión de login. El token en claro solo vive en la cookie; aquí se guarda su SHA-256."""

    __tablename__ = "session"

    id: str = Field(primary_key=True, max_length=64)  # sha256(token) en hex
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    created_at: datetime = Field(default_factory=utcnow, sa_column=timestamp_column())
    expires_at: datetime = Field(sa_column=timestamp_column())
