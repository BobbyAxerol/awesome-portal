# P7 separate owner-auth attestation candidate — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** `docs/research-loop-plan` committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; this change is in the shared
uncommitted WIP, not in that commit, an installed image, schema or runtime.
Issuer remains hard-fenced. A2 is not READY and B2 has not been signed.

## Change and threat boundary

The unmounted confirmation signer now refuses to call the review writer
unless a separately pinned Ed25519 owner-auth authority signs a current,
strict/canonical attestation for the exact owner, session/generation,
workspace, cycle, B1, confirmation digest and idempotency-key digest. It
rechecks time and claims after taking the candidate locks and after witness
retention. Key reuse between owner-auth and witness signer is rejected.
The unmounted HTTP candidate takes a canonical base64url attestation and
continues to require session, origin, CSRF and no-store. Attestations rejected
at the initial check do not enter the review writer. If a later recheck fails,
the preparation may already be retained; it is not authorization and the
same original/idempotency must be used for a retry, not a replacement intent.
No new grant, publication, Live or source action is enabled.

This closes only the **in-code actor-only admission** in this candidate. The
new attestation format is a Core candidate, not an Edge/TS contract or a real
owner-auth provider. Tests use synthetic keys in the same test process. They
do **not** establish independent human authentication, physical key custody,
trusted pin provisioning, process/role isolation or real owner acceptance.
The witness private key still lives in the candidate signer process; a party
controlling that process/key could bypass this method. An attestation is a
short-lived bearer and is bound to the confirmation and idempotency key, not a
pre-existing intent ID (the intent is created after confirmation); authoritative
anti-replay across restore requires independent custody and a recovery fence.
Clock trust, handling of lost responses, provider issuance/revocation and
operational least privilege must be qualified before this route can mount.
No frontend consumer change has been requested or approved.

## Tests and selected pins

- Focused attestation tests: **2/2 PASS**, synthetic exact binding, key,
  issuer/audience, time, malformed and replay negatives.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS**,
  exit 0, two disposable PostgreSQL clusters and synthetic owner/auth/source.
  Includes real isolated HTTP session/CSRF, forged attestation refusal,
  same-key refusal, no record on rejected request, same-key retry and revoke.
- The first strict focused typecheck exited 2 with four definite-assignment
  errors in the new verifier constructor. The constructor was corrected;
  the retake over verifier, signer and HTTP controller exited **0** with
  strict checking and the Fastify cookie types. No prior run is counted as a
  final pass; this is not the project-wide or test-inclusive typecheck.
- The first sandboxed Docker invocation failed before starting the test cell
  because sudo was disallowed; the explicitly escalated isolated runs above
  completed. The script's own trap removed its cell. Read-only rootful Docker
  checks found no container or network named `elp2-c2-p7`. No volumes removed.
- `git diff --check` and `scripts/execution-tracking-test.sh` passed. Full
  typecheck and normal hook were not run.

| Working-source input | SHA-256 |
| --- | --- |
| `c2-p7-owner-auth-attestation-candidate.ts` | `55fdfd8f286674689683e091aa9834b2f823c12c194b06b02eab25a8dd4ec0dc` |
| `c2-p7-owner-confirm-signer-candidate.ts` | `589b3a6ef5b2097c30e912f9a1c28faeaa6575bcd94c9ddeb74f2dc5ed3febcf` |
| `c2-p7-owner-confirm-signer-candidate.controller.ts` | `bcc74ea7994a2f9b00200ea755909e797407dc5753fb5827d0008631519b4666` |
| `c2-p7-owner-auth-attestation-candidate.spec.ts` | `f98adab4cf299816705aca2df420375811f33b6a37f97e4a93fc05c114b6d5f8` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `ca9be458935c0ee5a74b893569a4b6a26174aa8a4853d1a25a45ed873b431757` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Next and handoff

Core must establish the independently operated owner-auth and witness signing
boundary, qualify pin/key/role custody, and prove exact-original replay and
revocation across process failure and restore. Finish independent checkpoint,
old-holder/HTTP fencing and source terminal/ACK census. Edge remains the sole
external source coordination point; A2, B2, actual READ/STREAM, G2 and browser
acceptance remain open. This isolated result changes no production authority.
