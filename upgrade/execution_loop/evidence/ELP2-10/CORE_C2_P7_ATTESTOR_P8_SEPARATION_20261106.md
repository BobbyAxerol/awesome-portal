# P7 registered source — source-attestor / P8 separation

**SOURCE WIP ONLY; unmounted.** No key, grant, runtime, database or frontend
was changed. The committed baseline is `docs/research-loop-plan@2faa8968fddb`
plus shared uncommitted work. This is not real owner acceptance, installed
trust, A2 readiness, a B2 signature or an Edge/TS connected receipt.

## Finding and repair

The P8 public-key preflight already refuses reuse of the source key, but the
P7 registered-source factory separately accepted a registration whose P8 SPKI
fingerprint was identical to its independently pinned source-attestation key.
Its later owner/witness check made both of those keys distinct from the two
fingerprints, but did not compare source-attestor with P8. If a composition
omitted P8 preflight, this candidate boundary alone therefore did not enforce
the separation. No real collision or deployed exploit was observed.

`createC2P7RegisteredSourceCandidate` now fails closed when those two
fingerprints match, before constructing a verifier. The pinned key is still
verified against the actual public key as before. This is a necessary
separation check, not evidence of independently operated private keys,
authorized owners, real source lineage, or a substitute for P8 preflight.
The existing issuer/review startup fences remain in force.

## Verification and cleanup

- Added a direct factory negative test. Before the change its invocation
  produced **1 FAIL / 6 PASS**: the factory did not throw for same-key input.
- After the change, the registered-source, P8 and owner-auth unit files ran
  together: **12 PASS / 1 SKIP**, exit 0. The skipped case requires explicitly
  provided Research public JWK pins; it is not a real-key acceptance.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  using two disposable PostgreSQL clusters and synthetic identities/keys.
  It includes the same-original, restricted-role, revocation and HTTP cases;
  it does not prove independently operated key custody or Edge acceptance.
- Focused strict `tsc --noEmit` for the changed source and its imports exited
  0. This is not test-inclusive project typecheck or the normal integration
  hook. The harness cleaned its own test cell; read-only Docker inspection
  found no `elp2-c2-p7-` containers. Resource peaks were not measured.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-p7-registered-source-candidate.ts` | `d2b3040c45cc12a0f74feaa1e9dc14f7d3a04e9b0b7b01191e652b2a38af0ad1` |
| `apps/control-api/test/c2-p7-registered-source-candidate.spec.ts` | `5bea2373a7922d2afb424cc693e275a7e4efc5fae86e35d9ee3d2dea9caa7a18` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `59834af558578f50b06797f8a7e4157ca923e09ea6c71a6b147d83b66b02044e` |

## Remaining / rollback

P7 still requires qualified independent owner authentication and actual key
custody, trusted roles, registered source and runtime composition. Recovery V2
still requires independent monotonic authority, old-holder fencing and genuine
post-snapshot terminal/ACK reconciliation. Review and freeze the full WIP,
then run affected gates and the normal hook. Edge remains the sole upstream
coordination point. No new frontend contract or action is requested. Rollback
is to leave the candidate unmounted and fail closed, not to bypass P8 preflight.
