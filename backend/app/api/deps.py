from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlmodel import Session

from app.core import sessions
from app.db import get_session
from app.models import User

SessionDep = Annotated[Session, Depends(get_session)]


def get_current_user(request: Request, response: Response, session: SessionDep) -> User:
    """Usuario de la cookie de sesión. Si la sesión se renovó, reenvía la cookie con la nueva
    caducidad."""
    token = request.cookies.get(sessions.COOKIE_NAME)
    result = sessions.get_session_user(session, token) if token else None
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="No has iniciado sesión"
        )
    user, renewed = result
    if renewed:
        sessions.set_session_cookie(response, token)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
