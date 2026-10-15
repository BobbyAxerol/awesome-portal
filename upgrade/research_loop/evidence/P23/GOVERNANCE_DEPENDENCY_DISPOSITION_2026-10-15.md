# Governance continuation — dependency-scoped P23 disposition

2026-10-15 · source baseline `051eeb89a8105d9f76032422c75821d7af98d1e2` ·
working continuation, **not a newly qualified candidate**.

This is the GOV-C3 read-only custody/dependency audit for the
[approved continuation](../P22/GOVERNANCE_P23_P24_CONTINUATION_2026-10-15.md).
It supplements, rather than replaces, the
[2026-10-05 qualification ledger](./P23_QUALIFICATION_CLOSEOUT_2026-10-05.md).
No engine run, database test, build, browser lane, migration, restore, signing
or deployment was executed for this document. Targeted real-PostgreSQL results
from GOV-C1/C2 are **pending their own returned receipt**, not asserted here.

## 1. What changed, and what did not

Inspected working changes affect `apps/control-api/src/governance/` authority,
service/repository, Paper Exit and review-context/capture logic;
`command-center/command-center.repository.ts`; additive migration
`1723680000133_governance-portal-decisions.sql`; and corresponding Governance
schemas, OpenAPI, generated types and tests. Migration 0133 adds per-command
policy/parent pins and a separate decision-inbox view; historical applied
receipts are not backfilled with invented pins.

The continuation does **not** edit the QuantBT wheel, Python producer/worker,
P05 artifact writer, optimizer numerical functions, dataset, container resource
configuration, or existing Library/Progress/Evidence/Report/replay numerical
queries. Their historical measurements do not become invalid merely because
an additive Governance migration exists. Conversely, new authorization,
plan/apply, parent-lineage and inbox-read semantics are not covered by those
historical numerical measurements.

Status vocabulary here is deliberately narrower than a release certificate:

- `ORIGIN_BYTES_VERIFIED`: the named private file exists and its actual byte
  SHA-256 was checked. This alone does not prove current source/config parity.
- `UNCHANGED_NUMERIC_SCOPE`: preserve the original measured result and its
  original workload/image limits; do not repeat that workload solely for 0133.
- `AFFECTED_RETAKE_PENDING`: test only changed semantics/dependencies, then bind
  that result to its actual candidate/config.
- `UNMAPPED_RAW`: public narrative exists but no exact raw execution locator
  was established in this audit. A Markdown hash is not a test-result hash.
- `APPROVED_HISTORICAL_EXCEPTION`: owner-approved scope, never strict PASS.

No row is issued a blanket `REUSED_VERIFIED`: full source/config custody of
each old run has not been independently reconciled against the uncommitted
continuation. No fifteen-gate, same-image qualification is claimed.

## 2. T01–T15 — preserve the proof, retake the affected part

Raw IDs resolve to the actual locators/hashes in §3. Public receipts retain
their original dates, source/image/config and population; none is relabelled
as a run on this working tree.

