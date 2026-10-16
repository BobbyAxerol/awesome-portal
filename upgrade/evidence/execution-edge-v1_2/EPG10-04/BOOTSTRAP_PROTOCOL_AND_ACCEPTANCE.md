# EPG10-04 — scoped bootstrap/delta and atomic projection

Governing journal: [main plan §23.13](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2313-epg10-04-bootstrap-delta-and-atomic-projection--2026-10-16).
Authority: [EDGE §5.2–5.7 / phase04](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md#52-snapshot-bootstrap),
BE §6.3–6.6/8, SCORE §8.1/8.6/11.4 and REVIEW §4.3/9 linked from that plan.
This document describes the implemented and isolated-tested source-dark protocol.
Final result:99automated PASS,0FAIL/skip/ignored/filtered; fmt/strict clippy PASS.
Full phase remains IN_PROGRESS / EXIT_NOT_MET for existing03publication and
01capacity/permissions, not an unfinished owned implementation. It is not a
production grant or source-connected acceptance.

## Implementation and compatibility boundary

- Existing `authoritative-event-core::bootstrap` and
  `projection-store-pg::bootstrap` modules; additive migration0019 uses six
  Portal-owned tables. Existing pool, migrator, canonical IDs/digests and
  authoritative-event validation are reused. No new service or external crate.
- Existing dense EDS09 input stays dense. Sparse scoped source positions go
  only through this separate typed protocol, not filler events. The legacy
  LiveTail/Current ACK regression is fixed without changing source admission.
- No listener, route, TS reader, source adapter, PKI/key, CLI, broker, business
  ledger, command replay, financial calculator or runtime flag is added/enabled.
  Migration0019 is applied only to disposable test PostgreSQL in this phase.
- Fixture bytes are synthetic TEST_ONLY. A real `SourceProofVerifier` must
  independently authenticate exact input digest, source bytes/coverage, current
  principal/policy/query/consumer binding, proof kind and lifetime. None is
  installed in production here. A public struct or source sequence is not proof.

## Snapshot, delta and recovery algorithm

1. Authenticate an immutable manifest: exact source/epoch, consumer/principal,
   policy/query, consistency group, dataset/schema set, generation, snapshot ID,
   source-proven cut `B`, overlap-start cursor, catch-up target, finite lifetime,
   page counts/chain roots and required references. These opaque source cuts are
   independent input proofs, never inferred from wall time or `MAX(id)`.
2. Persist invisible generation/dataset staging under a durable writer fence.
   Each page verifies generation, stable index/predecessor hash, final chain,
   row identity/uniqueness, revision and byte/row limits. Retry same page is
   idempotent; changed, skipped, duplicated-key or expired pages cannot advance.
   No TS transaction or browser session is held by the store.
3. Complete only after every declared page and same-group reference validates.
   Stay CATCHING_UP until independently proven catch-up coverage arrives; empty
   queue is not completeness. A proved zero-overlap cut may activate immediately.
   INITIALIZING cannot mint an applied/source ACK through checkpoint lookup.
4. Stage bounded group chunks provisionally. Check exact ordered chunk list,
   event-list digest, source identity/position consistency, cursor transition,
   declared entity revision and references. Source positions may be sparse but
   remain ordered; numeric differences do not diagnose hidden-scope loss.
5. One SQL transaction commits immutable facts, entity-revision digest guards,
   current upserts/tombstones, all dataset/group checkpoints and group receipt.
   Catch-up completion also switches the active pointer in that transaction.
   Only successful COMMIT yields a private source receipt; ambiguous failure
   yields no ACK and retry resolves against the durable group marker.
6. Same ID/same digest and same entity revision/same state replay safely. Same
   identity/revision with changed state conflicts even after CURRENT advances.
   REVISION receipts retain only the digest guard, including snapshot baselines;
   they do not invent business facts or duplicate a financial ledger.
7. Corrections/tombstones retain original immutable facts and require an
   authenticated earlier same-entity predecessor. Current snapshot rows do not
   establish event lineage. Supply bounded authenticated history first, or
   resync with a replacement generation; never delete pending evidence to skip
   the prerequisite. Old revisions cannot resurrect tombstoned state.
8. History inserts immutable facts only, never current state/checkpoints/commands.
   It has a smaller per-call quota and yields when fresh chunks are pending.
   Exact lifetime history completeness is not inferred from a current snapshot.
9. Reconnect resumes the exact persisted manifest/limits/checkpoint. Expired
   incomplete snapshots require a new generation; completed snapshots may resume
   live deltas after snapshot expiry under fresh proof. Finish and group retries
   after COMMIT are idempotent; repeated committed chunks do not leak backlog.
10. New generation fences old writers. Read transactions/pins bind one active
    generation, full binding and revision; a changed pin requires resync, never
    mixed pages. Old active state can remain STALE/read-only for the bounded
    policy window during rebuild; policy/epoch changes deny incompatible reads.
    Local commit timestamp is explicitly not source occurred/commit time.
    Successful replacement retains old immutable state; operational read-pointer
    rollback/cutover is not activated by this source-dark package.

## Bounds and acceptance interpretation

Explicit isolated ceilings, not production defaults:200rows/1MiB per page,
1,000events/8MiB/64chunks per group, snapshot/rollback windows<=300s, source
proof handoff<=30s. There is no total-catalogue row truncation. Pending aggregate
rows/chunks and actual PostgreSQL JSONB bytes are checked before COMMIT, including
numeric expansion. Stored projected rows must fit a read page; reads perform
database-side byte-bounded keyset paging before materializing payloads.
Snapshot payload and immutable event JSON are canonically rehashed after PG
storage; numeric normalization such as negative zero cannot silently drift from
authenticated bytes. An incompatible roundtrip rolls back without page/ACK progress.

Whole-operation5s watchdog includes pool/COMMIT;2s statement,250ms lock and3s
idle-transaction caps are distinct safeguards. A timeout during COMMIT is
ambiguous, not a no-effect receipt. No lease/fence depends on process liveness.
History<=64events and one-quarter page bytes/call. Actual trading coexistence,
retention runway and all-source production capacity remain EPG10-01/06 evidence,
not conclusions from this bounded correctness run.

Formal cases: T04-01 paged snapshot/overlap/delete;02 disconnect-before-COMMIT
and lost-ACK/reconnect-after-COMMIT;03 expiry/retention/new generation;04 complete
cross-dataset group;05 generation/revision-pinned queries;06 visible1/hidden2/
visible3 without hidden counters;07 missing visible bytes/bad scan proof;08
grant/revoke/epoch resnapshot. Extra tests cover lineage, historic revision
conflicts, metadata/JSONB expansion, bounds, deadlines and cleanup safety.
Injected database writer disconnection/new-store reconnect is not an OS/node
crash, independent failure-domain, HA or operational DR certification.

## Reproduction and source-owner return

Read `scripts/epg10-04/run.py` and its safety tests before execution. The runner
requires a private0700 `/tmp/epg10-04-*` containing exact Rust `source/`, its two
runner files, unchanged `execution_edge_observe.py` and03`run.py` renamed
`epg03_run.py`. It atomically acquires the shared-host lock, uses the pinned
cached PG16.15 image only, random private credential via stdin, loopback dynamic
port, tmpfs512MiB, .5CPU/768MiB/128pids/24connections. Cargo is one job, one CPU
affinity and nice15. Tests use only `portal_projection_test_epg10_04` with explicit
TEST_ONLY admission. Initial dependency fetch must be separately explicit;
subsequent commands are offline/locked. Runtime/source configuration is not
inherited; logs are private and bounded8MiB/stage.

Run with `EPG10_PORTAL_REVISION=<parent-full-SHA>` and
`EPG10_EXPECT_BOOTSTRAP_TESTS=<exact-authored-count>`. The receipt also pins the
full working-tree input hashes, so parent SHA is not misrepresented as tested
dirty source. Input immutability, all required test counts, fmt/clippy, own-PG
observations and cleanup must pass. On any failure, stop/join the observer,
remove only the owner-checked immutable PG ID and release only the owned lock.
Root then removes exactly its validated private source/target/cache directory;
no operational image/cache/volume/network/worktree prune is authorized.

Connected acceptance still uses the existing
[single03 TS/PM producer packet](../EPG10-03/CAPTURE_CONTRACT_AND_OWNER_RETURN.md#single-producer-action-packet--existing03-scope-no-new-phase):
fix and rerun the actual producer-generation fence; return selected writer/export
coverage and an authenticated current-snapshot/overlap/retention/group contract.
TS journal-prefix checkpoint/export is not an arbitrary full-table snapshot;
semantic groups are not automatically complete PostgreSQL commit groups.
Source epoch, consumer CAS and local projection generation remain distinct.
No TS/PM/DL/Research code is silently changed to fill these dependencies.

## Final acceptance and handoff

[Verification](verification.json) maps all8formal cases to isolated TEST_ONLY
proof. [Final receipt](pg-receipt.json) records31core unit,20PG unit,22real-PG
bootstrap/recovery scenarios and26runner safety tests, with no missing/filtered
case; these99tests are distinct from the8formal mappings. All386Rust input
hashes and4runner/helper hashes match the local feature checkout. Parent SHA
plus exact dirty-input manifest is the tested source identity, not a deployment.
[Attempt history](attempt-summary.json) retains earlier failures and corrections.

Golden T04-01 compares206visible rows and5immutable facts exactly. Recovery
terminates one owned PG writer backend before COMMIT, retries after lost ACK
and reconnects a new store; it is not an OS/node/persistent-volume/HA drill.
Resource data is observational/tainted for production capacity; no source
snapshot/vacuum, whole-worker RSS, contention or throughput certification.

[Cleanup](cleanup-receipt.json): private1,908,666,368byte source/target/Cargo
cache/log directory removed, own PG/lock0remaining; no image build/pull/prune,
volume/network or operational resource removal.12HK+5SGP runtime tuples remain
unchanged/restarts0; canonical paths, releases, configs and peer source/staging
are pinned in [HK](hk-source-runtime-final.json), [SGP](sgp-source-runtime-final.json)
and [parallel review](partner-source-review.json). Peer staging is not adoption.

Next: existing03TS/PM producer return and same-phase03/connected04rerun, with
01production capacity/permissions. No repeat blanket04approval, new phase or
extra source gate.05isolated contract/query work is independently preparable
when named by Bobby; no05implementation/activation is included here.
