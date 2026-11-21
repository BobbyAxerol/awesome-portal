# ELP2-09 — source continuity, scoped notice and revocation alignment

Observation: **2026-10-16 10:40:09–10:42:58 UTC**, read-only SSH to
`bobby@16.163.212.33`, verified hostname `ip-172-31-16-126`. Portal entry
`docs/research-loop-plan@daf434875e28aa131105d7f27d910b2f0ca05792`.
Task09-SOURCE owns only this document. No remote mutation, Git mutation,
business API/DB call, build/test/load, runtime/container inspection, credentials,
service change or activation was performed. Initial sandbox denied network;
the normal approved read-only SSH escalation succeeded, without an alternate
access path. Reading an existing test receipt is not a new executed test.

## 1. Source custody and concurrent commit

| Target | Worktree / branch | Full SHA and state |
| --- | --- | --- |
| PM | `/home/bobby/.worktrees/trading-system-pm-v1_1` / `feat/portfolio-account-v1_1-parallel` | `d16aa2b5f251596e469807f57e81fe14cdc7e763`, clean throughout |
| Edge at10:40:09 | `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2` / `feat/execution-edge-upgrade-v1_2` | `e15e7064dba5f9cc912ce52198dfc450ccf6d3e8`, concurrent EPG10-07 changes |
| Edge final10:42:44–10:42:58 | Same exact worktree/branch | **`f10c15f6bd6d7e30358af5946c2877b33b8fe4c2`**, clean; `feat(execution-edge): add durable command relay and receipt recovery` |

Initial Edge tracked diff SHA256:
`89230086dbcf4b7508cb356ea95e4bc86d1206ff735cadf91aaf72795da83958`.
Untracked path-list SHA256:
`df70c4b7e9f56478f26d2aed0bac97e24750dc22124a304606bc0eb0d936c30f`.
Its12tracked changes were `scripts/epg10-04/{run.py,test_run.py}`, Rust
`Cargo.lock`, command-relay `{Cargo.toml,src/lib.rs}`, edge-service `src/main.rs`,
projection-store-pg `{Cargo.toml,src/lib.rs}`, and four upgrade journal/index
files. Six untracked status entries were command-relay `src/{authority,durable}.rs`,
projection-store-pg `migrations/0021_command_relay.sql`, `src/command.rs`,
`tests/epg10_07_command.rs`, and `upgrade/evidence/execution-edge-v1_2/EPG10-07/`.
This work was preserved and committed by its own source owner during inspection.
All final Edge/PM tracked/staged/untracked outputs were empty, digest
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
The inspected scoped read/bootstrap/notice module hashes remained identical
across that commit; do not pin the initial dirty parent as final source.

Current guide/journal hashes:

| Worktree / path | SHA256 |
| --- | --- |
| PM `upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md` | `7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945` |
| PM `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` | `96ee825d90a33f3cab614b8c7053408fc34b6ae965db867e6efc33ef769735fd` |
| Edge `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` | `88652e972397b9910793971e23d1f256c0d340011153fe510ed1287e23e983fa` |

PM guide remains **OWNER_APPROVED_DESIGN_R2**, in its own worktree; neither an
older Library copy nor a profile/display label replaces its authority. Current
Edge journal§23.16 records foreign HK `claude-drain-rate` measurement window
09:30:38–11:30:38UTC. No workload or lock inspection/manipulation was attempted.

## 2. Exact source-notice interface — not financial event replay

Paths below are relative to Edge `services/portal-execution-edge-rs/` at final
`f10c15f6...`. `crates/realtime-sse/src/scoped.rs:1–9,26–73` explicitly installs
no listener/poller and publishes notification-only semantics:

```text
SCOPED_NOTICE_SCHEMA_VERSION = execution.scoped-notice.v1
NOTICE_SEMANTICS = NOTIFICATION_ONLY
ChangeNotice { resume_cursor: String, projection_generation: String,
               quality: execution_contracts::catalogue_v1::Quality }
NoticeBatch [server-only] { notices: Vec<ChangeNotice>,
                           next_cursor: Option<String>, caught_up: bool }
ScopedReplaySource.replay(scope: &ReadScope, after: Option<&str>,
                          limit: usize, now_ms: i64) -> Future<NoticeBatch>
ReplayError = RESYNC_REQUIRED | SCOPED_REPLAY_UNAVAILABLE
```

