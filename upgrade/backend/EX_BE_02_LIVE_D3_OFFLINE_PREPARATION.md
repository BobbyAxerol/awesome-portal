# EX-BE-02 Live — D3 Offline Preparation

Date: 2026-08-23  
Branch: `feat/execution_loop`  
Repository state: `D3_OFFLINE_PREPARATION_COMPLETE / LIVE_D3_UNAUTHORIZED`  
Runtime state: `D1_NETWORK_ACCEPTED / D2_LIVE_PENDING / APPLICATION_DARK`

## 1. Decision

D3 now has an executable probe-only deployment contract, but no AWS-HK service,
source route, registry profile or business flag was changed. Live D3 remains
strictly ordered after D2 acceptance and requires its own authorization window.

The accepted delta is deliberately smaller than D4:

- Source Proxy mode `contract-probe` opens only `/v1/contracts`, `/v1/health`
  and `/v1/health/capabilities`;
- `/v1/orders`, `/v1/fills`, `/v1/positions` and `/v1/events` retain exact 503
  guards;
- the Edge may run public capability negotiation only with
  `EDGE_PROBE_ALPHA_ID` empty;
- projection ingestion, Query, SSE, analytics and command remain false, with
  analytics profile `fixture`; and
- the Source Proxy header include remains the harmless exact dark marker. A
  Trading System read identity is invalid before D4 `paper-read` readiness.

This fixes a latent preflight defect: `contract-probe` previously fell through
to the branch that expected a Trading System API key. The gate now models
`dark`, `contract-probe` and `paper-read` separately and requires a mode-0600
env file outside template validation.

## 2. Delivered boundary

1. `deploy/execution-d3/compose.probes.yaml` is a small override on the accepted
   D2 stack. It changes only source probe state and reasserts every business
   flag as false.
2. `execution-d3-render-probe-env.sh` accepts a real D2 env, refuses overwrite,
   writes a separate D3 env/config pair atomically and never prints a value.
3. `execution-d3-live-probe.sh` requires curl HTTP/2, forces TLS 1.3, proves
   trusted/wrong/missing client identity, then runs no-JWT plus ten JWT-negative
   cases, one positive case, bounded repeated latency, unknown-route and
   method-denial probes.
4. The Control API `probe:d3-assertions` CLI uses the canonical
   `ExecutionDelegationService` for the positive 45-second RS256 assertion. It
   writes an empty-directory-only, caller-owned 0700 corpus with mode-0600
   files and never outputs token values. Negative cases cover malformed token,
   wrong signature, unknown KID, issuer/audience/environment mismatch, expired,
   future `nbf`, 61-second TTL and missing `execution.read`.
5. The live probe validates the canonical capability payload and records only
   status/timing/H2/TLS policy plus the `capability_snapshot_id`; it rejects
   assertion reflection and unexpected/business top-level fields.
6. The D3 runbook locks D2 prerequisites, signed-image evidence, exact apply,
   source-loss recovery, acceptance, token cleanup and return-to-D2 rollback.

## 3. Publication boundary

The image workflow now exposes three manual scopes: `all`, `execution-d2` and
`execution-d3`. D2 remains Edge+Proxy only. D3 additionally builds the exact
Control API probe image with maximum provenance and SBOM, produces HIGH/CRITICAL
Trivy evidence, rejects CRITICAL findings, signs the digest through GitHub OIDC
Cosign and verifies the workflow identity before uploading checksummed evidence.

Publication hardening now pins the Control API runtime to Node 22.23.2 /
Alpine 3.24 by digest and removes build-only npm/npx/Yarn/Corepack from the
final image. The exact hardened image runs as `node`, reports Node 22.23.2 and
has zero HIGH/CRITICAL Trivy findings; application dependencies and migration
content are unchanged.

This is repository preparation only. No image was published in this slice, and
the workflow revision still must reach the default branch before dispatch.

## 4. Executable evidence

| Gate | Result |
|---|---|
| `./scripts/execution-d2-test.sh` | pass; D2 dark + new real-file probe preflight regression |
| `./scripts/execution-d3-test.sh` | pass; 3 open/4 guarded routes, Compose flags and redacted 19-case harness |
| `./scripts/execution-image-publication-test.sh` | pass; D2/D3 scopes, three digest scan/sign trust chains |
| Control API D3 assertion tests | 2/2 pass in network-disabled Node 22 container |
| Control API production build | pass in network-disabled Node 22 container |

The fake-curl D3 harness proves control flow and evidence redaction only. It is
not cross-cell evidence. HTTP/2, TLS 1.3, real PKI/JWKS, actual latency and the
source-loss drill remain unproven until the live D3 window.

## 5. Live stop gates

Live D3 must not start until:

1. D2 has been deployed and accepted with its operator-instance-role, signed
   digest, workload identity, resource/pressure, database and rollback gates;
2. the D3 Control API image digest has accepted scan/signature evidence;
3. one private D3 change-window ID, latency ceiling and rollback operator are
   recorded;
4. SGP receives a valid client identity plus a deliberately untrusted negative
   identity, without modifying Edge trust;
5. the generated assertion corpus is used immediately and destroyed after
   expiry; and
6. projection counts and Trading System health can be observed without reading
   or recording business payloads.

## 6. Frontend coordination

This checkpoint unlocks no live frontend profile. Claude continues fixture,
dark, unavailable, auth-denied, reconnect and recovery UX only. Specifically:

- keep `source_available=false`, `stream_available=false` and analytics
  `fixture`;
- do not open EventSource, poll AWS-HK or bind Lane B;
- do not infer D3 acceptance from D1/D2 health; and
- keep all command affordances disabled.

A new handoff is required after real D3 evidence. D4 and activation remain
independent later gates.

## 7. Next sequence

1. Promote and run the signed `execution-d2` publication; isolate the temporary
   operator role; stage real workload PKI/JWKS; open and accept D2 live.
2. Publish the signed D3 Control API image and execute this D3 matrix from SGP.
3. Only after D3 acceptance request a dedicated Paper read identity for D4
   BUILDING-epoch qualification.
