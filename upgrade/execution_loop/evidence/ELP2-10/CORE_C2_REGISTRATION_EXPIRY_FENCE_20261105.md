# C2 registration expiry and current-revision fence — 2026-11-05

Status: **SOURCE CANDIDATE ONLY; NOT INSTALLED; A2 AND RECOVERY NOT READY.**
Baseline `2faa8968fddbde59b2e59525e334ba3d83886144` plus uncommitted work.

A C2 scope could remain `OPEN` after its underlying registration expired.
The candidate issuer now locks and validates the exact registration, current
global authority revision, active state and expiry; it caps the issued token at
the registration expiry and revalidates before return. The candidate DB guard
also rejects new INSERT/ENTER from legacy writers if the registration or
current authority is stale, expired, revoked or draining. It does not block a
source-authenticated terminal for an original already ENTERED.

These checks do **not** establish genuine P7 acceptance, source authority,
HTTP custody, an installed listener, independent recovery, or an Edge ACK.
The SQL file is disposable-only, not an applied migration. Older processes and
schema require a fenced, reviewed migration and rollback plan before use.

## Source pins

- `current-human-candidate.ts`: `86cc0fc022f3b2f3ed19e0ae8eff839ecf0691d851889bac9e67c5a61b71e69a`.
- `c2-block-new-fence-candidate.sql`: `a1834c592ff192394e978cd3cbf2bb7da878960d2c2cdc31bc78c81c82af7f63`.
- `c2-owner-issuer-pg.spec.ts`: `219c0ff17609da1b31237d6b3884d4c8fce0c1d26b72f32f0f3de0cb3697026f`.
- Test runner `scripts/test-elp2-restore-inventory-rls.sh`: `2639bd96cb0bad909aa36ed797cdc122fb8646ad288d498b64779c13b6654dde`.

## Evidence

- `... c2-owner`: **17/17**, exit 0 on the pins above, including real DB clock
  expiry, token deadline cap, stale legacy writer, post-ENTER settlement,
  revoke race, exact original and human-key rotation.
- `... restore-c2-fence`: **2/2**, exit 0 on the final SQL pin, on an isolated
  PostgreSQL cell. This is local generation-fence coverage, not physical
  old-holder fencing or cutover authorization.
- `... c2-delivery-procedure`: **3/3**, exit 0 before the final extra
  current-authority predicate was added; it is intermediate regression and
  must not be attributed to the final SQL hash.
- The first `c2-owner` retake before the final current-authority predicate was
  also 17/17; the later 17/17 above is the final-pin result. No full typecheck,
  normal hook, connected qualification, runtime activation or Git commit was
  run here. Containers are test-only and removed by the bounded runner.

Next: commission the real protected-owner P7/issuer/listener and source trust,
integrate HTTP delivery custody, and complete independent checkpoint/fencing
and source terminal/ACK reconciliation. B2 remains unsigned until genuine A2
acceptance and all required conditions.
