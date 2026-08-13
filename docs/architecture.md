# Integration Architecture

`portal/` is an integration repository, not a monorepo. Each deployable
application under `apps/` and each embedded UI source under `features/` remains
an independent Git repository with its own history, branch rules, review
process and CI. The parent owns only the integration contract:

```text
repos.conf + repos.lock
          │
          ├── apps/quantbt-portal [service]
          │       ├── quantbt-portal-api
          │       └── quantbt-portal-web
          │
          ├── features/roadmap-task-board [embedded-feature]
          │       ├── static Roadmap & Task Board mounted at /roadmap-task-board/
          │       └── private Roadmap API mounted at /roadmap-task-board/api/
          │
          └── compose.yaml / Dockerfiles / gateway / operational policy
                         │
                         └── one deployable Portal stack
```

## Source and version policy

- `repos.conf` is the catalog: name, relative worktree, canonical origin,
  tracked branch and role (`service` or `embedded-feature`).
- `repos.lock` is the deployable bill of materials. It records one immutable
  commit per tracked source repository.
- `./scripts/portal sync` fetches remote branches without changing a
  developer's checked-out child branch.
- `./scripts/portal sync --locked` checks source repositories out detached at
  their locked commits. CI uses this mode.
- `./scripts/portal lock` intentionally advances the bill of materials to the
  configured tracked branches. Review its diff in a parent PR.

The parent `.gitignore` intentionally excludes `apps/*` and `features/*`; never
force-add a source worktree. To promote source work, commit and push it in that
source repository first, then update and commit `repos.lock` in this
repository.

## Runtime topology

`compose.yaml` builds checked-out source for local integration and CI smoke
tests. The React/Nginx service is the single public entry point and proxies
`/api` to the private QuantBT FastAPI service. It compiles
`features/roadmap-task-board/frontend` into the same image and serves it at
`/roadmap-task-board/`. Roadmap's stateful FastAPI companion has its own
private container and SQLite volume; Nginx exposes it only through
`/roadmap-task-board/api/`, without overlapping the QuantBT `/api` namespace
or creating another public service.
`deploy/compose.production.yaml` is the image-only equivalent for a host that
pulls images published by CI.

The API has a named artifact volume and receives market-data source through a
read-only host mount. Market data, credentials and generated artifacts are
runtime concerns; none belong in source control or the Docker build context.

## Adding a deployable sub-portal

1. Add its independent repository to `repos.conf` and add a resolved commit to
   `repos.lock`.
2. Add its source Dockerfile and service in `compose.yaml`.
3. Add the image-only service to `deploy/compose.production.yaml`.
4. Give the service a health endpoint and define its ingress/gateway route.
5. Extend `scripts/verify-workspace.sh`, CI tests and operational docs with its
   integration contract.

## Adding an embedded feature

1. Add the repository to `repos.conf` with role `embedded-feature` and pin it
   in `repos.lock`.
2. Build its source into an existing public image and expose a route. If it
   owns mutable state, add a private companion service with a persistent volume
   and a unique gateway prefix; do not expose another public port.
3. Keep the feature local-first unless its own parent-approved API contract is
   enabled; never proxy it to an unrelated API merely because it shares a hostname.
4. Test the feature source independently in CI and add a route/API probe to the
   composed smoke test.
