# P7 encrypted witness custody candidate — 2026-11-05

**SOURCE ONLY. NOT OWNER AUTHORITY, AN ISSUER ACTIVATION OR A RESTORE FENCE.**
On `docs/research-loop-plan` committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`,
the code and this receipt are uncommitted in the shared WIP. No product DB,
source, grant, signer, image or runtime has been installed or changed.

## What changed

The new custody candidate stores an **already independently signed** P7 owner
confirmation encrypted with AES-256-GCM, in a separately selected PostgreSQL
cluster. It checks both selected PostgreSQL system identifiers, refuses a
same-cluster selection, pins the signer's public-key hash and authenticates the
exact proof, claims and validity before storing or recovering it. Authenticated
encryption binds the ciphertext to custody ID, cluster IDs, signer, cycle,
intent, proof hash, expiry and vault key ID. The key is not stored in SQL.

The append-only SQL candidate prevents ordinary UPDATE, DELETE and TRUNCATE.
The same exact proof can be retained idempotently; a different original is not
substituted. A per-custody advisory transaction lock and explicit bounded
`maximum_witnesses` coordinate capacity across cooperating service instances.
Expired records are **not** silently deleted to make space. Retrieval returns
the proof only to internal composition; the issuer must still recheck current
owner, source, session, authority and revoke under the existing fence.

These are candidate controls, not evidence that separate clusters imply
independent control, that database owners cannot bypass triggers, or that an
operator has commissioned a least-privilege role. Advisory locks do not fence
an uncooperative privileged writer. Proof bytes remain sensitive; neither
plaintext nor keys belong in logs, chat or Git. The signer, vault key and pin
still require separately protected provisioning and rotation. This store is
not yet wired into the production issuance/owner-confirmation lifecycle.

## Checks on this selection

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  using two disposable PG clusters, synthetic owners and generated keys. The
  test retained and recovered the same signed witness in a newly constructed
  store and used it for the same assertion/lease; tested identical retry,
  wrong owner, wrong vault key, mismatched source ID, expired proof, immutable
  update and same-cluster refusal. Two instances competing for a one-record
  capacity admitted exactly one record. This is not a real owner confirmation,
  crash/restart of a commissioned process, external ACK, or Edge acceptance.
- Strict focused TypeScript check for the new source: exit 0; an earlier check
  exposed definite-assignment errors and was corrected before the final run.
- `git diff --check`: exit 0. No full typecheck or normal hook was run.
- The disposable harness removes its own test containers and network. A
  separate cluster does not by itself establish a separate failure domain.

| File | SHA-256 |
| --- | --- |
| `c2-p7-owner-witness-custody-candidate.ts` | `58f8ba3b4f9f39ed120108f978a445f6aa86ccb0afda1c9ddd3b684f2937079e` |
| `c2-p7-owner-witness-custody-candidate.sql` | `a0263384d6c4a64aa971ecf834bd49accde892ae0aade04f3f9aecfcc5c6ec57` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `99dd90e212ee4201d05f20805103c5d1e9e999e8a7343af36018a0f7fa6aa817` |
| `c2-p7-owner-confirmation-proof.ts` | `4c338acf93333436f6e2c4dda991faf04118fb3630e2ee9fe7501a2a33837083` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

The test file changed after the preceding issuer-wiring receipt; re-evaluate
all transitive inputs on the final candidate rather than treating either
historical result as a full-candidate pass.

## Next and handoff

Core must implement the authenticated owner-confirmation signer and its
independent trust/role boundary, wire durable witness recovery to the exact
original, qualify revoke and signer/vault rotation, and preserve the startup
fence until those conditions are met. The independent recovery checkpoint,
old-holder/source/HTTP fences, post-snapshot terminal/ACK census, A2/P8,
source connection and integrated gate remain open. There is no frontend
contract or Claude consumer action in this slice.
