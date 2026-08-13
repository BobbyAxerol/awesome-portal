# Integration Architecture

`portal/` is an integration repository, not a monorepo. Each application under
`apps/` remains an independent Git repository with its own history, branch
rules, review process and CI. The parent owns only the integration contract:

```text
repos.conf + repos.lock
          │
          ├── apps/quantbt-portal (independent source repository)
          │       ├── quantbt-portal-api
          │       └── quantbt-portal-web
          │
          └── compose.yaml / Dockerfiles / gateway / operational policy
                         │
                         └── one deployable Portal stack
```

## Source and version policy

- `repos.conf` is the catalog: name, relative worktree, canonical origin and
  default branch.
- `repos.lock` is the deployable bill of materials. It records one immutable
  commit per child repository.
- `./scripts/portal sync` fetches remote branches without changing a
  developer's checked-out child branch.
- `./scripts/portal sync --locked` checks child repositories out detached at
  their locked commits. CI uses this mode.
- `./scripts/portal lock` intentionally advances the bill of materials to the
  currently fetched default branches. Review its diff in a parent PR.

The parent `.gitignore` intentionally excludes `apps/*`; never force-add a
child worktree. To promote child work, commit and push it in that child
repository first, then update and commit `repos.lock` in this repository.

## Runtime topology

`compose.yaml` builds checked-out source for local integration and CI smoke
tests. The React/Nginx service is the single public entry point and proxies
`/api` to the private FastAPI service. `deploy/compose.production.yaml` is the
image-only equivalent for a host that pulls images published by CI.

The API has a named artifact volume and receives market-data source through a
read-only host mount. Market data, credentials and generated artifacts are
runtime concerns; none belong in source control or the Docker build context.

## Adding a sub-portal

1. Add its independent repository to `repos.conf` and add a resolved commit to
   `repos.lock`.
2. Add its source Dockerfile and service in `compose.yaml`.
3. Add the image-only service to `deploy/compose.production.yaml`.
4. Give the service a health endpoint and define its ingress/gateway route.
5. Extend `scripts/verify-workspace.sh`, CI tests and operational docs with its
   integration contract.
