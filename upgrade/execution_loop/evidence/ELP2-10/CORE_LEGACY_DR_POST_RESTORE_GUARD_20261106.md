# Legacy DR post-restore guard — 2026-11-06

**Source/test WIP only; not V2 recovery, a restore rehearsal or a phase pass.**
The UDB-04 harness fingerprints only legacy custody. Its existing schema probe
ran against the target before restore, which alone cannot prove that a restored
archive did not introduce a V2 authority schema. The harness now rechecks the
actual target after each Core archive restore while cutover remains disabled;
it also probes immediately before the cleanup path starts applications. A probe
or restore failure throws and prevents that path from starting the applications.
This is an additional refusal barrier, not permission to restore V2.

## Files and direct working-tree hashes

| Path | SHA-256 |
| --- | --- |
| `scripts/research-udb/legacy-dr-guard.mjs` | `eaa462cc3e482e3459a67c807ac2fbcf587fb1880ae6c97ea4d87329d0efbac3` |
| `scripts/research-udb/legacy-dr-guard.test.mjs` | `3399b4fefc3fc5c5aed2a57cbfa1602b32bd21126b9d9514f22473cbe8356958` |
| `scripts/research-udb/acceptance-dr.mjs` | `ff46b7b68cf6b413453b9e8aac76dcd675e1a40e33748c3f5cd05278dc212246` |

## Evidence and limits

- `node scripts/research-udb/legacy-dr-guard.test.mjs`: **3/3 PASS**, including
  a synthetic restore introducing V2, V2 already present and restore failure.
  The test exercises injected callbacks, not `pg_restore` or a live database.
- `node --check scripts/research-udb/acceptance-dr.mjs` and `git diff --check`
  passed. No DB, containers, services, data, credentials or runtime changed;
  no test resources required cleanup. Peak resources were not measured.
- Checks before and after restore are not a lock across the entire cutover. They
  do not establish independent monotonic authority, prevent concurrent DDL or an
  old process, reconcile terminal/ACK, or qualify V2 restore. The legacy guard
  continues to reject observed V2 schemas; the candidate must remain unmounted.
- The final integrated candidate, representative restore/rollback and normal
  hook remain open. Working-tree hashes are not a committed source or image pin.

Next: complete independent V2 checkpoint/fencing and genuine terminal/ACK
reconciliation; complete financial authority multi-delivery persistence and
integration. There is no frontend contract or Claude action for this change.
Rollback: keep the legacy harness unused; do not remove the existing V2 refusal
or use this probe as a V2 recovery procedure.
