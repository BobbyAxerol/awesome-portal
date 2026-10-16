# EPG10-03 — native capture proof and producer return

Status: **owned isolated proof delivered; phase exit NOT_MET**. Main journal:
[§23.12](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2312-epg10-03-capture-and-commit-order-proof--2026-10-16-asiasaigon).
Formal cases: T03-01/02/03/05 PASS in the isolated native contract;
**T03-04 BLOCKED_SOURCE_FENCE_ABSENT**. This is not all-writer, external N03,
Sandbox/Live, capacity or runtime acceptance. No operational path was enabled.

## Source authority and reuse

TS: `feat/v2-rust-first-okx-demo@bdf7685e166d1bdb94edf45d356c298c427a4db4`.
PM: `feat/portfolio-account-v1_1-parallel@d16aa2b5f251596e469807f57e81fe14cdc7e763`.
DL: `fix/p184-dl-closure@87db2159f411e7c4d7d49033e7573b42a75fc91d`.
Current Research: `docs/research-loop-plan@c1d6b2dc53f1f80ac44cdfd9d96d159c4e9aae64`,
actively dirty; source/runtime manifests record later observed drift. Peer trees
were not edited. The new TS commit is documentation-only relative to02; native
source hashes, not a branch label, bind the proof.

Final observation03:31–03:32Z: TS advanced to
`3d9582de9a9daea8b293d966165114d1b1fb5bf5`, DL to
`2169c267a393934b19a2fbab6ba6f62f80d04d60`; all15tested native input hashes
remain identical and generic publisher fence is still absent. PM unchanged;
Research draft actively advances without changing the mirrored foundation.
Full dirty-source/runtime evidence is in the final [HK](hk-source-runtime-final.json)
and [SGP](sgp-source-runtime-final.json) manifests; those are timestamped snapshots,
not claims that parallel branches are frozen.

The test driver appends the [owned fixture](../../../../scripts/epg10-03/capture.rs)
to an exact temporary copy of TS's
`rust/crates/trading-runtime/tests/p13_logical_replication.rs`; its existing
support test remains unchanged. It compiles the actual TS crates and calls
`LogicalReplicationSession` + `PostgresPublicationSink`, not a rewritten decoder,
invented commit LSN, polling cursor or alternate SQL publication implementation.
Input hashes and generated test hash are in [native receipt](native-receipt.json).
Synthetic facts are explicitly TEST_ONLY; PostgreSQL and separate transactions
are real. No venue/provider bytes or financial authority are claimed.

## Captured path and ordering contract

1. Opt-in business writer owns a PostgreSQL transaction; domain rows, receipt
   and semantic journal group append use that same connection. Bound savepoints
   do not create an independent transaction. Omitted source scope is legacy,
   uncertified compatibility—not universal capture.
2. `source_change_journal` + groups are immutable facts. A group is not
   necessarily the whole source transaction: one transaction may contain several
   groups, including different coverage profiles.
3. Native PostgreSQL pgoutput BEGIN/COMMIT supplies actual commit position and
   complete eligible groups. ID allocation, source timestamps and `MAX(id)`
   supply no commit-completeness guarantee.
4. Native sink stages all complete commit frames and atomically appends mappings,
   group records, publication head and PUBLISHED markers in one synchronous SQL
   transaction. There is no separate unsafe append→mark-published commit gap.
5. Source ACK follows that durable receipt. Failure poisons the session and
   leaves no ACK. Duplicate decoded commit persistence is idempotent; conflicting
   event payload is rejected, never an overwrite.

Ordering is scoped to **source cell/database/continuity epoch** and the ordered
native decoding session. Publication sequence is an append mapping—not journal
row ID, timestamp, transaction ID, or a global cross-database clock. SQL guards
reject known incomplete/earlier staged commits, but cannot prove an *unobserved*
earlier commit absent; ordered pgoutput is essential. Cross-cell/TS↔Portal views
need explicit compatible watermark vectors, not a fabricated global sequence.

The existing Edge `authoritative-event-core`/PG append store already provides
consumer dedup/apply/checkpoint durability. Its dense numeric positions cannot
be fed raw journal IDs or filtered-visible IDs. A P16 read permit and scan
watermark must be preserved when a later approved adapter binds the source.
`SEMANTIC_FACT` has no implicit Edge UPSERT mapping. These tests do not mount a
new stream into the legacy core.

## Formal tests and failure boundaries

