# Fixture BFF: routes

Lane: `FIXTURE_LAB`. The answers come from the Playwright doubles under
`apps/portal/frontend/e2e` and the published synthetic fixtures in
`packages/contracts/fixtures`. **Not acceptance evidence.**

## What an nginx must send here

The server listens on **port 4100** (`PORT`). nginx gives it the matches below; every other `/api/**` path goes wherever `PORTAL_WEB_UPSTREAM` points: on the Research preview overlay that is this
server (so it is refused, 404), unless `FIXTURE_WEB_UPSTREAM` names a real Control API.

| nginx match | Why |
|---|---|
| `location = /api/auth/context` | the sign-in state: a synthetic, labelled "Fixture reviewer" (shell bootstrap) |
| `location = /api/auth/csrf`, `= /api/auth/login`, `= /api/auth/change-password`, `= /api/auth/logout` | **refused** here (404, or 405 with `FIXTURE_WRITES=refuse`): routed so that no sign-in, sign-out or CSRF read can reach a real Control API while the lane is on. Exact matches, because `portal.conf` owns `location ^~ /api/auth/` |
| `location ^~ /api/v1/portal/` | `registry`, `links` and `summary` (shell bootstrap); `capabilities` and anything else under it is refused (404) |
| `location ^~ /api/v1/execution/` | every Execution BFF read the V2 screens make |
| `location = /api/admin/access/self` | the session capabilities, so the screens are not fail-closed |
| `location = /api/admin/profile-access/v2/effective` | the Access screen's read (exact match: `/api/admin/profile-access` and `/activity` stay real) |
| `location = /api/admin/profile-access/v2/self-navigation`, `= .../eligibility`, `= .../eligibility/batch`, `= .../self-context` | the four advisory self reads, answered from the canonical access fixture (each an exact match) |
| `location = /api/admin/accounts` and `location ^~ /api/admin/accounts/` | the Users roster and detail |
| `location = /api/admin/step-up` | the Users step-up state |
| `location = /api/v1/quantbt/runs` | the Run Library list the New request pickers read (exact match: the rest of `/api/v1/quantbt/` stays real) |
| `location ^~ /__fixture/` | the lane marker and the health check (`/__fixture/healthz`) |

