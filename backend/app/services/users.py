from sqlmodel import Session, select

from app.core.security import DUMMY_HASH, hash_password, verify_password
from app.models import User
from app.schemas.user import UserCreate
from app.services.statuses import add_default_statuses


def get_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email.lower())).first()


def create_user(session: Session, data: UserCreate) -> User:
    user = User(
        email=data.email.lower(),
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
    )
    session.add(user)
    session.flush()  # inserta el usuario antes que sus estados (FK)
    add_default_statuses(session, user)
    session.commit()
    session.refresh(user)
    return user


def authenticate(session: Session, email: str, password: str) -> User | None:
    user = get_by_email(session, email)
    if user is None:
        verify_password(password, DUMMY_HASH)
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
