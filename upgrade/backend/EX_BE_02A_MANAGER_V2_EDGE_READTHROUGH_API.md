# EX-BE-02A — Manager-v2 Edge Read-through API

Status: **COMPLETE / BACKEND_ONLY / NO_RUNTIME_ACTIVATION**

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
