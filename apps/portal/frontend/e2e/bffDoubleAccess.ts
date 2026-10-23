/**
 * Access self-view read for the e2e double (UXM-07 S1e).
 *
 * Serves `GET /api/admin/profile-access/v2/effective` as
 * `portal.access-effective.v1`, built from the canonical contract fixture
 * (`packages/contracts/fixtures/execution-access.synthetic.valid.json`, case
 * `AccessEffective`, the shipped POLICY_PENDING / empty-grants body) plus a few
 * synthetic grants for the AVAILABLE state.
 *
 * This route is NOT under `/api/v1/execution/`, so `answerExecutionBff` never
 * sees it. Wiring (the primary owns `stubPortalApi` in `e2e/fixtures.ts`, which
 * already stubs the other `/api/admin/**` reads):
 *
 *   await page.route("**\/api/admin/profile-access/v2/effective**", (route) => {
 *     const url = new URL(route.request().url());
 *     const answer = answerAccessEffective(route.request().method(), url.pathname, url.searchParams, {
 *       userId: "principal-visual-baseline",   // the user_id `/api/admin/access/self` answers
 *     });
 *     if (answer === null) return void route.fallback();
 *     return void route.fulfill({
 *       status: answer.status,
 *       contentType: answer.contentType ?? "application/json",
 *       body: typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body),
 *     });
 *   });
 *
 * The state is chosen by the `workspace_id` the page asks for, so a test needs
 * no extra plumbing: open `/administration/profile-access?workspace_id=<one of
 * ACCESS_DOUBLE_WORKSPACES>`. Any other workspace id answers POLICY_PENDING,
 * the shipped state.
 *
 *   pending      ws_TEST_ONLY         POLICY_PENDING, no grants (the shipped body)
 *   available    ws_TEST_GRANTS       AVAILABLE with four synthetic grants
 *   empty        ws_TEST_EMPTY        AVAILABLE, no grants
 *   denied       ws_TEST_DENIED       403 ACCESS_DENIED
 *   unavailable  ws_TEST_UNAVAILABLE  503 ACCESS_UNAVAILABLE
 *   malformed    ws_TEST_MALFORMED    200 with a grant the strict reader refuses
 *   otherUser    ws_TEST_OTHER_USER   200 for a different user_id (must not render)
 *
 * The refusals mimic the controller: the query is strict (`workspace_id` and
 * nothing else, else 400 `ACCESS_INPUT_INVALID`), and a non-GET on this path is
 * not answered (`null`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BffAnswerAccess {
  status: number;
  body: unknown;
  contentType?: string;
}

export const ACCESS_EFFECTIVE_ROUTE = "/api/admin/profile-access/v2/effective";

export const ACCESS_DOUBLE_WORKSPACES = {
  pending: "ws_TEST_ONLY",
  available: "ws_TEST_GRANTS",
  empty: "ws_TEST_EMPTY",
  denied: "ws_TEST_DENIED",
  unavailable: "ws_TEST_UNAVAILABLE",
  malformed: "ws_TEST_MALFORMED",
  otherUser: "ws_TEST_OTHER_USER",
} as const;

/** The user the shell's `/api/admin/access/self` stub signs in (`e2e/fixtures.ts`). */
export const ACCESS_DOUBLE_DEFAULT_USER = "principal-visual-baseline";

export interface AccessDoubleOptions {
  /** The session user. The body carries it as `user_id`; the screen refuses a body for anyone else. */
  userId?: string;
}

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const FIXTURE = JSON.parse(
  readFileSync(join(CONTRACTS, "execution-access.synthetic.valid.json"), "utf8"),
) as { cases: { type: string; value: Record<string, unknown> }[] };
const PENDING_BODY = FIXTURE.cases.find((entry) => entry.type === "AccessEffective")!.value;

const utc = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);

