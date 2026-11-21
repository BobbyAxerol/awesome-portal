# STATUS preparation consumption row fence — 2026-11-06

**SOURCE WIP / DISPOSABLE TEST ONLY.** This is not a frozen candidate, an
installed runtime, a real Edge ACK, a restore authorization or a phase PASS.
Checkout `docs/research-loop-plan@2faa8968fddb` contains shared uncommitted WIP.

## Finding and change

STATUS local consumption took the cooperative authority singleton lock but
did not lock the selected preparation itself before reading the linked
custody census. In a disposable PostgreSQL test, a second writer that did not
take that singleton lock changed the selected row while the consumer was
paused between its selection and census. That is an uncoordinated-writer or
corruption counterexample, not evidence of an installed production incident.

The transaction now locks the selected preparation `FOR UPDATE` through its
census and consumption. It also rejects an UPDATE reporting anything other
than one changed row, instead of reporting a successful local receipt when an
unexpected database trigger suppresses the write. This lock adds no new write
privilege for this existing consumer, which already updates the row. It does
not prevent a writer acting after commit, establish a qualified DB role, or
protect against privileged trigger/DDL bypass. Those remain separate gates.

## Verification

- Before the fix, the new real-PG concurrency test failed as intended:
  the competing UPDATE succeeded instead of waiting; 11 other census tests
  passed. The writer was rolled back in the test cleanup.
- After the fix, the same disposable census suite passed **13/13**, including
  the row-lock contention and a test-only trigger that suppresses UPDATE.
  The script allocated two disposable PG clusters; the census test itself
  used its own temporary database on one of them. It did not test a real Edge
  original, ACK or independent restore authority.
- The first local unit/transport run had **54 failures / 118 passes**: 53
  loopback listeners were denied by the sandbox (`EPERM`), and one STATUS unit
  mock omitted the UPDATE's `rowCount` newly required by the real DB check.
  After updating that mock and rerunning with loopback allowed, the three
  affected suites passed **172/172**. They are unit/loopback tests, not Edge
  qualification; earlier overlapping receipts are not additional coverage.
- Focused strict TypeScript for `command-status-preparations.ts`: exit 0.
  This is not a full-project typecheck or normal hook.
- The bounded script cleaned up its own containers/network; a read-only
  rootful Docker listing found no `elp2-ckpt-` containers afterwards. The
  configured aggregate limit was 2 CPU / 1536 MiB; actual peaks were not
  measured. No shared runtime, Edge, production database or UI was changed.

## Direct source pins

| Path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/command-status-preparations.ts` | `bf71848a132f77b3742f419b3546230d1701d0aa3e060325c9716cce4d02aeb6` |
| `apps/control-api/test/command-status-ack-census-pg.spec.ts` | `e1ddba5e9935d279e4ef4fddcf3c94dab2a27927bc22865c7ec3022778a54b24` |
| `apps/control-api/test/command-source-assertion.spec.ts` | `26159c1d29250f89b37e2e9ea119e15863101a2820cfd707d0b121c180f5cb7d` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `9e764073f09c456912e63ee99b49f990449229ce60fd9fca22815a3d57b44bfc` |

## Next work and handoff

Continue qualifying independent owner/writer authority, runtime-only HTTP
custody, old-holder and anti-rollback recovery fences; reconcile a genuine
terminal/ACK through Edge. Review and freeze the integrated candidate before
its affected migration/restore and normal-hook gates. This change adds no UI
contract and requests no frontend action. Rollback is to leave this WIP
uninstalled; no live schema or data was altered.
