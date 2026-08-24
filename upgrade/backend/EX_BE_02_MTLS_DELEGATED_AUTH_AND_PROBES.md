# EX-BE-02 — mTLS, delegated authentication, bounded transport and live probes

Status: `FOUNDATION_COMPLETE / CROSS_CELL_EVIDENCE_PENDING`  
Branch: `feat/execution_loop`  
Portal execution-edge authority: Rust, read-only compatibility boundary  
Trading authority: unchanged; Trading System remains authoritative

## 1. Outcome and honest status

EX-BE-02 delivers the code, container and operator probe needed to connect the
Research cell in SGP to the Execution cell in AWS HK without deploying the full
Portal in AWS and without modifying Trading System. The production feature flag
remains false. Real SGP↔AWS evidence is pending because this checkout has no
approved WireGuard endpoint, production PKI, environment-specific JWKS/private
key or Trading System read credential. A local test cannot be reported as a
production cross-cell probe.

The resulting path is:

```text
Browser
  -> SGP TypeScript Control API (session/RBAC authority)
  -> private WireGuard route + TLS 1.3 mTLS
  -> AWS HK Rust portal-execution-edge
  -> exact-origin TLS + versioned, GET-only Trading System v1 API
```

No Portal code reads Trading System PostgreSQL, Redis, CLI, source tree or
broker adapter. No command route exists in this slice.

## 2. Authentication boundary

Machine and user authority are deliberately independent:

- mTLS is mandatory on the AWS private listener. The server trusts only the
  configured SGP client CA. A missing client certificate cannot complete the
  handshake; a certificate signed by another CA is rejected.
- Control API signs RS256 delegated assertions. The private key is file-only;
  the Rust edge verifies a local JWKS snapshot and never performs network JWKS
  discovery in the request path.
- Assertions require exact issuer, audience, subject, session, workspace,
  environment, `execution.read`, explicit resources, `jti`, `iat`, `nbf`,
  `exp`, `auth_time` and `amr`. Maximum lifetime is 60 seconds and the default
  issuer lifetime is 45 seconds.
- Resources accept only explicit `alpha:`, `deployment:` or `account:` IDs;
  wildcards and empty resource sets fail closed. There is no command-scope
  parameter.
- The assertion remains server-to-server. No browser endpoint returns it.

Control API activation is guarded by `FEATURE_EXECUTION_EDGE=false`. Enabling
the flag without a private-key file fails configuration validation.

## 3. Bounded read-only source transport

`ts-transport` can receive only a typed `ReadOperation`, which EX-BE-01 maps to
the seven proven GET routes. The production client enforces:

- one exact HTTPS origin with no userinfo, path, query, fragment, redirect or
  environment proxy inheritance;
- explicit CA, TLS 1.3 minimum and optional client identity;
- connect/request/queue timeouts, semaphore concurrency, streamed response byte
  cap, at most two bounded retries and capped backoff;
- retries only for idempotent GET transport failures, 429 or 5xx outcomes;
- contract revision header on every request;
- no source API key on contract/health/capability probes;
- an explicit service read credential for orders/fills/positions/events. A
  configured alpha without that credential is `DISABLED`, never anonymous.

Secrets are loaded from mounted files. Errors and logs never retain token, API
key or request URL values.

## 4. Capability negotiation

Negotiation verifies the deployment-attested gateway digest prefix from
`contract-pack.lock.json` before making any request. This is explicitly an
attestation because current `/v1/contracts` does not expose the image digest.
Then it verifies API, authoritative contract, supported contract and schema
revision `v1` before probing other routes.

The snapshot reports each capability independently as `SUPPORTED`, `READ_ONLY`,
`SHADOW_ONLY`, `DISABLED` or `INCOMPATIBLE`; it never collapses them into one
global green value. A digest mismatch performs zero network calls. A contract
mismatch marks every route incompatible. Public probes may still qualify while
alpha probes remain disabled. Snapshot IDs are SHA-256 over normalized digest,
contract, states/reasons and observed venue/product rollout values; timestamps
do not make the identity unstable.

