# EX-BE-02A — Manager-v2 Edge Read-through API

Status: **BACKEND_COMPLETE / PRIVATE_PAPER_RUNTIME_QUALIFIED / PAPER_ONLY**

Date: 2026-08-28  
Portal branch: `feat/manager-v2-paper-read`  
Predecessor: [EX-BE-02 — Manager-v2 Backend Consumer](./EX_BE_02_MANAGER_V2_BACKEND_CONSUMER.md)  
Owner route handoff: [EX-BE-02 Manager-v2 Paper Read Handoff](./EX_BE_02_MANAGER_V2_PAPER_READ_HANDOFF.md)

## Goal

Wire the already-qualified `manager-v2-client` into the existing Rust
`edge-service` and expose a small authenticated **internal Portal backend API**.
This makes the Paper Manager data usable by a later Portal Control API/consumer
without exposing Trading System directly to a browser, database client, or UI.

The result is read-through only. It does not create a Portal projection/cache,
poller, event/replay consumer, browser/UI route, or Trading System mutation.

## Governing guides

- `upgrade/RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md`
- `upgrade/PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md`
- `upgrade/DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md`
- `upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` §14.1
- the imported Manager owner pack under
  `services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/`

## Approved scope

1. Add an opt-in `EDGE_MANAGER_V2_READ_ENABLED=false` runtime gate. When false,
   the new authenticated endpoints return a typed `503` and make no source
   request. When true, use the existing Edge workload mTLS CA/client-identity
   files and fixed Source Proxy origin as byte inputs to the separate
   `manager-v2-client`; do not pass the V1 admission/API-key file to it.
2. Add exactly four internal, read-only HTTP routes to the existing private
   `edge-service` router:

   - `GET /internal/v2/manager/catalogue`
   - `GET /internal/v2/manager/capabilities`
   - `GET /internal/v2/manager/projections/:kind?limit=&cursor=`
   - `GET /internal/v2/manager/relations/:schema/:relation?limit=&cursor=`

   All accept only the sealed owner operations. `limit` defaults to 100 and is
   bounded to `1..=200`; response bodies remain bounded by the inherited 1 MiB
   client contract.
3. Reuse the existing private-server mTLS and `edge-auth` delegated-read
   verifier. These routes require `execution.read`, `environment=paper`, and
   the exact resource `execution:manager-v2:read`; the future Control API/BFF
   must mint that existing-style delegated resource before runtime activation.
4. Relay the validated Manager envelope as typed JSON, preserving its source
   `authority`, `profile_id`, `as_of`, `freshness`, `completeness`, catalogue
   digest and trace ID. Do not invent an event sequence or claim replay/event
   semantics for a snapshot response. A source `503` remains the typed owner
   unavailable envelope; local disabled/transport/contract failures use bounded
   Portal problem bodies.
5. Extend only the Manager DTO serialization necessary to relay the existing
   owner-approved fields. Decimal values remain tagged exact strings. Relation
   pages can return every owner-catalogued safe field and internal IDs; no
   generic projection mapping or per-table hand-written SQL is introduced.

## Invariants

- Fixed `PAPER_BINANCE_USDM` profile only. This does not activate Sandbox,
  Canary, Live, D4/V1, ingestion, SSE, events, replay, command, Redis, broker
  or CLI authority.
- No direct Trading System database connection, no SQL, no DB credential, no
  JWT issuer/signing key, and no V1 `ts-transport` reuse or widening.
- No arbitrary URL, method, header, field, sort, relation or raw record-key
  endpoint. Relation/projection requests first obtain the signed owner
  catalogue and only use its validated relation reference; a returned cursor
  is accepted only as the same opaque source round-trip and the owner facade
  remains its authority.
- The record-by-key source operation remains available only in the sealed Rust
  client. This API deliberately does not accept an opaque record key from
  HTTP: relation pages already return the complete approved record field set,
  and adding an unneeded generic lookup would weaken the boundary.
