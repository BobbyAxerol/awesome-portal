# EX-BE-27 — N24 Durable Portal Projection

**Status:** `COMPLETE / CURRENT_SOURCE_RUNTIME_V3_QUALIFIED / CONTENT_ADDRESSED_DEV_AUTHORIZED`  
**Date:** 2026-09-01  
**Branch:** `feat/execution-data-activation`  
**Runtime effect:** no stable runtime, Trading System, Query, SSE, analytics or command activation

## 1. Goal and result

N24 turns the accepted N19–N23 Manager-v2 current read surface into a durable,
Portal-owned Rust projection for Paper, Sandbox and Live. It does not introduce
a second source adapter and does not read Trading System PostgreSQL, Redis, CLI
or broker endpoints.

```text
Trading System current facts
  -> exact profile Source Proxy
  -> N19 Rust Manager-v2 compatibility authority
  -> bounded N24 collector (13 current-state feeds)
  -> deterministic PORTAL_PROJECTION_DELTA mapper (8 snapshots)
  -> fenced PostgreSQL reducer + immutable cycle receipt
  -> BUILDING parity gate
  -> atomic ACTIVE / retained-previous epoch
  -> N25 Query/analytics consumer (next phase)
```

## 2. Exact source and projection contract

The worker consumes six named Manager projections plus seven catalogue-bound
current/operational relations: deployments, balances, policies, reservations,
allocations, risk profiles and domain events. There is no arbitrary relation
endpoint in the worker. Every cycle is bounded to 100 pages/feed, 20,000
records/feed and 80,000 records total.

Manager-v2 publishes paginated relation reads with a new read-only transaction
and `as_of` on every page. Adapter v3 therefore accepts only monotonically
advancing `as_of`, requires every intermediate page to be `PARTIAL`, requires
the terminal page to be `COMPLETE`, and pins profile/catalogue identity for the
whole traversal. It no longer demands the impossible same-`as_of` invariant.

The current owner API serves historical sessions/snapshot tables oldest-first
without a latest-window selector, stable snapshot token or incremental
watermark. Those unbounded relations are deliberately excluded from periodic
projection. Full-scanning them would violate source semantics and the cycle
bounds. Analytics requiring those histories remain typed unavailable until an
incremental owner capability is published.

The mapper combines feeds that share an entity kind before applying a complete
snapshot. This prevents one source feed from tombstoning a sibling feed. It
always emits all eight entity-kind snapshots, including valid empty snapshots;
therefore a zero-row Live profile can activate truthfully and can also remove
previously visible rows through explicit tombstones.

Source opaque keys are one-way SHA-256 identifiers in Portal storage. Poll and
snapshot changes carry `PORTAL_PROJECTION_DELTA`, `POLL_BOUNDED` and no source
sequence. N24 does not relabel `domain_events` rows as an authoritative owner
event stream because the current Manager contract publishes snapshot reads,
not an event cursor contract.

## 3. Durable reducer and horizontal safety

Migration `0012_manager_projection.sql` adds:

- generic Paper/Sandbox/Live projection leases using PostgreSQL time;
- monotonically advancing fencing tokens;
- immutable per-kind snapshot commit evidence;
- immutable complete-cycle receipts; and
- `EVENT` in the canonical projected entity vocabulary.

A worker acquires one lease per workspace/profile and epoch. Snapshot
validation, lease validation, reducer writes, tombstones, journal/checkpoint
advance and immutable evidence are transactional. Duplicate input returns the
existing receipt; a changed payload under the same identity is rejected. A
stale or expired writer cannot commit or release a newer lease generation.

An epoch becomes ACTIVE only after one complete eight-kind cycle exists, its
semantic state digest matches the database, and it has no unresolved gap or
dead letter. Cutover is atomic and retains the previous epoch for 15 minutes.
Same-identity rebuild is an explicit one-shot command guarded by a
default-false flag and a transaction advisory lock. Rollback is also an
explicit default-false one-shot command; PostgreSQL time, scope/status, the
retained state digest, the overlap deadline and absence of any live profile
writer lease are checked in the same transaction as the epoch swap.

## 4. Runtime packaging and failure behavior

`compose.durable-projection.yaml` adds a dedicated no-port, read-only,
capability-dropped worker. It reuses the profile's mTLS workload bundle and
projection database but has its own enable flag and owner digest. Query,
analytics, SSE, old D4 ingestion and command relay stay false.