| Gate | Origin public receipt / checked raw | Unchanged scope retained | Affected scope and smallest next action |
| --- | --- | --- | --- |
| T01 — load/SLO | [Mixed load](./MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md), [later UDB load](../UDB-04/closeout-amendment.md); U1–U3 | `UNCHANGED_NUMERIC_SCOPE`: UDB's 20 principals, 1,440 full GETs, real 64-trial child + four queued; Library/Progress/Evidence/Report p95 445/224/327/265 ms. These are original measured values, not a new run. | New decision-inbox query/joins and Command Center links need correctness and a bounded read probe on the final candidate. Do not repeat the heavy child merely for a link or view change; repeat existing load only if query/process/resource dependencies change. UDB source-COPY caveat §3 applies. |
| T02 — plateau | [Three rounds](./T02_T12_SOURCE_CLOSEOUT_2026-09-30.md); R1 | `UNCHANGED_NUMERIC_SCOPE`: nine actual complete/fail/cancel terminals, scratch 482 files/13,792,158 B flat, FD 7→7. Worker scratch/lifecycle code is unchanged. | Exercise new plan/apply bounded response and audit cardinality in targeted PG tests. No evidence here requires another nine engine jobs. |
| T03 — disk pressure | [Clean acceptance](./T03_CLEAN_COMMIT_ACCEPTANCE_2026-09-29.md); R2–R3 | `UNCHANGED_NUMERIC_SCOPE`: owned-volume exhaustion produced typed `RESOURCE_EXCEEDED`; a new run completed after removing owned pressure. Artifact ENOSPC path unchanged. | New decision transaction failure/rollback must not leave approval, operation and audit partially written. Targeted transaction tests, not another artifact-volume exhaustion by default. |
| T04 — outage/recovery | [Clean fault](./T04_CLEAN_FAULT_CHECKPOINT_2026-09-27.md), [recovery](./RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md), [UDB fault](../UDB-04/closeout-amendment.md); R4, U5 | `UNCHANGED_NUMERIC_SCOPE`: original PG/NATS/worker and retained-store outage/restart proofs remain their own scopes. | `AFFECTED_RETAKE_PENDING`: decision retry/rollback, CAS and same-intent replay after a failed transaction. Preserve one operation/audit, no duplicate downstream action. |
| T05 — identity/access | [Research auth/export](./T03_T05_RUNTIME_RETAKE_2026-09-29.md), [legacy prepare/download repair](./LEGACY_EXPORT_SECURITY_AND_REMAINING_HANDOFF_2026-10-01.md), [UDB fresh authority](../UDB-04/closeout-amendment.md); U4, U6 | Old artifact/export ownership and 32-case UDB access results remain scoped historical proof, not proof for new commands. | `AFFECTED_RETAKE_PENDING`: fresh grants at plan/apply/replay; independent reviewer; wrong actor/workspace/gate; revoke/expiry; R1/R2/Live distinction; Paper Exit full evidence manifest. Root's real PG matrix is pending. |
| T06 — DR/integrity | [Historical accounting](./MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md), [owner scope](./SECOND_ENGINE_UPGRADE_AND_HISTORICAL_SCOPE_2026-10-04.md); R5 | `APPROVED_HISTORICAL_EXCEPTION`: strict **83/86**, `full_store_integrity=false`. UDB fresh 69/69 is a different population, not repair of the three missing manifests. | Verify forward migration on fresh/upgraded schema and persisted parent/policy pins/new inbox projection with PG tests. New decision restore/reference coverage is affected; unrelated artifact restore is not automatically repeated. No new restored-browser proof is claimed. |
| T07 — engine transition | [Actual Portal 1.1.0→1.1.1](../P24/P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md); E1–E2 | `UNCHANGED_NUMERIC_SCOPE`: three retained fixed Delta/HMD runs, old in-flight pin, new default/reproduce/rollback and nine verified files; isolated local profile only. | Governance-only changes do not require another two-engine run. Never extend this receipt to all WFO/native/import recipes or production multi-version qualification. |
| T08 — cold cache | [Cold mixed read](./T08_COLD_CACHE_CHECKPOINT_2026-09-28.md); R6 | `UNCHANGED_NUMERIC_SCOPE`: 20 readers/120 GETs, Library/Evidence 414/404 ms; eviction only in the owned P23 cell. | Ensure new decision authorization is never served from an authority cache and new view reads are workspace-scoped. No shared-host cache eviction or whole-load retake solely for 0133. |
| T09 — Execution isolation | [Isolation retake](./T09_EXECUTION_ISOLATION_CHECKPOINT_2026-09-28.md); R7 | Historical same-host HEAVY/four-queued isolation proof remains valid for its original workload; not AWS/live business certification. | `AFFECTED_RETAKE_PENDING`: new Portal-local R2/Live decisions must create no Execution relay/outbox mutation and preserve separate pool/resource authority. Test no-side-effect assertions on real PG. Do not activate upstream to test a local approval. |
| T10 — regression | [Python baseline](./T10_PYTHON_BASELINE_RETAKE_2026-09-29.md), [scoped later gates](../P24/P24_CANONICAL_SAMPLE_SAMPLER_CLOSEOUT_2026-10-05.md); raw Python run `UNMAPPED_RAW` | Python receipt reports a disposable pinned-1.1.1 full-suite exit 0; the public packet names no exact raw log locator. No new Python production code is changed here. | Run changed Governance/contracts/PG tests and one grouped required commit hook after the coherent delivery. Do not call the narrative itself a machine-verifiable raw result or repeat unchanged full Python tests simply because TS Governance changed. |
| T11 — inspection/paging | [Far seek](./T11_FAR_SEEK_CHECKPOINT_2026-09-27.md); R8 | `UNCHANGED_NUMERIC_SCOPE`: 20 readers/140 GETs, signed Library depth 13/replay depth 17, ordinals 1650/2208; no implicit jobs. | New decision inbox view needs scoped filter/readback and revoked-workspace tests. Library/replay code is unchanged by this slice: do not rerun the entire old seek matrix for an inbox change. Later replay-window receipts retain their own separate limits. |
| T12 — utility/overlap | [Quota and overlap](./T02_T12_SOURCE_CLOSEOUT_2026-09-30.md), [real linked child](./NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md); R9 | `UNCHANGED_NUMERIC_SCOPE`: workspace4/actor2 quota, typed fifth refusal, primary/diagnostic/verify/export overlap and separately recorded actual linked audit. | Verify local decision plan/apply does not enqueue a heavy/utility job, and audit/idempotency cardinality is bounded. No fresh diagnostic engine child is required merely for a new local command name. |
| T13 — pins/unsupported routes | [Portal transition](../P24/P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md), [route negative](./T13_CURRENT_ROUTE_NEGATIVE_CHECKPOINT_2026-09-28.md); E1–E2, R10 | `UNCHANGED_NUMERIC_SCOPE`: exact fixed-profile engine pin/rollback and existing unsupported-route refusal. This continuation changes no recipe table/adapter/version admission. | Distinguish Portal approval from source execution capability: unavailable upstream must stay refused after approval. New local decision tests do not commission an upstream executor or qualify a new engine route. |
| T14 — reference graph | [Approval restore](./APPROVAL_GRAPH_RESTORE_CHECKPOINT_2026-09-27.md), [exposure/temporal pins](../P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md), [SC24 scope](../P24/P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md); R11–R12 | Original RunSync/P05/exposure/reference-restore proof remains its actual old graph. Those writers are unchanged. | `AFFECTED_RETAKE_PENDING`: R1→R2→Live parent identity/version/evidence pins, separate command types, stale lineage refusal, rollback/replay and exact audit references; migration 0133 must preserve old applied records. Product-source capture still requires actual qualified source evidence. |
| T15 — browser/cross-screen | [Cold browser](./T15_COLD_BROWSER_OVERLAP_2026-09-30.md), [workspace/audit consumer](./WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md), [UDB retained browser](../UDB-04/closeout-amendment.md); R13–R15 | Historical 1280/660 and retained/source-closed browser receipts remain their named lanes; not acceptance of new Governance affordances. | `AFFECTED_RETAKE_PENDING`: Claude consumes generated contracts, checks R1/R2/Live/Exit refusal/action semantics, workspace/deep links and affected P24 T02/T14 journeys on one actual preview build. No fresh browser/runtime build exists for this continuation yet. |

