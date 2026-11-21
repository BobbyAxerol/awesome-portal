# Core009 existing Manager data leg — source-only preparation,21October2026

Status **SOURCE_REVIEWED / NOT_CONFIGURED_OR_COMMISSIONED**. This is independent
preparation inside009, not permission to change the frozen original recovery.
Edge06:15 source note re-read at
`66b2bddb3eea404580b1c7c747bb6cf23735869b`; connected packet SHA256
`64c2902178cbb5c88aed431692d919784f54c3d294defef8000d594c20094101`.

## Distinct authority and data transports

- Native authority/custody:28446, existing Ed25519 trust and original leases.
- Manager data:Core→existing Edge `https://10.70.0.2:8443`→SourceProxy→Manager,
  RS256 delegation. Do not use direct Manager/DB or another service framework.
- Candidate73435311 `current-source.proxy.ts:749` reads four file references;
  `delegation.ts:94,131` imports/signs RS256. Native `native-core-runtime.ts:138`
  requires Ed25519. These trust materials are not interchangeable.

The installed operator source currently points the four legacy factory refs
at native trust and sets Paper origin28446. This is **not** a qualified Manager
data configuration. Preserve it for original-custody recovery; do not announce
fresh-data coverage from healthy startup or the retained native observations.
The factory is configured, but native review explicitly disables the ordinary
projection worker (`profile-projection.worker.ts:479`). Current positive
retained snapshot/frame proof does not exercise a fresh Manager relation read.
No current outbound-failure rate or new request is claimed by this source audit.

## Future reviewed Research overlay — no secret values

| Input | Exact config key / reference contract |
| --- | --- |
| New Research RS256 signer, private stays SGP | `EXECUTION_EDGE_PRIVATE_KEY_FILE` → `/run/secrets/research-native/edge-signing.pem` |
| Public CA validating Edge server | `EXECUTION_EDGE_CA_FILE` → `/run/secrets/research-native/edge-ca.pem` |
| New Research client certificate | `EXECUTION_EDGE_CLIENT_CERT_FILE` → `/run/secrets/research-native/edge-client.pem` |
| Distinct client private key, stays SGP | `EXECUTION_EDGE_CLIENT_KEY_FILE` → `/run/secrets/research-native/edge-client-key.pem` |

Refs are the checked-in overlay contract, **not a claim the files exist**.
Paper origin8443/profile`PAPER_BINANCE_USDM`/audience`portal-execution-edge-paper`,
issuer`portal-control-api`, exact Research workspace, reviewed unique kid and
TTL≤60s. Existing native selector still binds exact human/subject/domain/seals.
Command/Live/legacy SSE stay disabled; READ never grants STREAM.

Core PKI preparation can supply Research-only public JWK/CSR and private-ref
metadata. Offline CA owner must return an issued leaf under the trusted client
CA:CA:false,digitalSignature,clientAuth, URI
`spiffe://primusspark/portal/control-api/paper` (HK profile template:18).
Reviewed documents have no compatible Research RS256/issued-client receipt;
this does not prove absence in every private directory. No key bytes searched,
read, generated, copied or disclosed by this preparation.

Edge owner must review public JWK overlap preserving stable kid. Startup-only
TLS/JWKS needs a separately approved exact **shared Paper reconcile** with old
config/JWK/image and rollback retained; a new CA also needs public CA overlap.
This is outside original-custody recovery dispatch and has not been performed.
Do not replace frozen native trust or source acceptance with these references.

Claude can prepare config validation/fixtures and the genuine source-head/writer
handoff independently. Actual read/notice qualification needs accepted transport,
current exact grants and source publication; existing retained native tests are
not that receipt. C3 whole-Fleet additionally needs its own ROOT scoped authority
and real Portal Manager publication head. No SQL rights, source receipt, runtime
or frontend change; no tests/build/resources created by this review.
