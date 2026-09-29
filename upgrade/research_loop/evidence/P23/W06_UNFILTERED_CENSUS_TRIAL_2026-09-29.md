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
