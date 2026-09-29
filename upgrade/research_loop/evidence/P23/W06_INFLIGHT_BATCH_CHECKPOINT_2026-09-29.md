# P23 W06 — bounded in-flight Library batch checkpoint, 2026-09-29

Status: **clean-candidate W06 FAIL; P23 OPEN**. This is a P12
backend-only change in the isolated `portal-research-p23-ol12` cell on :8096.
No API/contract/UI, pool limit, admission cap, SLO, migration, dev or production
runtime changed.

Earlier timing proved P12's four-reader admission queue dominated the warm
twenty-reader Library p95 (642 ms queue p95 versus 190 ms repository-work
p95). SQL-only prototypes did not sustain the 500-ms target. The candidate
coalesces simultaneous identical workspace/query/cursor page requests for at
most 20 ms and 20 readers. It runs one repeatable-read page+census snapshot,
checks every actor's workspace membership in that snapshot, and fetches
actor-owned RC drafts separately. The shared page SQL omits the actor draft
join entirely; a single reader keeps the original query. There is no
persistent cache and no actor-owned draft crosses response boundaries.

Focused Control API build and Library batch/admission tests pass; the batch
test covers membership denial, per-actor draft isolation and the 20-reader
cap. Existing owner/reader response hashes match the pre-change baseline
after excluding time-issued cursor/as-of fields.

On the disposable **uncommitted** 20-ms-window image, a real HEAVY WFO ran
while four durable intents queued and twenty distinct authenticated readers
issued the six named GETs. Library was 20/20 HTTP 200 with warm p95
**407 ms**, and all other reads passed; WFO completed; 5-GB cgroup peak was
**692,252,672 bytes**. The harness had marked that run `diagnostic_only=false`
using a stale `identity.json` even though the source was dirty and the active
Control API image differed. That boolean is invalid as release evidence. The
receipt remains private and is interpreted **diagnostic only**; it is not
silently rewritten. The workload harness now compares source SHA/dirty state
and all seven running image/container IDs with the identity before testing.

## Clean-commit retake and remaining bottleneck

Commit `2e90412d08a0ca4e8e719c46cdf6983bd40d201c` passed the full
repository hook, including Control API security/query/governance suites. The
owned cell rebuilt only Control API, retained its prior image for rollback,
then recorded `dirty=false` and all seven exact container/image identities.
Control API image: `sha256:184c558d39ad898a2bd390cdd0eb9e5c27e6f19934979618543fa8b23459ca2e`.
Twenty real sessions preflighted 20/20 HTTP 200 on every named read.

The official `w06-batch-clean-2e90412d` run returned **120/120 HTTP 200**,
one real HEAVY WFO `COMPLETED/READY`, four durable queued intents cancelled
by the harness afterward, no viewer-created job, and strict seven-service
cgroup peak **704,425,984 bytes** (<5 GB). Provenance is exact:
`diagnostic_only=false`, zero drift reasons. Its full read verdict is
**FAIL** because Evidence p95 **571 ms** exceeds the 500-ms summary SLO.
Library p95 **383 ms** now passes 500 ms; Progress 229, Search 154, Report
118 and Replay 492 ms also pass their named warm targets. This is not W06,
P23 or product acceptance.

Immediately afterward, a separate GET-only comparison returned Evidence
p95 **359 ms** and Library p95 377 ms (20/20 each, all six routes pass).
This narrows the remaining miss to the mixed-WFO Evidence path/contended
read lane, not a permanent failure of its archived response. A second exact
mixed retake was refused at preflight with typed 503 because the test
operator had eight unexpired manifests; it never reached the read load.
Natural expiry begins 11:49 UTC and ends 11:52 UTC on 2026-09-29. No
quota, job, credential or source row was manually altered; the harness
cancelled its admitted queued jobs and read-only SQL confirmed zero active
jobs. The failed retake remains private, not relabeled PASS.

Private 0600 evidence under
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`:

| Receipt | SHA-256 |
| --- | --- |
| `w06-batch-clean-2e90412d-workload.json` | `594a4149f571a0af933d63c247ab269b72f7f9172dd2a631a54929f418295761` |
| `w06-batch-clean-2e90412d-read.json` | `8867ce1a536fa0b49e9a6b6099bf533ec1cb40250ade8315f5d0956bf9bcdf4e` |
| `w06-batch-clean-2e90412d-resource-series.json` | `78d6e6eb2079db16ab091c3d436e330ba58c730a388e6b4c1ee459ee225037d2` |

Next backend candidate: under a specific P13 owner approval, reduce
Evidence transaction setup round trips without changing its two-reader
admission, exact membership, snapshot, API/UI or SLO. Then build a clean
candidate and retake mixed W06 after the natural preflight expiry. Cold-cache
T08 must use that same final candidate; this old candidate does not close it.
P23/P24 and the full goal remain OPEN.
