# Plan: App de Tareas (FastAPI + React + AWS)

Oct 18, 2026 · @Juan José VIllar

## Resumen

Una app de tareas con login, estados personalizables, descripciones largas en Markdown y prioridades, desplegada en AWS con Terraform y GitHub Actions. El objetivo es un proyecto de prueba que sea barato, sencillo de mantener y que aun así siga buenas prácticas.

**Decisiones clave**

- **Backend:** FastAPI + SQLModel + Alembic en Docker, corriendo en una EC2.
- **Base de datos:** PostgreSQL en RDS, en subred privada, solo accesible desde la EC2.
- **Frontend:** build estático de React (Vite) en S3, servido por CloudFront.
- **Un solo dominio:** CloudFront sirve el frontend y reenvía `/api/*` a la EC2. Así obtienes HTTPS gratis y te evitas CORS.
- **CI/CD:** tres workflows de GitHub Actions (CI, deploy backend, deploy frontend), autenticados en AWS con OIDC, sin llaves guardadas.
- **Terraform:** se aplica a mano desde tu máquina; el pipeline solo despliega código.

**Cómo usar este documento con Claude Code**

1. Exporta este doc a Markdown y guárdalo en la raíz del repo como `docs/PLAN.md`.
2. Pídele a Claude Code que cree un `CLAUDE.md` resumiendo stack, comandos y convenciones de la sección de arquitectura.
3. Avanza fase por fase con los prompts de la sección "Fases de implementación". Revisa y haz commit al final de cada fase antes de pasar a la siguiente.

## Arquitectura y estructura del repo

Todo el tráfico del usuario entra por CloudFront: las rutas normales van al bucket S3 con el frontend y `/api/*` va a la EC2, que es la única que habla con RDS.

&#91;embedded content: arquitectura en AWS · tráfico y despliegues\]

RDS solo acepta conexiones desde la EC2, y la EC2 solo desde CloudFront; GitHub Actions despliega sin llaves SSH.

Un solo repositorio (monorepo) con esta estructura:

```
todo-app/
├── backend/
│   ├── app/
│   │   ├── main.py            # crea la app FastAPI y monta routers en /api
│   │   ├── core/              # config (pydantic-settings), seguridad (JWT, hash)
│   │   ├── db.py              # engine y get_session
│   │   ├── models/            # tablas SQLModel
│   │   ├── schemas/           # modelos de entrada/salida (Create, Update, Public)
│   │   ├── api/routes/        # auth.py, users.py, statuses.py, tasks.py
│   │   └── services/          # lógica de negocio
│   ├── alembic/               # migraciones
│   ├── tests/
│   ├── Dockerfile
│   └── pyproject.toml         # gestionado con uv
├── frontend/
│   ├── src/
│   │   ├── components/ui/     # componentes de shadcn
│   │   ├── features/auth/     # login, registro, contexto de sesión
│   │   ├── features/tasks/    # lista, kanban, formulario, detalle
│   │   ├── lib/api.ts         # cliente HTTP con el token
│   │   └── routes/            # rutas y rutas protegidas
│   └── package.json
├── infra/
│   ├── bootstrap/             # bucket del state + rol OIDC de GitHub
│   └── main/                  # VPC, EC2, RDS, S3, CloudFront, ECR, SSM
├── .github/workflows/         # ci.yml, deploy-backend.yml, deploy-frontend.yml
├── docker-compose.yml         # Postgres + backend para desarrollo local
├── CLAUDE.md
└── docs/PLAN.md
```

En local: `docker compose up` levanta Postgres y el backend; el frontend corre con `npm run dev` usando un proxy de Vite hacia `/api`, igual que en producción.

## Backend: modelo de datos y API

Tres tablas cubren todos los requerimientos: los estados son una tabla propia por usuario (así cada quien crea los suyos) y la prioridad es un enum fijo.

| Tabla | Campos | Notas |
| --- | --- | --- |
| `user` | id (UUID), email (único), full\_name, hashed\_password, is\_active, created\_at | Hash con Argon2 (`pwdlib`) |
| `task_status` | id, user\_id → user, name, color, position, is\_default, is\_done | Al registrarse se crean "Por hacer", "En progreso" y "Hecho". `is_done` marca los estados de cierre |
| `task` | id, user\_id → user, status\_id → task\_status, title (200), description (TEXT, Markdown), priority, due\_date, position, created\_at, updated\_at | `priority`: enum `low`, `medium`, `high`, `urgent`. Índices en (user\_id, status\_id) y (user\_id, priority) |

