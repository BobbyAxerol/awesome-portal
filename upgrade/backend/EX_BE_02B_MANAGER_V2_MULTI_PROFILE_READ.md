# EX-BE-02B — Manager-v2 Multi-profile Read Readiness

Status: **IMPLEMENTED / PRIVATE_READ_READY / PAPER_ACTIVE_HISTORICAL / SANDBOX_LIVE_DEPLOYMENT_READY / NO_LIVE_TRADING_TRAFFIC**  
Date: 2026-08-28  
Portal branch: `feat/manager-v2-paper-read`  
Predecessor: [EX-BE-02A — Manager-v2 Edge Read-through API](./EX_BE_02A_MANAGER_V2_EDGE_READTHROUGH_API.md)  
Trading System owner journal: `portal-execution-campaign/PORTAL_EXECUTION_OWNER_CAMPAIGN_UNIFIED_PLAN.md` §TS-OC-09

## Goal

Make the already-qualified Manager-v2 read-through path deployable for the
Trading System execution modes, without adding a new Portal data model,
browser route, direct database access, generic SQL, cache/projection, command
relay, Redis, broker, Event or replay behavior.

| Profile | Edge environment | Meaning |
| --- | --- | --- |
| `PAPER_BINANCE_USDM` | `paper` | Existing active and backward-compatible read path. |
| `SANDBOX_BINANCE_USDM` | `sandbox` | Read-only Sandbox path. |
| `LIVE_BINANCE_USDM` | `live` | Read-only Live path, including the Live Canary governance stage. |

Canary is not a fourth execution mode.  It remains a `promotion_stage` inside
the Live profile when the Trading System supplies that authoritative field.
The current Manager catalogue has no such marker, so this work must not invent
`mode=canary` or pretend to split Live records into Canary and Full records.

## Approved scope

1. Keep the four internal Rust Edge routes and sealed Manager-v2 client.
2. Bind each Edge deployment to one exact profile by deployed configuration;
   the caller cannot choose a profile through URL, query, header, relation or
   cursor.
3. Reuse the existing private mTLS transport and exact delegated
   `execution:manager-v2:read` resource.  The Edge environment/audience and
   source-proxy profile deployment remain exact; no wildcard is introduced.
4. Generalize Source Proxy deployment templates so a dedicated profile instance
   can reach its matching Trading-System Manager issuer/facade.  It still owns
   the upstream mTLS leaf and Portal code never receives a Trading DB secret,
   issuer key or Manager JWT.
5. Keep `EDGE_COMMAND_RELAY_ENABLED=false`, all D4/V1 compatibility behavior,
   projection/SSE gates and public/browser exposure unchanged.

## Invariants and test gates

- The active Paper container and route must remain compatible throughout.
- Every Manager call stays bounded by the existing 200-row / 1 MiB contract.
- A sandbox assertion cannot reach a Paper or Live Edge; a Live assertion
  cannot reach Paper or Sandbox.  Unknown/mismatched environment/resource or
  disabled client stays denied before source access.
- Test profile configuration parsing, source-proxy render, Rust auth boundary,
  frozen contract compatibility and exact route allowlist.  Runtime
  qualification may make only read calls; it must not place/cancel/amend an
  order or touch broker traffic.
- Rollback removes only new profile-specific overlays/material and leaves the
  active Paper Edge/Source Proxy and every Trading System command path intact.

## Current source fact

The Trading-System owner’s read-only inventory confirms `paper`, `sandbox` and
`live` are the schema execution modes.  Canonical Sandbox accounts/deployments
exist; canonical Live rows were not observed in the inspected core set.  This
is readiness evidence, not a synthetic Live qualification.  Once Live rows
exist, the deployed Live profile will return them through the same bounded
catalogue contract.

## Implementation journal

### 2026-08-28 — exact profile binding implemented

- Trading System Manager policy, issuer, verifier, response envelopes, source
  predicates and opaque cursors now bind the exact deployed
  `profile_id/environment/mode/venue`. The issuer includes `profile_mode` and
  `profile_venue`; a mismatch is denied before a source query. The historical
  Paper helper remains compatible, while the runtime decoder requires the
  deployment's exact profile for every `200` and `503` envelope.
- The Rust Edge accepts the configured profile only when its prefix matches
  `EDGE_ENVIRONMENT`, and requires the Control API assertion's `profile_id` to
  match exactly before it invokes the sealed Manager client. The client still
  has only the five owner-published GET operations; profile selection is not
  an HTTP parameter and relation access still first validates the owner
  catalogue/cursor binding.
- Control API assertion construction now emits an exact `profile_id` only for
  `execution:manager-v2:read`; it rejects a Manager assertion with no profile
  or with a profile from another environment. Existing non-Manager read
  resources remain unchanged.
- Added `manager-profile-read` to the Source Proxy renderer/preflight. It
  renders the frozen six-location Manager template and permits exactly two
  substitutions: the dedicated loopback facade and issuer ports. The
  preflight re-renders that expected output, so route/auth/TLS/header drift,
  V1/API-key fallback, a profile mismatch, or any extra substitution fails.
  Historical `manager-paper-read` remains byte-for-byte compatible.
