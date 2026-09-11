# BE-R2-1 — shared read-cache lifecycle and cleanup

This runbook manages only Portal PostgreSQL table
`execution_shared_read_cache`. Its rows are a recomputable anti-stampede cache,
not source truth, durable projection, governance, command, user or execution
records.

## Safety boundary

- The worker selects only `expires_at <= clock_timestamp()` through the
  existing expiry index and deletes in `FOR UPDATE SKIP LOCKED` batches.
- It never calls the Execution Edge, Source Proxy, Trading System database,
  Redis, broker or CLI.
- It never deletes a fresh cache entry. Active cache rows and active flights
  are capacity-reserved before a source leader is admitted, so coalesced
  followers never lose the leader response because of a cleanup cap.
- `VACUUM FULL`, `TRUNCATE`, reindex, volume/database deletion and any table
  other than `execution_shared_read_cache` are out of scope.

## Configuration and kill switch

The `compose.execution-current-source.yaml` overlay accepts the following
host-owned settings. The safe checked-in defaults are disabled and dry-run.

```dotenv
CONTROL_API_FEATURE_EXECUTION_SHARED_READ_CACHE_SWEEPER=false
CONTROL_API_EXECUTION_SHARED_READ_CACHE_SWEEPER_DRY_RUN=true
CONTROL_API_EXECUTION_SHARED_READ_CACHE_SWEEPER_INTERVAL_MS=60000
CONTROL_API_EXECUTION_SHARED_READ_CACHE_SWEEPER_STARTUP_JITTER_MS=5000
CONTROL_API_EXECUTION_SHARED_READ_CACHE_SWEEPER_MAX_RUNTIME_MS=2000
CONTROL_API_EXECUTION_SHARED_READ_CACHE_SWEEPER_BATCH_ROWS=128
CONTROL_API_EXECUTION_SHARED_READ_CACHE_SWEEPER_BATCH_BYTES=8388608
CONTROL_API_EXECUTION_SHARED_READ_CACHE_MAXIMUM_ROWS=20000
CONTROL_API_EXECUTION_SHARED_READ_CACHE_MAXIMUM_BYTES=268435456
```

Set `FEATURE...=false` to stop future scheduled cycles. In-flight work has a
short maximum runtime and stops at application shutdown. This kill switch does
not change cache reads or source transport.

## Approved staged procedure

1. Render the exact development or release Compose stack and confirm it points
   to the intended Portal database namespace. Never reuse a stable database
   name for dev.
2. Build/restart the Control API with the new code, while leaving the worker
   disabled. The hardened runtime image deliberately has no `npm`; run the
   container-local CLI without `--apply`:

   ```bash
   docker compose exec -T control-api \
     node dist/cli/execution-shared-read-cache-sweep.js --dry-run
   ```

   Record the JSON inventory. `expiredSample*` is intentionally bounded; its
   `oldestExpiredAt`, `physicalBytes`, active cache capacity and per-profile
   sample are sufficient to begin a low-impact drain. It does not scan all
   historical cache payloads.
3. During the approved window, invoke an explicit one-cycle staged delete:

   ```bash
   docker compose exec -T control-api \
     node dist/cli/execution-shared-read-cache-sweep.js --apply
   ```

   Repeat only while output is `TIME_BUDGET`; stop when it reports `DRAINED`.
   Each cycle is bounded by the configured row, byte and time budgets. A
   cancelled process is safe: the next cycle resumes from the expiry index.
4. For continued hygiene, set the feature true and `DRY_RUN=false`, then
   restart only the Control API in the selected namespace. Observe structured
   `execution_shared_read_cache_sweep` events and the `capacity_state_after`
   field. `N21_SHARED_CACHE_CAPACITY_ALARM` means new cache misses are safely
   denied before an uncacheable coalesced source flight exists; lower source
   load or raise an owner-approved capacity limit, never evict a fresh row.
5. After a drained batch window and normal DB health/read-latency observation,
   an operator may run ordinary `VACUUM (ANALYZE)` on exactly this table. It
   makes deleted space reusable but does **not** promise immediate disk/volume
   shrinkage. If it competes with active PostgreSQL workload, cancel it safely
   and schedule it for a quiet maintenance window; cleanup rows already
   committed by the worker remain correct. Never run `VACUUM FULL` for this
   procedure.

## Acceptance evidence

Store only non-secret operational facts: the dry-run JSON, apply-cycle totals,
health/read-latency/lock observation, ordinary-VACUUM result if used, and a
final `DRAINED` inventory with no expired sample. Do not store database URLs,
credentials, cached payloads, principal digests, cursor values or source data.

## Recorded dev evidence — 2026-09-11 UTC

The approved dev rollout recreated only `portal-control-api-1` with the worker
enabled in `APPLY` mode (`60s` cadence, `2s` runtime, `128` rows / `8MiB` per
batch). Its startup cycle drained `134` expired rows (`29,725,474` bytes), and
the next scheduled cycle drained `73` more (`9,392,893` bytes); both reported
`DRAINED` and `WITHIN_LIMIT`. The internal readiness route returned `200`.

Small quantities of rows can expire between cycles because current-source
responses have short TTLs. This is expected: it demonstrates why the worker is
continuous, not why a broad delete or a new source call is needed. A scoped
ordinary `VACUUM (ANALYZE)` probe was cancelled when it competed for dev
PostgreSQL CPU. No `VACUUM FULL`, truncate, reindex, volume operation, stable
restart or non-cache data mutation occurred.

PostgreSQL autovacuum remained enabled for exactly this table and had completed
`191` cycles, including a cycle during the rollout. The physical relation size
is therefore a reusable-space metric, not a promise that every expired payload
immediately shrinks the volume. Do not disable autovacuum; a manual ordinary
vacuum is optional capacity observation only and never a prerequisite for a
correct cache lifecycle.
