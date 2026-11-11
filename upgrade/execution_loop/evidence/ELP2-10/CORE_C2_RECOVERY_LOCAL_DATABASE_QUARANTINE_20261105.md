# Recovery V2 — local database-wide quarantine candidate

**UNMOUNTED SOURCE/TEST ONLY.** Not an external old-holder/source/HTTP fence, independent checkpoint, cutover authorization or ELP2-10 closeout. It was not installed or executed on Research or any shared database.

## Candidate and boundary

An operator primitive targets exactly one dedicated non-template database from a different operator database. It validates the PostgreSQL system identifier, database name and OID, operator session/current role, operator superuser status and target ownership; it refuses prepared transactions and unexpected/non-client or excess sessions. It disables new connections, then terminates only selected-database client backends, rechecks the database state and supports retry with the same pin. A failure after disabling leaves the database closed; there is no automatic re-enable.

This can interrupt **all users** of the selected DB and requires a separately authorized operator, dedicated ownership and exact target validation. The local superuser/owner can reverse it; a physical clone can preserve the same system identifier. It cannot fence another cluster, upstream execution or already-sent HTTP, nor prove terminal/ACK completeness. A concurrent privileged actor can change state after observation. It does not connect the independent checkpoint: after the database is closed, the existing checkpoint reader cannot reconnect; a reviewed ordering and independently authenticated freeze proof are still required. Never interpret this primitive as permission to restore or disable the existing V2 refusal.

## Test and pins

- `bash scripts/test-elp2-restore-inventory-rls.sh restore-database-quarantine`: final **2/2 PASS** on a dedicated disposable cluster, including wrong identity/OID/owner/operator DB, session cap, a real prepared transaction, closure of new connections, termination/rollback of an open transaction, unaffected operator database, lost response after ALTER and same-pin retry. Explicit re-enable occurred only inside the disposable test cleanup to inspect rollback.
- Strict focused TypeScript source check and `git diff --check`: exit 0. Full compiler and normal hook were not run. Earlier two-test runs are not additional coverage.
- Runner cleanup removed its own temporary containers/network; read-only Docker census found no named ELP2/test-PG containers. Resource caps applied; peak use was not measured.

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-local-database-quarantine-candidate.ts` | `dc5670cccbd11630e01aa6d4c442175fa8f4c3d5b36fc43106faf363e9e88dca` |
| `apps/control-api/test/restore-local-database-quarantine-pg.spec.ts` | `9214277ba89889abb3e3f3e26e22f720152ab60809f6d950031e58be8ac1a3ed` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `e3c911cb0adc61d810d4477fb3398d5a26e5fa4ede8b3a7a5ccb38b359719138` |

## Next / rollback / frontend

Qualify an independently held authority, ordered checkpoint/cutover protocol, old-clone and source/HTTP fences, terminal/ACK census, and representative restore rehearsal before considering runtime use. P7/A2, Edge acceptance and final candidate integration remain open. Rollback now is simply no installation and continued V2 restore refusal. No frontend contract or consumer action.
