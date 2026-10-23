# Paper-history HTTP / cache / DOM / browser qualification (UXM-07, ELP2-10 closeout 3.2)

Date 2026-10-23. R0 markdown receipt. Branch `claude/paper-history-qual-20261023`, from `claude/post-land-20261022` @ `82cfd3cc5`.

**Scope statement.** None of these numbers is a production SLO, a live measurement, a database measurement or a network
measurement. Rows are generated (`SYNTHETIC_RETAINED_INPUT`). Postgres is replaced by a JS interpreter of the three SQL
statements the repository sends. One host, one run per row, headless chromium. They show shape and bounds, not capacity.

## 0. Classification legend

| Tag | Meaning |
|---|---|
| `REAL_CODE` | Production source executed unmodified: `ExecutionProfileProjectionRepository.timeSeriesHistoryDownsampled` (branching, bucket maths, SQL text and bound parameters), `PaperReadService.workbench`, `PaperReadController`, `SessionGuard`, `HttpErrorFilter`, Nest + Fastify `inject`, FE `readPaperWorkbenchProfile`, `buildWorkbench`, chart reduction, `PaperWorkbenchScreen`, `createHttpApi` |
| `SYNTHETIC` | Generated mirror rows; the Postgres engine (JS emulation in `test/paper-history-http.fixture.ts`); the SessionGuard collaborators (AuthService, WorkspacesRepository stubs) |
| `JSDOM` | vitest + jsdom. No layout engine, so the chart path is not drawn there (`d` length 0); node counts are React's, not the browser's |
| `REAL_BROWSER` | Playwright chromium (headless) loading a small vite build of the real screen; the API route answered by Playwright with the body from the real in-process HTTP path |

## 1. Findings

1. **The real producer path is bounded near the 2,000 target, far below 16 MiB, at every N tested (720 to 100,000).**
   `timeSeriesHistoryDownsampled` returns the exact rows when the numeric-eligible population is at most `targetPoints` (2,000),
   otherwise per-series bucket extrema plus the closing row. Output is at most `3k * (max(1, floor(2000/3k)) + 1)` rows for `k`
   series (2,001 for the usual `k = 1`). The target is *not* a hard ceiling: `k >= 667` series under one deployment floor to
   one bucket per series and return up to `6k` rows (k = 1000 measured 5,068). The `LIMIT`-free SQL is unchanged.
2. **Not clipped to 200.** Every N above 200 returned more than 200 rows (hourly, minute, 30-day patterns). The only small
   result is a same-second burst (one bucket, 3 rows), disclosed by `downsample.input_rows/output_rows`.
3. **Largest measured response body 1,074,675 bytes (N = 2,000), 6.41 % of 16 MiB (16,777,216).** At the 2,001-row ceiling
   a row would have to average 8,384 bytes to reach 16 MiB; measured rows are about 535 bytes; a 4 KiB-padded-row run stayed
   under 16 MiB. The schema allows rows up to 40 properties x 8,192 characters, so a per-row byte ceiling is **not**
   enforced by the producer (residual, not triggered by any measured data; no byte handler added, see 5).
4. **The Paper workbench response is not stored in the 16 MiB retained cache at all.** `retainResourceTemplate` /
   `retainedResourceTemplate` are used only by `resource-read.service.ts`; the Paper controller has no cache. The 2,000-row
   body (1,074,675 B) would exceed the 1 MiB per-template retention gate (`bytes > 1024*1024 -> not retained`) if it were
   routed there; it is not. "Cached DTO bytes" for this path: 0.
