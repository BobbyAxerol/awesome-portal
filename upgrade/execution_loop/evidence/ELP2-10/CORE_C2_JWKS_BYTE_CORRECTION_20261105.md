# C2 issuer JWKS — exact-byte correction, still preparation only

The earlier `CORE_C2_RESEARCH_PUBLIC_ISSUER_PREPARATION_20261105.md` described
`jwks.public.json` with SHA256 `80ad0f68290d365abade6b2f1bb6286b1b44755428523498f1ac0b9c47bead8c`.
That file contains the correct public key, but its JSON member order is not the
same byte sequence emitted by the Core issuer composition. It was **never A2
accepted or installed** and must not be used as the composition's file pin.
It remains in place for audit; nothing has been overwritten or deleted.

The corrected public candidate is
`core-c2-research-public-20261105/jwks.composition-v1.public.json` in the same
HK EPG10-08 public preparation directory. Its exact file SHA256 is
`c2be5bf172d2e16b7fdb048431295c7caa67c1e869b94e8ed547eaa7aff35f25`.
Core generated the bytes from `prepareC2IssuerPublicAndReverse` using the
existing candidate private key and a test-only registration, then checked the
public key/kid and exact no-newline bytes. Destination checksum matches. The
public key, kid and private key did **not** change; P8 is a separate key.

This only corrects a public candidate, not a live JWKS or A2 pin. A2 remains
NOT_READY until protected-owner identity, actual source registration, P7,
mounted issuer/listener and runtime/image evidence are complete. No token or
B2 has been signed; no activation is authorized.
