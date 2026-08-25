# EX-BE-02-LIVE D4 Source Facade Runtime Optimization Backlog

Status: `QUALIFICATION_BRIDGE_ONLY / STEADY_STATE_NOT_ACCEPTED /
OWNER_WINDOW_REQUIRED`

Date: 2026-08-25

## 1. Decision

`ts_d4_source_read-portal_paper_read-1` is a Trading System-owned compatibility
facade used to qualify the bounded D4 Paper-read contract. The accepted D4
shadow evidence proves contract compatibility and recovery under a finite
owner window; it does **not** certify the current facade as an always-on
production feed.

Until this backlog closes, the container must be treated as dormant:

- start it only in an explicit owner-approved D4 window;
- stop it when the finite qualification/consumer lease ends;
- do not add an automatic restart policy;
- do not promote the Portal registry from `fixture` or enable Query, analytics,
  SSE, commands or activation because this container exists;
- do not make Portal read Trading System PostgreSQL, Redis or CLI directly.

This note records future work only. It authorizes no Trading System edit,
service stop/start, network change or source activation.

## 2. Current deployment boundary

```text
Trading System AWS-HK
  canonical PostgreSQL tables
        |
        | dedicated read-only DSN
        v
  ts_d4_source_read-portal_paper_read-1
    Python compatibility facade
    loopback host publication 127.0.0.1:8011
    exact D4 GET allowlist + mandatory service identity
        |
        v
  Source Proxy
    mTLS + delegated JWT + bounded routes
        |
        | WireGuard private transport
        v
Portal Rust Execution Edge
  BUILDING-only source adapter/reducer
        |
        v
Portal-owned encrypted PostgreSQL projection on D4 EBS
        |
        v
TypeScript Control API -> authenticated Portal frontend
```

The browser never reaches AWS-HK. The Source Proxy is not an SSH proxy and is
not on the Mac-to-AWS public SSH path.

The standalone Compose manifest is already isolated from the normal Trading
System lifecycle, uses a profile, a dedicated non-root identity, read-only root
filesystem, dropped capabilities, four read-only secret mounts, bounded logs
and loopback-only publication. It has no configured restart policy. A profile
prevents accidental start, but it does not stop a container after a completed
qualification window; closeout must explicitly stop it.

## 3. Measured runtime finding

Read-only inspection on 2026-08-25 found the facade still running after Portal
had restored D2 dark and no Portal caller was active:

- approximately 31–44% of one CPU core;
- approximately 117–136 MiB RSS;
- approximately 2.4–3.3 MiB/s received from PostgreSQL inside Docker;
- approximately 152 GB received over about fourteen hours;
- zero D4 EBS block I/O and no evidence that the D4 volume replaced the root
  filesystem.

At the observed rate, idle internal DB traffic extrapolates to roughly
207–285 GiB/day. This is not acceptable for a dormant compatibility facade.

## 4. Root cause in the current facade

The current implementation starts an unconditional refresh task. Every 500 ms
it opens a repeatable-read/read-only capture and queries the complete fixed
scope from all three source tables:

1. `orders` ordered by `updated_at`;
2. `fills` ordered by `trade_time`;
3. `positions_v2` ordered by `updated_at`.

For every capture it converts and deep-copies every record, serializes and
SHA-256 hashes each record, compares the complete previous/current maps, then
creates in-memory deltas. This continues with zero clients. Snapshot creation
and event paging can force additional full refreshes while the same global lock
is held.

With the inspected scope of roughly 1,200 records, the background loop alone
is approximately six full scoped SELECTs per second, or about 518,400 SELECTs
per day. `MAX_SNAPSHOT_ROWS=10000` is a fail limit, not retention or
pagination, so growth eventually makes the facade fail instead of controlling
work.

## 5. Retention and backpressure gaps

- `EVENT_RETENTION=10000` is an in-memory count-bounded deque, not a time- or
  recovery-window policy.
- Snapshot TTL is 300 seconds, but concurrent snapshot count and aggregate
  snapshot memory are not bounded.
- Source orders/fills have no lifecycle or time-retention predicate.
- Full source state is read even when nothing changed.
- The facade has no consumer lease, demand signal or idle backoff.
- Background refresh and request-triggered refresh duplicate work.
- There is no source-row/returned-row amplification metric.
- Portal D4 checkpoints are durable, but no accepted D4 physical pruning job
  or retained-cursor outage budget has been demonstrated.

## 6. Target steady-state design

The source boundary remains owned by Trading System. Portal may request a
contract improvement, import published non-secret artifacts and implement its
Rust consumer, but must not patch Trading System tables or services directly.

Preferred source order:

1. consume an existing Trading System-owned outbox/event contract if one is
   published for the exact Paper scope;
2. otherwise extend the facade with bounded incremental watermarks;
3. use a full capture only for baseline/resync and infrequent reconciliation.

Incremental keys must be stable and deterministic:

- orders: `(updated_at, account_id, client_order_id)`;
- fills: `(trade_time, fill_id)`;
- positions: `(updated_at, account_id, position_id)`.

The exact composite keys and indexes require Trading System owner review.
Deletes require published tombstones or a bounded periodic reconciliation; the
Portal must not infer a missing page as a deletion.

### Required lifecycle