`caught_up` describes transport only, never complete/fresh source data.
`ChangeNotice` contains no row, financial amount, entity ID, original source
event ID/offset, hidden count, independently authenticated source coverage proof
or public sequence. It means refetch an already-authorized named read. It is
not wire-compatible with legacy `portal.execution.profile-realtime.v1`, nor a
contract permitting browser financial-delta application.

Canonical `Quality`, `crates/execution-contracts/src/catalogue_v1.rs:145–183`:
completeness `COMPLETE|PARTIAL|UNRESOLVED`; freshness `FRESH|STALE|UNKNOWN`;
coverage `AUTHORIZED_ONLY|CURRENT_PAGE_ONLY|RETAINED_OBSERVATIONS`;
`source_as_of_ms` explicitly nullable; `portal_observed_at_ms` safe integer;
`source_set_ref`; confidence `VERIFIED|PROVISIONAL|UNKNOWN`; reasons≤32.
Projection commit/Portal observation times must not become economic freshness.

`crates/query-api/src/scoped.rs:77–100,168–214` supplies the independent current
policy port. `ReadScope` binds ingest-binding/slot, principal/effective scope,
app-policy/field-policy revisions, schema/model/source-set/dataset, optional
explicit entity set, top-level allowed fields, history capability/coverage and
explicit retained interval. `AuthorizedRead` has private construction/no
Deserialize. `Current|History|Replay|Export` are independently authorized;
`None` entity IDs is allowed only by verified full-manager authority, not a
default full workspace. Current methods recheck before disclosure/after awaits.
There is **no accepting runtime policy adapter** installed by these modules.

### Cursor crypto and persisted binding

`crates/query-api/src/lib.rs:49–240`: rotating HMAC-SHA256 keyring, keys≥32bytes;
signed `kc1.<base64url claims>.<base64url MAC>`, verified via constant-time MAC
comparison. Claims bind workspace/environment/epoch UUID/resource/query digest,
direction, issue/expiry and boundary. Generic claims are signed, not encrypted;
the **scoped** adapter puts no raw source position there.

`projection-store-pg/src/scoped_read.rs:113–125,181–188,309–353` uses hash of
exact scope+query as workspace/query context, `environment=scoped`,
`epoch_id=local projection generation`, `resource=portal.scoped-read.v1`.
The boundary has no sort values and only a random UUID referencing bounded
private PostgreSQL state. That Pin holds local receipt/keyset positions;
scope/generation/expiry/current policy and active HMAC-key identity are verified
again. `opaque_identifier` uses distinct HMAC namespace and same scoped causal
alias space for event/correction/tombstone references. It is never permission.
Active-key rotation invalidates old causal/cursor identities instead of silently
combining them. Source epoch is a separate manifest field, not this UUID.

Read pages are≤200rows/1MiB, cursor text≤4096bytes; explicit isolated
`ReadLimits` permits TTL1…300000ms,1…256cursors/scope and≤4096total. These are
construction ceilings, **not approved production TTL/propagation/SLO defaults**.

## 3. Snapshot barrier, filtering and true-loss boundaries

`projection-store-pg/src/scoped_read.rs:151–168,605–873` exposes
`portal.scoped-read.v1` current/history/export pages with local projection
generation, **separate source continuity epoch**, projection commit/produced
timestamps, quality/history capability/coverage, `count_status=NOT_COMPUTED`,
rows and continuation. The optional `resume_cursor` pins the same committed
read barrier and requires a separate current Replay grant. A BFF should:

1. Authorize exact named snapshot and obtain its barrier-bound resume cursor.
2. Subscribe through a service-owned exact authorized cohort, not a browser TS
   poller, starting strictly after that snapshot cursor.
3. On notice recheck current scope and generation; refetch the named read.
4. On any revoke, incompatible schema/model/field/query/policy generation,
   cursor expiry/retention loss or integrity error, stop/clear protected data
   and re-snapshot only if current rights allow. Never recover by MAX(source ID).

`ScopedReadService::notices`, lines899–1042, scans **dense local committed
receipt revisions**, verifies full ordered immutable membership/digest list,
then checks only authorized dataset/entity presence. Hidden-only groups advance
the opaque continuation without a notice/count. Missing receipt, missing or
mutated member, unmapped legacy group, stale generation or bad cursor yields
RESYNC_REQUIRED. It does not compare sparse public-visible source IDs and does
not turn empty filter output into source completeness. `notices(None)` starts
at current local revision: **it is not a baseline snapshot or prior history**.
Backfill does not manufacture live notices. Local membership verification is
not a newly certified external source coverage/scan proof.

