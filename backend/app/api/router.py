from fastapi import APIRouter

from app.api.routes import auth, health, statuses, tasks, users

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(statuses.router)
api_router.include_router(tasks.router)
