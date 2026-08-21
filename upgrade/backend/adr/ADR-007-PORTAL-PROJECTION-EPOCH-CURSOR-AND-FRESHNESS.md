# ADR-007 — Portal Projection Epoch, Cursor and Freshness Authority

- Status: Accepted for EX-BE-03 foundation
- Date: 2026-08-21
- Scope: Portal-owned Rust execution edge and Portal-owned projection storage

## Context

Trading System v1 does not publish one global monotonic sequence. Only proven
`ORDER_STATUS` coverage may currently be described as event-sourced; fills,
positions, accounts, runtime, risk and reconciliation are bounded polls or
unknown. Portal must therefore support replay and browser delivery continuity
without inventing source completeness.

The projection is disposable read state. It must never become execution, risk,
fill, accounting or broker authority and must never require direct Trading
System PostgreSQL, Redis, CLI or broker access.

## Decision

1. A structured source cursor is the tuple `(event_ts, created_at, event_id)`.
   It detects ordering and collision but not a transition missed between polls.
2. `projection_epoch + projection_sequence` orders committed Portal projection
   changes only. It proves edge-to-browser delivery continuity, never
   Trading-System-to-edge completeness.
3. Every projected fact separately carries `EVENT_SOURCED`, `POLL_BOUNDED` with
   a positive interval, or `UNKNOWN`.
4. Reducers are pure, deterministic and idempotent. Duplicate input is a no-op;
   idempotency or cursor collisions fail closed; older input cannot roll current
   state backward; a real source-sequence jump creates an unresolved gap.
   The immutable journal has its own durable ordinal because out-of-order/no-op
   observations do not receive a projection sequence but must retain replay order.
5. Rebuild occurs in a `BUILDING` epoch. It becomes `ACTIVE` only after semantic
   parity and zero unresolved gaps/dead letters. The prior epoch remains
   `RETAINED` for a bounded overlap.
6. Parity excludes Portal-local epoch, projection sequence and projected time.
   It includes source identity, authority, cursor/sequence/completeness,
   compatibility identity and payload digest.
7. Epoch mismatch or evicted history requires a snapshot. The server assigns a
   deterministic per-client jitter deadline to prevent a resnapshot herd.
   Resume bounds apply to the *next* event after `Last-Event-ID`: a cursor at
   `earliest_available_sequence - 1` is valid, while an older or future cursor
   is not silently accepted. The retained epoch has its own availability range.
8. Freshness is computed on the edge from a versioned policy and trusted server
   time. `PAUSED` is an authoritative venue-session state, not degraded data.
   `age_seconds` and projection `lag_ms` remain different measurements; invalid
   future source time becomes `UNKNOWN`.
9. Projection PostgreSQL is a separate Portal-owned schema and credential. Its
   immutable journal/snapshot/policy evidence cannot be updated or deleted.
10. Runtime ingestion remains independently feature-gated and disabled until
    database placement plus cross-cell operational evidence are approved.

## Consequences

- UI can state exactly what continuity is and is not proven.
- A current fact may stay visible after a source gap, but its gap blocks epoch
  activation and later safety-sensitive action policy until reconciled.
- Complete snapshots may remove absent current rows; partial snapshots never do.
- The projection can be rebuilt without reconstructing Portal approvals, audit,
  command idempotency or workflow state.
- EX-BE-04b and EX-BE-06 can build query/SSE behavior over a stable epoch model
  without changing Trading System.
