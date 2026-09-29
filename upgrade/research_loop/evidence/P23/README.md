# P23 backend qualification packet

**F5 refusal subset 2026-09-29:** [real S02/S14 negative API matrix](./F5_NEGATIVE_API_MATRIX_2026-09-29.md) confirms typed 400/401/403/404/409 and bounded real S02 preflight 503 on the same clean isolated candidate, without implicit jobs. Real 502, browser refusal rendering, identity revocation and full F5/P23 remain open.

**F5 S02 2026-09-29:** [owned-cell real browser write](./F5_S02_BROWSER_REAL_WRITE_2026-09-29.md) passed at 1280 and 660 px: clone → fresh preflight → create, exactly one durable job per attempt and terminal `COMPLETED/READY`; no stubs. F5 negative matrix and full cross-stack acceptance remain open.

**F5 S14 2026-09-29:** [owned-cell real browser write](./F5_S14_BROWSER_REAL_WRITE_2026-09-29.md) passed at 660 and 1280 px with parse, seven gates, DRAFT, ACTIVE and registry readback; no stubs, no implicit job. F5 overall remains open for the negative matrix and cross-stack acceptance.

**T15 2026-09-29:** [owned-cell browser-real subset](./T15_BROWSER_REAL_SCOPED_2026-09-29.md) passed at 1280 and 660 px: real WFO causal prefix 100→1→2 candles, deep-link and cross-run navigation, zero overflow/page errors and jobs 155→155. It did not overlap cold cache or WFO compute and is not full T15, F3/F5/OL-24 or P23 acceptance.

**W05 2026-09-29:** [storage-only synthetic scale](./W05_STORAGE_SCALE_2026-09-29.md) exercised the current trial/evaluation/replay column/index shapes at 100k/100k/1M rows in rollback-only temp tables; 200-row indexed pages and strict seven-service cgroup sampling passed. This does not qualify an alpha, retained importer, million-row BFF or P23 as a whole.

**V11-P23-DR 2026-09-29:** [one real Delta direct/persistence/API parity receipt](./V11_DIRECT_PARITY_2026-09-29.md) confirms three exact engine-direct scalars with zero numerical difference on a verified HMD snapshot. This is a scoped data-truth subset, not all workloads or P23 product acceptance. W06's two clean-image passes below used the original 500-ms SLO; Bobby's possible 500–600-ms relaxation was not applied.

