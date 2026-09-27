# E16 closeout - bounded P04 market overview and exact engine pin

Status: `E16_BACKEND_CLOSED / FEATURE_DARK / NO_RUNTIME_ACTIVATION`

Date: 2026-09-27 UTC

Code commit: `3527bb3f`

## Outcome

New P04 runs retain a bounded market overview before the isolated child deletes
its private source tape. The overview is derived from the exact OOS slice used
by the child and contains at most twelve contiguous buckets. Every bucket
preserves its first open, last close, true maximum high, true minimum low,
summed volume when the source publishes volume, and the count of position
transitions observed inside that bucket.

This is intentionally not a per-bar replay tape. It does not claim fill/trade
marker ordering, cross-stream ordering, or a complete event history. The
published semantics string is
`BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY`; the existing
`route_capabilities.candle_windows` absence remains authoritative.

## Source and authority

- Producer: the P06 isolated P04 child, before its source Parquet is deleted.
- Source identity: `p04.delta-rsi.v1`, QuantBT `1.1.1`.
- Scope: exact P04 OOS market interval only.
- Bound: at most 12 buckets and at most 2,000,000 source bars.
- Values: exact decimal strings and UTC milliseconds.
- Coverage checks: ordinal zero through `source_bar_count - 1`, contiguous
  buckets, strict timestamp chronology, declared bucket width, emitted count
  and sampling geometry.
- Custody: no source path, raw tape, worker fence, snapshot credential or
  private capability crosses the public boundary.

The supervisor validates the same geometry before the receipt can leave the
child boundary. Control API repeats the strict Zod validation before
persistence and projection.

## Published reads

1. Evidence Hub `core.market_overview`
   - `AVAILABLE` with the bounded overview for new P04 receipts.
   - `NOT_PUBLISHED / P04_SOURCE_PREDATES_E16_CANDLE_OVERVIEW` for immutable
     historical receipts.
2. Replay `market_overview`
   - carries the same authority and typed legacy absence;
   - does not change route-aware equity cursor/page semantics.
3. Freeze `engine_pin`
   - publishes the exact retained QuantBT version, adapter id and adapter
     contract digest;
   - legacy or incomplete bindings remain a typed `NOT_PUBLISHED` value.

The OpenAPI components, generated TypeScript clients and contract snapshot are
regenerated. No browser-facing private ingress contract was added.

## Verification

| Lane | Command | Result |
| --- | --- | --- |
| Contracts | `cd packages/contracts && npm test` | 16 files, 191 tests passed |
| Generated parity | `cd packages/contracts && bash tooling/verify-generated.sh` | passed; all generated contracts current |
| Control API | `cd apps/control-api && npm test -- test/research-progress.contract.spec.ts test/research-evidence.service.spec.ts test/research-replay.service.spec.ts test/research-freeze.service.spec.ts` | 4 files, 29 tests passed |
| Control API build | `cd apps/control-api && npm run build` | passed |
| Python source boundary | `cd apps/portal/backend && PYTHONPATH=src:.. ../.venv/bin/python -m pytest -q -rs --tb=no -c pyproject.toml tests/test_research_run_producer.py tests/test_research_supervisor.py tests/test_current_source_w5b_replay.py` | 15 passed; 1 explicit opt-in HMD smoke skipped because `PORTAL_RUN_HMD_REAL_SMOKE` was not enabled |
| Frontend contract consumers | `cd apps/portal/frontend && npm test -- src/research/foundation.test.tsx src/research/releaseCandidateDetail.test.tsx` | 2 files, 102 tests passed |
| Frontend TypeScript | `cd apps/portal/frontend && npx tsc -b --pretty false` | passed |

The frontend compile exposed two unrelated integration drifts: a stale Journey
v2 fixture import and a P22 approval test body missing the generated
`assignee_pool_availability`. Both were corrected mechanically without
changing product composition or UI/UX.

## Non-claims and compatibility

- No historical P04 run is backfilled or rewritten.
- No full candle window, raw source row, trade/fill marker sequence, or future
  candle is published.
- No migration, runtime flag, service restart, preview mutation or production
  activation is part of this closeout.
- WFO retained replay remains unchanged.
- The optional real-HMD smoke remains a P23/P24 qualification input, not a
  hidden requirement for this bounded producer contract.

## Rollback

Revert the E16 code/contract commit. There is no schema downgrade and no data
cleanup. Receipts already written with the additive overview remain immutable;
an older reader ignores the additive private source field, while the public
rolling-deploy contract keeps `market_overview` optional on Evidence Hub.
