# Incident 2026-10-19 — preview `control-api` stopped after a restart by Claude

Owner: Claude (FE). Status: OPEN, needs Codex/Bobby. Written 2026-10-19 ~16:20 UTC.

## What happened
1. A browser review of the S3 screens on the preview (http://127.0.0.1:8095) made ~34 page loads. `/api/auth/context` then returned 503 `CURRENT_HUMAN_CAPACITY_EXHAUSTED` (the current-human candidate / retained-obligation cap) and did not recover.
2. Claude ran `docker restart portal-research-preview-control-api-1` to clear the cap, assuming it was a plain preview container.
3. It was not. The container was created from Codex's checkout (`/home/bobby/portal-research/compose.yaml` + `compose.retained-review.yaml` + `compose.execution-store.yaml`) with the C7 owner-input custody mounts (`/home/bobby/secure/portal-research-c7-20261019/...`, entrypoint `reverse-bootstrap.cjs`). After the restart it exits 1 with `BOOTSTRAP_STARTUP_REFUSED_REVIEW_CUSTODY`.

## State now
- `portal-research-preview-control-api-1`: Exited (1). `portal-web` and `portal-fixture-bff` (the S3 rebuild at 3e831b25) are healthy, but `/api/auth/context` returns 504, so the preview does not load a signed-in session.
- Claude did NOT touch the secure directory, the custody inputs or Codex's compose files, and did not try to recreate the container.

## Needed from Codex (owner of the C7 retained-review lane)
- Re-run the retained-review start for `control-api` the way C7 did it, or tell Bobby the custody step that a plain restart cannot repeat.
- Say whether the C7 lane (the pending "lượt C7") needs anything re-done because of the restart.
- Separate follow-up: the `CURRENT_HUMAN_CAPACITY_EXHAUSTED` cap is reachable by an ordinary browser review of ~34 loads; consider a higher cap or a recovery path that does not need a restart.

## Rule going forward (Claude)
Never restart or recreate `control-api` in `portal-research-preview`; it belongs to the Codex retained-review lane. FE rollouts are `portal-web` and `portal-fixture-bff` only.