| Case | Actual assertion | Disposition |
| --- | --- | --- |
| T03-01 | T2 decoded/published/ACKed while lower-ID T1 open; T1 then commits through same slot, two groups and all exact IDs/payload hashes retained | PASS isolated native transport |
| T03-02 | Separate aborted transaction creates neither domain row nor journal event; never decoded as a business delta | PASS isolated fixture; not every actual writer rerun |
| T03-03 | Sink backend terminated before append; zero ACK/head; saved decoded commit recovers once. Deferred COMMIT fault rolls back stage/mapping/head. Lost response after real COMMIT retries without duplicate mapping | PASS injected boundaries; not OS-process restart or persistent-slot reconnect |
| T03-04 | Two slots in same scope, replacement ACK, old process still publishes another event | BLOCKED: counterexample, not a fencing PASS |
| T03-05 | Same ID altered payload rejected against immutable captured hash; affected native session poisoned/no ACK, original fact/head preserved | PASS isolated negative |

Inherited native tests additionally cover exported snapshot/page digests,
slot loss→explicit resnapshot, group fragments, mixed filters and canonical
Unicode payload preservation. Tests cannot silently skip: runner sets the
required native environment, binds its own actual PG target and requires six
executed Rust cases with zero ignored/filtered. Twelve runner safety tests
exercise exact-target cleanup, foreign ownership, foreign test-load denial,
independent container/lock cleanup and receipt-preserving finalization errors.

## Retention and replayability

Owner is TS source/publication; Portal owns only its local projection retention.
Journal facts cannot be deleted by ordinary mutation. Tested unexported facts
survive failed append/conflict; floor cannot advance beyond published head+1 or
split a group. Native floor **may** advance at a complete published boundary
without every consumer ACK. An old cursor then requires resnapshot; this is
not an unconditional ACK-pinned retention contract. Actual mapping purge needs
a qualified same-scope snapshot and valid floor; missing snapshot purge was
rejected with facts/mapping preserved. Original economic facts are not purged.

P13 temporary slot loss requires fresh snapshot; never recreate a slot then
seek to current head and call it continuous. Tested floor started1 and became2
only in the exact disposable fault scope; operational floor was untouched.
Production retention duration/storage/outage/consumer-resync policy is not
invented here. External P16 manifest/access admission remains source-owned.

## Writer coverage inventory and honest exclusions

The02 [42-family registry](../../../../services/portal-execution-edge-rs/contracts/execution-catalogue-v1/registry.json)
retains every family→authority/source-group mapping. The following table refines
capture without falsely turning family membership into runtime coverage.
Paths below are relative to the pinned TS or PM checkout, not vendored source.

| Source groups / families | Real writer / update/delete/correction paths | Current capture boundary |
| --- | --- | --- |
| I: users, membership, ownership | `services/portal_execution_owner/identity/users.py`; `services/portfolio_management/membership_repository.py` | Users create/rename/status have no inspected journal export. Membership CAS/revision/receipt/own outbox atomic; revocation is new revision. PM source exporter absent |
| L/B: registries, deployment/account/binding | `instance_repository.py`; `binding_repository.py` under portfolio_management; legacy `repository.py` | PM registry/binding own outboxes and immutable revisions; no certified external commit bridge. Narrow guard deletions are not history deletion |
| C/K: capital, budget, lock/recall/admission, receipts | `risk_pool/capital_repository.py:_record`; recall/lock/admission repositories | Same-connection SEMANTIC_FACT command result, omitted coverage defaults BOOTSTRAP_ONLY; not row-level capture of every changed budget/source row |
| O: order intent/status, fills, reservations, trading state | `paper_execution/repository.py` order upserts/deletes/cancels; `portfolio_management/repository.py` opt-in capture | Bound Paper paths emit UPSERT/TOMBSTONE in domain transaction; modeled fill plus P05 economics share transaction. Unbound/unsupported legacy APIs not certified |
| E: economics, positions, postings, fees/funding, corrections | `economics/repository.py`; `economics/portfolio_repository.py`; reconciliation repository | Fact/posting/position/pending-fee groups preserve corrections as new revision + correction_of. PM attribution/reconcile event can remain bootstrap-only; not full-account mark-tick valuation capture |
| J: journal/publication/catalogue/cursor | `source_change_journal/{writer,repository,publication_repository,consumer_repository,read_source}.py`; native Rust logical_replication/publication | P13/P16 SOURCE_ONLY_QUALIFIED_NOT_RUNTIME_ADVERTISED. Fixed P16 reader is Paper+CAPTURE_CERTIFIED only; profile declaration does not expand it |
| M/R: Manager/report snapshots and derived overview | Manager façade, `operator_reports_repository.py`, `report_delivery.py` | Current-page/revisioned report delivery; cursor/applied-checkpoint can be null. No authoritative full-history stream inferred |
| D/P/Q/U: prices, sync/recovery, derived scores/Regime/Archive, Portal identity and aggregates | Existing registry refs for DL, Portal consumer, Research analytics and BFF | Different authority; DL market seq not TS economic commit order. Derived metrics require actual source cuts/corrections, not this journal fixture. Portal governance is not TS business source |

