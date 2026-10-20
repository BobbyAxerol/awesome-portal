/**
 * The route table of the fixture BFF: one row per route pattern the server answers, with a concrete
 * request that exercises it, the double that answers it, who answers it for real, and the published
 * schema the body is judged against when there is one.
 *
 * `apps/portal/fixture-bff/ROUTES.md` carries this table between two markers; `server.test.ts` fails
 * if the file and this table differ, and `FIXTURE_BFF_WRITE_ROUTES=1` rewrites the file's table.
 * Test support only: nothing in the product imports this.
 */
export interface SchemaRef {
  /** A schema in packages/contracts/schemas (name without extension) or an OpenAPI file ("../openapi/x.openapi.json"). */
  file: string;
  /** JSON pointer inside it ("" for the root). */
  ptr: string;
}

export interface RouteEntry {
  method: "GET" | "POST";
  /** The documented pattern, `{name}` for a path parameter. */
  pattern: string;
  /** A concrete request path and query that the server must answer. */
  url: string;
  body?: unknown;
  /** The status that request is expected to get. */
  status: number;
  /** The double (file in apps/portal/frontend/e2e) that answers it. */
  source: string;
  /** Who serves it for real. */
  real: "control-api" | "control-api (typed refusal)" | "quantbt service" | "none yet" | "fixture lane";
  /** What the route is worth a line on: why it has no schema, what the body is. */
  note?: string;
}

/** Which published schema judges a body, and whether the double is known not to conform to it. */
export interface SchemaVerdict {
  ref: SchemaRef;
  /** Set when the double is known to differ from the published schema: the test then asserts it still does. */
  drift?: string;
}

const EX = "/api/v1/execution";
const ADM = "/api/admin";
const OPS = "execution-operations.v1";
const RES = "execution-resource-scoped.v2";

const V2_WS = "ws_TEST_SCOPED_V2";
const SANDBOX_NOTE = { workspace_id: "ws_TEST_ONLY", request_key: "note-key-1", summary: "Reviewed the reconciliation evidence.", certification_id: "scert_dep_sandbox_01", expected_workflow_version: 1 };
/** The Paper exit request, built from the pins the canonical positive parent serves (`governance-requester-reads.synthetic.valid.json`). */
const PAPER_EXIT_REQUEST = { workspace_id: "ws_TEST_ONLY_shared", request_key: "paper_exit:key-1", summary: "Ready after the observation window.", r2_approval_id: "apr_TEST_ONLY_r2", expected_r2_version: 3, deployment_id: "deployment_TEST_ONLY", expected_projection_digest: `sha256:${"c".repeat(64)}` };
const APPROVAL_REQUEST = { schema_version: "governance.approval-create-request.v1", request_key: "req-key-1", gate: "R1", alpha_id: "alpha_btc_trend", evidence_run_id: "run_btc_trend_a1", methodology_claim_id: "claim_btc_oos", summary: "Momentum with a venue calendar." };
/** `manager/series` carries `subjects`, `window` and `economic_partition` as JSON text in the query. */
const seriesUrl = (metric: string, subjects: unknown[], options: { workspace?: string; window?: unknown; partition?: unknown } = {}): string =>
  `/api/v1/execution/manager/series?environment=paper&metric=${metric}&subjects=${encodeURIComponent(JSON.stringify(subjects))}&window=${encodeURIComponent(JSON.stringify(options.window ?? "30D"))}`
  + (options.workspace ? `&workspace_id=${options.workspace}` : "")
  + (options.partition ? `&economic_partition=${encodeURIComponent(JSON.stringify(options.partition))}` : "");
const FUND = [{ subject_type: "FUND" }];
const TWO_PORTFOLIOS = [{ subject_type: "PORTFOLIO", subject_id: "TEST_ONLY:portfolio-a" }, { subject_type: "PORTFOLIO", subject_id: "TEST_ONLY:portfolio-b" }];
const SELF_Q = "workspace_id=ws_TEST_ONLY&environment=paper";
const BATCH_Q = `${SELF_Q}&resources=PORTFOLIO:portfolio_TEST_ONLY,DEPLOYMENT:deployment_TEST_ONLY&actions=portfolio.read,capital.top_up`;
const RECALL_Q = (kind: string, id: string, environment = "paper"): string => `workspace_id=ws_TEST_ONLY&resource_kind=${kind}&resource_id=${encodeURIComponent(id)}&environment=${environment}`;
const LOOKUP_PAYLOAD = "alpha_id=alpha_n29&evidence_run_id=run_TEST_ONLY&methodology_claim_id=claim_TEST_ONLY&summary=Synthetic%20summary";
const livePanelCursor =(panel: string, page: number): string => `lps2.${panel}.${String(page).padStart(8, "0")}.1234567890.${"A".repeat(43)}`;

