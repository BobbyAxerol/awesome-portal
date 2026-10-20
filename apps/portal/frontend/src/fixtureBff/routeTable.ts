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
const APPROVAL_REQUEST = { schema_version: "governance.approval-create-request.v1", request_key: "req-key-1", gate: "R1", alpha_id: "alpha_btc_trend", evidence_run_id: "run_btc_trend_a1", methodology_claim_id: "claim_btc_oos", summary: "Momentum with a venue calendar." };
const livePanelCursor = (panel: string, page: number): string => `lps2.${panel}.${String(page).padStart(8, "0")}.1234567890.${"A".repeat(43)}`;

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
  { method: "GET", pattern: `${EX}/market/venue-candles`, url: `${EX}/market/venue-candles?environment=paper&venue=BINANCE&symbol=ETHUSDT&interval=1h`, status: 200, source: "bffDoubleAlpha", real: "control-api", note: "a typed absence, not a series" },
  { method: "GET", pattern: `${EX}/market/candles`, url: `${EX}/market/candles?environment=paper&symbol=ETHUSDT&interval=1h`, status: 200, source: "bffDouble (canonical L0 body)", real: "control-api" },
  { method: "GET", pattern: `${EX}/manager/current/{relation}`, url: `${EX}/manager/current/orders?environment=paper&limit=200`, status: 200, source: "bffDouble", real: "control-api", note: "relation from the approved catalogue of 15; any other is not served" },

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
  "GET /api/v1/execution/market/candles": { ref: { file: "execution-market-context.v1", ptr: "/$defs/CandlesResponse" } },
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
  "GET /api/v1/execution/resources/alphas/{alpha_id}": { ref: { file: RES, ptr: "/$defs/AlphaScopedResourceWireResponse" }, drift: NOT_V2 },
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
