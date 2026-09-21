# P12 backend and contract packet — Run Library, search and historical browsing

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE; feature-dark; Screen-01 consumer, browser/HiFi and product-route acceptance remain Claude-owned.**
This packet does not claim a live QuantBT run, a deployment, an artifact read, a Parquet scan, a source-DB connection, or `PRODUCT_ACTIVE`.

The detailed phase report is [phase-report.md](./phase-report.md). The only frontend implementation boundary is [frontend-handoff-claude.md](./frontend-handoff-claude.md).

## Delivered boundary

P12 publishes exactly two authenticated same-origin operations:

| Operation | Bounded behaviour |
|---|---|
| `researchRunLibraryListV1` — `GET /api/v1/quantbt/runs` | At most 50 persisted rows. `status`, `mode` and `alpha` are normalized multi-value filters; opaque `cursor`/`before` bind workspace, filters, exact sort and limit. `ids` is a max-50 visible-row polling mode and is mutually exclusive with filters/cursors. |
| `researchRunLibrarySparklineV1` — `GET /api/v1/quantbt/runs/{runId}/sparkline` | At most 24 exact decimal display values when a later named series contract publishes them. Today it returns `[]` plus a typed availability reason; it never opens a worker file, artifact or Parquet dataset. |

Both operations are session-scoped, resolve the workspace server-side, repeat membership inside a PostgreSQL `REPEATABLE READ READ ONLY` transaction and return a stable `404` for an unobservable workspace. Browser input cannot name a relation, source transport, worker attempt, lease, artifact or raw cursor.

The persistent reader is deliberately narrow:

- `research.run_library_rows_v1` joins durable Research run/attempt/producer/job/progress facts to the existing Portal `public.run_read_models` legacy metadata lane. A legacy row duplicated by a durable identity is suppressed.
- `research.run_library_search_documents` is a small trigger-maintained, display-safe search projection with a GIN trigram index. It contains only safe identifiers already named by Screen 01; it excludes parameters, source/artifact paths, metrics, market data and credentials.
- The list is one repeatable snapshot. Its page, totals, counters, facets and `as_of_utc_ms` share PostgreSQL's transaction timestamp, not the web process clock. It has a two-active/eight-queued reader admission lane and finite DB timeouts.
- A logical research run, worker/audit child and technical retry remain separate fields/counters. A draft, failed or legacy absence never turns into a zero, “best so far”, OOS metric, certificate or sparkline.

## Truth and intentional absence

P12 uses maximum persisted truth without expanding authority:

| Surface | Current truth | Consumer rule |
|---|---|---|
| P10/P11 durable run identity/status/progress | Published Portal data | Render exact lifecycle and P11 source facts. P11's source facts remain subject to its own `NOT_PUBLISHED` rules. |
| P04 requested spec/alpha binding | Published only when it parses under the frozen P02/P04 schema | Show typed `NOT_PUBLISHED` if absent/incompatible; do not reconstruct it from text. |
| Legacy 1.0.8 run metadata | Historical metadata only | Keep `LEGACY_1_0_8_METADATA` and per-field reasons; do not call it a current engine result. |
| Exact OOS metrics / equity sparkline | Not published through an authorized P12 reader | Render the typed absence/placeholder. P12 never reads artifacts or Parquet to fill it. |
| Governance RC ref | Not published in a P12 named reader | `rc` is `null`; do not reserve an invented chip or infer approval from a claim. |

These are source/phase boundaries, not hidden fallbacks. P13 or a later named, authorized metric/series contract may enrich fields additively without changing P12's list cursor semantics.

## Feature and rollback state

`FEATURE_RESEARCH_RUN_LIBRARY` defaults to `false` in Control API and the production example. P12 changes neither a running service nor deployment configuration. Migration `1723680000045_research-run-library-v1.sql` is additive: it creates the reader view/indexes/search projection and backfills its safe documents transactionally. Rollback is route/feature-flag only; retain the projection/indexes and original persisted metadata. There is no manual release-directory edit or direct SQL activation path.

## Evidence summary

| Proof | Result |
|---|---|
| Control API compile | `npm --prefix apps/control-api run build` — pass |
| P12 query/controller/config contract units | 15 tests — pass |
| Generated P12 OpenAPI type contract | 3 tests — pass |
| Fresh isolated PostgreSQL P12 proof | 5 tests — pass; named tmpfs container is automatically removed |
| Route ownership ledger | `npm --prefix apps/portal/frontend test -- --run src/execution/r2Ledger.test.ts` — pass (22 tests; no UI source modified) |

See the detailed report for exact scoped coverage and the explicit frontend tests that are not claimed by backend evidence.

## Next owner

Claude must first read the full P11 handoff plus display-fact amendment, this packet, [the P12 frontend handoff](./frontend-handoff-claude.md), Screen-01 spec and the corresponding HiFi HTML. Regenerate and consume only `research-run-library.d.ts`; preserve the rich Screen-01 composition in every typed state. The shared rule is now explicit in [`CLAUDE-FOR-thanhvuong.md` A13.1](../../CLAUDE-FOR-thanhvuong.md#A131-Phối-hợp-theo-thế-mạnh-không-khóa-role): a later handoff never erases a prior Codex critique/addendum.