## 3. Actual private receipt-byte custody

Read-only audit found the following regular files, mode `0600`; these are
actual file hashes, not hashes copied from response bodies or credential
files. Only locator, byte length and digest are published. Root aliases:

- `U` = `/home/bobby/.local/state/portal-udb04/acceptance-closeout-20261011/`
- `R` = `/home/bobby/.local/state/portal-research-p23/20260927/runtime/`
- `E` = `/home/bobby/.local/state/portal-research-p23/20261004/portal-engine-transition-01/`

| ID | Root / file | Bytes | SHA-256 of actual file |
| --- | --- | ---: | --- |
| U1 | U `identity.json` | 3184 | `2764e7b9d2b7dd020d8ed403dafa4cde97e0bf975c8e4b5ed64cded79255c9a1` |
| U2 | U `inputs.json` | 1543 | `14a03c78dd9e2789cd9aaa9c0929446fdd9685acf2019a50a90ee002c379051c` |
| U3 | U `mixed-load-final.json` | 227532 | `f3e00ee7b2fe87598c6f4c81b8d023c5849dfd50d6d7aa83a76da6506be3a383` |
| U4 | U `authorization-closeout.json` | 4918 | `e1095ea11eefba9fb5ac8a414f25d64c3b602a6f19548b2e1d2dcf994f9a1da2` |
| U5 | U `outage-closeout.json` | 4837 | `d5120a3795b7637bd068c2324816e6a8081c29092d47a6a32668a627f97b4fab` |
| U6 | U `export.json` | 397 | `9a9ab9e74008bbed6f64428099045009c25c9856e1f1f5dfd2a63b4cbc19f8c0` |
| R1 | R `plateau-t02-retake-af18707a.json` | 702702 | `b3343b09e0e872629f3ab86c8c7fc7fdb8fdbeda643f7ff72167156383958fc0` |
| R2 | R `run-t03-clean-highwater-20260929.json` | 187402 | `cdb7caa16b5f7761eaf1c7e121c64ffd7671895d770043726663f04332d404a5` |
| R3 | R `run-t03-clean-recovered-20260929.json` | 193680 | `9c1e370e3368298ca118816f59056a26fd9c19be499cf9feab2be6db60a751a0` |
| R4 | R `fault-clean-19a8e813.json` | 15752 | `b805d1dd78fd293d4907743408c249a55f0e5229eda6ac544cb1996e31f3b5df` |
| R5 | R `restore-historical-accounted-20261003.json` | 3262925 | `2984374b730fe7d6b2bf4693f3c7c03cc072c54a390dc2b56bb11127dbc9f24a` |
| R6 | R `t08-mixed-cold-final-f0c88c54-read.json` | 3649 | `dcd6e3ef1aa196f302866319b02de77bace4e42bc492e14d9769c637ac2ab37a` |
| R7 | R `t09-execution-final-20260929.json` | 11390 | `67d3e623c003e8375c123d7bb5ff9a3fd63ae0ebf69cd3df153b90201b06ad85` |
| R8 | R `t11-farseek-19a8e813-retake.json` | 3535 | `a12aa369f03c7fad5e064be882a5bab7cae0006fe2e32d7b9eaab1bffebd1d9c` |
| R9 | R `t12-utility-quota-af18707a.json` | 11827 | `4d2025454833c42ae280ba60554549942f7279b54ddea0e7941a862ff4e13c6b` |
| R10 | R `t13-options-current-route-20260928.json` | 680 | `d22a889a77f286590fcaed532c115f6ae0f0e75696caf73cf36033ebc0ce1470` |
| R11 | R `restore-approved-graph-19a8e813.json` | 2044920 | `aaa7f6be03391542ff71163f9ec47282daa467a90121532324df7e56e1182c23` |
| R12 | R `approval-graph-postrestore-19a8e813.json` | 1176 | `da0ddcc42e4ae338fccd9b1e8c8b2347abc704f18c55026c507df85c2b41f60e` |
| R13 | R `t15-cold-20260930-c.json` | 433 | `4db1762c8d8d95f79b1c5e6b715806b191d63afb070f69f7b088dabdd9d0b6ed` |
| R14 | R `t15-cold-overlap-1280c.json` | 5048 | `e7cc8ed47dad5a682ae56e436abef7ad5edb2f59152698e79fd2f84ba177e53b` |
| R15 | R `t15-cold-overlap-660c.json` | 5047 | `c99a971a85596a2a3170a888a63af52983f1e7c7aaed9f4e2ec00030cccc30bf` |
| E1 | E `receipt.json` | 2179561 | `52ea40e5a30954d11e0dd5a495097db9495eb7aa982b4cdb82a667702463cde5` |
| E2 | E `retention-proof.json` | 6705 | `d04c48ddb7f02fb1915ea866da25079aed8dd92cd30b54f4a0c10a23912d6f72` |

