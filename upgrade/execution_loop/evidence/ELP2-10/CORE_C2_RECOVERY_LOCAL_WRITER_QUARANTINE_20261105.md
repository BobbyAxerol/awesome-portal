# Recovery V2 — local writer quarantine candidate, 2026-11-05

**UNMOUNTED SOURCE/TEST ONLY. Not an independent old-holder fence or restore/cutover authorization.** No actual user role, database, runtime, source or credential was modified.

## Candidate

`restore-local-writer-quarantine-candidate.ts` implements a private operator primitive for a single explicitly pinned dedicated login and database. It validates the PostgreSQL system identifier, database, operator identity, target role name and OID, rejects elevated/owner roles and memberships, another non-superuser login that can assume the target, directly attributable prepared transactions, cross-database activity and more than the selected bounded number of sessions. It commits `NOLOGIN` before terminating only matching sessions in that database, then rechecks local login/session state. A lost response is retried with the same pin and leaves NOLOGIN in place; the operation does not automatically re-enable the role.

This code is not mounted to HTTP, startup, a workflow or a production operator. It assumes a separately authorized operator has already established the login is dedicated and the exact cluster is correct. A privileged administrator can reverse the role change, a physical clone can preserve the same PostgreSQL system identifier, and this mechanism neither fences old HTTP deliveries nor finds prepared transactions created under a previously assumed role. A durable external control, complete writer/prepared-transaction census, source/ACK reconciliation and independent old-holder/network fencing remain mandatory. The existing V2 restore refusal stays enabled.

**Integration gap:** the existing frozen checkpoint's `public_writer_is_safe` predicate requires the previous role to be LOGIN. Disabling that role therefore cannot yet produce an accepted frozen-checkpoint capture. Do not weaken that check or wire this primitive into restore until a reviewed, independently trusted quarantine proof and a compatible checkpoint protocol exist.

## Tests and resources

- `bash scripts/test-elp2-restore-inventory-rls.sh restore-writer-quarantine`: final **2/2 PASS** on a dedicated disposable cluster. Exercises wrong cluster/role pins, role sharing in both directions including NOINHERIT, session limit, a session on another DB, disabling the exact login, termination and rollback of an old uncommitted transaction, preservation of an unrelated login, denied reconnect and same-pin replay. Prepared transactions, privileged interference, network fencing and actual restart/restore were **not** demonstrated.
- Strict focused TypeScript compile of the candidate and its PG test: exit 0. `git diff --check`: exit 0. Full compiler and normal hook were not run.
- The runner's trap owned its disposable PostgreSQL/node containers and network. Read-only census found no `elp2-` or `control-api-test-postgres` containers. No resource peak was measured.

| Input | SHA256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-local-writer-quarantine-candidate.ts` | `37931ef612b824dee2568ddef5ea8626d4c5f42d1700e022c8a2e214e8a3253c` |
| `apps/control-api/test/restore-local-writer-quarantine-pg.spec.ts` | `093f681d5359534aa6b36a9eada8fa5005eb1b1c73fe45a968a058c0e3f6d9d0` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `2316de045177bb5e9351c5b46d1e1fe568019b0417a936dfe3e8fedbee9cb4ce` |

## Next and handoff

Core must reconcile this primitive with the checkpoint using independently qualified authority and immutable proof, handle already in-flight/prepared work and old clones, verify real source terminal/ACK after snapshot, and rehearse full restore on a representative candidate. P7/A2, financial/STATUS and connected Edge remain open. This adds no frontend contract; Claude has no new consumer task. Rollback is no runtime installation and continued V2 restore refusal; any future real NOLOGIN recovery must be a separately reviewed operator procedure, not an automatic re-enable.