(The Research preview fragment, `deploy/research-preview/nginx/fixture-bff/fixture-bff.conf`, has a dedicated
location for every row above except the Run Library list. That one, and any other route this server answers, reaches it
through `portal.conf`'s catch-all, because the overlay points `PORTAL_WEB_UPSTREAM` here; see `README-fixture.md`.)

Keep `proxy_http_version 1.1`, `proxy_buffering off` and the `Host` / `X-Forwarded-*` headers the
`/api/` block in `deploy/nginx/portal.conf` sets. The three `/stream` routes (the fleet one, `manager/fleet/stream`, is ELP2-09 `alpha_fleet_overview`: a cursor-checked finite body of `ScopedRealtimeFrame`s) send one terminal
heartbeat and end. The server never reads a request header, so a session cookie, bearer token or CSRF
token a browser sends is ignored, and it never sets a cookie.

## Not served here (refused, 404)

These are called by other screens, or are not the browser's concern on the V2 lane. The fixture BFF
answers them `404 {"error":"FIXTURE_ROUTE_NOT_SERVED"}` rather than invent a body (a deployment that wants them real routes them elsewhere):

- `/api/health`, `/api/ready`, `/api/control/healthz` (the sign-in plate's probes; `/api/health` and
  `/api/ready` are exact locations of `portal.conf`, so the overlay cannot take them, and the plate is
  never shown while the fixture user is signed in)
- `/api/v1/portal/capabilities`, `/api/v1/alphas*`
- `/api/v1/research/*`, `/api/v1/quantbt/*` (except the exact `GET /api/v1/quantbt/runs` above), `/api/runs*`, `/api/strategies`, `/api/config/*`
- `/api/admin/profile-access` (the legacy policy matrix), `/api/admin/profile-access/activity`
- the other five `manager/*` dataset routes (`fund-overview` and the portfolio, alpha, account and deployment overviews): only `manager/series`, `manager/fleet` and the two ELP2-09 routes under `manager/fleet/` (`realtime-snapshot`, `stream`) are modelled
- any other `/api/admin/*`

The shell bootstrap (`bffDoubleShell.ts`) takes the registry, links and summary bodies from the same
canonical files `e2e/fixtures.ts` (`stubPortalApi`) reads, and `src/fixtureBff/shell.test.ts` runs
`stubPortalApi` against a fake page and compares them. The one deliberate difference is the identity:
`/api/auth/context` names "Fixture reviewer" and carries `fixture: true`, where the stub names a
person. The id in it is `FIXTURE_USER_ID` (default `principal-visual-baseline`), the same id
`/api/admin/access/self` and the Access screen use, so the Access screen no longer refuses the fixture's body.

## How an answer is chosen

`e2e/bffAnswerer.ts` (`answerFixtureRequest`) takes the request as data and answers it as data. For
`/api/v1/execution/**` it asks the doubles in the order `execution-v2-s1.spec.ts` stubs them
(`operationsV2` and `screensV2` on):

0. `bffDoubleStage` (the S3 stage screens: Paper workbench, Sandbox, Canary, Live, New request; see below), asked first
   and only for its own deployments and writes;
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

## The stage screens (`bffDoubleStage`)

Rows tagged `[stage id]` in the table answer for every deployment id except the legacy ones the V1 journeys and the
recorded golden use (`dep_1`, `dep_94`, `dep_a`, `dep_vnm`), which keep the V1-era bodies byte for byte. Which body a
stage route answers is chosen by the `workspace_id` of the read, the way the Access double chooses its state:

| `workspace_id` | Sandbox `/certification`, Canary `/canary` | Live `/live` | capture capabilities |
|---|---|---|---|
| none, or any other | V1. Sandbox: the published V1 body made rich at the view-model level (4 of 7 steps pass, one fails, 2 findings, 1 plan, a timeline), still schema-valid. Canary: the published dark body | the published dark V1 body | `SANDBOX_NOTE` AVAILABLE |
| `ws_TEST_SCOPED_V2` | `portal.execution.following-parent.v2` | `portal.execution.live-source-operations.v2`; orders and fills in 3 keyset pages of 20 through `?panel=&cursor=` (a cursor of another panel or past page 3 is `409 LIVE_SOURCE_CURSOR_EXPIRED`) | `SANDBOX_NOTE` AVAILABLE |
| `ws_TEST_DENIED` | `403 ACCESS_DENIED` | `403 ACCESS_DENIED` | `403 ACCESS_DENIED` |
| `ws_TEST_NOTE_OFF` | as the default | as the default | `SANDBOX_NOTE` UNAVAILABLE |

Populated or dark: Paper is populated (40 orders including one UNKNOWN, fills, 3 positions, 200 equity snapshots, a
PARTIAL quality read with latency dark, the observation gate). Sandbox is populated on both bodies. Canary and Live are
DARK on the V1 bodies on purpose: the V1 schemas pin dark constants (`series.points maxItems 0`,
`rollback_readiness.ready const false`, `production_command_active const false`), so a lit Canary or Live cannot be
wire-valid and exists only in the screens' unit suites (S3 plan, section 0, finding 1).

The two writes read the **text of the summary** (and answer without a body exactly as before, which is what the golden
records), so a reviewer can reach every outcome by typing it: a summary starting `DUPLICATE` answers
`409 APPROVAL_DUPLICATE_OPEN_REQUEST` naming AP-201, `REFUSE` a typed refusal (`422 CLAIM_NOT_ELIGIBLE` for a request,
`409 SANDBOX_NOTE_VERSION_CONFLICT` for a note), `DENIED` a `403`, `REPLAY` the success with `replayed: true`; anything else
is a success that echoes the request key, the alpha and the certification. Still nothing is stored.

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
| GET | `/api/auth/context` | 200 | bffDoubleShell | control-api | none | AUTHENTICATED as the synthetic "Fixture reviewer"; body says fixture:true; no cookie, token or session is minted |
| GET | `/api/v1/portal/registry` | 200 | bffDoubleShell (registry.public.json) | control-api | none | the canonical registry fixture stubPortalApi serves |
| GET | `/api/v1/portal/links` | 200 | bffDoubleShell (links.public.json) | control-api | none | the canonical links fixture stubPortalApi serves |
| GET | `/api/v1/portal/summary` | 200 | bffDoubleShell (summary.healthy.json) | control-api | none | the healthy summary fixture stubPortalApi serves |
| GET | `/api/admin/access/self` | 200 | bffAnswerer (the manager session the V2 spec inlines) | control-api | none | portal.owner-access.v1; no published schema |
| GET | `/api/admin/profile-access/v2/effective` | 200 | bffDoubleAccess | none yet | `execution-access.openapi.json#/components/schemas/AccessEffective` | no controller in apps/control-api/src at this commit; state chosen by workspace_id |
| GET | `/api/admin/accounts` | 200 | bffDoubleUsers | control-api | none | 123 accounts, the whole list when no query is sent (the V1 screen's transition); portal-account-lifecycle.openapi.json |
| GET | `/api/admin/accounts [paged]` | 200 | bffDoubleUsers | control-api | `portal-account-lifecycle.openapi.json#/components/schemas/AccountRoster` | BE-P23: any of limit, cursor, q, role, state is one keyset page by username, with page and exact roster-wide counts |
| GET | `/api/admin/accounts/{user_id}` | 200 | bffDoubleUsers | control-api | none |  |
| GET | `/api/admin/step-up` | 200 | bffDoubleUsers | control-api | none |  |
| GET | `/api/admin/profile-access/v2/self-navigation` | 200 | bffDoubleSelfAccess | control-api | `execution-access.openapi.json#/components/schemas/AccessSelfNavigation` | portal.self-navigation.v1, the canonical access fixture re-stamped from the fixture clock (ceiling a year later); workspace_id picks the case (ws_TEST_NONE all HIDDEN, ws_TEST_LEGACY, ws_TEST_DENIED 403, ws_TEST_UNAVAILABLE 503, ws_TEST_MALFORMED a key the closed contract lacks); the query is exactly workspace_id and environment |
| GET | `/api/admin/profile-access/v2/eligibility` | 200 | bffDoubleSelfAccess | control-api | `execution-access.openapi.json#/components/schemas/AccessEligibility` | portal.self-eligibility.v1; answers the one resource and action the fixture states, any other question is 404 NOT_IN_FIXTURE (a row for it would be a permission the fixture does not state) |
| GET | `/api/admin/profile-access/v2/eligibility/batch` | 200 | bffDoubleSelfAccess | control-api | `execution-access.openapi.json#/components/schemas/AccessEligibilityBatch` | portal.self-eligibility-batch.v2 as the OpenAPI publishes it; the fixture's two resources and two actions, any other question is 404 NOT_IN_FIXTURE; ws_TEST_STEP_UP_ACTIVE answers the ACTIVE case. The FE reader still reads v1 (FE finding) |
| GET | `/api/admin/profile-access/v2/self-context` | 200 | bffDoubleSelfAccess | control-api | `execution-access.openapi.json#/components/schemas/AccessSelfContext` | portal.self-context.v1, the first canonical case (a sole workspace with a current grant record); the read takes no query, so no query picks a case. No FE reader exists yet |
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
| GET | `/api/v1/execution/resources/alphas/{alpha_id}` | 200 | bffDoubleAlpha | control-api | `execution-alpha-resource.v1#/` | any other id answers the same template; alpha_denied 403, alpha_down 503, alpha_empty empty |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}/orders` | 200 | bffDoubleAlpha | control-api | `execution-subject-records.v1#/` |  |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}/fills` | 200 | bffDoubleAlpha | control-api | `execution-subject-records.v1#/` |  |
| GET | `/api/v1/execution/derivations/alphas/{alpha_id}/activity` | 200 | bffDoubleAlpha | control-api | none |  |
| GET | `/api/v1/execution/views/observed-timeline` | 200 | bffDoubleAlpha | control-api | `execution-observed-timeline.v1#/` |  |
| GET | `/api/v1/execution/views/equity-chart` | 200 | bffDoublePortfolios (portfolio), bffDoubleAlpha (alpha), bffDoubleAccount (account), bffDouble (other) | control-api | none | subject_kind alpha, portfolio, account |
| GET | `/api/v1/execution/views/equity-chart [alpha]` | 200 | bffDoubleAlpha | control-api | `execution-financial-chart.v1#/` | one USDT series per account; the server never publishes a gap, so the double publishes none; sandbox answers 503 |
| GET | `/api/v1/execution/market/venue-candles` | 200 | bffDoubleAlpha | control-api | `execution-market-candles.v1#/` | a typed absence, not a series |
| GET | `/api/v1/execution/market/venue-candles [ready]` | 200 | bffDoubleAlpha | control-api | `execution-market-candles.v1#/` | BTCUSDT: READY bars with trades |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}/orders [page 2]` | 200 | bffDoubleAlpha | control-api | `execution-subject-records.v1#/` | the second keyset page; the cursor is a Portal-signed kc1. token |
| GET | `/api/v1/execution/views/observed-timeline [page 2]` | 200 | bffDoubleAlpha | control-api | `execution-observed-timeline.v1#/` | the last page of 12 observations |
| GET | `/api/v1/execution/resources/alphas/{alpha_id} [alpha_empty]` | 200 | bffDoubleAlpha | control-api | `execution-alpha-resource.v1#/` | the canonical alpha_not_in_projection case: state empty |
| GET | `/api/v1/execution/resources/alphas/{alpha_id} [V2 workspace]` | 200 | bffDoubleAlpha | control-api | `execution-resource-scoped.v2#/$defs/AlphaScopedResourceWireResponse` | execution.alpha-resource.v2 (SCOPED_V2): raw authorized facts, no label, version, owner, stage, health or total; alpha_empty and alpha_bounded answer the empty and byte-bound cases; denied and down as v1 |
| GET | `/api/v1/execution/resources/alphas/{alpha_id} [V2 workspace, alpha_empty]` | 200 | bffDoubleAlpha | control-api | `execution-resource-scoped.v2#/$defs/AlphaScopedResourceWireResponse` | the canonical empty v2 case: data {} and every panel EMPTY |
| GET | `/api/v1/execution/resources/alphas/{alpha_id} [V2 workspace, alpha_bounded]` | 200 | bffDoubleAlpha | control-api | `execution-resource-scoped.v2#/$defs/AlphaScopedResourceWireResponse` | the canonical bounded v2 case: EDS04_RESOURCE_RESPONSE_BYTE_BOUND, no relation rows |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}/orders [V2 workspace]` | 200 | bffDoubleAlpha | control-api | `execution-scoped-records.openapi.json#/components/schemas/ScopedSubjectRecordsResponse` | portal.execution.subject-records.v2, page 1 of 2 (a kc1. cursor) |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}/orders [V2 workspace, page 2]` | 200 | bffDoubleAlpha | control-api | `execution-scoped-records.openapi.json#/components/schemas/ScopedSubjectRecordsResponse` | the second keyset page |
| GET | `/api/v1/execution/resources/alphas/{alpha_id}/fills [V2 workspace]` | 200 | bffDoubleAlpha | control-api | `execution-scoped-records.openapi.json#/components/schemas/ScopedSubjectRecordsResponse` | portal.execution.subject-records.v2; the last record states no time (the Portal observation clock is not a trade time) |
| GET | `/api/v1/execution/market/candles` | 200 | bffDouble (canonical L0 body) | control-api | `execution-market-context.v1#/$defs/CandlesResponse` |  |
| GET | `/api/v1/execution/manager/current/{relation}` | 200 | bffDouble | control-api | none | relation from the approved catalogue of 15; any other is not served |
| GET | `/api/v1/execution/manager/series` | 200 | bffDoubleManager | control-api | `execution-manager-series.v1#/` | FIXTURE populated: the canonical NAV body with the ids, metric, environment and window of the question; presets resolve to the one published window, ALL is a typed gap |
| GET | `/api/v1/execution/manager/series [fund]` | 200 | bffDoubleManager | control-api | `execution-manager-series.v1#/` | one FUND subject: the SINGLE_SUBJECT comparison is rebuilt by the contract's rules |
| GET | `/api/v1/execution/manager/series [empty]` | 200 | bffDoubleManager | control-api | `execution-manager-series.v1#/` | FIXTURE empty (workspace_id=ws_TEST_SERIES_EMPTY) |
| GET | `/api/v1/execution/manager/series [unavailable]` | 200 | bffDoubleManager | control-api | `execution-manager-series.v1#/` | FIXTURE unavailable (workspace_id=ws_TEST_SERIES_UNAVAILABLE); NET_PNL has no canonical fixture and answers the same typed entries |
| GET | `/api/v1/execution/manager/series [currency-mixed]` | 200 | bffDoubleManager | control-api | `execution-manager-series.v1#/` | FIXTURE currency-mixed (workspace_id=ws_TEST_SERIES_CURRENCY_MIXED): INCOMPARABLE / CURRENCY_MIXED |
| GET | `/api/v1/execution/manager/series [return]` | 200 | bffDoubleManager | control-api | `execution-manager-series.v1#/` | FIXTURE return: a RATIO stated as a FRACTION on both subjects |
| GET | `/api/v1/execution/manager/series [return-scale-mixed]` | 200 | bffDoubleManager | control-api | `execution-manager-series.v1#/` | FIXTURE return-scale-mixed (workspace_id=ws_TEST_SERIES_RETURN_SCALE_MIXED): INCOMPARABLE / RATIO_SCALE_MIXED |
| GET | `/api/v1/execution/manager/series [return-scale-not-published]` | 200 | bffDoubleManager | control-api | `execution-manager-series.v1#/` | FIXTURE return-scale-not-published (workspace_id=ws_TEST_SERIES_RETURN_SCALE_NOT_PUBLISHED): the entry is UNAVAILABLE, never a guessed scale |
| GET | `/api/v1/execution/manager/fleet` | 200 | bffDoubleManager | control-api | `execution-manager-dataset.v1#/` | FIXTURE partitions (paper): 2 rows, 2 currencies. workspace_id, q, stage_filter, text filters, text sort, group_by, limit and after are applied; window, economic_partition, lifecycle_filter, before and numeric fields are 400 MANAGER_QUERY_NOT_SUPPORTED_BY_DOUBLE. The other five dataset routes are not served |
| GET | `/api/v1/execution/manager/fleet [live]` | 200 | bffDoubleManager | control-api | `execution-manager-dataset.v1#/` | FIXTURE lifecycle.live: one LIVE row and one CANARY and LIVE row (current_stage null, MULTIPLE_ACTIVE_STAGES) |
| GET | `/api/v1/execution/manager/fleet [sandbox]` | 200 | bffDoubleManager | control-api | `execution-manager-dataset.v1#/` | FIXTURE dataset (the base example): an empty page |
| GET | `/api/v1/execution/manager/fleet/realtime-snapshot` | 200 | bffDoubleManager | control-api | `execution-alpha-fleet-realtime.v1#/$defs/AlphaFleetRealtimeSnapshot` | FIXTURE available: names the fleet double's read by the same derivation as its lineage.revision (CR-01: baseline.revision stays the raw head), a resume cursor and the stream bounds. source.edge_notice_source is NOT_COMMISSIONED |
| GET | `/api/v1/execution/manager/fleet/realtime-snapshot [partial viewer]` | 200 | bffDoubleManager | control-api | `execution-alpha-fleet-realtime.v1#/$defs/AlphaFleetRealtimeSnapshot` | FIXTURE (workspace_id=ws_TEST_FLEET_RT_PARTIAL): the baseline is served and the stream is UNAVAILABLE / WHOLE_FLEET_AUTHORITY_REQUIRED, with no cursor |
| GET | `/api/v1/execution/manager/fleet/realtime-snapshot [stream not granted]` | 200 | bffDoubleManager | control-api | `execution-alpha-fleet-realtime.v1#/$defs/AlphaFleetRealtimeSnapshot` | FIXTURE (workspace_id=ws_TEST_FLEET_RT_NOT_GRANTED): UNAVAILABLE / STREAM_AUTHORITY_NOT_GRANTED |
| GET | `/api/v1/execution/manager/fleet/realtime-snapshot [capacity]` | 200 | bffDoubleManager | control-api | `execution-alpha-fleet-realtime.v1#/$defs/AlphaFleetRealtimeSnapshot` | FIXTURE (workspace_id=ws_TEST_FLEET_RT_CAPACITY): UNAVAILABLE / STREAM_CAPACITY_REACHED |
| GET | `/api/v1/execution/manager/fleet/realtime-snapshot [wide ordinal]` | 200 | bffDoubleManager | control-api | `execution-alpha-fleet-realtime.v1#/$defs/AlphaFleetRealtimeSnapshot` | FIXTURE (workspace_id=ws_TEST_FLEET_RT_WIDE_ORDINAL): an ordinal beyond a safe integer, kept as its decimal string |
| GET | `/api/v1/execution/manager/fleet/stream` | 200 | bffDoubleManager | control-api | none | FIXTURE: ONE heartbeat frame and the response ends (a fixture lane holds no connection). workspace_id picks revalidate, revoked, resync, slow and limit; a missing cursor is a terminal SNAPSHOT_REQUIRED frame, a wrong one CURSOR_INVALID_OR_EXPIRED. Last-Event-ID is not read, only ?cursor= |
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
| GET | `/api/v1/execution/governance/stage-action-eligibility` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/StageActionEligibility` | FIXTURE admin_with_r2_read; workspace_id picks the case (ws_TEST_PLAIN_USER, ws_TEST_NO_R2_GRANT, ws_TEST_OTHER_WORKSPACE, ws_TEST_NOT_AUTHORIZED, ws_TEST_RETAINED_REVIEW, ws_TEST_STEP_UP_ACTIVE, ws_TEST_DENIED 403, ws_TEST_UNAVAILABLE 503) and is echoed |
| GET | `/api/v1/execution/governance/stage-action-eligibility [plain user]` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/StageActionEligibility` | FIXTURE plain_user |
| GET | `/api/v1/execution/governance/paper-exit/parent` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/PaperExitParent` | FIXTURE found_available; the deployment asked picks the case (dep_exit_none NONE, dep_exit_not_approved, dep_exit_not_admin, dep_exit_expired BLOCKED); the deployment and workspace asked are echoed |
| GET | `/api/v1/execution/governance/paper-exit/parent [none]` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/PaperExitParent` | NONE: the deployment has no R2 review and there is no context |
| GET | `/api/v1/execution/governance/paper-exit/parent [blocked]` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/PaperExitParent` | FOUND / BLOCKED R2_APPROVAL_REQUIRED: a context with a typed reason, no digest and no choices |
| GET | `/api/v1/execution/governance/review-capture-capabilities [paper exit open]` | 200 | bffDoubleGovernance | control-api | `execution-governance-review-capture.v1#/$defs/Capabilities` | PAPER_EXIT_CREATE AVAILABLE in the fixture lab's shared workspace (the canonical review_capture_capabilities.paper_exit_open row); no flag and no Live or command route opens with it |
| GET | `/api/v1/execution/governance/review-capture-capabilities [paper exit off]` | 200 | bffDoubleGovernance | control-api | `execution-governance-review-capture.v1#/$defs/Capabilities` | PAPER_EXIT_CREATE UNAVAILABLE PAPER_EXIT_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE (the canonical paper_exit_off row) |
| POST | `/api/v1/execution/governance/paper-exit/create` | 201 | bffDoubleGovernance | control-api | `execution-governance-review-capture.v1#/$defs/CaptureResponse` | the pins must be the parent's (approval, version 3, digest); the review is pexit_fx_<deployment>_<hash of the key>; replayed when the summary starts REPLAY; nothing is stored |
| POST | `/api/v1/execution/governance/paper-exit/create [summary DENIED]` | 403 | bffDoubleGovernance | control-api (typed refusal) | none | ADMIN_ROLE_REQUIRED |
| POST | `/api/v1/execution/governance/paper-exit/create [summary REFUSE]` | 409 | bffDoubleGovernance | control-api (typed refusal) | none | APPROVAL_VERSION_CONFLICT; STALE answers 409 CAPTURE_PROJECTION_VERSION_CONFLICT, a pin that is not the parent's 404/409 |
| GET | `/api/v1/execution/governance/exit-reviews/{review_id} [fixture request]` | 200 | bffDoubleGovernance | control-api | none | the canonical Paper exit review read back for the deployment the id names (an id a create of this double made) |
| GET | `/api/v1/execution/governance/approvals/request-lookup` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/ApprovalRequestLookup` | NONE: the double stores one request (req-TEST_ONLY-0001) and keeps no state; the key and workspace asked are echoed |
| GET | `/api/v1/execution/governance/approvals/request-lookup [found]` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/ApprovalRequestLookup` | FOUND / NOT_COMPARED: no payload was sent, so only existence is said |
| GET | `/api/v1/execution/governance/approvals/request-lookup [match]` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/ApprovalRequestLookup` | FOUND / MATCH: the stored request's four payload fields |
| GET | `/api/v1/execution/governance/approvals/request-lookup [conflict]` | 200 | bffDoubleGovernance | control-api | `execution-governance.openapi.json#/components/schemas/ApprovalRequestLookup` | KEY_PAYLOAD_CONFLICT / MISMATCH: another payload under the stored key |
| GET | `/api/v1/execution/pending-recalls` | 200 | bffDoubleGovernance | control-api | `execution-pending-control.openapi.json#/components/schemas/PendingRecallDiscovery` | FIXTURE discovery_open: two recalls the Portal controlled on the fixture's portfolio (one WAITING_ENCUMBRANCE, one UNKNOWN) |
| GET | `/api/v1/execution/pending-recalls [deployment]` | 200 | bffDoubleGovernance | control-api | `execution-pending-control.openapi.json#/components/schemas/PendingRecallDiscovery` | FIXTURE discovery_deployment: one recall with its owning account |
| GET | `/api/v1/execution/pending-recalls [none]` | 200 | bffDoubleGovernance | control-api | `execution-pending-control.openapi.json#/components/schemas/PendingRecallDiscovery` | FIXTURE discovery_empty naming the resource asked: none the Portal controlled (not a claim that no recall exists on the source) |
| GET | `/api/v1/execution/deployments/{deployment_id}/certification` | 200 | bffDouble | control-api | `execution-sandbox-certification.v1#/$defs/CertificationResponse` |  |
| GET | `/api/v1/execution/deployments/{deployment_id}/canary` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/deployments/{deployment_id}/live` | 200 | bffDouble | control-api | none |  |
| GET | `/api/v1/execution/screens/paper/{deployment_id} [stage id]` | 200 | bffDoubleStage | control-api | `execution-paper-read.v1#/` | populated: 40 orders (one UNKNOWN), fills, positions, 200 equity snapshots, observation gate; capabilities say what stays dark |
| GET | `/api/v1/execution/screens/paper/{deployment_id}/vn-market [stage id]` | 200 | bffDoubleStage | control-api | none | the same rows on the VN market body |
| GET | `/api/v1/execution/derivations/deployments/{deployment_id}/execution-quality [stage id]` | 200 | bffDoubleStage | control-api | none | PARTIAL: counts agree with the profile rows, latency UNAVAILABLE |
| GET | `/api/v1/execution/deployments/{deployment_id}/certification [stage id]` | 200 | bffDoubleStage | control-api | `execution-sandbox-certification.v1#/$defs/CertificationResponse` | V1 body made rich at the view-model level (steps PASS/FAIL/UNAVAILABLE, findings, plans, timeline), still schema-valid |
| GET | `/api/v1/execution/deployments/{deployment_id}/certification [stage id, V2 workspace]` | 200 | bffDoubleStage | control-api | `execution-operations.v1#/$defs/SandboxParentReadV2` | portal.execution.following-parent.v2 (workspace_id=ws_TEST_SCOPED_V2) |
| GET | `/api/v1/execution/deployments/{deployment_id}/certification [stage id, denied workspace]` | 403 | bffDoubleStage | control-api (typed refusal) | none | ACCESS_DENIED (workspace_id=ws_TEST_DENIED) |
| GET | `/api/v1/execution/deployments/{deployment_id}/canary [stage id]` | 200 | bffDoubleStage | control-api | `execution-canary-control-room.v1#/$defs/CanaryControlRoom` | the published DARK body (the V1 schema pins dark constants, so a lit Canary cannot be wire-valid) |
| GET | `/api/v1/execution/deployments/{deployment_id}/canary [stage id, V2 workspace]` | 200 | bffDoubleStage | control-api | `execution-operations.v1#/$defs/CanaryParentReadV2` | portal.execution.following-parent.v2, CANARY family, draft envelope |
| GET | `/api/v1/execution/deployments/{deployment_id}/live [stage id]` | 200 | bffDoubleStage | control-api | `execution-live-full-operations.v1#/` | the published DARK body (same reason as Canary) |
| GET | `/api/v1/execution/deployments/{deployment_id}/live [stage id, V2 workspace]` | 200 | bffDoubleStage | control-api | `execution-operations.v1#/$defs/LiveSourceOperationsReadV2` | portal.execution.live-source-operations.v2; orders and fills page 1 of 3 |
| GET | `/api/v1/execution/deployments/{deployment_id}/live?panel=&cursor= [stage id, V2 workspace]` | 200 | bffDoubleStage | control-api | `execution-operations.v1#/$defs/LiveSourceOperationsReadV2` | keyset: page 2 of 3 of the orders panel; a cursor of another panel or past page 3 answers 409 LIVE_SOURCE_CURSOR_EXPIRED |
| GET | `/api/v1/execution/deployments/{deployment_id}/certification?include= [stage id, V2 workspace]` | 200 | bffDoubleStage | control-api | `execution-operations.v1#/$defs/SandboxParentReadV2` | BE-P12 opt-in: the V2 body plus the closed identity member (sandbox_identity of the positive-parent fixture); without include the body is the one above |
| GET | `/api/v1/execution/deployments/{deployment_id}/canary?include= [stage id, V2 workspace]` | 200 | bffDoubleStage | control-api | `execution-operations.v1#/$defs/CanaryParentReadV2` | BE-P12 opt-in: the V2 body plus the closed identity member (canary_identity) |
| GET | `/api/v1/execution/deployments/{deployment_id}/live?include= [stage id, V2 workspace]` | 200 | bffDoubleStage | control-api | `execution-operations.v1#/$defs/LiveSourceOperationsReadV2` | BE-P12 opt-in: the V2 body plus identity and stage_facts (with_members of the live-source fixture: OPEN_FINDINGS, no count, runtime and sessions NOT_PUBLISHED) |
| GET | `/api/v1/execution/deployments/{deployment_id}/live?include= [stage id, V2 workspace, bad include]` | 400 | bffDoubleStage | control-api (typed refusal) | none | EXECUTION_READ_QUERY_INVALID: a repeated token, an empty one or one the route does not publish is refused, never ignored |
| GET | `/api/v1/execution/governance/review-capture-capabilities [note off]` | 200 | bffDoubleStage | control-api | `execution-governance-review-capture.v1#/$defs/Capabilities` | SANDBOX_NOTE UNAVAILABLE (workspace_id=ws_TEST_NOTE_OFF); the default workspace answers AVAILABLE |
| GET | `/api/v1/quantbt/runs` | 200 | bffDoubleStage (via bffAnswerer) | quantbt service | none | the Run Library the New request pickers read: 5 COMPLETED runs for 3 alphas, one FAILED and one RUNNING that are never offered |
| GET | `/api/v1/execution/operations` | 200 | bffDoubleV2 | control-api | `execution-operations.v1#/$defs/OperationalQueueV2` | filters triage_state, environment, source_status, verification_result, severity, target_type, target_id, command_key; sort; keyset |
| GET | `/api/v1/execution/operations/incidents/{incident_id}` | 200 | bffDoubleV2 | control-api | `execution-operations.v1#/$defs/OperationalIncidentCurrentV2` |  |
| GET | `/api/v1/execution/operations/{operation_id}` | 200 | bffDouble | control-api | `execution-operations.v1#/$defs/OperationWorkflowResponse` |  |
| GET | `/api/v1/execution/commands/tasks` | 200 | bffDoubleOverview | control-api | `execution-command-tasks.v1#/` |  |
| GET | `/api/v1/execution/commands/catalog` | 200 | bffDoubleOverview | control-api | `execution-operations.v1#/$defs/CommandCatalogue` |  |
| POST | `/api/v1/execution/commands/plans` | 200 | bffDoubleOverview | control-api | `execution-operations.v1#/$defs/ExecutionCommandPlan` | always the canonical BLOCKED plan (COMMAND_RELAY_DISABLED); the specs' ACCEPTED/UNKNOWN walk is off. Answered 200 where the published route answers 201 |
| POST | `/api/v1/execution/commands/tasks/{task_id}/run` | 409 | bffDoubleOverview | control-api | none | TASK_NOT_CONNECTED |
| POST | `/api/v1/execution/governance/approvals` | 201 | bffDouble | control-api | `execution-governance-product.v1#/$defs/ApprovalCreateResponse` | canned created body when the request carries no summary; nothing is stored |
| POST | `/api/v1/execution/governance/approvals [with a summary]` | 201 | bffDoubleStage | control-api | `execution-governance-product.v1#/$defs/ApprovalCreateResponse` | created, echoing the alpha; the approval id follows the request key; replayed when the summary starts REPLAY |
| POST | `/api/v1/execution/governance/approvals [summary DUPLICATE]` | 409 | bffDoubleStage | control-api (typed refusal) | none | APPROVAL_DUPLICATE_OPEN_REQUEST naming AP-201 |
| POST | `/api/v1/execution/governance/approvals [summary REFUSE]` | 422 | bffDoubleStage | control-api (typed refusal) | none | CLAIM_NOT_ELIGIBLE; DENIED answers 403 APPROVAL_CREATE_DENIED |
| POST | `/api/v1/execution/governance/sandbox/capture-note` | 201 | bffDoubleStage | control-api | `execution-governance-review-capture.v1#/$defs/CaptureResponse` | echoes the request's workspace, certification and key's deployment; replayed when the summary starts REPLAY; nothing is stored. With no body the doubles' canned body answers |
| POST | `/api/v1/execution/governance/sandbox/capture-note [summary REFUSE]` | 409 | bffDoubleStage | control-api (typed refusal) | none | SANDBOX_NOTE_VERSION_CONFLICT; DENIED answers 403 GOVERNANCE_ADMIN_REQUIRED; an incomplete body 422 |
| POST | `/api/v1/execution/approvals/{approval_id}/capital-preview` | 200 | bffDouble | control-api | none | canned preview |
| POST | `/api/v1/execution/alphas/{alpha_id}/insight-previews` | 200 | bffDouble | control-api | none | canned preview |
| POST | `/api/v1/execution/operations/{operation_id}/acknowledge` | 200 | bffDouble | control-api | `execution-operations.v1#/$defs/OperationWorkflowResponse` | canned workflow body; nothing changes |
| POST | `/api/v1/execution/operations/{operation_id}/resolve` | 200 | bffDouble | control-api | `execution-operations.v1#/$defs/OperationWorkflowResponse` | canned workflow body; nothing changes |
| POST | `/api/v1/execution/operations/{operation_id}/apply` | 202 | bffDouble | control-api | none | canned 202 operation; nothing is applied. The published route answers 409 COMMAND_RELAY_DISABLED while the relay is off |

<!-- routes:end -->

Regenerate the table after changing `routeTable.ts`:
`FIXTURE_BFF_WRITE_ROUTES=1 npx vitest run src/fixtureBff/server.test.ts` in `apps/portal/frontend`.
