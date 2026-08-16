# BAR-15 — Planning/PostgreSQL cutover foundation

> **Version:** 0.1 · **Status:** complete (export/import/reconcile + state
> machine) · **Updated:** 2026-08-16
> **Unified phase:** U18 · **Guide:** v0.4 §24.4, §29.11

`features/roadmap-task-board/backend/app/infrastructure/cutover.py` freezes
the current Planning data with legacy_id mapping + per-entity checksums,
imports idempotently into any SQL target adapter (SQLite parity harness;
PostgreSQL adapter swaps in for the real cutover), reconciles exact
counts/hashes and drives the explicit cutover state machine
(NOT_STARTED→EXPORTED→IMPORTED→RECONCILED→ARCHIVED). Tampered checksums are
rejected; no dual-write without reconciliation.
`tests/test_cutover.py` (**5 tests**; Planning total 23 passed). No change
was pushed or deployed.
