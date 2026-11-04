/**
 * Shared setup for the V2 lane specs (execution-v2-*.spec.ts): the entry-route table, the manager session the V2 pages
 * need, the admin route stubs and the console/response watcher. The s1 spec and the link crawler both use these, so the
 * two cannot drift on what "a V2 page with no console noise" means.
 */
import type { Page } from "@playwright/test";

import { answerAccessEffective } from "./bffDoubleAccess";
import { answerSelfAccess } from "./bffDoubleSelfAccess";
import { answerQuantbtRuns, STAGE_V2_WORKSPACE } from "./bffDoubleStage";
import { answerUsers } from "./bffDoubleUsers";

/** The workspace whose reads answer the V2 body of the stage routes (Sandbox, Canary, Live); see bffDoubleStage.ts. */
export const V2_WORKSPACE = STAGE_V2_WORKSPACE;

/** [name, route, root selector] for every V2 entry route. */
export const SCREENS = [
  ["overview", "/execution", '[data-screen="overview-v2"]'],
  ["fleet", "/deployments/alphas", ".exec-fleet-v2"],
  ["operations", "/execution/operations", ".exec-ops"],
  ["incident", "/execution/operations/incidents/inc_fixture_44", ".exec-opi"],
  ["cockpit", "/governance/approvals", ".exec-ck"],
  ["cockpit-r1", "/governance/approvals/AP-201/r1", ".exec-ck"],
  ["portfolios", "/deployments/portfolios", '[data-screen="portfolios-v2"]'],
  ["portfolio-360", "/deployments/portfolios/pf_TEST_ONLY_core", '[data-screen="portfolio-360-v2"]'],
  ["compare", "/deployments/compare?in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite", '[data-screen="compare-v2"]'],
  ["alpha-360", "/deployments/alphas/alpha_btc_trend", '[data-screen="alpha-360-v2"]'],
  ["alpha-replay", "/deployments/alphas/alpha_btc_trend?tab=replay", '[data-screen="trade-replay-v2"]'],
  ["accounts", "/deployments/accounts", ".exec-acct-v2"],
  ["account-360", "/deployments/accounts/acc_bnc_core", ".exec-acct-v2"],
  ["blotter", "/deployments/blotter", '[data-screen="blotter-v2"]'],
  ["admin", "/administration/actions", '[data-screen="admin-actions-v2"]'],
  ["users", "/administration/users", '[data-screen="users-v2"]'],
  ["access", "/administration/profile-access?workspace_id=ws_TEST_GRANTS", ".exec-acc-kpi"],
  // S3 stage screens. The ids are the ones the Alpha 360 double lists, so a click on its Deployments tab lands here.
  ["workbench", "/deployments/paper/dep_paper_01", '[data-screen="workbench-v2"]'],
  ["workbench-fills", "/deployments/paper/dep_paper_01?tab=fills", '[data-screen="workbench-v2"]'],
  ["workbench-vnm", "/deployments/paper/dep_paper_01/vn-market", '[data-screen="workbench-v2"]'],
  ["sandbox", "/deployments/sandbox/dep_sandbox_01", '[data-screen="sandbox-v2"]'],
  ["sandbox-steps", "/deployments/sandbox/dep_sandbox_01?tab=steps", '[data-screen="sandbox-v2"]'],
  ["sandbox-plans", "/deployments/sandbox/dep_sandbox_01?tab=Promotion+plans", '[data-screen="sandbox-v2"]'],
  ["sandbox-v2body", `/deployments/sandbox/dep_sandbox_01?workspace_id=${V2_WORKSPACE}`, '[data-screen="sandbox-v2"]'],
  ["canary", "/deployments/live/dep_canary_01/canary", '[data-screen="canary-v2"]'],
  ["canary-guard", "/deployments/live/dep_canary_01/canary?tab=guard-rule", '[data-screen="canary-v2"]'],
  ["canary-v2body", `/deployments/live/dep_canary_01/canary?workspace_id=${V2_WORKSPACE}`, '[data-screen="canary-v2"]'],
  ["live", "/deployments/live/dep_live_01", '[data-screen="live-v2"]'],
  ["live-continuity", "/deployments/live/dep_live_01?tab=continuity", '[data-screen="live-v2"]'],
  ["live-v2body", `/deployments/live/dep_live_01?workspace_id=${V2_WORKSPACE}`, '[data-screen="live-v2"]'],
  ["new-request", "/governance/approvals/new", '[data-screen="new-request-v2"]'],
  ["new-request-drawer", "/governance/approvals?compose=request", '[data-screen="new-request-drawer-v2"]'],
] as const;

