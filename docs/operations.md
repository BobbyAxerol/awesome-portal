# Operations Runbook

## Local Portal stack

```bash
./scripts/portal verify
./scripts/portal up
./scripts/portal status
./scripts/portal logs
```

The expected public health endpoint is `http://localhost:8080/api/health`; the
embedded Roadmap & Task Board is available at
`http://localhost:8080/roadmap-task-board/` from the same web service. Its
private API is reached only through
`http://localhost:8080/roadmap-task-board/api/ready`; it is not bound to a host
port. Use `./scripts/portal down` to stop the local stack.
`./scripts/portal smoke` uses a separate Compose project and port, verifies
route → V1 task create → transition → activity through the gateway, then tears
that isolated stack down.

## Production checks

```bash
docker compose --env-file .env.production -f deploy/compose.production.yaml ps
curl --fail http://127.0.0.1:8080/api/health
docker compose --env-file .env.production -f deploy/compose.production.yaml logs --tail=200
```

Use the actual reverse-proxy URL for the external health check. Do not treat a
container being `Up` as sufficient; both Compose health checks must be healthy.

## Data and artifact handling

- Historical OHLCV used by backtest and approved research modules remains on a
  host-managed path mounted read-only. It is not a source for realtime market
  data or paper-trade execution/account state.
- Run artifacts are persisted in the named `portal-artifacts` volume. Back it
  up before host maintenance or image/Compose migrations.
- Roadmap state is persisted independently in `roadmap-task-board-data`. Before
  enabling V1 for a shared workspace, make a SQLite backup using its documented
  `backend.scripts.portal_db` command; do not treat Docker build cache cleanup
  as a data cleanup operation.
- Credentials stay in the host environment, secret store or deployment system;
  never add them to `.env.example` or workflow YAML.
