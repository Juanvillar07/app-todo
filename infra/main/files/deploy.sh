#!/bin/bash
# Despliega una imagen del backend en esta EC2. Lo ejecuta GitHub Actions vía SSM:
#   /opt/todo/deploy.sh <tag>      (tag = SHA del commit)
# La configuración (región, ECR, prefijo de SSM, log group) la escribe user_data en /opt/todo/config.
set -euo pipefail

TAG="${1:?Uso: deploy.sh <tag-de-imagen>}"
# shellcheck source=/dev/null
source /opt/todo/config

IMAGE="$ECR_REPO_URL:$TAG"
NAME=todo-backend
ENV_FILE=/opt/todo/backend.env
HEALTH_URL=http://localhost/api/health

log() { echo "[deploy] $*"; }

param() {
  aws ssm get-parameter --region "$AWS_REGION" --name "$SSM_PREFIX/$1" \
    --with-decryption --query Parameter.Value --output text
}

start() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped -p 80:8000 \
    --env-file "$ENV_FILE" \
    --log-driver awslogs \
    --log-opt awslogs-region="$AWS_REGION" \
    --log-opt awslogs-group="$LOG_GROUP" \
    --log-opt awslogs-stream="$NAME-${1##*:}" \
    "$1" >/dev/null
}

healthy() {
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

# 1. Configuración desde Parameter Store, en un archivo que solo puede leer root.
log "Leyendo configuración de $SSM_PREFIX"
umask 077
{
  echo "DATABASE_URL=$(param DATABASE_URL)"
  echo "JWT_SECRET=$(param JWT_SECRET)"
  echo "JWT_EXPIRE_MINUTES=$(param JWT_EXPIRE_MINUTES)"
} > "$ENV_FILE.new"
mv "$ENV_FILE.new" "$ENV_FILE"

# 2. Imagen nueva desde ECR.
log "Descargando $IMAGE"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null
docker pull --quiet "$IMAGE"

# 3. Migraciones en un contenedor temporal. Deben ser compatibles con la versión anterior:
#    si el paso 5 falla y se vuelve atrás, la BD ya quedó migrada.
log "Aplicando migraciones"
docker run --rm --env-file "$ENV_FILE" "$IMAGE" alembic upgrade head

# 4. Reemplaza el contenedor en marcha (recordando cuál era, para el rollback).
PREVIOUS="$(docker inspect --format '{{.Config.Image}}' "$NAME" 2>/dev/null || true)"
log "Arrancando $IMAGE"
start "$IMAGE"

# 5. Health check. Si falla, vuelve a la imagen anterior y termina en error (el workflow falla).
if healthy; then
  log "OK: $IMAGE responde en $HEALTH_URL"
  docker image prune -af --filter "until=168h" >/dev/null || true
  exit 0
fi

log "ERROR: $IMAGE no respondió. Últimos logs:"
docker logs --tail 50 "$NAME" 2>&1 || true
if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$IMAGE" ]; then
  log "Volviendo a $PREVIOUS"
  start "$PREVIOUS"
  if healthy; then log "Rollback OK"; else log "El rollback tampoco responde"; fi
fi
exit 1
