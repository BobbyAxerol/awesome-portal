# P23 W06 — bounded in-flight Library batch checkpoint, 2026-09-29

Status: **diagnostic PASS for latency; official W06 OPEN**. This is a P12
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

Next: commit the bounded query and provenance guard, build a clean exact-
commit Control API image, refresh the owned-cell identity, and retake the
mixed workload. Official W06 requires 20/20 complete responses, warm Library
p95 <=500 ms, cold p95 <=1,500 ms, one completed real WFO plus four queued
durable intents, and <5-GB strict cgroup evidence on that pinned candidate.
P23 and P24 remain OPEN until their independent matrices pass.
