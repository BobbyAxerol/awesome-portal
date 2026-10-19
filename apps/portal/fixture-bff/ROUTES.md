# Fixture BFF: routes

Lane: `FIXTURE_LAB`. The answers come from the Playwright doubles under
`apps/portal/frontend/e2e` and the published synthetic fixtures in
`packages/contracts/fixtures`. **Not acceptance evidence.**

## What an nginx must send here

The server listens on **port 4100** (`PORT`). Everything below, and nothing else, goes to it;
every other `/api/**` path keeps going to the real services.

| nginx match | Why |
|---|---|
| `location ^~ /api/v1/execution/` | every Execution BFF read the V2 screens make |
| `location = /api/admin/access/self` | the session capabilities, so the screens are not fail-closed |
| `location = /api/admin/profile-access/v2/effective` | the Access screen's read (exact match: `/api/admin/profile-access` and `/activity` stay real) |
| `location = /api/admin/accounts` and `location ^~ /api/admin/accounts/` | the Users roster and detail |
| `location = /api/admin/step-up` | the Users step-up state |
| `location ^~ /__fixture/` | the lane marker and the health check (`/__fixture/healthz`) |

Keep `proxy_http_version 1.1`, `proxy_buffering off` and the `Host` / `X-Forwarded-*` headers the
`/api/` block in `deploy/nginx/portal.conf` sets. The two `/stream` routes send one terminal
heartbeat and end. The server never reads a request header, so the preview's session cookie and CSRF
token pass through untouched and unused.

## Not served here (stay on the real services)

These are called by the shell or by other screens. The fixture BFF answers them
`404 {"error":"FIXTURE_ROUTE_NOT_SERVED"}` rather than invent a body, so route them elsewhere:

- `/api/auth/*` (session and CSRF), `/api/health`, `/api/ready`, `/api/control/healthz`
- `/api/v1/portal/*` (registry, links, summary, capabilities), `/api/v1/alphas*`
- `/api/v1/research/*`, `/api/v1/quantbt/*`, `/api/runs*`, `/api/strategies`, `/api/config/*`
- `/api/admin/profile-access` (the legacy policy matrix), `/api/admin/profile-access/activity`,
  `/api/admin/profile-access/v2/eligibility`, `/api/admin/profile-access/v2/self-navigation`
- any other `/api/admin/*`

`e2e/fixtures.ts` stubs several of these inline for the visual baseline; they were not extracted
into the doubles, so this server does not carry them. A preview that needs a signed-in shell uses
the real `portal-api` for them. Because `/api/auth/context` then names the REAL principal, set
`FIXTURE_USER_ID` to that principal id, or the Access screen (which refuses a body for another
user) will refuse the fixture's.

## How an answer is chosen

`e2e/bffAnswerer.ts` (`answerFixtureRequest`) takes the request as data and answers it as data. For
`/api/v1/execution/**` it asks the doubles in the order `execution-v2-s1.spec.ts` stubs them
(`operationsV2` and `screensV2` on):

1. `bffDoubleAlpha`, `bffDoubleAccount`, `bffDoublePortfolios`, `bffDoubleOverview` (sparse-realistic V2 profile);
2. `bffDoubleV2` (operations queue and incident root);
3. `bffDouble` (the canonical-fixture routes the V1 journeys read).

A request none of them answers is the doubles' own `501 bff_double_gap`; the server turns that into
`404 FIXTURE_ROUTE_NOT_SERVED`. Methods:

