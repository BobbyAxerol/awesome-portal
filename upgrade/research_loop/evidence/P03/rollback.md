# P03 rollback and recovery

The migration is additive and its down section intentionally does nothing.
Dropping `research.*`, its audit lineage or the runtime role after a later
release may destroy referential evidence or leave a newer reader broken.

If a release containing P03 must be rolled back:

1. Roll back the application/image reader only; do not run a destructive SQL
   down migration.
2. Leave existing Portal identity/workspace/credential/grant rows unchanged.
3. Leave `research.*` dormant until the corrected reader is deployed.
4. Investigate from `research.audit_log` and immutable evidence rows; do not
   delete attempts/artifacts to hide a failure.

The focused test uses a PostgreSQL 16 container with tmpfs-only data and an
exact-name `EXIT` trap. It creates no named volume, migration on a runtime DB,
or release artifact to recover.
