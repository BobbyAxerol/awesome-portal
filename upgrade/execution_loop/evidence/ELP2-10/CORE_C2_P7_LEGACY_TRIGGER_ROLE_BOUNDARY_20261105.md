# P7 legacy lease-trigger role boundary — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** Checkout `docs/research-loop-plan` at
committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`; candidate and
receipt are uncommitted. No Research runtime, real DB role, source, grant or
frontend contract was changed.

## Candidate and evidence

The [earlier restricted-login test](CORE_C2_P7_LIMITED_LOGIN_DEFINER_20261105.md)
needed the application login to update `authority.lease_epoch` for a legacy
event trigger. This follow-through tests separating the legacy scope guard and
event writer into two distinct, externally provisioned NOLOGIN function
owners. The candidate installer checks owners and memberships, protected
schema/table ownership and ACL, restricts UPDATE to the exact authority column
for each role, permits INSERT only into events for the event owner, and makes
both trigger functions security definers with fixed `pg_catalog` search path.
It does not create roles or issue grants and is not a product migration.

`scripts/test-elp2-c2-p7-pg.sh owner-intent` on two disposable PostgreSQL
clusters: **7/7 PASS**. In the role-composition case, an actual test login
inserts and enters a synthetic P7-bound lease inside a rolled-back transaction
without authority UPDATE or event INSERT; unbound issuance is rejected. The
test login cannot write `lease_epoch`, `drain_id` or events, assume any of the
three NOLOGIN roles, change P7 records or disable the P7 trigger. Installer
negatives reject superuser ownership, dangerous role inheritance and an extra
authority-column grant. The other tests include PG revoke, stale-snapshot,
same-original recovery and synthetic HTTP preparation. These test scopes are
not connected-source or product authorization evidence. Test roles and test
containers were removed; `git diff --check` passed.

| File | SHA-256 |
| --- | --- |
| `c2-p7-legacy-lease-trigger-definer-candidate.sql` | `aba03f64fcd7b72115f6f716da7e04e30318adba6a6f1591d27f3417ab8d97c1` |
| `c2-p7-bound-lease-definer-candidate.sql` | `41f5296c6cf211f1bbe04a58ce674221c02be5b25d5a525ae6ac644bda097987` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `04c93660fe7e1b50c805e4b1ab2d86350f0bdd86e3adf5a53e7dfd416f57fb50` |
| `test-elp2-c2-p7-pg.sh` | `a60988ddcc7caa9216314add37b963205a6a831578c35d5630955b60985b88f2` |

## Still open

Checks are point-in-time: post-install privilege changes, privileged DB
operators and table-owner bypass require separate operational isolation. This
test intentionally clones a lease to exercise trigger behavior, so it does
not establish that a compromised application login cannot forge an issuance.
The combined limited-login revoke race, real installer ACL and migration,
HTTP custody, actual owner/source acceptance, old-holder fencing and V2
recovery remain open. Issuer and V2 restore remain fail-closed; no Edge/TS
acceptance, real ACK, frontend action or deployment is asserted.
