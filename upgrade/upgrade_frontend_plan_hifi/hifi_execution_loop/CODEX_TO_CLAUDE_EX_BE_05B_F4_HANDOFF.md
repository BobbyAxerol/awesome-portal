# Codex → Claude — EX-BE-05b/F4 Live Full Operations

Backend status is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. Claude may now
build the Phase 12 Lane A adapter against:

- `packages/contracts/generated/execution-live-full.d.ts`;
- `packages/contracts/fixtures/execution-live-full-operations.unavailable.valid.json`;
- `GET /api/v1/execution/deployments/{deployment_id}/live`.

## Required rendering

1. Preserve `fixture · PRODUCTION INACTIVE`; null runtime is not `HALTED`.
2. Render Portal/Canary predecessor lineage, but label the Canary envelope as
   inactive for Live Full.
3. Render all five KPIs, positions, orders, incidents, open-order footer,
   series, continuity, rollback and realtime as typed unavailable states.
4. The broker panel is `suppressed`. Render no broker number anywhere.
5. Preserve the future rule:
   `broker MISMATCH → suppress every broker-derived value`; a projection gap
   reaches stale/mismatch handling and blocks R4.
   Canonical backend token:
   `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4`.
6. Do not show action buttons while `visible=false`; do not infer that R3 is
   executable merely because `source_gap_blocks=false`.
7. Use server objects/counts; do not calculate exact counts, continuity,
   broker difference or eligibility in the browser.

## Frontend tests

- unavailable fixture renders no fabricated zero or runtime state;
- broker panel and broker KPI never render a numeric value;
- injected broker data is rejected by the contract test, not merely hidden;
- actions absent when `visible=false`;
- missing Canary predecessor shows the typed API error;
- one-screen adapter performs no EventSource/AWS/Trading System call.

Real Lane B remains blocked on D2→D4, EX-BE-08, Canary exit and dual approval.
