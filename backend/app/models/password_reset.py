import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import timestamp_column, utcnow


class PasswordReset(SQLModel, table=True):
    """Enlace de recuperación de contraseña. El token en claro solo viaja en el correo; aquí se
    guarda su SHA-256. Se borra al usarse o al pedir otro."""

    __tablename__ = "password_reset"

    id: str = Field(primary_key=True, max_length=64)  # sha256(token) en hex
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    created_at: datetime = Field(default_factory=utcnow, sa_column=timestamp_column())
    expires_at: datetime = Field(sa_column=timestamp_column())
