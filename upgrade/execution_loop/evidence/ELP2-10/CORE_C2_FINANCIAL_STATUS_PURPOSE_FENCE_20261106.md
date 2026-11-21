# C2 financial original versus STATUS terminal and ACK — 2026-11-06

**SOURCE/TEST WIP ONLY.** Committed base `docs/research-loop-plan@2faa8968fddb`;
the two changed code/test paths below are part of a shared uncommitted tree.
This is neither an Edge acceptance nor a mounted or commissioned issuer.

## Reproduction and repair

The unmounted durable financial candidate marks a lease with its exact
financial context digest. In a disposable two-PG cell the test exercised an
actual candidate issuer, synthetic P7/owner, independent candidate custody,
and signed synthetic source ENTER and COMMITTED terminal for such a lease.
Before this repair, the generic `canReplaceResolvedIssue` returned `true` for
that financial lease and `acknowledgeCommandStatusIssue` inserted a synthetic
STATUS ACK for it, despite the original being financial, not STATUS. Both
helpers checked actor/workspace/request/terminal but omitted the purpose marker.

Both Core helpers now reject a lease whose `c2_financial_context_digest` is
present, inside the authority-locked transaction and before recording an ACK.
Existing unmarked STATUS and legacy behavior is retained; a positive synthetic
STATUS terminal and idempotent ACK are covered by the same full PG suite.
The new regression confirms both cross-purpose calls refuse and no STATUS ACK
row is created. The source terminal remains settled; this change does not block
RESOLVE after revoke or create an ACK on behalf of Edge.

This is a narrow marker fence: it does **not** classify an unmarked legacy or
unmounted financial lease, add an authenticated financial ACK, authenticate
the HTTP caller, establish independent owner/source authority, fence an old
process or complete restore. Neither method may be treated as a financial
successor proof. Financial parent registration, multi-delivery completion and
ACK remain process-local/unimplemented; the C2 adapter remains unmounted.

## Verification

- Before repair, `bash scripts/test-elp2-c2-p7-pg.sh owner-intent` exited **1**:
  the new assertion observed both cross-purpose calls fulfilled. The whole
  file reported 4 PASS/5 FAIL: after the first test aborted early, four later
  stateful scenarios also failed against its incomplete test setup. This is a
  test-cell counterexample, not a claim about a deployed production exploit.
- After repair, the same disposable two-PG suite exited **0, 9/9 PASS**,
  including the cross-purpose negative and existing synthetic STATUS positive.
- `npm test -- test/financial-source-assertion.spec.ts
  test/command-source-assertion.spec.ts`: **143/143 PASS**, exit 0. Tests use
  mocks/synthetic inputs; counts overlap the PG suite and are not connected
  acceptance.
- Focused strict source typecheck of `current-human-candidate.ts` passed with
  a 768 MiB Node heap. A source-plus-large-PG-test typecheck attempted first
  exited **134** at that heap limit (V8 out of memory); it is not a PASS and
  the test-inclusive/full candidate typecheck remains to be run at the final
  resource-qualified gate. Vitest did transform and execute the PG test.
- The script's disposable `elp2-c2-p7-*` containers and network were absent
  in a subsequent read-only Docker listing. No core-dump file was found in the
  Control API directory. Actual peak resources were **not measured**.

| Working path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `1cff84dbd05cbdace03dedbff948a0415984964db98f19cf19874d7a0e2bd90e` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `970407fa5fe17caa8eced406001ad32075db1d46c57c44c58eb7e1afda0c25ef` |

Next: implement authenticated financial completion/terminal and durable parent
sequence under qualified custody and current authority; then prove restart,
old-holder fencing and genuine source/Edge ACK. Separately complete independent
P7 provenance and V2 anti-rollback. No UI/contract change or Claude action in
this slice. Rollback is to leave the candidate unmounted and retain fail-closed
runtime; no production/dev/main, runtime, credential or Edge resource changed.