The worker runs one bounded attempt per interval with Tokio missed-tick
behavior set to `Skip`. Source loss, typed unavailability, incomplete pages,
cursor cycles, metadata drift or persistence failure waits until the next
normal interval; it never forms an immediate retry storm. Paper, Sandbox and
Live use distinct Compose projects, profiles, audiences, leases, epochs and
rollback actions.

Every catalogue, capability and paginated feed request also acquires the same
profile-local PostgreSQL source-admission permit used by the serving Edge.
The default is 8 requests/second, below the Source Proxy's 10 requests/second
boundary. This prevents a finite or long-running projection cycle from using
HTTP 429 as flow control or bypassing N21 when a feed spans many pages. An
unexpected 429 is classified as source backpressure and fails the cycle once;
it is not misreported as a contract-header drift and is never retried.

Record bounds are enforced while pages are collected—not only after the cycle
is built—so one process cannot temporarily retain more than 20,000 rows/feed
or 80,000 rows/cycle in memory.

## 5. Retention, backup and recovery

N24 reuses and extends the N05 lifecycle:

- 18 GiB total N24 storage budget, 70% soft and 85% hard pressure gates;
- maximum 5,000,000 journal rows;
- no cleanup of ACTIVE/RETAINED epochs or epochs with a live shared/Manager
  lease;
- encrypted archive, verified restore and elapsed rollback/hot window before
  cleanup;
- immutable manager commits/cycles reject normal DELETE/UPDATE but admit the
  existing transaction-scoped audited cleanup for a restore-verified RETIRED
  epoch; and
- epoch, recovery checkpoint and cleanup audit shells remain durable.

Declared objectives while the current source is healthy: 10-second
steady-state RPO, 120-second worker restart RTO, 15-minute local rebuild RTO
and 60-minute encrypted backup/PITR restore RTO. Signed runtime activation must
provide actual backup/PITR and restore evidence; implementation qualification
does not fabricate operational evidence.

## 6. Verification

- mapper determinism and complete snapshots across Paper/Sandbox/Live: pass;
- Manager-v2 `PARTIAL* -> COMPLETE` pagination with monotonic `as_of`: pass;
- same-version feed drift prevented by adapter v3; v1/v2 evidence immutable: pass;
- unbounded oldest-first history excluded from periodic projection: pass;
- valid zero-row Live cycle with all eight empty snapshots: pass;
- partial/missing/duplicate/cross-profile/relation drift negative matrix: pass;
- one-way source key and non-event-authority labeling: pass;
- fresh PostgreSQL migration and three-profile commit/parity/cutover: pass;
- duplicate cycle restart/idempotency and stale-fence rejection: pass;
- singleton same-identity rebuild and DB-clock atomic rollback: pass;
- explicit complete-snapshot tombstone: pass;
- old and new live-lease cleanup blockers: pass;
- immutable evidence plus audited cleanup: pass;
- full reducer duplicate/gap/out-of-order/replay corpus: pass;
- six-month deterministic replay: pass;
- static release/bounds/secret scan and three-profile Compose render: pass;
- finite-worker shared admission and 429 classification negative gate: pass;
- Rust workspace all targets, rustfmt and zero-warning Clippy: pass;
- fresh PostgreSQL dump/restore signature including all N24 tables: pass.

Runtime hardening on 2026-09-01 additionally proved that source receipt-time
drift is not a business delta. Semantic per-kind snapshot and observation IDs
exclude receipt timestamps; one bounded heartbeat row carries current poll
freshness; unchanged repeat polls preserve immutable cycle/journal counts.
Writer lease TTL scales from 60 to 900 seconds only by the already capped
record count, allowing the 8,797-row Paper snapshot to commit atomically while
retaining the 80,000-record hard limit. Existing history remains immutable and
is not manually compacted.

The canonical Docker gate creates a fresh PostgreSQL instance and removes the
temporary container/network after completion.

## 7. Debt closeout and next phase

`TD-EX-05` is closed: the accepted query path now has a durable, versioned,
profile-isolated projection source with replay, retention, restore and atomic
rollback semantics. There is no open internal N24 implementation debt,
including the runtime timestamp-amplification and fixed-lease findings closed
above.

Publishing a signed dev image and supplying runtime backup/PITR evidence are
release operations, not hidden implementation work. N25 is the next backend
phase: bind exact Query/analytics/series APIs to the ACTIVE N24 epoch while
preserving current-source fallback and typed unavailable states.
