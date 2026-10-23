import uuid
from datetime import timedelta

from sqlalchemy import case, or_
from sqlmodel import Session, delete, func, select

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

# Las tareas borradas se pueden restaurar durante este tiempo; después se eliminan de verdad.
PURGE_AFTER = timedelta(days=7)

SORT_COLUMNS = {
    "position": Task.position,
    "created_at": Task.created_at,
    "updated_at": Task.updated_at,
    "due_date": Task.due_date,
    "priority": PRIORITY_RANK,
    "title": func.lower(Task.title),
}


def get_task(session: Session, user: User, task_id: uuid.UUID) -> Task:
    """Tarea activa del usuario. Una borrada (borrado suave) es como si no existiera: 404."""
    task = session.get(Task, task_id)
    if task is None or task.user_id != user.id or task.deleted_at is not None:
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
    filters = [Task.user_id == user.id, Task.deleted_at.is_(None)]
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
    """Borrado suave: la tarea sale de la columna (que se renumera) y se puede restaurar."""
    task = get_task(session, user, task_id)
    now = utcnow()
    # De paso, elimina de verdad las que este usuario borró hace más de PURGE_AFTER.
    session.exec(delete(Task).where(Task.user_id == user.id, Task.deleted_at <= now - PURGE_AFTER))
    task.deleted_at = now
    session.add(task)
    for position, t in enumerate(_column(session, user, task.status_id, exclude=task.id)):
        t.position = position
        session.add(t)
    session.commit()


def restore_task(session: Session, user: User, task_id: uuid.UUID) -> Task:
    """Deshace un borrado: la tarea vuelve a su sitio en su columna."""
    task = session.get(Task, task_id)
    if task is None or task.user_id != user.id or task.deleted_at is None:
        raise NotFoundError("Tarea no encontrada")
    # Su sitio: delante de las tareas activas que estaban detrás de ella.
    index = sum(
        1
        for t in _column(session, user, task.status_id, exclude=task.id)
        if t.position < task.position
    )
    task.deleted_at = None
    session.add(task)
    session.flush()
    return move_task(session, user, task.id, TaskMove(status_id=task.status_id, position=index))


def _column(session: Session, user: User, status_id: uuid.UUID, exclude: uuid.UUID) -> list[Task]:
    query = (
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.status_id == status_id,
            Task.id != exclude,
            Task.deleted_at.is_(None),
        )
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
