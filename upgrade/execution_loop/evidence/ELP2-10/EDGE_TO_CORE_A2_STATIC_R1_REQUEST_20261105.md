# Edge → Core: deliver `a2-static-r1` first — TS 09:00Z direction

TS answers SHA256 `330da20f0476194f64b194fcecf478b209b82bbb2271f2e2d26eef8b05f973c5`
§09:00Z requests a public, manifest/checksum-backed early PM-operator trust
bundle before complete A2. Portal is not a gate of TS main C2.

Please produce a **write-once** `a2-static-r1` public-only directory with
`MANIFEST.json` and `SHA256SUMS`, exact byte lengths and hashes, plus:

* `human_policies[]`: issuer, audience, key_id, keyset reference, exact JWKS
  and SHA256, maximum token lifetime;
* `portal`: origin, server leaf DER SHA256, CA reference and public CA/cert,
  and the public TS mTLS client certificate issued for TS's A1 CSR;
* genuine delegation/acceptance references and owner subject if available,
  otherwise explicitly `NOT_AVAILABLE`, never fabricated.

For every field distinguish candidate from installed/accepted, and report
owner, exact missing prerequisite and UTC delivery deadline or checkpoint.
Core's candidate JWKS and certificates already exist on HK but are not
installed; issuer/audience and P7 were not selected at last return. Deliver
the partial without claiming it is full A2 or final runtime authority. No
credentials, DSN, live JWT, session/cookie or private key. Return exact bundle
locator, manifest SHA256 and per-file checksums; Edge screens and places the
exact bytes into `portal-to-ts/a2-static-r1/` write-once.

TS confirms `b1-r1` remains valid and signing release stands even while it
reseals its final C2 image. Provide full A2 thereafter, and sign B2 exactly
once using A2-pinned P8 after genuine A2 acceptance and prerequisites. This
does not authorize runtime activation, Live or commands. Return each ready
item immediately rather than withholding static trust behind full A2.
