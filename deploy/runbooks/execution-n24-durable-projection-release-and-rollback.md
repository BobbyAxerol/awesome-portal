# N24 Durable Manager Projection Release and Rollback

Status: current-source runtime v3 qualified; content-addressed dev deployment
is owner-authorized. This runbook does not authorize a stable or Trading
System change.

## Boundary

One profile-isolated Rust worker consumes the bounded N19 Manager-v2 API over
the existing TLS 1.3 mTLS and delegated profile boundary. It writes only the
Portal-owned projection PostgreSQL. It never reads Trading System PostgreSQL,
Redis, CLI, broker APIs or browser-selected relations.

The source has snapshot/poll semantics. Every durable change is therefore
labelled `PORTAL_PROJECTION_DELTA`; N24 never invents a Trading-System event
sequence. The worker collects exactly 13 bounded current-state feeds and atomically seals
eight entity-kind snapshots per cycle. A valid empty Live profile still seals
all eight empty snapshots.

Historical session/snapshot relations are not periodic feeds because the
current owner API exposes them oldest-first without an incremental watermark,
latest-window selector or stable snapshot token. Adapter v3 requires
`PARTIAL` on intermediate pages, `COMPLETE` on the terminal page, fixed
profile/catalogue identity and monotonic page `as_of`.

## Preconditions

Stop unless all of these are true:

1. the N19 authority/census digest and immutable Edge image are accepted;
2. the exact profile Source Proxy and N23 read path are healthy;
3. the projection database has encrypted storage, encrypted backup and PITR;
4. a restore drill proves semantic state parity;
5. database capacity is below the 70% soft limit and the 5,000,000-row journal
   limit;
6. `projection-migrator` has applied migration `0012`; and
7. Query, analytics, SSE and command flags remain false.

Use a stable, non-secret worker identity digest such as a digest of the
profile-specific Compose project and workload name. Never use a password,
certificate, JWT or business identifier as `EDGE_MANAGER_PROJECTION_OWNER_DIGEST`.

## Candidate render

Render one Compose project per profile so failure and rollback stay isolated:

```bash
docker compose \
  --env-file /PRIVATE/PATH/execution-PROFILE.env \
  -f deploy/compose.execution-edge.yaml \
  -f deploy/execution-manager-v2/compose.profile-read.yaml \
  -f deploy/execution-manager-v2/compose.durable-projection.yaml \
  config --quiet
```

The exact bindings are:

| environment | profile |
| --- | --- |
| paper | `PAPER_BINANCE_USDM` |
| sandbox | `SANDBOX_BINANCE_USDM` |
| live | `LIVE_BINANCE_USDM` |

Start the database and one-shot migrator before the worker. Run one finite
cycle first:

```bash
docker compose ... run --rm projection-migrator
docker compose ... run --rm --no-deps manager-projection-worker \
  manager-projection-once
```

Accept only the sanitized receipt containing profile, epoch/cycle IDs,
digests, counts, timestamps and activation result. It must not contain source
rows, opaque record keys or credentials. Verify the cycle has 13 feeds, eight
snapshots, no gaps/dead letters and exact semantic parity. Then start the
long-running worker. Release order is Paper, Sandbox, then Live; do not couple
the three change windows.

## Runtime and recovery gates

- default polling is 2 seconds, bounded to 250 ms–60 seconds;
- steady-state RPO target is 10 seconds while the qualified source is healthy;
- process restart RTO is 120 seconds; an expired database lease advances the
  fencing token and rejects a stale writer;
- local epoch rebuild RTO is 15 minutes;
- encrypted backup/PITR restore RTO is 60 minutes;
- every source cycle is capped at 100 pages/feed, 20,000 rows/feed and 80,000
  rows total;
- source loss waits for the next poll and never creates an immediate retry
  storm;
- soft/hard storage limits are 70%/85% of an 18 GiB total N24 budget;
- hard pressure, cursor/gap failure or parity drift pauses ingestion and builds
  a new epoch rather than mutating the active one.

Before deleting any retired data, require the existing immutable lifecycle
policy, encrypted archive digest, restored state parity and elapsed hot plus
rollback windows. Cleanup is transaction-scoped and keeps the epoch,
checkpoint and cleanup audit shells.

An operator-authorized same-identity rebuild is a finite command, never a
long-running worker mode. Stop the affected worker, render with
`EDGE_MANAGER_PROJECTION_REBUILD_AUTHORIZED=true`, run
`manager-projection-rebuild-once`, capture its sanitized receipt, then return
the flag to false before resuming the worker. A transaction advisory lock
guarantees one BUILDING epoch per profile; an incompatible BUILDING epoch is a
hard stop.

## Rollback

On contract, profile, auth, lease, parity, freshness, storage or source-health
failure:

1. stop only `manager-projection-worker` for the affected profile;
2. keep the serving N23 current-source path and other profiles unchanged;
3. never retry an ambiguous source request or mutate Trading System;
4. if a new epoch was activated, atomically restore the retained previous
   epoch within the 15-minute overlap;
5. keep the failed BUILDING epoch for evidence, then use audited retention;
6. use database restore only for disaster recovery, after verifying its state
   digest; and
7. record redacted failure, RPO/RTO and rollback evidence.

For step 4, keep the worker stopped and run exactly one container with
`EDGE_MANAGER_PROJECTION_ROLLBACK_AUTHORIZED=true`,
`EDGE_MANAGER_PROJECTION_FAILED_EPOCH_ID=<active candidate>` and
`EDGE_MANAGER_PROJECTION_RETAINED_EPOCH_ID=<retained predecessor>`, using the
`manager-projection-rollback-once` command. The store rejects a live writer,
wrong scope/status, expired overlap or missing retained state digest. Capture
the sanitized rollback receipt, then clear all three values before restarting.

N25 may consume the active projection only after all three profile parity and
recovery gates pass. N24 does not itself enable Query, analytics or SSE.
