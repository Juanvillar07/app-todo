from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status

from app.api.deps import SessionDep
from app.core import sessions
from app.core.config import get_settings
from app.core.google import GoogleUnavailableError, verify_google_credential
from app.models import User
from app.schemas.user import (
    AuthConfig,
    ForgotPasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TokenRequest,
    UserCreate,
    UserPublic,
)
from app.services import email_verification, password_reset, users

router = APIRouter(prefix="/auth", tags=["auth"])

INVALID_LINK = "El enlace no es válido o ha caducado"


def _start_session(session: SessionDep, user: User, response: Response) -> User:
    token = sessions.create_session(session, user)
    sessions.set_session_cookie(response, token)
    return user


@router.get("/config", response_model=AuthConfig)
def auth_config():
    """Qué métodos de login hay activos (el frontend muestra el botón de Google si hay ID)."""
    return AuthConfig(google_client_id=get_settings().google_client_id or None)


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, session: SessionDep, background: BackgroundTasks):
    """Crea la cuenta y envía el enlace de verificación. No abre sesión: hasta confirmar el email
    no se puede entrar."""
    if users.get_by_email(session, data.email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="El email ya está registrado")
    user = users.create_user(session, data)
    background.add_task(email_verification.send_verification_link, user.id)
    return user


@router.post("/login", response_model=UserPublic)
def login(data: LoginRequest, session: SessionDep, response: Response):
    user = users.authenticate(session, data.email, data.password)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Email o contraseña incorrectos")
    # Solo con la contraseña correcta se dice que falta verificar (no revela nada a un tercero).
    if not user.email_verified:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Confirma tu email para entrar: revisa tu correo o pide un enlace nuevo.",
        )
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


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(data: ForgotPasswordRequest, background: BackgroundTasks) -> None:
    """Envía un enlace para crear una contraseña nueva. Responde igual exista o no la cuenta (no
    revela qué emails están registrados): todo el trabajo va en segundo plano."""
    background.add_task(password_reset.send_reset_link, data.email)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(data: ResetPasswordRequest, session: SessionDep, response: Response):
    """Pone la contraseña nueva con el token del correo y cierra todas las sesiones del usuario
    (también la de este navegador: después hay que iniciar sesión)."""
    if password_reset.reset_password(session, data.token, data.password) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=INVALID_LINK)
    sessions.clear_session_cookie(response)


@router.post("/verify-email", response_model=UserPublic)
def verify_email(data: TokenRequest, session: SessionDep, response: Response):
    """Confirma el email con el token del correo y abre sesión (el enlace llegó a su buzón)."""
    user = email_verification.verify_email(session, data.token)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=INVALID_LINK)
    return _start_session(session, user, response)


@router.post("/verify-email/validate", status_code=status.HTTP_204_NO_CONTENT)
def validate_verification_link(data: TokenRequest, session: SessionDep):
    """Dice si el enlace de verificación sigue valiendo, sin gastarlo."""
    if email_verification.find_valid_user(session, data.token) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=INVALID_LINK)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_verification(data: ResendVerificationRequest, background: BackgroundTasks) -> None:
    """Vuelve a enviar el enlace de verificación. Se pide con el email (aún no se puede entrar) y
    responde igual exista o no la cuenta; como mucho un enlace por minuto."""
    background.add_task(email_verification.resend_verification_link, data.email)


@router.post("/reset-password/validate", status_code=status.HTTP_204_NO_CONTENT)
def validate_reset_link(data: TokenRequest, session: SessionDep):
    """Dice si el enlace de recuperación sigue valiendo, sin gastarlo."""
    if password_reset.find_valid_user(session, data.token) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=INVALID_LINK)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, session: SessionDep, response: Response):
    token = request.cookies.get(sessions.COOKIE_NAME)
    if token:
        sessions.delete_session(session, token)
    sessions.clear_session_cookie(response)
