# Execution Edge operational handoff v1

Status: independent TEST_ONLY handoff. Not a production release, source mount,
alert installation or command grant. [Main plan §23.20](../../upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2320-epg10-11-operational-handoff-execution--2026-10-16)
owns approval, results and original-phase round2. The [operations manifest](../manifests/execution-edge-operations.v1.json)
is the exhaustive routing/retention/configuration index, not a monitoring daemon.

## Ownership and safe entry

Bobby is acceptance/release decision owner. Edge backend operator owns projection,
checkpoint and bounded query/fanout recovery. TS publisher owns capture/archive
and native publisher fence. PM owns business/current command authority and full
outcome. Portal identity owns sessions/field policy. Research owns consumer,
score/watch job scheduling and policy artifacts. Host operations owns capacity,
storage and PKI rotation with identity owner. No named 24/7 on-call rota is claimed:
before connected release record actual operator/escalation/revoke/rollback owners
and contacts in the private release configuration, never infer them from ADMIN.

Read current source/diff, schema, immutable images/config and measurement lease.
Pin exact dataset/group/profile/operation/field scope, source/Edge/Research applied
checkpoints and archive floor. Use only authenticated typed Rust controls; there
is no public operator SQL/shell API. No source credentials are needed for the
independent drill below. An unavailable input is not an empty dataset or a grant.
Preserve V1/D4/Manager consumers. Paper/Sandbox/Canary/Live capability design does
not activate traffic. New command operations and all real-source bindings remain
off in this v1.2 candidate; existing runtime is separately recorded in the receipt.

## Containment, diagnosis and recovery

For each incident, retain only scope-safe reason, revision/checkpoint/digest and
timeline, not raw rows or credentials. Consult the manifest for owner and exact
clear condition. UNKNOWN/absent telemetry never means recovered.

| Incident | Immediate action | Recovery proof |
| --- | --- | --- |
| Source gap/expired cursor/retention breach | Stop dependent reads/replay, keep ingestion/status where safe; request authenticated new B/delta + retained floor | Resync into a new generation; full dataset/reference coverage, exact canonical digest, checkpoint committed; old cursor rejects |
| Slow subscriber/overflow | Disconnect affected bounded queue with reset/resync; do not enlarge limits or block producer | Scoped replay/resnapshot under current authority, bounded queue/lag and no unexplained gaps |
| Stale data/source backlog | Mark stale/unavailable by certified family policy; pause dependent background work only | Fresh approved watermark/quality, completed groups and backlog within qualified bound |
| Authority unavailable/expired/revoke transport loss | Deny new affected reads, replay/export/queued sends; keep safe fact ingestion and status/reconciliation | Fresh verified human/workload/session/field policy; no cached grant resurrection |
| Unknown command | Preserve original intent/idempotency key; inspect typed status/service recovery | Native final full outcome/receipt; never new-key retry or treat ACK as applied |
| Projection corruption | Contain affected generation; retain immutable source history/checkpoints and receipts | Verified backup into isolated target + resync from authenticated history; compare all rows/revisions/tombstones/facts/coverage before selection |
| TLS near expiry/expired/untrusted | Stop affected connection; page PKI+identity owner, never disable verification | Approved same-identity rotation, strict chain/SAN/mTLS negative tests and bounded rollback; no expired cert fallback |
| Storage high/hard or stale observation | Background pause at high; write admission fails at hard/stale; reserve control/status capacity | Fresh measured storage under approved ceilings, explicit resume; no shared prune/volume/ledger deletion |
| Watch/score backlog/policy revision/correction | Pause consumer background work; keep raw history/original revisions and status available | Bounded resume from committed watermark with approved policy hash; publish append-only metric revision and original/restated provenance |

Score formula is already fixed by the companion. A missing runtime calibration
artifact means policy_pending, not new weights/fixture anchors or heavy TS compute.
Corrections keep original_as_published and effective/available cutoffs; do not
delete history to clear backlog, stitch stages after observing outcome, or call
allocation composition a direct NAV score. Jobs are consumer-owned; the new test
proves admission/preservation, not an installed analytics scheduler/calculator.

