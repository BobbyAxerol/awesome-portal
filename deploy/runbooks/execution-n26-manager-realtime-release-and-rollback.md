# N26 Manager Realtime Release and Rollback

Status: implementation-qualified. A signed dev deployment is a separate
release action; this document never authorizes stable or Trading System
changes.

## Boundary

N26 streams only the Portal-owned N24/N25 projection. Each complete Manager
cycle commits one `PORTAL_PROJECTION_DELTA` journal observation in the same
PostgreSQL transaction as the projection sequence/high-water update. Every
Edge replica polls that shared journal and fans out through a bounded local
queue. Browser tabs do not create Trading System polling traffic.

The initial snapshot and every resume are bound to workspace, environment,
Manager profile, ACTIVE epoch, catalogue digest and activation-manifest
digest. A valid empty Live cycle is a real `EMPTY_VALID` snapshot followed by
heartbeats; it never invents facts or deltas.

## Preconditions

Stop unless all of these are true for the selected profile:

1. N24 has one complete ACTIVE epoch and N25 Query succeeds against it;
2. the profile-specific Edge and Control API images are immutable digests;
3. TLS 1.3 mTLS and the delegated JWT resource
   `execution:manager-realtime` pass positive and negative probes;
4. the owner-rendered activation manifest passes Rust acceptance and matches
   the exact Paper/Sandbox/Live catalogue digests;
5. resume, gap, cursor-ahead, epoch-change, auth expiry, slow consumer,
   multi-replica fan-out, source loss and rollback evidence digests exist;
6. the browser consumer closes on `auth.expired` and terminal
   `projection.gap` before any reconnect; and
7. command relay remains false in both cells.

## Profile rollout

Enable one profile per change window in Paper, Sandbox, Live order. Render the
base Edge Compose plus `execution-manager-v2/compose.realtime.yaml`, then the
SGP base Compose plus `compose.execution-manager-realtime.yaml`. Verify:

- snapshot cursor equals `{active_epoch}:{projection_sequence}`;
- unchanged state emits only bounded heartbeat traffic;
- reconnect with `Last-Event-ID` resumes exactly once;
- evicted/ahead/wrong-epoch cursors emit one terminal gap and require a new
  snapshot;
- session expiry emits one terminal `auth.expired`, cancels the upstream Edge
  request and ends the HTTP response;
- loss of the source does not destroy the last accepted projection, while an
  incomplete new cycle emits no journal delta; and
- aggregate Edge polling remains constant as client count grows.

## Rollback

Turn off `FEATURE_EXECUTION_REALTIME_SSE` in SGP first, then
`EDGE_REALTIME_SSE_ENABLED` for the same profile. Leave analytics Query, the
ACTIVE projection epoch, N24 worker and current-source fallback unchanged.
Do not restart Trading System, mutate the source, switch profiles or enable
commands. Existing clients receive disconnect/unavailable behavior and must
fall back to bounded snapshot polling until a new candidate passes.
