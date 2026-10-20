"""Verificación del ID token de "Sign in with Google" (Google Identity Services).

El frontend recibe el ID token directamente de Google (botón oficial) y lo envía aquí. Se comprueba
la firma RS256 con las claves públicas de Google y que el token es para esta app (aud), lo emitió
Google (iss), no ha caducado (exp) y el email está verificado. No hace falta secreto de cliente.
"""

from dataclasses import dataclass
from functools import lru_cache

import jwt

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"]


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str | None


class GoogleUnavailableError(Exception):
    """No se pudieron descargar las claves públicas de Google."""


@lru_cache
def get_google_jwks_client() -> jwt.PyJWKClient:
    # Cachea las claves (1 h); si llega un `kid` desconocido vuelve a pedirlas (Google las rota).
    return jwt.PyJWKClient(GOOGLE_JWKS_URL, cache_keys=True, lifespan=3600)


def verify_google_credential(credential: str, client_id: str) -> GoogleIdentity | None:
    """Datos de la cuenta de Google si el ID token es válido para esta app, o None."""
    try:
        signing_key = get_google_jwks_client().get_signing_key_from_jwt(credential)
    except jwt.PyJWKClientConnectionError as exc:
        raise GoogleUnavailableError(str(exc)) from exc
    except (jwt.PyJWKClientError, jwt.InvalidTokenError):
        return None

    try:
        payload = jwt.decode(
            credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=GOOGLE_ISSUERS,
            options={"require": ["sub", "exp", "iss", "aud", "email"]},
        )
    except jwt.InvalidTokenError:
        return None

    if payload.get("email_verified") is not True:
        return None
    return GoogleIdentity(
        sub=str(payload["sub"]),
        email=str(payload["email"]).lower(),
        name=payload.get("name") or None,
    )
