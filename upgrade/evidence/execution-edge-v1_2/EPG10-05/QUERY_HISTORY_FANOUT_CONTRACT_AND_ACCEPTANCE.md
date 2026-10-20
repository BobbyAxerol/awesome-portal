# EPG10-05 scoped query/history and notification contract

Authority: [main plan §23.14](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2314-epg10-05--scoped-queryhistory-and-durable-notice-fanout-execution).
This is an additive **source-dark Rust implementation**, not a new deployed API,
TS publication, Research BFF release or capacity certification. Test status is
recorded in the qualification receipt and main plan, not inferred from this map.

## Architecture and compatibility

```text
TS/PM published source (external03 prerequisite)
  -> existing04 atomic projection/group receipt + ordered fact membership
  -> ScopedReadService / existing SQLx pool
       -> current / exact retained history / bounded JSON export
       -> ScopedCache (first page only, bounded single-flight)
       -> PgScopedReplaySource -> one ScopedRealtimeHub per exact read cohort
                                -> bounded queue-only subscriptions
  -> Research BFF (partner-owned current identity/field policy + DTO adapter)
  -> existing Portal internal API / browser
```

Neither subscriptions nor cache loaders install a TS client. Opening a tab only
allocates an admitted queue; it cannot start another source poller. The trusted
service owner drives the coordinator's hint/periodic poll and owns its lifecycle.
No new listener, background task, accepting policy implementation, operational
credential or runtime source binding is installed by this phase.

| Surface | Current/proposed mapping | Compatibility boundary |
| --- | --- | --- |
| Existing Research history | `/api/v1/execution/history/:environment/:relationKey` | Existing retained-range contract remains unchanged. Its 2,000-row legacy bound is **not** inherited by the new adapter. |
| Current dashboard/report read | `ScopedReadService::page(Current)` | No new HTTP route claimed. Uses committed Research projection only; no automatic TS fallback. |
| Retained history | `page(History)` | Explicit authenticated interval `[from,to)` and history capability; immutable facts, not fabricated history from current rows. |
| Export | `page(Export)` and continuation | Separately authorized bounded JSON chunks, not an unbounded CSV/job/download URL. Current traversal resyncs on concurrent revision change; immutable history traversal retains its local ingest cut. |
| Read-through cache | `cached_first_page` | Full semantic identity; continuation pages are not cached fragments. Current scope and actual persisted cursor expiry checked again on hits. |
| Change notification | `ScopedRealtimeHub` / `PgScopedReplaySource` | Proposed schema `execution.scoped-notice.v1`, semantics `NOTIFICATION_ONLY`. Not compatible with legacy full-payload `portal.execution.profile-realtime.v1` numeric/RFC3339 resume protocol. |
| Chart display | `display_min_max` | `BUCKET_MIN_MAX_DISPLAY_V1`; exact decimal extrema, explicit display-only method/coverage. Original continuation and canonical metric/report inputs remain unchanged. |

## Trusted scope, DTO and errors

`AuthorizedRead` is not deserializable. Its independent `ReadAuthorizer` must
validate the current principal, app grant, business scope, field policy and
operation. `None` entity IDs is permitted only by that verifier's explicit full
manager-read decision; it is not a default. Row predicates run before SQL paging,
windowing and byte calculations. A declared top-level field allowlist is applied
in SQL before results leave the store; nested objects require an approved typed
field policy. No arbitrary SQL, table, sort expression or generic upstream URL.

Read identity includes ingest binding/slot, principal/effective scope,
app/field-policy revisions, dataset/schema/model/source set, entity filter,
operation/range/row+byte limits. Cache identity additionally includes projection
generation/group revision/local ingest cut, commit time, writer/rebuild/stale
deadline, active signing-key fingerprint, cursor limits and current Replay grant.
Expired/error loads are not cached. Invalidation fences old in-flight fills;
flight capacity remains charged until the loader finishes/cancels.

