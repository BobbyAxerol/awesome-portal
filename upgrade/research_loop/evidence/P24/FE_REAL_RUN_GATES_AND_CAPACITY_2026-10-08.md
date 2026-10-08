# Real-run gates (pending Holdout, 6,400 rows) and disk capacity — Claude, 2026-10-08

Bobby approved (2026-10-08): one real Three Window run to prove Holdout protection while running; one real 16-fold × 400-trial run for the 6,400-row ledger; and a report of total disk and per-run footprint.
Preview: the clean rebuild from `4cff6010` (every running image equals its built tag). Runs created through the product UI, ordinary preflight + create, shared preview; nothing deleted.

## 1. Pending-run Holdout — PASSED on a real run

`rrun_551b6d8c1d3c977b372bc80c7067de9e` (Three Window optimizer, 400 trials, ~40 s). Polled every 2 s through the same-origin API while it ran:

| Time (UTC) | Run state | `GET …/windows/analytics?window=HOLDOUT` |
|---|---|---|
| 05:19:38 | RUNNING | 200 · `NOT_PUBLISHED / RUN_NOT_COMPLETED_WINDOW_PROTECTED` · 0 rows |
| 05:20:15 | FINISHING | same (still protected) |
| 05:20:17 | COMPLETED | 200 · `AVAILABLE` · 1 row |

In the browser, while RUNNING, the Replay card's Holdout tab printed "Not published · run not completed window protected" (no rows, no chart). Protection holds until `COMPLETED` and flips in the same poll that the status flips.

## 2. 6,400-row ledger — NOT verifiable: the run is admitted, executes, then fails closed

`rrun_bd5906ac9bb4b310b05f462de97ada56`, 16 outer folds × 400 trials = 6,400 (the recipe cap). Preflight passed; the run executed ~6 min and **FAILED**: `ENGINE_ERROR — "The current-source summary exceeds the sealed local read-model budget."`
(`RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE`; the sealed core summary is limited to 64 KiB). Nothing was retained (0 current-source rows, 0 folds reported). Admission and retention disagree: request **BR-S02-22** (§48). The 6,400-row paging is therefore **not claimed**; the screen has nothing to page. No smaller fold count was tried (needs Bobby's approval).

## 3. Disk capacity

**Host:** `/` 621 GB, **522 GB used, 99 GB free (85%)**, unchanged at GB granularity after both runs.

| Docker (system) | Size | Reclaimable |
|---|---|---|
| Images (262) | 83.8 GB | 69.4 GB |
| Local volumes (88) | 115.6 GB | 10.4 GB |
| Build cache (3,318) | 186.7 GB | 63.0 GB |

The largest single volume is an anonymous 91.8 GB one that belongs to the **Execution probe** stack (`portal-probe-pg`, up 4 weeks), not to Research. Reclaimable bytes are not deletion approval; nothing was pruned.

**The Research preview's own data is small:** Postgres volume 400 MB (database 296 → 301 MB across the two runs), artifacts volume 70 → 72 MB, NATS 60 KB, task-board 76 KB. Heaviest table: `research.current_source_rows_v1` 219 MB / 131,877 rows (heap 104 MB; on-disk ≈ 2.1 × heap with indexes and TOAST).
Row sizes (heap): observation 0.79 KB, trial 1.27 KB, candidate 1.53 KB, fold 3.16 KB.

**Per run (heap measured; on disk ≈ 2.1 ×; WAL transient, 81 MB present):**

| Run (real) | Rows / size | Heap | On disk (est.) | Wall |
|---|---|---|---|---|
| Native Bracket V4, 168 IS + 168 OOS bars | window-execution 0.24, fixed replay 0.08 | 0.32 MB | ~0.7 MB | seconds |
| Three Window, 504/168/168 bars, 3 trials | 174 current-source rows | 0.74 MB | ~1.6 MB | seconds |
| Walk-forward global, OOS 504, 3 IS folds, 3 trials | 1,304 rows | 3.45 MB | ~7 MB | ~13 s |
| Three Window optimizer, 400 trials (`rrun_551b…`) | 729 + 1,419 + 462 rows | 2.5 MB | **+4.4 MB measured** (DB 295.8 → 300.2 MB) | ~40 s |
| Three Window optimizer, 400 trials (`rrun_70d7…`) | 12,271 rows | 5.74 MB | ~12 MB | ~71 s |
| Largest retained run | 58,868 observation rows | 52 MB | ~110 MB | — |
| 16 folds × 400 trials, per-fold (`rrun_bd59…`, FAILED) | 610 progress events | 0.39 MB | **+0.8 MB measured**; artifacts +2 MB scratch | ~6 min, 1 core, peak 358 MiB |

Estimate if a 16 × 400 run did seal (not measured; it fails closed): 6,400 trial rows ≈ 8 MB + per-fold IS observations ≈ 22 MB + OOS ≈ 2 MB ≈ 33 MB heap, **~70 MB on disk**. So disk is not the limit: 99 GB free holds ~22,000 runs of the 400-trial Three Window kind; the cost of a run is **CPU time** (one core, minutes), not space.
