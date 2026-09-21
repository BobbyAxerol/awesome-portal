# P12 phase report — backend/contract slice

Date: 2026-09-21  
Working baseline: `1955da6f` (`docs/research-loop-plan`)  
Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE; no feature activation or product/browser claim.**

## 1. Where the work is

P12 implements the bounded, server-side Run Library read plane described by the Unified Plan and Screen-01 specification. It is deliberately separate from QuantBT execution, the worker filesystem, artifacts, Parquet, source DB, Execution Edge and CLI. The feature flag remains false. Screen-01 browser composition and visual acceptance are Claude-owned.

## 2. Files and ownership

| Area | Files | Purpose |
|---|---|---|
| Control API | `apps/control-api/src/research/run-library.{contract,controller,error,repository,service}.ts` | Named request/response schema, session boundary, typed errors, repeatable-read reader and DTO mapping. |
| Control API migration | `apps/control-api/migrations/1723680000045_research-run-library-v1.sql` | Additive view, indexes, safe search projection, trigger refreshes, role grants and migration backfill. |
| Control API tests | `apps/control-api/test/research-run-library.{contract,controller}.spec.ts` | Wire normalization, same-origin boundary and feature/config tests. |
| P12 integration proof | `scripts/research-loop-v11/{p12-run-library.spec.ts,test-p12-postgres.sh,vitest.p12.config.mts}` | Fresh, tmpfs PostgreSQL proof of data/query/authorization/resource invariants. |
| Published contract | `packages/contracts/openapi/research-run-library.openapi.json`, `generated/research-run-library.d.ts`, contract test/tooling/snapshot | Generated client boundary, pinned output and drift check. |
| Shared registration/docs | Control `app.module.ts`, config/error filter, production example, route ledger, Unified Plan and this packet | Additive route registration, feature-dark config and cross-agent evidence. |

No Claude-owned TSX, CSS, HiFi HTML, visual baseline or product route was modified by this slice.

## 3. Size and scope accounting

The 17 new P12-owned files above total **3,228 lines** (including generated types, isolated proof and handoff documentation). Shared registration, configuration, contract tooling and plan files also contain the concurrently owned P11 slice, so their final `+/-` count must be taken from the coherent P11/P12 commit range rather than falsely attributing all shared diff to P12. P12's ownership is the explicit file set above; it must be staged as a coherent backend/contract change, never by discarding or absorbing another agent's unhanded-off work. No generated trace, screenshot, database, artifact, market data or secret is versioned.

## 4. Contract and source alignment

- Schema version: `research.run-library.v1`; read authority: `PORTAL_PERSISTED_RESEARCH`.
- Order: `created_at DESC, run_id DESC`; cursors are signed/keyset-bound to workspace, normalized filters, direction, sort and limit.
- Exact decimals remain strings. UTC is milliseconds. No float conversion or client-originated sort/compare authority is exposed.
- `ids` refresh is capped at 50 and ordered by the same server contract; UI must patch visible cards in place rather than reorder selected rows.
- P12 returns source/projection absence as `AVAILABLE`, `NOT_PUBLISHED`, `LEGACY_METADATA_ONLY` or `PENDING_SOURCE_CALLBACK` with a reason code.
- `as_of_utc_ms` is PostgreSQL `transaction_timestamp()` from the exact repeatable snapshot used for rows/totals/counters/facets.

## 5. Evidence run

| Gate | Command | Result / scope |
|---|---|---|
| Build | `npm --prefix apps/control-api run build` | pass |
| P12 unit boundary | `npm --prefix apps/control-api test -- --run test/research-run-library.contract.spec.ts test/research-run-library.controller.spec.ts test/config.spec.ts` | 15 passed |
| P12 generated contract | `npm --prefix packages/contracts run generate:research-run-library && npm --prefix packages/contracts test -- --run test/research-run-library.spec.ts` | generation pass; 3 passed |
| P12 durable reader | `bash scripts/research-loop-v11/test-p12-postgres.sh` | 5 passed in a newly migrated PostgreSQL 16 tmpfs container; exact named container removed by trap |
| Existing route ledger regression | `npm --prefix apps/portal/frontend test -- --run src/execution/r2Ledger.test.ts` | 22 passed; read-only verification only |

The fresh PostgreSQL proof covers `P12-T01…T06`, `T08`, and backend portions of `T09/T11`: equal timestamp keyset ties, filter/cursor fingerprint refusal, forward/backward cursor truth under an immutable snapshot, workspace isolation, exact logical/child/retry counters, typed draft/legacy absence, 50-row bounds, 80-row synthetic storage-only scale, trigger update/delete cleanup, GIN search capability, non-sequential legacy reader shape and runtime-role write denial. `T06` is a bounded-reader/cold-warm plan proof while a durable run is present; it is **not** claimed as an active QuantBT compute benchmark.

## 6. Required frontend evidence not claimed

Claude owns and must evidence:

- `P12-T07` Screen-01 spec/HiFi browser receipt;
- frontend portions of `P12-T09` (URL/back/refresh/selection/inspection stability) and `P12-T10` (existing exact-intent clone/reproduce navigation);
- full rich state handling at 1280px and 660px, no warnings/network leakage, keyboard/a11y and no horizontal overflow;
- `V11-P12-BR/GX` product-route/deployment receipt only when its prerequisites exist. Real Delta/financial evidence is distinct from fixture evidence.

P12 does not publish a new clone/reproduce mutation. Any UI action must reuse the existing P10 named producer intent exactly or remain honestly unavailable; it must never manufacture an ID, client-side permission or full-sample/OOS metric.

## 7. Resource, safety and cleanup

The live reader has a two-active/eight-queued admission bound, 50 list rows, 50 poll IDs, 24 sparkline values and database statement/lock/idle transaction budgets. Search is a small trigger-maintained projection, not a page-sized client scan or a full history/Parquet read. The only test runtime resource is the exact `research-p12-postgres-*` tmpfs container; its shell trap removes it on pass/fail. No broad Docker prune, volume removal, cache cleanup, restart, runtime container or production migration was performed.

## 8. Debt and decisions

**No known in-scope P12 backend defect or workaround remains.** The following are intentionally typed source boundaries, not P12 debt:

1. Exact OOS/equity series and final metric facts require a later named, authorized metric/series projection; P12 may not read a worker artifact or Parquet merely to decorate Screen 01.
2. Governance RC references require a separately published governance reader; P12 returns `rc: null` rather than infer approval from lifecycle/claim text.
3. Active QuantBT compute, real data and production browser evidence are external activation evidence and remain unclaimed while P10/P11/P12 flags are dark.

## 9. Rollback and next step

Rollback is the P12 route/feature flag, not metadata deletion. Keep the additive migration/search projection so historical compatibility remains available for a future re-enable. Before any activation, run the approved change-window/deployment procedure separately; do not edit a release directory or point the browser at private sources.

Claude's next safe task is the focused Screen-01 consumer in [frontend-handoff-claude.md](./frontend-handoff-claude.md). After Claude's browser receipt, Codex should review the actual same-origin request shape, typed errors and field/action mapping before a phase-wide acceptance claim.
