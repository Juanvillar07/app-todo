import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Column, DateTime, Index, Text
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel

from app.models.common import timestamp_column, utcnow


class Priority(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class Task(SQLModel, table=True):
    __table_args__ = (
        Index("ix_task_user_status", "user_id", "status_id"),
        Index("ix_task_user_priority", "user_id", "priority"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    status_id: uuid.UUID = Field(foreign_key="task_status.id", ondelete="RESTRICT")
    title: str = Field(max_length=200)
    description: str | None = Field(default=None, sa_column=Column(Text))  # Markdown
    # VARCHAR en vez de enum nativo de Postgres: añadir valores no exige migraciones delicadas.
    priority: Priority = Field(
        default=Priority.medium,
        sa_column=Column(
            SAEnum(
                Priority,
                name="priority",
                native_enum=False,
                length=10,
                values_callable=lambda e: [m.value for m in e],
            ),
            nullable=False,
        ),
    )
    due_date: date | None = None
    position: int = 0
    created_at: datetime = Field(default_factory=utcnow, sa_column=timestamp_column())
    updated_at: datetime = Field(default_factory=utcnow, sa_column=timestamp_column())
    # Borrado suave: la tarea desaparece de todas partes pero se puede restaurar ("Deshacer").
    # Las borradas hace más de PURGE_AFTER se eliminan de verdad (services/tasks.py).
    deleted_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
