# STATUS restored consume under issuance lock — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** Shared WIP on `docs/research-loop-plan`,
committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`; no installed image,
schema, gateway, source authority or real Edge ACK is asserted by this slice.

## Problem and change

The earlier [restored-link census](CORE_STATUS_RESTORED_LINK_CENSUS_20261105.md)
ran before the transaction consuming the local preparation. Its existing
transaction took the same authority lock as ISSUE, but used an inner join to
check outstanding custody and could drop a link with a missing lease. A writer
could therefore append a link after the optimistic census but before consume.
This was a candidate-source risk, not evidence of lost production data.

`PgCommandStatusPreparations.consume` now rechecks the full restored-link
census **after acquiring the same authority singleton lock used by ISSUE** and
before the consumption update, in one transaction. The general outstanding
query also treats a linked missing lease as unresolved. The caller supplies the
exact original, call, binding and actor from the existing context and maps the
locked recovery refusal to the existing delivery-not-completed response. It
does not mint a new original or ACK. Unissued contexts do not require a
non-empty restored census; they still use the missing-lease refusal.

## Validation

- Disposable PostgreSQL runner `bash scripts/test-elp2-restore-checkpoint-pg.sh`:
  **19/19 PASS**, including six STATUS census cases. The new concurrency case
  observes a consumer blocked on the authority lock, commits a second linked
  but absent lease while holding the lock, and confirms consume refuses with
  the preparation still unconsumed. A positive intact-chain case and the
  non-restored missing-lease refusal are also exercised. Links and ACKs use the
  real migrations 156/157; authority, preparation and lease fixtures are
  deliberately minimal and synthetic, not source acceptance or DR rehearsal.
- `npm test -- test/command-source-assertion.spec.ts`: **76/76 PASS** after
  adapting the mock to distinguish optimistic from locked census and testing
  the intervening mismatch. The first run was **75 PASS / 1 FAIL** because
  that mock did not yet model the new transaction query; it is not a pass.
- Focused strict TypeScript check of `command-status-preparations.ts` and the
  PG test with ES2022/CommonJS, `--skipLibCheck` and no emit: **exit 0**.
  This is not the full project compiler or normal hook.
- `git diff --check`: **exit 0**. Runner cleanup completed; no containers
  matched `elp2-ckpt-` afterward. Resource ceilings: two PG cells each
  0.4 CPU/320 MiB, test node 1.2 CPU/896 MiB; peak usage not measured.

| Working source | SHA-256 |
| --- | --- |
| `command-status-preparations.ts` | `86da77c528fc60ac17888c59378c5735d9e1c2c00333ac64d8fd75c64be287ee` |
| `command-source-assertion.ts` | `1f66f44215f9a50fac91ecb36512e64fab9e96a5e96c9bbf2aa89ffa140329f9` |
| `command-status-ack-census-pg.spec.ts` | `6302cadce7418b17a5b18dda2a808813fb1b73bb576a6fe97db8baf7b62f19c0` |
| `command-source-assertion.spec.ts` | `367693246de14aebf8d12ff66edb0a15e32fe3afd5a06b5fb1f9af5670e69d25` |
| `test-elp2-restore-checkpoint-pg.sh` | `f33df23fc66c316ac880662c9dac705eb6d0fe7f04cd5f90d3e77aeeedbd120a` |

## Still open

The lock serializes this path with writers that obey the same singleton
protocol; it is not a fence for an old process, privileged bypass, a restored
database clone or an upstream writer. It cannot establish that a wholly absent
link chain or missing suffix existed without independently retained checkpoint
and source/ACK evidence. Keep the V2 restore guard in place; complete independent
authority and source/terminal/ACK reconciliation, test the actual restart path
on the final candidate, and obtain an actual Edge ACK. Integrate/review the
shared WIP and run the full compiler and normal hook once on the final selection.
No frontend contract or UI action changed.
