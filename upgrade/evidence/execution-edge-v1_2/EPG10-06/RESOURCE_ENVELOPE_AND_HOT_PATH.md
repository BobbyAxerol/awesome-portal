# EPG10-06 resource envelope and hot path

Governing plan: [phase06 and §23.15](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#epg10-06-plan).
This is the source-dark Rust implementation contract, not a production capacity
certificate, new service, source grant, UI, command activation or deployment.
Test status/results are recorded separately in `verification.json` at closeout.

## Explicit binding, no implicit production defaults

One `Arc<ResourceEnvelope>` is shared by the governed PG store, cache and fanout
hub. `PgProjectionStore::connect_with_resources` validates pool connections >=
admitted active work; clones share the same pool and envelope. `ScopedCache` and
`ScopedRealtimeHub::new_with_resources` register their full configured logical
capacities once, retaining their leases across clones/subscriptions. A second
object cannot multiply the shared capacity limit silently. Legacy constructors
retain compatibility and are not claimed governed by this opt-in contract.

No listener, accepting policy, source credential, runtime worker or storage
sampler is installed. Runtime composition must explicitly provide trusted fresh
storage observations and approved numeric configuration. Never mix ungoverned
traffic in the governed pool or describe process-local admission as distributed
resource isolation; existing persisted Manager source admission remains separate.

| Class | Owned binding | Reserve |
|---|---|---|
| LiveWrite |04 delta stage and group COMMIT | May use foreground reserve |
| ControlRead |04 checkpoint/resync stop,05 notification receipt scan | May use foreground reserve |
| Interactive |04 current snapshot read,05 current page/cache | Nonreserved share |
| BackgroundWrite |04 snapshot begin/page/finish and history backfill | Nonreserved share |
| BackgroundRead |05 history/export | Nonreserved share |

`LiveWrite` names fresh-delta priority, not the Live trading profile. Admission
does not add a Paper-only restriction, widen profile grants, or authorize a
command; all exact source/profile/operation bindings remain independently checked.

Admission occurs after input/auth checks and before pool acquisition. There is
no admission wait queue: busy/entries/bytes exhaustion is typed and fail-fast.
One active lease lasts across the complete deadline-bounded transaction/read;
drop/cancellation releases it. Cache loaders call the inner page implementation
under one outer permit, not a recursively acquired permit. Current policy,
generation, correction, cursor and post-await expiry fences are preserved.
Each guarded operation uses at most one pool connection at a time. This does
not promise fairness against an unrelated process or a background task already
holding a shared PostgreSQL table lock; existing SQL/lock/deadline bounds remain.

Logical bytes reserve bounded materialization/copy envelopes (page3x, group4x,
read4x protocol ceilings). They are not exact heap/RSS accounting or compressed
body estimates. Actual host/process measurements must accompany deployment
qualification. Existing source HTTP stream/body/deadline limits stay unchanged;
Reqwest compression codecs are not enabled. No new decompressor exists here.

## Pressure and lossless recovery

Trusted storage samples contain observed time, used/free bytes and durable
backlog bytes. Thresholds are finite/monotonic, observations cannot regress or
conflict at the same timestamp. A missing, future or expired sample cannot
authorize fact writes. Soft is an observable warning; high pauses background
fact writes; hard used/free/backlog pressure stops all new fact writes. Existing
admitted bounded work may finish. Control stop/checkpoint and bounded reads
remain available; this is not permission for more economic writes at hard.

No pressure handler deletes history, rolls a journal forward, ACKs an unstored
group or silently drops facts. Caller retries durable input/checkpoint after
fresh normal observations; the existing exact idempotent receipt resolves ACK
loss. Scoped synthetic watermarks test this behavior without filling a real
disk. No automatic retention or fake runtime disk monitor is installed.

Governed fanout polling adds bounded per-instance jitter to its existing polling
cadence, with delay in `[interval, interval+min(interval,1s)]`; wake hints cannot
bypass that minimum. Existing one-poll flight, slow-client disconnect and bounded
replay remain. No retry loop is added for auth, integrity or resync errors. The
legacy fanout constructor keeps its previous behavior.

## Manager correctness and measured optimization

The existing bounded13-feed cache/cadence, persisted source admission, leases
and changed-entity/tombstone reducer are reused. A semantic snapshot ID alone is
not an occurrence identity: A→B→A must apply A again rather than return A's old
receipt while current state is B. The corrected internal adapter binds a cycle
to its sealed predecessor and semantic input, preserves consecutive unchanged
heartbeat and partial-cycle retry, and rejects stale candidates after a newer
seal. A bounded CURRENT entity map avoids per-entity unchanged apply queries.
The internal adapter revision is v6 (public schema/routes unchanged). Future
deployment must follow existing compatible-epoch bootstrap/activation/rollback;
it must not relabel a v5 active epoch as v6 or apply an in-place source cutover.
No runtime epoch is created or activated by this source-only qualification.
Mixed-cadence observations retain their own actual feed read clocks while global
freshness stays the oldest feed. The internal builder also carries clocks for
empty feeds: an absent fast-feed entity is tombstoned at that feed's successful
read, not at a cached sibling's old timestamp. The additive feed-clock commit
method validates bounded maps, namespace/clock consistency and newer deletion
observations; legacy snapshot callers keep their original interface.
The supported worker acquires a fresh UUID lease per invocation and applies one
cycle's eight kinds sequentially; it does not share that internal proof with
Portal callers or launch competing cycles under the same proof. Interrupted
partial state can be replaced by a new fenced worker, without a pending-cycle
lockout. CURRENT receipt validation rejects unsupported stale interleaving.

Tests compare canonical business payloads with a full-snapshot oracle, verify
each receipt against its own current metadata state, and count actual changed
row versions. The full-refresh reference is separate from old N24 (which already
wrote roughly K changed entities). A single shared-host WAL/time pair is not a
legacy speedup claim, p95, reduced TS load or capacity proof. The separate
Research TypeScript full-scope refresh remains partner-owned and unmodified.
The receipt's128 historical lookups versus one Order CURRENT bulk lookup is a
verified code-path shape, not `pg_stat_statements` instrumentation or total SQL
count. Eight kind lookups plus receipt/seal/global scans still occur per cycle.
Actual row-version changes, elapsed time and WAL are measured separately.

## Observability specification

No public metric names or labels carrying identities/payloads are introduced.
Runtime composition should expose the following bounded snapshots through its
existing private metrics boundary, with fixed work-class/error enums only:

| Signal | Boundary and action |
|---|---|
| active/entries/bytes, background usage, peak usage | Compare explicit limits and reserved shares; never interpret as RSS |
| accepted/registrations and busy/entry/byte/storage denials | Saturating counters; throttle background before increasing bounds |
| storage pressure plus sample age | Alert at soft; pause background at high; refuse writes at hard/stale |
| DB pool size/idle/acquire wait, operation deadline failures | Diagnose pool/lock pressure; do not enlarge pool to hide starvation |
| cache entries/bytes/flights, invalidation and fanout queue/client stop | Preserve scope/version fences and disconnect slow clients |
| durable checkpoint, pending chunks, group/event digest | Prove lossless recovery; no MAX(id) or hidden-event gap inference |
| Manager input/applied/unchanged/tombstone counts and receipt digest | Verify K-change behavior and A→B→A recurrence |
| Rust CPU/RSS/I/O; PG CPU/memory/I/O/WAL; p95/p99 populations | Sample with source/config/load provenance and host taint labels |

Library counters and test receipts are implemented; this table is a dashboard
integration specification, not a claim that production exporters were deployed.
Production numeric budgets and paired source-connected coexistence remain the
existing01/03 returns, not an additional blanket owner approval request.

## Reproduction and remaining owner boundaries

Read the main plan §23.15, `resource-profile.json`, final `verification.json` and
`qualification.json` together. The runner entry remains `scripts/epg10-04/run.py`
with explicit `EPG10_TEST_PROFILE=06`; this reuses the accepted isolated PG
cleanup/observer rather than adding another stack. Preserve the monorepo layout
and the exact public compile-input manifest named in that runner. Supply:

```text
EPG10_TEST_PROFILE=06
EPG10_PORTAL_REVISION=<40-character candidate base commit>
EPG10_EXPECT_BOOTSTRAP_TESTS=22
EPG10_EXPECT_READ_TESTS=29
EPG10_EXPECT_RESOURCE_TESTS=8
EPG10_EXPECT_MANAGER_TESTS=11
```

Run only from a validated owned0700 `/tmp/epg10-06-*` target after host-lock
preflight. Runner63 safety cases, all-target compilation of seven packages,
six lib suites, actual Edge binary tests, four PG suites, strict Clippy/check,
byte immutability and finally teardown are required. Source timestamps are
refreshed only within the validated copied manifest so a preserved old mtime
cannot silently reuse stale Cargo metadata. The first dependency fetch must be
explicit; subsequent tests use locked/offline dependencies. Do not copy secrets,
provider bytes or operational DB data. Synthetic fixtures retain TEST_ONLY
provenance. Private logs/ephemeral DB credentials are removed with the exact
disposable target; only bounded identifiers, hashes and metrics are returned.

| Return / owner | Exact action | What it enables |
|---|---|---|
| TS/PM producer (existing03 packet) | Publisher generation fence, writer/export coverage, actual source endpoint/identity/retention/correction and accepted publication | Connected bootstrap/delta and real source outage/resync populations; no generic SQL or authority downgrade |
| Edge + resource owners (existing01 envelope) | Fill numeric production limits/reduction targets from a clean window with exact source/config/workload pins | Bind shared envelope, trusted real storage observation and bounded runtime composition; qualify actual CPU/RSS/IO/WAL/p95/p99 |
| TS/DL owners + Edge | Fresh paired B0/B1/B2 at6000/9000TRADE/s,600s×2 with common source/config; keep1000-vs2000 subscription profiles distinct | Trading non-regression/coexistence, not Portal-user/QPS inference; no historical B6/B16 PASS inheritance |
| Research BE owner | Reviewed full-scope refresh/cadence/delete-insert optimization, analytics quota/cancel/checkpoint and BFF/fanout acceptance | Measured Research load reduction and proof background recompute cannot starve projector; this Rust change does not patch TypeScript |

These are the existing dependent returns, not a request to approve06 again.
Finish the same phase's connected cases when those inputs arrive. Independent07
implementation may be approved separately; no automatic start or command/runtime
activation follows this handoff. Detailed per-family coverage is in
`verification.json`; a correctness PASS never fills a missing capacity receipt.
