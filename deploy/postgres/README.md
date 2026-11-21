# UDB-01 PostgreSQL profiles

All profiles pin the already-running PostgreSQL16.15 digest, not a major
upgrade. Common config remains the 4-GiB dev/stable baseline; preview/P23
include it and override their resource-sensitive values. Future dev/stable
activation is through the reviewed deployment workflow, **not this phase**.

| Profile | PG cgroup | shared_buffers | work_mem/hash multiplier | maintenance / autovacuum memory | Connections |
|---|---|---|---|---|---|
| common dev/stable | 4GiB | 1GiB | 4MiB / default2 | 256MiB / 64MiB ×4 | 100 |
| shared preview | 1.5GiB | 256MiB | 2MiB /1 | 64MiB /32MiB ×2 | 60 |
| isolated P23 | 900,000,000B | 128MiB | 2MiB /1 | 32MiB /16MiB ×2 | 50 |

These are caps/envelopes, not preallocated peak guarantees. `work_mem` is per
sort/hash operation, `effective_cache_size` is a planner hint, and vacuum
memory is per worker ([PostgreSQL16 resource documentation](https://www.postgresql.org/docs/16/runtime-config-resource.html)).
The explicit autovacuum memory avoids inheriting 256MiB four times.

Current production Control API uses one shared pool capped at10 connections.
Portal Python producer/worker use NATS and authenticated Control API ingress,
not another PostgreSQL pool. For P23, two Control API replicas reserve20
connections, sequential one-shots at most one each, plus operator/headroom;
never scale replicas without recalculating total connection/query memory.
P23's eight declared long-running cgroups still sum to4,600,000,000B with
400,000,000B one-shot/accounting headroom. No8GB waiver. Kernel page rounding
can make the observed PG memory.max slightly less than900,000,000B.

## Cache policy and historical repair

- 129 makes only `public.execution_shared_read_cache` UNLOGGED with absolute
  table/TOAST autovacuum thresholds. A once-shipped version lacked the Up
  marker; 130 repairs its DDL append-only without changing the old ledger.
- Auth, credentials, grants, Governance, seals, history and receipts remain
  WAL-backed. UNLOGGED loss is a cache miss, never business-data loss.
- Existing live-row/byte/flight reservations remain. New physical-pressure
  admission reserves16× maximum response bytes per in-flight leader plus1MiB
  slack before source I/O; denies with the existing typed capacity reason.
  Hits remain served and no fresh row is evicted. This is measured high-water
  backpressure, **not a filesystem quota or a replacement for autovacuum**.
- The existing size reclaim only TRUNCATEs this recomputable cache when there
  is no live entry, under a1s lock timeout. Normal vacuum allows page reuse;
  it does not promise disk shrinkage. A live entry is never sacrificed to pass.

## Preview apply / rollback

```bash
bash scripts/research-preview/preview.sh build control-api
bash scripts/research-udb/preview-profile.sh apply
# On failure, review the private backup/custody and exact prior image IDs:
bash scripts/research-udb/preview-profile.sh rollback /home/bobby/.local/state/portal-udb01/preview-<run-id>
```

The apply helper validates the fixed preview project/named PG volume, refuses
active/dispatched work, pauses intake/worker, makes a private custom-format
backup, compares credential/grant/workspace and Research authority SHA-256,
applies normal forward migrations, then restores service health. It does not
bootstrap, reset passwords, create users/grants, change source flags or web
image, or restore an old auth snapshot automatically. A historical undispatched
QUEUED/PENDING intent with no worker attempt is preserved, not cancelled.
Rollback retains the forward schema and original data volume. Never rerun
bootstrap/activation or down-migrate auth/business data as a rollback shortcut.

## Qualification and long-running evidence

```bash
node --test scripts/research-udb/config.test.mjs
bash scripts/research-udb/test.sh
bash scripts/research-udb/soak.sh start sha256:<qualified-control-api-image>
bash scripts/research-udb/soak.sh status
bash scripts/research-udb/soak.sh collect  # only after writer terminal
```

The real-PG fixture qualification has no source/broker/Trading System traffic.
Bobby approved condition-based qualification instead of a mandatory24h wait.
It continuously changes near2MiB bodies at15requests/s across two independent
repository pools, with at most4 writes in flight. A permanent live sentinel
prevents TRUNCATE from making a false size PASS. The same-body/TOAST, quota,
lock-timeout and crash negatives are covered by the focused real-PG tests.

The lane may end after10minutes only if every condition passes;20minutes is
the default deadline, not a way to turn an insufficient result green:

- At least14 measured changed-body completions/s and three actual TOAST
  autovacuum cycles; physical/live-byte/row budgets remain respected.
- Final5minute physical-size plateau: latest100-second maximum does not
  exceed the first100-second maximum by more than10% or4MiB (whichever is
  larger). The physical limit remains1GiB; no fresh-row eviction/TRUNCATE.
- Fixture-only low-threshold pressure injection denies a new leader with the
  existing typed code, preserves a fresh hit, and admission recovers after
  removing the injected pressure. Real continuous-load denial/stalls remain
  visible and cannot be hidden by the injection result.
- WAL/temp/IO/connections, actual cgroup charge/limits and OOM events retained.

Success is `PASS_BOUNDED_QUALIFICATION_NOT_24H`, never a24h soak claim.
Extended soak is optional release confidence, not a UDB-01 closure dependency.
The host has no `memory.peak`; the collector records actual sampled cgroup
charges and memory.max/events instead of inventing a kernel peak.

Use the finite, phase-owned `monitor.sh` user service to collect evidence and
remove only `portal-udb01-soak` containers/network and its newly-created
`portal-udb01-soak_pg-data` test volume after writer completion. Retain reports,
backup and rollback image IDs for30days. Do not prune any application image,
volume, cache, backup or unrelated worktree. Unified remains pending until
the actual qualification result and cleanup are reconciled.

For this bounded lane, start its finite collector after `soak.sh start`:

```bash
systemd-run --user --unit=portal-udb01-soak-collector \
  --property=RuntimeMaxSec=2100 \
  /bin/bash /home/bobby/portal-research/scripts/research-udb/monitor.sh
```

The collector does not change Git or declare phase acceptance. Inspect its
terminal result and retained hashes before updating the Unified gate; do not
start a second writer or overwrite the private lane directory.