/**
 * A manager-like session for the V2 pages: the owner capabilities the portal
 * issues today plus the four menu tokens a live self-navigation read would add
 * (`nav:<served feature id>`, FE-037, DEBT-UXM07-005; they are no server capability and this
 * lab session injects them as a stand-in for the projection). Without them every
 * Accounts/Portfolios/Operations page correctly stays fail-closed, which is the
 * default-session case covered by the unit tests.
 */
export const MANAGER_CAPABILITIES = [
  "administration.profile_access.manage",
  "administration.users.manage",
  "governance.canary.decide",
  "governance.canary.read",
  "governance.live.decide",
  "governance.live.read",
  "governance.r1.decide",
  "governance.r1.read",
  "governance.r2.decide",
  "governance.r2.read",
  "nav:EXECUTION_PORTFOLIOS",
  "nav:EXECUTION_ACCOUNTS_BINDINGS",
  "nav:EXECUTION_OPERATIONS",
  "nav:EXECUTION_BLOTTER",
];

const ACCESS_SELF_BODY = JSON.stringify({
  schema_version: "portal.owner-access.v1",
  record_authority: "PORTAL_CONTROL",
  user_id: "principal-visual-baseline",
  is_owner: true,
  owner_state: "OWNER",
  capabilities: MANAGER_CAPABILITIES,
  mutation_requirements: { origin: "REQUIRED", csrf: "REQUIRED", step_up: "REQUIRED_FOR_DESTRUCTIVE" },
});

/** Only the session read: every other /api/admin read keeps whatever answers it. */
export async function stubAccessSelf(page: Page): Promise<void> {
  await page.route("**/api/admin/access/self", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: ACCESS_SELF_BODY }),
  );
}

/** The admin reads live outside /api/v1/execution: the session, Access effective, the self reads and the Users roster. */
export async function stubAdminRoutes(page: Page): Promise<void> {
  await page.route("**/api/admin/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/access/self") {
      return route.fulfill({ status: 200, contentType: "application/json", body: ACCESS_SELF_BODY });
    }
    // The four advisory self reads (self-navigation, eligibility, the batch, self-context) answer from the canonical fixture,
    // stamped from the real clock with a ten-minute ceiling (specs that fix the page clock still see an answer that has not expired).
    const answer =
      answerSelfAccess(request.method(), url.pathname, url.searchParams, { nowMs: Date.now(), ceilingMs: 10 * 60_000 }) ??
      answerAccessEffective(request.method(), url.pathname, url.searchParams) ??
      answerUsers(request.method(), url.pathname, url.searchParams);
    if (answer === null) return route.fallback();
    return route.fulfill({ status: answer.status, contentType: answer.contentType ?? "application/json", body: typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body) });
  });
}

/**
 * `GET /api/v1/quantbt/runs?limit=50`, the Run Library the New request pickers read. It lives outside
 * `/api/v1/execution`, so `stubExecutionBff` does not answer it; without this the preview server answers the SPA shell
 * and the screen reports its Run Library as unreadable.
 */
export async function stubQuantbtRuns(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/quantbt\/runs(\?|$)/, (route) => {
    const request = route.request();
    const answer = answerQuantbtRuns(request.method(), new URL(request.url()).searchParams);
    if (answer === null) return route.fallback();
    return route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
}

export interface PageWatch {
  /** Requests that left the app's own origin. */
  readonly foreign: string[];
  /**
   * Console errors/warnings, page errors and failed responses seen since the last call, minus the tolerated
   * retained-review refusals. Chromium's own console line for a failed fetch names no URL; the response line does.
   * The double answers the UDB-03 retained-review read with the typed 404 "not configured" (a normal stack has
   * none), so that one URL and its console line are tolerated here and nowhere else.
   */
  take(): string[];
}

export function watchPage(page: Page, baseURL: string | undefined): PageWatch {
  const offences: string[] = [];
  const foreign: string[] = [];
  let retainedRefusals = 0;
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") offences.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => offences.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/v1/execution/retained-review") {
      retainedRefusals += 1;
      return;
    }
    if (response.status() >= 400) offences.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}${new URL(response.url()).search}`);
  });
  const origin = new URL(baseURL ?? "http://127.0.0.1:4176").origin;
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin) foreign.push(request.url());
  });
  const expected = (line: string) => /Failed to load resource.*404/.test(line);
  return {
    foreign,
    take() {
      let tolerated = retainedRefusals;
      const lines = offences.splice(0).filter((line) => !(expected(line) && tolerated-- > 0));
      retainedRefusals = Math.max(0, tolerated);
      return lines;
    },
  };
}