P12 coverage manifest `contracts/baseline/rust-first-v2/p12/paper-coverage-manifest.json`
declares SOURCE_ONLY_TESTED_PATH_INVENTORY:52 tested methods,13 producer records,
16 explicitly excluded APIs. Exclusions include legacy float accounting,
multi-account broker reconciliation/sync, emergency-close orchestration, legacy
risk grants, generic group helpers and administrative portfolio/account changes.
This phase audited those boundaries; it did not rerun all52 writer tests.
Pre-activation/pre-journal history is BOOTSTRAP_ONLY. Native private ingress has
separately implemented Sandbox/Live profiles and generation fencing
(`private_events.rs:314`, native P11 test525–548); not certification of the
generic publisher or expansion of the fixed Paper read port.

No family is silently dropped, and no missing capture becomes empty-success.
Mixed bootstrap/certified groups must not be advertised as a complete PM source
transaction merely because one semantic group is complete.

## Single producer action packet — existing03 scope, no new phase

**Owner: TS native publication; PM owner for its writer adoption.**

1. Add a durable publisher owner/generation fence for each source scope, validated
   and locked in the **same transaction** that stages/publishes/head-updates.
   Claim/renew/revoke/takeover must define lease-loss semantics. Reject old owner
   even if it resumes after replacement. A precheck on another connection,
   snapshot-builder lease, consumer cursor CAS or exclusivity of one named slot
   does not close this reproduced race. Preserve single-writer ordered decoding;
   multiple independent slots cannot become competing authorities. Return source
   commit+schema/API, migration idempotency and a real-PG paused-old-writer drill.
2. For each dataset actually offered to Edge, return certified writer/profile
   manifest, operation/revision/correction/delete coverage, complete transaction
   groups, scoped continuity/retention/resync and permit/read contract. Keep the
   currently absent PM users/membership/registry/binding/capital/economic metadata
   paths unavailable until their producer coverage is supplied. No demand to
   rewrite all TS tables just to qualify a narrower correct stream.
3. Edge reruns this same03 harness with stale writer rejected and zero missing/
   duplicate effects, reconciles source hashes/coverage, then evaluates03 exit.
   Native local source proof is not activation of external N03 SOURCE_DARK.

No renewed generic Bobby approval is needed for the already-approved03 owned
work. A TS-owned implementation package must be coordinated with that writer's
session, not silently patched from the Portal worktree. Phase04 isolated
projection work can be approved independently; source-connected certification
must wait for this actual source fence/coverage and01 capacity as applicable.

## Reproduction, resource and rollback

See [runner](../../../../scripts/epg10-03/run.py). Create exactly one private
`/tmp/epg10-03-*` directory on independent SGP; git-archive the pinned TS `rust/`
and listed migrations into `ts/`; copy the owned fixture/runner/safety tests plus
existing `execution_edge_observe.py` there. The first locked Cargo compile may
fetch dependencies into its private `cargo/` cache; provide network access or
preseed that cache from the pinned lockfile. Subsequent lint/native execution
is offline. Set `EPG10_TS_REVISION` to the full
archived SHA and run `python3 -B run.py`. Do not point inherited fixed-name tests
at a shared database. Source, test and input hashes must agree with the receipt.

Runner acquires SGP host lock, rejects known competing test load, uses Rust1.85.1
with one compile job/nice15 and an existing immutable PG16.15 image. PG has
512MiB RAM/tmpfs-data,0.5CPU,128pids,24connections,8slots,64MB configured
`max_slot_wal_keep_size`/`max_wal_size` (checkpoint-dependent controls, not a hard
instantaneous WAL ceiling; data tmpfs provides the512MiB hard cap);
one random **127.0.0.1-only** test port, no shared DB/network identity or volume.
These are disposable harness caps, not approved production defaults. No HK
source requests during its foreign measurement window. No image build/pull.

WAL and serial timing are diagnostic; no unmeasured concurrency/placement/SLO
claim. The32-event backlog is deliberately bounded and drained to zero. Test
state is deleted only by exact labelled-container ID and private temporary-dir
cleanup; no operational image/volume/source/slot/row is removed. Rollback is
stop test and revert owned source change; never undo financial commits or reset
consumer to MAX(id). Final metadata/cleanup receipt lists disk and retention.

Final accepted run:6native+12safety PASS,12catalogue regressions separately PASS;
formal map stays4PASS/1BLOCKED. Owned lint has0warnings;14upstream advisory
warnings are disclosed, whole-TS strict lint was not clean. No source activated.
[Cleanup](cleanup-receipt.json) removed the exact private1,315,299,328B directory,
all owned PG containers and lock; retained every operational image/cache/volume,
peer checkout and rollback artifact. See [verification](verification.json) and
[artifact hashes](artifact-digests.sha256). No push/merge/deploy.
