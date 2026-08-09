# Backtest Portal Agent Rules

## Scope

- Work only inside `/root/bobby/pool_alpha/backtest_portal_prototype`.
- `/root/bobby/pool_alpha/quantbt` is a read-only dependency for this project.
- `strategy/main.py` is a protected strategy kernel and must never be edited.
- Preserve `quantbt_kernel_wrapper/wrapper.py` as a legacy reference until the
  replacement backend has passed parity tests.

## Git Workflow

- Develop on `dev`; keep `main` as the reviewed release branch.
- Commit every small, meaningful, tested change.
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
- Keep heavy QuantBT/Numba imports lazy so the API control plane stays light.
- Run the relevant tests before each commit and record integration gaps rather
  than silently changing protected dependencies.
