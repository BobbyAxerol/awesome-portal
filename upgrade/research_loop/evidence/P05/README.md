# P05 evidence — Disk-first artifacts, Parquet and bounded export

Status: `TECHNICALLY_COMPLETE / BACKEND_COMPLETE_FE_HANDOFF_READY` on
2026-09-19.

P05 establishes the Research-only durable artifact foundation. It is not a
runtime rollout, browser route, scheduler, or named run-submit operation.
Its Python writer produces bounded Parquet parts and an immutable manifest;
the Control API is the only authority that can record the durable `SEALED`
state; the Rust reader is a server-side, bounded reader foundation.

Read this packet in order:

1. [phase-report.md](./phase-report.md) — scope, authority and outcomes.
2. [contract-results.json](./contract-results.json) — immutable storage
   contract and source hashes.
3. [delta-real-data.json](./delta-real-data.json) — actual pinned QuantBT
   1.1.1 technical-bundle persistence proof.
4. [test-results.json](./test-results.json) — test receipts and their limits.
5. [frontend-handoff-claude.md](./frontend-handoff-claude.md) — future
   consumer rules; **no UI change is included in P05**.
6. [resource-cleanup.json](./resource-cleanup.json) and
   [rollback.md](./rollback.md) — C4 closeout and safe reversal boundary.

`P06` may consume the sealed DTO only through its lease-scoped durable worker
protocol. `P09/P11` own browser composition; `P10` owns named producer/read
operation cutover from the legacy compatibility paths.
