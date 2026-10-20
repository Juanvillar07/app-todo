from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    # Lee variables de entorno; en local también el .env de la raíz del repo.
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str
    cors_origins: str = ""

    # Sesión en cookie httpOnly.
    # Orígenes (coma) desde los que se aceptan peticiones que modifican datos: protección CSRF.
    app_origins: str = "http://localhost:5173"
    session_days: int = 30
    cookie_secure: bool = False  # true en producción (HTTPS)

    # ID de cliente OAuth de Google. Vacío = login con Google desactivado.
    google_client_id: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return _split(self.cors_origins)

    @property
    def app_origins_list(self) -> list[str]:
        return [origin.rstrip("/") for origin in _split(self.app_origins)]


@lru_cache
def get_settings() -> Settings:
    return Settings()
