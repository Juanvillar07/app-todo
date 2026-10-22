# Importa todos los modelos aquí para que Alembic los vea en SQLModel.metadata.
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.task import Priority, Task
from app.models.task_status import TaskStatus
from app.models.user import User
from app.models.user_session import UserSession

__all__ = [
    "EmailVerification",
    "PasswordReset",
    "Priority",
    "Task",
    "TaskStatus",
    "User",
    "UserSession",
]