- Existing V1/D4 routes and compatibility, source probes, projection PostgreSQL,
  realtime, analytics, compose topology, Source Proxy, Trading System, UI and
  runtime containers remain unchanged except for documenting the new default-off
  Edge gate in tracked templates.

## Test gates

- Contract serialization tests prove the relayed JSON preserves tagged exact
  decimals, opaque pagination tokens, catalogue bindings and owner envelope
  shape without serializing internal validation-only fields.
- Edge unit tests cover resource-scoped delegated authorization, disabled gate,
  invalid identifiers/page bounds, typed owner `503`, and bounded local error
  mapping. Existing Manager client tests continue to cover exact request paths,
  no JWT/V1/API-key header, mTLS/TLS 1.3, redirect/body/queue bounds and source
  contract drift.
- Run `cargo fmt --all -- --check`, strict Clippy and targeted Rust tests for
  `manager-v2-contract`, `manager-v2-client` and `edge-service`, then
  `./scripts/execution-d2-test.sh` and `git diff --check`.

## Rollback and decision boundary

Rollback is source-only: revert this slice or keep
`EDGE_MANAGER_V2_READ_ENABLED=false`. It creates no database state, cache,
credential, secret, source request, runtime container or Trading System change.

Code qualification is not runtime activation. A separate owner-approved Portal
release/change window must supply the delegated `execution:manager-v2:read`
claim and explicitly set the gate true. Runtime proof must be recorded
separately; no service restart, Source Proxy reconfiguration, or deployment is
authorized by this implementation.

## Implementation journal

### 2026-08-28 — pre-code freeze

- Owner approved continuation from the library boundary into the existing
  Portal Execution Edge backend only. No UI was requested or authorized.
- Chosen route shape is a bounded read-through API rather than a new projection
  or cache: current Manager owner source is snapshot-oriented and no
  authoritative incremental/replay stream is being claimed.
- Scope, invariants, test gates and rollback above are frozen before code.

### 2026-08-28 — implementation and local qualification

- Wired the sealed `manager-v2-client` into `edge-service` behind the explicit
  default-off `EDGE_MANAGER_V2_READ_ENABLED` gate. The Manager client consumes
  only the existing Source Proxy origin, CA and workload client identity; it is
  constructed separately from the V1 `BoundedSourceClient` and is never given
  the V1 admission/API-key file.
- Added exactly the four frozen private read-through routes. They require the
  existing private-server mTLS plus a delegated `execution.read` assertion for
  `environment=paper` and `resource=execution:manager-v2:read`. When dark,
  an authenticated request receives `503 MANAGER_V2_READ_DISABLED` before any
  source request. Input is bounded to an owner-catalogued relation/projection,
  a `1..=200` page limit and an opaque catalogue-bound cursor; responses are
  serialized as bounded JSON with `Cache-Control: no-store`.
- Added only relay serialization to the already owner-approved DTOs. It keeps
  tagged exact decimals and the owner snapshot envelope while omitting
  validation-only binding fields. The Edge does not create a source sequence,
  cache, projection, poller or record-key HTTP surface.
- Updated tracked compose and D1/D2 dark templates/preflight so the new flag
  is visible and must remain `false` in the dark lane.
- Evidence run locally in the pinned Rust 1.85.1 CI container:

  ```text
  cargo fmt --all -- --check
  cargo clippy --locked -p manager-v2-contract -p manager-v2-client -p edge-service --all-targets -- -D warnings
  cargo test --locked -p manager-v2-contract -p manager-v2-client -p edge-service
  # edge-service: 18 passed; manager-v2-client: 6 passed;
  # manager-v2-contract: 6 passed; 0 failed
  ./scripts/execution-d2-test.sh
  # PRE-IAM-05 D2 dark manifest, preflight and rollback gates passed. No service started.
  git diff --check
  ```

- No service was started, restarted or deployed; no request was made to Source
  Proxy or Trading System; no database, credential, secret, Source Proxy, V1,
  D4 or UI state changed. Disposable test cache directories and the temporary
  Rust CI image were removed after qualification.
