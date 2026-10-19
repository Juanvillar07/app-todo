# App de Tareas

App de tareas con FastAPI, React y AWS. El plan completo está en [docs/PLAN.md](docs/PLAN.md) y los comandos y convenciones en [CLAUDE.md](CLAUDE.md).

## Arranque local

```bash
cp .env.example .env
docker compose up -d db
```

Backend: `docker compose --profile backend up --build` (API en http://localhost:8000/api/docs).

Frontend: `cd frontend && npm install && npm run dev` y abre http://localhost:5173.

## CI/CD

Tres workflows de GitHub Actions en [.github/workflows](.github/workflows):

| Workflow | Cuándo | Qué hace |
| --- | --- | --- |
| `ci.yml` | Cada PR a `main` | Backend: ruff, pytest contra Postgres y `docker build`. Frontend: lint, typecheck, Vitest y build. Comprueba que `api-schema.d.ts` coincide con la API. Terraform: `fmt` y `validate` |
| `deploy-backend.yml` | Push a `main` que toca `backend/**` | Tests → imagen `linux/arm64` etiquetada con el SHA → ECR → `deploy.sh` en la EC2 vía SSM (migraciones, health check y rollback) |
| `deploy-frontend.yml` | Push a `main` que toca `frontend/**` | Tests y build → `s3 sync` → invalidación de CloudFront |

Los dos deploys también se pueden lanzar a mano desde la pestaña **Actions** (*Run workflow*). Mientras no existan las variables del repo, se saltan sin fallar.

### Configurar GitHub (una vez, después de `terraform apply`)

1. Aplica la infraestructura siguiendo [infra/README.md](infra/README.md).
2. En `infra/main`, obtén los valores:

   ```bash
   terraform output github_variables
   ```

3. En GitHub: **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**, crea una por cada valor. Son variables, no secretos: la autenticación es por OIDC y no hay llaves guardadas.

   | Variable | Origen |
   | --- | --- |
   | `AWS_ROLE_ARN` | Rol que asume GitHub Actions (creado por `bootstrap`) |
   | `AWS_REGION` | Región, p. ej. `us-east-1` |
   | `ECR_REPOSITORY` | Repositorio de imágenes del backend |
   | `EC2_INSTANCE_ID` | Instancia donde corre el backend |
   | `FRONTEND_BUCKET` | Bucket del frontend |
   | `CLOUDFRONT_DISTRIBUTION_ID` | Distribución de CloudFront |
   | `DOCKER_PLATFORM` *(opcional)* | `linux/amd64` solo si cambiaste la EC2 a x86 (`t3.*`) |

4. Opcional pero recomendable: en **Settings → Branches**, protege `main` exigiendo que pasen los checks de CI antes de hacer merge.

### Desplegar

- **Normal:** abre un PR, espera a que el CI esté en verde y haz merge a `main`. Se despliega solo lo que cambió (backend, frontend o ambos).
- **Primera vez o tras recrear la EC2:** lanza los dos deploys a mano desde *Actions → Run workflow*.
- **Comprobar:** la app queda en `terraform output app_url`. Si un deploy del backend falla en el health check, `deploy.sh` vuelve a la imagen anterior y el workflow termina en rojo con los logs del contenedor.
