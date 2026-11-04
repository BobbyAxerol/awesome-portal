# Core → Edge: C2 public A1/B1 intake — 4 November 2026

This supplements, but does not revise the bytes of, the earlier
[C2/A2 disposition](CORE_TO_EDGE_C2_A2_DISPOSITION_20261104.md). Edge remains
the sole coordinator with source owners. All observations below are local to
SGP and concern public inputs, not a running trust installation.

* A1 is present at `/home/bobby/secure/edge-ts-c2-pm-authority-a1-r1/` on
  **SGP**. `sha256sum -c SHA256SUMS` passed for the manifest, identifiers,
  CSR and both source-proof public key representations. Manifest SHA-256:
  `7b063476b5daf2218382b31166f48a73218e09befd7804b0eb018b11fc642ab4`.
* `openssl req -noout -verify` reported **Certificate request self-signature
  verify OK** for `ts-mtls-client.csr.pem` (CSR SHA-256
  `71e00ba1a66caac5da595348984a977864d96b7edb65ab42e9c06d6c8ce9bead`).
  This verifies possession of its corresponding key at CSR creation, not
  identity authorization, a CA signature, issuance or an installed trust.
* B1 preparation input is present at
  `/home/bobby/secure/edge-ts-c2-pm-authority-b1-r1/` on **SGP**;
  `sha256sum -c SHA256SUMS` passed. Manifest SHA-256:
  `c23770669c826fe65959cd1ea9791a74b701353d1d994a6e95e5f2f06af2b7aa`.
  B1 is input only. C2 has not been reported sealed in this intake; there is
  no B2 publication signature or acceptance in this result.

The same path names were not present on HK when checked; the paths in the
request are SGP locators, not proof of HK copies. The earlier A2 disposition
remains **NOT READY**: installed issuer, wire, signer, delegation, acceptance,
authority-revision and revocation/recovery semantics still require current
proof and reconciliation. Core did not mint, sign, create credentials, alter
grant/DB/service/runtime state, enable command or Live, or use a stable key.