- **Closure boundary:** this backend slice is complete. Runtime activation is
  intentionally separate: the Portal Control API/BFF must mint the named
  delegated resource, then an owner-approved release/change window can set
  `EDGE_MANAGER_V2_READ_ENABLED=true` and qualify the active runtime. That is
  an operational activation gate, not remaining implementation debt.

### 2026-08-28 — owner-approved Paper runtime activation (pre-change freeze)

- The owner explicitly authorized activating and testing this Manager-v2 Paper
  read-through path. The permitted runtime blast radius is one replacement of
  `portal-execution-edge-execution-edge-1` only. The already-running Source
  Proxy and the two Trading System Manager loopback containers are evidence
  prerequisites and must not be recreated, reconfigured or otherwise changed.
- The required code/config delta is intentionally narrow: allow the one exact
  Control API delegated resource `execution:manager-v2:read` (no wildcard or
  new scope), and add a dedicated Compose overlay that changes only
  `EDGE_MANAGER_V2_READ_ENABLED` from inherited dark `false` to `true`.
  Existing probes, projection ingestion, analytics, SSE and command flags
  remain false.
- Positive qualification must originate from the SGP Control API trust domain
  using its existing private mTLS client identity and RS256 signing key. It
  will obtain a fresh, short-lived `execution.read` assertion for the exact
  Manager resource, then call catalogue, capabilities, one bounded projection
  and one bounded catalogue relation page. Evidence records only status,
  response byte count, digest/count/timing and trace hash; it never records a
  JWT, certificate/private key or business row.
- Negative qualification must prove wrong/missing resource denial and the
  retained dark state of V1/D4, ingestion, analytics, SSE and commands. A
  failed deploy, health/readiness failure, failed positive probe or unexpected
  source status triggers rollback to the prior immutable Edge image with the
  dark overlay; Source Proxy and Trading System are untouched.
- Preflight found an honest external dependency: the configured SGP host has
  no locally pinned SSH host key. Its new key will not be accepted
  automatically. The activation may continue only after an independently
  verified SGP host-key pin is available; no substitute test signer, Edge JWKS
  change or copied Control API private key is permitted.

### 2026-08-28 — activation preparation evidence

- Added the exact literal `execution:manager-v2:read` to the Control API
  delegated-read allowlist. It does not add a scope, wildcard, command claim or
  browser credential. TypeScript build and the focused
  `execution-delegation.spec.ts` gate passed **5/5**, including a rejection of
  `execution:manager-v2:*`.
- Added `deploy/execution-manager-v2/compose.paper-read.yaml`. Rendered with
  the existing Manager-v2 runtime env, it has
  `EDGE_MANAGER_V2_READ_ENABLED=true` while source probes, projection
  ingestion, analytics, realtime SSE and command relay remain `false` and the
  environment remains `paper`.
- Built the current-worktree Rust Edge candidate successfully:
  local image ID
  `sha256:acf792c7831f1f7a16dcf2a004fa797a9e9b4812ba6b83f6fd0a3ee216f995db`.
  It is a local qualification candidate only, not a published/signed release
  or production-authoritative evidence.
- Baseline inspection found the current Edge healthy on the prior immutable
  image, with the separately-qualified Source Proxy healthy and both Manager
  issuer/facade containers running. No container, Source Proxy config,
  Trading System, database, role, secret, JWT/JWKS or business data was
  changed during preparation.
- **Current gate:** no trusted SGP SSH host-key pin is available locally, so
  the Control API private signer and mTLS client cannot be accessed safely for
  the real positive probe. The Edge container has therefore **not** been
  recreated and the Manager gate is still false in the active runtime. The
  next permitted input is an independently verified SGP host-key fingerprint
  (or a pre-pinned `known_hosts` line); then deploy the exact Control API/Edge
  candidate pair, mint one fresh assertion and run the frozen positive/
  negative qualification with rollback on any failure.

### 2026-08-28 — owner authorization to execute the runtime change

