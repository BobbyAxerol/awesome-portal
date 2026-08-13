# Backtest Portal Agent Rules

## Scope

- Work only inside this repository or the parent `/home/bobby/portal` workspace
  when changing its integration/deployment layer.
- QuantBT is supplied by the published `quantbt-engine==1.0.8` package. No
  sibling QuantBT source checkout is part of this project.
- `strategy/main.py` is a protected strategy kernel and must never be edited.
- Preserve `quantbt_kernel_wrapper/wrapper.py` as a legacy reference until the
  replacement backend has passed parity tests.

## Commands

- `./scripts/test_backend.sh [pytest args...]` — backend suite; extra args pass
  through to pytest, e.g. `./scripts/test_backend.sh backend/tests/test_contracts.py -k window`.
- `./scripts/smoke_quantbt_pypi.sh` — deterministic no-data-service gate for
  the PyPI package: provenance, three-window, Advanced WFO, API and artifacts.
- `./scripts/run_backend.sh` — uvicorn on `127.0.0.1:${PORTAL_PORT:-8000}`,
  OpenAPI at `/api/docs`.
- Both scripts set `PYTHONPATH` themselves and use
  `${POOL_ALPHA_PYTHON:-.venv/bin/python}`. Running bare `pytest` or a system
  python misses this setup — use the scripts.
- Real market-data smoke without starting FastAPI:
  `PYTHONPATH=backend/src:. .venv/bin/python scripts/smoke_crypto_market_data.py --symbol ETHUSDT --timeframe 1h`
- The suite is fast and self-contained (in-memory/fake market-data providers,
  no external services). Run it before every meaningful commit.

## Setup

- Once per clone: `git config core.hooksPath .githooks`. The pre-commit hook
  blocks direct commits to `main` and rejects changes to `strategy/main.py`
  (sha256 in `strategy/PROTECTED_SHA256`; also verified by CI and a backend
  test).
- Env vars (see `.env.example`) are read via `os.environ`; nothing autoloads
  `.env`. `PORTAL_DATASET_MANIFEST` switches from the default dynamic
  Binance/DuckDB provider to a fixed manifest; `PORTAL_ARTIFACT_ROOT` defaults
  to `artifacts/runs`.
- CI gate (`.github/workflows/backend-ci.yml`, py 3.12/3.13):
  `pip install -e './backend[dev]'` -> `sha256sum -c strategy/PROTECTED_SHA256`
  -> pytest -> `compileall backend/src strategy`.

## Architecture

- FastAPI app `portal_api.main:app` lives under `backend/src/portal_api`; the
  React/Vite frontend lives under `frontend/`. The parent Portal workspace
  builds both into a single Compose-managed deployment.
- Dependency direction: `api -> services -> domain/strategies/adapters/repositories`.
  `domain` imports no FastAPI/QuantBT/strategy code; `QuantBTGateway` is the
  only QuantBT boundary; `strategy/delta_rsi.py` is the only module allowed to
  lazy-import the protected `strategy/main.py` kernel, and
  `DeltaRsiStrategyAdapter` routes through it. Heavy QuantBT/Numba imports
  stay lazy so API startup never loads them.
- `backend/ARCHITECTURE.md` documents boundaries, the performance contract and
  what is deliberately not implemented yet (WFO worker execution, run
  persistence/SSE, full artifact schema, Advanced WFO routing).
- `implementation_plan_protoyype.md` (sic) is the governing domain/UI spec with
  P0-P7 phase gates; execution order and per-phase status live in §27. Build
  new features below the existing API/domain boundaries, not in route handlers.

## Git Workflow

- Develop on `dev`; keep `main` as the reviewed release branch.
- After each small, meaningful change passes its relevant checks, commit it
  immediately with a clear single-purpose message; do not batch unrelated
  finished work into a later commit.
- Never force-push, rewrite history, or merge into `main` without an explicit
  user request.
- Do not commit market data, run artifacts, credentials, virtual environments,
  caches, generated reports, or local configuration.

## Domain Rules

- QuantBT remains the source of truth for optimization, accounting and metrics.
- Do not reimplement QuantBT objectives or PnL in the portal frontend/backend.
- Holdout Live data must never enter calibration or parameter selection.
- Preserve exact half-open window boundaries and immutable selected params.
- Never invent fills, margin fields or metrics absent from audited results.

## Engineering Rules

- Backend contracts and domain tests come before frontend work.
- Keep imports side-effect free; no notebook globals, display, print or plotting
  in runtime service modules.
- Use typed schemas and explicit capability flags at every API boundary.
- Record integration gaps rather than silently changing protected dependencies.