`portal.scoped-read.v1` page fields: generation, source continuity epoch,
projection COMMIT timestamp, produced timestamp, availability, shared `Quality`,
history capability/coverage, `count_status=NOT_COMPUTED`, projected rows,
`next_cursor` and optional separately authorized `resume_cursor`. Exact decimal
strings/nulls are preserved; IDs/revisions remain typed opaque strings. Historical
event IDs and correction/tombstone references use the same scope/generation/keyed
alias namespace. Source sequences/global IDs and hidden counts are not returned.

The projection timestamp is **not** economic as-of or source freshness. Shared
quality uses `UNKNOWN` freshness until proven, `STALE` for the bounded old
generation during replacement, and `PARTIAL` for retained-history reads or
current-page-only coverage. Missing history is typed unavailable, not empty
success. Transport `caught_up` never upgrades data quality.

| Typed failure | BFF handling requirement; not a deployed HTTP status claim |
| --- | --- |
| `RESOURCE_NOT_AVAILABLE` | Safe denied/missing shape; no hidden existence disclosure. |
| `HISTORY_UNAVAILABLE` | Honest unsupported interval/capability, not `[]` complete. |
| `RESYNC_REQUIRED` | Discard old continuation/resume; refetch within current authorized scope. Never reset to MAX(source ID). |
| `BOUNDED_READ_REQUIRED` | Invalid/oversized request or one record too large; no silent record omission. |
| `READ_CAPACITY_BUSY` / cursor capacity busy | Bounded backpressure; no unbounded retry queue. |
| deadline / unavailable / integrity conflict | Fail closed; preserve current compatible path, do not bypass authorization. |

## Continuation, persistence and realtime semantics

- At most 200 rows and 1 MiB per new read page; actual serialized output is also
  checked. No total catalogue row cap; the 205-row regression traverses all rows.
- Client cursor is a signed opaque random handle. Raw keysets and positions stay
  in bounded private Portal cursor state. Scope/query/generation/signing identity,
  actual retention deadline and current rights are rechecked each call.
- Current pages require the same projection revision or resync, never mixed
  snapshots. History pins a fenced local ingestion cut so later backfill cannot
  insert a row behind an issued continuation. That cut is not a source ordering
  or business coverage certificate. Causal aliases resync on active-key rotation.
- Migration0020 changes only the Portal projection store. New group membership,
  its ordered expected identity/digest list, facts/current rows and checkpoint
  commit in the same existing04 transaction. Missing/mutated references or local
  receipt holes fail closed. Replay crossing pre0020 unmapped receipts requires
  resync; no synthetic membership is reconstructed from mutable current rows.
  A new cohort must first establish its fresh scoped page/resume barrier.
  `notices(None)` starts at the current local revision, not at historical origin,
  and does not itself reconstruct a baseline or prove prior-history coverage.
- Historical backfill changes exact history but does not emit phantom live
  notifications. Live receipts are scanned once per exact authorized cohort.
  Hidden-only receipts advance an opaque cursor without visible gap/count.
- Notices coalesce to a replacement/refetch hint; exact financial facts remain
  retained in history. A valid reconnect replays notices, not raw financial
  events. Out-of-retention/foreign/generation-mismatched cursors require resync.
- Each delivered queue item rechecks current authority. The BFF must compare the
  notice generation to its current view before applying/refetching; an old queued
  refetch hint cannot certify a new generation. Poll mismatch terminates the
  cohort; reconnect cannot advance the shared coordinator cursor.
- Limits cover clients, per-client entries+bytes, total charged bytes, batch size,
  one in-flight poll/reconnect and deadlines. Slow clients terminate explicitly;
  they do not block healthy peers. Lost hints use the shared durable poll fallback.

## Formal test map and acceptance boundary

