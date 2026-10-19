import uuid

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, SessionDep
from app.schemas.status import StatusCreate, StatusPublic, StatusReorder, StatusUpdate
from app.services import statuses

router = APIRouter(prefix="/statuses", tags=["statuses"])


@router.get("", response_model=list[StatusPublic])
def list_statuses(session: SessionDep, user: CurrentUser):
    return statuses.list_statuses(session, user)


@router.post("", response_model=StatusPublic, status_code=status.HTTP_201_CREATED)
def create_status(data: StatusCreate, session: SessionDep, user: CurrentUser):
    return statuses.create_status(session, user, data)


@router.put("/reorder", response_model=list[StatusPublic])
def reorder_statuses(data: StatusReorder, session: SessionDep, user: CurrentUser):
    return statuses.reorder_statuses(session, user, data)


@router.patch("/{status_id}", response_model=StatusPublic)
def update_status(status_id: uuid.UUID, data: StatusUpdate, session: SessionDep, user: CurrentUser):
    return statuses.update_status(session, user, status_id, data)


@router.delete("/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_status(
    status_id: uuid.UUID,
    session: SessionDep,
    user: CurrentUser,
    move_to: uuid.UUID | None = None,
):
    """Borra un estado. Si tiene tareas, `move_to` indica a qué estado moverlas."""
    statuses.delete_status(session, user, status_id, move_to)
