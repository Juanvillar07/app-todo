from fastapi import APIRouter
from sqlmodel import text

from app.api.deps import SessionDep

router = APIRouter(tags=["health"])


@router.get("/health")
def health(session: SessionDep):
    # Comprueba también la conexión a la BD: el deploy solo da por bueno un contenedor sano.
    session.exec(text("SELECT 1"))
    return {"status": "ok"}