export const ROUTES: RouteEntry[] = [
  /* fixture lane */
  { method: "GET", pattern: "/__fixture/lane", url: "/__fixture/lane", status: 200, source: "server", real: "fixture lane", note: "lane, not_acceptance, source, scale" },
  { method: "GET", pattern: "/__fixture/healthz", url: "/__fixture/healthz", status: 200, source: "server", real: "fixture lane" },

  /* shell bootstrap: what the browser asks before any screen (bffDoubleShell.ts); no session exists */
  { method: "GET", pattern: "/api/auth/context", url: "/api/auth/context", status: 200, source: "bffDoubleShell", real: "control-api", note: "AUTHENTICATED as the synthetic \"Fixture reviewer\"; body says fixture:true; no cookie, token or session is minted" },
  { method: "GET", pattern: "/api/v1/portal/registry", url: "/api/v1/portal/registry", status: 200, source: "bffDoubleShell (registry.public.json)", real: "control-api", note: "the canonical registry fixture stubPortalApi serves" },
  { method: "GET", pattern: "/api/v1/portal/links", url: "/api/v1/portal/links", status: 200, source: "bffDoubleShell (links.public.json)", real: "control-api", note: "the canonical links fixture stubPortalApi serves" },
  { method: "GET", pattern: "/api/v1/portal/summary", url: "/api/v1/portal/summary", status: 200, source: "bffDoubleShell (summary.healthy.json)", real: "control-api", note: "the healthy summary fixture stubPortalApi serves" },

  /* session and admin reads (outside /api/v1/execution) */
  { method: "GET", pattern: `${ADM}/access/self`, url: `${ADM}/access/self`, status: 200, source: "bffAnswerer (the manager session the V2 spec inlines)", real: "control-api", note: "portal.owner-access.v1; no published schema" },
  { method: "GET", pattern: `${ADM}/profile-access/v2/effective`, url: `${ADM}/profile-access/v2/effective?workspace_id=ws_TEST_GRANTS`, status: 200, source: "bffDoubleAccess", real: "none yet", note: "no controller in apps/control-api/src at this commit; state chosen by workspace_id" },
  { method: "GET", pattern: `${ADM}/accounts`, url: `${ADM}/accounts`, status: 200, source: "bffDoubleUsers", real: "control-api", note: "123 accounts, one unpaged list; portal-account-lifecycle.openapi.json" },
  { method: "GET", pattern: `${ADM}/accounts/{user_id}`, url: `${ADM}/accounts/usr_0001`, status: 200, source: "bffDoubleUsers", real: "control-api" },
  { method: "GET", pattern: `${ADM}/step-up`, url: `${ADM}/step-up`, status: 200, source: "bffDoubleUsers", real: "control-api" },
  { method: "GET", pattern: `${ADM}/profile-access/v2/self-navigation`, url: `${ADM}/profile-access/v2/self-navigation?${SELF_Q}`, status: 200, source: "bffDoubleSelfAccess", real: "control-api", note: "portal.self-navigation.v1, the canonical access fixture re-stamped from the fixture clock (ceiling a year later); workspace_id picks the case (ws_TEST_NONE all HIDDEN, ws_TEST_LEGACY, ws_TEST_DENIED 403, ws_TEST_UNAVAILABLE 503, ws_TEST_MALFORMED a key the closed contract lacks); the query is exactly workspace_id and environment" },
  { method: "GET", pattern: `${ADM}/profile-access/v2/eligibility`, url: `${ADM}/profile-access/v2/eligibility?${SELF_Q}&resource_kind=PORTFOLIO&resource_id=portfolio_TEST_ONLY&actions=portfolio.read`, status: 200, source: "bffDoubleSelfAccess", real: "control-api", note: "portal.self-eligibility.v1; answers the one resource and action the fixture states, any other question is 404 NOT_IN_FIXTURE (a row for it would be a permission the fixture does not state)" },
  { method: "GET", pattern: `${ADM}/profile-access/v2/eligibility/batch`, url: `${ADM}/profile-access/v2/eligibility/batch?${BATCH_Q}`, status: 200, source: "bffDoubleSelfAccess", real: "control-api", note: "portal.self-eligibility-batch.v2 as the OpenAPI publishes it; the fixture's two resources and two actions, any other question is 404 NOT_IN_FIXTURE; ws_TEST_STEP_UP_ACTIVE answers the ACTIVE case. The FE reader still reads v1 (FE finding)" },
  { method: "GET", pattern: `${ADM}/profile-access/v2/self-context`, url: `${ADM}/profile-access/v2/self-context`, status: 200, source: "bffDoubleSelfAccess", real: "control-api", note: "portal.self-context.v1, the first canonical case (a sole workspace with a current grant record); the read takes no query, so no query picks a case. No FE reader exists yet" },

  /* shell and platform reads */
  { method: "GET", pattern: `${EX}/retained-review`, url: `${EX}/retained-review`, status: 404, source: "bffDouble", real: "control-api (typed refusal)", note: "UDB_RETAINED_REVIEW_NOT_CONFIGURED: a normal stack has no retained review" },
  { method: "GET", pattern: `${EX}/runtime-manifest`, url: `${EX}/runtime-manifest`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/screen-contracts`, url: `${EX}/screen-contracts`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/activation/capabilities`, url: `${EX}/activation/capabilities`, status: 200, source: "bffDoubleOverview", real: "control-api" },
  { method: "GET", pattern: `${EX}/durable-mirror/integrity`, url: `${EX}/durable-mirror/integrity?environment=paper`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/derivations/source-health`, url: `${EX}/derivations/source-health?environment=paper`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/profiles/{environment}/realtime-snapshot`, url: `${EX}/profiles/paper/realtime-snapshot`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/profiles/{environment}/stream`, url: `${EX}/profiles/paper/stream`, status: 200, source: "bffDouble", real: "control-api", note: "text/event-stream, one terminal heartbeat" },

  /* overview, command center, composition */
  { method: "GET", pattern: `${EX}/command-center`, url: `${EX}/command-center`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/command-center/realtime-snapshot`, url: `${EX}/command-center/realtime-snapshot`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/command-center/stream`, url: `${EX}/command-center/stream`, status: 200, source: "bffDouble", real: "control-api", note: "text/event-stream, one terminal heartbeat" },
  { method: "GET", pattern: `${EX}/compositions/{surface}`, url: `${EX}/compositions/command-center`, status: 200, source: "bffDoubleOverview", real: "control-api", note: "surface: command-center, operations, waivers, admin-action-drawer" },
  { method: "GET", pattern: `${EX}/screens/{environment}`, url: `${EX}/screens/paper`, status: 200, source: "bffDouble", real: "control-api", note: "environment: paper, sandbox, live" },
  { method: "GET", pattern: `${EX}/screens/blotter`, url: `${EX}/screens/blotter?limit=50`, status: 200, source: "bffDoubleOverview", real: "control-api", note: "keyset pages (after/before); filters status_bucket, venue, symbol, side" },
  { method: "GET", pattern: `${EX}/screens/paper/{deployment_id}`, url: `${EX}/screens/paper/dep_94`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/screens/paper/{deployment_id}/vn-market`, url: `${EX}/screens/paper/dep_vnm/vn-market`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/screens/accounts/{account_id}`, url: `${EX}/screens/accounts/acc_bnc_core`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/orders/{order_id}/funnel`, url: `${EX}/orders/ord_00300/funnel`, status: 200, source: "bffDoubleOverview", real: "control-api", note: "order ids follow the blotter (ord_00001 ... ord_<scale count>)" },
  { method: "GET", pattern: `${EX}/derivations/conditional-groups/{group_id}`, url: `${EX}/derivations/conditional-groups/grp_00300?environment=paper`, status: 200, source: "bffDoubleOverview", real: "control-api" },

  /* alphas */
  { method: "GET", pattern: `${EX}/alphas`, url: `${EX}/alphas?limit=50`, status: 200, source: "bffDouble (alphaFleet)", real: "control-api", note: "filters search, stage, owner, health; sort; keyset after/before" },
  { method: "GET", pattern: `${EX}/alphas/equity-sparklines`, url: `${EX}/alphas/equity-sparklines?environment=paper`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/alphas/{alpha_id}/stage-drift`, url: `${EX}/alphas/alpha_btc_trend/stage-drift`, status: 200, source: "bffDoubleAlpha", real: "control-api" },
  { method: "GET", pattern: `${EX}/alphas/{alpha_id}/query-analytics`, url: `${EX}/alphas/alpha_btc_trend/query-analytics`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id}`, url: `${EX}/resources/alphas/alpha_btc_trend`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "any other id answers the same template; alpha_denied 403, alpha_down 503, alpha_empty empty" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id}/orders`, url: `${EX}/resources/alphas/alpha_btc_trend/orders?environment=paper&limit=3`, status: 200, source: "bffDoubleAlpha", real: "control-api" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id}/fills`, url: `${EX}/resources/alphas/alpha_btc_trend/fills?environment=paper`, status: 200, source: "bffDoubleAlpha", real: "control-api" },
  { method: "GET", pattern: `${EX}/derivations/alphas/{alpha_id}/activity`, url: `${EX}/derivations/alphas/alpha_btc_trend/activity?environment=paper`, status: 200, source: "bffDoubleAlpha", real: "control-api" },
  { method: "GET", pattern: `${EX}/views/observed-timeline`, url: `${EX}/views/observed-timeline?environment=paper&subject_kind=alpha&subject_id=alpha_btc_trend`, status: 200, source: "bffDoubleAlpha", real: "control-api" },
  { method: "GET", pattern: `${EX}/views/equity-chart`, url: `${EX}/views/equity-chart?environment=live&subject_kind=portfolio&subject_id=pf_TEST_ONLY_core&metric=equity`, status: 200, source: "bffDoublePortfolios (portfolio), bffDoubleAlpha (alpha), bffDoubleAccount (account), bffDouble (other)", real: "control-api", note: "subject_kind alpha, portfolio, account" },
  { method: "GET", pattern: `${EX}/views/equity-chart [alpha]`, url: `${EX}/views/equity-chart?environment=live&subject_kind=alpha&subject_id=alpha_btc_trend&metric=equity`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "one USDT series per account; the server never publishes a gap, so the double publishes none; sandbox answers 503" },
  { method: "GET", pattern: `${EX}/market/venue-candles`, url: `${EX}/market/venue-candles?environment=paper&venue=BINANCE&symbol=ETHUSDT&interval=1h`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "a typed absence, not a series" },
  { method: "GET", pattern: `${EX}/market/venue-candles [ready]`, url: `${EX}/market/venue-candles?environment=live&venue=BINANCE&symbol=BTCUSDT&interval=1h&from_ms=1792152240000&to_ms=1792238640000&limit=100`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "BTCUSDT: READY bars with trades" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id}/orders [page 2]`, url: `${EX}/resources/alphas/alpha_btc_trend/orders?environment=live&after=kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciIsInJlc291cmNlIjoib3JkZXJzIn0.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "the second keyset page; the cursor is a Portal-signed kc1. token" },
  { method: "GET", pattern: `${EX}/views/observed-timeline [page 2]`, url: `${EX}/views/observed-timeline?environment=live&subject_kind=alpha&subject_id=alpha_btc_trend&after=kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciIsInJlc291cmNlIjoidGltZWxpbmUifQ.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "the last page of 12 observations" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id} [alpha_empty]`, url: `${EX}/resources/alphas/alpha_empty`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "the canonical alpha_not_in_projection case: state empty" },
  /* alphas, SCOPED_V2 workspace (UXM-07 R-3): the v2 bodies are served ONLY for an explicit workspace_id=ws_TEST_SCOPED_V2 */
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id} [V2 workspace]`, url: `${EX}/resources/alphas/alpha_btc_trend?workspace_id=${V2_WS}`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "execution.alpha-resource.v2 (SCOPED_V2): raw authorized facts, no label, version, owner, stage, health or total; alpha_empty and alpha_bounded answer the empty and byte-bound cases; denied and down as v1" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id} [V2 workspace, alpha_empty]`, url: `${EX}/resources/alphas/alpha_empty?workspace_id=${V2_WS}`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "the canonical empty v2 case: data {} and every panel EMPTY" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id} [V2 workspace, alpha_bounded]`, url: `${EX}/resources/alphas/alpha_bounded?workspace_id=${V2_WS}`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "the canonical bounded v2 case: EDS04_RESOURCE_RESPONSE_BYTE_BOUND, no relation rows" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id}/orders [V2 workspace]`, url: `${EX}/resources/alphas/alpha_btc_trend/orders?environment=live&workspace_id=${V2_WS}`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "portal.execution.subject-records.v2, page 1 of 2 (a kc1. cursor)" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id}/orders [V2 workspace, page 2]`, url: `${EX}/resources/alphas/alpha_btc_trend/orders?environment=live&workspace_id=${V2_WS}&after=kc1.double-k1.eyJkaXJlY3Rpb24iOiJhZnRlciIsInJlc291cmNlIjoib3JkZXJzIn0.RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "the second keyset page" },
  { method: "GET", pattern: `${EX}/resources/alphas/{alpha_id}/fills [V2 workspace]`, url: `${EX}/resources/alphas/alpha_btc_trend/fills?environment=live&workspace_id=${V2_WS}`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "portal.execution.subject-records.v2; the last record states no time (the Portal observation clock is not a trade time)" },
  { method: "GET", pattern: `${EX}/market/candles`, url: `${EX}/market/candles?environment=paper&symbol=ETHUSDT&interval=1h`, status: 200, source: "bffDouble (canonical L0 body)", real: "control-api" },
  { method: "GET", pattern: `${EX}/manager/current/{relation}`, url: `${EX}/manager/current/orders?environment=paper&limit=200`, status: 200, source: "bffDouble", real: "control-api", note: "relation from the approved catalogue of 15; any other is not served" },
  { method: "GET", pattern: `${EX}/manager/series`, url: seriesUrl("NAV", TWO_PORTFOLIOS), status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE populated: the canonical NAV body with the ids, metric, environment and window of the question; presets resolve to the one published window, ALL is a typed gap" },
  { method: "GET", pattern: `${EX}/manager/series [fund]`, url: seriesUrl("NAV", FUND), status: 200, source: "bffDoubleManager", real: "control-api", note: "one FUND subject: the SINGLE_SUBJECT comparison is rebuilt by the contract's rules" },
  { method: "GET", pattern: `${EX}/manager/series [empty]`, url: seriesUrl("NAV", TWO_PORTFOLIOS.slice(0, 1), { workspace: "ws_TEST_SERIES_EMPTY" }), status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE empty (workspace_id=ws_TEST_SERIES_EMPTY)" },
  { method: "GET", pattern: `${EX}/manager/series [unavailable]`, url: seriesUrl("NAV", TWO_PORTFOLIOS, { workspace: "ws_TEST_SERIES_UNAVAILABLE" }), status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE unavailable (workspace_id=ws_TEST_SERIES_UNAVAILABLE); NET_PNL has no canonical fixture and answers the same typed entries" },
  { method: "GET", pattern: `${EX}/manager/series [currency-mixed]`, url: seriesUrl("NAV", TWO_PORTFOLIOS, { workspace: "ws_TEST_SERIES_CURRENCY_MIXED" }), status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE currency-mixed (workspace_id=ws_TEST_SERIES_CURRENCY_MIXED): INCOMPARABLE / CURRENCY_MIXED" },
  { method: "GET", pattern: `${EX}/manager/series [return]`, url: seriesUrl("RETURN", TWO_PORTFOLIOS), status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE return: a RATIO stated as a FRACTION on both subjects" },
  { method: "GET", pattern: `${EX}/manager/series [return-scale-mixed]`, url: seriesUrl("RETURN", TWO_PORTFOLIOS, { workspace: "ws_TEST_SERIES_RETURN_SCALE_MIXED" }), status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE return-scale-mixed (workspace_id=ws_TEST_SERIES_RETURN_SCALE_MIXED): INCOMPARABLE / RATIO_SCALE_MIXED" },
  { method: "GET", pattern: `${EX}/manager/series [return-scale-not-published]`, url: seriesUrl("RETURN", TWO_PORTFOLIOS.slice(0, 1), { workspace: "ws_TEST_SERIES_RETURN_SCALE_NOT_PUBLISHED" }), status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE return-scale-not-published (workspace_id=ws_TEST_SERIES_RETURN_SCALE_NOT_PUBLISHED): the entry is UNAVAILABLE, never a guessed scale" },
  { method: "GET", pattern: `${EX}/manager/fleet`, url: `${EX}/manager/fleet?environment=paper&limit=100`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE partitions (paper): 2 rows, 2 currencies. workspace_id, q, stage_filter, text filters, text sort, group_by, limit and after are applied; window, economic_partition, lifecycle_filter, before and numeric fields are 400 MANAGER_QUERY_NOT_SUPPORTED_BY_DOUBLE. The other five dataset routes are not served" },
  { method: "GET", pattern: `${EX}/manager/fleet [live]`, url: `${EX}/manager/fleet?environment=live&limit=100`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE lifecycle.live: one LIVE row and one CANARY and LIVE row (current_stage null, MULTIPLE_ACTIVE_STAGES)" },
  { method: "GET", pattern: `${EX}/manager/fleet [sandbox]`, url: `${EX}/manager/fleet?environment=sandbox&limit=1`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE dataset (the base example): an empty page" },
  // ELP2-09 `alpha_fleet_overview` (BE-P16): the baseline barrier of the fleet read, and its notification stream. NOTIFICATION_ONLY: no figure, no delta.
  { method: "GET", pattern: `${EX}/manager/fleet/realtime-snapshot`, url: `${EX}/manager/fleet/realtime-snapshot?environment=paper`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE available: names the publication revision the fleet double serves for that environment (baseline.revision = lineage.revision), a resume cursor and the stream bounds. source.edge_notice_source is NOT_COMMISSIONED" },
  { method: "GET", pattern: `${EX}/manager/fleet/realtime-snapshot [partial viewer]`, url: `${EX}/manager/fleet/realtime-snapshot?environment=paper&workspace_id=ws_TEST_FLEET_RT_PARTIAL`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE (workspace_id=ws_TEST_FLEET_RT_PARTIAL): the baseline is served and the stream is UNAVAILABLE / WHOLE_FLEET_AUTHORITY_REQUIRED, with no cursor" },
  { method: "GET", pattern: `${EX}/manager/fleet/realtime-snapshot [stream not granted]`, url: `${EX}/manager/fleet/realtime-snapshot?environment=paper&workspace_id=ws_TEST_FLEET_RT_NOT_GRANTED`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE (workspace_id=ws_TEST_FLEET_RT_NOT_GRANTED): UNAVAILABLE / STREAM_AUTHORITY_NOT_GRANTED" },
  { method: "GET", pattern: `${EX}/manager/fleet/realtime-snapshot [capacity]`, url: `${EX}/manager/fleet/realtime-snapshot?environment=paper&workspace_id=ws_TEST_FLEET_RT_CAPACITY`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE (workspace_id=ws_TEST_FLEET_RT_CAPACITY): UNAVAILABLE / STREAM_CAPACITY_REACHED" },
  { method: "GET", pattern: `${EX}/manager/fleet/realtime-snapshot [wide ordinal]`, url: `${EX}/manager/fleet/realtime-snapshot?environment=live&workspace_id=ws_TEST_FLEET_RT_WIDE_ORDINAL`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE (workspace_id=ws_TEST_FLEET_RT_WIDE_ORDINAL): an ordinal beyond a safe integer, kept as its decimal string" },
  { method: "GET", pattern: `${EX}/manager/fleet/stream`, url: `${EX}/manager/fleet/stream?environment=paper&cursor=TEST_ONLY_ENCRYPTED_TOKEN_NOT_FOR_RUNTIME`, status: 200, source: "bffDoubleManager", real: "control-api", note: "FIXTURE: ONE heartbeat frame and the response ends (a fixture lane holds no connection). workspace_id picks revalidate, revoked, resync, slow and limit; a missing cursor is a terminal SNAPSHOT_REQUIRED frame, a wrong one CURSOR_INVALID_OR_EXPIRED. Last-Event-ID is not read, only ?cursor=" },

  /* portfolios */
  { method: "GET", pattern: `${EX}/portfolios`, url: `${EX}/portfolios`, status: 200, source: "bffDoublePortfolios", real: "control-api" },
  { method: "GET", pattern: `${EX}/resources/portfolios/{portfolio_id}`, url: `${EX}/resources/portfolios/pf_TEST_ONLY_core`, status: 200, source: "bffDoublePortfolios", real: "control-api" },
  { method: "GET", pattern: `${EX}/derivations/portfolios/{portfolio_id}/capital`, url: `${EX}/derivations/portfolios/pf_TEST_ONLY_core/capital?environment=live`, status: 200, source: "bffDoublePortfolios", real: "control-api" },
  { method: "GET", pattern: `${EX}/portfolios/{portfolio_id}/capital-ledger`, url: `${EX}/portfolios/pf_TEST_ONLY_core/capital-ledger?environment=live`, status: 200, source: "bffDoublePortfolios", real: "control-api" },
  { method: "GET", pattern: `${EX}/portfolios/{portfolio_id}/correlation`, url: `${EX}/portfolios/pf_TEST_ONLY_satellite/correlation`, status: 200, source: "bffDoublePortfolios", real: "control-api", note: "every other portfolio: 503 ANALYTICS_UPSTREAM_ROUTE_ABSENT" },
  { method: "GET", pattern: `${EX}/portfolios/{portfolio_id}/cross-equity`, url: `${EX}/portfolios/PF-CRYPTO/cross-equity`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/portfolios/{portfolio_id}/query-analytics`, url: `${EX}/portfolios/PF-CRYPTO/query-analytics`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/derivations/deployments/{deployment_id}/execution-quality`, url: `${EX}/derivations/deployments/dep_a/execution-quality?environment=paper`, status: 200, source: "bffDouble", real: "control-api" },

  /* accounts and bindings */
  { method: "GET", pattern: `${EX}/broker-bindings`, url: `${EX}/broker-bindings?environment=live&limit=50`, status: 200, source: "bffDoubleAccount", real: "control-api", note: "one environment per read; keyset after" },
  { method: "GET", pattern: `${EX}/broker-bindings/{binding_id}`, url: `${EX}/broker-bindings/bnc_main@BINANCE?environment=live`, status: 200, source: "bffDoubleAccount", real: "control-api" },
  { method: "GET", pattern: `${EX}/broker-bindings/{binding_id}/exposure`, url: `${EX}/broker-bindings/bnc_main@BINANCE/exposure`, status: 200, source: "bffDoubleAccount", real: "control-api" },
  { method: "GET", pattern: `${EX}/resources/accounts/{account_id}`, url: `${EX}/resources/accounts/acc_bnc_core`, status: 200, source: "bffDoubleAccount", real: "control-api" },
  { method: "GET", pattern: `${EX}/resources/accounts/{account_id}/orders`, url: `${EX}/resources/accounts/acc_bnc_core/orders?environment=live&limit=2`, status: 200, source: "bffDoubleAccount", real: "control-api" },
  { method: "GET", pattern: `${EX}/resources/accounts/{account_id}/fills`, url: `${EX}/resources/accounts/acc_bnc_core/fills?environment=live`, status: 200, source: "bffDoubleAccount", real: "control-api" },
  { method: "GET", pattern: `${EX}/resources/bindings/{binding_id}`, url: `${EX}/resources/bindings/bnc_main@BINANCE`, status: 200, source: "bffDouble", real: "control-api" },

  /* governance */
  { method: "GET", pattern: `${EX}/governance/approvals`, url: `${EX}/governance/approvals?limit=50`, status: 200, source: "bffDouble", real: "control-api", note: "rows, counts, keyset after" },
  { method: "GET", pattern: `${EX}/governance/approvals/history`, url: `${EX}/governance/approvals/history`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/governance/approvals/{approval_id}/r1`, url: `${EX}/governance/approvals/AP-201/r1`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/governance/approvals/{approval_id}/r2`, url: `${EX}/governance/approvals/AP-352/r2`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/governance/approvals/{approval_id}/live`, url: `${EX}/governance/approvals/AP-311/live`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/governance/exit-reviews/{review_id}`, url: `${EX}/governance/exit-reviews/EX-771`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/governance/waivers`, url: `${EX}/governance/waivers?state=OPEN&limit=50`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/governance/review-capture-capabilities`, url: `${EX}/governance/review-capture-capabilities?workspace_id=workspace_execution_manager`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/governance/stage-action-eligibility`, url: `${EX}/governance/stage-action-eligibility`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FIXTURE admin_with_r2_read; workspace_id picks the case (ws_TEST_PLAIN_USER, ws_TEST_NO_R2_GRANT, ws_TEST_OTHER_WORKSPACE, ws_TEST_NOT_AUTHORIZED, ws_TEST_RETAINED_REVIEW, ws_TEST_STEP_UP_ACTIVE, ws_TEST_DENIED 403, ws_TEST_UNAVAILABLE 503) and is echoed" },
  { method: "GET", pattern: `${EX}/governance/stage-action-eligibility [plain user]`, url: `${EX}/governance/stage-action-eligibility?workspace_id=ws_TEST_PLAIN_USER`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FIXTURE plain_user" },
  { method: "GET", pattern: `${EX}/governance/paper-exit/parent`, url: `${EX}/governance/paper-exit/parent?deployment_id=deployment_TEST_ONLY`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FIXTURE found_available; the deployment asked picks the case (dep_exit_none NONE, dep_exit_not_approved, dep_exit_not_admin, dep_exit_expired BLOCKED); the deployment and workspace asked are echoed" },
  { method: "GET", pattern: `${EX}/governance/paper-exit/parent [none]`, url: `${EX}/governance/paper-exit/parent?deployment_id=dep_exit_none`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "NONE: the deployment has no R2 review and there is no context" },
  { method: "GET", pattern: `${EX}/governance/paper-exit/parent [blocked]`, url: `${EX}/governance/paper-exit/parent?deployment_id=dep_exit_not_approved`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FOUND / BLOCKED R2_APPROVAL_REQUIRED: a context with a typed reason, no digest and no choices" },
  { method: "GET", pattern: `${EX}/governance/review-capture-capabilities [paper exit open]`, url: `${EX}/governance/review-capture-capabilities?workspace_id=ws_TEST_ONLY_shared`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "PAPER_EXIT_CREATE AVAILABLE in the fixture lab's shared workspace (the canonical review_capture_capabilities.paper_exit_open row); no flag and no Live or command route opens with it" },
  { method: "GET", pattern: `${EX}/governance/review-capture-capabilities [paper exit off]`, url: `${EX}/governance/review-capture-capabilities?workspace_id=ws_TEST_EXIT_OFF`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "PAPER_EXIT_CREATE UNAVAILABLE PAPER_EXIT_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE (the canonical paper_exit_off row)" },
  { method: "POST", pattern: `${EX}/governance/paper-exit/create`, url: `${EX}/governance/paper-exit/create`, body: PAPER_EXIT_REQUEST, status: 201, source: "bffDoubleGovernance", real: "control-api", note: "the pins must be the parent's (approval, version 3, digest); the review is pexit_fx_<deployment>_<hash of the key>; replayed when the summary starts REPLAY; nothing is stored" },
  { method: "POST", pattern: `${EX}/governance/paper-exit/create [summary DENIED]`, url: `${EX}/governance/paper-exit/create`, body: { ...PAPER_EXIT_REQUEST, summary: "DENIED for this admin" }, status: 403, source: "bffDoubleGovernance", real: "control-api (typed refusal)", note: "ADMIN_ROLE_REQUIRED" },
  { method: "POST", pattern: `${EX}/governance/paper-exit/create [summary REFUSE]`, url: `${EX}/governance/paper-exit/create`, body: { ...PAPER_EXIT_REQUEST, summary: "REFUSE this request please" }, status: 409, source: "bffDoubleGovernance", real: "control-api (typed refusal)", note: "APPROVAL_VERSION_CONFLICT; STALE answers 409 CAPTURE_PROJECTION_VERSION_CONFLICT, a pin that is not the parent's 404/409" },
  { method: "GET", pattern: `${EX}/governance/exit-reviews/{review_id} [fixture request]`, url: `${EX}/governance/exit-reviews/pexit_fx_deployment_TEST_ONLY_0badc0de`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "the canonical Paper exit review read back for the deployment the id names (an id a create of this double made)" },
  { method: "GET", pattern: `${EX}/governance/approvals/request-lookup`, url: `${EX}/governance/approvals/request-lookup?request_key=req-NOT-STORED-1`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "NONE: the double stores one request (req-TEST_ONLY-0001) and keeps no state; the key and workspace asked are echoed" },
  { method: "GET", pattern: `${EX}/governance/approvals/request-lookup [found]`, url: `${EX}/governance/approvals/request-lookup?request_key=req-TEST_ONLY-0001`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FOUND / NOT_COMPARED: no payload was sent, so only existence is said" },
  { method: "GET", pattern: `${EX}/governance/approvals/request-lookup [match]`, url: `${EX}/governance/approvals/request-lookup?request_key=req-TEST_ONLY-0001&${LOOKUP_PAYLOAD}`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FOUND / MATCH: the stored request's four payload fields" },
  { method: "GET", pattern: `${EX}/governance/approvals/request-lookup [conflict]`, url: `${EX}/governance/approvals/request-lookup?request_key=req-TEST_ONLY-0001&${LOOKUP_PAYLOAD.replace("alpha_n29", "alpha_other")}`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "KEY_PAYLOAD_CONFLICT / MISMATCH: another payload under the stored key" },
  { method: "GET", pattern: `${EX}/pending-recalls`, url: `${EX}/pending-recalls?${RECALL_Q("PORTFOLIO", "TEST_ONLY:portfolio")}`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FIXTURE discovery_open: two recalls the Portal controlled on the fixture's portfolio (one WAITING_ENCUMBRANCE, one UNKNOWN)" },
  { method: "GET", pattern: `${EX}/pending-recalls [deployment]`, url: `${EX}/pending-recalls?${RECALL_Q("DEPLOYMENT", "TEST_ONLY:deployment")}`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FIXTURE discovery_deployment: one recall with its owning account" },
  { method: "GET", pattern: `${EX}/pending-recalls [none]`, url: `${EX}/pending-recalls?${RECALL_Q("PORTFOLIO", "pf_TEST_ONLY_core")}`, status: 200, source: "bffDoubleGovernance", real: "control-api", note: "FIXTURE discovery_empty naming the resource asked: none the Portal controlled (not a claim that no recall exists on the source)" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/certification`, url: `${EX}/deployments/dep_1/certification`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/canary`, url: `${EX}/deployments/dep_1/canary`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/live`, url: `${EX}/deployments/dep_1/live`, status: 200, source: "bffDouble", real: "control-api" },

  /* the S3 stage screens (e2e/bffDoubleStage.ts): ids other than dep_1, dep_94, dep_a, dep_vnm; the workspace picks the body */
  { method: "GET", pattern: `${EX}/screens/paper/{deployment_id} [stage id]`, url: `${EX}/screens/paper/dep_paper_01`, status: 200, source: "bffDoubleStage", real: "control-api", note: "populated: 40 orders (one UNKNOWN), fills, positions, 200 equity snapshots, observation gate; capabilities say what stays dark" },
  { method: "GET", pattern: `${EX}/screens/paper/{deployment_id}/vn-market [stage id]`, url: `${EX}/screens/paper/dep_paper_01/vn-market`, status: 200, source: "bffDoubleStage", real: "control-api", note: "the same rows on the VN market body" },
  { method: "GET", pattern: `${EX}/derivations/deployments/{deployment_id}/execution-quality [stage id]`, url: `${EX}/derivations/deployments/dep_paper_01/execution-quality?environment=paper`, status: 200, source: "bffDoubleStage", real: "control-api", note: "PARTIAL: counts agree with the profile rows, latency UNAVAILABLE" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/certification [stage id]`, url: `${EX}/deployments/dep_sandbox_01/certification`, status: 200, source: "bffDoubleStage", real: "control-api", note: "V1 body made rich at the view-model level (steps PASS/FAIL/UNAVAILABLE, findings, plans, timeline), still schema-valid" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/certification [stage id, V2 workspace]`, url: `${EX}/deployments/dep_sandbox_01/certification?workspace_id=${V2_WS}`, status: 200, source: "bffDoubleStage", real: "control-api", note: "portal.execution.following-parent.v2 (workspace_id=ws_TEST_SCOPED_V2)" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/certification [stage id, denied workspace]`, url: `${EX}/deployments/dep_sandbox_01/certification?workspace_id=ws_TEST_DENIED`, status: 403, source: "bffDoubleStage", real: "control-api (typed refusal)", note: "ACCESS_DENIED (workspace_id=ws_TEST_DENIED)" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/canary [stage id]`, url: `${EX}/deployments/dep_canary_01/canary`, status: 200, source: "bffDoubleStage", real: "control-api", note: "the published DARK body (the V1 schema pins dark constants, so a lit Canary cannot be wire-valid)" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/canary [stage id, V2 workspace]`, url: `${EX}/deployments/dep_canary_01/canary?workspace_id=${V2_WS}`, status: 200, source: "bffDoubleStage", real: "control-api", note: "portal.execution.following-parent.v2, CANARY family, draft envelope" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/live [stage id]`, url: `${EX}/deployments/dep_live_01/live`, status: 200, source: "bffDoubleStage", real: "control-api", note: "the published DARK body (same reason as Canary)" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/live [stage id, V2 workspace]`, url: `${EX}/deployments/dep_live_01/live?workspace_id=${V2_WS}`, status: 200, source: "bffDoubleStage", real: "control-api", note: "portal.execution.live-source-operations.v2; orders and fills page 1 of 3" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/live?panel=&cursor= [stage id, V2 workspace]`, url: `${EX}/deployments/dep_live_01/live?workspace_id=${V2_WS}&panel=orders&cursor=${livePanelCursor("orders", 2)}`, status: 200, source: "bffDoubleStage", real: "control-api", note: "keyset: page 2 of 3 of the orders panel; a cursor of another panel or past page 3 answers 409 LIVE_SOURCE_CURSOR_EXPIRED" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/certification?include= [stage id, V2 workspace]`, url: `${EX}/deployments/dep_sandbox_01/certification?workspace_id=${V2_WS}&include=identity`, status: 200, source: "bffDoubleStage", real: "control-api", note: "BE-P12 opt-in: the V2 body plus the closed identity member (sandbox_identity of the positive-parent fixture); without include the body is the one above" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/canary?include= [stage id, V2 workspace]`, url: `${EX}/deployments/dep_canary_01/canary?workspace_id=${V2_WS}&include=identity`, status: 200, source: "bffDoubleStage", real: "control-api", note: "BE-P12 opt-in: the V2 body plus the closed identity member (canary_identity)" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/live?include= [stage id, V2 workspace]`, url: `${EX}/deployments/dep_live_01/live?workspace_id=${V2_WS}&include=identity%2Cstage_facts`, status: 200, source: "bffDoubleStage", real: "control-api", note: "BE-P12 opt-in: the V2 body plus identity and stage_facts (with_members of the live-source fixture: OPEN_FINDINGS, no count, runtime and sessions NOT_PUBLISHED)" },
  { method: "GET", pattern: `${EX}/deployments/{deployment_id}/live?include= [stage id, V2 workspace, bad include]`, url: `${EX}/deployments/dep_live_01/live?workspace_id=${V2_WS}&include=identity%2Cidentity`, status: 400, source: "bffDoubleStage", real: "control-api (typed refusal)", note: "EXECUTION_READ_QUERY_INVALID: a repeated token, an empty one or one the route does not publish is refused, never ignored" },
  { method: "GET", pattern: `${EX}/governance/review-capture-capabilities [note off]`, url: `${EX}/governance/review-capture-capabilities?workspace_id=ws_TEST_NOTE_OFF`, status: 200, source: "bffDoubleStage", real: "control-api", note: "SANDBOX_NOTE UNAVAILABLE (workspace_id=ws_TEST_NOTE_OFF); the default workspace answers AVAILABLE" },
  { method: "GET", pattern: "/api/v1/quantbt/runs", url: "/api/v1/quantbt/runs?limit=50", status: 200, source: "bffDoubleStage (via bffAnswerer)", real: "quantbt service", note: "the Run Library the New request pickers read: 5 COMPLETED runs for 3 alphas, one FAILED and one RUNNING that are never offered" },

  /* operations and commands */
  { method: "GET", pattern: `${EX}/operations`, url: `${EX}/operations?limit=50`, status: 200, source: "bffDoubleV2", real: "control-api", note: "filters triage_state, environment, source_status, verification_result, severity, target_type, target_id, command_key; sort; keyset" },
  { method: "GET", pattern: `${EX}/operations/incidents/{incident_id}`, url: `${EX}/operations/incidents/inc_fixture_44`, status: 200, source: "bffDoubleV2", real: "control-api" },
  { method: "GET", pattern: `${EX}/operations/{operation_id}`, url: `${EX}/operations/op_1`, status: 200, source: "bffDouble", real: "control-api" },
  { method: "GET", pattern: `${EX}/commands/tasks`, url: `${EX}/commands/tasks`, status: 200, source: "bffDoubleOverview", real: "control-api" },
  { method: "GET", pattern: `${EX}/commands/catalog`, url: `${EX}/commands/catalog`, status: 200, source: "bffDoubleOverview", real: "control-api" },

  /* writes the doubles model (kept exactly; nothing is stored) */
  { method: "POST", pattern: `${EX}/commands/plans`, url: `${EX}/commands/plans`, body: { command_key: "account/sync" }, status: 200, source: "bffDoubleOverview", real: "control-api", note: "always the canonical BLOCKED plan (COMMAND_RELAY_DISABLED); the specs' ACCEPTED/UNKNOWN walk is off. Answered 200 where the published route answers 201" },
  { method: "POST", pattern: `${EX}/commands/tasks/{task_id}/run`, url: `${EX}/commands/tasks/health/run`, body: {}, status: 409, source: "bffDoubleOverview", real: "control-api", note: "TASK_NOT_CONNECTED" },
  { method: "POST", pattern: `${EX}/governance/approvals`, url: `${EX}/governance/approvals`, body: {}, status: 201, source: "bffDouble", real: "control-api", note: "canned created body when the request carries no summary; nothing is stored" },
  { method: "POST", pattern: `${EX}/governance/approvals [with a summary]`, url: `${EX}/governance/approvals`, body: APPROVAL_REQUEST, status: 201, source: "bffDoubleStage", real: "control-api", note: "created, echoing the alpha; the approval id follows the request key; replayed when the summary starts REPLAY" },
  { method: "POST", pattern: `${EX}/governance/approvals [summary DUPLICATE]`, url: `${EX}/governance/approvals`, body: { ...APPROVAL_REQUEST, summary: "DUPLICATE of the open request" }, status: 409, source: "bffDoubleStage", real: "control-api (typed refusal)", note: "APPROVAL_DUPLICATE_OPEN_REQUEST naming AP-201" },
  { method: "POST", pattern: `${EX}/governance/approvals [summary REFUSE]`, url: `${EX}/governance/approvals`, body: { ...APPROVAL_REQUEST, summary: "REFUSE this request please" }, status: 422, source: "bffDoubleStage", real: "control-api (typed refusal)", note: "CLAIM_NOT_ELIGIBLE; DENIED answers 403 APPROVAL_CREATE_DENIED" },
  { method: "POST", pattern: `${EX}/governance/sandbox/capture-note`, url: `${EX}/governance/sandbox/capture-note`, body: SANDBOX_NOTE, status: 201, source: "bffDoubleStage", real: "control-api", note: "echoes the request's workspace, certification and key's deployment; replayed when the summary starts REPLAY; nothing is stored. With no body the doubles' canned body answers" },
  { method: "POST", pattern: `${EX}/governance/sandbox/capture-note [summary REFUSE]`, url: `${EX}/governance/sandbox/capture-note`, body: { ...SANDBOX_NOTE, summary: "REFUSE this note please" }, status: 409, source: "bffDoubleStage", real: "control-api (typed refusal)", note: "SANDBOX_NOTE_VERSION_CONFLICT; DENIED answers 403 GOVERNANCE_ADMIN_REQUIRED; an incomplete body 422" },
  { method: "POST", pattern: `${EX}/approvals/{approval_id}/capital-preview`, url: `${EX}/approvals/AP-352/capital-preview`, body: {}, status: 200, source: "bffDouble", real: "control-api", note: "canned preview" },
  { method: "POST", pattern: `${EX}/alphas/{alpha_id}/insight-previews`, url: `${EX}/alphas/alpha_btc_trend/insight-previews`, body: {}, status: 200, source: "bffDouble", real: "control-api", note: "canned preview" },
  { method: "POST", pattern: `${EX}/operations/{operation_id}/acknowledge`, url: `${EX}/operations/op_1/acknowledge`, body: {}, status: 200, source: "bffDouble", real: "control-api", note: "canned workflow body; nothing changes" },
  { method: "POST", pattern: `${EX}/operations/{operation_id}/resolve`, url: `${EX}/operations/op_1/resolve`, body: {}, status: 200, source: "bffDouble", real: "control-api", note: "canned workflow body; nothing changes" },
  { method: "POST", pattern: `${EX}/operations/{operation_id}/apply`, url: `${EX}/operations/op_1/apply`, body: {}, status: 202, source: "bffDouble", real: "control-api", note: "canned 202 operation; nothing is applied. The published route answers 409 COMMAND_RELAY_DISABLED while the relay is off" },
];

const NOT_V2 = "the double serves the V1-era envelope the readers read";

/**
 * Found by trying every execution schema against every body (a body that conforms to a schema it was
 * not written for is noise, so each hit below was also checked against the OpenAPI that publishes
 * the route). A route not listed here has no published schema that fits its body.
 */
export const SCHEMAS: Record<string, SchemaVerdict> = {
  "GET /api/admin/profile-access/v2/effective": { ref: { file: "../openapi/execution-access.openapi.json", ptr: "/components/schemas/AccessEffective" } },
  "GET /api/v1/execution/activation/capabilities": { ref: { file: "execution-staged-activation.v1", ptr: "/$defs/CapabilitiesResponse" } },
  "GET /api/v1/execution/command-center": { ref: { file: "execution-command-center-snapshot.v1", ptr: "" } },
  "GET /api/v1/execution/alphas": { ref: { file: "execution-alpha-fleet-list.v2", ptr: "/$defs/AlphaFleetResponse" } },
  "GET /api/v1/execution/alphas/{alpha_id}/query-analytics": { ref: { file: "execution-query-analytics.v1", ptr: "" } },
  "GET /api/v1/execution/portfolios/{portfolio_id}/query-analytics": { ref: { file: "execution-query-analytics.v1", ptr: "" } },
  "GET /api/admin/profile-access/v2/self-navigation": { ref: { file: "../openapi/execution-access.openapi.json", ptr: "/components/schemas/AccessSelfNavigation" } },
  "GET /api/admin/profile-access/v2/eligibility": { ref: { file: "../openapi/execution-access.openapi.json", ptr: "/components/schemas/AccessEligibility" } },
  "GET /api/admin/profile-access/v2/eligibility/batch": { ref: { file: "../openapi/execution-access.openapi.json", ptr: "/components/schemas/AccessEligibilityBatch" } },
  "GET /api/admin/profile-access/v2/self-context": { ref: { file: "../openapi/execution-access.openapi.json", ptr: "/components/schemas/AccessSelfContext" } },
  ...Object.fromEntries(
    ["", " [fund]", " [empty]", " [unavailable]", " [currency-mixed]", " [return]", " [return-scale-mixed]", " [return-scale-not-published]"]
      .map((variant) => [`GET /api/v1/execution/manager/series${variant}`, { ref: { file: "execution-manager-series.v1", ptr: "" } }] as const),
  ),
  ...Object.fromEntries(["", " [live]", " [sandbox]"].map((variant) => [`GET /api/v1/execution/manager/fleet${variant}`, { ref: { file: "execution-manager-dataset.v1", ptr: "" } }] as const)),
  ...Object.fromEntries(["", " [partial viewer]", " [stream not granted]", " [capacity]", " [wide ordinal]"].map((variant) => [`GET /api/v1/execution/manager/fleet/realtime-snapshot${variant}`,
    { ref: { file: "execution-alpha-fleet-realtime.v1", ptr: "/$defs/AlphaFleetRealtimeSnapshot" } }] as const)),
  ...Object.fromEntries(["", " [plain user]"].map((variant) => [`GET /api/v1/execution/governance/stage-action-eligibility${variant}`, { ref: { file: "../openapi/execution-governance.openapi.json", ptr: "/components/schemas/StageActionEligibility" } }] as const)),
  ...Object.fromEntries(["", " [none]", " [blocked]"].map((variant) => [`GET /api/v1/execution/governance/paper-exit/parent${variant}`, { ref: { file: "../openapi/execution-governance.openapi.json", ptr: "/components/schemas/PaperExitParent" } }] as const)),
  ...Object.fromEntries(["", " [found]", " [match]", " [conflict]"].map((variant) => [`GET /api/v1/execution/governance/approvals/request-lookup${variant}`, { ref: { file: "../openapi/execution-governance.openapi.json", ptr: "/components/schemas/ApprovalRequestLookup" } }] as const)),
  ...Object.fromEntries(["", " [deployment]", " [none]"].map((variant) => [`GET /api/v1/execution/pending-recalls${variant}`, { ref: { file: "../openapi/execution-pending-control.openapi.json", ptr: "/components/schemas/PendingRecallDiscovery" } }] as const)),
  "GET /api/v1/execution/market/candles":{ ref: { file: "execution-market-context.v1", ptr: "/$defs/CandlesResponse" } },
  "GET /api/v1/execution/portfolios": { ref: { file: "execution-portfolio-list.v1", ptr: "/$defs/PortfolioListResponse" } },
  "GET /api/v1/execution/broker-bindings": { ref: { file: "execution-manager-lists.v1", ptr: "/$defs/BindingsResponse" } },
  "GET /api/v1/execution/broker-bindings/{binding_id}": { ref: { file: "execution-manager-lists.v1", ptr: "/$defs/BindingDetailResponse" } },
  "GET /api/v1/execution/governance/review-capture-capabilities": { ref: { file: "execution-governance-review-capture.v1", ptr: "/$defs/Capabilities" } },
  "GET /api/v1/execution/deployments/{deployment_id}/certification": { ref: { file: "execution-sandbox-certification.v1", ptr: "/$defs/CertificationResponse" } },
  "GET /api/v1/execution/deployments/{deployment_id}/canary [stage id]": { ref: { file: "execution-canary-control-room.v1", ptr: "/$defs/CanaryControlRoom" } },
  "GET /api/v1/execution/deployments/{deployment_id}/live [stage id]": { ref: { file: "execution-live-full-operations.v1", ptr: "" } },
  "GET /api/v1/execution/deployments/{deployment_id}/certification [stage id]": { ref: { file: "execution-sandbox-certification.v1", ptr: "/$defs/CertificationResponse" } },
  "GET /api/v1/execution/deployments/{deployment_id}/certification [stage id, V2 workspace]": { ref: { file: OPS, ptr: "/$defs/SandboxParentReadV2" } },
  "GET /api/v1/execution/deployments/{deployment_id}/canary [stage id, V2 workspace]": { ref: { file: OPS, ptr: "/$defs/CanaryParentReadV2" } },
  "GET /api/v1/execution/deployments/{deployment_id}/live [stage id, V2 workspace]": { ref: { file: OPS, ptr: "/$defs/LiveSourceOperationsReadV2" } },
  "GET /api/v1/execution/deployments/{deployment_id}/live?panel=&cursor= [stage id, V2 workspace]": { ref: { file: OPS, ptr: "/$defs/LiveSourceOperationsReadV2" } },
  "GET /api/v1/execution/deployments/{deployment_id}/certification?include= [stage id, V2 workspace]": { ref: { file: OPS, ptr: "/$defs/SandboxParentReadV2" } },
  "GET /api/v1/execution/deployments/{deployment_id}/canary?include= [stage id, V2 workspace]": { ref: { file: OPS, ptr: "/$defs/CanaryParentReadV2" } },
  "GET /api/v1/execution/deployments/{deployment_id}/live?include= [stage id, V2 workspace]": { ref: { file: OPS, ptr: "/$defs/LiveSourceOperationsReadV2" } },
  ...Object.fromEntries([" [paper exit open]", " [paper exit off]"].map((variant) => [`GET /api/v1/execution/governance/review-capture-capabilities${variant}`, { ref: { file: "execution-governance-review-capture.v1", ptr: "/$defs/Capabilities" } }] as const)),
  "POST /api/v1/execution/governance/paper-exit/create": { ref: { file: "execution-governance-review-capture.v1", ptr: "/$defs/CaptureResponse" } },
  "GET /api/v1/execution/governance/review-capture-capabilities [note off]": { ref: { file: "execution-governance-review-capture.v1", ptr: "/$defs/Capabilities" } },
  "POST /api/v1/execution/governance/approvals [with a summary]": { ref: { file: "execution-governance-product.v1", ptr: "/$defs/ApprovalCreateResponse" } },
  "GET /api/v1/execution/operations": { ref: { file: OPS, ptr: "/$defs/OperationalQueueV2" } },
  "GET /api/v1/execution/operations/incidents/{incident_id}": { ref: { file: OPS, ptr: "/$defs/OperationalIncidentCurrentV2" } },
  "GET /api/v1/execution/operations/{operation_id}": { ref: { file: OPS, ptr: "/$defs/OperationWorkflowResponse" } },
  "GET /api/v1/execution/commands/tasks": { ref: { file: "execution-command-tasks.v1", ptr: "" } },
  "GET /api/v1/execution/commands/catalog": { ref: { file: OPS, ptr: "/$defs/CommandCatalogue" } },
  "POST /api/v1/execution/governance/approvals": { ref: { file: "execution-governance-product.v1", ptr: "/$defs/ApprovalCreateResponse" } },
  "POST /api/v1/execution/governance/sandbox/capture-note": { ref: { file: "execution-governance-review-capture.v1", ptr: "/$defs/CaptureResponse" } },
  "POST /api/v1/execution/commands/plans": { ref: { file: OPS, ptr: "/$defs/ExecutionCommandPlan" } },
  "POST /api/v1/execution/operations/{operation_id}/acknowledge": { ref: { file: OPS, ptr: "/$defs/OperationWorkflowResponse" } },
  "POST /api/v1/execution/operations/{operation_id}/resolve": { ref: { file: OPS, ptr: "/$defs/OperationWorkflowResponse" } },

  /* a published schema exists and the double does not conform to it: reported, not hidden */
  "GET /api/v1/execution/screens/paper/{deployment_id} [stage id]": { ref: { file: "execution-paper-read.v1", ptr: "" }, drift: "data.history_windows is not in the published Data schema; the V1 reader and the V2 workbench read it for the downsample caption (everything else conforms)" },
  "GET /api/v1/execution/screen-contracts": { ref: { file: "execution-screen-bff.v1", ptr: "/$defs/CatalogueResponse" }, drift: "the unit fixture lacks read_at, actor, exact_total and has more than the 23 screens the schema allows" },
  "GET /api/v1/execution/alphas/{alpha_id}/stage-drift": { ref: { file: "execution-alpha-stage-drift.v2", ptr: "" }, drift: "the double serves the pre-v2 stage-drift body (no schema_version, alpha_id, qualification)" },
  "GET /api/v1/execution/resources/alphas/{alpha_id}": { ref: { file: "execution-alpha-resource.v1", ptr: "" } },
  "GET /api/v1/execution/resources/alphas/{alpha_id}/orders": { ref: { file: "execution-subject-records.v1", ptr: "" } },
  "GET /api/v1/execution/resources/alphas/{alpha_id}/fills": { ref: { file: "execution-subject-records.v1", ptr: "" } },
  "GET /api/v1/execution/views/observed-timeline": { ref: { file: "execution-observed-timeline.v1", ptr: "" } },
  "GET /api/v1/execution/market/venue-candles": { ref: { file: "execution-market-candles.v1", ptr: "" } },
  "GET /api/v1/execution/market/venue-candles [ready]": { ref: { file: "execution-market-candles.v1", ptr: "" } },
  "GET /api/v1/execution/views/equity-chart [alpha]": { ref: { file: "execution-financial-chart.v1", ptr: "" } },
  "GET /api/v1/execution/resources/alphas/{alpha_id}/orders [page 2]": { ref: { file: "execution-subject-records.v1", ptr: "" } },
  "GET /api/v1/execution/views/observed-timeline [page 2]": { ref: { file: "execution-observed-timeline.v1", ptr: "" } },
  "GET /api/v1/execution/resources/alphas/{alpha_id} [alpha_empty]": { ref: { file: "execution-alpha-resource.v1", ptr: "" } },
  // SCOPED_V2 (R-3): judged against the published v2 contracts, not the legacy ones.
  ...Object.fromEntries(["", ", alpha_empty", ", alpha_bounded"].map((variant) => [
    `GET /api/v1/execution/resources/alphas/{alpha_id} [V2 workspace${variant}]`,
    { ref: { file: RES, ptr: "/$defs/AlphaScopedResourceWireResponse" } },
  ] as const)),
  ...Object.fromEntries(["orders [V2 workspace]", "orders [V2 workspace, page 2]", "fills [V2 workspace]"].map((variant) => [
    `GET /api/v1/execution/resources/alphas/{alpha_id}/${variant}`,
    { ref: { file: "../openapi/execution-scoped-records.openapi.json", ptr: "/components/schemas/ScopedSubjectRecordsResponse" } },
  ] as const)),
  "GET /api/v1/execution/resources/portfolios/{portfolio_id}": { ref: { file: RES, ptr: "/$defs/PortfolioScopedResourceWireResponse" }, drift: NOT_V2 },
  "GET /api/v1/execution/resources/accounts/{account_id}": { ref: { file: RES, ptr: "/$defs/AccountScopedResourceWireResponse" }, drift: NOT_V2 },
  "GET /api/v1/execution/resources/bindings/{binding_id}": { ref: { file: RES, ptr: "/$defs/BindingScopedResourceWireResponse" }, drift: NOT_V2 },
  "GET /api/v1/execution/governance/approvals": { ref: { file: "execution-governance-product.v1", ptr: "/$defs/ApprovalInboxResponse" }, drift: "the double serves the raw inbox page (rows, counts) the V1 reader reads, not the published envelope" },
  "GET /api/v1/execution/governance/approvals/history": { ref: { file: "execution-governance-approval-workflow.v1", ptr: "/$defs/ApprovalHistoryResponse" }, drift: "no actor, read_truth, applied_filters or applied_sort" },
  "GET /api/v1/execution/governance/approvals/{approval_id}/r1": { ref: { file: "execution-governance-approval-workflow.v1", ptr: "/$defs/R1ReviewResponse" }, drift: "the unit fixture carries no schema_version, record_authority, delivery_profile, read_at or data" },
  "GET /api/v1/execution/governance/waivers": { ref: { file: "execution-governance-product.v1", ptr: "/$defs/ConditionsRegisterResponse" }, drift: "no read_truth, empty applied_sort" },
};

export const ROUTES_BEGIN = "<!-- routes:begin (generated from apps/portal/frontend/src/fixtureBff/routeTable.ts) -->";
export const ROUTES_END = "<!-- routes:end -->";

const cell = (text: string): string => text.replace(/\|/g, "\\|");

/** The Markdown table ROUTES.md carries. */
export function routesMarkdown(): string {
  const head = ["| Method | Path | Status | Answered by | Served for real by | Schema | Note |", "|---|---|---|---|---|---|---|"];
  const rows = ROUTES.map((r) => {
    const verdict = SCHEMAS[`${r.method} ${r.pattern}`];
    const schema = verdict ? `${verdict.drift ? "DRIFT " : ""}\`${verdict.ref.file.replace(/^\.\.\/openapi\//, "")}#${verdict.ref.ptr || "/"}\`` : "none";
    return `| ${r.method} | \`${cell(r.pattern)}\` | ${r.status} | ${cell(r.source)} | ${r.real} | ${cell(schema)} | ${cell(r.note ?? "")} |`;
  });
  return [ROUTES_BEGIN, "", ...head, ...rows, "", ROUTES_END].join("\n");
}
