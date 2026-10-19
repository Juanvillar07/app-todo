import uuid

from sqlalchemy import case, or_
from sqlmodel import Session, func, select

from app.core.errors import NotFoundError
from app.models import Priority, Task, User
from app.models.common import utcnow
from app.schemas.task import TaskCreate, TaskMove, TaskSort, TaskUpdate
from app.services.ordering import next_task_position
from app.services.statuses import get_default_status, get_status

# Para ordenar por prioridad según su gravedad y no alfabéticamente.
PRIORITY_RANK = case(
    {Priority.low: 0, Priority.medium: 1, Priority.high: 2, Priority.urgent: 3},
    value=Task.priority,
)

SORT_COLUMNS = {
    "position": Task.position,
    "created_at": Task.created_at,
    "updated_at": Task.updated_at,
    "due_date": Task.due_date,
    "priority": PRIORITY_RANK,
    "title": func.lower(Task.title),
}


def get_task(session: Session, user: User, task_id: uuid.UUID) -> Task:
    task = session.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise NotFoundError("Tarea no encontrada")
    return task


def list_tasks(
    session: Session,
    user: User,
    *,
    status_id: uuid.UUID | None = None,
    priority: list[Priority] | None = None,
    q: str | None = None,
    sort: TaskSort = "position",
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Task], int]:
    filters = [Task.user_id == user.id]
    if status_id is not None:
        filters.append(Task.status_id == status_id)
    if priority:
        filters.append(Task.priority.in_(priority))
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))

    total = session.exec(select(func.count()).select_from(Task).where(*filters)).one()

    column = SORT_COLUMNS[sort.lstrip("-")]
    order = column.desc() if sort.startswith("-") else column.asc()
    query = (
        select(Task)
        .where(*filters)
        .order_by(order.nulls_last(), Task.created_at.desc(), Task.id)
        .limit(limit)
        .offset(offset)
    )
    return list(session.exec(query).all()), total


def create_task(session: Session, user: User, data: TaskCreate) -> Task:
    if data.status_id is not None:
        status = get_status(session, user, data.status_id)
    else:
        status = get_default_status(session, user)
    task = Task(
        **data.model_dump(exclude={"status_id"}),
        user_id=user.id,
        status_id=status.id,
        position=next_task_position(session, user.id, status.id),
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def update_task(session: Session, user: User, task_id: uuid.UUID, data: TaskUpdate) -> Task:
    task = get_task(session, user, task_id)
    changes = data.model_dump(exclude_unset=True)

    new_status_id = changes.pop("status_id", None)
    if new_status_id is not None and new_status_id != task.status_id:
        status = get_status(session, user, new_status_id)
        task.position = next_task_position(session, user.id, status.id)
        task.status_id = status.id

    for field, value in changes.items():
        setattr(task, field, value)
    task.updated_at = utcnow()
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def delete_task(session: Session, user: User, task_id: uuid.UUID) -> None:
    task = get_task(session, user, task_id)
    session.delete(task)
    session.commit()


def _column(session: Session, user: User, status_id: uuid.UUID, exclude: uuid.UUID) -> list[Task]:
    query = (
        select(Task)
        .where(Task.user_id == user.id, Task.status_id == status_id, Task.id != exclude)
        .order_by(Task.position, Task.created_at)
    )
    return list(session.exec(query).all())


def move_task(session: Session, user: User, task_id: uuid.UUID, data: TaskMove) -> Task:
    """Mueve la tarea a `position` (índice 0-based) en la columna destino y renumera."""
    task = get_task(session, user, task_id)
    target = get_status(session, user, data.status_id)
    source_status_id = task.status_id

    destination = _column(session, user, target.id, exclude=task.id)
    destination.insert(min(data.position, len(destination)), task)
    task.status_id = target.id
    task.updated_at = utcnow()
    for position, t in enumerate(destination):
        t.position = position
        session.add(t)

    if source_status_id != target.id:
        for position, t in enumerate(_column(session, user, source_status_id, exclude=task.id)):
            t.position = position
            session.add(t)

    session.commit()
    session.refresh(task)
    return task
