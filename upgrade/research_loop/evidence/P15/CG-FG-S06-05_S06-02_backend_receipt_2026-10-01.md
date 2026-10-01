# CG-FG-S06-05 / CG-FG-S06-02 — backend receipt

Status: backend candidate; exact-HEAD preview receipt pending.

- `pool.frozen_at_utc_ms` is the source-clock `stage_completed` event for S4 on the run producer's current worker attempt. It is not the import, browser or database-read time. When the event is absent, the API returns `null` and `P11_S4_COMPLETION_EVENT_NOT_RETAINED`.
- P04 `Parameter.levels` uses the retained-lane exact-decimal `levelsOf` rule, not float arithmetic or a browser approximation.
- The Search Pool fixture carries the new time/source/reason fields. Generated declarations: `research-current-source.d.ts` and `research-search.d.ts`; existing route paths remain unchanged.
- Focused checks: Search Pool, current-source service and P04 Search service (24/24); Control API TypeScript build passed. Full hook and exact-HEAD preview are required before marking accepted.
- Frontend handoff: Claude may bind `pool.frozen_at_utc_ms` on S06 and `parameters[].levels` on P04 S06; keep the existing presentation. Do not derive either fact in the browser.

The timestamp is not a claim that QuantBT publishes a distinct pool-freeze event: it is the P11 journal's S4 completion event, explicitly named by `frozen_at_source`.
