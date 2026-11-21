# C2 custody and revoke: trigger-bypass caller fence — 2026-11-05

**SOURCE-ONLY CANDIDATE; NOT RUNTIME, HTTP CUSTODY OR CONNECTED ACCEPTANCE.**

## Finding and fix

In an isolated PostgreSQL test, a non-superuser with `SET` on the
`session_replication_role` parameter changed it to `replica`. This disables
ordinary triggers and foreign-key checks. The delivery security-definer then
returned `RESERVED_NOT_DELIVERED` for a nonexistent lease; the revoke procedure
also returned `REGISTRATION_REVOKED_BLOCK_NEW` while its ordinary audit and
generation triggers were disabled. Both negative tests failed before the fix.
These were synthetic disposable roles; no evidence shows that a deployed caller
held this privilege or that any real lease was affected.

The candidate delivery procedure and both test-only and role-neutral revoke
procedure bodies now reject replica-mode sessions, a caller with direct or
inherited parameter SET authority, and callers or member roles with unsafe
cluster-level powers. An already-set replica session is rejected even if the
parameter privilege was subsequently revoked. Existing least-privilege caller
behavior, fixed-scope revocation and exact-original UNKNOWN remain covered.
This is not a replacement for installation ACL checks, independent identity,
same-authority HTTP delivery fencing, or source authentication. The candidate
delivery procedure remains explicitly test-only.

## Evidence and resource handling

- The two targeted pre-fix negative runs each failed as intended, showing the
  unexpected successful reserve and revoke respectively; neither is a PASS.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  **3/3 PASS**, including direct/inherited SET, already-set-after-REVOKE,
  invalid lease, concurrent ordering and original-bound UNKNOWN.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **19/19 PASS**
  on two disposable clusters. Its revoke caller now authenticates as a real
  least-privilege test login, not a superuser session using `SET ROLE`.
- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: initial retake was 7/8
  because that older test likewise used a superuser session; after replacing
  it with a separate least-privilege test login and explicitly testing SET
  rejection, **8/8 PASS**. The negative behavior was not weakened.
- All cells used pinned images, isolated databases and trap cleanup. Read-only
  Docker check found no matching test node containers afterward. Filesystem at
  the check: 274 GiB available, 56% used. No shared DB, stable/dev runtime,
  credentials, frontend, signing, or remote push was changed.

SHA-256 pins for the source and tests exercised:

| File | SHA-256 |
| --- | --- |
| `c2-delivery-procedure-acl-candidate.sql` | `04c82994c7ac37c1af7ee3fcbfe47b0f67cc28c3b90bc1fa73a7e0784e6e1e6a` |
| `c2-block-new-procedure-acl-candidate.sql` | `462f2de49946800423f326af62d7cb32b88ee1422d22b6cced7dd392f16719f8` |
| `c2-block-new-procedure-core-candidate.sql` | `cd33a1d2b7627d4a2dcbf633631dda2b0bab07ca97afc9483e5f956de4fa1dcc` |
| `c2-delivery-procedure-pg.spec.ts` | `d01db3f96586d73c8e807d5d36394214a0befa3a3822cf4aaf7afc42895e68ef` |
| `c2-owner-issuer-pg.spec.ts` | `46853699ca9e575289cd4883255fe51920a7b69207c69dff4b440cb3d3da2374` |
| `restore-checkpoint-authority-pg.spec.ts` | `0efb4de2106d869396f4a42145c9bda2834a7efebb6ed804aa8b6ba8d396a744` |

## Remaining

P7 actual acceptance and delivery custody, qualified issuer/listener, complete
independent restore fencing and post-snapshot terminal/ACK reconciliation,
full typecheck and integrated normal hook remain open. A2 is NOT_READY and B2
NOT_SIGNED. Claude has no new field or UI action from this slice. Candidate
files and this receipt remain uncommitted alongside existing shared WIP.