| Guide case | Owned executable evidence |
| --- | --- |
| T05-01 | Distinct principal/filter/policy/cache keys; SQL row/field scope before paging; deny forged full scope and cross-scope cursor. |
| T05-02 | 100 queue-only subscriptions, one concrete PG coordinator poll; concurrent cache callers share one loader; no TS client in the test path. Not real source-vs-Research QPS evidence. |
| T05-03 | Healthy/slow peers, per-client/global entry+byte caps, bounded admission and explicit slow-client stop. |
| T05-04 | Valid continuation/reconnect; wrong signature/scope/generation, actual expiry and active-key rotation require resync; reopened PG store uses persisted cursor state. |
| T05-05 | Retained history/current-page-only PARTIAL; missing history unavailable; replacement STALE; transport catch-up does not imply source freshness. |
| T05-06 | Exact decimal history ties/correction/tombstone lineage and pinned backfill cutoff; display-only extrema/coverage/continuation tests. |
| T05-07 | Concrete PG lost-hint/restart fallback, sparse hidden progress, missing group/member rejection; no phantom notice for history backfill. |
| T05-08 | Single-flight/cancellation/reset, correction/backfill/generation/key/limits/revoke invalidation, queued authority checks and actual cursor deadline guards. |

Formal IDs are eight test **families**, not an additional eight PASS tests.
Disposable PostgreSQL fixtures are `TEST_ONLY_SYNTHETIC_REAL_POSTGRESQL`; no TS
database rows, broker events or production identities are used. Shared-host
observations are tainted for capacity. Full XLC-02/03/06 connected acceptance still
needs real04 publication,06 numeric budgets,08 read-security/TLS and partner
Research BFF/consumer receipts. No FE implementation, source promotion, command
activation, Live claim or automatic phase06 start follows from this package.

Rollback: leave these modules unbound and preserve legacy routes. Do not apply
migration0020 to operational storage, reverse committed facts, or delete shared
state as part of this source-only qualification.

## Reproduction and partner handoff

The bounded runner is [scripts/epg10-04/run.py](../../../../scripts/epg10-04/run.py),
reused with explicit profile05 rather than copied into another runner. Inputs
remain code/contracts only in an owned0700 `/tmp/epg10-05-*` directory, preserving
the monorepo layout under `source/`; the shared keyset fixture and every Rust
input are hashed before/after. `pg-receipt.json` runner/helper hashes describe
the historical pinned revision only; a current-source rerun seals its actual
current helper/input hashes in a new bounded receipt, not as those old bytes.
Before any run, inspect target host activity and apply workspace rule34b.
This capped correctness runner records/removes only its own bounded activity;
it does not acquire an exclusive measurement lease or block peer correctness
work. Coexistence is recorded, not absolute capacity evidence. No operational
environment, DB address or credentials are inherited. Qualification uses:

```text
EPG10_TEST_PROFILE=05
EPG10_PORTAL_REVISION=<exact candidate base SHA; full input hashes in receipt>
EPG10_EXPECT_BOOTSTRAP_TESTS=22
EPG10_EXPECT_READ_TESTS=28
python3 -B /tmp/epg10-05-<owned>/run.py
```

The runner executes safety tests, rustfmt, locked/offline compile, four Rust unit
packages, exact bootstrap/scoped-read PG suites, strict all-targets Clippy and
input immutability; its finally removes only the owner-labelled disposable PG
and its own activity file after inode/ownership verification. After retaining
bounded receipts, remove the exact private
source/target/dependency-cache/log directory; never prune shared Docker resources.

One connected acceptance return is needed, not new generic approvals:

| Owner / existing phase | Exact prerequisite / return |
| --- | --- |
| TS/PM03 then Edge04 | Published authoritative binding/barrier/retention, all relevant writer coverage and publisher fence; rerun the existing03/04 connected tests against those bytes. |
| Edge06 | Approved numeric envelope and clean paired workload measurements; current shared-host observations cannot set production capacity. |
| Edge08 + Research ELP2-04/09 | Current identity/field/operation verifier, TLS deployment, revoke propagation and policy-bound BFF adapter; no accepting fixture policy may be installed. |
| Research consumer owner | Bind the typed current/history/export/notice ports, map safe errors and generation-refetch protocol, return XLC-02/03/06 endpoint/consumer evidence; retain legacy DTO compatibility. |

These are the guide's existing connected dependencies. This source package adds
no FE requirement, command permission or automatic TS fallback. Do not advertise
a production route, historical completeness or financial event replay from the
isolated PASS alone. Owned failed tests must be fixed before handoff.
