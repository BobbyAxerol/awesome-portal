# Portal Architecture

`portal/` is a monorepo and one deployable Portal. Source ownership is shared
at the Git, review, CI and release level; runtime boundaries remain explicit so
future portal domains can grow without creating a distributed monolith.

```text
Portal monorepo
│
├── apps/portal/                         public Portal shell
│   ├── frontend/                        React/Vite UI
│   ├── backend/                         FastAPI API
│   └── strategy/                        protected QuantBT Research kernel
│
├── features/roadmap-task-board/         embedded management feature
│   ├── frontend/                        compiled at /roadmap-task-board/
│   └── backend/                         private FastAPI + SQLite service
│
├── deploy/                              images, gateway and production Compose
└── compose.yaml                         one local/CI stack
```

## Product and source boundaries

`apps/portal/` is intentionally named for the mother Portal, not for one
research domain. QuantBT Research is its first capability and retains its
audited API/domain boundaries. New domains should be introduced behind a named
module boundary, then connected through explicit contracts rather than direct
cross-domain imports.

Roadmap & Task Board is source-controlled in the same repository but stays an
embedded feature. It does not become a top-level product surface or a second
public entry point. Its local-first UI and optional versioned persistence API
remain scoped to task and roadmap data.

`quantbt-engine==1.0.8` is constrained and installed from PyPI. QuantBT remains
the source of truth for optimization, accounting and metrics; Portal code must
not reimplement those calculations.

## Runtime topology

```text
browser
  │
  ▼
portal-web (only public service)
  ├── /                         Portal React application
  ├── /api/                     ► portal-api:8000
  ├── /roadmap-task-board/      embedded feature assets
  └── /roadmap-task-board/api/  ► roadmap-task-board-api:8000/api/

portal-api                        roadmap-task-board-api
  ├── read-only historical-data mount
  ├── backtest/research consumers  └── named SQLite volume + Discord outbox
  └── named artifact volume
```

The web gateway is the only host-bound service. APIs communicate on the private
`portal` Docker network. Images are built from the same tracked source commit;
production uses the image-only Compose definition and immutable image tags.

The historical-data mount is an explicitly bounded consumer for backtest and
approved research modules. It is not a realtime feed and must not supply paper
execution, paper positions, balances, orders or account state. Those future
capabilities require separate typed providers and independent freshness and
failure contracts.

## Source and release policy

- No nested Git repositories or submodules are permitted below `apps/` or
  `features/`.
- Shared root CI, CodeQL, Dependabot and GitHub branch protection govern all
  source. Nested `.github` automation is not used as a release authority.
- `dev` is the integration-development branch. Feature branches start from
  `dev`; `main` is only for reviewed stable releases.
- Every completed coherent change is validated and committed immediately.
- Real data, credentials, databases, artifacts, caches and build output remain
  ignored. The root verification script rejects tracked generated outputs.

## Adding the next domain

1. Place the new source behind a clear application, feature or package boundary
   in this repository.
2. Define typed backend and frontend contracts before coupling it to an existing
   domain.
3. Add a private service only when it owns an independent runtime/data boundary;
   otherwise compose it into `portal-api` or `portal-web` deliberately.
4. Extend Compose, production Compose, gateway, CI, smoke coverage and docs in
   the same change.
5. Keep backward-compatible public routes while a feature is being moved into
   the Portal shell.

The first migration intentionally keeps QuantBT Research and Roadmap services
modular at runtime. A later, separately reviewed change can extract shared UI,
contracts and module registries after the domains have stable integration tests.
