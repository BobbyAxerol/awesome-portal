# P7 restricted-login ENTER / revoke serialization — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** On checkout `docs/research-loop-plan`,
committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`, all changes remain
uncommitted. No source grant, production DB, runtime, frontend or issuer was
changed.

## Test and result

On two disposable PostgreSQL clusters, the test created a separate synthetic
owner intent and lease, under the restricted app login and NOLOGIN trigger
owners from [the prior role-boundary candidate](CORE_C2_P7_LEGACY_TRIGGER_ROLE_BOUNDARY_20261105.md).
One restricted transaction entered the lease and held the transaction open;
an authenticated synthetic owner revoke then blocked on the authority lock.
After the competing ENTER transaction was rolled back, revoke committed. A
separate restricted `REPEATABLE READ` transaction whose snapshot predated the
revoke got SQLSTATE `40001`; a new `READ COMMITTED` ENTER was rejected as
`C2_P7_DB_INTENT_NOT_CURRENT`. The synthetic lease was retired, not deleted.

`scripts/test-elp2-c2-p7-pg.sh owner-intent`: **7/7 PASS**. The other tests
exercise different originals and local source-proof settlement; they are not
an Edge ACK or a connected owner acceptance. The two test PGs, Node container
and test network were removed by the runner.

| File | SHA-256 |
| --- | --- |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `89639a1680d0b8954e18c755721d71f0273cd9334bbb931c6aca25e84003a33f` |
| `c2-p7-legacy-lease-trigger-definer-candidate.sql` | `aba03f64fcd7b72115f6f716da7e04e30318adba6a6f1591d27f3417ab8d97c1` |
| `c2-p7-bound-lease-definer-candidate.sql` | `41f5296c6cf211f1bbe04a58ce674221c02be5b25d5a525ae6ac644bda097987` |

## Remaining scope

The competing ENTER was rolled back, so this test does not by itself prove
terminal settlement of a committed ENTER through the restricted login and
real Edge. It does not make the installer production-ready or protect against
later role grants, compromised privileged operators or application-created
fake lease rows. Independent authority/custody, real P7 acceptance, HTTP
delivery, V2 recovery and integration remain open. Issuer and V2 restore stay
fail-closed. No frontend contract or consumer instruction changed.
