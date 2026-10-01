# CG-FG-S06-05 / CG-FG-S06-02 — backend receipt

Status: BACKEND_ACCEPTED `bfee4737`; frontend mapping remains Claude-owned.

- `pool.frozen_at_utc_ms` is the source-clock `stage_completed` event for S4 on the run producer's current worker attempt. It is not the import, browser or database-read time. When the event is absent, the API returns `null` and `P11_S4_COMPLETION_EVENT_NOT_RETAINED`.
- P04 `Parameter.levels` uses the retained-lane exact-decimal `levelsOf` rule, not float arithmetic or a browser approximation.
- The Search Pool fixture carries the new time/source/reason fields. Generated declarations: `research-current-source.d.ts` and `research-search.d.ts`; existing route paths remain unchanged.
- Focused checks: Search Pool, current-source service and P04 Search service (24/24); Control API TypeScript build passed. Full pre-commit hook: Control API 1394 passed/1 skipped.
- Isolated preview at exact shared SHA `bfee4737`, Control API image `sha256:4586b0a31ea0613b6c4b8a8164c7cf1b6939380570bc0535705ba23747402322`, same-origin authenticated GET:
  - R-WFO-020 `rrun_3258a4c450816129d2d285f25b801061` Search HTTP 200: `pool.frozen_at_utc_ms=1790796223840`, source `P11_STAGE_COMPLETED_S4_EVENT`, reason `null`.
  - R-P04-019 `rrun_6d431f0d497e1d877a171325228bd2f6` P04 Search HTTP 200: all 8 parameter `levels` present; `window=21`, `rvol=16`.
- Frontend handoff: Claude may bind `pool.frozen_at_utc_ms` on S06 and `parameters[].levels` on P04 S06; keep the existing presentation. Do not derive either fact in the browser.

The timestamp is not a claim that QuantBT publishes a distinct pool-freeze event: it is the P11 journal's S4 completion event, explicitly named by `frozen_at_source`.
