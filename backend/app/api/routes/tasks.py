import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, SessionDep
from app.models import Priority
from app.schemas.task import TaskCreate, TaskMove, TaskPage, TaskPublic, TaskSort, TaskUpdate
from app.services import tasks

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=TaskPage)
def list_tasks(
    session: SessionDep,
    user: CurrentUser,
    status_id: uuid.UUID | None = None,
    priority: Annotated[list[Priority] | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    sort: TaskSort = "position",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Filtra por estado, prioridad (repetible: `?priority=high&priority=urgent`) y texto.
    `sort` admite `-` delante para orden descendente."""
    items, total = tasks.list_tasks(
        session,
        user,
        status_id=status_id,
        priority=priority,
        q=q,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return TaskPage(items=items, total=total)


@router.post("", response_model=TaskPublic, status_code=status.HTTP_201_CREATED)
def create_task(data: TaskCreate, session: SessionDep, user: CurrentUser):
    return tasks.create_task(session, user, data)


@router.get("/{task_id}", response_model=TaskPublic)
def read_task(task_id: uuid.UUID, session: SessionDep, user: CurrentUser):
    return tasks.get_task(session, user, task_id)


@router.patch("/{task_id}", response_model=TaskPublic)
def update_task(task_id: uuid.UUID, data: TaskUpdate, session: SessionDep, user: CurrentUser):
    return tasks.update_task(session, user, task_id, data)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: uuid.UUID, session: SessionDep, user: CurrentUser):
    tasks.delete_task(session, user, task_id)


@router.patch("/{task_id}/move", response_model=TaskPublic)
def move_task(task_id: uuid.UUID, data: TaskMove, session: SessionDep, user: CurrentUser):
    """Cambia el estado y la posición (índice desde 0 en la columna destino), para el kanban."""
    return tasks.move_task(session, user, task_id, data)