1. Source facade starts dormant.
2. An authenticated, bounded consumer lease opens the feed.
3. One baseline snapshot establishes epoch and watermark.
4. Incremental pages advance the durable cursor atomically in Portal storage.
5. Portal Rust Edge applies queue bounds and backpressure.
6. Idle polling backs off; an expired/no consumer lease stops DB polling.
7. A low-frequency full reconciliation detects drift/deletes.
8. Closeout revokes the lease and stops the qualification container.

Suggested cadence is a sizing input, not yet an activation default:

- active Paper session: 250–500 ms incremental poll;
- idle leased session: 2–5 seconds;
- dark/no consumer: zero source SELECTs after lease expiry;
- full reconciliation: no more often than every 5–15 minutes unless owner
  evidence justifies a different bound.

## 7. Bounded retention model

Before activation, owners must record the maximum recovery/outage window. Event
retention must cover that window plus safety margin and be bounded by both age
and bytes/rows. A cursor older than the retained floor returns a typed gap and
forces a new BUILDING baseline; it must never silently skip.

Required bounds:

- maximum active snapshot sessions per identity and globally;
- maximum snapshot rows and aggregate snapshot bytes;
- maximum delta page rows/bytes and in-flight requests;
- maximum Edge queue depth and apply deadline;
- maximum unchanged polling work;
- deterministic deletion/resync behavior;
- physical cleanup for expired BUILDING epochs, source failures, checkpoints
  and retained event material, without deleting active evidence.

## 8. Implementation sequence

### D4-OPT-00 — Dormant closeout discipline

Status: `OFFLINE_IMPLEMENTATION_ACCEPTED / LIVE_CLOSEOUT_EVIDENCE_PENDING`.

- The exact container and Compose identity are now part of an executable D4
  closeout allowlist.
- A host-side guard enforces start deadline, qualifier completion,
  authorization revocation and owner-window expiry.
- Closeout restores the accepted D2 dark Source Proxy without pulling an image
  and records redacted evidence.
- Verification requires a sanitized Trading System owner observation proving
  zero source sessions, SELECT delta and byte delta.
- Audit returns `D4_DORMANT_VIOLATION` if the facade or D4 Portal reader is
  running outside the owner window.

Implementation and evidence contract:
[`EX_BE_02_D4_DORMANT_CLOSEOUT_DISCIPLINE.md`](./EX_BE_02_D4_DORMANT_CLOSEOUT_DISCIPLINE.md).
No live owner window was opened by this implementation, so the production idle
observation remains pending.

### D4-OPT-01 — Contract revision

Status: `PORTAL_REQUEST_VERIFIER_COMPLETE / OWNER_PACK_PENDING`.

- Trading System owner publishes incremental cursor/watermark, gap, tombstone
  or reconciliation semantics and precise retention floor.
- Portal imports the revised machine-readable contract by digest.
- Revision remains additive or ships through an explicit compatibility mapper.

Portal's request schema, exact publication envelope, fail-closed verifier and
15-case synthetic corpus are complete. The current reader remains locked to v1
until the owner returns a byte-identical accepted pack. Evidence and owner workflow:
[`EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md`](./EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md).

### D4-OPT-02 — Source implementation

- Trading System owner implements the incremental/demand-driven facade or
  publishes an existing suitable outbox.
- Add owner-approved source indexes only after query-plan evidence.
- Preserve loopback-only binding, dedicated read identity and exact scope.

### D4-OPT-03 — Rust Edge consumption

- One shared lease-aware ingestion loop; no per-screen source polling.
- Durable cursor, bounded concurrency/queue, retry budget and circuit breaker.
- Frontend continues to read only Portal projection APIs.

### D4-OPT-04 — Retention and recovery

- Implement time+size retention and expired-BUILDING cleanup.
- Prove cursor-gap resync, restart, source loss/recovery and encrypted restore.

### D4-OPT-05 — Qualification and promotion

- Finite shadow comparison, then a 24-hour bounded soak.
- Separate owner approval promotes only the read delivery profile.
- Commands, Sandbox, Canary and Live authority remain separate gates.

## 9. Acceptance gates

The steady-state facade is not accepted until evidence proves:

- zero recurring source SELECTs after the consumer lease expires;
- no full-state scan on ordinary event-page requests;
- one baseline per epoch/resync, with full reconciliation separately metered;
- bounded memory for snapshots/events/queues under adversarial request cadence;
- no cursor advance on partial/failed transaction or proven gap;
- measured p50/p95/p99 freshness and resource usage for idle and active modes;
- source query plans and scanned/returned-row amplification stay within the
  owner-approved budget;
- 24-hour soak has no OOM, restart, unbounded growth or hidden source traffic;
- stopping the facade has no effect on Trading System execution authority;
- D2 dark rollback still passes and Portal registry remains fail-closed until
  its independent promotion.

## 10. Current handoff

For the next setup window:

- Portal owns the D4-OPT-00 guard/closeout controller; Trading System owner owns
  the source-side zero-session/zero-traffic observation and D4-OPT-01 through
  the source-side part of D4-OPT-02.
- Codex owns the Portal contract import, Rust Edge changes, retention gates and
  backend evidence.
- Claude may consume sanitized fixtures and typed unavailable/gap states only;
  this backlog does not unlock a real frontend source.
- Bobby approves every source window, service lifecycle change and delivery-
  profile promotion.