## Restore and retention

Production backup credentials/PKI remain outside the backup payload. A projection
backup may contain scoped business data and must use private encrypted storage,
access policy and per-family approved retention. The test dump contains only
synthetic portal_projection schema and public._sqlx_migrations; no roles/grants/
secret store or operational DB. The restored application reopens and applies its
embedded migrations twice without replaying or losing migration state.
The runner restores into a second disposable DB and compares every table's sorted
row digest/count. This is logical same-host restore, NOT HA/PITR/disaster recovery.
Fresh Rust tests resync from retained original/correction/tombstone events after
test projection corruption, preserving exact decimals and full coverage.

All42 logical catalogue families have explicit owner/history/quality/retention
entries in the manifest. Retention/floor not published by a source stays null/
UNQUALIFIED, never an invented TTL or deletion instruction. Current-only families
do not acquire replay through Edge. Use catalogue-bound continuation and explicit
UNAVAILABLE for uncertified families; no arbitrary SQL/table/Redis exposure.
Each new family/schema/source-selection/field/retention/config policy needs a
decision revision, source proof and scoped requalification, not a global rebuild.

## Independent operator drill (T11-01)

Use only the exact 0700 `/tmp/epg10-11-*` target assigned in the journal. Root
stages code-only source and these four reviewed files at its root: run.py and
test_run.py from scripts/epg10-04, epg03_run.py from scripts/epg10-03/run.py,
execution_edge_observe.py from scripts/. No operational env/secret or data copy.
The source tree preserves repo-relative Rust workspace/shared public fixtures,
the operations manifest/runbook, cutover manifest/runbook and catalogue registry.
Private cargo/target caches are disposable. Read the SGP measurement lock first;
runner acquires its own exclusive25-minute lease and rejects foreign test jobs.

Operator executes from that target, with configured SSH identity already handled
by the calling session (no identity/credential appears in evidence):

```sh
EPG10_TEST_PROFILE=11 EPG10_PORTAL_REVISION=9db77811fb0845344422f1c77968f6fcbc64b66f \
EPG10_EXPECT_BOOTSTRAP_TESTS=33 EPG10_EXPECT_READ_TESTS=42 \
EPG10_EXPECT_RESOURCE_TESTS=8 EPG10_EXPECT_MANAGER_TESTS=11 \
EPG10_EXPECT_COMMAND_TESTS=27 EPG10_EXPECT_TLS_TESTS=12 \
EPG10_ALLOW_DEPENDENCY_FETCH=1 python3 -B run.py
```

Only the initial locked compile may fetch pinned dependencies into the private
cache (no changed lockfile); all subsequent commands are offline. Runner cleans
owned PG/lease on success/failure. Output is bounded identifiers/hashes/counts;
private logs/backup/TEST_ONLY rows/ephemeral TLS keys are not Git evidence.
Success requires all safety/operations/Rust/PG/TLS/restore gates, fmt and strict
Clippy, source immutability and cleanup. A failed or tainted run is FAIL, never
splice older successes into it. Operator reports receipt SHA, exact test counts,
T11 matrix and cleanup; report errors by stage/type, do not paste private logs.

## Connected acceptance and rollback

[The10 packet](../../upgrade/evidence/execution-edge-v1_2/EPG10-10/SHADOW_CUTOVER_AND_OWNER_RETURN.md)
is the single SOURCE/TRUST/COMMAND/RESEARCH/LOAD/RELEASE return list. Actual provider
returns make only their dependent binding/tests runnable; finish them in original
phases without waiting for unrelated owners. No duplicate general approval gate.
Use the [cutover runbook](execution-edge-scoped-cutover-and-rollback.md) after
qualified scope and actual release inputs exist. Roll back readers only, not
financial ledger/rights/sessions; preserve accepted late facts and full receipts,
current fenced writer and revoked rights. No whole-campaign sign-off until exact
connected evidence, budgets/retention/on-call and operational release pins agree.
