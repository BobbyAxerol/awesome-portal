# C2 P7 composed preparation — disposable PostgreSQL, 2026-11-05

Status: **TEST-ONLY, UNMOUNTED; NO OWNER ACCEPTANCE OR DELEGATION CLAIMED**.
Baseline `2faa8968fddbde59b2e59525e334ba3d83886144` plus uncommitted candidate.

The test now connects the actual candidate review service, signed-source codec,
owner-intent writer/verifier, registration writer and P7 record writer in one
dedicated PostgreSQL cell. It exercises review, explicit confirmation, active
registry record, immutable P7 preparation, wrong owner and bad confirmation.
All identities, keys, sessions, step-ups and signatures are synthetic; the B1
public input is hash-checked, not treated as an approval. The existing
owner-intent replay/tamper and revoke/verification lock race also ran.

`bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **3/3**, exit 0. The
bounded runner creates only its own internal network and disposable containers
and removes them in its exit trap. This is not browser, HTTP, runtime ACL,
actual attestation provenance, connected Edge or a source-grant receipt.

## Pins

- Test `c2-p7-owner-intent-candidate-pg.spec.ts`: `2001dc2a69504b7e4e902b9a7e812adf741cb5fcd15aef65fff2082df3959f96`.
- `c2-p7-review-candidate.service.ts`: `ea4cb120e6f400e13bf85d2fc906740ca2f756d49c8ae24b81851e7fe76b370a`.
- `c2-p7-owner-intent-candidate.ts`: `3b12e9d9c26ee6679553bdb9c662c0b1b8900aa9c8e473bc88eed5ce325690e6`.
- `c2-p7-registration-writer-candidate.ts`: `0910239849c7920a4f92ce234c156a1ba5cfd6b51896c2299163a9908eec5134`.
- `c2-p7-acceptance.ts`: `56d75257f377d00ef93917e02ff054edb605170484c9a5434ecae2f985249c13`.
- Runner `scripts/test-elp2-c2-p7-pg.sh`: `8b52b71c97a3c7d652c7b958aca29b8daa7bc8a143a936f921027acdb4e8f422`.

Real protected-owner identity/session and step-up, qualified registration and
field authority, issuer/listener installation, A2 acceptance and full recovery
fencing are still required. B2 remains unsigned; normal hook and landing remain
outstanding. No frontend change or new runtime grant occurred.