- The owner explicitly confirmed the scanned SGP ED25519 host-key fingerprint
  `SHA256:nEK3LhBMDQiTwkai9JlAV8MsUWW7SoHrntyFSrUlvgw` for a dedicated
  secure activation-only `known_hosts` pin, and authorized the required
  rolling deployment scope: the SGP `control-api` and the AWS
  `portal-execution-edge-execution-edge-1` container.
- No other runtime mutation is approved. In particular, Source Proxy,
  `portal_manager_issuer`, `portal_manager_read`, V1/D4/projection services,
  database/data/role/secret/JWKS authority and all non-Manager flags remain
  unchanged. The new Control API image may mint only the exact
  `execution:manager-v2:read` assertion; it adds no public/browser route.
- Before each mutation, inspect the exact current image/config/health and
  retain the predecessor image/config identifiers. If SGP Control API fails
  health, the Edge fails health/readiness, a positive source call fails, a
  negative authorization test succeeds unexpectedly, or any non-Manager flag
  drifts, roll back the affected service immediately to its predecessor. No
  source fallback, manual JWT construction, direct database query or third
  service restart is permitted.

### 2026-08-28 — secure SGP access preflight result

- The owner-confirmed SGP ED25519 fingerprint was rescanned, matched exactly,
  and installed mode `0600` in the private activation-only host pin. Strict
  host-key verification now succeeds; no global `known_hosts` entry was
  changed.
- The existing AWS operator key was then tried key-only against the two
  explicitly bounded conventional SGP accounts (`bobby`, then `root`). Both
  were denied by SGP public-key authentication. No password attempt, user
  enumeration, SSH configuration change, key reset, Control API/Edge deploy or
  container restart was attempted.
- **Current gate:** the actual SGP management identity is absent from the
  available private inputs. The next permitted input is the approved SGP SSH
  username plus its existing private-key reference, or another already
  authorized management path. This is an external access-identity dependency,
  not an implementation defect. AWS Edge remains on its prior healthy image
  with the active Manager gate false.

### 2026-08-28 — SGP identity/trust verification and one-shot issuer freeze

- The owner installed the approved operator public key for the bounded SGP
  `bobby` account. Strict SSH now succeeds using the separately pinned,
  owner-confirmed ED25519 host key; the pin remains private and no global
  `known_hosts` entry changed. The account has passwordless `sudo`; Docker is
  intentionally accessed only through `sudo -n`.
- Read-only inventory found both long-running SGP Control API stacks healthy
  but deliberately `FEATURE_EXECUTION_EDGE=false`. Neither is an activation
  target and neither will be restarted. The private D3 identity inventory is
  present outside those containers: the delegation key, Edge-server CA, and
  SGP mTLS client certificate/key have the documented `root:portal-runtime`
  permissions.
- The non-secret RSA modulus hash from the SGP delegation private key matches
  the active AWS Edge JWKS key `portal-d3-b69d63fc1a88a0a4`. The SGP client
  certificate issuer is the exact CA trusted by the active Edge and is valid
  through 2027-02-20. No private-key, certificate body, JWT, credential, or
  business payload was read or recorded.
- **Frozen operational correction:** use a one-shot, network-disabled Control
  API candidate container only to issue the existing bounded assertion corpus;
  do not deploy or restart a Control API service. Before that run, extend the
  existing offline corpus tool so its positive resource is a closed enum of
  `execution:command-center` or the exact
  `execution:manager-v2:read` resource. The Manager invocation selects the
  latter, `paper`, a 45-second TTL, the existing matching key ID, a fresh
  caller-owned mode-0700 directory, and no public listener.
- This is the smallest code/config scope needed for the real probe. It creates
  no database state, Portal API route, browser credential, role, CA, JWKS
  change, or long-running SGP service change. The candidate image is an
  owner-approved local qualification artifact, not a published/signed release.
  Code/build/tests must pass before transfer to SGP; the assertion directory
  and all tokens are deleted after the bounded probe. Any candidate failure
  stops before the AWS Edge mutation.