## 5. Runtime and deployment

`deploy/images/execution-edge.Dockerfile` uses Rust 1.85.1 and a Distroless
`cc-debian12:nonroot` runtime, both pinned by digest. BuildKit caches
compilation but copies only the release binary into the shell-less final
image. The runtime supplies only the glibc/libgcc boundary required by the
compiled binary; the 2026-08-24 publication hardening scan removed the
Debian-slim `perl-base`/`zlib` CRITICAL findings. Verified image properties:

- verified local image ID `sha256:101cce1a7f96edb8ae5523aba0eaa28c74f3eea11ef344556b1dcb3a046ba7a0`;
- 14,489,167 bytes;
- UID/GID `65532:65532`;
- read-only capable, no Linux capabilities, `no-new-privileges`;
- unsupported command fails closed.

`deploy/compose.execution-edge.yaml` is an AWS-HK-only stack. It publishes
8443 only on `EDGE_PRIVATE_BIND_IP`, keeps plaintext health on
`127.0.0.1:9100` inside the container, mounts one read-only secret directory
and requires an immutable runtime image digest. It is intentionally absent from
the SGP Portal Compose. CI tests the Rust workspace; the main-branch publisher
builds a separate `portal-execution-edge` image. AWS deployment remains manual
until Bobby supplies and approves its environment/runner/rollback boundary.

## 6. Test evidence — 2026-08-21

- immutable Trading System pack manifest: pass;
- Rust 1.85.1 `cargo fmt --check`: pass;
- Rust unit/integration corpus: 27/27 pass across six crates;
- strict `cargo clippy --all-targets -D warnings`: pass;
- mTLS mandatory + trusted client: pass;
- wrong client CA and malformed TLS material: rejected;
- JWT valid path plus wrong audience, excessive TTL, missing scope and wrong
  resource: rejected as expected;
- public probe API-key non-disclosure: pass;
- alpha probe exact four allowlisted reads with service key: pass;
- digest mismatch/zero request, response byte cap and redirect denial: pass;
- Control API fresh PostgreSQL suite: pass (including three delegated-auth
  tests); production TypeScript build: pass;
- production Rust image build and non-root metadata inspection: pass;
- AWS Compose render with documented example: pass;
- actual SGP↔AWS operator probe: `INTEGRATION_PENDING` (infrastructure/PKI/
  credential inputs absent; no fabricated evidence).

The repository-wide test-tree `tsc --noEmit` retains the pre-existing
`node-pg-migrate` declaration-resolution issue under CommonJS module resolution;
the production build and Vitest compilation are green.

## 7. Production live-probe procedure

After owner provisioning, create a fresh assertion in Control API and keep it
in a mode-0600 temporary file. From SGP run:

```bash
./scripts/execution-edge-live-probe.sh \
  https://10.70.0.2:8443 \
  /run/secrets/aws-edge-ca.crt \
  /run/secrets/sgp-control-api.crt \
  /run/secrets/sgp-control-api.key \
  /run/secrets/execution-read.assertion.jwt
```

Exit requires: TLS 1.3, trusted server certificate, accepted SGP client
certificate, accepted delegated assertion and HTTP 200 compatibility snapshot.
Then repeat negative probes without a client certificate, with a certificate
from another CA, expired/wrong-audience assertions and a digest/revision
mismatch. Record only status/timing/snapshot ID; never record secrets.

## 8. Claude handoff and next backend slice

Claude can consume the same five capability states and snapshot ID in fixture/
shadow adapters, but must keep the 17 Execution screens on their existing
delivery profile until real cross-cell evidence and registry promotion occur.
Useful parallel frontend work: capability/freshness/incompatible panels and
explicit unavailable states; no command UI activation.

Next backend slice is **EX-BE-03 — projection schema, reducer, cursor/epoch,
replay/snapshot and freshness evaluator**. It consumes the EX-BE-02 read
boundary and must not weaken its authentication or reach into Trading System
storage.
