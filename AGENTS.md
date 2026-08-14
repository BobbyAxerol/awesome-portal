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

- `main` is the stable deployable baseline. Bobby should normally promote a
  reviewed release rather than commit there directly. Contributor hooks reject
  direct commits, merge commits, rebases and patch applies; the isolated
  checkout and push block protect the canonical branch from all other accounts.
- `dev` is the shared development branch. Start every `feat/*`, `fix/*`,
  `chore/*`, or `docs/*` branch from current `dev` and merge through
  review. Contributor hooks and the local-only workspace protect it from all
  non-bobby accounts.
- Merge validated work into `dev`; promote `dev` to `main` only through a
  release-ready pull request. Do not force-push, rewrite shared history, or
  bypass hooks. Bobby retains emergency authority when explicitly needed.
- GitHub branch protection is recommended as defense in depth for both `main`
  and `dev`; BobbyAxerol must remain the sole updater or bypass actor.

## Contributor identity and authority (required)

- The bobby Linux account is the sole local maintainer and retains full
  authority over the canonical checkout and both remotes. The feature-to-dev
  and dev-to-main flow remains the expected release process, but the local
  contributor hooks must never remove Bobby's authority.
- Thanh Vuong and every unknown local account are contributors. They may work
  only in a separate local-only workspace on the explicit feat, fix, chore, or
  docs branch Bobby requested. They must not commit, merge, rebase, or apply a
  patch on main or dev, and they must not push to any remote.
- Contributor agents must read CONTRIBUTOR_AGENT_RULES.md and begin work with
  its explicit confirmation. They may create a local feature-branch commit
  only when Bobby has explicitly asked for a commit; otherwise they hand back
  the working tree without a Git action.
- Do not give contributors access to /home/bobby, the canonical Portal .git
  directory, Bobby's SSH keys, sudo, GitHub write permission, or a configured
  remote in their workspace. Hooks are guardrails; account isolation and
  absent credentials are the security boundary.
- Only Bobby provisions a workspace with
  scripts/provision-contributor-workspace.sh and imports it with
  scripts/import-contributor-branch.sh. Importing a branch is review-only and
  must never auto-merge or push.

## Commit discipline

- Bobby must validate and commit every completed coherent change immediately.
  Keep commits small, single-purpose and descriptive; never leave finished
  unrelated work uncommitted. A contributor makes a local feature-branch
  commit only when Bobby has expressly requested one.
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