### UDB exact COPY/config caveat

[UDB closeout index](../UDB-04/closeout-index.json) explicitly records
`built_before_coherent_commit=true` and
`post_commit_identical_copy_input_check_required=true`. U1's source candidate
is parent `734f5c36ffe79db2019c2e57a6f1fee90d41cba5`; it is **not by itself**
an attestation that the measured image contains exactly that commit.

The measured Control image is
`sha256:5e55197160422c704844fd0e94120cde0a6c19887901a560bb4f0c44ac46ead7`.
Its published 550-file COPY-input digest is
`2e318ff7a5dec92779dafe6a5d9d4ee1573970ad8433bf54a957cc5059b260b1`;
the recorded runtime config digest is
`e5cfa2916446bbe5032fb4badd2b760667c2854f5e39e90beff173330a51f63f`.
U1/U2 bytes were located and hashed, but this audit did not locate and verify
the full original COPY-input manifest and actual rendered-config bytes
against a coherent landed commit. Those missing custody links stay
**UNVERIFIED**, not an invented post-commit equality check. They do not erase
the historical measurements; they prevent a blanket current-candidate PASS.

### Exact historical exception

The [owner disposition](./SECOND_ENGINE_UPGRADE_AND_HISTORICAL_SCOPE_2026-10-04.md)
accepts only original lost manifests for:
`rrun_1690a9830787332de93d93d457c8aa0e`,
`rrun_e2c3a4d31decb9f5d77b77fe49616fdb`, and
`rrun_c93896666b0f3f1647aaa4967ce8c792`.
It is not permission to generate replacement bytes, ignore another corrupt
artifact, or recast historical **83/86** as 86/86. Root R5 is the actual
historical accounting receipt; a fresh archive's separate population cannot
silently replace it.

