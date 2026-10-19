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
npm run lint                              # oxlint
npm run typecheck
npm test                                  # Vitest + Testing Library
npm run gen:api                           # regenera src/lib/api-schema.d.ts (backend en marcha)

# infra/<stack>/   (pasos completos en infra/README.md)
terraform fmt -recursive && terraform validate
terraform init -backend=false             # para validar sin credenciales ni backend
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

- Estilo inspirado en Stripe, sin copiarlo: texto azul marino, grises azulados y **un solo color de acento** índigo-violeta (`primary`) para botones, enlaces y la navegación activa. El resto del color se reserva para significado: prioridad (urgente rojo, alta naranja, media azul, baja gris) y el color de cada estado.
- Lienzo gris (`bg-canvas`) en el área de contenido y en login/registro; encima, superficies blancas (`bg-card`) para tarjetas, lista y formularios.
- Mucho espacio en blanco, jerarquía por tamaño y peso tipográfico, no por cajas ni colores. Tipografía Geist (preset Nova de shadcn, base neutral).
- Sin sombras marcadas ni bordes gruesos: como mucho `shadow-xs`/`shadow-sm` en superficies blancas, bordes finos y sutiles. El único degradado es la banda diagonal del acento en login/registro (`AuthLayout`).
- Componentes de shadcn/ui tal cual, sin decoración extra. Iconos `lucide-react` pequeños y solo cuando aportan.
- Pocas acciones visibles a la vez; las secundarias en menús o al pasar el cursor. Estados vacíos breves y útiles.
- Soporte de modo claro y oscuro.
- Llamadas a la API con TanStack Query usando el cliente tipado `api` + `unwrap()` de `lib/api.ts` (openapi-fetch). Tras cambiar la API, `npm run gen:api` y commit del `.d.ts`.
- Formularios con React Hook Form + Zod y los componentes `Field*` de shadcn.
- Sesión: `useAuth()` (`features/auth`). Tema: `useTheme()` de `components/theme-context` (sin next-themes).
- Datos de tareas y estados: hooks de `features/tasks/queries.ts` (claves en `keys`). Mover en el kanban usa `useMoveTask()`, que actualiza la caché de forma optimista y revierte si falla.
- Estado en la URL: el Sheet de tarea se abre con `?task=<id>` / `?task=new&task_status=<id>` y los filtros de la lista son `q`, `status`, `priority`, `sort`, `page`.
- Las pantallas de tareas se cargan con `lazy` en `routes/router.tsx`; `RouteError` cubre errores de ruta (p. ej. chunks viejos tras un deploy).
- Añadir componentes con `npx shadcn@latest add <nombre>`; no editar a mano `components/ui/` salvo necesidad.

## Convenciones de infraestructura

- `bootstrap` (state local): bucket del state + rol OIDC (solo la confianza). Sus permisos los adjunta `main/github.tf` con los ARN exactos.
- Secretos con `ephemeral "random_password"` + argumentos write-only (`password_wo`, `value_wo`); se rotan subiendo `*_version`. Nunca `random_password` normal para secretos.
- Scripts que corren en Linux (`*.sh`, `*.tftpl`) siempre con LF (`.gitattributes`).
- La EC2 es ARM (`t4g`) por defecto: la imagen del backend se construye para `linux/arm64`.
- Tras cambiar proveedores: `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64 -platform=windows_amd64 ...`.

## Flujo de trabajo

- Se avanza **fase por fase** según docs/PLAN.md; planear primero, luego implementar, verificar el criterio de la fase y hacer commit al cerrarla.
- `terraform apply` siempre lo corre el usuario a mano; nunca ejecutarlo desde aquí ni desde CI.
- Nada de secretos en git: `.env` y `terraform.tfvars` están ignorados.
