# LW-08 — Research Library and legacy run shell are different authorities

Read-only isolated-preview GET at commit `4df0074f`: legacy `/api/runs`
returned one global artifact row `527d2b993c834729` as COMPLETED.
Research `/api/v1/quantbt/runs?limit=50` returned the workspace-scoped
Research collection (39 rows in this receipt); that legacy row was not in
the current `claude-preview` workspace. Its old `run_read_models`
metadata is QUEUED (2026-09-23), whereas global filesystem artifact status
is COMPLETED. These sources do not form a coherent single collection.

Legacy artifact listing scans a global artifact directory
(`apps/portal/backend/src/portal_api/services/run_service.py`); its
historical status metadata has no Research workspace/owner authority.
Research Library is workspace-bound and must not import a cross-workspace
legacy row or silently convert stale QUEUED to COMPLETED.

Backend action: **no synthetic status or cross-workspace bridge**. The
Research Library response already includes its own count/status ledger.
Claude must bind the Research shell count to that response rather than
`/api/runs`. The legacy export route also lacks owner/workspace checks;
that separate security slice remains blocked by the exact approval recorded
in the backend gap queue. This receipt is a truthful boundary, not a claim
that the old legacy APIs are repaired.