- Added `deploy/execution-manager-v2/compose.profile-read.yaml` for a
  profile-specific Edge instance. It enables only Manager-v2 read and
  requires `EDGE_MANAGER_V2_PROFILE_ID`; projection ingestion, source probes,
  realtime, analytics and command relay stay false. The historical Paper
  overlay now fixes `PAPER_BINANCE_USDM` explicitly.
- Private Trading-System launch inputs now reserve distinct loopback pairs and
  Compose project names for concurrent profile instances: Sandbox `8123/8124`
  and Live `8223/8224`; the active historical Paper pair remains `8023/8024`.
  Those files are mode `0600` outside Git. `docker compose config --quiet`
  rendered both new profiles with their isolated project names and bindings;
  no container was started.

### 2026-08-28 — qualification evidence

- The Trading-System facade executed bounded `public.accounts` checks through
  its existing `REPEATABLE READ READ ONLY` / `SET LOCAL ROLE
  ts_portal_manager_read` path. With a fetch limit of one, the Sandbox query
  returned two internal rows (the normal `limit + 1` pagination look-ahead)
  and the Live query returned zero. Only profile/status/count evidence was
  retained; no business row, credential, token or query text was published.
  This proves source predicate reachability, not that Live has business data.
- Targeted Trading-System Manager suite:

  ```text
  pytest -q -p no:cacheprovider \
    tests/unit/test_portal_execution_owner_03c_identity_policy.py \
    tests/unit/test_portal_execution_owner_03c_manager_auth.py \
    tests/unit/test_portal_execution_owner_03c_manager_contract.py \
    tests/unit/test_portal_execution_owner_03c_relation_catalogue.py \
    tests/unit/test_portal_execution_owner_03e_contract.py \
    tests/unit/test_portal_execution_owner_03e_manager_facade.py \
    tests/unit/test_portal_execution_owner_03f_manager_issuer.py \
    tests/unit/test_portal_execution_owner_03f_publication.py
  # 44 passed; one pre-existing test-only HMAC key-length warning.
  ruff check … && ruff format --check …
  # passed; 6 files already formatted.
  ```

- Portal Rust Manager packages passed `cargo test --locked` for
  `manager-v2-contract`, `manager-v2-client` and `edge-service` (19 + 7 + 7
  tests); the prior same-source `cargo fmt --check` and strict Clippy gate also
  passed. Control API focused delegation/assertion tests passed 9/9 and its
  TypeScript build passed.
- `./scripts/execution-d2-test.sh` and the full
  `./scripts/execution-d2-test.sh --build-images` passed. The latter built
  temporary images, validated the generated Live-profile Nginx syntax, ran an
  isolated PostgreSQL/migrator/Edge fixture, and removed every disposable
  service, network and volume. The exact disposable Rust and Control API test
  directories were also removed. No existing Portal or Trading-System service
  was restarted or reconfigured.

## Deployment profile contract

For each new profile instance, the private release input must use the exact
following four-way binding. These are deployment values, not caller inputs and
not a generic table/SQL interface.

| Profile | Edge environment / assertion `profile_id` | Source Proxy mode / profile | TS loopback facade / issuer |
| --- | --- | --- | --- |
| `PAPER_BINANCE_USDM` | `paper` / `PAPER_BINANCE_USDM` | historical `manager-paper-read` | `8023` / `8024` |
| `SANDBOX_BINANCE_USDM` | `sandbox` / `SANDBOX_BINANCE_USDM` | `manager-profile-read` / `SANDBOX_BINANCE_USDM` | `8123` / `8124` |
| `LIVE_BINANCE_USDM` | `live` / `LIVE_BINANCE_USDM` | `manager-profile-read` / `LIVE_BINANCE_USDM` | `8223` / `8224` |

The Edge instance uses the profile overlay after D2-dark configuration; its
Source Proxy uses matching `SOURCE_PROXY_MANAGER_PROFILE_ID`,
`SOURCE_PROXY_MANAGER_FACADE_PORT` and `SOURCE_PROXY_MANAGER_ISSUER_PORT`.
The Proxy alone holds the Manager mTLS client leaf and obtains its short-lived
Manager JWT; the Portal process gets neither that JWT nor any Trading DB
credential. A dedicated deployment may now activate the corresponding
read-only profile without changing the Paper instance. This work does not
start that deployment, send order/fill command traffic, or imply that Live has
rows to return.

## Closure and rollback

EX-BE-02B is complete as a backend/read-plane implementation. It leaves no
unbounded data route: all current and future returned data still flows through
the 96-relation owner catalogue, safe-field redaction, exact profile predicate,
opaque cursor/key binding and the existing 200-row/1-MiB limits. It introduces
no command, CLI, broker, Redis, event/replay or direct-DB authority.

Rollback of a profile-specific deployment is limited to that profile's Edge,
Source Proxy overlay and two loopback Manager containers/configuration. The
historical Paper deployment, database roles/data and all trading execution
paths remain independent. There is no new technical-debt gate in this slice;
the only factual absence is Live business rows, which the API truthfully
returns as an empty bounded result until Trading System produces them.
