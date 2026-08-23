# EX-BE-02 Live — D2 Hardening Checkpoint

Date: 2026-08-23  
Branch: `feat/execution_loop`  
Repository state: `D2_HARDENED / LIVE_DEPLOYMENT_BLOCKED`  
Runtime state: `D1_NETWORK_ACCEPTED / APPLICATION_DARK`

## 1. Decision

D1 remains accepted and unchanged. D2 is not yet permitted to start on AWS-HK,
but its repository boundary has been hardened against three gaps found during
the pre-deployment audit:

1. the Edge previously performed a capability probe during startup even when
   every business feature was disabled;
2. the dark Source Proxy left three public-at-source probe routes reachable and
   required a real Trading System read secret before D4;
3. the D2 manifest did not own the projection PostgreSQL and migration boundary
   required by EX-BE-03/04b/07b.

The fix is fail-closed. `EDGE_SOURCE_PROBES_ENABLED=false` now means no initial
probe and no background probe. The Edge can be ready in D2 with no Source Proxy
upstream. All seven locations in the dark Source Proxy return 503 before
proxying and the only included header is the harmless exact marker
`X-Portal-Source-Mode: dark`. A Trading System `X-API-Key` becomes valid only in
the separately gated `paper-read` source-readiness mode. D3's
`contract-probe` mode removes the guard from only `/v1/contracts`, `/v1/health`
and `/v1/health/capabilities`; its four alpha locations remain closed.

## 2. Projection boundary

D2 now includes an internal PostgreSQL 16 service and one-shot Rust migrator:

- official PostgreSQL image pinned by immutable OCI digest;
- no host/VPC/public port and only the Portal-owned internal bridge;
- TLS enabled with hostname verification and SCRAM for every network login;
- separate `portal_projection_owner` and `portal_projection_runtime` roles;
- both roles are `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`;
- owner credential is mounted only into the one-shot migrator;
- runtime credential is reserved for the long-running Edge;
- runtime receives table/sequence DML privileges but no schema DDL authority;
- bootstrap secrets are read from files and never enter process arguments or
  logs;
- named data volume is versioned and rollback preserves it by default;
- ingestion, analytics and realtime remain off, so D2 stores schema only and no
  Trading System business data.

The owner-reviewed shared-host envelope now provides a 5.00 CPU / 5,632 MiB
peak startup ceiling across Edge, Proxy, PostgreSQL and the short-lived
migrator. The long-running ceiling is 4.00 CPU / 4,608 MiB. These are hard
per-container ceilings rather than steady-state reservations. AWS-HK has 8 CPU,
about 16 GiB RAM, about 9 GiB available and about 66 GiB free under `/srv`.
Because full I/O PSI was already roughly 8–9 percent before Portal existed,
D2 now records that pre-existing baseline and accepts only a bounded positive
post-start delta. Any Trading System health regression still rolls back.

## 3. Executable evidence

`./scripts/execution-d2-test.sh` proves:

- immutable image grammar and official PostgreSQL digest grammar;
- candidate/rollback normalized Compose equivalence;
- all source/ingestion/realtime/analytics/command flags remain false;
- exact seven-route 503 guard and absence of a Trading System API key;
- certificate/key/trust/hostname/JWKS and file-mode boundaries;
- distinct database credentials and verify-full database URLs;
- no rendered 5432, 8000 or 8444 host publication;
- malicious env content remains inert.

`./scripts/execution-d2-test.sh --build-images` additionally proves on a scoped,
internal Docker network:

- non-root/read-only Edge and Proxy runtime images;
- real PostgreSQL first boot and bootstrap script execution;
- Rust `projection-migrate` followed by runtime `projection-check`;
- exact database owner and non-superuser role attributes;
- runtime-role DDL denial and plaintext PostgreSQL denial;
- no published PostgreSQL or Edge port;
- Edge readiness while no Source Proxy container/DNS target exists, proving the
  D2 source-dark boundary;
- exact container/network/volume/image cleanup.

The canonical Rust/PG gate remains `./scripts/execution-edge-test.sh`; it covers
format, all targets, Clippy with warnings denied, replay/query/analytics corpus
and projection backup/restore parity.

## 4. Live D2 stop gates

D2 must remain absent until all of the following are true:

1. the temporary role `PrimusPortalExecutionD1Operator-v1` is detached from the
   shared AWS-HK instance, or a separately reviewed mechanism proves IMDS is
   unreachable from every Portal container; the current IMDSv2 hop limit is 2
   and Source Proxy uses host networking, so Compose isolation alone is not an
   acceptable proof;
2. the exact Edge and Source Proxy commit is published to GHCR by immutable
   digest with provenance, SBOM, signature and an accepted vulnerability
   disposition; anonymous GHCR currently returns 403 and no target-host Docker
   credential has been staged;
3. real, separately owned Edge server mTLS, SGP client CA, Source Proxy internal
   mTLS and Control API JWKS material passes target readiness; no Trading System
   read identity is issued in D2;
4. a fresh AWS resource/listener/pressure/Trading System health baseline and
   rollback digest are recorded inside the D2 change window;
5. the private mode-0600 D2 env uses the actual common `portal-runtime` GID 987,
   root/group-owned paths and the reviewed projection bootstrap script; the
   PostgreSQL-only secret directory/script instead uses container GID 70 so the
   dropped `postgres` process can read it without broad permissions.

These are deployment controls, not missing feature code. Lowering them would
make D3/D4 evidence ambiguous and would expose a temporary AWS operator
identity to application workloads.

The publication workflow now has a bounded `execution-d2` manual scope. It
builds only Edge/Proxy for the selected ref, publishes maximum provenance and
SBOM, writes HIGH/CRITICAL Trivy JSON, rejects any CRITICAL finding, performs
OIDC keyless Cosign signing, verifies both exact workflow identities and uploads
a checksummed digest/evidence artifact. This workflow revision must first reach
the default branch; then Bobby selects `feat/execution_loop` plus
`execution-d2`. A green job and reviewed HIGH findings close the image part of
stop gate 2; preparing the workflow does not close it.

## 5. Next sequence

After D2 live acceptance:

1. **D3:** enable only mTLS/delegated-JWT/compatibility probes; prove valid and
   negative auth, bounded HTTP transport and SGP↔AWS latency without business
   reads.
2. **D4:** issue the dedicated Paper read identity, switch Source Proxy to
   `paper-read`, create a new projection `BUILDING` epoch and prove mapper,
   replay, freshness and parity without registry activation.
3. **Activation:** separately approve the epoch/profile cutover. Activation is
   never implied by D4 qualification.
4. **Command runway:** separately qualify plan/apply/poll and command relay;
   every command flag stays false throughout D1–D4 and Activation.

Claude may continue fixture/http mapping and visible dark/unavailable states in
parallel. Claude must not enable Lane B, EventSource, source/query/analytics or
command UI behavior until the corresponding backend activation evidence is
published.
