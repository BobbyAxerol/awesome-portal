# Phase 4 / P4-E — Production streaming configuration matrix and load evidence

Date: 2026-09-03
Branch: `feat/execution-data-activation`
Author: Claude (backend co-impl per owner grant 2026-09-02)
Decision state: `CONFIG_MATRIX_PUBLISHED / PRODUCTION_ACTIVATION_NOT_AUTHORIZED`

Every row is a named environment variable with its measured dev value, the
production target, the owning side and the rollback. Nothing in this file
changes a runtime by itself: production activation runs through the unchanged
N36/Phase 3 release train (Bobby dev review → protected `dev` merge → signed
`main` images), and each row's rollback is the dev value it left.

## 1. Configuration matrix (dev measured → production target)

| Variable | Dev (measured 2026-09-03) | Production target | Owner | Rollback |
|---|---|---|---|---|
| `EDGE_MANAGER_PROJECTION_POLL_INTERVAL_MS` | 2000 (compose default) | per ingestion class: 1000–5000 transactional delta poll · 5000–15000 account-state · 30000–60000 metadata | Edge (Rust) | single value 2000 |
| `EDGE_MANAGER_SHARED_CACHE_TTL_MS` | 750 | 750, re-validated under the §3 load numbers before widening | Edge (Rust) | 750 |
| `EDGE_REALTIME_POLL_INTERVAL_MS` | 100 | 100 | Edge (Rust) | 100 |
| `EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS` | 15000 | 5000 first; target replacement by edge journal push/tail with SGP pull as reconciliation fallback (edge work item) | Control API | 15000 |
| `EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS` | 300000 | per class: 60000 transactional · 300000 time-series/metadata | Control API | 300000 |
| `EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS` | 120000 | 120000 | Control API | 120000 |
| manager-lists refresh trigger (`SNAPSHOT_MAX_AGE_MS`, code constant) | 5000 | 5000 — label truth now follows the envelope-declared budget (P4-C), so the trigger no longer masquerades as freshness | Control API | n/a (constant) |
| manager-lists freshness budget (`freshness_budget_ms`, envelope-declared) | fresh 30000 / stale 60000 (2×/4× poll) | recomputed automatically from the poll interval per environment | Control API | follows poll interval |
| Time-series window ladder (`WARM_WINDOW_DAYS` / `WARM_WINDOW_MAX_ROWS`) | 30 d / 5000 rows, merged in-snapshot, truncation declared | same; revisit cap only with measured payload growth (§3 sizes) | Control API | flat source page (remove ladder merge) |
| `FEATURE_EXECUTION_REALTIME_SSE` | true (dev effective) | true | Compose overlay | false (screens fall back to bounded snapshot reads, layout unchanged) |
| `FEATURE_EXECUTION_COMMAND_RELAY` | false | false — unchanged by this phase | Owner | n/a |
| Live mutation | false | false — unchanged by this phase | Owner | n/a |

Per-class ceilings and the journal push/tail replacement are Rust edge work
items; until they land, the single-value dev settings remain the active
configuration everywhere and this matrix is the published target, not a claim.

## 2. Delta coalescing and client budgets (P4-C, verified)

- browser delta handling coalesces to at most one re-read per second per
  stream (leading edge + one trailing re-read per burst; heartbeats never
  re-read) — pinned by `profileIntegration` regressions;
- multi-profile screens hold exactly three subscriptions (paper/sandbox/live)
  by contract; the Command Center holds one aggregated stream;
- realtime revalidation refreshes the mounted panel tree in place (no
  loading flash), so a delta burst cannot blank a screen.

## 3. Dev load evidence (measured 2026-09-03, 20 concurrent authenticated reads per route, loopback through the gateway)

| Route | p50 ms | p95 ms | max ms | body bytes |
|---|---|---|---|---|
| `/screens/paper` | 2555 | 4088 | 4106 | 314,783 |
| `/screens/blotter?limit=50` | 2041 | 4068 | 4221 | 203,590 |
| `/alphas?environment=all&limit=50` | 411 | 490 | 523 | 87,856 |
| `/portfolios` | 1254 | 1298 | 1304 | 1,214 |
| `/command-center` | 533 | 676 | 680 | 4,582 |
| `/profiles/paper/realtime-snapshot` | 311 | 538 | 572 | 786 |

SSE fan-out: 10 concurrent `/profiles/paper/stream` connections held 20 s —
every stream received the same bounded event count (2 events/stream over the
window at the current 15 s ingestion cadence), no runaway reconnects, no
event loss between streams. The realtime handshake stayed cursor-only at
786 bytes.

Reading: list/CC/realtime routes hold sub-second p95 under 20-way
concurrency on dev hardware. The two heavy profile documents (`paper`,
`blotter`) sit at 2–4 s p95 under the same burst — dominated by the 200–315 KB
full-document composition; the P4-C client (snapshot-revalidate, coalesced,
kept-mounted trees) never issues such bursts from one tab. Production
promotion at faster ingestion cadences must re-run this table plus a soak at
the per-class poll targets before flipping any row above.

## 4. Remaining before production GO

1. Rust edge: per-class poll ceilings and journal push/tail (matrix rows 1
   and 4) with their own gates.
2. Soak at target cadence (≥1 h, ingestion-driven traffic, SSE
   heartbeat/queue/eviction bounds re-proven) recorded next to §3.
3. The F17 governance chain exercised end-to-end the day a real eligible
   evidence run exists (external research-cell dependency).
4. Bobby: `PAPER_DNSE_VNM` taxonomy decision (P4-D), authenticated visual
   review of the rebuilt dev runtime, then the unchanged release train.
