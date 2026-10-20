from fastapi import APIRouter, HTTPException, Request, Response, status

from app.api.deps import SessionDep
from app.core import sessions
from app.core.config import get_settings
from app.core.google import GoogleUnavailableError, verify_google_credential
from app.models import User
from app.schemas.user import AuthConfig, GoogleLoginRequest, LoginRequest, UserCreate, UserPublic
from app.services import users

router = APIRouter(prefix="/auth", tags=["auth"])


def _start_session(session: SessionDep, user: User, response: Response) -> User:
    token = sessions.create_session(session, user)
    sessions.set_session_cookie(response, token)
    return user


@router.get("/config", response_model=AuthConfig)
def auth_config():
    """Qué métodos de login hay activos (el frontend muestra el botón de Google si hay ID)."""
    return AuthConfig(google_client_id=get_settings().google_client_id or None)


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, session: SessionDep, response: Response):
    if users.get_by_email(session, data.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="El email ya está registrado")
    return _start_session(session, users.create_user(session, data), response)


@router.post("/login", response_model=UserPublic)
def login(data: LoginRequest, session: SessionDep, response: Response):
    user = users.authenticate(session, data.email, data.password)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Email o contraseña incorrectos")
    return _start_session(session, user, response)


@router.post("/google", response_model=UserPublic)
def login_with_google(data: GoogleLoginRequest, session: SessionDep, response: Response):
    """Entrar o registrarse con el ID token del botón de Google."""
    client_id = get_settings().google_client_id
    if not client_id:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="El login con Google no está activado"
        )
    try:
        identity = verify_google_credential(data.credential, client_id)
    except GoogleUnavailableError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google no responde. Inténtalo de nuevo."
        ) from exc
    if identity is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="No se pudo verificar la cuenta de Google"
        )
    user = users.get_or_create_from_google(session, identity)
    if not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="La cuenta está desactivada")
    return _start_session(session, user, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, session: SessionDep, response: Response):
    token = request.cookies.get(sessions.COOKIE_NAME)
    if token:
        sessions.delete_session(session, token)
    sessions.clear_session_cookie(response)