## 4. Smallest completion path

1. Bind GOV-C1/C2 targeted real-PG results to their actual source, DB schema
   and environment. Labels for seeded technical records must remain explicit;
   a positive fixture is not a product-source capture.
2. Commit the coherent backend/contracts through the normal grouped gate.
   Capture the new candidate and actual preview image/config identity once;
   reconcile specific source dependency sets, not all repository history.
3. Retake changed inbox/decision/authorization/refgraph semantics, plus a
   bounded new-read query probe if not measured. Reuse unchanged numerical
   engine/load/disk/utility/seek scopes only at the strength their custody
   permits; do not force an engine rerun for an additive view.
4. Give Claude the new typed authority/action/error contract, then obtain the
   affected real browser and P24 T02/T14 journeys on that named preview build.
   Source-off/refused downstream capture remains a typed blocked lane, not an
   upstream activation request.
5. Update the parent qualification matrix with actual retake/hash results.
   Maximum outcome is **READY_FOR_BOBBY_REVIEW**, with explicit remaining
   custody limitations and the historical exception. No dev/main merge,
   signed release or production deployment is part of this continuation.

## 5. Root targeted retake addendum

After the read-only custody audit, root executed the affected Governance
tests on real disposable PostgreSQL: final changed-file group27/27 PASS,
Control API build PASS and whole disposable DB dump/restore PASS. Reuse the
other79 targeted PASS only within their unchanged scopes, for106 unique
cases across runs; see [full progression and limitations](../P22/GOVERNANCE_P23_P24_CONTINUATION_2026-10-15.md#5-test-progression--honest-evidence-boundary).
This covers the table's technical decision/refgraph/authorization retakes,
including actual rollback and replay. Deliberately seeded source records are
not a product-source capture; no fresh shared-preview browser is inferred.
P23 whole-candidate qualification/custody and P24 consumer acceptance remain
distinct from these scoped API/PG results.
