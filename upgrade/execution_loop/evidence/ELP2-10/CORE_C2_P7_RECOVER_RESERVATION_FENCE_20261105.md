# P7 witness recovery reservation fence — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** Shared uncommitted WIP on
`docs/research-loop-plan`, committed base `2faa8968fddbde59b2e59525e334ba3d83886144`.
No real owner confirmation, source registration, grant, issuer, listener,
runtime, credential or source database was installed or changed.

## Gap and correction

`reserveIntent` already rejected a legacy witness without its authenticated
request-bound reservation, but `recover` and `retainedIntent` separately read
the encrypted witness without checking that reservation. A caller of these
methods could therefore obtain or locate a legacy witness even though the
normal reservation path explicitly refused its provenance. This was an
unmounted candidate path, not a finding of a real forged owner approval.

Both witness-read paths now require exactly one reservation under the same
authority transaction, verify its keyed MAC and pinned signer, and compare
its intent with the witness. Missing, altered or mismatched reservation fails
closed. The already-reserved signer path still recovers the same witness and
continues to check its full signed owner claims. No new original or proof is
invented. `retain` remains capable of storing a signed legacy witness without a
reservation; its return is explicitly `RETAINED_NOT_AUTHORIZED` and both
retrieval paths now refuse it. Existing orphan records require independent
reconciliation, not silent upgrade. Writer admission, an independently
commissioned owner-auth provider and a real anti-rollback fence remain open.

## Validation

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS**,
  two disposable PostgreSQL clusters with test-only identities, keys and
  source. Tests reject the orphan witness in both readers, reject a tampered
  reservation in both readers, and retain exact proof recovery with a valid
  reservation; wrong owner still fails verification. Existing review,
  issuer-fence, revoke, isolated HTTP/session/CSRF and exact-original cases
  were retested. Synthetic signing is not independent human authentication.
- The first run returned **6 PASS / 3 FAIL**: the first test still referred
  to an old local `recoveredProof` variable after its legacy path became a
  rejection, causing later shared-fixture failures. The test now compares
  that fixture's original bytes explicitly; the reserved proof recovery is
  separately exercised. Only the final retake is counted as PASS.
- Focused strict source TypeScript check: **exit 0**. `git diff --check`:
  **exit 0**. Full compiler, normal hook, OS restart, real owner/Edge and
  full recovery qualification were not run.
- Cell cleanup trap completed; Docker readback found no matching P7 test
  containers. Peak CPU/memory were not measured.

| Input | SHA-256 |
| --- | --- |
| `c2-p7-owner-witness-custody-candidate.ts` | `daf320fee98e10445ea19fb106bbfd36db23b76361c1dcefb5da9ffc3e394b8c` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `9d6efb40da6bee27b1ba93bd6837525437fd1790bf3ce2aa9946e913b4901214` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Remaining

Commission the separately protected owner-auth provider and signer, qualify
the DB/role/key boundaries and current session/step-up, enforce writer
admission and old-holder/restore fencing, and retest the actual original
across process/DB failure. P7 issuer remains hard-fenced; A2 is not READY and
B2 remains unsigned. Complete external source/ACK, integrated-candidate
hook, migration/restore, G2 and browser separately. No frontend contract or
Claude action is added.
