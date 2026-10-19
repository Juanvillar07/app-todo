# App de Tareas

App de tareas con FastAPI, React y AWS. El plan completo está en [docs/PLAN.md](docs/PLAN.md) y los comandos y convenciones en [CLAUDE.md](CLAUDE.md).

## Arranque local

```bash
cp .env.example .env
docker compose up -d db
```

Backend: `docker compose --profile backend up --build` y abre http://localhost:8000/api/docs. El frontend llega en la fase 3.
