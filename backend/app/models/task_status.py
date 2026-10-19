import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class TaskStatus(SQLModel, table=True):
    __tablename__ = "task_status"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_task_status_user_name"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    name: str = Field(max_length=50)
    color: str = Field(max_length=7)  # hex, p. ej. "#3b82f6"
    position: int = 0
    # Estado donde caen las tareas nuevas si no se indica otro. Exactamente uno por usuario.
    is_default: bool = False
    # Marca los estados de cierre ("Hecho", "Cancelada"...).
    is_done: bool = False
