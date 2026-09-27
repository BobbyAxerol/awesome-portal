# P23 backend report — 2026-09-25

## Current addendum — 2026-09-27

The initial matrix below remains historical. [Current checkpoint](./MIXED_RESTORE_CHECKPOINT_2026-09-27.md)
supersedes absence of an owned cell/P22 backend: F6 + upgrade, real F4/E10 and
OL-02 observer proofs are closed; P22 backend real publication is closed.

| Test | Current status, scoped honestly |
|---|---|
| T02 | NOT_QUALIFIED: two actual complete/fail/cancel rounds (six terminals); supervisor scratch +42 files/+1006525 bytes. Third round refused by eight-live-preflight actor budget. Earlier API PID1 measures Docker init and cannot qualify Node plateau; corrected probe/pacing needs a new receipt after owner scratch repair. [Exact failure and CG-P23-T02-01](./PLATEAU_CHECKPOINT_2026-09-27.md). |
| T01 | Scoped real mixed-load PASS on clean application `b2e8b868`: twenty readers, one HEAVY/four queued, actual completion, 120 GET 200, Library p95 490 ms, 618209280-byte peak, zero implicit jobs. Final qualification aggregation/image-index binding remains separate. Prior 789 ms FAIL retained. |
| T04 | PARTIAL: actual PG/NATS/worker outage found/repaired API pool crash; corrected bounded refusal/recovery/source preservation/one durable intent PASS on diagnostic image. Clean candidate proof still required. |
| T06 | Actual scoped PASS: observer MATCH/MISMATCH/copy restore plus coherent 139-table/9-artifact/54-part/337-file restore and five worker-off GETs. Original seals unchanged. Nonempty graph/GC is T14, not inferred here. |
| T10 | PARTIAL: `b2e8b868` full commit hook PASS (1331 backend, one external skip; 196 contracts). Focused Library 30/P12 actual PG 11/build PASS. Full required browser/engine qualification remains separate. |
| T11 | PARTIAL: clean mixed twenty-reader sample has zero implicit jobs (20→20), finite admission and all six SLOs PASS. Far-seek/slider coverage is still required, not replaced by ordinary GETs. |
| T03/05/07/08/09/12/13/14/15 | Preserve exact remaining workload/security/scale/restore/cold/upgrade/browser gates, not closed by this subset. |

E6-BR-01 typed source-only signature/SBOM absence has a real DRAFT import/replay/
list/injection-refusal receipt. No alpha signature or full browser claim.
The new packet contains raw private evidence hashes, preserved failed probes,
runtime pin boundary, resource snapshot and deferred owned-cell cleanup.

Cold process/pool read proof exists, not a host/HMD cache flush. T14 remains
OPEN because the earlier restored publication/selection graph was empty.
The subsequent public WFO→RC seal→R1 journey creates one real publication,
but its nonempty graph has not yet been restore/GC-qualified. Terminal POST
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
| T08 | NOT_RUN: isolated cold cache; no host-wide cache drop permitted. |
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