const SYNTHETIC_GRANTS = [
  {
    grant_id: "acg_TEST_ONLY_portfolio_read",
    action: "portfolio.read",
    effect: "ALLOW",
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: ["pf_TEST_ONLY_core", "pf_TEST_ONLY_satellite"] },
    environments: ["paper", "sandbox"],
    valid_from_ms: utc(2026, 9, 1, 9, 14),
    valid_until_ms: null,
    revision: "r3_TEST_ONLY",
    current: true,
    ts_authority: "NOT_REQUIRED",
  },
  {
    grant_id: "acg_TEST_ONLY_alpha_edit",
    action: "alpha.metadata.edit",
    effect: "ALLOW",
    selector: { kind: "OWN_ALPHA" },
    environments: ["paper"],
    valid_from_ms: utc(2026, 8, 20, 8, 30),
    valid_until_ms: utc(2026, 12, 31, 23, 59),
    revision: "r1_TEST_ONLY",
    current: true,
    ts_authority: "NOT_REQUIRED",
  },
  {
    grant_id: "acg_TEST_ONLY_capital_preview",
    action: "capital.preview",
    effect: "ALLOW",
    selector: { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: ["pf_TEST_ONLY_core"] },
    environments: ["live"],
    valid_from_ms: utc(2026, 10, 17, 9, 14),
    valid_until_ms: utc(2027, 1, 31, 0, 0),
    revision: "r2_TEST_ONLY",
    current: false,
    ts_authority: "PENDING",
  },
  {
    grant_id: "acg_TEST_ONLY_export_deny",
    action: "report.export",
    effect: "DENY",
    selector: { kind: "ROOT_SCOPE", root_id: "root_TEST_ONLY" },
    environments: ["paper", "sandbox", "live"],
    valid_from_ms: utc(2026, 9, 1, 9, 14),
    valid_until_ms: null,
    revision: "r1_TEST_ONLY",
    current: true,
    ts_authority: "NOT_REQUIRED",
  },
] as const;

function bodyFor(workspaceId: string, userId: string): Record<string, unknown> {
  return { ...PENDING_BODY, workspace_id: workspaceId, user_id: userId };
}

function problem(status: number, code: string, message: string): BffAnswerAccess {
  return { status, body: { error: { code, message }, request_id: "req_double_access_effective" } };
}

/**
 * Answers the effective read, or `null` when the request is not this route.
 * `pathname` is the full URL path (`/api/admin/profile-access/v2/effective`).
 */
export function answerAccessEffective(
  method: string,
  pathname: string,
  search: URLSearchParams,
  options: AccessDoubleOptions = {},
): BffAnswerAccess | null {
  if (method.toUpperCase() !== "GET" || pathname !== ACCESS_EFFECTIVE_ROUTE) return null;
  const userId = options.userId ?? ACCESS_DOUBLE_DEFAULT_USER;

  const keys = [...search.keys()];
  const workspaceId = search.get("workspace_id");
  if (keys.length !== 1 || workspaceId === null || workspaceId === "" || search.getAll("workspace_id").length !== 1) {
    return problem(400, "ACCESS_INPUT_INVALID", "Check the access request fields.");
  }

  switch (workspaceId) {
    case ACCESS_DOUBLE_WORKSPACES.denied:
      return problem(403, "ACCESS_DENIED", "The requested access is not available.");
    case ACCESS_DOUBLE_WORKSPACES.unavailable:
      return problem(503, "ACCESS_UNAVAILABLE", "The access service is not available.");
    case ACCESS_DOUBLE_WORKSPACES.available:
      return {
        status: 200,
        body: {
          ...bodyFor(workspaceId, userId),
          policy_revision: "p1_TEST_ONLY",
          availability: "AVAILABLE",
          reason_code: null,
          grants: SYNTHETIC_GRANTS,
        },
      };
    case ACCESS_DOUBLE_WORKSPACES.empty:
      return {
        status: 200,
        body: { ...bodyFor(workspaceId, userId), policy_revision: "p1_TEST_ONLY", availability: "AVAILABLE", reason_code: null, grants: [] },
      };
    case ACCESS_DOUBLE_WORKSPACES.malformed:
      return {
        status: 200,
        body: {
          ...bodyFor(workspaceId, userId),
          policy_revision: "p1_TEST_ONLY",
          availability: "AVAILABLE",
          reason_code: null,
          // An action outside the dotted-token grammar: the strict reader voids the whole read.
          grants: [{ ...SYNTHETIC_GRANTS[0], action: "NOT A TOKEN" }],
        },
      };
    case ACCESS_DOUBLE_WORKSPACES.otherUser:
      return { status: 200, body: bodyFor(workspaceId, "usr_TEST_ONLY_someone_else") };
    default:
      // The shipped state: POLICY_PENDING, empty grants.
      return { status: 200, body: bodyFor(workspaceId, userId) };
  }
}

