from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()  # Argon2

# Hash fijo para comparar cuando el usuario no existe y así igualar tiempos de respuesta.
DUMMY_HASH = password_hash.hash("dummy-password")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)
