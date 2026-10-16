# ELP2-10 — placement, bounded reads, lease and recovery

Decision for the **new, currently unmounted Manager consumer**; not an instruction
to activate it or change the legacy worker. Inputs: Portal guide§13, current
PM R2/Edge pins in [source audit](source-alignment.md), independent
[review](reuse-review.md). Numeric production budgets remain unapproved in
[manifest](measurement-manifest.json). No new service, scheduler or ledger.

## Placement and ownership

- TS owns economic/capital facts, versions and business commit. Minimal export
  stays with TS/Edge HK. Edge owns transport/scoped read projection, not a new
  capital authority. Portal owns current identity/app policy.
- Heavy query/aggregation/Score/Regime work stays Research-side SGP on the
  existing isolated Execution store/pool, never TS/DL request/trading hot path.
  One consumer tenure per exact `(workspace_id, environment, profile_id)` in
  that store, shared coordination across replicas. No per-browser ingestion.
- `execution_manager_consumer_fences` is the private coordination authority;
  `execution_manager_model_heads` plus append-only revisions are the atomic
  projection/checkpoint. Neither can certify TS source authority. Existing
  raw-profile snapshot and optional Manager model share the parent transaction.
- The legacy `ExecutionProfileProjectionWorker` is **unchanged and not fenced
  by this new lease**. Do not mount the new consumer alongside an unfenced writer
  for the same partition. Adapter/writer commissioning belongs to06-002 after
  source05-001 and command/trust dependencies are qualified.

## Required ingest transaction

1. Private runtime chooses an explicitly approved finite TTL (no production
   default here), exact scope and random process holder UUID. Acquire using DB
   clock. A new tenure increments the persisted token and rotates epoch, even
   for the same owner. Release expires the row; **never delete/reset its token**.
2. Fetch/validate a bounded qualified source batch **outside** the DB transaction.
   Retain source epoch/generation/catalogue/window/receipt; source expiry or loss
   is not repaired by a Portal clock. Renew by exact holder/token/epoch while
   unexpired. Failed renewal means stop the batch, not blindly reacquire and ACK.
3. `BEGIN` on one existing pool client. Persist with captured lease; advisory
   partition lock and row lock serialize commit/takeover. Check exact scope,
   holder, token, epoch and DB expiry. Post-UPDATE XID guard refuses an accidental
   autocommit caller before facts/head writes. Never use an untrusted SQL port.
4. Apply immutable revision/CAS/checkpoint in that same transaction. Deferred
   constraint trigger rechecks DB expiry at actual COMMIT. Do not disable it or
   set it IMMEDIATE early. Expiry, wrong epoch, checkpoint gap or retention stop
   rolls the transaction back; **no ACK**. Bounds do not authorize truncation.
5. Only after successful COMMIT release the connection, then perform the local
   projection ACK. Lost ACK cannot undo commit; retry same current revision
   deduplicates. Historical A→B→A cannot resurrect A. This is not a TS event ACK.

Future consumer runtime must set finite source deadlines, connection/statement
timeouts and job admission from its approved profile. The lease primitive
neither starts a renewal loop nor provides unrestricted writer DB credentials.
Hydrated retained runtime remains read-only; migration137 grants no writer role.

## Reads, counters and stop behavior

- Reuse exact primary-key document SQL. Coalesce only overlapping immutable
  document reads keyed workspace/environment/profile/revision. Default4 unique
  flights, configurable1…16 internally; at most32 pending readers including
  followers. Completed/error/null flights are removed, not TTL-cached.
- Each reader gets a detached clone.32×8MiB is up to256MiB serialized follower
  copies **before** object/parse/driver/index overhead and active flights; not a
  process-RSS guarantee. Pool/cgroup/reserves and replica totals need measurement.
- Current session/grants/field scope and current head still fence every response;
  no cross-user authority cache. Capacity/integrity failure is sanitized503,
  never an upstream fallback or raw SQL exception. No pending payloads wait
  indefinitely after a timeout while the real DB/source task is still active.
- Scope tuple full-key index is keyed by the minted scope object. Partial account/
  portfolio rows retain all-matches privacy; adding a hidden peer cannot be
  repaired by treating a partial ID as a complete authorized tuple.
- Operator counters in isolated receipts: actual document SELECTs, admitted/
  rejected reads, pool waiting count, digest/error outcome, revision count,
  query plan, relation bytes, process CPU/RSS. No raw credentials, grants,
  private cursors or hidden member names/counts in browser diagnostics.

## Retention, outage and restore

Writer cap1024 revisions and8MiB/document are safety stops, not a retention
duration or full-history promise.8MiB×1024≈8GiB serialized payload/partition
before JSONB/index/WAL/backup overhead. No history sweeper or floor advancement
is commissioned. Required per-family horizon, storage/lag alarms and recovery
objectives remain unknown; link budget approval rather than inventing them.

At capacity/coverage/source loss stop the affected new consumer/query/expensive
job. Keep valid authorized snapshots with honest quality only where allowed.
Never pause revocation, ACK uncommitted work, erase financial/audit facts, turn
unknown costs into0, or mark a stale source fresh to keep the UI green.

After an approved **actual restore**:

1. Quiesce **all** writers/replicas; preserve old data, source and restore receipts.
   A restored DB cannot discover that its persisted epoch is old.
2. With the approved private ops role call `resetAfterRestore` using exact scope,
   expected current epoch and immutable restore receipt ref. CAS miss means
   inspect current state; do not force it. It clears holder, increments token,
   rotates epoch and retains the historical facts/checkpoint.
3. Verify old holder cannot renew/commit/ACK, then acquire a new tenure. Verify
   current Core identity/session/grants; never reinstate restored stale grants.
4. Compare upstream source epoch/generation/catalogue and retention floor. If
   behind floor or source changed, perform qualified resnapshot with explicit
   predecessor/rebuild receipt CAS; preserve original/restated revisions.
5. Resume only after exact profile/source/config and recovery gates pass. Local
   PG epoch fault tests are **not an actual host backup/restore receipt**.

Rollback: stop the new consumer/fanout, keep authorized old reads and all
revision/fence rows, roll back application version only when schema compatible.
Never drop a fence while a writer might still commit. No dev/main/runtime
transition is authorized by this document.
