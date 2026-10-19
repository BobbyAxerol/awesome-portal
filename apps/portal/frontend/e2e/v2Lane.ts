/**
 * Shared setup for the V2 lane specs (execution-v2-*.spec.ts): the entry-route table, the manager session the V2 pages
 * need, the admin route stubs and the console/response watcher. The s1 spec and the link crawler both use these, so the
 * two cannot drift on what "a V2 page with no console noise" means.
 */
import type { Page } from "@playwright/test";

import { answerAccessEffective } from "./bffDoubleAccess";
import { answerUsers } from "./bffDoubleUsers";

/** [name, route, root selector] for every V2 entry route. */
export const SCREENS = [
  ["overview", "/execution", '[data-screen="overview-v2"]'],
  ["fleet", "/deployments/alphas", ".exec-fleet-v2"],
  ["operations", "/execution/operations", ".exec-ops"],
  ["incident", "/execution/operations/incidents/inc_fixture_44", ".exec-ops"],
  ["cockpit", "/governance/approvals", ".exec-ck"],
  ["cockpit-r1", "/governance/approvals/AP-201/r1", ".exec-ck"],
  ["portfolios", "/deployments/portfolios", '[data-screen="portfolios-v2"]'],
  ["portfolio-360", "/deployments/portfolios/pf_TEST_ONLY_core", '[data-screen="portfolio-360-v2"]'],
  ["compare", "/deployments/portfolios?view=compare&in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite", '[data-screen="compare-v2"]'],
  ["alpha-360", "/deployments/alphas/alpha_btc_trend", '[data-screen="alpha-360-v2"]'],
  ["alpha-replay", "/deployments/alphas/alpha_btc_trend?tab=replay", '[data-screen="alpha-360-v2"]'],
  ["accounts", "/deployments/accounts", ".exec-acct-v2"],
  ["account-360", "/deployments/accounts/acc_bnc_core", ".exec-acct-v2"],
  ["blotter", "/deployments/blotter", '[data-screen="blotter-v2"]'],
  ["admin", "/administration/actions", '[data-screen="admin-actions-v2"]'],
  ["users", "/administration/users", '[data-screen="users-v2"]'],
  ["access", "/administration/profile-access?workspace_id=ws_TEST_GRANTS", ".exec-acc-kpi"],
] as const;

/**
 * A manager-like session for the V2 pages: the owner capabilities the portal
 * issues today plus the provisional execution names (FE-037). Without the
 * execution names every Accounts/Portfolios/Operations page correctly stays
 * fail-closed, which is the default-session case covered by the unit tests.
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
  "execution.portfolios.read",
  "execution.accounts.read",
  "execution.operations.read",
  "portal.execution.blotter.read",
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

/** The admin reads live outside /api/v1/execution: the session, Access effective and the Users roster. */
export async function stubAdminRoutes(page: Page): Promise<void> {
  await page.route("**/api/admin/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/access/self") {
      return route.fulfill({ status: 200, contentType: "application/json", body: ACCESS_SELF_BODY });
    }
    const answer = answerAccessEffective(request.method(), url.pathname, url.searchParams) ?? answerUsers(request.method(), url.pathname, url.searchParams);
    if (answer === null) return route.fallback();
    return route.fulfill({ status: answer.status, contentType: answer.contentType ?? "application/json", body: typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body) });
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
