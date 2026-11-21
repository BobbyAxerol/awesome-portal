# Recovery V2 — admission during timed-out checkpoint reads

**SOURCE WIP ONLY; not mounted or a restore permit.** Checkout
`docs/research-loop-plan@2faa8968fddb` has shared uncommitted changes. No
runtime, Edge, source authority, credential, migration or frontend was changed.

## Finding and change

The candidate independent-floor reader previously raced its callback against a
deadline but permitted a new request immediately after the deadline even if the
old callback ignored cancellation and was still running. The new regression
reproduced this: before the change, the disposable PostgreSQL witness suite
returned **4 PASS / 1 FAIL** because the second floor request succeeded where
the new test expected `V2_CHECKPOINT_INDEPENDENT_FLOOR_BUSY`. That first failure
did not reach the analogous witness assertion, so it is not claimed as a
separately observed pre-fix witness failure.

The unmounted floor and fresh-witness readers now track their actual callback
and nested read promises. A single instance rejects a concurrent attempt, and
keeps rejecting after timeout until the underlying work settles. Each reader
can be used again after settlement. A callback that never settles therefore
leaves that instance fail-closed; timeout does not pretend the work stopped.

This is a **per-instance**, in-process bound, not a cross-process admission
limit, cancellation guarantee, independent monotonic service, old-holder
fence, authenticated source/ACK or atomic restore cutover. The test exercises
stalled callbacks; it does not separately inject a stalled underlying DB read.
The synthetic floor/witness and remaining conditions are described in
[the prior receipt](CORE_C2_RECOVERY_INDEPENDENT_FLOOR_CANDIDATE_20261106.md).
In particular the old fail-closed V2 restore guard must remain in place.

## Verification and resource cleanup

- Focused strict `tsc --noEmit` for the witness test and its imports, with a
  768 MiB Node old-space limit: **PASS**, exit 0. This is not a full project
  typecheck or normal hook.
- `bash scripts/test-elp2-restore-checkpoint-pg.sh witness`: **5/5 PASS**,
  exit 0, on three disposable PostgreSQL clusters and synthetic keys. The
  added case checks BUSY while active, BUSY after timeout when cancellation is
  ignored, and reuse after each callback settles for both readers. The suite
  includes the pre-existing rollback counterexample; this is not an actual
  restore or a connected source receipt.
- The test script configures an aggregate ceiling of 2 CPU / 1.5 GiB and
  cleans its own disposable containers/network with an exit trap. Read-only
  Docker checks found no `elp2-ckpt-` containers or networks afterwards.
  Actual peak resource usage was not measured; `/home/bobby` had 249 GiB free
  immediately after the test.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-fresh-witness.ts` | `7c3d517930fd71a741937e1871a69ffa346a676c19fb477fea01a7ea0315c67c` |
| `apps/control-api/src/execution-v2/restore-checkpoint-independent-floor.ts` | `d64096fde2deebd591569eefec6bdcc8fdc8f1da412fbfa455bd026d186851e2` |
| `apps/control-api/test/restore-checkpoint-witness-producer-pg.spec.ts` | `bf2c94d95f96dfbd3812dfb199b63ef3e3addb9f07deef42900c8eedc46c66ca` |

These direct hashes supersede the corresponding hashes in the previous receipt;
they do not pin a complete candidate, image, runtime or dependency tree.

## Next / consumer / rollback

Core must still qualify independently held monotonic authority and key custody,
fence all old holders and runtime egress, reconcile real post-snapshot
terminals and ACKs, and rehearse restore and rollback on the integrated
candidate. A2/P7 and connected Edge acceptance remain open. There is no public
contract change or new frontend action; Claude can continue its existing
consumer work. Rollback is to leave these candidates unmounted and retain the
existing V2 restore refusal; do not remove shared evidence or custody records.
