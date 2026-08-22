# EX-BE-07b — Source-backed Projection Repositories and Narrow Screen APIs

Status: `INTEGRATION_COMPLETE / SOURCE_ACTIVATION_AND_OPERATIONAL_EVIDENCE_PENDING`  
Date: 2026-08-22  
Authority: Portal-owned read projection and Portal-derived analytics only. The
Trading System remains the sole execution, risk, broker, ledger and command
authority.

## 1. Outcome and boundary

EX-BE-07b binds the six deterministic EX-BE-07a analytics contracts to a
source-backed, epoch-scoped PostgreSQL repository and exposes only the six
screen-shaped APIs required by Gate R2, Full Blotter, Alpha 360°, Portfolio
360° and Account/Broker 360°.

It does **not** add a generic analytics evaluator, a browser-to-Rust path, a
Trading System database/Redis/CLI read, a command relay, an execution side
effect, or a production activation. Both runtime flags remain false and every
registry delivery profile remains `fixture`.

The implemented read path is:

```text
browser
  -> TypeScript Control API (Portal session + workspace)
  -> reusable mTLS HTTP/2 connection + <=60 s delegated read JWT
  -> private Rust execution edge route
  -> REPEATABLE READ / READ ONLY active-epoch repository transaction
  -> typed EX-BE-07a pure Rust analytics engine
  -> execution.analytics.screen.v1 response
```

Source ingestion remains a separate responsibility. A future adapter may
write these Portal-owned projection tables from the Trading System's published
HTTP contracts only after contract, parity and cross-cell qualification. It
must never query Trading System private storage.

## 2. Projection schema and repository invariants

Migration `0003_analytics_source_projection.sql` adds two bounded projection
tables:

- `analytics_source_snapshots`: one header for an exact
  `(epoch, analytics_kind, resource_id, context_key)`;
- `analytics_source_facts`: ordered typed facts owned by that snapshot.

The snapshot records the source delivery profile, population completeness,
expected fact/population counts, source/projected timestamps, freshness policy,
projection sequence, adapter version, capability snapshot and source digest.
Facts record a closed fact-kind vocabulary, exact ordinal, source authority,
source timestamp and typed JSON payload. Database constraints reject unknown
profiles, analytics/fact kinds, authorities, negative counts, duplicate
ordinals and malformed digests.

`PgProjectionStore` publishes six typed loaders:

| Loader | Source key | EX-BE-07a engine |
|---|---|---|
| `load_capital_preview_source` | portfolio + currency | `build_capital_preview` |
| `load_order_funnel_source` | order | `build_order_funnel` |
| `load_insight_preview_source` | portfolio | `build_insight_batch` |
| `load_correlation_source` | portfolio | `build_correlation` |
| `load_capital_ledger_source` | portfolio | `build_capital_ledger` |
| `load_binding_exposure_source` | broker binding | `aggregate_binding_exposure` |

Every loader starts a PostgreSQL `REPEATABLE READ READ ONLY` transaction,
resolves the active workspace/environment epoch, then reads the header and its
facts inside that same snapshot. A read is refused when any of these holds:

- source snapshot is absent from the active epoch;
- requested and stored delivery profiles differ;
- verified live capability, epoch capability and source capability differ;
- epoch and source adapter versions differ;
- actual fact count differs from the declared expected count;
- source exceeds the 20,000-fact repository ceiling;
- fact kind, source vocabulary or typed payload is invalid.

Freshness is recomputed at server read time from the persisted source,
projection and policy timestamps. Payload-supplied quality cannot override the
persisted authority, completeness or freshness. Resource/context identity is
also injected from the authenticated route, so a payload cannot redirect a
result to another portfolio, order or binding.

## 3. Narrow API map

The browser calls only the same-origin TypeScript routes. Rust routes are
private and require both an accepted client certificate and an exact delegated
resource assertion.

| Screen | Same-origin Control API | Private Rust edge | Delegated resource |
|---|---|---|---|
| Gate R2 | `POST /api/v1/execution/approvals/:approvalId/capital-preview` | `POST /internal/v1/screens/gate-r2/:approvalId/capital-preview` | `execution:screen:gate-r2:<id>` |
| Full Blotter | `GET /api/v1/execution/orders/:orderId/funnel` | `GET /internal/v1/screens/blotter/orders/:orderId/funnel` | `execution:screen:blotter:<id>` |
| Alpha 360° | `POST /api/v1/execution/alphas/:alphaId/insight-previews` | `POST /internal/v1/screens/alpha-360/:alphaId/insight-previews` | `execution:screen:alpha-360:<id>` |
| Portfolio 360° | `GET /api/v1/execution/portfolios/:portfolioId/correlation` | `GET /internal/v1/screens/portfolio-360/:portfolioId/correlation` | `execution:screen:portfolio-360:<id>` |
| Portfolio 360° | `GET /api/v1/execution/portfolios/:portfolioId/capital-ledger` | `GET /internal/v1/screens/portfolio-360/:portfolioId/capital-ledger` | `execution:screen:portfolio-360:<id>` |
| Account/Broker 360° | `GET /api/v1/execution/broker-bindings/:bindingId/exposure` | `GET /internal/v1/screens/account-broker-360/:bindingId/exposure` | `execution:screen:account-broker-360:<id>` |

There is deliberately no `/analytics`, `/query`, SQL-like, formula-selection or
arbitrary-resource endpoint. The allowlist is compiled into both BFF and edge.
Identifiers are bounded and must match `[A-Za-z0-9._-]{1,128}`.

## 4. Authentication, transport and failure contract