**T09 current-candidate 2026-09-29:** [same-host Execution isolation retake](./T09_EXECUTION_ISOLATION_CHECKPOINT_2026-09-28.md#current-clean-candidate-retake--2026-09-29) scoped PASS: 1 real HEAVY/4 queued, 120/120 reads, Library/Evidence p95 392/494 ms, unchanged Execution/health signatures, 605,261,824-B peak. Two setup failures retained; P23/P24 OPEN.


**W07 2026-09-29:** [bounded interaction checkpoint](./W07_BOUNDED_INTERACTION_CHECKPOINT_2026-09-29.md) The corrected harness passed 2/2 focused tests and an actual WFO-overlap retake: eight named reads, AVAILABLE P04 Evidence, 3,046-ms stalled bounded export with matching digest, unchanged job count, 550,375,424-B peak. Scoped W07 PASS; P23/P24 remain OPEN.

**Latest T08/W06 qualification, 2026-09-29:** [current-candidate
cold-start mixed receipt](./T08_COLD_CACHE_CHECKPOINT_2026-09-28.md#current-candidate-cold-start-mixed-retake--2026-09-29)
passes 120/120 named GET 200 while one real WFO is RUNNING and four intents
queue after P23-only guarded cache eviction; Library/Evidence p95 414/404 ms,
seven-service peak 617,881,600 bytes. The separate cold GET-only subgate and
two exact W06 mixed retakes also pass on this Control API image without SLO
relaxation. Two pre-read setup failures (expired operator cookie, stale reader
manifest) and their public-API cleanup receipts are preserved, not counted as
latency samples. T08 current-candidate P23-only scope PASS; this does not
prove every page remained cold after WFO start. Full P23/P24 remain OPEN.

**Current candidate, 2026-09-29:** [Two exact W06 mixed-load receipts](./W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#current-88be2acd-candidate--two-clean-mixed-retakes)
on committed source 88be2acd and the same clean seven-image P23 cell PASS the
original warm targets twice: Library/Evidence p95 363/445 and 405/305 ms,
120/120 GET 200 each time, real WFO completed with four queued intents, and
seven-service peaks 679/620 MB (<5 GB). No 500–600-ms SLO relaxation was used.
[Same-image T08 cold GET-only](./W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#current-88be2acd-candidate--two-clean-mixed-retakes)
also passes 120/120 named GETs after P23-only guarded eviction. Historical
same-image failures on the previous P13 candidate remain documented below;
they are not rewritten. W06 current-candidate subgate PASS; T08 mixed-cold,
other P23 tests, P24 and Product acceptance remain OPEN. No dev/Production
runtime or Frontend changed and no push was made.

**Latest 2026-09-29:** exact same-image repeat `54749346` [W06 FAILS reliability](./W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#repeatability-retake-and-next-narrow-candidate):
Library/Evidence p95 527/618 ms despite 120/120 GET 200 and completed WFO.
The prior 365/352-ms PASS is retained, not promoted to stable qualification.
P13 timestamp-row follow-up is source-tested only; P23/P24 stay OPEN.

**Earlier 2026-09-29 individual PASS (not a stable W06 verdict):**
clean `2436b118` [W06 exact retake](./W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#clean-exact-retake-after-natural-expiry)
PASS at original 500-ms warm SLO (Library 365, Evidence 352 ms), 120/120
GET 200, real HEAVY/four queued and 774-MB aggregate peak. Prior same-image
655/666-ms FAIL remains a variability warning. [T08 same-candidate cold
GET-only](./T08_COLD_CACHE_CHECKPOINT_2026-09-28.md#same-final-candidate-cold-subgate--2026-09-29)
PASS in scope; mixed cold/WFO and full P23/P24 remain OPEN.

**Latest W06 clean-candidate checkpoint 2026-09-29:** [exact image, source and mixed-load receipts](./W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md) show Library p95 **383 ms PASS** but Evidence p95 **571 ms FAIL** under a real WFO/four queued/20 authenticated readers. All 120 GETs returned 200; the 5-GB cap passed. The old 407-ms dirty-image trial remains diagnostic only. **W06/P23 OPEN; no product qualification claim.**


**T03 clean-commit acceptance, 2026-09-29:** [real durable WFO disk-pressure and
recovery receipt](./T03_CLEAN_COMMIT_ACCEPTANCE_2026-09-29.md) is scoped PASS on
`761bc243`: `FAILED/READY` with `RESOURCE_EXCEEDED` then new `COMPLETED/READY`;
the original cell volume/image were restored. W06/P23 still OPEN.

**Latest W06 trial, 2026-09-29:** [unfiltered census query](./W06_UNFILTERED_CENSUS_TRIAL_2026-09-29.md)
preserves current response except its time-issued cursor, and exact mixed load
returns 20/20 Library 200. Warm p95 is **686 ms FAIL** against 500 ms; five
other reads and 5 GB cap pass. Not clean-commit acceptance. W06/P23 OPEN.

**Latest T03 durable-run checkpoint, 2026-09-29:** [real disk pressure and recovery](./T03_FULL_DURABLE_RUN_2026-09-29.md)
observes typed `RESOURCE_EXCEEDED` then successful WFO recovery. Zero-free did
not durably terminalize and is not counted; clean acceptance now supersedes this checkpoint.

**Owner scope decision, 2026-09-29:** Research-surface T05 is
`T05_RESEARCH_SCOPE_PASS` on clean `eae7a40d` using the named-read, Report
JSON/CSV and raw-object negative receipts. Bobby explicitly separated legacy
`/api/runs/:run_id/export` into a security slice; it is **not** certified by
this verdict. P23 still fails other gates, including W06.

**Latest T05 file/object route classification, 2026-09-29:**
[GET-only owned-cell receipt](./T05_FILE_OBJECT_LEGACY_CLASSIFICATION_2026-09-29.md)
finds no exposed raw Research artifact/object route; guessed API paths are
404, non-API paths serve only the same public HTML shell. The separate legacy
export has a mutating GET and no Research workspace key; the empty legacy
registry permits only an absent-run 404/401 check. Research T05 is scoped PASS;
legacy export is a separate open security slice, not a fabricated isolation PASS.

**Latest T10 Python baseline retake, 2026-09-29:** [Full isolated suite](./T10_PYTHON_BASELINE_RETAKE_2026-09-29.md)
passes with corrected stale P17/P13 test expectations and canonical BAR-05
manifest regeneration. No runtime source or frontend was changed. Full T10
browser/engine/resource evidence and P23 qualification remain OPEN.

**Latest T03/T05 runtime retake, 2026-09-29:** [Clean-image ext4, named-read
and export receipts](./T03_T05_RUNTIME_RETAKE_2026-09-29.md) pass real
0-byte-free append/manifest recovery on `d4021790`, then 10/10 authenticated
tenant/cache reads and 12/12 existing JSON/CSV status/download GETs on
`eae7a40d`. Full P06/API disk-full and remaining private file/object/legacy
route negatives remain, as does W06 latency; T03/T05/P23 are not complete.

**T03/T05 source repair checkpoint, 2026-09-29:** [Approved backend-only
repair and focused tests](./T03_T05_SOURCE_REPAIR_2026-09-29.md) maps genuine
artifact ENOSPC/EDQUOT to a bounded refusal and fixes personalized conditional
read/cache headers. Changed Python modules pass 25/25 and Control API focused
tests pass 9/9 plus build. This is **not** the clean-image runtime retake;
T03/T05 remain OPEN pending isolated ext4, full durable-run/API and ten-read
tenant/cache receipts. The prior failed receipts below are preserved.

**Latest W06 read-SLO checkpoint, 2026-09-29:**
[Identity-barrier retake and real mixed-load failure](./READ_SLO_IDENTITY_BARRIER_2026-09-29.md)
keeps 20-reader Library p95 **896 ms FAIL** under one real WFO/four queued;
other five named reads and 5 GB memory gate pass. This is not P23 qualification.


**Latest T08/W06 concurrency diagnostic, 2026-09-28:**
[Real running-WFO Library gradient](./T08_RUNNING_WFO_GRADIENT_2026-09-28.md)
returned 20/20 HTTP 200 in each 1/4/8/20-reader cohort. The 20-reader
warm p95 was **547 ms**, over the 500-ms target even with one active WFO;
the earlier one-active/four-queued W06 retake remained worse at 773 ms.
This narrows the workload trigger, not the server stage or root cause.
T08/W06/P23 remain open; no queue, pool, SLO or source behavior was changed.

**Latest T13 current-route negative checkpoint, 2026-09-28:**
[Exact named preflight refusal](./T13_CURRENT_ROUTE_NEGATIVE_CHECKPOINT_2026-09-28.md)
shows the existing `options` catalogue entry is not auto-admitted: 409 typed
refusal, no new job/preflight. This is **not** a new-build/in-flight/rollback
PASS; T07/T13 remain open.

**Latest T09 dynamic-isolation checkpoint, 2026-09-28:**
[Real HEAVY+four-queued overlap and unchanged Execution sentinels](./T09_EXECUTION_ISOLATION_CHECKPOINT_2026-09-28.md).
Owner/member capability+manifest signatures, anonymous 401, and both
same-host outside-P23 Portal health/container identities stayed identical
before/during/after. This is a scoped T09 pass, not an AWS-HK or full P23
claim. The first W06 failed: Library 3×503/p95 1263 ms and Progress/Evidence
over 500 ms. A second attempt met the genuine eight-live-preflight quota;
after natural expiry, a full retake returned all 120 GETs at 200 but Library
still failed warm p95 (773 ms versus 500 ms). An unloaded 1/4/8/20-reader
gradient stayed under 500 ms, so the exact W06 stage still needs profiling.

**Latest T08 cold-cache checkpoint, 2026-09-28:** [Exact isolated first-read
and warm Library regression](./T08_COLD_CACHE_CHECKPOINT_2026-09-28.md).
Two P23-only volumes were evicted without host-wide cache drop or any shared
container restart; 20 real principals × six cold GETs all met cold SLO, with
423,473,152-byte capped peak. Warm Library p95 failed twice (709/815 ms versus
500-ms target), and no simultaneous HEAVY+queued cold W06 was measured.
Therefore T08 is PARTIAL and full P23 remains NOT_QUALIFIED.

**Latest T03 disk-pressure checkpoint, 2026-09-28:** [Real 64-MiB ext4
ENOSPC receipt and source handoff](./T03_DISK_PRESSURE_CHECKPOINT_2026-09-28.md)
proves typed refusal on Parquet append, unchanged sealed reads, clean abort
and recovery. A >one-block manifest at zero free space instead produces
raw OSError errno 28; this is **CG-P23-T03-01** for shared <=P21 source.
T03 is PARTIAL, not product-qualified. The test used only a no-network,
non-root one-off container and its own loop mount; no existing P23 volume
or service was changed.

**T03 full durable-run retake, 2026-09-29:** [real API disk pressure and
recovery](./T03_FULL_DURABLE_RUN_2026-09-29.md) passes the scoped WFO
`RESOURCE_EXCEEDED` terminal and post-pressure completed run. Final clean-candidate
P23 qualification and W06 remain open; the earlier failed checkpoint is retained.

**Latest T12 negative admission checkpoint, 2026-09-28:** [Finite real quota
receipt and precise source-owner handoffs](./T12_ADMISSION_QUOTA_CHECKPOINT_2026-09-28.md)
prove eight accepted preflights/actor, a ninth typed 503, another workspace
member unaffected, unchanged 40 durable jobs and 11 capped cgroup samples.
This is **preflight admission only**. T12 remains PARTIAL: no published
`AUDIT_OF_SELECTION` child admission or fully measured utility-kind quota;
`CG-P23-T12-01/02` are assigned to shared ≤P21 source owner Claude.

**Latest T04 clean-candidate fault checkpoint, 2026-09-27:** [Actual PG,
NATS and worker drill](./T04_CLEAN_FAULT_CHECKPOINT_2026-09-27.md) passes a
5,014-ms structured database refusal/recovery without Control API restart;
one real same-intent durable run resumes after NATS/worker restoration and
ends `COMPLETED/READY`, original archived source/auth unchanged. All seven
candidate image pins and post-fault hard cgroup limits match. This closes
**T04 on the isolated clean candidate only**, not other P23/P24 gates.

**Latest T11 deep-read checkpoint, 2026-09-27:** [Real 20-reader far-seek
receipt](./T11_FAR_SEEK_CHECKPOINT_2026-09-27.md) passes seven named API reads
per principal, 140/140 status 200, actual signed Library/replay keysets,
`at`/`before` playhead truth, job count 37→37 and 24 overlapping capped
cgroup samples (429371392-byte peak). This is **T11 backend/API PASS only**;
T15 browser-real and full P23/P24 remain open. The failed stale-cookie first
attempt is retained and normal test-account login corrected the private
manifest without password reset or business mutation.

**Latest T05 tenant/cache checkpoint, 2026-09-27:** [Ten real named reads and
source repair request](./T05_TENANT_CACHE_CHECKPOINT_2026-09-27.md) show owner
200/nonmember 404/anonymous 401 on all ten, including conditional requests.
T05 is **NOT_QUALIFIED**: three reads omit `Cache-Control`; browser-visible
weak ETags do not revalidate Freeze/Report. `CG-P23-T05-01` belongs to the
shared ≤P21 source owner; the failed 0600 receipt is retained for retake.

**Latest T14 graph/restore checkpoint, 2026-09-27:** [Real R1 and nonempty
publication graph](./APPROVAL_GRAPH_RESTORE_CHECKPOINT_2026-09-27.md) proves
approved R1@2, exactly one promotion fact, revoked temporary capability,
null-trial RC pin, 139-table/16-artifact coherent restore and worker-off
readback. T14 stays **PARTIAL**: this cell has no real exposure fact or
AUDIT_OF_SELECTION child. No SQL membership mutation, fake source fact or GC
deletion was performed.

**Latest T12 utility checkpoint, 2026-09-27:** [Worker flag repair and actual retake](./UTILITY_CHECKPOINT_2026-09-27.md)
records the real missing worker what-if flag, unchanged image/caps/mounts/auth,
and successful primary + diagnostic, sealed **81 cells/63 unique evaluations**,
eight READY exports, six MATCH verifies and exact parent preservation. Peak
**656769024 bytes**. Failed instruments/runtime evidence remain retained.
This is scoped utility PASS, **not full T12**: separate audit/quota negatives,
other P23 gates and P24 remain OPEN. No frontend or Production change.

**Latest W08/T02 checkpoint, 2026-09-27:** [Actual cycle failure and handoff](./PLATEAU_CHECKPOINT_2026-09-27.md)
records six real complete/fail/cancel terminals, stable scoped worker FD/RSS,
and **42 files/1006525 bytes supervisor scratch growth**. Third-round admission
hit the actor's eight-live-preflight budget. Exact Node PID and natural-expiry
pacing are repaired in the tool, not asserted as a new runtime PASS.
`CG-P23-T02-01` is OPEN for Claude's <=P21 scratch lifecycle; other P23 gates
continue. T02/P23/P24 remain unqualified; no blind rerun or scratch deletion.

**Latest publication/tenant checkpoint, 2026-09-27:** [Real source journey and repair](./PUBLICATION_REPLAY_CHECKPOINT_2026-09-27.md)
records actual current WFO→RC seal→one R1/publication, a preserved failed
terminal replay flag assertion and its small P22 backend repair (17 focused
tests/build PASS; subsequent clean `19a8e813` runtime replay PASS). Three exact
retry POSTs preserve one R1/publication and immutable row bytes; GET is unchanged.
Nineteen actual export checks and five publication negatives PASS, alongside
ten named-read/ETag isolation checks, not full T05. The new nonempty publication does not supersede T14's
missing nonempty-graph restore/GC proof. Full goal stays ACTIVE.

**Latest mixed/restore checkpoint, 2026-09-27:** [Actual candidate proof](./MIXED_RESTORE_CHECKPOINT_2026-09-27.md)
records clean `b2e8b868` twenty-reader/one-heavy/four-queued completion,
Library p95 **490 ms PASS**, 618209280-byte peak, cold process reads PASS,
and actual coherent restore of 139 tables/9 sealed artifacts/54 parts/337 files
with worker-off readback. Image-index recovery and failed attempts are retained.
Nonempty publication/selection graph, remaining T gates and browser/P24 stay
OPEN; older absence/789-ms paragraphs below are historical, not current status.

**Earlier read/outage/import checkpoint, 2026-09-27:** [Previous packet](./READ_OUTAGE_IMPORT_CHECKPOINT_2026-09-27.md)
records actual mixed-load diagnostic (one heavy/four queued/20 identities,
684380160-byte peak, initial Library SLO FAIL), optimized warm read p95 466 ms,
real PG/NATS/worker recovery after pool-error repair, bounded read admission,
and E6-BR-01 source-only signing/SBOM semantics. These dirty-image diagnostics
do not close T01/T11 or full P23. Full qualification remains IN_PROGRESS;
the initial NOT_RUN table below is historical, not absence of these probes.

**Current owned runtime checkpoint, 2026-09-27:** cell 8096 is built/running,
22 distinct test principals authenticated without auto-login, F4/E10 real
stranded-terminal/retry-expiry/live-lease preservation and OL-02 real observer
MATCH/MISMATCH on a test copy PASS. [Exact proof and safety limits](./RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md).
Full OL-12/P23 remains **NOT_QUALIFIED**: this is not 20-viewer mixed-load,
restore/cold/upgrade/browser or P24 acceptance. Historical paragraphs below
are preserved, not current absence of a cell or P22 backend.

Status: **BACKEND_RESOURCE_HARNESS_READY · NOT_QUALIFIED**. This is P23 (the
request's heading), not another P22 publication implementation. P22's real
Delta→R1 and S11 browser receipts remain prerequisites; see the P22 packet.

Current-status correction, 2026-09-27: P22's **backend real-preview** prerequisite
is satisfied by its immutable real-preview receipt. The S01/S02/S10/S11 final
candidate browser lane remains separate. Preserve the paragraph above as the
historical checkpoint, not a claim that the P22 backend must be implemented again.
Full OL-12 remains NOT_QUALIFIED. The T-id mapping/byte-hash/runtime requirements
of `qualify.mjs` are corrected and tested in the [current checkpoint](./F6_MIGRATION_VERIFIER_CHECKPOINT_2026-09-27.md).

## Delivered without changing a runtime

- `compose.research-p23-5gb.yaml` is an *opt-in, isolated-cell-only* profile.
  Its eight long-running cgroup caps total **4,600,000,000 decimal bytes**;
  the sequential migration/bootstrap cap is 350,000,000 bytes, keeping the
  maximum planned overlap below 5,000,000,000 bytes. `memswap_limit` equals
  `mem_limit`, and process counts are bounded. This does not assert a live
  workload fits; an OOM under the cap is a qualification failure, not success.
- `resource-snapshot.mjs` reads every container's `memory.current` (page cache
  included), configured memory/swap/PID limit and rejects an unexpected service,
  duplicate service, absent cap in strict mode or aggregate over 5 GB. Unlike
  `docker stats`, it does not subtract cache. It prints no env/secret.
- `read-load.mjs` issues GET-only same-origin Research reads through 20 distinct
  authenticated sessions. It verifies each session via `/api/auth/context`
  against a distinct `principalId`, so preview auto-login Bobby cannot be
  counted as 20 users. It writes only status and latency, never rows/cookies.
  A private manifest supplied at run time has `base_url`, exactly 20
  `{id,cookie}` entries, and 1–12 allowlisted `/api/v1/research/...` GET paths.

The profile is not in `preview.sh` or any production deployment. To qualify,
provision an isolated `portal-research-p23-*` Compose project with separate
volumes, loopback port `127.0.0.1:8096`, scoped credentials and the profile as the last Compose
file; run `docker compose config -q` first. Do not reuse the shared preview
database, auto-login identities or production/stable data. Capture cgroup
samples *during* real W01/W02/W06/W07/W08, not merely before/after them.
Take cold/warm measurements without host `drop_caches`; run faults only in the
isolated project. Keep 20-session manifest private (0600) and revoke all
temporary sessions after the receipt. `--require-limits` must pass on each
active runtime service; a missing cap is a refusal, even at low idle RSS.

## Acceptance boundary

This packet gives the exact backend test matrix in [phase report](./phase-report.md).
It is **not** a substitute for W01/W02 real Delta, W05 storage scale, W06 20
users plus heavy/queued work, W08 repeated jobs, W09 fault/restore, W10
upgrade, or Claude's `V11-P23-BR`. No fixture or idle baseline is called a
5 GB acceptance receipt. Full P23 remains open until all P23-T01…T15 and
V11-P23-DR/BR/GX have actual qualified evidence.

Rollback: the profile is opt-in. Stop only the isolated P23 project; retain
its evidence and any immutable source refs. No Research/Execution production
flag, approval, volume, user or release was touched in this slice.

## Qualification-tool correction — 2026-09-25

The strict cgroup receipt now rejects a missing mandatory Research service,
counts a running 350 MB migrate/bootstrap one-shot (and rejects both running
together), and can sample a bounded time series with a peak rather than
presenting one idle instant as workload evidence. Example:
`node scripts/research-p23/resource-snapshot.mjs portal-research-p23-qual --require-limits --samples=60 --interval-ms=5000`.
The 20-principal read sampler measures **complete** JSON responses up to
2 MiB, not time-to-headers followed by cancel; it refuses path-normalization
escape, non-JSON and oversized responses without printing rows or cookies.
Focused tests cover each refusal. The existing shared preview is deliberately
rejected by the strict gate (`UNBOUNDED_CGROUP:quant-worker-py`), not accepted
as a 5 GB result. No isolated load, restore or upgrade PASS is claimed.
