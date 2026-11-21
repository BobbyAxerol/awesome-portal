# Recovery V2 — prepared-transaction census, 2026-11-05

**SOURCE/TEST ONLY, UNMOUNTED.** This extends [local quarantine](CORE_C2_RECOVERY_LOCAL_WRITER_QUARANTINE_20261105.md) and the [NOLOGIN checkpoint observation](CORE_C2_RECOVERY_NOLOGIN_CHECKPOINT_20261105.md). It is not a restore permit, source ACK or independent old-holder fence.

## Defect and change

The previous checks refused a prepared PostgreSQL transaction only if its owner name matched the selected writer. A transaction left by another/former role in the same database could therefore be missed. Both the quarantine inspection and the distinct NOLOGIN observation now conservatively refuse **any** prepared transaction in the selected database, plus any transaction owned by the selected writer in another database. They do not terminate or commit prepared transactions. A separate operator must resolve them through the appropriate authority.

The NOLOGIN observation remains a local catalog snapshot, not a durable proof: a privileged or other holder can prepare later; different clusters, source/HTTP in-flight work and transaction effects outside this DB are not fenced. Further independent exclusion and a complete reconciliation are mandatory. The existing V2 restore refusal remains enabled. This was not mounted, installed or run against a real source.

## Validation

- `scripts/test-elp2-restore-inventory-rls.sh restore-writer-quarantine`: **3/3 PASS**, including an actual prepared transaction owned by a different role, refusal before changing writer login, rollback of that test transaction and preservation of existing other-session/capacity tests.
- `scripts/test-elp2-restore-checkpoint-pg.sh`: **21/21 PASS**, including an actual prepared transaction owned by the administrator rather than the writer; the NOLOGIN capture refuses before the test transaction is rolled back. The changed test runners enable prepared transactions only on their disposable PostgreSQL cells.
- Strict focused TypeScript compilation of the two changed source modules and `git diff --check`: exit 0. Full compiler/hook was not rerun. No cumulative test count is claimed against earlier receipts, whose source pins this change supersedes.
- Runners cleaned their named temporary containers/networks; a read-only check found no named ELP2/test-PG containers. No real DB, permissions, runtime or credential changed; runner caps applied and peak resource use was not measured.

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority.ts` | `ced4e7e130445e50e77d7fb5f40ee7f59ce12227c2224af9e93b9202459f1c05` |
| `apps/control-api/src/execution-v2/restore-local-writer-quarantine-candidate.ts` | `2f7271b518576eda62c47c5432d2e7cd6f2f332308a7da0ad3cf927ede55f7ec` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `7b1d91b5eb36969f6a73c6e11f211ee2706437cc326274d91c31f0e996604c0b` |
| `apps/control-api/test/restore-local-writer-quarantine-pg.spec.ts` | `c6e009dd95384fc9dc5c5c5f70cc476c96fd5c861f2bad31c4d3be1d79e3c5e4` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `747c2ab0c0ce07b74c97cd0f27dcefa9bb2c0cb88684bb83db4fd98164ae6d7e` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `6cb5ec3096b69873b1b1b5d78d620b108f5e29e3b2606ce51ff5214a20604bf7` |

## Next / rollback / consumer

Core still needs independently qualified old-holder/privilege/network fencing, durable authority and complete post-snapshot terminal/ACK reconciliation, plus representative restore rehearsal and final candidate review. P7/A2 and actual Edge acceptance are separate. Rollback is to leave the candidate unmounted and keep the restore refusal; no real prepared transaction was modified. No frontend contract/action.