5. **DEFECT FOUND AND FIXED (not a size problem): the V2 negotiation silently collapsed the retained history to ONE point.**
   The browser client (`httpApi.rawGet`) asks `/screens/*` with the V2 media type. `screenEnvelopeV2From` drops any `data.<key>`
   that shares a name with a panel; `data.account_equity` (history rows) shares `panels.account_equity` (one snapshot row), so
   the history disappeared and `legacyDataFromPanels` rebuilt `account_equity` from the single panel row, while
   `history_windows.account_equity.returned_rows` still said 1,799. In addition, `deployment`, `observation_gate`,
   `positions_by_side`, `query_analytics`, `stage_facts`, `history_windows` were lifted out of `data`, so the strict reader
   reported `"<key>: not allowed"` for each. Measured in-process through the real controller + adapter + reader + model:
   `MODEL equity.rows 1 points 1`, six schema violations. Pinned by test `pins why: the generic V2 projection would turn ...`.
   **Fix:** `PaperReadController.deploymentScreen` always answers the published V1 body (one `negotiate(..., false)` argument).
   FE is unchanged (a V1 body passes through `normaliseScreenBody`). Published schema unchanged; no `npm run generate`.
   Trade-off (NOT measured): the V1 body repeats panel rows (orders/fills/positions, up to 200 each) in `data` and `panels`;
   the history rows are not duplicated. Whether the dev profile's ~7.4 MB figure (screen header comment) is mostly that
   duplication was not measured here.
6. FE cost does not grow with N past the target: the wire body is flat (0.97 to 1.07 MB for N >= 2,000), the chart reduces
   to the plot width (720 to 802 drawn points), the Equity SVG has 63 to 78 descendants (the screen's own budget text says
   under 150 chart nodes), and the document has 353 to 367 nodes in chromium at every depth.

## 2. Producer (REAL_CODE over SYNTHETIC SQL emulation): rows returned by the real repository method

`test/paper-history-http.spec.ts`, describe 1. `k = 1` series. Bound for k = 1 is 2,001.

| source rows N | hourly | minute | 30-day span | same-second burst | class |
|---:|---:|---:|---:|---:|---|
| 720 | 720 (exact) | 720 (exact) | 720 (exact) | 720 (exact) | REAL_CODE + SYNTHETIC |
| 2,000 | 2,000 (exact) | 2,000 (exact) | 2,000 (exact) | 2,000 (exact) | REAL_CODE + SYNTHETIC |
| 8,000 | 1,799 | 1,760 | 1,767 | 3 | REAL_CODE + SYNTHETIC |
| 32,000 | 1,899 | 1,895 | 1,901 | 3 | REAL_CODE + SYNTHETIC |
| 100,000 | 1,935 | 1,929 | 1,948 | 3 | REAL_CODE + SYNTHETIC |

Every case also asserts: `sourceRows = N`; metadata `input_rows = N`, `output_rows = returned`; every returned row id exists in the
source (no interpolation); order by time; global min and max of `equity` present; the newest row closes the series; exact
branch issues `count` then `exact` queries only, dense branch `count` then `bucket`.

Multiple series (N = 32,000, minute pattern, `k` accounts under one deployment):

| k series | returned rows | bound 3k(max(1,floor(2000/3k))+1) | class |
|---:|---:|---:|---|
| 4 | 1,869 | 2,004 | REAL_CODE + SYNTHETIC |
| 50 | 2,011 | 2,100 | REAL_CODE + SYNTHETIC |
| 1,000 | 5,068 | 6,000 | REAL_CODE + SYNTHETIC |

## 3. HTTP bytes through Nest/Fastify `inject` (REAL_CODE + SYNTHETIC SQL), 7 samples after 2 warm-ups

`Accept` carrying the V2 media type returns the same V1 body after the fix (identical bytes). Fraction is of 16 MiB = 16,777,216.
Latency is `app.inject` wall time **including the JS SQL emulator**, which dominates for N >= 8,000; it is not producer or
database time and must not be read as one.

| N | returned rows | response bytes | share of 16 MiB | cached bytes in retained cache | inject p50 ms | inject p95 ms |
|---:|---:|---:|---:|---:|---:|---:|
| 720 | 720 | 391,931 | 2.34 % | 0 | 15.757 | 20.842 |
| 2,000 | 2,000 | 1,074,675 | 6.41 % | 0 | 63.436 | 153.510 |
| 8,000 | 1,799 | 969,244 | 5.78 % | 0 | 128.179 | 139.920 |
| 32,000 | 1,899 | 1,025,629 | 6.11 % | 0 | 318.322 | 352.097 |
| 100,000 | 1,935 | 1,045,799 | 6.23 % | 0 | 944.278 | 973.271 |

