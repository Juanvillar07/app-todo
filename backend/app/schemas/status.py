import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$", to_lower=True)]


class StatusCreate(BaseModel):
    name: Name
    color: Color = "#94a3b8"
    is_done: bool = False
    is_default: bool = False


class StatusUpdate(BaseModel):
    name: Name | None = None
    color: Color | None = None
    is_done: bool | None = None
    is_default: bool | None = None


class StatusPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str
    position: int
    is_default: bool
    is_done: bool


class StatusReorder(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1)
