# Isolated STATUS restore: post-snapshot coordinated logout

## Scope and inputs

This is a TEST_ONLY retake in an internal-network disposable PostgreSQL/mTLS
cell. The test input `command-source-assertion-pg.spec.ts` SHA-256 is
`752d2b4b0b07883a8dc34ba2079dfbc6ce0dbbb57a4a065f2aaaff5b0b41507e`.
PostgreSQL image `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`;
Node image `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`.
Source facts, certificates, original, terminal and ACK are synthetic.

## Result

The selected focused case passed 1/1 (seven skipped), and its runner exited
0 on 4 November 2026. After a writer-created terminal and ACK, the runner
performed `pg_dump` and `pg_restore` into a separate database. The actual
`AuthService.logout` and `CurrentHumanMutations` then revoked that same
disposable password session on the original database. The original session
became REVOKED and its authority revision advanced; the restored session
remained ACTIVE at the old revision. The original and restored STATUS ACK
rows nonetheless still matched. The existing pinned-mTLS recovery and
duplicate completion checks passed on the restored copy. No session token,
credential, or private key is printed or stored in this receipt.

This improves on the synthetic revision-only diagnostic: the revoke is a real
Core writer on a disposable database. It does **not** implement a restore
barrier, reconcile the revocation, prove current external authority or a real
Edge ACK, or establish operational rollback. The old UDB V2 fail-closed
guard remains necessary. A production-capable barrier still requires an
independent current authority checkpoint, quiescence, fencing, reconciliation
of later facts, and an appropriately scoped candidate rehearsal.

The runner reports exit 0 after its owned-cell cleanup. The initial sandboxed
attempt could not use Docker because `sudo` was unavailable and was not
counted as a test. The subsequently authorized isolated execution is the
passing result; no shared runtime or production database was touched.

## Follow-through

Backend: implement and qualify the V2 recovery barrier and repeat affected
tests after relevant schema/dependency changes. ELP2-10/11 remain open.
Claude: no UI or contract change to consume from this retake. Connected Edge
and final browser acceptance remain separate.
