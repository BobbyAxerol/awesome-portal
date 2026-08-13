# Portal Workspace Agent Rules

This is an **integration repository, not a monorepo**. Deployable apps under
`apps/` and embedded sources under `features/` are independent Git repositories
with their own history, CI and review. The parent owns only the integration
contract: `repos.conf` (catalog) + `repos.lock` (pinned source commits) +
`compose.yaml` + deploy definitions.

## Golden rule: never commit independently tracked source here

`apps/*` and `features/*` are git-ignored; the pre-commit hook rejects staging
their content. To promote source work: commit and push in that source repo,
then run `./scripts/portal lock` and commit the `repos.lock` diff in the
parent.
Run `./scripts/install-git-hooks.sh` once to enable parent hooks.

## Branch model (required)

- `main` is the stable, deployable integration baseline. Do not commit directly
  to it; its only direct commit is the repository bootstrap. Promote reviewed,
  validated work from `dev` to `main` through a pull request.
- `dev` is the shared development integration branch. Never start new work from
  `main`: first update `dev`, then create a short-lived branch from it, for
  example `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, or `docs/<topic>`.
- Merge feature branches into `dev` through review and passing CI. Promote
  `dev` to `main` only when the composed stack is stable and release-ready.
- Do not force-push, rewrite shared branch history, bypass hooks, or merge an
  unreviewed tracked-source revision into `repos.lock`.
- Commit every completed, coherent change immediately after its relevant
  validation passes. Keep commits small and single-purpose with a descriptive
  message; never leave unrelated finished work uncommitted or bundle it into a
  later change. Commit source-repository work in that source first, then
  commit the resulting parent `repos.lock` promotion separately.
- The parent pre-commit hook blocks direct commits on an existing `main` branch.
  GitHub branch protection is the server-side backstop; configure it for both
  `main` and `dev` before allowing collaborators to push.

## Tracked source repositories

- `./scripts/portal sync` fetches and updates tracking branches, does **not**
  switch branches or touch the worktree.
- `./scripts/portal sync --locked` detaches tracked worktrees at `repos.lock`
  (CI uses this; it can replace a developer checkout, so do not run it over
  unpublished work).
- `./scripts/portal lock` rewrites `repos.lock` to configured tracked branches —
  review the diff before committing.
- A `service` source gets a Dockerfile + Compose service, image-only production
  service, health endpoint and ingress route. An `embedded-feature` source is
  compiled into an existing public service and must not add a standalone
  container merely to display its UI. Both roles require a source test/build,
  a lock, and documentation. See `docs/architecture.md`.

## Commands

All developer operations go through `./scripts/portal` (mirrored in `make`):

```bash
cp .env.example .env
./scripts/portal sync && ./scripts/portal verify
./scripts/portal up        # or run/down/logs/status/build/config
./scripts/portal smoke     # isolated stack, port 18080, tears itself down
```

- Requires Docker CLI; `up`/`build`/`smoke` need daemon access (`sudo` or
  docker group). `config` and `verify` only need the CLI.
- `verify` checks manifest/lock consistency, shell syntax, the
  `strategy/PROTECTED_SHA256` contract and rendered Compose config.
  `verify --require-sources` additionally checks tracked repos exist at the
  locked revision (CI mode).
- `docker compose` commands must use `--project-directory <repo>` and
  `-f compose.yaml`; the scripts do this for you.

## Stack-wide pins and data

- `constraints/portal.txt` pins `quantbt-engine==1.0.8` and is applied in CI
  and both Dockerfiles. Keep it aligned with the child's declared dependency.
- Market data mounts read-only from `${PORTAL_MARKET_DATA_DIR:-runtime/market-data}`
  and must contain a compatible `data_loader.py`; never commit real market
  data or credentials. Run artifacts live in the named `portal-artifacts` volume.

## Verification for edits

CI gate (`ci.yml`) for reference: `sync --locked` -> `verify --require-sources`
-> actionlint -> service backend pytest (py3.12) -> service and embedded
frontend `npm ci && npm test && npm run build` -> `portal smoke`. Run
`./scripts/portal verify` before
committing; the pre-commit hook does this too.

For any parent-repository change, work from a branch created from `dev`, run
the relevant checks, and open a PR back to `dev`. A stable integration PR then
promotes `dev` to `main`; do not make ad-hoc edits directly on either release
baseline.

## Current source context

The service repo has its own `apps/quantbt-portal/AGENTS.md` with authoritative
setup, test commands (`./scripts/test_backend.sh` sets PYTHONPATH itself), the
protected `strategy/main.py` kernel rules, and domain/architecture contracts.
Read it before touching anything under `apps/`. The embedded Roadmap & Task
Board source at `features/roadmap-task-board` is mounted at
`/roadmap-task-board/` within the existing web service; its local-first board
and roadmap are not a new runtime control plane.
