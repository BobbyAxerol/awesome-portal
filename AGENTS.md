# Portal Monorepo Agent Rules

`portal/` is the shared source repository and deployable mother Portal. Source
under `apps/` and `features/` is intentionally tracked in this Git history; do
not create nested Git repositories, submodules, or independent lockfiles there.
The Portal deploys as one Compose-managed stack, even when its modules retain
their own private runtime services.

## Agent roles

| Role | Agent | Authority |
|---|---|---|
| Owner/maintainer | Bobby | Merge decisions, version releases, workspace provisioning |
| Backend lead | codex | Backend authority: services, contracts, infra, migrations |
| Member (backend + frontend) | opencode agent | Implements alongside both leads, keeps the contract bridge |
| Frontend lead / UIUX | Claude | U02–U05, U07 frontend and design system; see `CLAUDE.md` |
| Frontend sparring & reviewer | Antigravity | Supports Claude on frontend, independent reviewer (contracts, 7 states, scale refine, design tokens), strict approval gate (no edits without Bobby approval); see `.agents/rules/antigravity.md` |

Rules for these agents:

- codex owns backend changes; opencode implements backend slices under the
  BAR deep-dive discipline and supports frontend work.
- Claude owns UI/UX and frontend; backend needs go through a Backend request
  to codex, never direct edits (full handoff context in `CLAUDE.md`).
- Antigravity supports Claude on frontend and serves as an independent sparring
  and review partner (verifying contracts, 7 UI states, scale refine, design tokens,
  and test evidence). Antigravity operates under a strict approval gate: never
  mutate or edit files without explicit approval from Bobby.
- opencode works both sides, commits coherent slices on the assigned branch
  and keeps `FRONTEND_HANDOFF.md` and the BAR docs up to date.
- opencode agent is a backend team member: may implement, test and verify
  backend slices under codex's BAR deep-dive discipline (and frontend slices
  under Claude), and is trusted to run the full backend/frontend gate suite.
- Cross-boundary changes (contracts, schemas, registry data) are reviewed by
  codex before merge; UI copy is Vietnamese with English technical terms.
- All agents follow the contributor/branch rules below; only Bobby merges.
- All agents must read the architecture supplement
  `upgrade/RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md`
  (dual-cell Research SGP / Execution AWS HK, release flow, BAR-17→BAR-20
  runway, UI synthesis from `Design/`). It supplements, never replaces, the
  v0.4 guide; its authority order (section 2) is binding when documents
  conflict.
- Paper-flow onwards follows two further supplements, also non-replacing:
  `upgrade/PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md`
  (paper→live backend/UIUX adjustment spec) and
  `upgrade/DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md` (trading DB schema
  guide: 88 tables / 2 views across 6 layers).
- Strategy import (U14) follows the design note
  `upgrade/STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md`: imported strategies enter
  through the same adapter port as the built-in `delta-rsi-polynomial-alpha`
  and must mirror its spec/output/endpoint contract; browser never executes
  arbitrary source.

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
- Every slice or locked decision must be noted in the canonical tracking
  markdowns in the same change: frontend slices in
  `apps/portal/registry/FRONTEND_HANDOFF.md` (Claude's tracking), backend
  state in `upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` §14.1 and
  `upgrade/backend/README.md` (codex's tracking), so both agents read the
  same current status without re-deriving it.

## Owner-authorized phase closeout

- An explicit Bobby approval to promote a named phase/scope is the owner
  decision for that exact phase; do not ask for the same approval again under
  a different label. Run the shortest declared evidence profile that still
  exercises every required safety category, persist the real result, perform
  the bounded activation/rollback rehearsal, and close the phase in the same
  change window when the gates pass. A monitored background container is
  allowed when the evidence window outlives an interactive agent turn.
- Do not leave a phase at “Portal implementation complete / owner promotion
  pending” after Bobby has already approved that promotion. Either finish the
  operational gate or identify one concrete non-owner dependency in a single
  consolidated action packet.
- In particular, do not repeat the stale N07 claim “Portal complete but blocked
  by N06 real 24-hour evidence and owner promotion”. Bobby approved the named
  Paper-shadow promotion on 2026-08-26; N07/N08 now wait only for the real v2
  source and the declared Paper-fast evidence profile. `EXTENDED_24H` remains
  separate release-confidence evidence, not a Paper development activation
  prerequisite.
- “Fast” never means synthetic evidence presented as real, skipped negative
  tests, or weakened source/command authority. Paper-shadow qualification may
  use its bounded fast profile; extended 24-hour soak remains a distinct
  release/long-running confidence profile. Missing external source bytes,
  credentials or owner-owned implementation must fail closed and be reported
  once, not rediscovered phase by phase.

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
  shell syntax, JSON contracts and both rendered Compose definitions. It
  requires the Docker CLI.
- The normal CI gate is: verify -> actionlint -> Python tests -> frontend
  tests/builds -> roadmap browser e2e -> composed smoke test.

## Local tests (CI-equivalent)

- Portal backend:

  ```bash
  python -m pip install --constraint constraints/portal.txt -e './apps/portal/backend[dev]'
  PYTHONPATH=apps/portal/backend/src:apps/portal \
    python -m pytest -c apps/portal/backend/pyproject.toml apps/portal/backend/tests
  ```

- Roadmap backend:

  ```bash
  python -m pip install -r features/roadmap-task-board/backend/requirements-dev.txt
  PYTHONPATH=features/roadmap-task-board python -m pytest features/roadmap-task-board/backend/tests
  ```

- Frontends: `npm ci && npm test && npm run build` in `apps/portal/frontend`
  and `features/roadmap-task-board/frontend`. Roadmap e2e also needs
  `npx playwright install --with-deps chromium` before `npm run e2e`.
- Protected kernel check: `sha256sum -c strategy/PROTECTED_SHA256` from
  `apps/portal/`.

## Git hooks

- Enable the root hook set with `./scripts/install-git-hooks.sh` (or `make
  hooks`); it sets `core.hooksPath=.githooks`. The pre-commit hook runs the
  full `verify-workspace.sh` on every commit, so commits need Docker and
  Python available. Hooks reject staged secrets, edits to
  `apps/portal/strategy/main.py`, and control-plane changes from contributors.

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
- Backend or cross-service architecture work from U02 onward must also read
  `upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md`. The `BAR-*` slices
  refine sequencing but never authorize skipping a Unified Plan phase or
  introducing a future datastore/service early.
- When an active `BAR-*` slice has a deep dive under `upgrade/backend/`, read
  that document before editing contracts or code. BAR-01 work must follow
  `upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md`; frontend
  and backend agents must not create separate feature registries.
