# C2 P8 — public-key and unsigned B2 preflight

2026-11-05. Working branch `docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`. The files below are uncommitted
candidate source, not an image, installed configuration, A2, or runtime proof.
No B2 was signed or published. The immutable static bundle was not modified.

## Change

- Offline P8 validation checks bounded exact JWK bytes against an independently
  supplied SHA-256, strict public-only Ed25519 shape, canonical base64url,
  selected kid and SPKI hash. It rejects private/extra fields, ambiguous JSON,
  issuer key/kid reuse and source-key reuse. The caller must authenticate and
  independently select the pins: matching self-supplied bytes proves nothing
  about ownership or authority.
- An additional offline preparation entry point checks those public bytes
  before binding the selected SPKI into the existing B2 preview plan. The
  original preparation path remains available and **does not** perform the
  added check. Neither path reserves, signs, publishes or permits release.
- A public-only signature comparison checks exact payload bytes and signature
  using the selected key. A cryptographically valid signature alone is neither
  signer custody, original-receipt provenance, nor authority to publish.
- The Python canonicalization comparison now passes its synthetic fixture as
  a command argument with bounded execution: sandboxed `spawnSync` stdin
  remained open indefinitely. This keeps the same Python JSON comparison and
  does not put real publication or private input on a process command line.

## Verification and limits

- Six focused suites: **32 PASS, 3 SKIP**. Skips are the explicit real-input
  A1/B1 cases with paths not supplied to this run. Synthetic key/signature
  negatives and a preview-plan key-substitution refusal are included.
- Source-only strict TypeScript check for the new module and preflight: exit 0.
  This is not the full test-inclusive typecheck or normal hook.
- Before fixing the test harness, a grouped run was interrupted and a bounded
  retake timed out; neither is counted. A separate bounded run showed the Python
  stdin timeout. After the test-only correction, the six-suite run passed.
- The existing **public** candidate JWK's hash and metadata were read only:
  hash `0ad65ab92e0d64a62222b4a0e8980311dd51f0ea7fc7ee08246aebc2032576dc`,
  expected public-only fields and Ed25519 kid. No private key was read or used;
  the complete new validator was not exercised against all actual source and
  issuer pins. Candidate keys and selected pins are not commissioned evidence.

| Input | SHA-256 |
| --- | --- |
| `c2-p8-public-key.ts` | `08a46c907b8037f784bd40b16802097b37956af280f312f688a278ee42705307` |
| `c2-b2-publication-preflight.ts` | `5a29bf5b979633d5ef65b1a48b40bf0aae42e15a47c48fd108c413bff2cac38b` |
| `c2-p8-public-key.spec.ts` | `c7d2122bb0bd61aeccb1b14b38024229d4655a90d930531917c4425a02b4c58b` |
| `c2-b2-publication-preflight.spec.ts` | `f14a508a47dd57d1526c1a7f699c4a5cb2d2f8cecc747eb115d0b73a184c8c69` |
| `c2-b2-dry-run.spec.ts` | `af15ea5a979d7413595838b9fd5687f32d67b90f9df33b4bc916521988f50bab` |

## Remaining

Real signer custody and durable same-original, one-shot signing/recovery must
still be implemented and commissioned. A verified P7 acceptance/delegation,
installed issuer/listener/source registration, actual A2 and TS acceptance,
and applicable seal/release conditions remain prerequisites. Preserve B1 and
static bytes; **do not sign B2** until all requirements are met. Retake the
affected suites with actual independently pinned public inputs and review all
transitive dependencies on the final frozen candidate. No frontend contract
or consumer request changed.
