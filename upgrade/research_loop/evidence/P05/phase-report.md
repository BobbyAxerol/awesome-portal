# P05 phase report — Disk-first artifacts, Parquet and bounded export

Status: `TECHNICALLY_COMPLETE / BACKEND_COMPLETE_FE_HANDOFF_READY` —
2026-09-19.

## Delivered authority

P05 adds a Research-only artifact authority alongside—not through—the legacy
FastAPI artifact paths. A Python compute adapter writes bounded PyArrow
`RecordBatch` parts under random lease-scoped staging, records part statistics
and SHA-256 digests, fsyncs the manifest, then atomically renames it to a
sealed-byte candidate. It has no database/broker/browser authority.

The Control API migration and repository reserve the revision, bind it to the
worker attempt and lease epoch, record immutable parts/references/ingest
batches, and permit only the one-way durable transition `WRITING → SEALED`.
Later integrity observation may mark that exact immutable fact set `CORRUPT`
or `MISSING`; it cannot rewrite the sealed facts. Revision-zero P03 rows stay
compatible until P10 named-operation cutover.

The standalone Rust reader is intentionally below the BFF boundary. It accepts
only a bounded manifest with the expected digest, validates the full
cross-language manifest shape (identity/fence/input, UTC completion,
table/part/document totals, canonical paths/ordinals and strict unknown-field
rejection) and each requested part SHA-256, applies declared-column projection,
and returns at most 200 rows / 1 MiB with an HMAC-signed relation-bound opaque
cursor. It does not expose a network service, decide RBAC, or retain a complete
artifact.

## Correctness and recovery

- Crash injection covers before/after manifest fsync and after rename before
  Control-API registration. Those conditions are recoverable staging or
  unregistered candidates, never a falsely published durable state.
- Same-input attempts get independent random staging locations. A stale lease
  fence cannot seal.
- Retention is reference-aware: active lease, child run, exposure, release
  candidate, selection and verification pins block collection. Scratch/export
  cleanup deletes only its own known temporary path.
- The Rust reader has a dedicated invariant-drift regression plus a
  multi-underlying-Parquet-batch resume regression, so it cannot silently
  accept a Python/Control-API manifest with a different structural meaning.
- The PostgreSQL proof runs fresh migration, upgrade and repeat paths in a
  tmpfs-only disposable cell. It specifically proves idempotency, retention
  deadline conflict, canonical part ordinal/path and expired active-lease
  rejection.

## Scope guard

P05 does not dispatch jobs, invoke NATS, spawn a durable child, submit a
Research run, make a browser route, deploy a service, change Execution Loop,
or contact Trading System/broker/CLI. `P06` owns the first real scheduler and
isolated worker. P05 therefore does not claim an actual 5GB worker workload or
P06 retry/cancel evidence.

The actual QuantBT receipt is deliberately a deterministic 500-bar P04 Delta
technical bundle. It proves storage/readback across process exit using the
current `quantbt-engine==1.1.1`; it does not claim real alpha, execution or
market-source publication.

During the final contract gate, the lockfile-pinned OpenAPI generator exposed
an older generated `portal-api.d.ts` that omitted the already-published P04
read-only Atlas endpoint. It was regenerated from the canonical existing
OpenAPI input and snapshot-pinned. This is a type-generation hygiene repair,
not a new P05 product route or UI change.

See [test-results.json](./test-results.json),
[delta-real-data.json](./delta-real-data.json), and
[frontend-handoff-claude.md](./frontend-handoff-claude.md).
