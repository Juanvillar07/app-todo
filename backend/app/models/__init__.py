# Importa todos los modelos aquí para que Alembic los vea en SQLModel.metadata.
from app.models.task import Priority, Task
from app.models.task_status import TaskStatus
from app.models.user import User

__all__ = ["Priority", "Task", "TaskStatus", "User"]
