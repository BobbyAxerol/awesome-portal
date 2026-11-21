# Recovery V2 — local closed-database checkpoint observation

**UNMOUNTED SOURCE/TEST ONLY.** This follows [observer ordering](CORE_C2_RECOVERY_OBSERVER_ORDERING_20261106.md). It is not independent owner authority, a complete old-holder/source/HTTP fence, source ACK or permission to restore.

## Change

The new closed-DB capture binds the existing frozen inventory and drain to a distinct `FROZEN_CLOSED_DB_OBSERVATION` event and digest containing the selected DB/observer pin. It verifies the selected database is closed to connections, is owned by the selected superuser operator, the exact retained observer is the sole visible DB backend, no prepared transaction remains, and the existing freeze, P7/public-table guard coverage, writer-NOLOGIN and unresolved-original checks pass. The source transaction holds a `SHARE` lock on the local `pg_database` catalog through the independent checkpoint append. This prevents a normal concurrent `ALTER DATABASE ... ALLOW_CONNECTIONS true` on that cluster while the lock is held; an exact prior operation is refused if the DB is reopened before a retry.

The lock is **cluster-wide and potentially disruptive** to database administrative operations. This test-only primitive requires a separately approved operating procedure, lock/resource budget, trusted operator and independently qualified authority before any runtime consideration. A privileged actor, existing or newly raced connection, source/HTTP work, another cluster or physical clone is not independently fenced. The digest binds the selected pin but the full pin is not independently stored and attested by this candidate; its operator provenance and later state must be established separately. Local inventory does not prove complete source terminal/ACK reconciliation. Keep V2 restore refusal enabled.

The fresh candidate schema adds one event kind. The test-only forward upgrade now accepts exactly either the original four-kind or the intermediate five-kind CHECK and moves it to the six-kind form without rewriting history; an unexpected or unvalidated additional capture-kind constraint still fails. Existing journal hashes and capture kinds are not relabelled. This SQL does not independently pin the authority target, validate complete history/ACL or authorize a migration.

## Focused validation

`scripts/test-elp2-restore-checkpoint-pg.sh`: final **21/21 PASS**, on two disposable PostgreSQL clusters. The actual migrated/candidate-schema test verifies wrong/unchanged target refusal, rejects capture while DB open, blocks concurrent reopen while the authority append is deliberately held, records/replays the distinct closed kind and refuses the same receipt after privileged reopen. Synthetic old and intermediate authority-schema upgrades retain historical row bytes. Earlier 21/21 runs are not additive.

Strict focused TypeScript compilation of `restore-checkpoint-authority.ts` and `git diff --check` passed. No full compiler/hook was run. The test runners removed their named containers/networks; read-only container census found no matching ELP2/test-PG cell. Runner resource caps applied, peak usage not measured. No Research/shared DB, runtime, permission or source changed.

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority.ts` | `8605c5e73b923d8b03792fdb2df8376b11cae273e63972bb97114d3ed2850e58` |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority.sql` | `07b4b18d6007126c79d5a5213010080bc980332f2aec9d12029bf38af0e9a786` |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority-nologin-upgrade-candidate.sql` | `d0fd73b5c6bd05dc5c28c3eff9522ef9fd9442aafc130633e9a6b182b109cd70` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `a2f4b8d32310def918623cfddc09240970213bba7283cd84ebe2cf263b677fb5` |
| `apps/control-api/test/restore-authority-upgrade-pg.spec.ts` | `2f35db482c1671f07ecc8cff64c17b82ef8d10d0601d3a33091f607ee4ee9d7b` |

## Next / rollback / consumer

Core must still qualify the independent operator/authority and checkpoint pin, enforce old-holder/privileged/source/HTTP fences, reconcile genuine post-snapshot terminal/ACK, and rehearse restore on a representative frozen candidate. P7/A2, connected Edge and G2/browser remain open. Rollback now is no installation and continued V2 restore refusal; no real schema changed. No frontend contract/action.
