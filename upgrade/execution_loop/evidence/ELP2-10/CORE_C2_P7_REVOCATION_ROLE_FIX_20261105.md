# P7 revoke trigger: bounded emergency role — 2026-11-05

**SOURCE ONLY.** Branch `docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; changes are uncommitted. No
runtime, real DB role, source, grant or frontend contract was changed.

## Defect and repair

The [earlier bound-lease candidate](CORE_C2_P7_BOUND_LEASE_DB_FENCE_20261105.md)
updated `authority.lease_epoch` after intent revoke. The independently
bounded emergency login used by the existing reduction candidate intentionally
has no UPDATE permission on that column, so the new trigger would make the
whole emergency revoke roll back. The earlier SQL hash is historical.

The trigger now updates the same singleton tuple with `drain_id=drain_id`,
using the permission already needed by the bounded role. This is a physical
tuple update, not a change to drain or the signed authority revision. The
existing P7 test demonstrates a REPEATABLE READ transaction with an older
snapshot receives `40001` on attempted ENTER after revoke commits.

## Checks and pins

- `scripts/test-elp2-restore-inventory-rls.sh c2-emergency`: **2/2 PASS** on a
  disposable PG using a real limited login. Direct registry, scope and
  `lease_epoch` writes are denied; same-intent emergency revoke still commits
  and the scoped state becomes BLOCK_NEW.
- `scripts/test-elp2-c2-p7-pg.sh owner-intent`: **6/6 PASS** on two disposable
  PG clusters after this change, including the stale-snapshot and
  exact-original post-revoke terminal tests. Identity/source are synthetic.
- Runner EXIT traps remove test containers and networks; subsequent named
  container check returned no matches. `git diff --check` passed.

| File | SHA-256 |
| --- | --- |
| `c2-p7-bound-lease-fence-candidate.sql` | `d1accc3e61ce536341b624a8f2741f9d713046cb33d5867248af19bdbf39fecf` |
| `c2-p7-emergency-reduction-candidate-pg.spec.ts` | `75caa25d939daf85cc127286beda4f929148fb98d6f2ee8d2555d32bf3123669` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `217df00a6a2ae43d9ce586bccea9ef9a1a7ca0b0a567755654870d571f717ff5` |
| `test-elp2-restore-inventory-rls.sh` | `4ab1ab6d37df81c27b5c2238b6f2b1c67d37b9722a3eff65bee220bc99e09089` |

## Still open

This proves only the bounded emergency revoke path, not a complete issuer
runtime role. The positive bound-lease trigger also performs row locks across
P7 records/registration; its runtime ownership, least-privilege grants and
resistance to unsafe role inheritance/trigger bypass need independent review
and restricted-login tests before commissioning. HTTP custody, genuine
P7/source acceptance, old-process deployment fencing and V2 recovery remain
open. Issuer stays fail-closed; no Edge/TS acceptance is asserted. There is no
new frontend field or consumer action.