All five bodies validate against `execution-paper-read.v1.schema.json`; `history_windows.account_equity` has
`returned_rows` = rows returned, `source_rows` = N, `truncated: false`, and `downsample` present exactly when N > 2,000.
Before the fix, the same V2-negotiated body was 8,979 to 9,121 bytes (history dropped); that is not a saving, it is the defect.

## 4. Frontend

### 4.1 JSDOM (not a browser). 7 samples after 2 warm-ups, ms. Input: the byte-exact bodies of section 3.

| N | body bytes | rows in model | reader p50/p95 | model p50/p95 | series+reduce p50/p95 | mount to heading p50/p95 | document nodes | Equity SVG descendants |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 720 | 391,931 | 720 | 4.562 / 13.381 | 4.250 / 19.096 | 5.292 / 11.976 | 70.850 / 129.154 | 384 | 66 |
| 2,000 | 1,074,675 | 2,000 | 13.232 / 25.429 | 14.912 / 24.606 | 22.188 / 35.210 | 96.488 / 113.193 | 396 | 78 |
| 8,000 | 969,244 | 1,799 | 10.246 / 10.596 | 10.389 / 15.497 | 12.695 / 17.107 | 73.475 / 127.929 | 382 | 63 |
| 32,000 | 1,025,629 | 1,899 | 11.644 / 19.312 | 10.563 / 28.205 | 13.617 / 23.076 | 88.934 / 141.327 | 382 | 63 |
| 100,000 | 1,045,799 | 1,935 | 26.897 / 44.389 | 28.624 / 39.573 | 21.203 / 27.991 | 128.103 / 210.441 | 394 | 75 |

Class: `JSDOM` + `REAL_CODE` + `SYNTHETIC` rows. Timings on a shared, loaded host vary about 2x run to run (an earlier run of the
same test gave reader 4.98 / 11.9 / 17.2 / 15.3 / 10.5 ms p50); the 100,000 row was the noisiest. "reader" = `JSON.parse` +
strict `readPaperWorkbenchProfile`. The reader accepts every body with zero schema violations.

### 4.2 REAL_BROWSER (headless chromium 1440x900, one worker). 7 samples after 1 warm-up, fresh context per sample

Page = `e2e/paper-history-harness` (real `PaperWorkbenchScreen`, real `createHttpApi`, which sent the V2 `Accept`). Time to chart
= navigation start until the first non-empty Equity line path (includes page load, fetch, parse, model, render). Heap =
`JSHeapUsedSize` after `HeapProfiler.collectGarbage`. Long tasks = `PerformanceObserver('longtask')`, > 50 ms.

| N | body bytes | drawn points | time to chart p50/p95 ms | document nodes | Equity SVG desc. | heap after GC MiB p50/p95 | long tasks (count p50; total ms p50/p95; max ms p50/p95) |
|---:|---:|---:|---:|---:|---:|---:|---|
| 720 | 391,931 | 720 | 229.7 / 245.3 | 355 | 66 | 3.448 / 3.565 | 0; 0 / 0; 0 / 0 |
| 2,000 | 1,074,675 | 802 | 324.9 / 363.2 | 367 | 78 | 4.040 / 4.120 | 1; 67 / 75; 67 / 75 |
| 8,000 | 969,244 | 721 | 299.4 / 383.7 | 353 | 63 | 3.924 / 4.061 | 1; 58 / 124; 58 / 85 |
| 32,000 | 1,025,629 | 760 | 319.9 / 363.4 | 353 | 63 | 4.065 / 4.093 | 1; 60 / 80; 60 / 79 |
| 100,000 | 1,045,799 | 776 | 310.1 / 403.0 | 365 | 75 | 4.108 / 4.123 | 1; 59 / 83; 59 / 83 |