- After a successful one-shot issuance, recreate only the AWS Edge with the
  existing Paper Manager overlay, inspect all inherited dark flags, run the
  frozen positive/negative mTLS matrix, and roll that one container back to
  its retained immutable predecessor on any failure. Source Proxy, Manager
  issuer/facade, Trading System, database, V1/D4, projection, SSE and command
  paths remain out of scope.

### 2026-08-28 — bounded assertion-corpus implementation and local gate

- Extended the existing `execution-d3-assertions` offline CLI rather than
  adding a second signer path. Its optional `--resource` is a closed TypeScript
  enum: the historic `execution:command-center` default or the exact
  `execution:manager-v2:read` literal. A wildcard, arbitrary execution
  resource, new scope, or command claim cannot be selected.
- The manifest now records only the selected resource name, never a token. The
  positive Manager assertion continues to use the existing
  `ExecutionDelegationService`, RS256 key ID, fixed `execution.read` scope,
  `paper` environment and 45-second caller-selected corpus TTL; negative cases
  remain the existing bounded D3 matrix.
- Local isolated evidence, in an ephemeral pinned
  `node:22.23.2-alpine3.24` container with the worktree mounted read-only:

  ```text
  npm ci --no-audit --no-fund
  npm run build
  npx vitest run test/execution-delegation.spec.ts test/execution-d3-assertions.spec.ts \
    --maxWorkers=1 --no-file-parallelism
  # 2 files passed; 8 tests passed; 0 failed
  ```

- The new test proves a Manager valid assertion carries only the exact named
  resource and that `execution:manager-v2:*` is rejected before any private
  key file is read. The ephemeral test container exited and left no
  `node_modules`, token, key, test output or runtime mutation in the worktree.
- **Next bounded action:** build this tested Control API image locally, record
  its content ID, transfer it through the pinned SGP channel, and run it once
  with `--network none`, read-only root, the existing root-owned signer mount
  and a fresh SGP 0700 assertion directory. A failed build/transfer/one-shot
  gate stops before any Edge replacement.

### 2026-08-28 — one-shot candidate image build and offline smoke

- Built the Control API candidate from commit `8569428` with the pinned
  `node:22.23.2-alpine3.24` base. Local immutable image reference:
  `portal-control-api-manager-v2:8569428`; local image ID:
  `sha256:05ef7199760bd08928416fa9a6fad868f76e094131e81fb8701b634ba4542f54`
  (64,532,522 bytes). It is a local qualification candidate only and has not
  replaced, restarted, published or signed any Control API runtime image.
- Exercised the final compiled CLI from that image under the intended one-shot
  constraints: `--network none`, read-only root filesystem, all capabilities
  dropped, `no-new-privileges`, a bounded noexec tmpfs, caller UID, a temporary
  0600 RSA key mount and a fresh 0700 evidence directory. It wrote the
  11-record corpus without token output; the manifest reports only
  `execution:manager-v2:read` and `valid.jwt` is mode 0600.
- A first local smoke preflight stopped before the container began because the
  sandbox disallows `chown` on its temporary directory. Re-running with that
  directory owner's UID passed; this is not a candidate/runtime defect. Both
  paths used a cleanup trap, and the disposable key, JWT corpus and directory
  were removed. No SGP/AWS container or data changed.
- **Next bounded action:** check that the candidate tag is absent on SGP, then
  stream the image directly through the strict pinned SSH session to
  `sudo -n docker load` (no tarball retained). After image-ID verification,
  run the same isolated signer against the pre-existing SGP secret files.

### 2026-08-28 — private Paper runtime qualification closeout

- The candidate image was streamed directly through the pinned SGP SSH channel
  and its loaded image ID exactly matched the local build ID. It ran only as
  `docker run --rm --network none --read-only` with all capabilities dropped,
  no public port, the existing root-owned delegation-key mount, and a
  short-lived mode-0700 corpus directory. The real SGP signer preflight
  produced the exact Manager resource, 11 negative/positive corpus records and
  a mode-0600 valid token; all preflight artifacts were removed.
