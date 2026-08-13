# Operations Runbook

## Local integration stack

```bash
./scripts/portal sync
./scripts/portal verify
./scripts/portal up
./scripts/portal status
./scripts/portal logs
```

The expected public health endpoint is `http://localhost:8080/api/health`; the
embedded Roadmap & Task Board is available at
`http://localhost:8080/roadmap-task-board/` from the same web service.
Use `./scripts/portal down` to stop the local stack. `./scripts/portal smoke`
uses a separate Compose project and port, verifies the web/API path, then tears
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

- Market data remains on a host-managed path mounted read-only.
- Run artifacts are persisted in the named `portal-artifacts` volume. Back it
  up before host maintenance or image/Compose migrations.
- Credentials stay in the host environment, secret store or deployment system;
  never add them to `.env.example`, `repos.conf`, `repos.lock` or workflow YAML.
