# Portal Monorepo Agent Rules

`portal/` is the shared source repository and deployable mother Portal. Source
under `apps/` and `features/` is intentionally tracked in this Git history; do
not create nested Git repositories, submodules, or independent lockfiles there.
The Portal deploys as one Compose-managed stack, even when its modules retain
their own private runtime services.

## Source layout and boundaries

- `apps/portal/` is the public Portal application. Its first delivered domain
  is QuantBT Research, but it is the shell that later portal domains extend.
- `features/roadmap-task-board/` is a tracked Portal feature embedded at
  `/roadmap-task-board/`. Its optional FastAPI/SQLite companion remains private
  behind the Portal gateway.
- Future domains belong in a clearly named `apps/`, `features/`, or `packages/`
  boundary, with explicit API and UI contracts. Do not turn route handlers into
  cross-domain import hubs.
- `quantbt-engine==1.0.8` is installed from PyPI. Do not add a sibling QuantBT
  engine checkout or vendor its source.
- `apps/portal/strategy/main.py` is a protected strategy kernel. Never edit it;
  validate `strategy/PROTECTED_SHA256` whenever touching the QuantBT app.

## Branch model (required)

- `main` is the stable deployable baseline. Do not commit directly to it.
- `dev` is the shared development branch. Start every `feat/*`, `fix/*`,
  `chore/*`, or `docs/*` branch from current `dev` and merge through review.
- Merge validated work into `dev`; promote `dev` to `main` only through a
  release-ready pull request. Do not force-push, rewrite shared history, or
  bypass hooks.
- GitHub branch protection is required for both `main` and `dev`.

## Remote policy (required)

- `origin` (`BobbyAxerol/awesome-portal`) is the canonical working remote.
  Push normal feature branches, reviewed promotions and ongoing development
  there.
- `primus-origin` (`PrimusSpark/awesome-primus-portal`) is an intermittent
  source-preservation mirror, not a development upstream. Do not set local
  branches to track it and do not mirror every ordinary change there.
- Mirror only when explicitly requested. First fetch and compare refs; then
  push all local Portal branches and archive/release tags atomically, without
  `--force` and without deleting remote refs that are absent locally. If a
  remote ref is not a fast-forward, stop and report it rather than rewriting
  history.

## Commit discipline

- Every completed coherent change must be validated and committed immediately.
  Keep commits small, single-purpose and descriptive; never leave finished
  unrelated work uncommitted.
- Do not commit credentials, market data, artifacts, databases, virtual
  environments, dependency caches, generated reports, or local configuration.
  Version only documented examples/templates.

## Commands

All stack operations go through `./scripts/portal` (mirrored in `make`):

```bash
cp .env.example .env
./scripts/portal verify
./scripts/portal up        # or run/down/logs/status/build/config
./scripts/portal smoke     # isolated stack, port 18080, tears itself down
```

- Docker Compose commands use `--project-directory <repo>` and `compose.yaml`
  through the helper script.
- `verify` checks tracked source boundaries, protected strategy integrity,
  shell syntax and both rendered Compose definitions.
- The normal CI gate is: verify -> actionlint -> Python tests -> frontend
  tests/builds -> composed smoke test.

## Runtime data and deployment

- Market data mounts are read-only from
  `${PORTAL_MARKET_DATA_DIR:-runtime/market-data}` and must contain a compatible
  `data_loader.py`; never commit real market data or credentials.
- QuantBT artifacts and Roadmap SQLite state use named volumes. A public web
  gateway is the single entry point; backend services must not add public ports
  unless an approved architecture change requires one.
- Before modifying a domain, read its local `AGENTS.md`, architecture document
  and tests. Keep domain/backend contracts ahead of presentation changes.
