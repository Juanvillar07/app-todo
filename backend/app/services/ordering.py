import uuid

from sqlmodel import Session, func, select

from app.models import Task


def next_task_position(session: Session, user_id: uuid.UUID, status_id: uuid.UUID) -> int:
    """Posición para añadir una tarea al final de la columna de un estado."""
    current_max = session.exec(
        select(func.max(Task.position)).where(Task.user_id == user_id, Task.status_id == status_id)
    ).one()
    return 0 if current_max is None else current_max + 1
