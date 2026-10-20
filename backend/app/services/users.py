from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.google import GoogleIdentity
from app.core.security import DUMMY_HASH, hash_password, verify_password
from app.core.sessions import delete_user_sessions
from app.models import User
from app.schemas.user import UserCreate
from app.services.statuses import add_default_statuses


def get_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email.lower())).first()


def _create(session: Session, user: User) -> User:
    session.add(user)
    session.flush()  # inserta el usuario antes que sus estados (FK)
    add_default_statuses(session, user)
    session.commit()
    session.refresh(user)
    return user


def create_user(session: Session, data: UserCreate) -> User:
    return _create(
        session,
        User(
            email=data.email.lower(),
            full_name=data.full_name,
            hashed_password=hash_password(data.password),
        ),
    )


def authenticate(session: Session, email: str, password: str) -> User | None:
    user = get_by_email(session, email)
    if user is None or user.hashed_password is None:
        # Sin usuario, o cuenta solo de Google: mismo tiempo de respuesta que un fallo normal.
        verify_password(password, DUMMY_HASH)
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def get_or_create_from_google(session: Session, identity: GoogleIdentity) -> User:
    """Usuario de una cuenta de Google: el ya enlazado, uno existente con el mismo email
    (se enlaza) o uno nuevo con sus estados por defecto."""
    user = session.exec(select(User).where(User.google_sub == identity.sub)).first()
    if user is not None:
        return user

    user = get_by_email(session, identity.email)
    if user is not None:
        # Enlace por email (Google lo ha verificado). La app no verifica emails al registrarse,
        # así que alguien pudo crear antes esta cuenta con un email ajeno: se anulan su contraseña
        # y sus sesiones para que solo el dueño real del email (vía Google) pueda entrar.
        user.google_sub = identity.sub
        user.hashed_password = None
        user.full_name = user.full_name or identity.name
        delete_user_sessions(session, user)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    try:
        return _create(
            session,
            User(email=identity.email, full_name=identity.name, google_sub=identity.sub),
        )
    except IntegrityError:
        # Dos peticiones simultáneas con la misma cuenta nueva: la otra ya la creó.
        session.rollback()
        user = session.exec(select(User).where(User.google_sub == identity.sub)).first()
        if user is None:
            raise
        return user