The Control API's existing `SessionGuard` supplies the authenticated user,
session and workspace. It never forwards the browser cookie or a bearer token
to AWS. Instead it issues a short-lived, session-bound `portal.execution.read`
assertion for exactly one screen resource and reuses one verified mTLS HTTP/2
session to the Rust edge.

Transport bounds are 64 KiB per request and 2 MiB per response. HTTPS, CA,
client certificate/key, delegated signing key, audience, issuer and environment
are mandatory whenever the feature is enabled. Rust also requires a current,
healthy, verified capability snapshot before a projection read.

Failure semantics are intentionally closed:

- disabled route or missing source: `404`;
- missing browser session/private bearer: `401`;
- invalid delegated scope/resource/environment: `403`;
- invalid identifier/body: `400`;
- source profile/capability/adapter/count/payload/freshness foundation mismatch:
  `503`;
- bounded transport timeout/invalid upstream response: safe `502/504` problem
  response from the Control API;
- unexpected repository fault: `500`, with no source payload or secret in the
  public error.

The response schema is `execution.analytics.screen.v1` and preserves:

- projection `epoch_id` and `projection_sequence`;
- `source_snapshot_id` and verified `capability_snapshot_id`;
- source `delivery_profile` and `freshness_policy_version`;
- server `read_at`;
- the EX-BE-07a `DerivedAnalytics<T>` envelope with formula version, source
  authority, oldest/worst freshness and explicit completeness/warnings.

All decimals remain JSON strings. Currencies are never implicitly combined.

## 5. Canonical contract and runtime flags

The public routes and all six response shapes are frozen in:

- `packages/contracts/openapi/execution-analytics.openapi.json`;
- `packages/contracts/generated/execution-analytics.d.ts`;
- `packages/contracts/fixtures/execution-analytics.capital-preview.valid.json`.

Generation and digest drift are part of `scripts/contracts-test.sh`. Runtime
delivery stays dark by default in local, production and AWS-edge Compose:

```dotenv
FEATURE_EXECUTION_ANALYTICS_QUERY=false
EDGE_ANALYTICS_QUERY_ENABLED=false
EDGE_ANALYTICS_SOURCE_PROFILE=fixture
```

Turning on only one side cannot create a usable public path. Activation also
requires matching registry profile, projection epoch/source profile, verified
capability identity, real source parity and owner approval.

## 6. Verification evidence

The reproducible gates cover:

- all six PostgreSQL source repositories against PostgreSQL 16;
- active-epoch isolation and one-snapshot count consistency;
- profile and capability mismatch refusal;
- typed source payloads flowing through all six EX-BE-07a engines;
- exact decimal/currency behavior inherited from EX-BE-07a;
- mTLS/delegated-resource configuration and BFF bounds;
- OpenAPI -> committed TypeScript generation and fixture drift;
- locked Cargo dependencies, rustfmt and strict Clippy.

No test requires or mutates the Trading System. Final reproducible evidence on
2026-08-22:

- `./scripts/execution-edge-test.sh`: **74/74 Rust tests passed**, including the
  PostgreSQL 16 repository integration suite; `cargo fmt --check` and strict
  workspace Clippy (`-D warnings`) passed;
- `./scripts/control-api-test.sh`: **105/105 tests passed**, including the
  default-dark configuration, exact delegated-resource and mTLS fail-closed
  boundary tests against fresh PostgreSQL;
- `sudo -n ./scripts/contracts-test.sh`: **9/9 contract tests passed**, with
  both generated TypeScript declarations byte-for-byte current;
- coordinated frontend regression gate: **807 passed, 1 skipped**, followed by
  a successful Vite production build. Existing React `act(...)` diagnostics and
  bundle-size warnings were non-failing and are not hidden by this backend
  phase.

- `./scripts/portal verify`: root monorepo source, policy and rendered Compose
  verification passed with the new tracked contracts, services and dark flags.

No test above contacted or modified the Trading System.

## 7. Claude frontend handoff

Claude may now implement the adapter boundary against the generated contract,
while keeping `delivery_profile=fixture` and the backend feature disabled:

1. use the six same-origin routes above; never call the private Rust routes;
2. preserve decimal strings through view models and formatting;
3. render profile, epoch, capability, projection sequence and freshness visibly
   in diagnostics/evidence UI;
4. treat `404` as disabled/unavailable, `503` as source not trustworthy/ready,
   and `401/403` as session/authorization failures — never replace them with
   zero or stale fixture data without a visible fixture label;
5. add explicit fixtures for complete, partial/stale, missing, forbidden and
   capability/profile mismatch states;
6. keep Gate R2 approve/apply disabled when capital preview says
   `decision_eligible=false` or the panel is unavailable;
7. do not flip registry or runtime flags as part of frontend wiring.

Frontend work can proceed independently on mapping, rendering and failure
states. It does not wait for source activation.

## 8. Activation gates and next backend slice

EX-BE-07b is integration-complete in code but not production-active. Before
moving any screen from `fixture` to `shadow`, the owner must supply and approve:

- a transactionally consistent source adapter using published Trading System
  read contracts;
- golden/replay parity for every fact kind and count boundary;
- SGP↔AWS mTLS/delegated-auth live probes and capability negotiation evidence;
- active/previous epoch cutover, restart, gap and mismatch drills;
- screen-specific load, memory, latency and 2 MiB response-size evidence;
- observability, redaction, alert, rollback and DR evidence;
- an explicit registry/runtime activation decision.

The next safe backend slice is **EX-BE-08a — source-ingestion parity,
qualification and observability** for these read-only screens. `EX-BE-05b`
remains separately blocked on a published, authenticated Trading System command
capability; EX-BE-07b does not authorize it.
