# Data activation status — 2026-09-03 (owner checkpoint)

Written for Bobby's return check ("2 tiếng sau tôi kiểm tra"). Every number
below is measured on the dev runtime at ~11:25Z, not inferred. Gates today:
310 → 312 → 314 → 315 → 316/316, all green, ten commits on
`feat/execution-data-activation`.

## 1. What the Portal now serves (verified)

| Layer | State |
|---|---|
| **History mirror** (`execution_timeseries_history` + `GET /api/v1/execution/history/paper/...`) | `account_equity`: **571,424 rows, 06-30 → 10:30Z today, tail-following the source's hourly cut**. `performance`: **129,178 rows = 100% of what the source holds** (ends 08-17 04:24 — its producer died, see §3). Keyset paging, range + entity filters, declared coverage. |
| **Paper screens hot window** | equity **2,000 pts (newest = same-day)** · performance 2,000 · sessions **2,000** (was 400) · orders **812 = full population** (was 364) · journal 407 = full · fills 71 · accounts 43 · deployments 43 · positions 20 · strategies 48 · portfolios 2 + allocations 42 |
| **Per-alpha depth** (Workbench + Alpha 360 insight tiles) | equity/performance series come from the mirror per subject: **full 30 days ≈ 720 hourly points per deployment**, declared `history_windows {basis: PORTAL_SGP_HISTORY_MIRROR}`, alpha id resolved via strategies, snapshot rows as fallback. |
| **Sandbox** | accounts 35 · balances 35 · deployments 35 · allocations 35 · broker_sync 1 · strategies 48 · portfolios 2 (rest: source publishes nothing — §3) |
| **Live** | strategies 48 · portfolios 2 only (source publishes no live accounts — §3) |
| **Stability** | Cursor-TTL fix holding: 0 window wipes, 0 worker errors in the last 5 minutes; drains resume from persisted cursors across restarts. A 2-hour health watcher is logging to `deploy/execution-phase4/health-watch-2026-09-03.log`. |

## 2. What changed today (11 commits, ~1,100 net lines)

1. **Resumable drains** — the worker used to re-read the same oldest 400 rows
   every cycle; now it resumes from a persisted per-relation cursor and
   tail-follows.
2. **Full-depth history store + read plane** — every lineage-accepted
   time-series row kept exactly, append-only; INTEGER source ids fixed.
3. **Cursor-TTL survival** — the source's cursors expire in 5 minutes; the
   drain forces a fresh issue each cycle (limit K−1 re-read) and a failed
   refresh defers instead of erasing the window.
4. **Depth on screens** — workbench + query-analytics serve the subject's
   30-day mirror series; every non-ladder relation drains to the 2,000-row
   document invariant (was 400).
5. Diagnosed live on HK (SSH, read-only + one restart-policy fix committed as
   `b24bc8c` on `fix/manager-read-restart-policy`, unpushed): reboot outage
   root-caused, three data root causes pinned into BR-EX-79.

## 3. What is NOT Portal-side (waiting on the Execution Cell agent — BR-EX-79)

| Item | Exact diagnosis (verified on their systems) | Effect until fixed |
|---|---|---|
| `performance_snapshots` producer | instrument-level producer emits `instrument_snapshots=0` since **08-17** | performance charts end at 08-17 |
| `portfolio_equity_snapshots` | serving policy declares `profile_columns: []` (table lacks mode/venue) → edge fail-closes | Portfolio equity stays DERIVED sum |
| LIVE `accounts` | never published → balances 100% lineage-rejected | Live screens near-empty |
| sandbox sessions / margin / sync, `venue_accounts`, candles, benchmark, ticks, calendar, twin-join | not published / not activated | per-panel honest UNAVAILABLE |
| Cursor TTL note | FYI §5.1 of the request doc — worked around Portal-side | none (1 extra request/cycle) |

Hand `EXECUTION_SOURCE_PUBLICATION_REQUEST_2026-09-03.md` to the other agent —
items 1.2 and 1.3 now name the exact line to fix.

## 4. Held for the capacity-upgrade plan (owner said: plan later, not now)

- Raising the 2,000-row snapshot document invariant (jsonb payload weight).
- Overview multi-series equity from the mirror with declared downsampling.
- Journal push/tail transport replacing polling (P4-E matrix rows 1/4).
- Uncommitted Rust edge per-class cadence groundwork (working tree, needs its
  own cargo gate).
