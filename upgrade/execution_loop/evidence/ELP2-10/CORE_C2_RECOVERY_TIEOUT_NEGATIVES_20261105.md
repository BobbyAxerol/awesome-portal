# C2 terminal tie-out negative coverage and P7 commissioning finding

2026-11-05 UTC. **SOURCE_ONLY. A2 and restore remain NOT_READY.**

## Recovery change

The retained-terminal comparison is now an explicit reusable function which
rechecks the base ACK/original comparison as well as the authenticated
independent event generation/hash, original/session/scope, terminal phase,
receipt digest and source-trust digest. An inconsistency is
`INDEPENDENT_TERMINAL_PROOF_MISMATCH`, not a terminal match or restore permit.
The orchestrator authenticates observations before passing them to the
comparator; the comparator by itself is not an authority provider.

Focused test results:

- `npm test -- test/restore-c2-original-recovery.spec.ts
  test/restore-c2-source-proof-vault.spec.ts`: **7/7 PASS**. Added negative
  vectors for wrong receipt, trust, generation/hash, lease/attempt, phase,
  source ACK, session revision and workspace.
- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS**, two
  disposable PostgreSQL clusters and pinned mTLS test peer. The synthetic peer
  does not prove a real Edge/TS ACK. Test containers and network self-cleaned.
- Focused strict TypeScript including the changed test, with project decorator
  options: exit 0. The first check exposed incomplete test object shapes;
  those shapes were completed and the corrected check passed. No full hook.

Pins (SHA-256, local WIP):

| File | SHA-256 |
| --- | --- |
| `src/execution-v2/restore-c2-original-recovery.ts` | `44aa1a9fca137113ad190f9e5b839cecdf0a89bc67237d4bdeb5820ed5a6c1cf` |
| `test/restore-c2-original-recovery.spec.ts` | `d9ebbb209a781d5f7c100ddf6cd64ad93c4246bbb904db9ca8ce5149a55cd126` |
| `test/restore-independent-custody-candidate-pg.spec.ts` | `de98a84c9a9d3ec53e36a7b2a80f905ba9f16a5148f327ab2190ed8668a4398d` |

## P7: do not commission based on an ACTIVE candidate registration

Review of `current-human-candidate.ts` `lockCurrentC2Registration` shows it
checks the candidate registration/scope, expiry, owner and revision, but does
not establish a real owner acceptance/delegation. The source writer in
`c2-p7-registration-writer-candidate.ts` explicitly returns
`RECORDED_NOT_AUTHORIZED`, and `c2-p7-acceptance.ts` currently persists
preparation records with `*_PREPARATION_NOT_AUTHORIZED`. Therefore none of
these records alone can authorize the issuer or establish P7. These paths are
unmounted; do not mount or claim A2 readiness merely because an isolated
issuer test succeeds. A commissioned issuer needs a separately qualified,
same-authority-fence owner acceptance and delegation, source registration/ACL,
current authenticated owner and step-up, plus the other A2 gates.

The verified static A2 partial must remain byte-identical. Listener/source
registration, authenticated P7, qualified P8, independent checkpoint/fence,
complete post-snapshot ACK census, real source acceptance and the final normal
hook still remain. B2 is unsigned. No runtime or shared DB was changed.
