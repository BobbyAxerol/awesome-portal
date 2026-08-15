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
  checkout and restricted Primus-only push protect the canonical branch from
  all other accounts.
- `dev` is the shared development branch. Start every `feat/*`, `fix/*`,
  `chore/*`, or `docs/*` branch from current `dev` and merge through
  review. Contributor hooks and the isolated workspace protect it from all
  non-bobby accounts.
- Merge validated work into `dev`; promote `dev` to `main` only through a
  release-ready pull request. Do not force-push, rewrite shared history, or
  bypass hooks. Bobby retains emergency authority when explicitly needed.
- GitHub branch protection is recommended as defense in depth for both `main`
  and `dev`. On primus-origin, do not give a contributor bypass or protected
  branch update permission.

## Contributor identity and authority (required)

- The bobby Linux account is the sole local maintainer and retains full
  authority over the canonical checkout and the BobbyAxerol origin. Actual
  permissions on primus-origin are governed by PrimusSparkQuant; its protected
  branch ruleset gives BobbyAxerol the configured maintainer bypass, never a
  contributor bypass.
- Thanh Vuong and every unknown local account are contributors. They may work
  only in a separate workspace on the explicit feat, fix, chore, or docs branch
  Bobby requested. They must not commit, merge, rebase, or apply a patch on
  main or dev. They may push only that feature branch to primus-origin.
- Contributor agents must read CONTRIBUTOR_AGENT_RULES.md and begin work with
  its explicit confirmation. They may make normal local commits on their
  assigned branch; they may push and open or update a dev pull request only
  when Bobby has asked for the handoff.
- Do not give contributors access to /home/bobby, the canonical Portal .git
  directory, Bobby's SSH keys, sudo, or GitHub write permission on origin.
  Their workspace contains only the primus-origin remote, configured for their
  own GitHub identity. Hooks are guardrails; account isolation and remote
  branch protection are the security boundary.
- Only Bobby provisions a workspace with
  scripts/provision-contributor-workspace.sh. Contributors may create a Primus
  pull request to dev but must never merge it.

## Commit discipline

- Bobby must validate and commit every completed coherent change immediately.
  Keep commits small, single-purpose and descriptive; never leave finished
  unrelated work uncommitted. A contributor commits coherent work normally on
  their assigned feature branch and hands it off through a Primus pull request.
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

- Historical Market Data is a read-only input for backtest/research and any
  future module explicitly granted that capability. It is **not** the source
  for realtime market feeds, paper orders/fills, paper account state or live
  execution; those belong to separate bounded contexts/services.
- Historical consumers install the checksum-verified code-only
  `primus-historical-market-data==0.1.0rc3` wheel and mount only
  `${PORTAL_HISTORICAL_DATA_DIR}:/data:ro` with
  `HISTORICAL_MARKET_DATA_ROOT=/data`. Never add/mount a local `data_loader.py`,
  the Historical Market Data source checkout, collectors, state, logs or
  secrets. Never commit reader wheels or market data.
- QuantBT artifacts and Roadmap SQLite state use named volumes. A public web
  gateway is the single entry point; backend services must not add public ports
  unless an approved architecture change requires one.
- Before modifying a domain, read its local `AGENTS.md`, architecture document
  and tests. Keep domain/backend contracts ahead of presentation changes.
