# B1 P10 backend contract receipt

- CSRF-DOC-01 / CG-FG-S14-01: four Research OpenAPI write specifications now declare the runtime header `x-portal-csrf` (not stale `x-csrf-token`): alpha-import, preflight, progress, run-create. Generated clients regenerated from those specs; runtime authentication was not changed. Focused contracts 12/12.
- Claude must regenerate/consume the new header typing for each write path. No frontend, runtime, or source data changed.
