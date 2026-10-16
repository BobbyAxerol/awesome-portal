# EPG10-10 shadow cutover and owner return

Status: independent round COMPLETE / IMPLEMENTED_AND_TESTED_ISOLATED; C4 CLEAN.
Full connected phase exit NOT_MET. This is one packet for the original phase10
round2, not a new roadmap. No owned runnable code/test/cleanup remains.

## Implemented boundary

Additive Portal PG0022 + internal Rust bootstrap controls: opt-in held SHADOW,
exact matched binding/barrier/checkpoint/row/revision/payload/tombstone/fact
comparison, private comparison CAS, durable ACTIVE/ROLLED_BACK/status and
read-only rollback. Default AUTO and V1/Manager/D4 contracts remain unchanged.
History-only commits invalidate comparison pins in the same transaction through
separate history_revision; live/replay revision semantics remain unchanged.

The candidate remains sole writer after read rollback; accepted facts and full
command receipt/status remain durable. Retained reads are STALE/TTL-bound and
still require current scope. Once candidate advances, roll-forward needs fresh
matched-scope evidence; old comparison/old AUTO writer are not a recovery path.
No new financial engine/Score calculator, public route, source grant or service.

[Versioned SOURCE_DARK template](../../../../deploy/manifests/execution-edge-scoped-cutover.v1.json)
and [operator runbook](../../../../deploy/runbooks/execution-edge-scoped-cutover-and-rollback.md)
separate reader selection, command activation, native authority and release.
No real profile/dataset is activated by either document.

## Five required case families

| Case | Owned isolated implementation | Connected acceptance |
| --- | --- | --- |
| T10-01 | PASS — Held shadow; exact rows/revisions/facts and barrier/checkpoint negatives | NOT_RUN; SOURCE + TRUST + LOAD + RESEARCH |
| T10-02 | PASS — Durable root takeover rejects old resumed writer/auto-mode downgrade | NOT_RUN; actual TS/PM native transaction fence |
| T10-03 | PASS — Old read continuation/stale CAS reject; typed receipt arrives across cutover without a new claim | NOT_RUN; actual read/command transport and current authority |
| T10-04 | PASS — Read rollback keeps new facts/full receipt/status; stale TTL/scope guards | NOT_RUN; qualified target/recovery/retention/current-policy proof |
| T10-05 | PASS — Reconnect same manifest/mode, durable status, lost-ACK idempotence and bounded rollback | NOT_RUN; connected interrupted operator/release drill |

TEST_ONLY synthetic source/authority inputs use disposable real PostgreSQL.
Connection recreation is not host crash/HA evidence. No source/broker authority,
production capacity, release observation or three-system cutover is claimed.

## Scoped round2 returns

| ID / owner | Exact required input and affected path | Exit/action in original phase |
| --- | --- | --- |
| 10-SOURCE — TS native + PM publication | Authenticated matched B/delta/history/floor/retention/dataset contracts; current native publisher owner/generation fence in actual stage/publish COMMIT; immutable implementation/migration pins | Consume actual return, rerun affected03/09 cases then matched-scope T10-01/02/05. Isolated PM13 package tests are preparation, not an export mount. |
| 10-TRUST — TS/PM authority + Portal identity | Current stable human/workload/session mapping, approved fields, live provider/revocation/native COMMIT proof; scoped read and separate command policies | Bind08 providers; current-policy/revoke/read-through-COMMIT cases precede affected10 read/command activation. No need to wait for unrelated PM roadmap. |
| 10-COMMAND — PM14/source owner | Mounted typed intent/full-outcome/status/recovery transport, idempotency/retention/native receipt proof and qualified operation/profile/isolated target | Reuse same ledger/intent; reconcile UNKNOWN, run applicable07/09/10 command cases; do not activate all financial operations with a read cutover. |
| 10-RESEARCH — Research owner | Actual provider installation, current identity/field mapping and matching scoped consumer/shadow/ELP2-11 receipt | Consume tested local commissioning now; bind source-connected paired old/new proof only when actual inputs exist. Do not treat source-dark local tests as missing code or as runtime acceptance. |
| 10-LOAD — Edge + TS/DL/Research capacity | Fresh current-config connected B0/B1/B2/coexistence measurements and approved numeric budgets for affected bindings | Execute existing01/06/09 harness on returned target under exclusive lock; no invented budgets or synthetic capacity PASS. |
| 10-RELEASE — operational owners | Exact qualified09 scope, candidate + reader-only rollback image digests, versioned stable config, defined target/window/owners and verified recovery checkpoint/backup | Use this10 runbook for bounded actual rollout/observation/rollback. Bobby's phase approval is recorded already; missing concrete source/target/recovery facts are not another generic approval request. |

Inherited03/08/09 returns remain linked there; these rows identify only their
affected10 composition. Failed owned tests/harness defects are fixed before
independent closure, never entered as external debt.

## Attempts and runtime safety

Preflight: initial runner93 checks had one stale timeout-map assertion; fixed.
Attempt1: TAINTED/CANCELLED during compile after foreign Research test began
inside phase10 lease. No PG test container was created. Owned Cargo group alone
terminated, own lease released, no foreign process/container stopped. The
selector swallowing InterruptedError was fixed with a real pipe/signal
regression; profile10 now checks known foreign test cells before/after stages.

