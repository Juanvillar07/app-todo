import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.common import timestamp_column, utcnow


class User(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(max_length=255, unique=True, index=True)
    full_name: str | None = Field(default=None, max_length=255)
    hashed_password: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=utcnow, sa_column=timestamp_column())
