# P7 confirmation source and key binding — 2026-11-06

**SOURCE WIP ONLY. Not owner acceptance, independent operator/key custody,
runtime installation, A2 readiness or a connected receipt.** Checkout
`docs/research-loop-plan` at committed HEAD `2faa8968fddb`, with shared WIP.

## Finding and change

The unmounted owner-confirm signer checked that the review used the same pool
and workspace, but did not require the same source verifier, source-proof bytes,
cycle, B1 and registration key that the owner review had pinned. Separately,
it checked only that the owner-auth and witness keys differed; a source
attestation or registered P8 key could be reused as an ostensibly independent
owner-auth or witness key. No runtime exploit or forged owner acceptance was
observed; the issuer remains fenced.

The signer now requires the exact reviewed composition and a source returned
by the registered-source factory. Factory-private metadata binds the attestor
and P8 fingerprints to that exact verifier, rather than trusting a caller's
method or asserted pin. The owner-auth and witness fingerprints must each
differ from one another, the registered source attestor and P8. These are
necessary checks, not proof that different private keys are held by different
operators or that an owner actually authenticated. Review/issuer startup
fences remain in place. No API, UI, database, key, service or runtime changed.

## Verification

- Registered-source unit suite: **6/6 PASS**, including owner/witness collision
  with attestor/P8, identical keys and imitation verifier objects.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0 on
  two disposable PostgreSQL clusters. The integrated owner-intent scenario
  rejects attestor-as-owner, a different verifier for the same registration,
  a substituted proof, a forged wrapper and a different cycle; the valid
  test-only path and same-original retry still work. Identities and evidence
  are synthetic; this is not real P7 acceptance.
- The first test invocation was denied by the sandbox's Docker/sudo policy;
  it did not start the cell and is not counted. The authorized bounded retake
  above ran the script's exact-name container/network cleanup trap.
- Focused strict source TypeScript check for the three changed source roots:
  exit 0. This is not the full project/test typecheck or normal hook.
- `git diff --check` and `scripts/execution-tracking-test.sh`: exit 0 after
  this receipt. A read-only Docker listing found no `elp2-c2-p7-` test
  containers after cleanup. Resource peaks were not measured. No persistent
  test database, credential or runtime was created.

| WIP input | SHA-256 |
| --- | --- |
| `c2-p7-owner-confirm-signer-candidate.ts` | `ccb01490845282273f6b685052dbd35d10f30059834762c1511deb9f620c20b1` |
| `c2-p7-registered-source-candidate.ts` | `97639b9791e648a8dfb2298136902e1d01995de192c0251b3239ed0616977a8b` |
| `c2-p7-review-candidate.service.ts` | `b8c4164543a2ca25b7061d56d2097da3a81a0006f887264a5ba961cdf15a8e02` |
| `c2-p7-registered-source-candidate.spec.ts` | `e0477943c57c4506f5ac0277880059b9c5664fe5c63c90e707a88bd907875610` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `515f054f5be3618c65ced884dc2d471d0bd391dcdd0cb2d3bb5b3261c84e4ddd` |

## Remaining work / rollback

Qualify independently operated current-human authentication and key custody,
register and test the genuine Research source, complete the runtime-only
custody/HTTP path and independent V2 recovery; then review/freeze the entire
candidate and run impacted gates and the normal hook. Edge remains the source
and genuine ACK coordination point. A2 remains NOT_READY and B2 NOT_SIGNED;
no new frontend contract or consumer action. Rollback is to keep P7 and the
issuer unmounted/fail-closed; do not substitute a generic source verifier.
