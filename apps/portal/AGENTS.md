# Portal Research (QuantBT) Rules

`apps/portal/` is a tracked module of the Portal monorepo, not an independent
repository. It is the public Portal shell's initial QuantBT Research capability.
Use the root `AGENTS.md` for Git, CI/CD and deployment rules.

## Scope and protected boundaries

- QuantBT is supplied by published `quantbt-engine==1.0.8`; do not add a
  sibling engine checkout or vendor its source.
- `strategy/main.py` is protected and must never be edited. Preserve
  `quantbt_kernel_wrapper/wrapper.py` as a legacy reference until the
  replacement backend has parity tests.
- FastAPI lives in `backend/src/portal_api`; the React/Vite UI lives in
  `frontend/`. The root Portal builds both into one Compose-managed deployment.
- Dependency direction remains
  `api -> services -> domain/strategies/adapters/repositories`. Domain code
  imports no FastAPI, QuantBT or protected strategy code.

## Commands

- `./scripts/test_backend.sh [pytest args...]` runs the configured backend suite.
- `./scripts/smoke_quantbt_pypi.sh` is the deterministic no-data-service gate:
  package provenance, three-window, Advanced WFO, API and artifacts.
- `./scripts/run_backend.sh` runs Uvicorn at
  `127.0.0.1:${PORTAL_PORT:-8000}`; `./scripts/run_dev.sh` is local module
  development only. For the composed product use `../../scripts/portal up`.
- The scripts set `PYTHONPATH` and use `${POOL_ALPHA_PYTHON:-.venv/bin/python}`;
  do not substitute bare system `pytest` for their contract.

## Data and domain rules

- QuantBT remains the source of truth for optimization, accounting and metrics.
  Do not reimplement objectives or PnL in Portal code.
- Holdout Live data never enters calibration or parameter selection. Preserve
  half-open window boundaries and immutable selected parameters.
- Keep imports side-effect free. Record integration gaps rather than inventing
  fills, margin fields or metrics absent from audited results.

## Development discipline

- Enable the one root hook with `../../scripts/install-git-hooks.sh`, not a
  module-local hook. The root hook blocks direct `main` commits and edits to the
  protected strategy kernel.
- Read `backend/ARCHITECTURE.md` and `implementation_plan_protoyype.md` before
  extending domain behavior. Backend contracts and tests come before UI work.
- Do not commit market data, artifacts, credentials, environments, caches or
  generated reports. Commit every tested, coherent change immediately under the
  root Portal branch workflow.
