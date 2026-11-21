# P7 signed owner-confirmation verification candidate — 2026-11-05 UTC

**SOURCE ONLY, UNCOMMISSIONED; ISSUER AND RESTORE REMAIN FENCED.** Checkout
`docs/research-loop-plan` committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`;
changes remain uncommitted alongside existing WIP. No runtime, product DB,
real owner confirmation, production authority, Edge grant, or Live state changed.

## Change and boundary

An independently pinned Ed25519 public-key verifier checks canonical signed
owner-confirmation bytes against exact locked P7 facts: review cycle and digest,
intent, registration, source and B1 digests, workspace, owner, session and
generation, authority revision, acceptance/delegation digests, and validity.
It rejects private-key input, changed claims, wrong key, noncanonical encoding,
not-yet-valid or expired proof. A candidate `checkAuthenticatedLocked` first
performs the existing owner/source/revocation/row checks and then validates the
proof against those same locked rows. The v2 fence binding includes the proof
and public-key hash; it bounds the result's expiry by the signed proof.

This is **not** a complete authorization solution. The configured public key
must be provisioned independently, and a separate protected signer must only
sign after a real authenticated, CSRF-protected owner confirmation against the
same facts. A caller-selected key, a generic signing endpoint, or a proof signed
by the DB writer does not establish that separation. Durable witness custody,
issuer/resume/ENTER/HTTP wiring, writer/role isolation, revocation, key
rotation and recovery under the same authority fences are not yet delivered.
The existing `checkLocked` remains diagnostic and can still accept the forged
database-only preparation shown in the previous receipt. In particular,
`CurrentHumanCandidate` has **not** been switched to the new method. Do not
mount or commission it, and do not call the vulnerability fixed on runtime.

## Focused evidence

- `npm test -- test/c2-p7-owner-confirmation-proof.spec.ts`: **4/4 PASS**,
  isolated generated keys and synthetic claims.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, two
  disposable PostgreSQL clusters. The synthetic valid witness passes the new
  method; a previously signed witness cannot be moved to a fabricated cycle,
  intent and record, even when the test writer supplies a forged creation
  timestamp. The old diagnostic path still reproduces the earlier unsafe
  behavior. The harness tears down its own cell.
- Strict `tsc --noEmit` for the two changed source modules: exit 0. This is
  not a complete project typecheck or normal hook. An earlier PG attempt
  rejected the forged record at the timestamp guard before signature check;
  the final test forges that timestamp and was rerun on the final source.

| Input | SHA-256 |
| --- | --- |
| `c2-p7-owner-confirmation-proof.ts` | `4c338acf93333436f6e2c4dda991faf04118fb3630e2ee9fe7501a2a33837083` |
| `c2-p7-issuer-fence-candidate.ts` | `6ad20cbd8899cc0b11b32dc41f8b9e30ee4be0d0bd18961e6f53d56628b65ebc` |
| `c2-p7-owner-confirmation-proof.spec.ts` | `a4578df1f62d1cd001dfdd3ea95bc8ee96b9f8107035bee2a101a76a0c88b1e7` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `8e79724b0948ec1f65658867a981b01403281dd0c416baf18e9741fd1173055a` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Next action / consumer

Core must implement and qualify the authenticated signer and durable witness,
pin its authority outside caller input, require the authenticated check in all
issuance and same-original resume/delivery paths, and retake revoke/restart and
forged-writer tests before runtime activation. Recovery V2, A2/B2, actual Edge
ACK and connected qualification remain separate gates. No frontend contract
changed; Claude has no new consumer action from this candidate.