- `GET` and `HEAD` as modelled.
- A write the doubles model keeps exactly their behaviour (the table's POST rows). They answer
  canned bodies and **store nothing**: an approval "created" or an incident "acknowledged" here is
  gone on the next read. `FIXTURE_WRITES=refuse` turns every non-GET into `405` instead.
- A write on a served path the doubles do not model is `405 FIXTURE_METHOD_NOT_ALLOWED`; on an
  unserved path, `404`.
- A command plan is always the canonical `BLOCKED` answer (the real relay is off); the specs'
  `ACCEPTED`, `UNKNOWN`, then `BLOCKED` walk is disabled because it depends on call order.

Every response, including every refusal and the event streams, carries `X-Fixture-Lane: FIXTURE_LAB`.

## Scale

`FIXTURE_SCALE` (`small`, `medium` default, `large`) adds generated rows of the same wire shapes
(`e2e/bffScale.ts`): deterministic, seeded, no clock, no `Math.random`.

| list | small (the specs) | medium | large |
|---|---|---|---|
| alphas / deployments | 5 / 5 | 40 / about 60 | 120 / about 180 |
| portfolios | 6 (9 in total) | 25 | 60 shown of 75 (`truncated: true`) |
| accounts (bindings): live / paper / sandbox | 3 / 1 / 1 | 50 / 20 / 10 | 150 / 60 / 30 |
| blotter orders (keyset pages of up to 200) | 137 | 300 | 1500 |
| operations | 12 | 120 | 400 |
| approvals | 5 | 30 | 90 |
| users | 123 | 123 | 123 |

Money stays an exact decimal string, sums are exact and per currency (a generated portfolio books
deployments in its base currency only; a fleet row spanning two portfolios shows two currency lines,
never one total), an unowned alpha has `owner: null`, an account whose credential is not published
has no balance, and the states vary on purpose: attention, stale, expired, suspended, blocked,
failed, uncertain, overdue.

Details of a generated id are served for portfolios (resource, capital, equity), accounts (resource
and binding), alphas and operations. A generated approval's detail reuses the canonical review
template with the id substituted, and a generated account has no orders, fills or equity series
(the double publishes none for any account but `acc_bnc_core`).

## Clock

`FIXTURE_NOW_ISO` (default `2026-08-22T13:00:00Z`, the operations double's instant) places the
generated operations relative to it. It cannot move the browser's clock: an age label is computed in
the browser, so a preview opened at a real date shows fixture rows that are old by that date's
standard. That is honest; to review the screens at the doubles' instant, fix the browser clock, or
set `FIXTURE_NOW_ISO` to the deploy time to make the generated operations recent (the hand-written
rows keep their dates).

## Routes

<!-- routes:begin (generated from apps/portal/frontend/src/fixtureBff/routeTable.ts) -->

| Method | Path | Status | Answered by | Served for real by | Schema | Note |
|---|---|---|---|---|---|---|
| GET | `/__fixture/lane` | 200 | server | fixture lane | none | lane, not_acceptance, source, scale |
| GET | `/__fixture/healthz` | 200 | server | fixture lane | none |  |
| GET | `/api/admin/access/self` | 200 | bffAnswerer (the manager session the V2 spec inlines) | control-api | none | portal.owner-access.v1; no published schema |
| GET | `/api/admin/profile-access/v2/effective` | 200 | bffDoubleAccess | none yet | `execution-access.openapi.json#/components/schemas/AccessEffective` | no controller in apps/control-api/src at this commit; state chosen by workspace_id |
| GET | `/api/admin/accounts` | 200 | bffDoubleUsers | control-api | none | 123 accounts, one unpaged list; portal-account-lifecycle.openapi.json |
| GET | `/api/admin/accounts/{user_id}` | 200 | bffDoubleUsers | control-api | none |  |
| GET | `/api/admin/step-up` | 200 | bffDoubleUsers | control-api | none |  |
| GET | `/api/v1/execution/retained-review` | 404 | bffDouble | control-api (typed refusal) | none | UDB_RETAINED_REVIEW_NOT_CONFIGURED: a normal stack has no retained review |
| GET | `/api/v1/execution/runtime-manifest` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/screen-contracts` | 200 | bffDouble | control-api | DRIFT `execution-screen-bff.v1#/$defs/CatalogueResponse` |  |
| GET | `/api/v1/execution/activation/capabilities` | 200 | bffDoubleOverview | control-api | `execution-staged-activation.v1#/$defs/CapabilitiesResponse` |  |
| GET | `/api/v1/execution/durable-mirror/integrity` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/derivations/source-health` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/profiles/{environment}/realtime-snapshot` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/profiles/{environment}/stream` | 200 | bffDouble | control-api | none | text/event-stream, one terminal heartbeat |
| GET | `/api/v1/execution/command-center` | 200 | bffDouble | control-api | `execution-command-center-snapshot.v1#/` |  |
| GET | `/api/v1/execution/command-center/realtime-snapshot` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/command-center/stream` | 200 | bffDouble | control-api | none | text/event-stream, one terminal heartbeat |
| GET | `/api/v1/execution/compositions/{surface}` | 200 | bffDoubleOverview | control-api | none | surface: command-center, operations, waivers, admin-action-drawer |
| GET | `/api/v1/execution/screens/{environment}` | 200 | bffDouble | control-api | none | environment: paper, sandbox, live |
| GET | `/api/v1/execution/screens/blotter` | 200 | bffDoubleOverview | control-api | none | keyset pages (after/before); filters status_bucket, venue, symbol, side |
| GET | `/api/v1/execution/screens/paper/{deployment_id}` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/screens/paper/{deployment_id}/vn-market` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/screens/accounts/{account_id}` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/orders/{order_id}/funnel` | 200 | bffDoubleOverview | control-api | none | order ids follow the blotter (ord_00001 ... ord_<scale count>) |
| GET | `/api/v1/execution/derivations/conditional-groups/{group_id}` | 200 | bffDoubleOverview | control-api | none |  |
| GET | `/api/v1/execution/alphas` | 200 | bffDouble (alphaFleet) | control-api | `execution-alpha-fleet-list.v2#/$defs/AlphaFleetResponse` | filters search, stage, owner, health; sort; keyset after/before |
| GET | `/api/v1/execution/alphas/equity-sparklines` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/alphas/{alpha_id}/stage-drift` | 200 | bffDoubleAlpha | control-api | DRIFT `execution-alpha-stage-drift.v2#/` |  |
| GET | `/api/v1/execution/alphas/{alpha_id}/query-analytics` | 200 | bffDouble | control-api | `execution-query-analytics.v1#/` |  |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}` | 200 | bffDoubleAlpha | control-api | DRIFT `execution-resource-scoped.v2#/$defs/AlphaScopedResourceWireResponse` | any other id answers the same template; alpha_denied 403, alpha_down 503, alpha_empty empty |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}/orders` | 200 | bffDoubleAlpha | control-api | none |  |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}/fills` | 200 | bffDoubleAlpha | control-api | none |  |
| GET | `/api/v1/execution/derivations/alphas/{alpha_id}/activity` | 200 | bffDoubleAlpha | control-api | none |  |
| GET | `/api/v1/execution/views/observed-timeline` | 200 | bffDoubleAlpha | control-api | none |  |
| GET | `/api/v1/execution/views/equity-chart` | 200 | bffDoublePortfolios (portfolio), bffDoubleAlpha (alpha), bffDoubleAccount (account), bffDouble (other) | control-api | none | subject_kind alpha, portfolio, account |
| GET | `/api/v1/execution/market/venue-candles` | 200 | bffDoubleAlpha | control-api | none | a typed absence, not a series |
| GET | `/api/v1/execution/market/candles` | 200 | bffDouble (canonical L0 body) | control-api | `execution-market-context.v1#/$defs/CandlesResponse` |  |
| GET | `/api/v1/execution/manager/current/{relation}` | 200 | bffDouble | control-api | none | relation from the approved catalogue of 15; any other is not served |
| GET | `/api/v1/execution/portfolios` | 200 | bffDoublePortfolios | control-api | `execution-portfolio-list.v1#/$defs/PortfolioListResponse` |  |
| GET | `/api/v1/execution/resources/portfolios/{portfolio_id}` | 200 | bffDoublePortfolios | control-api | DRIFT `execution-resource-scoped.v2#/$defs/PortfolioScopedResourceWireResponse` |  |
| GET | `/api/v1/execution/derivations/portfolios/{portfolio_id}/capital` | 200 | bffDoublePortfolios | control-api | none |  |
| GET | `/api/v1/execution/portfolios/{portfolio_id}/capital-ledger` | 200 | bffDoublePortfolios | control-api | none |  |
| GET | `/api/v1/execution/portfolios/{portfolio_id}/correlation` | 200 | bffDoublePortfolios | control-api | none | every other portfolio: 503 ANALYTICS_UPSTREAM_ROUTE_ABSENT |
| GET | `/api/v1/execution/portfolios/{portfolio_id}/cross-equity` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/portfolios/{portfolio_id}/query-analytics` | 200 | bffDouble | control-api | `execution-query-analytics.v1#/` |  |
| GET | `/api/v1/execution/derivations/deployments/{deployment_id}/execution-quality` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/broker-bindings` | 200 | bffDoubleAccount | control-api | `execution-manager-lists.v1#/$defs/BindingsResponse` | one environment per read; keyset after |
| GET | `/api/v1/execution/broker-bindings/{binding_id}` | 200 | bffDoubleAccount | control-api | `execution-manager-lists.v1#/$defs/BindingDetailResponse` |  |
| GET | `/api/v1/execution/broker-bindings/{binding_id}/exposure` | 200 | bffDoubleAccount | control-api | none |  |
| GET | `/api/v1/execution/resources/accounts/{account_id}` | 200 | bffDoubleAccount | control-api | DRIFT `execution-resource-scoped.v2#/$defs/AccountScopedResourceWireResponse` |  |
| GET | `/api/v1/execution/resources/accounts/{account_id}/orders` | 200 | bffDoubleAccount | control-api | none |  |
| GET | `/api/v1/execution/resources/accounts/{account_id}/fills` | 200 | bffDoubleAccount | control-api | none |  |
| GET | `/api/v1/execution/resources/bindings/{binding_id}` | 200 | bffDouble | control-api | DRIFT `execution-resource-scoped.v2#/$defs/BindingScopedResourceWireResponse` |  |
| GET | `/api/v1/execution/governance/approvals` | 200 | bffDouble | control-api | DRIFT `execution-governance-product.v1#/$defs/ApprovalInboxResponse` | rows, counts, keyset after |
| GET | `/api/v1/execution/governance/approvals/history` | 200 | bffDouble | control-api | DRIFT `execution-governance-approval-workflow.v1#/$defs/ApprovalHistoryResponse` |  |
| GET | `/api/v1/execution/governance/approvals/{approval_id}/r1` | 200 | bffDouble | control-api | DRIFT `execution-governance-approval-workflow.v1#/$defs/R1ReviewResponse` |  |
| GET | `/api/v1/execution/governance/approvals/{approval_id}/r2` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/governance/approvals/{approval_id}/live` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/governance/exit-reviews/{review_id}` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/governance/waivers` | 200 | bffDouble | control-api | DRIFT `execution-governance-product.v1#/$defs/ConditionsRegisterResponse` |  |
| GET | `/api/v1/execution/governance/review-capture-capabilities` | 200 | bffDouble | control-api | `execution-governance-review-capture.v1#/$defs/Capabilities` |  |
| GET | `/api/v1/execution/deployments/{deployment_id}/certification` | 200 | bffDouble | control-api | `execution-sandbox-certification.v1#/$defs/CertificationResponse` |  |
| GET | `/api/v1/execution/deployments/{deployment_id}/canary` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/deployments/{deployment_id}/live` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/operations` | 200 | bffDoubleV2 | control-api | `execution-operations.v1#/$defs/OperationalQueueV2` | filters triage_state, environment, source_status, verification_result, severity, target_type, target_id, command_key; sort; keyset |
| GET | `/api/v1/execution/operations/incidents/{incident_id}` | 200 | bffDoubleV2 | control-api | `execution-operations.v1#/$defs/OperationalIncidentCurrentV2` |  |
| GET | `/api/v1/execution/operations/{operation_id}` | 200 | bffDouble | control-api | `execution-operations.v1#/$defs/OperationWorkflowResponse` |  |
| GET | `/api/v1/execution/commands/tasks` | 200 | bffDoubleOverview | control-api | `execution-command-tasks.v1#/` |  |
| GET | `/api/v1/execution/commands/catalog` | 200 | bffDoubleOverview | control-api | `execution-operations.v1#/$defs/CommandCatalogue` |  |
| POST | `/api/v1/execution/commands/plans` | 200 | bffDoubleOverview | control-api | `execution-operations.v1#/$defs/ExecutionCommandPlan` | always the canonical BLOCKED plan (COMMAND_RELAY_DISABLED); the specs' ACCEPTED/UNKNOWN walk is off. Answered 200 where the published route answers 201 |
| POST | `/api/v1/execution/commands/tasks/{task_id}/run` | 409 | bffDoubleOverview | control-api | none | TASK_NOT_CONNECTED |
| POST | `/api/v1/execution/governance/approvals` | 201 | bffDouble | control-api | `execution-governance-product.v1#/$defs/ApprovalCreateResponse` | canned created body; nothing is stored |
| POST | `/api/v1/execution/governance/sandbox/capture-note` | 201 | bffDouble | control-api | `execution-governance-review-capture.v1#/$defs/CaptureResponse` | canned capture body; nothing is stored |
| POST | `/api/v1/execution/approvals/{approval_id}/capital-preview` | 200 | bffDouble | control-api | none | canned preview |
| POST | `/api/v1/execution/alphas/{alpha_id}/insight-previews` | 200 | bffDouble | control-api | none | canned preview |
| POST | `/api/v1/execution/operations/{operation_id}/acknowledge` | 200 | bffDouble | control-api | `execution-operations.v1#/$defs/OperationWorkflowResponse` | canned workflow body; nothing changes |
| POST | `/api/v1/execution/operations/{operation_id}/resolve` | 200 | bffDouble | control-api | `execution-operations.v1#/$defs/OperationWorkflowResponse` | canned workflow body; nothing changes |
| POST | `/api/v1/execution/operations/{operation_id}/apply` | 202 | bffDouble | control-api | none | canned 202 operation; nothing is applied. The published route answers 409 COMMAND_RELAY_DISABLED while the relay is off |

<!-- routes:end -->

Regenerate the table after changing `routeTable.ts`:
`FIXTURE_BFF_WRITE_ROUTES=1 npx vitest run src/fixtureBff/server.test.ts` in `apps/portal/frontend`.
