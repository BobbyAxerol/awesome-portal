# P7 row-lock boundary with a limited login — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** Checkout `docs/research-loop-plan` at
committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`; the candidate,
tests and this receipt are uncommitted. No Research runtime, real DB grant,
source, public issuer or frontend contract was changed.

## Change and isolated evidence

The new *unmounted* SQL candidate makes the P7 lease-check trigger a
`SECURITY DEFINER` only after an operator has provisioned and transferred it
to a dedicated NOLOGIN owner. Its preflight refuses a privileged or login
owner, ownership/CREATE on the protected schemas or tables, dangerous table
grants, the ability to set `session_replication_role`, and membership of that
owner by any non-superuser role. It creates no roles or grants itself.

`scripts/test-elp2-c2-p7-pg.sh owner-intent` ran on two **disposable** PG
clusters: **7/7 PASS**. With a separate real test login, a P7-bound synthetic
lease could be inserted and entered inside a rolled-back transaction; an
unbound lease was rejected. The application login could not assume the
definer role, change P7 registration or records, or disable the guard. The
installer refused a superuser owner, a login inheriting the definer, and a
definer with DELETE permission on P7 records. The test removed its roles;
runner EXIT traps clean the test clusters and network. No genuine authority,
source acceptance, bearer, or product HTTP response was asserted.

| File | SHA-256 |
| --- | --- |
| `c2-p7-bound-lease-definer-candidate.sql` | `41f5296c6cf211f1bbe04a58ce674221c02be5b25d5a525ae6ac644bda097987` |
| `c2-p7-bound-lease-fence-candidate.sql` | `d1accc3e61ce536341b624a8f2741f9d713046cb33d5867248af19bdbf39fecf` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `b067b7cc87c295d92e0da37c3824d6f38c63ab66de15da6e984fbc4ae40c3070` |
| `test-elp2-c2-p7-pg.sh` | `a60988ddcc7caa9216314add37b963205a6a831578c35d5630955b60985b88f2` |

## Remaining security and integration work

This preflight is a point-in-time check, not protection from later GRANTs,
privileged administrators or table owners. Actual installer/role provisioning
and ongoing ACL controls require review. For this test the legacy invoker
`lease_event` still required granting the test application direct UPDATE on
`authority.lease_epoch`; this is **not accepted as a production role design**.
The limited login test also does not prove that a caller cannot forge all
lease fields, nor does it prove HTTP custody or independently authenticate a
source. The remaining legacy trigger/role boundary must be fixed and tested,
and the full source graph and migration validated before any candidate mount.
Issuer remains fail-closed. V2 restore, source/owner acceptance, old-holder
fencing, real ACK reconciliation and connected qualification remain open.
There is no new frontend field or consumer action.