Attempt2: full offline build/96runner/250libs/42Edge/12TLS passed; bootstrap
30PASS/1FAIL. The new receipt-preservation fixture incorrectly used04's
ungoverned legacy pool. Existing CommandStore correctly returned Ungoverned.
Fixture now uses the same07 governed envelope on the same disposable PG; no
guard relaxed. Owned PG/sampler/lease removed with zero cleanup errors.

Attempt3:31bootstrap PASS but inherited read41PASS/1FAIL caught an owned
history/replay regression. Fixed by separate history_revision in0022; shadow
comparison CAS pins both live and history counters, while history-only COMMIT
never increments live replay revision. Existing read assertion unchanged.
Attempt4: all519 tests PASS, strict Clippy then rejected one new test comment
missing backticks. Fixed the comment, not the lint. Both failed attempts kept
FAIL, all owned PG/sampler/leases removed without cleanup errors. Attempt5
reruns every gate and PASSes as one complete profile; no composite partial
PASS. See [attempts](attempt-history.json).

Research normal hook landed clean fa857b85;16:08:58Z read-only audit confirms
same terminal return/provider uninstalled/mappings UNMAPPED/no ELP2-11. PM13
committed98dbfd8c; new PM current-read return qualifies729 peer TEST_ONLY tests,
not Edge counts. Current-read source package remains WIP with pinned qualified
evidence; actual provider/mapping/transport still unbound. [Exact peer pins](source-review.json)
record consumption rather than treating that source progress as runtime authority.

PM-to-Edge review preserves explicit operation/fields/current identity policy:
STREAM current-frame is not Replay/history; empty linked fields must deny;
PM correspondence hashes/business-page cursor are not Edge principal/scope/
ingest digest or applied source checkpoint. Existing Rust operation-independence
and bounded-nonempty-field tests are included in the full profile. No synthetic
provider or source mapping is installed to fill missing actual inputs.

## Final qualification and reproduction

[Qualification](qualification.json):96runner +250libraries +42Edge +12TLS
+31bootstrap (22 inherited/9 rollout) +42read +8resource +11manager +27command
=519PASS;0FAIL/skip/ignored/filtered. Fmt/strict zero-warning Clippy PASS,
all13 stages exit0, foreign-test metadata empty before/after. Entire final
profile463.036s; all431 source and four helper hashes match local tested bytes.
Both real-PG fixtures and cryptographic inputs are TEST_ONLY, never owner data.
Matched-shadow fixture compares2rows/1fact; read rollback preserves2full facts
including correction plus the exact original typed command receipt/status.
No actual source request, financial send or production mutation occurred.

Reproduce with the existing04 private-runner copy/layout, pinned toolchain
1.85.1 and exact cached PG digest recorded in qualification. Set
`EPG10_TEST_PROFILE=10`, `EPG10_PORTAL_REVISION` equal to qualification's full
source_revision (baseline4c6250ca), and copy exact qualification input hashes;
`EPG10_EXPECT_BOOTSTRAP_TESTS=31`, `EPG10_EXPECT_READ_TESTS=42`,
`EPG10_EXPECT_RESOURCE_TESTS=8`, `EPG10_EXPECT_MANAGER_TESTS=11`,
`EPG10_EXPECT_COMMAND_TESTS=27`, `EPG10_EXPECT_TLS_TESTS=12`,
`EPG10_ALLOW_DEPENDENCY_FETCH=0`; run copied `run.py` only under a fresh own
measurement lease. Base must be a new private0700 `/tmp/epg10-10-*` target;
do not reuse operational PG, source checkout caches or partner test resources.

Observed PG359.099114s/360samples: sampled cgroup memory max489,787,392B,
0OOM/OOM-kill, average0.128755cores. This is an observational shared-host
correctness run, not capacity/latency/production acceptance; sampled max is not
an instantaneous peak, RSS sums may double-count shared pages. Raw logs and
test rows were discarded by the exact private target teardown, not committed.

## Cleanup, runtime and next action

[Final reconciliation](final-reconciliation.json): exact8,416,370,688B test
target removed after actual PM cleanup and under a fresh own lease. Free
159,469,154,304→167,884,922,880B, shared-host delta observational. No residual
own process/container/TLS directory/key/lock;0image build/pull/prune/BuildKit/
volume/network/operational-resource changes. All18HK+5SGP protected tuples
unchanged; active+named rollback/PKI and all6 active worktrees retained.
Docker/BuildKit inventories and deploy-runner state recorded, no shared prune.
No operational data removed. SGP below30%/above20% free is a capacity observation,
not authorization for host-wide cleanup or a production capacity PASS.

Canonical source remains `/home/bobby/.worktrees/portal-execution-manager-v2`
`feat/manager-v2-paper-read@54c6f5f3`; this feature is
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`
`feat/execution-edge-upgrade-v1_2`. Stable SGP remains
`/home/bobby/portal-main-release main@53316263`; Edge release path/revision,
all immutable active digests/configs and named rollback retention are in the
reconciliation. None of phase10's source is deployed. No push/merge.

Next: recommend named approval for11's independent operational handoff work.
Connected10 stays in its original round2; use the six scoped returns above,
consume actual inputs immediately and rerun affected bindings/T10 cases.
No blanket PM/P184 wait, repeat generic approval, fabricated provider or
full-connected sign-off. Phase11 is NOT_STARTED until Bobby approves it.
Full tracking and tested-source/release boundaries agree with
[main plan §23.19](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2319-epg10-10-shadow-fenced-cutover-and-rollback-execution--2026-10-16)
and the backend indexes.
