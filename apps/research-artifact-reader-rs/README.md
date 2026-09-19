# Research artifact reader (P05)

This is a **Research-only**, read-only Rust foundation for the P05 Parquet
artifact format.  It deliberately has no HTTP listener, database credential,
worker scheduler, browser DTO, Execution dependency, Trading System
dependency, or mutable artifact operation.

The Python writer owns bounded batch production and immutable manifests.
The Control API owns reservation, fencing, publication state and retention
metadata.  This crate only validates a sealed local manifest, projects named
Parquet columns and returns a bounded page of Arrow record batches.

## Invariants

- Artifact identifiers and manifest paths are relative/safe; absolute and
  traversal paths fail closed.
- Manifest bytes are SHA-256 checked against `manifest_digest` before any part
  is read.
- Part bytes are checked before a page is returned.
- A page is capped at 200 rows and 1 MiB of logical input bytes.  The reader
  retains at most one requested Arrow batch at a time.
- The opaque cursor is relation-bound (`artifact_id`, `table_kind`, requested
  column set) and advances by immutable `part_ordinal`/row offset.  It cannot
  be reused for a different artifact/table/projection.
- Decimal and timestamp values remain Arrow arrays: later named BFF code owns
  exact decimal/UTC JSON encoding instead of losing precision here.

## Scope and rollback

P05 does not activate this reader in a service.  P10/P11 may introduce named
Control-API reads after their API/RBAC contracts exist.  Reader rollback means
selecting an earlier reader binary; sealed bytes and Control API references are
never deleted as rollback.
