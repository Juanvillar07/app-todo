import uuid

from sqlmodel import Session, func, select

from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.models import Task, TaskStatus, User
from app.models.common import utcnow
from app.schemas.status import StatusCreate, StatusReorder, StatusUpdate
from app.services.ordering import next_task_position

DEFAULT_STATUSES = [
    {"name": "Por hacer", "color": "#94a3b8", "is_default": True, "is_done": False},
    {"name": "En progreso", "color": "#3b82f6", "is_default": False, "is_done": False},
    {"name": "Hecho", "color": "#22c55e", "is_default": False, "is_done": True},
]


def add_default_statuses(session: Session, user: User) -> None:
    """Añade los estados iniciales a la sesión (sin commit: va en la transacción del registro)."""
    for position, data in enumerate(DEFAULT_STATUSES):
        session.add(TaskStatus(user_id=user.id, position=position, **data))


def list_statuses(session: Session, user: User) -> list[TaskStatus]:
    query = (
        select(TaskStatus)
        .where(TaskStatus.user_id == user.id)
        .order_by(TaskStatus.position, TaskStatus.name)
    )
    return list(session.exec(query).all())


def get_status(session: Session, user: User, status_id: uuid.UUID) -> TaskStatus:
    status = session.get(TaskStatus, status_id)
    if status is None or status.user_id != user.id:
        raise NotFoundError("Estado no encontrado")
    return status


def get_default_status(session: Session, user: User) -> TaskStatus:
    query = select(TaskStatus).where(TaskStatus.user_id == user.id, TaskStatus.is_default)
    status = session.exec(query).first()
    if status is None:
        raise BadRequestError("No tienes un estado por defecto; crea uno primero")
    return status


def _ensure_unique_name(
    session: Session, user: User, name: str, exclude_id: uuid.UUID | None = None
) -> None:
    query = select(TaskStatus.id).where(
        TaskStatus.user_id == user.id, func.lower(TaskStatus.name) == name.lower()
    )
    if exclude_id is not None:
        query = query.where(TaskStatus.id != exclude_id)
    if session.exec(query).first() is not None:
        raise ConflictError("Ya existe un estado con ese nombre")


def _make_default(session: Session, user: User, status: TaskStatus) -> None:
    for other in list_statuses(session, user):
        other.is_default = other.id == status.id
        session.add(other)


def create_status(session: Session, user: User, data: StatusCreate) -> TaskStatus:
    _ensure_unique_name(session, user, data.name)
    existing = list_statuses(session, user)
    status = TaskStatus(
        user_id=user.id,
        name=data.name,
        color=data.color,
        is_done=data.is_done,
        position=max((s.position for s in existing), default=-1) + 1,
        # El primer estado de un usuario siempre es el de por defecto.
        is_default=data.is_default or not existing,
    )
    session.add(status)
    if status.is_default:
        session.flush()
        _make_default(session, user, status)
    session.commit()
    session.refresh(status)
    return status


def update_status(
    session: Session, user: User, status_id: uuid.UUID, data: StatusUpdate
) -> TaskStatus:
    status = get_status(session, user, status_id)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)

    if "name" in changes:
        _ensure_unique_name(session, user, changes["name"], exclude_id=status.id)
    if changes.get("is_default") is False and status.is_default:
        raise BadRequestError("Debe haber un estado por defecto: marca otro como predeterminado")

    is_default = changes.pop("is_default", None)
    for field, value in changes.items():
        setattr(status, field, value)
    session.add(status)
    if is_default:
        _make_default(session, user, status)
    session.commit()
    session.refresh(status)
    return status


def delete_status(
    session: Session, user: User, status_id: uuid.UUID, move_to: uuid.UUID | None
) -> None:
    status = get_status(session, user, status_id)
    statuses = list_statuses(session, user)
    if len(statuses) == 1:
        raise BadRequestError("No puedes borrar tu único estado")

    tasks = list(
        session.exec(
            select(Task)
            .where(Task.user_id == user.id, Task.status_id == status.id)
            .order_by(Task.position, Task.created_at)
        ).all()
    )

    target: TaskStatus | None = None
    if move_to is not None:
        if move_to == status.id:
            raise BadRequestError("El estado destino debe ser distinto al que borras")
        target = get_status(session, user, move_to)
    elif tasks:
        raise BadRequestError("El estado tiene tareas: indica move_to con el estado destino")

    if target is not None and tasks:
        next_position = next_task_position(session, user.id, target.id)
        now = utcnow()
        for offset, task in enumerate(tasks):
            task.status_id = target.id
            task.position = next_position + offset
            task.updated_at = now
            session.add(task)
        session.flush()

    if status.is_default:
        heir = target or next(s for s in statuses if s.id != status.id)
        heir.is_default = True
        session.add(heir)

    session.delete(status)
    session.flush()
    # Compacta las posiciones de los estados que quedan.
    for position, s in enumerate(x for x in statuses if x.id != status.id):
        s.position = position
        session.add(s)
    session.commit()


def reorder_statuses(session: Session, user: User, data: StatusReorder) -> list[TaskStatus]:
    statuses = {s.id: s for s in list_statuses(session, user)}
    if len(data.ids) != len(set(data.ids)) or set(data.ids) != set(statuses):
        raise BadRequestError("ids debe contener cada uno de tus estados exactamente una vez")
    for position, status_id in enumerate(data.ids):
        statuses[status_id].position = position
        session.add(statuses[status_id])
    session.commit()
    return list_statuses(session, user)