- Two initial operator-runner attempts stopped before any `curl` request: SGP
  lacks `jq`, and its deliberately root-only runtime parent prevents the
  operator from traversing a temporary child directory. Both traps removed the
  corpus. The final matrix used an owner-only `mktemp` directory under `/tmp`
  (0700) while the signer key remained root-only under `/srv`; this is the
  correct ephemeral boundary and all artifacts were removed after the run.
- Immediately before mutation, the retained predecessor Edge was healthy on
  `ghcr.io/bobbyaxerol/portal-execution-edge@sha256:c67dc1dcb938fc1fa64070ac72d4e1dcc5cace2355ce813e2a3dfc89ba7a480b`.
  The only runtime mutation was a replacement of
  `portal-execution-edge-execution-edge-1` with the existing tested candidate
  `portal-execution-edge-manager-v2:1a6f99b-activation`
  (`sha256:acf792c7831f1f7a16dcf2a004fa797a9e9b4812ba6b83f6fd0a3ee216f995db`).
  No Control API service was restarted; Source Proxy, Manager issuer/facade,
  Trading System, PostgreSQL, roles, secrets and JWKS were not changed.
- The live container is `running/healthy`, restart count 0, with actual flags:
  `EDGE_ENVIRONMENT=paper`, `EDGE_MANAGER_V2_READ_ENABLED=true`, and source
  probes, projection ingestion, realtime SSE, analytics query and command
  relay all `false`. Source Proxy, both Manager containers and projection
  PostgreSQL remain healthy with restart count 0.
- SGP→AWS mTLS TLS 1.3/HTTP-2 qualification passed exactly 6/6; only bounded
  metadata is retained here:

  | Case | Expected | Result | Bytes | Elapsed | SHA-256 body |
  | --- | ---: | ---: | ---: | ---: | --- |
  | catalogue | 200 | 200 | 130537 | 0.287509 s | `aa8a173fbb5e98f583419c44a04a3b297c4bd4b703766ab71f7504da259d5e68` |
  | capabilities | 200 | 200 | 1520 | 0.171247 s | `5b448e1dfeeaf22e6e63e8441cd5b4aa9f517fd015ac4951994560c533885346` |
  | `portfolio` projection, limit 1 | 200 | 200 | 1931 | 0.198759 s | `f1d91cc46db0058b69daa8867dc48d14d914e6f7e78f9d20c698ab2e6a8085be` |
  | first catalogue relation, limit 1 | 200 | 200 | 2103 | 0.184978 s | `547fd9009f46a2b3c9a242cbe294002315fa9a265eb85a54cc59e8069ca6549d` |
  | valid mTLS, no JWT | 401 | 401 | 0 | 0.199595 s | empty SHA-256 |
  | valid mTLS, valid JWT with `execution:command-center` | 403 | 403 | 0 | 0.201578 s | empty SHA-256 |

  The successful calls carried only the fresh 45-second
  `execution:manager-v2:read` assertion; tokens, header files and response
  bodies were never printed or retained.
- Post-check from the new Edge start found six Manager Source Proxy requests
  and zero V1, event or command requests; Edge error-line count was zero and
  no temporary assertion directory remained. The one-shot Control API
  candidate image was verified unused and removed from both SGP and local image
  stores. The active Edge candidate remains retained by its running container.
- Compose emitted a pre-existing projection-volume label mismatch warning but
  explicitly left that volume untouched. Projection is dark and was not
  restarted; reconciling a shared projection-volume label is outside this
  Manager read qualification and would require separate data-authority review.
- **Closure:** this phase is runtime-qualified for the fixed private Paper
  profile. A later Portal Control API/BFF consumer may call these four internal
  routes for product delivery, but it is not required for this route/runtime
  qualification and is not a defect of it. Browser/UI, cache/projection,
  sandbox/canary/live and command scope remain independently gated.