`realtime-sse/src/scoped.rs:75–109,276–301,320–398,426–509,568–600` bounds
clients1…4096, per-client entries1…4096, poll≤200notices, notice≤1MiB,
aggregate queue≤64MiB with explicit per-client bytes and finite cadence/deadline.
One poll/reconnect in flight per cohort; queue-only subscription creates no
TS poller. Slow consumer stops explicitly without blocking healthy peers.
Every queued delivery rechecks current authority; denial purges queued hints.
Source errors/generation mismatch stop/resync, not stale permission fallback.
The service owner must integrate current trusted clocks/policy and lifecycle;
source-only bounds do not prove host memory, source QPS or real propagation SLA.

## 4. Atomic projection, correction and durable ACK

`authoritative-event-core/src/bootstrap.rs:48–113,626–705` keeps exact
source/epoch/consumer/principal/policy/query/group/dataset binding. Independently
authenticated `Verified<T>` is private/non-deserializable and exact-digest,
proof-kind, lifetime/binding checked; no accepting `SourceProofVerifier` exists
in production. A source continuity epoch/policy change uses a replacement
generation fencing the old stable consumer/group slot.

`projection-store-pg/src/bootstrap.rs:551–650`: one owning SQL transaction
validates writer fence and complete chunks/event digest, dedups immutable
facts/revisions, applies current UPSERT/TOMBSTONE/corrections, validates same-
group references, records ordered member guards, updates all checkpoints and
group receipt, and switches the active pointer at proven catch-up. It returns
the private ACK receipt only **after successful COMMIT**. Crash/ambiguous COMMIT
produces no ACK; same-group retry resolves durable receipt without duplicate
effect. No financial command side effect is replayed. Original facts survive
correction/tombstone; an older row cannot resurrect a later revision.

These SOURCE_CONFIRMED code paths and existing isolated PG receipts support
new scoped Portal integration tests with **synthetic verified source**. They do
not qualify actual TS publication, cross-host crash/HA or operational restore.

## 5. Actual qualification gaps and existing owner records

Existing source returns, not new tests by this subtask:

- `upgrade/evidence/execution-edge-v1_2/EPG10-03/CAPTURE_CONTRACT_AND_OWNER_RETURN.md`:
  full03 exit NOT_MET. Native pgoutput proof is scoped to one source
  cell/database/epoch; row IDs/timestamps are not commit coverage. T03-04 has an
  actual stale-publisher counterexample, **BLOCKED_SOURCE_FENCE_ABSENT**. TS/PM
  selected writer adoption, complete group/coverage and authenticated source
  snapshot/retention contract remain in that existing single producer packet.
- Source retention may advance at a complete published boundary **without all
  consumer ACKs**. Falling below floor requires resnapshot; do not advertise
  unconditional ACK-pinned retention or unlimited history. Economic/audit facts
  remain separate from transport delta retention.
- EPG10-04/05 owned isolated modules and real-PG fixture qualification are
  delivered, but source-connected exit still requires03coverage/fence,
 01/06capacity/permission,08read-trust/TLS and actual BFF consumer receipts.
  Foreign receipt counts are not added to ELP2-09 tests.
- EPG10-07 advanced during this audit to committed
  **QUALIFIED_SOURCE_DARK**, full07 NOT_MET. Its owner return reports416isolated
  cases and default-denied/unmounted real command path; this is not actual TS
  commit authorization, source effect, signed transport or mounted PM authority.
- Edge EPG10-08 remains **PLANNED/NOT_STARTED; AWAITING_BOBBY_APPROVAL**, tests
  NOT_RUN, runtime NOT_AUTHORIZED at final journal10127–10131. No real current
  policy/TLS/socket/TS-commit propagation boundary is established here.
- PM§58.63 remains15/16IN_PROGRESS. `membership_repository.py:1–6,61–101`
  ties membership revision/CAS/receipt/outbox to its caller-owned transaction
  and separately verified current authority. This is not an already mounted
  Edge app-revoke event/export protocol. Its source hash is below.

Keep existing ELP2-05/06/07 source/trust/consumer debt IDs; do not open a duplicate
generic “waiting TS” item. New09 results must separate producer source gaps,
Portal implementation/fixture proof, real propagation measurement and Claude
consumer/browser acceptance. Stop only dependent real-source stream activation,
not independent schema/fence/race test work. Late committed facts/obligations
ingest under independent service authority regardless of revoked human access;
revocation must not erase them or authorize a blind command resend.