/* ── the owner's grant matrix (`GET /api/admin/profile-access`, the V1 "Manage grants" read) ─────────────────────────────────────
 * SIMULATED (FIXTURE_LAB, WP-E): a roster of five accounts with their governance capabilities, so the matrix draws and a deployed
 * preview does not say "Could not read the access policy". Reads only (a write is not answered here: the lane refuses it). The ids
 * are fixture ids; nothing here names a real person or authorizes a change. Register: SIMULATED_DATA_REGISTER section 2d. */

export const PROFILE_ACCESS_POLICY_ROUTE = "/api/admin/profile-access";
export const PROFILE_ACCESS_ACTIVITY_ROUTE = "/api/admin/profile-access/activity";

type PolicyCapability = { capability: string; grant_id: string; workspace_id: string | null; grant_revision: number };
const grant = (user: string, capability: string, revision = 1): PolicyCapability => ({
  capability,
  grant_id: `grt_${user}_${capability.replace(/\./g, "_")}`,
  workspace_id: null,
  grant_revision: revision,
});
const both = (user: string, gate: string) => [grant(user, `governance.${gate}.read`), grant(user, `governance.${gate}.decide`)];

/** The five accounts of the design's matrix: an owner (absent from the grid), a researcher, a reviewer, an operator, a former analyst. */
export function policyAccounts(ownerUserId: string): Record<string, unknown>[] {
  return [
    { user_id: ownerUserId, username: "bobby", display_name: "Bobby Vu", is_owner: true, account_state: "ACTIVE", capabilities: [] },
    { user_id: "usr_fx_stan", username: "stan", display_name: "Stan", is_owner: false, account_state: "ACTIVE", capabilities: [grant("stan", "governance.r1.read")] },
    {
      user_id: "usr_fx_minh", username: "minh", display_name: "Minh", is_owner: false, account_state: "ACTIVE",
      capabilities: [...both("minh", "r1"), ...both("minh", "r2"), ...both("minh", "canary"), grant("minh", "governance.live.read")],
    },
    { user_id: "usr_fx_lan", username: "lan", display_name: "Lan", is_owner: false, account_state: "ACTIVE", capabilities: [] },
    { user_id: "usr_fx_former", username: "former-analyst", display_name: "Former analyst", is_owner: false, account_state: "ARCHIVED", capabilities: [] },
  ];
}

/** Answers the policy read and the per-account activity read, or `null` when the request is neither. GET only. */
export function answerProfileAccessPolicy(method: string, pathname: string, search: URLSearchParams, options: AccessDoubleOptions = {}): BffAnswerAccess | null {
  if (method.toUpperCase() !== "GET") return null;
  const userId = options.userId ?? ACCESS_DOUBLE_DEFAULT_USER;
  if (pathname === PROFILE_ACCESS_POLICY_ROUTE) {
    if ([...search.keys()].length > 0) return problem(400, "ACCESS_INPUT_INVALID", "Check the access request fields.");
    return { status: 200, body: { accounts: policyAccounts(userId) } };
  }
  if (pathname === PROFILE_ACCESS_ACTIVITY_ROUTE) {
    const grantee = search.get("grantee_user_id");
    if (grantee === null || grantee === "") return problem(400, "ACCESS_INPUT_INVALID", "Check the access request fields.");
    const known = policyAccounts(userId).some((account) => account.user_id === grantee);
    if (!known) return problem(404, "ACCOUNT_NOT_FOUND", "The account was not found.");
    return {
      status: 200,
      body: {
        activity: grantee === "usr_fx_minh"
          ? [
              { event_id: "evt_fx_1", action: "GRANT", capability: "governance.r2.decide", outcome: "APPLIED", reason_code: null, step_up_used: true, occurred_at: "2026-10-12T09:30:00.000Z" },
              { event_id: "evt_fx_2", action: "GRANT", capability: "governance.r1.decide", outcome: "APPLIED", reason_code: null, step_up_used: true, occurred_at: "2026-10-01T08:00:00.000Z" },
            ]
          : [],
      },
    };
  }
  return null;
}
