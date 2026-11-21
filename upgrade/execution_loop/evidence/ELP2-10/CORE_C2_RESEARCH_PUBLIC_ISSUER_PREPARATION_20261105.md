# C2 Research public issuer — preparation only

Core prepared a new dedicated Ed25519 issuer key, distinct from the candidate
P8 signer and the TS A1 source-proof key. Its public JWKS is in the HK public
candidate directory named by `CORE_C2_RESEARCH_PUBLIC_TRUST_PREPARATION_20261105.md`:
`core-c2-research-public-20261105/jwks.public.json`.

- Exact JWKS file SHA256: `80ad0f68290d365abade6b2f1bb6286b1b44755428523498f1ac0b9c47bead8c`.
- Public SPKI DER SHA256: `317597e3473d62ff0249f049bff75217ad069a97f470b9a358ac5a68e4a41558`.
- Candidate kid: `research-candidate-064b8dc9-17a8-4305-9b7f-d5c7524245e6`.

The JWKS contains one public key, and its public key was checked against the
private candidate key. Local file/directory permissions and fsync were checked;
the HK JWKS checksum matches. No private key is transferred or included here.

**NOT_READY:** this key is not yet installed, registered, tied to a verified
protected-owner issuer/subject or accepted as A2. There is no live JWKS
endpoint, token mint, P7 acceptance or B2 signature. Do not equate delivery of
these public bytes with permission to activate; Core must first complete the
binding, runtime/image and policy/recovery gates.
