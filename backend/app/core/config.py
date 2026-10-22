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

    # Correo con Resend. Sin API key no se envía nada: el correo (con su enlace) va al log.
    resend_api_key: str = ""
    # onboarding@resend.dev es el remitente de pruebas de Resend: sin dominio verificado solo
    # entrega al email de la propia cuenta de Resend.
    email_from: str = "Tareas <onboarding@resend.dev>"
    # URL pública del frontend, para los enlaces de los correos.
    app_url: str = "http://localhost:5173"
    password_reset_minutes: int = 2
    email_verification_hours: int = 24

    @property
    def cors_origins_list(self) -> list[str]:
        return _split(self.cors_origins)

    @property
    def app_origins_list(self) -> list[str]:
        return [origin.rstrip("/") for origin in _split(self.app_origins)]


@lru_cache
def get_settings() -> Settings:
    return Settings()
