# CLAUDE.md

App de tareas con login, estados personalizables por usuario, descripciones en Markdown y prioridades. Plan completo y fases en [docs/PLAN.md](docs/PLAN.md) — léelo antes de empezar una fase.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLModel, Alembic, pydantic-settings, PyJWT, pwdlib[argon2], pytest. Gestionado con `uv`, lint/format con `ruff`. Corre en Docker.
- **Base de datos:** PostgreSQL 16 (Docker en local, RDS en AWS).
- **Frontend:** Vite + React + TypeScript (`strict`), Tailwind + shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, dnd-kit, react-markdown.
- **Infra:** Terraform (`infra/bootstrap`, `infra/main`) en AWS: EC2 + RDS + S3 + CloudFront + ECR + SSM.
- **CI/CD:** GitHub Actions con OIDC (`ci.yml`, `deploy-backend.yml`, `deploy-frontend.yml`).

## Estructura

```
backend/   app/{main.py, core/, db.py, models/, schemas/, api/routes/, services/}, alembic/, tests/
frontend/  src/{components/ui/, features/auth/, features/tasks/, lib/api.ts, routes/}
infra/     bootstrap/ (state + rol OIDC), main/ (la app)
.github/workflows/
docs/PLAN.md
```

## Comandos

```bash
cp .env.example .env                      # una vez
docker compose up -d db                   # Postgres local
docker compose --profile backend up --build   # Postgres + backend en Docker
docker compose --profile backend run --rm backend alembic upgrade head

# backend/  (lee el .env de la raíz)
uv sync
uv run fastapi dev app/main.py            # http://localhost:8000/api/docs
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "mensaje"
uv run pytest                             # usa la BD todo_test (TEST_DATABASE_URL), la crea y migra sola
uv run ruff check . && uv run ruff format .

# frontend/
npm install
npm run dev                               # http://localhost:5173, proxy /api -> :8000
npm run build
npm run lint

# infra/<stack>/
terraform fmt -recursive && terraform validate
```

## Convenciones del backend

- Todas las rutas bajo `/api`. Todo protegido con JWT salvo `/api/auth/*` y `/api/health`.
- **Aislamiento por usuario:** cada consulta filtra por el `user_id` del token. Recurso de otro usuario → **404**, nunca 403.
- Esquemas separados por recurso: `XCreate`, `XUpdate` (todo opcional), `XPublic`. Nunca exponer `hashed_password`.
- Configuración solo por variables de entorno (`pydantic-settings`): `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRE_MINUTES`, `CORS_ORIGINS`.
- Esquema de BD solo con migraciones de Alembic; nunca `create_all` (los tests también migran con Alembic). Nuevos modelos se importan en `app/models/__init__.py`.
- `JWT_SECRET` debe tener al menos 32 caracteres. OpenAPI/Swagger en `/api/docs`.
- Rutas delgadas; la lógica de negocio va en `services/`.
- Tests con pytest contra un Postgres real (el de docker compose / servicio en CI).

## Convenciones del frontend — UI limpia y minimalista

- Paleta neutra (grises de shadcn) con **un solo color de acento**. El color se reserva para significado: prioridad (urgente rojo, alta naranja, media azul, baja gris) y el color de cada estado.
- Mucho espacio en blanco, jerarquía por tamaño y peso tipográfico, no por cajas ni colores. Tipografía Inter o la del sistema.
- Sin sombras marcadas, gradientes ni bordes gruesos; bordes finos y sutiles solo donde separan contenido.
- Componentes de shadcn/ui tal cual, sin decoración extra. Iconos `lucide-react` pequeños y solo cuando aportan.
- Pocas acciones visibles a la vez; las secundarias en menús o al pasar el cursor. Estados vacíos breves y útiles.
- Soporte de modo claro y oscuro.
- Llamadas a la API con TanStack Query desde `lib/api.ts`; formularios con React Hook Form + Zod.

## Flujo de trabajo

- Se avanza **fase por fase** según docs/PLAN.md; planear primero, luego implementar, verificar el criterio de la fase y hacer commit al cerrarla.
- `terraform apply` siempre lo corre el usuario a mano; nunca ejecutarlo desde aquí ni desde CI.
- Nada de secretos en git: `.env` y `terraform.tfvars` están ignorados.
