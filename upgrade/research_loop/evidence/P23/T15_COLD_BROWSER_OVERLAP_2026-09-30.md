# P23-T15 — real browser under isolated cold-cache WFO load

2026-09-30 · Codex · `docs/research-loop-plan` · **T15 current-candidate PASS; P23/P24 OPEN**.

The owned `portal-research-p23-ol12` cell was built from clean commit
`b4e5d09b3fc3dfc137bcb6e99cc8917278fbe0a0` with seven pinned images
(`identity.json` SHA-256 `c90c05f73f4f0264e2d15eeca69c18b923fecca837c31f87d2b82d0e3be88e27`).
No shared preview, dev, Production, Execution, Trading System, account grant,
product UI, API contract or SLO was changed. The cell is stopped; its test
volumes and mode-0600 receipts remain available for the remaining P23 gates.

## Exact current-candidate retake

| Gate | Observed result |
| --- | --- |
| Cold start | Guarded eviction on **only** the stopped P23 PostgreSQL and artifact volumes: 4,378 regular files; resident pages 106,340,352 → **0 bytes** at 00:56:49 UTC. No host `drop_caches`; file bytes unchanged. All seven services recovered healthy before the test. |
| Real mixed compute | One `HEAVY` WFO RUNNING and four distinct durable intents QUEUED; the WFO completed `COMPLETED/READY`. No fabricated queue rows or implicit browser job. |
| Real browsers | Chromium 1280×900 and 660×900 signed in as the existing P23 owner and navigated through the same-origin gateway. Both observed the **same** RUNNING job and four queued IDs at 00:58:29 UTC and rechecked RUNNING after navigation. Desktop 00:58:29.581–33.683; mobile 00:58:29.256–32.707. |
| Causal/cross-run | Both viewports cut the retained candle window to 1 at the first cursor and 2 after one step, changed the readout, preserved the fold deep link, switched to the P04 hub run and back to the WFO retained run without stale header/lane. Zero horizontal overflow/page errors, no `/internal/` request, no mutation except login; job count 168 → 173 solely from the five explicit producer intents, then 173 → 173 across each browser. |
| Cold 20-reader read | `temperature=cold` is explicit in the private manifest and receipt. Twenty distinct authenticated principals × six named GETs = **120/120 HTTP 200**. p95 Library/Progress/Evidence/Search/Report/Replay = **494/210/361/244/117/292 ms** against the existing cold targets 1,500 ms for summary and 2,000 ms for search/replay. The read interval 00:58:32.996–34.579 overlaps the desktop browser interval; both browsers overlap the active WFO. |
| Resource | Strict seven-service cgroup peak **625,160,192 bytes**, below 5,000,000,000 bytes. The workload is `diagnostic_only=false`, `reads_passed=true`, `resource_passed=true`, `passed=true`. |

The combined T15 assessment is PASS for the Guide's cold-cache browser
reveal/cursor/deep-link/no-leak gate. Individual browser receipts intentionally
retain `full_t15_passed=false`: each viewport alone cannot certify the cold
eviction, 20-reader SLO and cgroup series. The combined verdict above requires
all five receipts and the independent seven-image/source-pin cross-check.
It does **not** prove every database page was still cold when each request ran;
the cold eviction happened before service start, and the explicit browser and
WFO requests naturally warmed pages. T08 has its own cold-only and mixed
receipts. This is not full F3 54/54, F5, OL-24, P23, P24 or release GO.

| Private mode-0600 receipt under `/home/bobby/.local/state/portal-research-p23/20260927/runtime/` | SHA-256 |
| --- | --- |
| `t15-cold-20260930-c.json` | `4db1762c8d8d95f79b1c5e6b715806b191d63afb070f69f7b088dabdd9d0b6ed` |
| `t15-cold-overlap-1280c.json` | `e7cc8ed47dad5a682ae56e436abef7ad5edb2f59152698e79fd2f84ba177e53b` |
| `t15-cold-overlap-660c.json` | `c99a971a85596a2a3170a888a63af52983f1e7c7aaed9f4e2ec00030cccc30bf` |
| `t15-cold-mixed-c-workload.json` | `0e8e132c96f8a19d2649e0246bc451c2cb66eba4f1e94281148689edeb29025c` |
| `t15-cold-mixed-c-read.json` | `72116464e35c12d8cee2d9c1c6e393b11253635d8816b47c2979c75c3560607b` |

## Attempts preserved, not counted as this PASS

- The first 2026-09-30 cold-cache mixed WFO/read receipt passed its six warm
  SLOs, but both browser windows began **after** the WFO terminal. It was not
  a concurrent T15 receipt.
- The second attempt correctly prearmed both browsers and proved WFO overlap,
  but `read-manifest.json` omitted `temperature`. The sampler therefore
  applied its *warm* 500-ms summary targets to a cold-cache test: 120/120 GET
  200, Library/Evidence p95 1,422/729 ms, 617,955,328-byte peak, and
  `passed=false`. This receipt remains a valid warm-target FAIL and is not
  relabelled or overwritten. The final retake explicitly set `cold` before
  any measured read; no threshold or production code was changed.

**Still open:** P23-T02 scratch plateau, T07/T13 engine upgrade/default and
rollback, T12 audit/utility quota, T14 exposure/audit-child graph, full
DR/BR/GX and F3/F5/OL-24 product acceptance. P24 remains unstarted.
