import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.models import Priority

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

TaskSort = Literal[
    "position",
    "-position",
    "created_at",
    "-created_at",
    "updated_at",
    "-updated_at",
    "due_date",
    "-due_date",
    "priority",
    "-priority",
    "title",
    "-title",
]


class TaskCreate(BaseModel):
    title: Title
    description: str | None = Field(default=None, max_length=50_000)
    priority: Priority = Priority.medium
    due_date: date | None = None
    status_id: uuid.UUID | None = None  # sin indicar → estado por defecto del usuario


class TaskUpdate(BaseModel):
    title: Title | None = None
    description: str | None = Field(default=None, max_length=50_000)
    priority: Priority | None = None
    due_date: date | None = None
    status_id: uuid.UUID | None = None

    # description y due_date aceptan null para vaciarlos; estos campos no.
    @field_validator("title", "priority", "status_id", mode="before")
    @classmethod
    def not_null(cls, v):
        if v is None:
            raise ValueError("no puede ser null")
        return v


class TaskMove(BaseModel):
    status_id: uuid.UUID
    position: int = Field(ge=0)


class TaskPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status_id: uuid.UUID
    title: str
    description: str | None
    priority: Priority
    due_date: date | None
    position: int
    created_at: datetime
    updated_at: datetime


class TaskPage(BaseModel):
    items: list[TaskPublic]
    total: int