## 6. Selected final public artifact hashes

Paths in this table are relative to Edge Rust root unless prefixed PM/Evidence.

| Path | SHA256 |
| --- | --- |
| `crates/query-api/src/lib.rs` | `43cfa5ed40ba7a18f0f23da1887f0ba23d76ec6d2cc7f6d6bded57a083476bc6` |
| `crates/query-api/src/scoped.rs` | `37afd36e3fc506a6b27fb25b6886d9abe25ad4ff2acfa39106ea39b45a0cebdb` |
| `crates/realtime-sse/src/scoped.rs` | `e0321850ad37a9848f0d3b97f9783dc7f5d39cc19cde48326147dc200d727ecd` |
| `crates/projection-store-pg/src/scoped_read.rs` | `32aa5b8073ad988b038e136b2c069782a51edb2c70ef6845a98ffce0734ebeaa` |
| `crates/authoritative-event-core/src/bootstrap.rs` | `3d951b11daaa829b23684c824ae226acbd91bc4a17d7427ea76456e5b8c97b25` |
| `crates/projection-store-pg/src/bootstrap.rs` | `9c14fc9074715c7f157d8cb5f51a54e71801737408baa7eba8eec56b6723afe4` |
| `crates/projection-store-pg/migrations/0019_scoped_bootstrap.sql` | `6d57e896f6b15e9d16adbfb3847ba691d567567ef4cebae65c39e512ac696333` |
| `crates/projection-store-pg/migrations/0020_scoped_read.sql` | `4e1c90a74d74a612a5e6c491485bd6227c7c5ee2f2a7f9f5980aaebf267fa7a7` |
| `contract-pack.lock.json` (legacy transport lock, **not new scoped activation manifest**) | `d895b47bb9c0738cb4f24ce46e3ae253c95c0672a697c5906cc471ed5ee92e3b` |
| `contracts/execution-catalogue-v1/registry.json` | `9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67` |
| `contracts/execution-catalogue-v1/shared/execution-v2-foundation.v1.schema.json` | `7a28e0545005789da1a54d304dbf242a2413d464aa905b83d5641e40821c4828` |
| PM `services/portfolio_management/membership_repository.py` | `0f9e4a5514c305b1089e155e120a450b4e6907962552dab615259cb7061cfa71` |
| Evidence `EPG10-03/native-receipt.json` | `cba151c67442ba0f67aad00ae48d044c0627bed70a6da34bb0e60a1fc5adbb31` |
| Evidence `EPG10-04/pg-receipt.json` | `66c41e552c9df4dc150aede5ecdb3a274e13f585222514dc6d63bd4778bd968a` |
| Evidence `EPG10-05/pg-receipt.json` | `2c06ce2dfbe0fc881ef57225ac5f4acbe83218f7cb0c7e35127d1c9579f24476` |
| Evidence `EPG10-07/qualification.json` | `8da6b5a28c2168e3d2d4e3a5a026c21b35d7090b801e3b8257337fd0d93e5978` |

Evidence paths are under Edge `upgrade/evidence/execution-edge-v1_2/`.
EPG07qualification includes424public input file hashes+4helpers and explicitly
identifies isolated/synthetic proofs. These pinned files, not merely HEAD or
the old runtime manifest, establish the inspected implementation identity.

## 7. Verdict / tests / cleanup / next action

**SOURCE_CONFIRMED:** fresh final source pins, exact notification-only interface,
scoped current-authority/field/model binding, opaque crypto/private-cursor
mechanism, atomic local receipt/membership/ACK semantics and honest retention.
**HISTORICAL_EVIDENCE:** already-written03/04/05/07 test receipts, bounded to
their own synthetic/isolated/native scopes; no additional PASS count earned.
**RUNTIME_VERIFIED: none.** Deployment image/schema/effective source publication,
trust/TLS/current remote grants/latency, actual command effects and all consumer
or browser states remain NOT_OBSERVED by this task.

Tests executed: **none**, as required by09-SOURCE. No own build, process,
container, volume, network, test data or remote file/key created. Cleanup
**NO_ACTION_NEEDED**. Rollback of this subtask is removal of this additive
document only, never source facts/checkpoints/grants. Independent backend09
schema, current-policy delivery/cursor fences and isolated race harness may
continue. Exact source-connected approval/activation remains blocked by the
specific above existing dependencies; no next phase or frontend assignment is
started. Primary owns final contract/receipt integration and Claude handoff.
