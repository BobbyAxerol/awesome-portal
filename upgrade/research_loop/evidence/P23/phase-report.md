# P23 backend report — 2026-09-25

**W07 2026-09-29:** [bounded interaction checkpoint](./W07_BOUNDED_INTERACTION_CHECKPOINT_2026-09-29.md) The actual W07 read sample passed source overlap, bounded slow export, deep replay, job parity and cgroup limits but failed typed Evidence availability on the historical WFO. The corrected harness uses the existing AVAILABLE P04 Hub and awaits a new runtime retake. W07/P23/P24 remain OPEN.

**Latest T08, 2026-09-29:** [cold-start mixed retake](./T08_COLD_CACHE_CHECKPOINT_2026-09-28.md#current-candidate-cold-start-mixed-retake--2026-09-29)
on the unchanged Control API image passes after exact P23-only cache
eviction: one real WFO RUNNING plus four queued at read onset, 120/120 GET
200, Library/Evidence p95 414/404 ms at original warm targets, strict
seven-service peak 617,881,600 bytes. Combined with 120/120 genuine
cold GET-only PASS, T08's isolated cache/restart and mixed-load subgates
are scoped PASS. The earlier expired-cookie/stale-manifest attempts produced
no read samples and were cleaned through public API. Not a guarantee every
page remained cold during WFO; full P23/P24 remain OPEN.

**Current W06/T08 candidate, 2026-09-29:** committed source 88be2acd
passes two exact clean-image W06 retakes at the unchanged warm SLO. Twenty
principals × six GETs return 120/120 200 per retake while a real HEAVY WFO
completes and four durable intents queue; Library/Evidence p95 are 363/445
and 405/305 ms, seven-service peaks 679,182,336/619,872,256 bytes.
The same-image guarded cold GET-only subgate also returns 120/120 200 under
every cold target. [Receipt hashes and historical failures](./W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#current-88be2acd-candidate--two-clean-mixed-retakes).
W06 current-candidate subgate PASS; T08 simultaneous cold+WFO and full
P23/P24 remain OPEN. No threshold, pool, admission, API/UI, shared runtime
or production flag changed; no push was made.

**Latest W06 repeatability, 2026-09-29:** [same-image mixed retake](./W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#repeatability-retake-and-next-narrow-candidate)
FAILS 500-ms warm summaries (Library/Evidence p95 527/618 ms; Evidence
also exceeds 600 ms). All 120 GETs are 200; real WFO completed under
616,951,808-byte peak. P13 timestamp-row follow-up is source-tested,
not runtime-accepted. W06 reliability and full P23/P24 remain OPEN.

**Earlier individual W06 PASS/T08 subgate, 2026-09-29:** [clean exact W06 retake](./W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#clean-exact-retake-after-natural-expiry)
PASS on `2436b118` at the original warm SLO with one real HEAVY/four queued
and twenty principals (120/120 GET 200; Library/Evidence p95 365/352 ms;
774,123,520-byte seven-service peak). The preceding same-image 655/666-ms
FAIL remains recorded as latency variance. [Same-candidate T08 cold GET-only](./T08_COLD_CACHE_CHECKPOINT_2026-09-28.md#same-final-candidate-cold-subgate--2026-09-29)
also passes its scoped cold targets after P23-only page-cache eviction.
Simultaneous cold/WFO, other matrix gates, full P23 and P24 remain OPEN.

**T03 current addendum, 2026-09-29:** [clean committed-image full-run
receipt](./T03_CLEAN_COMMIT_ACCEPTANCE_2026-09-29.md) is scoped PASS: real
`FAILED/READY`/`RESOURCE_EXCEEDED` at high-water, then new `COMPLETED/READY`
after removal of synthetic pressure. Prior PARTIAL rows are historical.

**T05 owner decision, 2026-09-29:** `T05_RESEARCH_SCOPE_PASS` on clean
`eae7a40d` for the published Research read/Report export and gateway
raw-object surfaces; previous PARTIAL rows below are pre-decision history.
The legacy mutating-on-GET export is a separate open security slice by Bobby's
choice, not silently waived or called isolated. P23 remains OPEN.

**T05 addendum, 2026-09-29:** [file/object/legacy classification](./T05_FILE_OBJECT_LEGACY_CLASSIFICATION_2026-09-29.md)
adds bounded GET-only negatives against a real sealed artifact: no raw-object
API or byte leak through the gateway. The legacy export route is a distinct
mutating-on-GET, non-workspace-scoped surface; an absent Research run returns
404/401, but no nonempty legacy tenant-isolation claim is made. T05 is PARTIAL.

**T10 addendum, 2026-09-29:** the full Research backend Python suite exits 0
in the disposable read-only-source P23 test container after two stale test
expectations and the canonical freeze manifest were corrected. See the
[exact scoped receipt](./T10_PYTHON_BASELINE_RETAKE_2026-09-29.md). This
supersedes only the Python-regression portion of the historical T10 row below;
browser/engine/resource qualification on one immutable candidate is still OPEN.

## Current addendum — 2026-09-27

The initial matrix below remains historical. [Current checkpoint](./MIXED_RESTORE_CHECKPOINT_2026-09-27.md)
supersedes absence of an owned cell/P22 backend: F6 + upgrade, real F4/E10 and
OL-02 observer proofs are closed; P22 backend real publication is closed.

| Test | Current status, scoped honestly |
|---|---|
| T08/W06 follow-up | Diagnostic only: one real WFO stayed RUNNING through 1/4/8/20-reader Library cohorts; 80/80 GET 200, p95 94/142/177/**547** ms. The 20-reader warm target is 500 ms. This does not include four queued intents, six-route overlap or cgroup time series; no source stage was measured or limit changed. [Actual receipt and owner measurement bar](./T08_RUNNING_WFO_GRADIENT_2026-09-28.md). |
| T08 | PARTIAL: exact P23 DB+artifact volume cache evicted to zero without host `drop_caches` or shared container restart. Retake 20 real principals × six cold GETs returns all 200 and cold SLO PASS (Library p95 984 ms); eight-sample seven-service cap peak 423473152 bytes, one sample overlaps the reads. Two separate warm Library p95 results 709/815 ms FAIL the 500-ms target; HEAVY+four queued W06 was not simultaneous. No full T08/P23 claim. [Actual private byte hashes and next action](./T08_COLD_CACHE_CHECKPOINT_2026-09-28.md). |
| T09 | Scoped dynamic PASS on the pinned P23 cell: exactly one HEAVY/four queued while owner/member Execution capability+manifest GET signatures, anonymous 401, and four same-host outside-P23 container health/identity remained unchanged before/during/after; natural-expiry retake reproduced this. No AWS-HK or stable authenticated business-read claim. W06 remains FAIL: first Library 3×503/p95 1263 ms plus Progress/Evidence >500 ms; retake 120/120 HTTP 200 but Library warm p95 773 ms >500 ms. [Both actual receipts and scope](./T09_EXECUTION_ISOLATION_CHECKPOINT_2026-09-28.md). |
| T13 | Scoped current-catalogue negative PASS only: actual authenticated `options` preflight 409 `RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED`, default false, jobs/preflight manifest counts unchanged. No newer engine build, in-flight pin, default rollback or archived reproduction was tested; T13 and T07 remain OPEN. [Private receipt hash and exact boundary](./T13_CURRENT_ROUTE_NEGATIVE_CHECKPOINT_2026-09-28.md). |
| T03 | PARTIAL / NOT_QUALIFIED: real no-network UID 10001 writer on new 64-MiB ext4 loop image. At 4-MiB free high-water seal succeeds; at 0 free append returns typed RESEARCH_ARTIFACT_DISK_FULL and prior seal/read/recovery remain exact. Corrected >one-block manifest seal at 0 free returns raw OSError errno 28, so CG-P23-T03-01 is OPEN for shared <=P21 source. Full isolated P06 durable-run/API retake remains. [Actual evidence, first false-pressure attempt and exact locator](./T03_DISK_PRESSURE_CHECKPOINT_2026-09-28.md). |
| T02 | NOT_QUALIFIED: two actual complete/fail/cancel rounds (six terminals); supervisor scratch +42 files/+1006525 bytes. Third round refused by eight-live-preflight actor budget. Earlier API PID1 measures Docker init and cannot qualify Node plateau; corrected probe/pacing needs a new receipt after owner scratch repair. [Exact failure and CG-P23-T02-01](./PLATEAU_CHECKPOINT_2026-09-27.md). |
| T01 | Scoped real mixed-load PASS on clean application `b2e8b868`: twenty readers, one HEAVY/four queued, actual completion, 120 GET 200, Library p95 490 ms, 618209280-byte peak, zero implicit jobs. Final qualification aggregation/image-index binding remains separate. Prior 789 ms FAIL retained. |
| T04 | PASS on clean immutable `19a8e813` owned cell: actual PostgreSQL outage returns structured refusal in 5014 ms; recovery preserves original source/auth and Control API PID/restart count. Owned worker+NATS outage, one same-intent replay, no duplicate job or fabricated source event, real run COMPLETED/READY. All seven services restored, exact image pins and post-fault hard cgroup bounds match. Separate disk-full/mixed load remain T03/T01. [Actual T04 receipt](./T04_CLEAN_FAULT_CHECKPOINT_2026-09-27.md). |
| T05 | PARTIAL on clean `eae7a40d`: 10/10 authenticated named Research reads have owner 200/nonmember 404/anonymous 401, private cache and weak-ETag revalidation; 12/12 GET-only status/download probes on existing JSON/CSV Report exports have private,no-store and the same authority refusals. Earlier 19 export creation/READY and cross-actor/workspace checks remain separate. No raw MinIO/object or guessed-file URL was tested; legacy QuantBT `/api/runs/:run_id/export` is a distinct facade surface. Full T05 remains OPEN. [Current scoped retake](./T03_T05_RUNTIME_RETAKE_2026-09-29.md) · [original failing receipt](./T05_TENANT_CACHE_CHECKPOINT_2026-09-27.md). |
| T06 | Actual scoped PASS: observer MATCH/MISMATCH/copy restore plus coherent 139-table/9-artifact/54-part/337-file restore and five worker-off GETs. Original seals unchanged. Nonempty graph/GC is T14, not inferred here. |
| T10 | PARTIAL: `b2e8b868` full commit hook PASS (1331 backend, one external skip; 196 contracts). Focused Library 30/P12 actual PG 11/build PASS. Full required browser/engine qualification remains separate. |
| T11 | Backend/API PASS on clean pinned `19a8e813`: 20 distinct readers, seven reads each/140 GET 200, Library signed cursor depth 13, replay signed cursor depth 17, real `at` ordinal 1650/2208 and `before` readback. Seven warm p95s meet Guide targets (WFO search exactly 750 ms); 24 overlapping bounded cgroup samples peak 429371392 bytes; jobs 37→37, zero active compute, seven image IDs unchanged. This does **not** close T15 browser-real or P23. First stale-cookie refusal retained; [exact T11 receipt](./T11_FAR_SEEK_CHECKPOINT_2026-09-27.md). |
| T12 | PARTIAL: actual flag-parity retake completes primary and diagnostic, seals 81 cells/63 unique evaluations, eight exports READY/six verifies MATCH, preserves parent and adds exactly two explicit jobs under 656769024-byte peak. A separate real negative preflight-admission proof has 8×201/9th typed 503, independent actor 201, jobs 40→40 and 391532544-byte peak; this is **not** an audit or utility-kind quota. `CG-P23-T12-01/02` remain OPEN with exact source locators. [Positive utility](./UTILITY_CHECKPOINT_2026-09-27.md) · [negative admission/owner handoff](./T12_ADMISSION_QUOTA_CHECKPOINT_2026-09-28.md). |
| T14 | PARTIAL: real R1 APPROVED@2, promotion pick one, temporary grant revoked, actual null-trial RC pin and coherent restore (139 tables/16 artifacts/127 parts/753 files), worker-off five reads and post-restore GC pin readback PASS. Exposure and AUDIT_OF_SELECTION child source cases are absent; no fake rows or deletion. [Actual graph and private receipt hashes](./APPROVAL_GRAPH_RESTORE_CHECKPOINT_2026-09-27.md). |
| T07/08/09/13/15 | Preserve exact remaining workload/scale/cold/upgrade/browser gates, not closed by this subset. |

E6-BR-01 typed source-only signature/SBOM absence has a real DRAFT import/replay/
list/injection-refusal receipt. No alpha signature or full browser claim.
The new packet contains raw private evidence hashes, preserved failed probes,
runtime pin boundary, resource snapshot and deferred owned-cell cleanup.

Cold process/pool read proof exists, not a host/HMD cache flush. **Historical
sequence, superseded by the T14 row above:** the first restored graph was empty;
the subsequent public WFO→RC seal→R1 journey created one real publication.
That nonempty graph was later restored and read back as recorded in the current
T14 checkpoint, although exposure/audit-child cases remain absent. Terminal POST
replay metadata repair has 17 focused tests/build PASS and actual clean
`19a8e813` runtime retake PASS: three repeated POSTs return true, same R1,
one row with unchanged bytes, GET false. Nineteen actual export checks and
five publication negatives PASS, plus ten named-read/ETag checks, not complete T05. See
[publication continuation](./PUBLICATION_REPLAY_CHECKPOINT_2026-09-27.md).
Do not erase the historical failure tables below or call full P23 qualified.

Branch `docs/research-loop-plan`; owner Codex. Scope: resource profile,
read-only cgroup/load instruments, focused backend regressions and truthful
qualification ledger. No frontend code, runtime restart, production deploy,
P22 publication, Execution/Trading System or shared-preview data mutation.

## Actual evidence

| Check | Result |
| --- | --- |
| Merge concurrent Claude/RF commits | PASS: local P22 `05e7801e` and 8 remote commits merged without conflict at `c9ae3c7d`; no frontend paths edited by P23. |
| Compose profile render | PASS: isolated-project `docker compose ... -f compose.research-p23-5gb.yaml config -q`; no container created. |
| Resource/load harness unit tests | PASS: 5/5 `node --test scripts/research-p23/*.test.mjs`; rejects reused sessions, auto-login principal mismatch, mutation/external path, insecure manifest permissions and missing cgroup cap. |
| Research security/bounded-read regressions | PASS: 19 tests, 1 environment-skipped from 6 focused files. The skip is **not** a DR PASS. |
| WFO/current-source regression | PASS: 40 tests in 3 non-DB files. P22 migration initially failed only because no local PG fixture; rerun in exact-name disposable PostgreSQL 16: PASS 1/1. Container removed. |
| Actual shared preview cgroup baseline | `2026-09-25T09:15:09Z`: 7 active services total `441,843,712` bytes `memory.current`. **NOT QUALIFIED:** all seven have `memory.max=unlimited`/`HostConfig.Memory=0`; no heavy or 20-user load was running. |
| Source/host boundary | Protected strategy SHA-256 `34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d` equals `PROTECTED_SHA256`; host no swap; disk `/` 55% used, 281 GB available at sample. Shared preview remained healthy with unchanged container uptimes. |

One failed intermediate test command is retained honestly: `research-release-candidate-publication-migration.spec.ts`
against default `127.0.0.1:5432` got `ECONNREFUSED` because that fixture
was not started. It passed when rerun with the isolated PG16 container;
this is a test-setup error, not a schema or runtime failure.

## P23-T01…T15 status, no inflated PASS

| Test | Backend status and exact remaining receipt |
| --- | --- |
| T01 | NOT_RUN: 20 distinct identities + real heavy/queued job + cgroup time series under cap. |
| T02 | NOT_RUN: repeated complete/fail/cancel plateau. |
| T03 | NOT_RUN: isolated disk high-water/full and bounded failure. |
| T04 | NOT_RUN: isolated PG/NATS/worker outages and durable resume. |
| T05 | PARTIAL: focused controller/auth/CSRF/actor and bounded-read regressions pass; full cross-tenant file/cache/export matrix not yet run. |
| T06 | NOT_RUN: artifact-corruption and DB+artifact restore hash/readback. |
| T07 | PARTIAL: current WFO profile tests pass; new engine build, defaults and in-flight pinning not exercised. |
| T08 | HISTORICAL_NOT_RUN at this earlier checkpoint; superseded by the current PARTIAL row above. No host-wide cache drop was used. |
| T09 | PARTIAL: P23 has no Execution code/config mutation; no concurrent Execution behavior comparison under W06. |
| T10 | PARTIAL: focused suites above, not full required regression matrix. |
| T11 | NOT_RUN: 20-user inspect/slider/far-seek plus job-count/cgroup samples. |
| T12 | NOT_RUN: audit/what-if/verify/export alongside heavy with quota and queue measurements. |
| T13 | PARTIAL: current capability/profile regression passes; newer release route/default fixture and rollback not run. |
| T14 | NOT_RUN: restored GC/ref graph/exposure/audit child/selection/publication pins. |
| T15 | CLAUDE_BROWSER_PENDING: cold-load deep-link/cursor/reveal and cross-run browser receipt. |

`V11-P23-DR` needs real source/build/snapshot IDs and direct-vs-Portal numeric
diff under W01/W02/W06; `V11-P23-BR` belongs to Claude on the same immutable
candidate; `V11-P23-GX` is partial until actual resource/permission/rollback
and teardown receipts are taken. P22 remains pending actual Delta→R1 and S11.

## Next exact backend sequence

1. Finish P22 real preview receipt and pin a build/source/dataset identity.
2. Start a separate P23 cell using the opt-in profile; provision 20 distinct
   temporary identities, turn **off** preview auto-login and record session
   expiry/revocation. W01/W02/W06/W07/W08 cgroup and latency samples must
   pass together; a cap-triggered OOM is a fail requiring tuning.
3. Run faults/restore/upgrade only on that cell; compare DB and immutable
   artifact digests/ref graph and ensure Research failure leaves Execution
   unchanged. Then Claude runs browser-real on the same build and records
   visual/DOM/network receipt. Close P23 only with every required status PASS.

## Backend repair addendum

The initial sampler could have accepted a partial stack and only measured
response headers. Those false-PASS paths are now closed. The strict read-only
check of the **existing** shared preview correctly exits 1 with
`UNBOUNDED_CGROUP:quant-worker-py`; its container limits were not altered.
The resource/read harness passes 6/6 focused tests including missing service,
one-shot overlap, normalized-path escape and >2 MiB body refusal. The full
P23-T01…T15 matrix above is unchanged: no 20-user/W06, fault/restore, new
engine or browser receipt was run in a capped isolated cell, so the phase
remains NOT_QUALIFIED.


## Thanhvuong selective-integration review — 2026-09-25

The contributor's nine-file Playwright qualification runner is **not adopted**.
Its fixtures target an older generated schema (for example `Mirror`, PUBLISHED
composition fields and pre-RS-02 artifact/lineage shapes), and its standalone
typecheck fails against the current contracts. Keeping it would add CI debt or
require unapproved casts/rewrite of the current evidence fixtures. The runner
remains available in the imported contributor commit for audit/rework, while
its failures and open debt remain those recorded in the imported
`thanhvuong-*.md` packets.

The contributor's alternate Python Atlas route is **rejected as incompatible**:
the current source intentionally retired the public Python route and serves the
Atlas through the Control API/internal boundary. No direct browser-to-Python or
second Atlas authority is added. P23 remains NOT_QUALIFIED until the canonical
isolated stack produces the real workload, fault/restore and browser receipts.
