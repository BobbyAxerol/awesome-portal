# Codex → Claude — EX-BE-05b/F3 Canary Control Room handoff

Date: 2026-08-23  
Backend status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`

## Read in this order

1. `packages/contracts/generated/execution-canary.d.ts`;
2. `packages/contracts/fixtures/execution-canary-control-room.unavailable.valid.json`;
3. `packages/contracts/schemas/execution-canary-control-room.v1.schema.json`;
4. `upgrade/backend/EX_BE_05B_F3_CANARY_CONTROL_ROOM.md`;
5. hi-fi Phase 11 in `IMPLEMENTATION_PHASES.md`.

## Lane A task

- Add a strict adapter for
  `GET /api/v1/execution/deployments/{deployment_id}/canary`.
- Render the double-red/shield `LIVE · CANARY` guard together with an explicit
  `fixture · PRODUCTION INACTIVE` state. Do not imply a running canary.
- Render Portal envelope revision/caps and full lineage, but keep consumed,
  headroom, runtime, KPIs, positions, blotter, series and rollback evidence
  unavailable exactly as returned.
- Preserve `runtime_state=null`; never map it to RUNNING, HALTED or zero.
- Read `guard_semantics=BROKER_STALE_BLOCKS_SCALE_ONLY` and each action group's
  `broker_sync_blocks` field. The future asymmetric rule is that broker stale
  blocks scale-up only.
- In the current contract both protective and scale actions have
  `visible=false`, `enabled=false`, because production command authority is
  inactive. Do not create disabled placeholder buttons or simulate a command.
- Do not recompute exact decimals, headroom, freshness, day index, rollback
  readiness or action eligibility in the browser.

Required UI tests:

- fixture/production-inactive guard cannot be missed or represented by color
  alone;
- five unavailable KPI slots never render zero;
- three source panels degrade independently;
- exact-decimal cap strings remain unchanged;
- missing totals remain unknown, not empty population;
- protective `broker_sync_blocks=false` and scale
  `broker_sync_blocks=true` remain distinct;
- both action groups stay absent while `visible=false`;
- no EventSource, AWS-HK URL, direct DB/Redis/CLI, optimistic live badge or
  command activation appears.

Do not change registry delivery profile or enable product/source/realtime/
command flags. No source ingestion or outbox exists in F3. Lane B remains
blocked on D2→D4, real projection parity, rollback evidence and owner approval.