Honest display check (browser text): N = 2,000 prints "Showing 802 of 2,000 points"; N >= 8,000 prints "Showing 721 of 1,799 points ... Server:
1,799 of 8,000 points, min and max kept per bucket (PER_SERIES_BUCKET_EXTREMA)", and likewise 1,899 of 32,000 and 1,935 of
100,000. Nothing reads as the full population. Class: `REAL_BROWSER` + `REAL_CODE` + `SYNTHETIC` rows. Not measured: real
network/TLS/gzip, a slow device, repeated Refresh, tab switching, Orders/Fills tabs.

## 5. Decision on production code

Bounded paging and byte handling were **not** added: the real path never exceeded 6.41 % of 16 MiB at any tested N, and the
output row count is bounded by the repository's bucket maths, so a second mechanism would be unobserved complexity. The
single production change is the V1 pin for the two workbench routes (finding 5). Residuals, unmitigated and unmeasured:
(a) no producer-side per-row byte ceiling (schema permits very wide rows); (b) k >= 667 series under one deployment returns up
to 6k rows; (c) V1 repeats panel rows (up to 200 per panel) that V2 would send once; (d) real Postgres plan/time for the
window query; (e) the VN-market route `/vn-market` shares the controller path and fix but was not separately measured.

## 6. Commands run (all from the worktree root `/home/bobby/portal/.claude/worktrees/agent-a4b653b300c544dc0`)

```
# control-api: pinning regression (default, 1 sample per depth) and the other specs touching the changed controller
cd apps/control-api && npx vitest run test/paper-history-http.spec.ts --maxWorkers=1 --no-file-parallelism
cd apps/control-api && npx vitest run test/screen-envelope-v2.spec.ts test/paper-read.spec.ts test/paper-history-depth.spec.ts test/paper-history-http.spec.ts --maxWorkers=1 --no-file-parallelism
# opt-in measurement + body dump for the FE lanes
cd apps/control-api && PAPER_HISTORY_HTTP_MEASURE=1 PAPER_HISTORY_OUT=<file> PAPER_HISTORY_BODY_DIR=<dir> npx vitest run test/paper-history-http.spec.ts --maxWorkers=1 --no-file-parallelism
# FE jsdom
cd apps/portal/frontend && PAPER_HISTORY_BODY_DIR=<dir> PAPER_HISTORY_OUT=<file> npx vitest run src/execution/v2/screens/workbench/workbench.history-depth.test.tsx --maxWorkers=2
# FE real browser (build once, then SKIP_BUILD; port 4379; no docker, no flock, no preview stack, no visual harness)
cd apps/portal/frontend && PAPER_HISTORY_DIST=<dir> npx vite build -c vite.paper-history.config.mts
cd apps/portal/frontend && PAPER_HISTORY_PORT=4379 PAPER_HISTORY_SKIP_BUILD=1 PAPER_HISTORY_DIST=<dir> PAPER_HISTORY_BODY_DIR=<dir> PAPER_HISTORY_OUT=<file> npx playwright test -c playwright.paper-history.config.ts
# typecheck, separately per package
cd apps/control-api && npx tsc --noEmit -p .
cd apps/portal/frontend && npx tsc --noEmit -p .
```

`<dir>`/`<file>` were under the session scratchpad. The default (non-opt-in) run of `paper-history-http.spec.ts` is the
regression that pins the bound; the FE jsdom test and the browser spec skip themselves without `PAPER_HISTORY_BODY_DIR`.

## 7. Files

| Path | Role |
|---|---|
| `apps/control-api/src/paper-read/paper-read.controller.ts` | the only production change: workbench answers V1 regardless of `Accept` |
| `apps/control-api/test/paper-history-http.fixture.ts` | generated rows, SQL interpreter, real producer wiring |
| `apps/control-api/test/paper-history-http.spec.ts` | bound proof, real HTTP bytes, V2 defect pin, opt-in measurement |
| `apps/portal/frontend/src/execution/v2/screens/workbench/workbench.history-depth.test.tsx` | opt-in JSDOM measurement |
| `apps/portal/frontend/e2e/paper-history-harness/{index.html,main.tsx}`, `vite.paper-history.config.mts`, `playwright.paper-history.config.ts`, `e2e/_probe-paper-history-browser.spec.ts` | opt-in browser measurement (own build, own port) |
