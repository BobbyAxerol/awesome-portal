# P7 owner-confirm signer candidate — 2026-11-05

**SOURCE ONLY; NOT COMMISSIONED AND NOT OWNER AUTHORITY.** Branch
`docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; this code and receipt remain in
the shared uncommitted WIP. No actual P7 acceptance, key, role, schema,
source, grant, image, listener or runtime was installed. The issuer stays
hard-fenced; A2 is not READY and B2 was not signed.

## Candidate and limitations

The candidate accepts an exact owner-confirm operation rather than arbitrary
caller-selected signing claims. It runs the preparation service, rechecks the
same linked intent, session, source and owner under database locks, signs the
exact server-selected claim, and retains the encrypted witness on the separate
test custody cluster. The result returns identifiers and a proof digest, not
the witness bytes. Same-original retries regenerate the same Ed25519 proof.
Revoked intent and incorrect actor/digest are refused. A separately defined
**unmounted** HTTP candidate applies the existing session, origin, CSRF,
idempotency and no-store controls before calling it.

This only exercises a possible composition. In particular the test signer
and the DB writer run in the same test process: it does **not** prove that the
signing key, owner authentication, pin provisioning or custody are independent
of a compromised database writer. A separately protected and commissioned
owner-confirmation/signing authority is still required; direct invocation of
the candidate with a fabricated actor is not an authenticated owner action.
No generic signer, synthetic session, source proof or fixture is authority.
The legacy no-P7 internal path and runtime hard fence remain as previously
disclosed; this candidate must not be used to open either.

## Checks and disposition

- First full isolated-PG attempt: **8/9**, exit 1. The new signer test used
  the same synthetic cycle as the pre-existing HTTP case, so the latter got
  `REGISTRATION_RECORDED_P7_NOT_CONFIRMED`; this was not accepted as a pass.
  Gave the test its own cycle and retook the entire file.
- Final `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**,
  exit 0, two disposable PostgreSQL clusters and synthetic owners, keys and
  source. Checks include signer idempotency across newly constructed signer
  objects, invalid actor/digest, encrypted witness recovery, same-original
  issuer use and revoke. HTTP checks exercise real session and CSRF guards,
  wrong origin, strict request shape, post-revoke refusal, no-store and no
  returned signature/token. A new signer object is not an OS process restart.
- Strict focused TypeScript check for signer and custody source: exit 0 before
  the subsequent controller addition. The first controller-inclusive check was
  **interrupted, exit 130**, after approximately three minutes; another
  contributor's TypeScript job was running concurrently. The next file-only
  check exited 2 because it did not load the Fastify cookie augmentation. A
  corrected focused retake including `--types @fastify/cookie` for signer,
  controller and issuer fence exited **0**. This is not a full-project check.
  `git diff --check`: exit 0.
- The harness removed its own test containers and network; read-only Docker
  inventory found no `elp2-c2-p7-` container/network after the test. Disk:
  `/home/bobby` filesystem 270 GiB free (57% used) at pre-test observation.
- Neither focused checks nor this receipt establish an integrated hook,
  full typecheck, real process crash/restart, Edge ACK, browser acceptance or
  a product restore/cutover. Earlier receipts must be impact-checked against
  changed test/source hashes before reuse.
- `bash scripts/execution-tracking-test.sh`: exit 0 after adding the Unified
  and sync links. The normal hook is deferred until a frozen integration SHA.

| Selection | SHA-256 |
| --- | --- |
| `c2-p7-owner-confirm-signer-candidate.ts` | `b7aae6df83cbd456fee69f7977ec70e606f5706a99aaec45e674462eddf6aac9` |
| `c2-p7-owner-confirm-signer-candidate.controller.ts` | `efa53a79af08bf147d55ac04609422b4efea04a8da69084d59fd6058740c4565` |
| `c2-p7-owner-witness-custody-candidate.ts` | `b227016b087796fe21b441eb8a7e8856f2f07df6db9eaaefab548ade617a78e6` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `0288a0cdea5279d4c9c0e81b6ca5f38c39b7cd01f2d9a207444ec6b915d64181` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Next and handoff

Core: establish and test the independent signer/owner-provenance boundary and
least-privilege role/key provisioning; wire only after qualification, preserving
fail-closed startup. Complete the independent recovery checkpoint, old-holder
and HTTP fencing, post-snapshot terminal/ACK tie-out and restore rehearsal.
P8/A2/B2, connected Edge acceptance, G2 and final integration remain open.
There is no published frontend contract or new Claude consumer request.

## Follow-up: original intent expiry fence

Review found that a correctly signed witness could advertise an expiry beyond
the original owner intent, and that the diagnostic lock check did not itself
refuse an expired intent if the source/session/step-up remained current. The
candidate now rejects both, and bounds the issuer's returned expiry by the
original intent. This does not commission the signer or open the issuer.

Retake after this change: the same two-PG file **9/9 PASS, exit 0**, including
a validly signed overlong witness and an expired historical intent. The latter
is simulated by disabling the immutable trigger **inside a transaction on the
disposable test DB**, changing a synthetic row and rolling back; no product
data or schema was touched. The final test-file SHA-256 is
`e417108984e5f9818dd74e71597d5945758f77a5741feef7d6684dfd03336185`, and
`c2-p7-issuer-fence-candidate.ts` is
`72a2f69d0578fcc059d479372dc146be604b8306748b0b37400397edf2b5a2f0`.
These supersede the earlier test selection for this receipt only. Both test
containers and network were absent after the retake; `git diff --check` passed.
The corrected focused controller-inclusive typecheck described above passed;
the full-project and integrated candidate checks remain open.
