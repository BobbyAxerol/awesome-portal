# Recovery V2 — local quarantine/checkpoint ordering test, 2026-11-06

**SOURCE/TEST ONLY, UNMOUNTED.** Not independent proof of quarantine, a source/HTTP/old-clone fence, restore permit, or connected acceptance. This builds on [the database quarantine candidate](CORE_C2_RECOVERY_LOCAL_DATABASE_QUARANTINE_20261105.md).

## What was integrated

A separate candidate method retains exactly one already-connected, idle observer pinned by PID, backend start, application name and operator login while disabling new database connections and draining other client sessions. On a disposable migrated-and-candidate source DB, the test first rejects a wrong observer pin without disabling connections, then closes and drains the DB and uses that same surviving pool to append the existing NOLOGIN observation to a second PostgreSQL authority cluster. The test reopens only its disposable DB during cleanup. The original no-observer quarantine remains supported.

This demonstrates one **local ordering**, not a safe complete restore protocol. The observer runs under the privileged operator; it is not independently authenticated, read-only, or protected against compromise. The checkpoint digest does not attest the database closure, observer identity, lack of privileged reopen, or external state; there is no atomic cross-system fence. A privileged actor may change the database state after validation and a physical clone may share a system identifier. `STORED_NOT_CUTOVER` is not a recovery authorization. Do not mount this method, accept it as P7/A2 evidence, or remove V2 restore refusal.

## Verification

- `scripts/test-elp2-restore-checkpoint-pg.sh`: **21/21 PASS** on two disposable PG clusters. The new integrated subcase exercises wrong observer pin, DB closure and checkpoint append after closure against the real migrated/candidate test schema. This is not a real owner, source terminal, ACK, backup restore or failover.
- `scripts/test-elp2-restore-inventory-rls.sh restore-database-quarantine`: **2/2 PASS** retake for the no-observer path.
- Strict focused TypeScript check of the affected source modules and `git diff --check`: exit 0. Full typecheck and normal hook not run. Runner-owned cells/networks were cleaned; read-only container census returned none with the test prefixes. Peak resources were not measured.

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-local-database-quarantine-candidate.ts` | `363ab62a692fdb7dcc4de023c01fc6d0886d9e6fd61736d52ce2eb1de19bdac8` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `1fe407660ae168ae0f212ae666b7217fb3f810f48ef0a045643cdc6b2e5b8157` |
| `apps/control-api/test/restore-local-database-quarantine-pg.spec.ts` | `9214277ba89889abb3e3f3e26e22f720152ab60809f6d950031e58be8ac1a3ed` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `6cb5ec3096b69873b1b1b5d78d620b108f5e29e3b2606ce51ff5214a20604bf7` |

## Next / rollback / consumer

Core still needs an independently qualified authority and durable closed-state proof tied to the checkpoint, externally enforced old-holder/privileged/network and HTTP/source fences, complete post-snapshot terminal/ACK reconciliation, and a representative restore/rollback rehearsal. P7/A2, real Edge acceptance and integrated review/hook remain open. Rollback is no installation and continued restore refusal. No frontend contract/action.
