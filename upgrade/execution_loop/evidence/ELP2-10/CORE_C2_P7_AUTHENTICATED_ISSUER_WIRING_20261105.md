# P7 authenticated issuer candidate wiring — 2026-11-05

**SOURCE ONLY, NOT COMMISSIONED.** Branch `docs/research-loop-plan`, committed
HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`; files are uncommitted in the
existing shared WIP. No issuer, schema, source grant, Edge connection, Live or
runtime was installed. This is not a real owner's P7 acceptance or a solution
to the V2 recovery barrier.

## Change

When a P7 candidate is supplied, current-human issuance, same-original resume,
post-sign revalidation and ENTER now use `checkAuthenticatedLocked`, instead
of the previously forgeable diagnostic `checkLocked`. The exact verifier key
SPKI hash must match the separately supplied configuration pin, not a key
selected by the caller's fence. The pin is copied into immutable candidate
configuration; method implementations are captured and replacements rejected.
The witness expiry bounds the issued assertion. The private issuer composition
passes through the selected pin. A C2 installation selecting the delivery
schema refuses issue, resume and revalidation without P7.

Legacy unmounted constructors without `c2_delivery_schema_required` still
allow their older internal no-P7 correctness path. This is **not safe authority
for a live C2 issuer**, and this change does not make it one. The selected
private issuer composition continues to hard-refuse issue/resume irrespective
of the candidate pin. The diagnostic `checkLocked` deliberately remains for
the forged-writer negative test; it must never be used as proof of owner
consent. Terminal settlement for an already-entered original is unchanged.

An independent pin in configuration is necessary but not sufficient: the
real signer must enforce the authenticated owner confirmation and be protected
from the same DB writer, and provision/rotation and durable witness custody
must be independently qualified. Caller-controlled config, a generic signer or
a synthetic test witness does not establish this. HTTP delivery/old-holder
fences, role/ACL, source authority and recovery must also be resolved before
enabling any issuer.

## Checks on these local source bytes

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  two disposable PostgreSQL clusters. The test uses generated keys and
  synthetic owners; it exercises a signed P7, missing P7, missing proof,
  caller-selected wrong key, input-config mutation, verifier-method replacement,
  tampered proof, same-lease same-token recovery using a new service object,
  revoke and settlement of the previously entered synthetic original. It also
  retains the diagnostic forged-review counterexample. The harness removed its
  own test containers/network.
- `npm test -- test/c2-p7-owner-confirmation-proof.spec.ts
  test/c2-human-issuer-composition.spec.ts`: **20/20 PASS**.
- Focused strict `tsc --noEmit` for `current-human-candidate.ts`,
  `c2-p7-issuer-fence-candidate.ts` and `c2-human-issuer-composition.ts`:
  exit 0. `git diff --check`: exit 0. These are not full-project typecheck,
  normal hook, actual Edge ACK or qualification on an installed image.

| File | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `19e96c787b99542e7e3ae03031eb045063c989460034898dc73eb65cccb6a6c8` |
| `c2-human-issuer-composition.ts` | `86f25464a31fa86bceb656b85ef96f6baa147fdc4d1d17028f03339e7b78a4e7` |
| `c2-p7-issuer-fence-candidate.ts` | `0aaefafaed53c8839ad936df100dfa9482e4ff74b4f24cb31fc6c32108c1df39` |
| `c2-p7-owner-confirmation-proof.ts` | `4c338acf93333436f6e2c4dda991faf04118fb3630e2ee9fe7501a2a33837083` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `91de151a054adcdfc78a63313c75f7aa1eb1c5874fb42430fb32dd631600e8cb` |
| `c2-human-issuer-composition.spec.ts` | `3e5b1536933ce63e559a3d8ce9439a8e4e233e5af2387b6fa0dc5eb430719503` |
| `c2-p7-owner-confirmation-proof.spec.ts` | `a4578df1f62d1cd001dfdd3ea95bc8ee96b9f8107035bee2a101a76a0c88b1e7` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Next and Claude handoff

Core: deliver an authenticated owner-confirmation signer, independent pin
provisioning and durable same-original witness; qualify restricted DB roles,
revocation/HTTP and restart boundaries. Complete independent recovery fencing,
terminal/ACK reconciliation, A2/P8 and final candidate review separately.
Retake affected tests if these inputs change. No frontend contract changed and
Claude has no new consumer action for this candidate. ELP2-10/11, full A2,
B2 publication and connected/browser/G2 gates remain open.
