# Codex → Claude — EX-BE-05b/F1a Operations Queue Handoff

Date: 2026-08-23  
Backend status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Frontend lane: Operations Queue Lane A; registry remains `fixture`

## Read order

1. `packages/contracts/generated/execution-operations.d.ts`
2. `packages/contracts/fixtures/execution-operations-queue.valid.json`
3. `packages/contracts/fixtures/execution-operation-workflow.valid.json`
4. `packages/contracts/openapi/execution-operations.openapi.json`
5. `upgrade/backend/EX_BE_05B_F1A_OPERATIONS_QUEUE.md`

Generated declarations and fixtures win over prose. Do not create a second
hand-maintained queue model.

## Claude can implement now

- Bind Phase 7 Operations Queue to `GET /api/v1/execution/operations` behind
  the existing Lane A adapter.
- Use `page.total_count`/`filtered_count`; never count browser rows.
- Use opaque `next_cursor`/`prev_cursor`; never draw offset page numbers.
- Render `source_status` and `verification_result` separately from Portal
  `triage_state`.
- Acknowledge and resolve are separate ADMIN actions. Resolve must remain
  unavailable until the item is acknowledged and requires reason/evidence.
- Send `request_key` and `expected_workflow_version`; map typed 409 conflicts
  to refresh/review rather than blind retry.
- Preserve explicit fixture/unavailable source labels. The queue can be useful
  while its source panels remain dark.

## Stop gates

Do not infer that acknowledge/resolve changed Trading System state, enable a
command, open EventSource, display source-success, or remove unavailable states.
Do not call any AWS-HK, DB, Redis or CLI route from the browser. Incident Detail
source panels and the eight unpublished `ops/*` capabilities remain blocked.

## Required frontend evidence

1. initial/empty/filtered/exact-count queue states;
2. forward/back keyset navigation without page numbers;
3. ADMIN-only actions and USER 403 handling;
4. acknowledge-before-resolve and optimistic-version conflict UX;
5. replayed mutation does not duplicate toast/history;
6. source status remains visually independent after triage changes;
7. fixture/unavailable badge remains visible;
8. narrow viewport, keyboard/focus and reduced-motion coverage;
9. malformed/unknown schema fails closed.

Claude should work on these consumer/UX tests in parallel with the separate
F1b Incident Detail handoff. Codex proceeds with the D2 IAM checkpoint without
changing either Lane A source/profile boundary.
