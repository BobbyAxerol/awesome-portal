# Roadmap & Task Board backend

FastAPI + SQLite backend for Roadmap & Task Board Phase 4. It provides versioned
Task/Roadmap APIs, append-only activity, soft delete, a leased Discord outbox
and the legacy endpoints needed by the existing portal.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m backend.app
.venv/bin/python -m pytest backend/tests
```

- API docs: `http://127.0.0.1:8000/api/docs`
- Liveness / readiness: `/api/health` / `/api/ready`
- Runtime config: [`backend/.env.example`](.env.example)
- Domain, rollout and backup runbook: [`docs/TASK_ROADMAP_BACKEND.md`](../docs/TASK_ROADMAP_BACKEND.md)

SQLite files are runtime data and remain git-ignored. Create a consistent backup
without stopping the API:

```bash
python -m backend.scripts.portal_db backup \
  --database data/portal.db \
  --output backups/portal-$(date +%F).db
```

Do not expose write APIs publicly until the parent portal supplies an approved
access-control boundary. Discord webhook URLs belong only in runtime secrets.
