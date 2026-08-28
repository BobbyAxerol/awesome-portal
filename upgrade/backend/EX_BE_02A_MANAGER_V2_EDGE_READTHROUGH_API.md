# EX-BE-02A — Manager-v2 Edge Read-through API

Status: **BACKEND_COMPLETE / RUNTIME_ACTIVATION_PREPARED / SGP_ACCESS_IDENTITY_REQUIRED / PAPER_ONLY**

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
