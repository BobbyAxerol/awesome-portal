# P23 W06 — bounded in-flight Library batch checkpoint, 2026-09-29

Status: **current 88be2acd candidate W06 PASS twice; P23 OPEN**. The initial P12
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

## Repeatability retake and next narrow candidate

A third exact run, `w06-repeat-54749346`, used the **same P13 application
image** after the T08 owned-cell restart; only the evidence-docs commit/identity
changed. Its five new preflight manifests were admitted only after natural
expiry. The real WFO completed, four durable intents were queued then
cancelled, **120/120 GET returned 200**, `diagnostic_only=false`, and strict
seven-service memory peaked at **616,951,808 bytes**. The repeatability verdict
is **FAIL**: warm Library p95 **527 ms** and Evidence **618 ms** exceed the
original 500-ms target; Evidence also exceeds Bobby's possible 600-ms upper
band. Progress 363, Search 546, Report 280 and Replay 580 ms meet their
respective unchanged targets. Therefore the preceding 365/352-ms PASS is a
valid individual receipt but **W06 is not yet reliably qualified**. P23/P24
remain OPEN; no SLO was relaxed.

| Private 0600 receipt | SHA-256 |
| --- | --- |
| `w06-repeat-54749346-workload.json` | `7ffebe308b16e5b0fd101f6f652497482bb6ecb4f5aabb50472a706e65a3c98f` |
| `w06-repeat-54749346-read.json` | `4d3076c5e715e442a369b60d1cf9f11f0762dfa55cb7459bbf357a0a9cd661a1` |
| `w06-repeat-54749346-resource-series.json` | `adfa3a613d53ccaaf4f0acb099c7160d08fbfe7700f50f493380d321b1e10ee0` |

A further **source-only** P13 candidate removes the standalone transaction
timestamp SELECT by projecting `transaction_timestamp()` in the durable or
legacy matched-row query of the same repeatable-read transaction. It preserves
the DB-authoritative `as_of_utc_ms`, RLS/membership, 2/18 admission and API.
Focused 16/16 Evidence tests and Control API build pass. It is **not** a
runtime W06 fix until a clean commit/image and repeated real mixed retakes
prove it. No frontend, shared service or production change was made.


## Current 88be2acd candidate — two clean mixed retakes

The source-only statement above is historical. Commit
88be2acd23189b83109116c6d1b8c98f280a9af5 passed 16/16 focused
Evidence tests, Control API build and the full repository hook. Only the
isolated P23 Control API was rebuilt. Seven running image/container IDs were
pinned, including Control API image
sha256:c65403a1e3de199a0ffeb5a82b6c9e9744710638146eac327da6a195f95c9f03.
Both workload receipts have diagnostic_only=false, zero drift reasons and the
same clean source/image identity. Five owned preflights expired naturally
between retakes; neither quota nor business rows were cleared.

| Exact W06 run | Library p95 | Evidence p95 | Progress/Search/Report/Replay p95 | 7-service peak |
| --- | ---: | ---: | --- | ---: |
| w06-timestamp-88be2acd | 363 ms | 445 ms | 287/369/180/264 ms | 679,182,336 bytes |
| w06-timestamp-repeat-88be2acd | 405 ms | 305 ms | 203/187/114/313 ms | 619,872,256 bytes |

Each run admitted one real HEAVY WFO, observed four distinct durable queued
intents, completed the WFO, returned 120/120 GET 200 across twenty
authenticated readers/six routes and cancelled queued intents through the
public API. No viewer created a job; the post-run ledger had zero active or
queued jobs. Both summary routes meet the unchanged 500-ms warm target; all
other named reads meet their original targets. Bobby's possible 500–600-ms
relaxation was not used. This is a current-candidate exact mixed W06 subgate
PASS, not whole-P23 qualification or a guarantee against future host-load
variance. Earlier 655/666 and 527/618-ms failed receipts remain immutable
history.

The same image passed the scoped T08 cold GET-only subgate. After stopping
only five owned containers, guarded P23-only PostgreSQL/artifact-volume
eviction measured 85,966,848→0 resident bytes across 3,638 files/218,069,087
file bytes, with no byte modification or host cache drop. All seven services
recovered healthy. Cold 20-reader × six-route requests were 120/120 GET 200;
Library/Progress/Evidence/Search/Report/Replay p95 were
572/306/498/215/190/257 ms, all below cold targets. The overlapping
24-sample resource series peaked at 427,020,288 bytes. Same-image warm
GET-only Library/Evidence were 388/282 ms. This does not claim a simultaneous
cold-read+HEAVY T08 run.

Private mode-0600 receipts under
/home/bobby/.local/state/portal-research-p23/20260927/runtime/:

| Receipt | SHA-256 |
| --- | --- |
| w06-timestamp-88be2acd-workload.json | f6df05f7b6b8da545a221cd563fd6f48da1a643de6770c50e73e80f54d874d27 |
| w06-timestamp-88be2acd-read.json | 48685cf86844e0f44f104d5c576785e2fd06bed08a0ef6b6b4826e93f17bf802 |
| w06-timestamp-88be2acd-resource-series.json | eda77dbf3e631b6386b623cf70882ed6104f93435c0e5a14f6bf0fd4a85b5fb5 |
| w06-timestamp-repeat-88be2acd-workload.json | 6a31db726ee58be60069aa7ef48a2733f72fdbad7df903fa74a327a3ee443e5a |
| w06-timestamp-repeat-88be2acd-read.json | 6882fb6644ed7e201da6a772c916a8309579785eaf7e626f236f48bf37fc881e |
| w06-timestamp-repeat-88be2acd-resource-series.json | d899c828754da193c2ada120158b0f4f47d98b5b40167063b69e6666d5c72848 |
| t08-timestamp-88be2acd-eviction.json | 178e1d9dbe86b1782cd62a5635077129cb87ff845c4b698d9f3189e058631849 |
| t08-timestamp-88be2acd-cold-read.json | 80465a2f2112c6e84ce632d322aa06ba70e7f91d28ec64e7358196e20d0d6385 |
| t08-timestamp-88be2acd-resource-series.json | dc0d3bfcb77a584220bef5798af3a0bca07096f389c6472351adeb0b927a4dcd |

P23 still needs T02 plateau, T07/T13 upgrade/default/pins, T12
utility/audit admission, T14 exposure/audit-child, T15 browser-real and
final DR/BR/GX aggregation. No dev/Production runtime or Frontend changed;
no push was made.
