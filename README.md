# Portal

`portal/` is the shared source repository and deployable mother Portal. It is a
monorepo: application and feature source are committed here, tested together,
and delivered as one Compose-managed stack with one public web gateway.

## Layout

| Path | Responsibility |
| --- | --- |
| `apps/portal/` | Public Portal web/API. Its current delivered capability is QuantBT Research; later domains extend this shell without becoming separate repositories. |
| `features/roadmap-task-board/` | Roadmap & Task Board UI embedded at `/roadmap-task-board/` and its private FastAPI/SQLite companion at `/roadmap-task-board/api/`. |
| `constraints/` | Shared runtime dependency pins, including `quantbt-engine==1.0.8` from PyPI. |
| `deploy/` | Container images, gateway, image-only production Compose definition and host assets. |

The QuantBT engine is installed from PyPI; no local engine checkout is part of
this repository. Market data, credentials, artifacts and databases are runtime
state and never belong in Git.

## Run the complete Portal

```bash
cp .env.example .env
./scripts/portal verify
./scripts/portal up
```

Open `http://localhost:8080` for the Portal and
`http://localhost:8080/roadmap-task-board/` for Roadmap & Task Board. The
single web service proxies `/api` to the private Portal API and
`/roadmap-task-board/api/` to the private Roadmap API; neither backend gets a
public host port.

Useful commands:

```bash
./scripts/portal status
./scripts/portal logs
./scripts/portal smoke
./scripts/portal down
```

Generic local/CI starts with Historical Market Data disabled. Historical input
is only for backtest/research; realtime feeds and paper-trading state are
separate future services. To enable the target-VPS capability, stage the
approved reader wheel with `scripts/stage-hmd-reader-wheel.sh`, set
`PORTAL_HISTORICAL_DATA_MODE=required`, and mount canonical
`/srv/primus/historical-market-data/storage` read-only through
`PORTAL_HISTORICAL_DATA_DIR`. Source checkouts and `data_loader.py` files are
never mounted into Portal.

## Development and releases

`dev` is the shared development branch. Start each short-lived branch from it,
validate the affected module and commit every completed coherent change right
away. `main` is protected and receives only reviewed, release-ready promotions
from `dev`.

Root CI validates the source directly: contracts, Actions YAML, both Python
backends, both frontends, Roadmap browser parity and the composed Docker smoke
test. Image publishing builds immutable Portal API, Portal web and Roadmap API
images from the same parent commit.

Read [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md),
[operations](docs/operations.md), and [release and deployment](docs/release-and-deployment.md)
before changing runtime boundaries. Backend and cross-service phases also use
the [Backend Architecture Implementation Guide](upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md)
as their staged architecture runway. The history-preserving source migration
is recorded in [the monorepo migration note](docs/migrations/2026-08-13-monorepo-foundation.md).
