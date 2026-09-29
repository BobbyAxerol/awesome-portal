# P23 W06 — unfiltered Library census trial, 2026-09-29

Verdict: **W06 FAIL; P23 OPEN**. Bobby approved backend P12 optimization while
preserving API/UI and the 500-ms warm p95 target. Only the isolated P23 cell
on loopback `:8096` was used. No production/dev deployment, migration, source,
credential, frontend, admission limit, pool size or SLO changed.

The unfiltered Screen-01 census now reuses a narrow materialized workspace
catalogue instead of rescanning `run_library_rows_v1`; filtered search retains
its exact indexed source/predicate. Six focused tests and Control API build
pass. Against the original `qualification` image, the trial returned 20 cards
and identical JSON at every path except time-issued `page.next_cursor`.

The official `mixed-workload.mjs` W06 shape ran one real HEAVY WFO, four queued
intents and twenty authenticated readers over six named GETs. The WFO
completed; queued intents were cancelled by the harness, not deleted. All
20 Library GETs returned 200, but warm p95 was **686 ms FAIL** versus 500 ms.
Other five reads passed (p95 282/347/271/208/363 ms); sampled cgroup peak
was **656,904,192 bytes**, below 5 GB. The prior original-image W06 was
896 ms, but different runs/evolving rows prevent a paired speedup claim.

Trial image: `local/portal-research-p23-control-api:w06query-20260929`, built
from the uncommitted query edit. Private receipt label:
`w06-unfiltered-query-20260929`. This is not clean-commit acceptance. The
cell Control API was restored to original `qualification` and verified healthy.

A V8 CPU sample during a twenty-reader burst was mostly idle; this does not
identify the dominant PostgreSQL stage or admission wait. Prior scoped SQL
page+census p50/p95 was 27/62 ms while concurrent wall latency varied.

Follow-up on the isolated cell temporarily logged only PostgreSQL statements
lasting >=20 ms with parameter values disabled. In one twenty-reader GET
burst, the P12 page query had five parses (mean 44.1 ms), nine binds (mean
46.5 ms) and seventeen executions above the log threshold (mean 37.0 ms);
the census had one parse (22.2 ms), three binds (21.2 ms) and nine executions
(mean 29.3 ms). Thresholding omits faster calls, so these are not complete
request timings. A local, uncommitted trial forcing a generic plan only for
unfiltered P12 transactions returned all 20 GETs 200 but p95 1,123 ms then
731 ms without WFO; it was rejected and fully reverted. Both PostgreSQL log
settings were reset to `-1`, and the unused trial image was deleted.

Next: partition admission wait, scoped SQL and response mapping under the
same workload, then repeat on a clean image with warm p95 <=500 ms, cold
p95 <=1,500 ms, 20/20 complete responses, real WFO/queue and strict cgroup
proof. W06/P23 remain red. Do not cache personalized truth or weaken the
security/read reserve to manufacture a pass.

## Two rejected P12 follow-ups — 2026-09-29

The owned `:8096` cell used the same 20 authenticated readers and the
committed `qualification` image as its comparator. A key-first page CTE
returned 20 cards with exact JSON parity except `as_of_utc_ms` and the
time-issued next cursor, but its GET-only Library p95 was **841 ms** (20/20
HTTP 200); the restored baseline immediately measured **874 ms**. No reliable
speedup or W06 PASS follows. That candidate was reverted and its unused
image deleted.

Read-only RLS-correct `EXPLAIN ANALYZE` on the actual P12 SQL found page
planning/execution **29.705/25.609 ms** and census **5.435/14.015 ms**.
A one-snapshot shared-catalogue prototype reduced those isolated timings to
**22.235/20.805 ms** and preserved the same 20-card API response except
time-issued fields. Yet three authenticated GET-only bursts after a clean
candidate restart measured Library p95 **726, 627, 551 ms**, all above the
500-ms warm target. The original image's three warm bursts measured
**688, 539, 473 ms**, illustrating run-to-run variation. The combined-query
prototype was also reverted and its unused image deleted. No new mixed WFO
trial was run for either rejected candidate; the earlier real-WFO **686-ms**
FAIL remains the authoritative W06 observation. The P23 Control API is back
on the healthy `qualification` image; Git is unchanged except this evidence.

## Timing-only diagnostic after Bobby authorized P12 backend repair

One more disposable image instrumented only controller, admission and SQL
durations (no identities, SQL parameters or business rows). Under a twenty-
principal GET-only Library burst, 20/20 responses were HTTP 200 and p95 was
**992 ms**. Across the twenty corresponding timing records, p50/p95 were:

| Stage | p50 / p95 |
| --- | ---: |
| Controller workspace authority | 4 / 8 ms |
| E10 best-effort convergence | 0 / 69 ms (maximum 132 ms) |
| P12 admission queue | **270 / 642 ms** |
| PostgreSQL pool acquire | 12 / 42 ms |
| Transaction setup + membership | 23 / 93 ms |
| Repository work | 104 / 190 ms |
| Page SQL | 74 / 156 ms |
| Census SQL | 34 / 57 ms |
| Commit | 10 / 30 ms |

This isolates admission queueing as the largest measured stage. It does not
prove that E10 can be removed: the controller's reconciliation is a correctness
path and was cheap on most requests. It also does not justify increasing the
four-reader lane: the shared ten-connection pool reserves four P03 lanes and
two other connections. The two rejected SQL variants above did not reduce
enough work to keep twenty readers below 500 ms. Read-only runtime-role
`EXPLAIN ANALYZE` of the current Library view showed 72 rows, planning
15.729 ms and execution 11.030 ms for the bounded base-view page; this is
not an end-to-end page+joins or W06 result.

After the measurement, the temporary timing-only code was reverted; the
isolated P23 Control API was restored to the healthy pinned `qualification`
image, and only the three unused `w06timing*` images were removed. No API,
UI, admission/pool/SLO, data, migration or production state changed. W06 and
P23 remain **FAIL/OPEN** pending an exact, authorization-safe read-path fix
and clean-image mixed-WFO retake.
