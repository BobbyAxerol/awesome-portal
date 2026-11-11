# C2 STATUS delivery: role boundary — 2026-11-06

**UNMOUNTED TEST-ONLY candidate.** Base `docs/research-loop-plan@2faa8968f`
and shared uncommitted work. No live DB, runtime, Edge, command, frontend or
production grant was changed. This is not qualification of production roles.

## Findings and repair

After adding STATUS context/sequence to delivery, the restricted delivery
procedure used the public STATUS context-link and recipient-ACK tables but did
not classify those tables as part of its write-protected authority boundary.
A disposable test granted INSERT to the caller and demonstrated that the
procedure got as far as its unrelated binding fence rather than refusing the
unsafe caller. The test did **not** send or forge a real ACK. The candidate
now refuses caller write/ownership/trigger capabilities on either table,
including column-level privileges.

A second disposable counterexample used a `NOINHERIT` intermediary: the login
had no *effective* ACK INSERT privilege but could reach the role holding it.
The previous check again got as far as the binding fence. The candidate now
checks all roles reachable by `MEMBER`, including non-inherited roles, for
unsafe table/column and candidate-schema CREATE capabilities. This is a
conservative refusal: it is not a replacement for a separately qualified
role/migration design or proof against concurrent role/DDL administration.

## Verification

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  final **4/4 PASS**, exit 0, in one disposable PostgreSQL cell. Tests cover
  direct INSERT and column UPDATE on both tables, a reachable non-inherited
  ACK-INSERT role (including an actual `SET ROLE` into it), restricted writer/legacy rows, serialized delivery/revoke,
  and `UNKNOWN` of the same original. Synthetic identities and loopback HTTP
  do not prove real Edge ACK or a production HTTP custody composition.
- Before the first repair, **3/4 PASS, 1 FAIL**, exit 1: expected
  `C2_DELIVERY_PROC_UNSAFE_CALLER`, got `C2_DELIVERY_BINDING_OR_FENCE_INVALID`
  after granting direct INSERT. Before the second repair, the non-inherited
  role demonstrated the same failure (**3/4, 1 FAIL**). The direct-grant
  intermediate retake passed 4/4 but did not yet cover that second issue.
- Script configured limit: 2 CPU / 1.5 GiB; actual peak not measured. Script
  cleanup completed and read-only checks found no `elp2-restore-rls-` test
  container or network. No normal hook or full integration gate was run.

## WIP source pins

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-delivery-procedure-acl-candidate.sql` | `6cd862d743cdc2c092a8de085d1f6587c6ce967dbd29222fe651c54bf638fa77` |
| `apps/control-api/test/c2-delivery-procedure-pg.spec.ts` | `16a43feac647ca42e20b2cab1742272c8ec8f024117f201d4d8a4e60c3918740` |
| `apps/control-api/src/execution-v2/c2-status-delivery-sequence-candidate.sql` | `6b75d5cefe634f1c1f16a7f9b4e47fbfc0c1535c357e7b051b2840bb5610be9e` |

These supersede the prior test-file pin in
[STATUS delivery sequence](CORE_C2_STATUS_DELIVERY_SEQUENCE_20261106.md); the
prior receipt remains a snapshot of that earlier test. Core must still wire
authority and HTTP custody, qualify exact production role/DDL controls and
recovery, and verify original and ACK through Edge. Keep the candidate
unmounted and restore fail-closed until then. No frontend field/action.
