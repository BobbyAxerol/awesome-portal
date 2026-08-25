# EX-BE-02-LIVE — D3 Transport Acceptance

Date: 2026-08-24  
Status: `D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK / D2_RUNTIME_RESTORED`  
Accepted deployment commit: `5ec282ec8c00c60696f66a70186ffd80b051d8a0`

## Outcome

The bounded SGP→AWS-HK transport boundary is accepted. The real Rust Execution
Edge proved HTTP/2, TLS 1.3 mutual TLS, delegated-JWT fail-closed behavior,
bounded latency, source-loss/recovery and D2 rollback without reading a Paper
business route or creating projection state.

Acceptance does not authorize D4, registry activation, Query API, analytics,
SSE or commands. The AWS-HK runtime exited the window on the previously
accepted D2 digests in `SOURCE_DARK` mode.

## Fail-closed remediation history

1. Attempt 1 rejected the stale gateway digest before the JWT matrix. The
   Source Proxy and D2 rollback remained healthy; the digest lock and preflight
   were corrected in the protected-main publication path.
2. Attempt 2 rejected `jwt-future-not-before`: `jsonwebtoken` validates the
   presence of `nbf` when required but does not validate its time by default.
   Edge Auth now explicitly enables `validate_nbf`, and the regression corpus
   proves rejection outside the three-second clock-skew envelope.
3. Attempt 3 used only signed immutable images from protected `main`, passed the
   full matrix, passed source loss/recovery, and passed rollback rehearsal.

No failed attempt read orders, fills, positions or events. Each failure rolled
back to D2 before another candidate was admitted.

## Published trust chain

Workflow run `32736419720` published and signed these immutable candidates:

| Component | Accepted digest |
|---|---|
| Execution Edge | `sha256:f098d4392309699635b8fd42bce21a97dd5f65ce5e5c6454f5813e141a4b7aa3` |
| Source Proxy | `sha256:3304fd53ae6bc381a984c4807a48f014b07f14aab0e7029f7364905b447885e0` |
| Control API assertion issuer | `sha256:ded684a2b220b3d6f9d8cb04fe872543a1c05fe3ab58375e6c389fc1122964a2` |

Cosign verification required the exact protected-main workflow identity and
GitHub OIDC issuer, including transparency-log inclusion. Socket-free Trivy
reported zero CRITICAL findings for all three images. Source Proxy and Control
API reported zero HIGH findings. Edge retained one explicitly accepted
`CVE-2026-14456` disposition with QUIC/HTTP3 prohibited; D3 observed HTTP/2 only.

The private publication and owner manifests remain mode `0600`; Git records
only their SHA-256 references, never credentials or certificate bodies.

## Real transport and authorization evidence

The initial and post-recovery probes each recorded 26 redacted cases:

- no certificate and wrong-CA certificate: rejected before HTTP;
- valid mTLS without JWT: `401`;
- malformed, wrong-signature, unknown-key, wrong issuer/audience/environment,
  expired, future-`nbf`, 61-second TTL and missing-scope assertions: `403`;
- canonical 45-second assertion: `200`;
- unknown route: `404`;
- POST to the compatibility route: `405`;
- transport: HTTP/2 + TLS 1.3 + mTLS in both runs; and
- business-source read and projection-ingestion evidence flags: `false`.

Ten initial samples measured 154.328–159.142 ms total, average 156.745 ms. Ten
post-recovery samples measured 154.446–162.587 ms, average 158.721 ms, safely
below the 2,000 ms admission ceiling.

`capability_snapshot_id` stayed equal across recovery by design: it is the
content hash of gateway/contract/capability state and excludes observation
time. Freshness was instead proven by the Source Proxy restart boundary, Edge
readiness changing fail-closed then healthy, a newly issued short-lived corpus,
a second complete network probe and new redacted evidence timestamp.

## Source and projection invariants

The Source Proxy safe access log contained exactly:

| Exact route | Calls |
|---|---:|
| `/v1/contracts` | 20 |
| `/v1/health` | 20 |
| `/v1/health/capabilities` | 20 |

It contained zero `/v1/orders`, `/v1/fills`, `/v1/positions` or `/v1/events`
calls and no unknown upstream route. Portal projection business-table count was
zero before and after the drill. Trading System local health remained `200`.

Stopping only Source Proxy made Edge readiness fail closed while the process
stayed live with restart count zero and no OOM. Restarting Source Proxy restored
both health checks; the entire transport/JWT matrix passed again.

## D2 rollback and cleanup

The unchanged D2 env and dark Source Proxy config were re-applied after evidence
capture. The accepted D2 image digests are:

- Edge: `sha256:c67dc1dcb938fc1fa64070ac72d4e1dcc5cace2355ce813e2a3dfc89ba7a480b`;
- Source Proxy: `sha256:dafa9e70a3d90cd079147d149dbbaa8ac8a3a9db079b0cf8099892a7f1d5fbe7`.

After rollback, both containers were healthy with zero restarts and no OOM, all
seven Source Proxy routes were guarded, Source Proxy logged zero source calls,
projection business-table count remained zero and Trading System health was
`200`. The PostgreSQL volume was retained.

Both expired assertion corpora were removed after mode-0600 redacted evidence
was copied to the private evidence directory. No token, key or business payload
is retained in this repository.

## Evidence index

| Private evidence | SHA-256 |
|---|---|
| publication manifest | `a3d221e6881248306af71b94cfd2a0532d0f67dafd72429952abe0e32d1ae2b9` |
| owner input / change window | `7d5de8a46ae7e949a2f55eb999480018f8a2226fc9dc9b116692a2f3e3bcfb70` |
| initial live probe | `f08906a61dd8437657cc186d8d3a0c331b286edbf2f8d20b71e4c1120dc4bad8` |
| recovery live probe | `8daf37aa36ba8542693d95d2393cd7fb9ca13ddfffd9d8e9bc5f7bdda676ca49` |

## Next gate: D4 Paper read shadow

D3 acceptance removes only the D3 predecessor blocker. D4 still requires:

1. a Trading System owner-published dedicated Paper read-only identity;
2. exact bounded GET/cursor/completeness/resync contracts for orders, fills,
   positions and events, with missing/wrong credential and mutation denials;
3. digest-locked production mapper and sealed replay corpus;
4. separately approved encrypted projection storage plus backup/restore; and
5. a new owner-approved D4 window.

D4 may create only a `BUILDING` epoch. Registry remains `fixture`; Query,
analytics, SSE, command relay and activation remain off until their own gates.
