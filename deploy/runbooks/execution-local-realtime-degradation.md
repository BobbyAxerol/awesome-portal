# Local Execution Realtime Degradation Runbook

## Scope

This runbook covers the Portal-local projection coordinator and local profile
SSE tail introduced by BE-R2-5. It does not authorize changes to Trading
System, Source Proxy, Edge routes, mTLS material, delegated JWTs, database
ownership, commands or browser transport.

The source of browser truth remains the last atomically committed Portal
projection. A source transport/pacing failure is represented as local
`RECOVERING` state and never as a fabricated Trading System event.

## Observe

An authenticated Portal `ADMIN` may inspect:

```text
GET /api/v1/execution/realtime/diagnostics
```

The response contains only bounded Portal operational facts:

- per-environment snapshot presence, freshness, stale age and recovery state;
- local fan-out group/subscriber/slow-reader/reconnect counters; and
- current-source admission queue/pace/counter metrics.

It deliberately excludes business rows, relation names, source paths/cursors,
profile selectors, session identity, mTLS material and delegated assertions.
Do not copy a diagnostic response into a public ticket or client log.

## Expected transient-source behavior

For source `429`, `502`, `503` or `504`:

1. The coordinator records one sanitized reason and a bounded
   `retry_not_before` in `execution_profile_projection_refresh_health`.
2. It retains the previously committed projection/journal; it does not erase
   panels or emit a fictional lifecycle event.
3. It skips source reads for that profile until the durable gate expires.
   Restarting the Control API does not reset the gate.
4. Local SSE emits a nonterminal `snapshot` with `STATUS_ONLY`, unchanged
   cursor and `DEGRADED`/`STALE`/`RECOVERING` status. Browser panels retain
   their last good values and revalidate their existing same-origin BFF only.
5. A successful snapshot commit clears the recovery gate. It does not claim
   source replay, correction, global ordering or a history catch-up.

A source contract-declared unavailable relation is different: it stays a
typed per-relation `UNAVAILABLE`/`PARTIAL` state and does not open the whole
profile's recovery gate.

## Operator response

1. Confirm the affected environment, stale age and sanitized reason through
   the diagnostics endpoint and normal Control API logs.
2. Leave the coordinator running. Do **not** restart to force a retry, add a
   manual poll loop, clear a recovery record, call the Edge from a browser, or
   access Trading System DB/Redis/broker/CLI directly.
3. If the source has recovered, allow the bounded coordinator to obtain and
   atomically commit a new projection. Confirm `HEALTHY`, a new local revision
   only if content changed, and no expanding admission queue.
4. If the stale ceiling is exceeded, treat it as a read-degradation incident:
   preserve the typed UI state, collect the bounded diagnostics/log evidence,
   and follow the separately approved cross-cell incident/change process.

## Rollback boundary

The migration is additive operational metadata. Do not delete projection,
shared-read cache, source or business tables to respond to an incident. A code
rollback must be the normal immutable-release rollback; it must retain the
record so a restart cannot generate a retry storm. No `VACUUM FULL` is part of
this runbook.