**Endpoints** (todos bajo `/api`, todos protegidos con JWT excepto auth y health):

| Método y ruta | Qué hace |
| --- | --- |
| `POST /auth/register` | Crea usuario y sus estados por defecto |
| `POST /auth/login` | OAuth2 password flow, devuelve access token JWT |
| `GET /users/me` | Usuario actual |
| `GET/POST /statuses` | Listar y crear estados |
| `PATCH/DELETE /statuses/{id}` | Editar o borrar. Al borrar, pide un estado destino para mover sus tareas |
| `PUT /statuses/reorder` | Reordenar columnas |
| `GET /tasks` | Filtros: `status_id`, `priority`, `q` (búsqueda), `sort`, paginación con `limit`/`offset` |
| `POST /tasks`, `GET/PATCH/DELETE /tasks/{id}` | CRUD de tareas |
| `PATCH /tasks/{id}/move` | Cambiar estado y posición (para el kanban) |
| `GET /health` | Health check sin auth, lo usa el deploy |

**Reglas que Claude Code debe respetar**

- Cada consulta filtra por `user_id` del token: un usuario nunca ve ni toca datos de otro (devolver 404, no 403).
- Esquemas separados: `TaskCreate`, `TaskUpdate` (todo opcional), `TaskPublic`. Nunca exponer `hashed_password`.
- Configuración solo por variables de entorno con `pydantic-settings`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRE_MINUTES`, `CORS_ORIGINS`.
- Esquema de BD solo con migraciones de Alembic, nunca `create_all` en producción.
- Tests con pytest contra un Postgres real (servicio de Docker en local y en CI): registro, login, aislamiento entre usuarios, CRUD y filtros.

## Frontend y dónde alojarlo

Recomendación: **S3 + CloudFront**, gestionado con el mismo Terraform. Es casi gratis para una app de prueba, todo queda en AWS y CloudFront resuelve HTTPS y el ruteo de `/api` hacia la EC2.

| Opción | A favor | En contra |
| --- | --- | --- |
| **S3 + CloudFront** (recomendada) | Todo en Terraform, un solo dominio con el backend, costo mínimo | Más piezas que configurar la primera vez |
| AWS Amplify Hosting | Conecta el repo y despliega solo, previews por rama | Menos control; el ruteo de `/api` a la EC2 es menos directo |
| Vercel o Netlify | Lo más fácil, previews gratis | Queda fuera de AWS y de Terraform; necesitas HTTPS en la EC2 por tu cuenta |

**Stack del frontend**

- Vite + React + TypeScript (modo `strict`).
- shadcn/ui con Tailwind: `Card`, `Dialog`, `Sheet`, `Select`, `Badge`, `Form`, `Sonner` para notificaciones.
- React Router para rutas, con `ProtectedRoute` que redirige a `/login` sin token.
- TanStack Query para llamadas a la API, caché e invalidación.
- React Hook Form + Zod para formularios y validación.

**Pantallas**

1. Login y registro.
2. Tablero kanban: una columna por estado, arrastrar tareas entre columnas con `dnd-kit`.
3. Vista lista con filtros por estado y prioridad, búsqueda y orden.
4. Detalle o formulario de tarea en un `Sheet` lateral: título, prioridad, estado, fecha límite y descripción larga en Markdown con pestaña de vista previa (`react-markdown`).
5. Configuración de estados: crear, renombrar, cambiar color y reordenar.

La prioridad se muestra como `Badge` de color (urgente en rojo, alta en naranja, media en azul, baja en gris). El token JWT se guarda en memoria y `localStorage` para este proyecto de prueba; en la sección de recomendaciones está la alternativa más segura con cookies.

## Infraestructura AWS con Terraform

Dos stacks de Terraform: `bootstrap` se aplica una sola vez (state y permisos para GitHub) y `main` contiene la app. Para mantener el costo bajo no hay NAT Gateway ni balanceador.

**infra/bootstrap** (state local, se aplica una vez)

- Bucket S3 para el state de Terraform, con versionado y cifrado. El bloqueo usa `use_lockfile = true` del backend S3 (Terraform 1.10 o superior), sin DynamoDB.
- Proveedor OIDC de GitHub y un rol IAM que solo puede asumir tu repo en la rama `main`, con permisos para: push a ECR, `ssm:SendCommand` sobre la EC2, `s3:Sync` al bucket del frontend e invalidar CloudFront.

**infra/main** (state remoto en el bucket anterior)

| Recurso | Configuración |
| --- | --- |
| VPC | 2 subredes públicas (EC2) y 2 privadas (RDS, exige 2 zonas), sin NAT |
| EC2 | `t4g.small` o `t3.small`, Amazon Linux 2023, Elastic IP, rol IAM con SSM y lectura de ECR y Parameter Store. `user_data` instala Docker y deja un script `deploy.sh` |
| Security group EC2 | Puerto 80 solo desde el prefix list gestionado de CloudFront. Sin puerto 22: el acceso es por SSM Session Manager |
| RDS | PostgreSQL 16, `db.t4g.micro`, 20 GB gp3, subred privada, sin acceso público, backups de 7 días, cifrado |
| Security group RDS | Puerto 5432 solo desde el security group de la EC2 |
| ECR | Repositorio `todo-backend`, política que conserva las últimas 10 imágenes |
| SSM Parameter Store | `DATABASE_URL` y `JWT_SECRET` como `SecureString` (contraseña generada con `random_password`) |
| S3 frontend | Bucket privado, acceso solo vía CloudFront con Origin Access Control |
| CloudFront | Origen S3 por defecto; comportamiento `/api/*` hacia la DNS de la EC2 sin caché y reenviando el header `Authorization`; respuestas 403/404 de S3 → `index.html` para el router de React |
| CloudWatch | Grupo de logs para el contenedor y alarma de CPU de la EC2 |

**Outputs:** URL de CloudFront, ID de la instancia, URL de ECR, nombre del bucket, ID de la distribución y ARN del rol de GitHub. Estos valores van como variables del repo en GitHub.

**Convenciones:** variables en `variables.tf` con `terraform.tfvars` fuera de git, tags comunes con `default_tags`, región por variable (por ejemplo `us-east-1`), y `terraform fmt` + `terraform validate` antes de cada commit.

## CI/CD con GitHub Actions

Tres workflows y nada más: CI en cada pull request, y un deploy por cada parte que solo corre cuando cambian sus archivos en `main`.

| Workflow | Cuándo corre | Qué hace |
| --- | --- | --- |
| `ci.yml` | Pull request a `main` | Backend: `ruff`, `pytest` con servicio Postgres. Frontend: `npm ci`, lint, `tsc --noEmit`, `vite build`. Infra: `terraform fmt -check` y `validate` |
| `deploy-backend.yml` | Push a `main` con cambios en `backend/**` | Corre tests, construye la imagen Docker con tag del commit, la sube a ECR y ejecuta `deploy.sh` en la EC2 vía `aws ssm send-command` |
| `deploy-frontend.yml` | Push a `main` con cambios en `frontend/**` | `npm ci && npm run build`, `aws s3 sync dist/ --delete` e invalidación de CloudFront |

**Qué hace `deploy.sh` en la EC2**

1. Lee `DATABASE_URL` y `JWT_SECRET` de Parameter Store.
2. Hace pull de la imagen nueva desde ECR.
3. Ejecuta `alembic upgrade head` con un contenedor temporal.
4. Reemplaza el contenedor en marcha (`docker run -d --restart unless-stopped -p 80:8000`).
5. Espera a que `/api/health` responda 200; si falla, vuelve a la imagen anterior y el workflow termina en error.

**Autenticación:** los workflows usan `aws-actions/configure-aws-credentials` con OIDC y el rol creado en `bootstrap`. En GitHub solo guardas variables (no secretos): `AWS_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, `EC2_INSTANCE_ID`, `FRONTEND_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.

**Fuera del pipeline a propósito:** `terraform apply` se corre a mano. Cuando el proyecto crezca, el siguiente paso natural es un workflow que publique el `terraform plan` como comentario en el PR.

## Fases de implementación (prompts para Claude Code)

Siete fases, cada una termina en algo que se puede probar. Empieza cada sesión con: *"Lee docs/PLAN.md y CLAUDE.md. Vamos con la fase N."* y usa modo plan (Shift+Tab) para revisar su plan antes de que escriba código.

**Fase 0 · Base del repo**

> Crea el monorepo según la sección "Arquitectura y estructura del repo" de docs/PLAN.md: carpetas, `.gitignore`, `docker-compose.yml` con Postgres 16, `CLAUDE.md` con stack, comandos (`uv run`, `npm run dev`, tests) y convenciones. No escribas lógica todavía.

- [ ] `docker compose up db` levanta Postgres

**Fase 1 · Backend: auth**

> Inicializa el backend con uv: FastAPI, SQLModel, Alembic, pydantic-settings, PyJWT, pwdlib\[argon2\], pytest. Implementa el modelo `user`, la migración inicial, `POST /api/auth/register`, `POST /api/auth/login` (OAuth2 password flow), `GET /api/users/me` y `GET /api/health`. Escribe tests con un Postgres real y un Dockerfile multi-stage.

- [ ] Tests en verde y registro/login funcionando en `/docs`

**Fase 2 · Backend: estados y tareas**

> Implementa `task_status` y `task` según la sección "Backend" del plan, con sus migraciones, los estados por defecto al registrarse y todos los endpoints de la tabla. Respeta el aislamiento por usuario. Añade tests de CRUD, filtros, reordenar y aislamiento entre dos usuarios.

- [ ] Cobertura de los endpoints de tareas y estados en tests

**Fase 3 · Frontend: base y auth**

> Crea el frontend con Vite + React + TS, configura Tailwind y shadcn/ui, React Router, TanStack Query y un cliente API con proxy de Vite a `/api`. Implementa login, registro, contexto de sesión, `ProtectedRoute` y un layout con barra lateral.

- [ ] Puedo registrarme, entrar y salir contra el backend local

**Fase 4 · Frontend: tareas**

> Implementa el tablero kanban con dnd-kit, la vista lista con filtros, el `Sheet` de crear/editar tarea con editor Markdown y vista previa, badges de prioridad y la pantalla de gestión de estados. Usa React Hook Form + Zod y actualizaciones optimistas al mover tareas.

- [ ] Flujo completo de tareas funcionando en local

**Fase 5 · Infraestructura**

> Escribe `infra/bootstrap` e `infra/main` en Terraform según la sección de infraestructura. Incluye el `user_data` de la EC2 y `deploy.sh`. No ejecutes `apply`: solo `fmt`, `validate` y dime los comandos que debo correr y en qué orden.

- [ ] `terraform apply` de ambos stacks hecho a mano y outputs anotados

**Fase 6 · CI/CD**

> Crea `ci.yml`, `deploy-backend.yml` y `deploy-frontend.yml` según la sección de CI/CD, usando OIDC y las variables de repo indicadas. Añade un README con cómo configurar las variables en GitHub y cómo desplegar.

- [ ] Un PR pasa CI y un merge a `main` despliega y responde en la URL de CloudFront

## Recomendaciones extra

Las marcadas "Ya" son baratas y conviene meterlas desde el inicio; las de "Después" valen la pena cuando la app deje de ser de prueba.

| Área | Recomendación | Cuándo | Por qué |
| --- | --- | --- | --- |
| Backend | `uv` + `ruff` + `pre-commit` | Ya | Dependencias rápidas y reproducibles, formato y lint automáticos |
| Backend | Alembic para migraciones | Ya | SQLModel no migra solo; sin esto cada cambio de esquema es manual |
| Frontend | Cliente TypeScript generado del OpenAPI de FastAPI (`orval` o `openapi-ts`) | Ya | Tipos del backend y frontend siempre sincronizados |
| Frontend | Vitest + Testing Library | Ya | Tests de componentes y hooks con poca configuración |
| Infra | Alarma de presupuesto con AWS Budgets | Ya | Te avisa por correo si el gasto se dispara |
| Infra | Logs del contenedor a CloudWatch (driver `awslogs`) | Ya | Ver errores sin entrar a la EC2 |
| Seguridad | Refresh token en cookie `httpOnly` + access token corto | Después | Más seguro que guardar el JWT en `localStorage` |
| Seguridad | Rate limiting en login (`slowapi`) | Después | Frena ataques de fuerza bruta |
| Calidad | Playwright para pruebas end-to-end | Después | Prueba login, crear tarea y moverla en un navegador real |
| Observabilidad | Sentry en backend y frontend | Después | Errores con stack trace y contexto del usuario |
| Infra | Dominio propio con Route 53 + certificado ACM en CloudFront | Después | URL legible y HTTPS con tu dominio |
| Infra | AWS WAF en CloudFront | Después | Bloquea bots y patrones de ataque comunes |
| Infra | Entornos `staging` y `prod` con carpetas por entorno | Después | Probar antes de producción |
| Infra | Migrar el backend a ECS Fargate o App Runner | Después | Escala solo, sin parchear el servidor, deploys sin cortes |
| Producto | Etiquetas, subtareas, recordatorios, comentarios y adjuntos en S3 | Después | Funcionalidad típica de un gestor de tareas |

**Costo:** con EC2 `small`, RDS `micro` y tráfico bajo, el gasto principal son esas dos instancias corriendo 24/7. Revisa el estimado en la [calculadora de AWS](https://calculator.aws/) y destruye el entorno con `terraform destroy` cuando no lo uses.
