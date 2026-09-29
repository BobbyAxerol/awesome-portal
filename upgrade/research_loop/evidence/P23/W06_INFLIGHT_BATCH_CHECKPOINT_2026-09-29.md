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

## P13 setup-trip candidate and exact W06 retake

Commit `3f9a7fae` combines five transaction-local Evidence settings into one
parameterized PostgreSQL round trip; it does not change membership, RLS,
repeatable-read, two-reader admission, API/UI, pool size or the 500-ms SLO.
The clean Control API image was rebuilt in the owned P23 cell, all seven
services were healthy, and the candidate identity recorded `dirty=false`.
Focused Evidence tests, Control API build and the full repository hook passed.

The first official mixed retake, `w06-p13-3f9a7fae`, ran a real WFO with four
durable queued intents and twenty distinct readers. It returned **120/120 HTTP
200**, completed the WFO, cancelled the four queued intents afterward and kept
strict seven-service cgroup peak at **756,875,264 bytes** (<5 GB). Identity
check was exact (`diagnostic_only=false`). Nonetheless W06 **FAILS**: Library
p95 **655 ms** and Evidence p95 **666 ms** exceed even the owner-permitted
600-ms consideration band; Progress 374, Search 479, Report 268 and Replay
520 ms meet their existing per-route targets. No threshold was changed.

A subsequent GET-only twenty-reader comparison on the *same image* passed all
six routes (Library p95 391 ms, Evidence 313 ms). This establishes that the
first mixed failure coincides with real WFO contention; it does not establish
a permanent per-request Evidence SQL failure, nor qualify W06. The operator
has five unexpired owned preflight manifests from the run; another mixed
retake must await natural expiry. Do not delete manifests or bypass quota.

Private 0600 receipt SHA-256 for the exact mixed retake:

| Receipt | SHA-256 |
| --- | --- |
| `w06-p13-3f9a7fae-workload.json` | `d46b3b2b89f2609d06e48735c6ff6f7d53c0b5c1735c562934bf26af7effd83c` |
| `w06-p13-3f9a7fae-read.json` | `0ab34e99d4a2e0e9fae38ee9de2be9ec7925bc6472bb8ccaceffc69e0db62c2b` |
| `w06-p13-3f9a7fae-resource-series.json` | `06772a6007a893c91dfd519fc194377b5d1017e0347a60675f4e92cfbcd19521` |


## Clean exact retake after natural expiry

On docs-only source commit `2436b118`, the same P13 Control API image was
retained and all seven running image/container IDs were recorded anew with
`dirty=false`. The five owned preflight manifests had naturally expired;
neither quota nor business data was reset. The
`w06-p13-retake-2436b118` workload again used one real HEAVY WFO, four
durable queued intents, twenty distinct authenticated readers and the same six
named routes. It returned **120/120 HTTP 200**, completed the WFO, cancelled
the queued intents via the public API and kept peak aggregate cgroup memory at
**774,123,520 bytes**, well below 5,000,000,000. No viewer created a job and
`diagnostic_only=false`.

Warm p95: Library **365 ms**, Progress **240 ms**, Evidence **352 ms**,
Search **172 ms**, Report **118 ms**, Replay **301 ms**. All six meet their
original Guide §16.3 targets, including the 500-ms summary target; Bobby's
possible 500–600-ms relaxation was **not used**. This is an exact W06 **PASS
receipt on this retake**, not proof that the prior 655/666-ms miss never
occurred. The opposite outcomes on the same application image leave a
load-variance concern for ongoing qualification. T08, other P23 gates and
P24 remain OPEN; no production/dev runtime changed.

Private 0600 receipt SHA-256:

| Receipt | SHA-256 |
| --- | --- |
| `w06-p13-retake-2436b118-workload.json` | `1eca6e2f5e84dd25f69bc118d18edc6393ba563aa68d086f531e4cbb8c92e610` |
| `w06-p13-retake-2436b118-read.json` | `7827f1a59193da8ceb61bc79847419d7f71e82a04f1661b9d2e26024dea0a3d9` |
| `w06-p13-retake-2436b118-resource-series.json` | `6f81f13c171f11000536158995c601d861b91718b4328570b9ccaef1d2f36283` |
