/**
 * Self-access reads for the e2e double (UXM-07 W1/W3, FIXTURE_LAB / BFF_DOUBLE lane, NOT acceptance evidence).
 *
 * Serves the two advisory self reads Codex published at `7818d563`, built from the CANONICAL fixture
 * (`packages/contracts/fixtures/execution-access.synthetic.valid.json`), never a hand copy:
 *
 *   GET /api/admin/profile-access/v2/self-navigation?workspace_id=&environment=   portal.self-navigation.v1
 *   GET /api/admin/profile-access/v2/eligibility?workspace_id=&environment=&resource_kind=&resource_id=&actions=
 *                                                                                   portal.self-eligibility.v1
 *
 * What is rewritten and what is not. The fixture's clock (`1792094400000..1792094405000`, a synthetic fact from 2026-10-15) is
 * long past in a browser, so the double re-stamps `observed_at_ms` / `valid_until_ms` from the `nowMs` / `ceilingMs` the caller
 * supplies (the spec owns the clock), and echoes the asked `workspace_id` / `environment`. Every other byte of the case body is the
 * fixture's. It adds no feature row, no action row and no permission the fixture does not state.
 *
 * Which case answers is chosen by the workspace the page asks about, like `bffDoubleAccess.ts`:
 *
 *   ws_TEST_ONLY         APP_ONLY_NOT_SOURCE_AUTHORITY   Portfolios, Accounts, Blotter ENTERABLE; Operations HIDDEN
 *   ws_TEST_NONE         ABSENT_PERMISSION               all four HIDDEN
 *   ws_TEST_LEGACY       ROUTING_LEGACY_COMPATIBILITY_NOT_A_GRANT
 *   ws_TEST_DENIED       403 ACCESS_DENIED
 *   ws_TEST_UNAVAILABLE  503 ACCESS_UNAVAILABLE
 *   ws_TEST_MALFORMED    200 with a key the closed contract does not have
 *   any other id         APP_ONLY (so a spec can use ws_a / ws_b to prove scope isolation)
 *
 * Eligibility answers only the one resource and action the fixture states (`PORTFOLIO` `portfolio_TEST_ONLY`, `portfolio.read`):
 * any other question gets a typed 404 `NOT_IN_FIXTURE`, because inventing a row for it would be inventing a permission.
 * `ws_TEST_NONE` answers the ABSENT_PERMISSION case. Query grammar mirrors the controller: exactly the published keys, else 400.
 * Non-GET is not answered (`null`).
 *
 * Also `eligibility/batch` (`portal.self-eligibility-batch.v2`, the fixture's two resources and two actions, anything else a typed 404)
 * and `self-context` (`portal.self-context.v1`, no query; the case is a module-level choice); `answerSelfAccess` asks all four.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BffAnswerSelfAccess {
  status: number;
  body: unknown;
  contentType?: string;
}

export const SELF_NAVIGATION_ROUTE = "/api/admin/profile-access/v2/self-navigation";
export const ELIGIBILITY_ROUTE = "/api/admin/profile-access/v2/eligibility";

export const SELF_ACCESS_DOUBLE_WORKSPACES = {
  appOnly: "ws_TEST_ONLY",
  none: "ws_TEST_NONE",
  legacy: "ws_TEST_LEGACY",
  denied: "ws_TEST_DENIED",
  unavailable: "ws_TEST_UNAVAILABLE",
  malformed: "ws_TEST_MALFORMED",
} as const;

export interface SelfAccessClock {
  /** Portal evaluation time to publish as `observed_at_ms`. */
  nowMs: number;
  /** `valid_until_ms - observed_at_ms`; must be positive (the producer invariant). */
  ceilingMs: number;
}

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const FIXTURE = JSON.parse(readFileSync(join(CONTRACTS, "execution-access.synthetic.valid.json"), "utf8")) as {
  cases: { type: string; case_name?: string; value: Record<string, unknown> }[];
};
const caseOf = (type: string, name: string): Record<string, unknown> => {
  const found = FIXTURE.cases.find((entry) => entry.type === type && entry.case_name === name);
  if (!found) throw new Error(`canonical fixture has no ${type}/${name}`);
  return found.value;
};

const NAV_CASE_BY_WORKSPACE: Readonly<Record<string, string>> = {
  [SELF_ACCESS_DOUBLE_WORKSPACES.none]: "ABSENT_PERMISSION",
  [SELF_ACCESS_DOUBLE_WORKSPACES.legacy]: "ROUTING_LEGACY_COMPATIBILITY_NOT_A_GRANT",
};

function problem(status: number, code: string, message: string): BffAnswerSelfAccess {
  return { status, body: { error: { code, message }, request_id: `req_double_${code.toLowerCase()}` } };
}

const ENVIRONMENTS = ["paper", "sandbox", "live"];
const WORKSPACE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function strictQuery(search: URLSearchParams, keys: readonly string[]): boolean {
  const seen = [...search.keys()];
  return seen.length === keys.length && new Set(seen).size === seen.length && keys.every((key) => search.has(key));
}

function stamp(body: Record<string, unknown>, workspaceId: string, environment: string, clock: SelfAccessClock): Record<string, unknown> {
  return { ...body, workspace_id: workspaceId, environment, observed_at_ms: clock.nowMs, valid_until_ms: clock.nowMs + clock.ceilingMs };
}

/** `GET self-navigation`, or `null` when the request is not this route. */
export function answerSelfNavigation(method: string, pathname: string, search: URLSearchParams, clock: SelfAccessClock): BffAnswerSelfAccess | null {
  if (pathname !== SELF_NAVIGATION_ROUTE || method !== "GET") return null;
  const workspaceId = search.get("workspace_id") ?? "";
  const environment = search.get("environment") ?? "";
  if (!strictQuery(search, ["workspace_id", "environment"]) || !WORKSPACE_ID.test(workspaceId) || !ENVIRONMENTS.includes(environment)) {
    return problem(400, "ACCESS_INPUT_INVALID", "The query is workspace_id and environment, nothing else.");
  }
  if (workspaceId === SELF_ACCESS_DOUBLE_WORKSPACES.denied) return problem(403, "ACCESS_DENIED", "Not permitted.");
  if (workspaceId === SELF_ACCESS_DOUBLE_WORKSPACES.unavailable) return problem(503, "ACCESS_UNAVAILABLE", "Unavailable.");
  const body = stamp(caseOf("AccessSelfNavigation", NAV_CASE_BY_WORKSPACE[workspaceId] ?? "APP_ONLY_NOT_SOURCE_AUTHORITY"), workspaceId, environment, clock);
  if (workspaceId === SELF_ACCESS_DOUBLE_WORKSPACES.malformed) return { status: 200, body: { ...body, ttl_ms: 60000 } };
  return { status: 200, body };
}

/** `GET eligibility`, or `null` when the request is not this route. */
export function answerEligibility(method: string, pathname: string, search: URLSearchParams, clock: SelfAccessClock): BffAnswerSelfAccess | null {
  if (pathname !== ELIGIBILITY_ROUTE || method !== "GET") return null;
  const workspaceId = search.get("workspace_id") ?? "";
  const environment = search.get("environment") ?? "";
  if (!strictQuery(search, ["workspace_id", "environment", "resource_kind", "resource_id", "actions"]) || !WORKSPACE_ID.test(workspaceId) || !ENVIRONMENTS.includes(environment)) {
    return problem(400, "ACCESS_INPUT_INVALID", "The query is workspace_id, environment, resource_kind, resource_id and actions, nothing else.");
  }
  if (workspaceId === SELF_ACCESS_DOUBLE_WORKSPACES.denied) return problem(403, "ACCESS_DENIED", "Not permitted.");
  if (workspaceId === SELF_ACCESS_DOUBLE_WORKSPACES.unavailable) return problem(503, "ACCESS_UNAVAILABLE", "Unavailable.");
  const name = workspaceId === SELF_ACCESS_DOUBLE_WORKSPACES.none ? "ABSENT_PERMISSION" : "POSITIVE_SHAPE_NOT_INSTALLED_AUTHORITY";
  const base = caseOf("AccessEligibility", name) as { resource: { kind: string; id: string }; actions: { action: string }[] };
  const sameQuestion = search.get("resource_kind") === base.resource.kind && search.get("resource_id") === base.resource.id
    && search.get("actions") === base.actions.map((row) => row.action).join(",");
  if (!sameQuestion) return problem(404, "NOT_IN_FIXTURE", "The canonical fixture states one resource and one action; the double invents no other row.");
  return { status: 200, body: stamp(base as unknown as Record<string, unknown>, workspaceId, environment, clock) };
}

/* ── the batch and the self-context (BE-P5 a74f6456, FE-057/058) ─────────────────────────────────────────────────────── */

export const ELIGIBILITY_BATCH_ROUTE = "/api/admin/profile-access/v2/eligibility/batch";
export const SELF_CONTEXT_ROUTE = "/api/admin/profile-access/v2/self-context";

/** The workspace that selects the STEP_UP_ACTIVE batch case (any other workspace answers STEP_UP_REQUIRED_NOT_ACTIVE). */
export const BATCH_STEP_UP_ACTIVE_WORKSPACE = "ws_TEST_STEP_UP_ACTIVE";

const OPENAPI = JSON.parse(readFileSync(join(CONTRACTS, "../openapi/execution-access.openapi.json"), "utf8")) as {
  paths: Record<string, { get?: { parameters?: { name: string; schema?: { pattern?: string } }[] } }>;
};
/** The grammar of a batch parameter, read from the published OpenAPI rather than restated. */
const batchPattern = (name: string): RegExp => {
  const pattern = OPENAPI.paths[ELIGIBILITY_BATCH_ROUTE]?.get?.parameters?.find((parameter) => parameter.name === name)?.schema?.pattern;
  if (!pattern) throw new Error(`the published OpenAPI has no pattern for ${ELIGIBILITY_BATCH_ROUTE} ${name}`);
  return new RegExp(pattern);
};
const BATCH_RESOURCES = batchPattern("resources");
const BATCH_ACTIONS = batchPattern("actions");

interface BatchFixture {
  workspace_id: string;
  observed_at_ms: number;
  valid_until_ms: number;
  session_step_up: { state: string; valid_until_ms: number | null };
  results: { resource: { kind: string; id: string }; actions: { action: string }[] }[];
}
const batchCase = (name: string): BatchFixture & Record<string, unknown> => {
  const file = JSON.parse(readFileSync(join(CONTRACTS, "execution-access.synthetic.valid.json"), "utf8")) as { batch_cases: { case_name: string; value: BatchFixture & Record<string, unknown> }[] };
  const found = file.batch_cases.find((entry) => entry.case_name === name);
  if (!found) throw new Error(`canonical fixture has no AccessEligibilityBatch/${name}`);
  return found.value;
};

/**
 * `GET eligibility/batch`, or `null` when the request is not this route. Answers only the question the fixture states (its
 * resources in its order, its actions); anything else is a typed 404, because a row for another question would be a permission
 * the fixture does not state. The body is `portal.self-eligibility-batch.v2`, as the OpenAPI publishes it.
 */
export function answerEligibilityBatch(method: string, pathname: string, search: URLSearchParams, clock: SelfAccessClock): BffAnswerSelfAccess | null {
  if (pathname !== ELIGIBILITY_BATCH_ROUTE || method !== "GET") return null;
  const workspaceId = search.get("workspace_id") ?? "";
  const environment = search.get("environment") ?? "";
  const resources = search.get("resources") ?? "";
  const actions = search.get("actions") ?? "";
  if (!strictQuery(search, ["workspace_id", "environment", "resources", "actions"]) || !WORKSPACE_ID.test(workspaceId) || !ENVIRONMENTS.includes(environment) || !BATCH_RESOURCES.test(resources) || !BATCH_ACTIONS.test(actions)) {
    return problem(400, "ACCESS_INPUT_INVALID", "The query is workspace_id, environment, resources (1 to 8 KIND:id tokens) and actions, nothing else.");
  }
  if (workspaceId === SELF_ACCESS_DOUBLE_WORKSPACES.denied) return problem(403, "ACCESS_DENIED", "Not permitted.");
  if (workspaceId === SELF_ACCESS_DOUBLE_WORKSPACES.unavailable) return problem(503, "ACCESS_UNAVAILABLE", "Unavailable.");
  const base = batchCase(workspaceId === BATCH_STEP_UP_ACTIVE_WORKSPACE ? "STEP_UP_ACTIVE" : "STEP_UP_REQUIRED_NOT_ACTIVE");
  const askedResources = resources.split(",");
  const statedResources = base.results.map((result) => `${result.resource.kind}:${encodeURIComponent(result.resource.id)}`);
  const sameQuestion = askedResources.length === statedResources.length && askedResources.every((token, index) => token === statedResources[index])
    && base.results.every((result) => result.actions.map((row) => row.action).join(",") === actions);
  if (!sameQuestion) return problem(404, "NOT_IN_FIXTURE", "The canonical fixture states one set of resources and actions; the double invents no other row.");
  const stepUp = base.session_step_up;
  const offset = stepUp.valid_until_ms === null ? null : stepUp.valid_until_ms - base.observed_at_ms;
  const stamped = stamp(base, workspaceId, environment, clock);
  return {
    status: 200,
    body: { ...stamped, session_step_up: { ...stepUp, valid_until_ms: offset === null ? null : clock.nowMs + Math.min(offset, clock.ceilingMs - 1) } },
  };
}

export const SELF_CONTEXT_CASES = [
  "RESOLVED_SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD",
  "RESOLVED_SOLE_MEMBERSHIP",
  "AMBIGUOUS_SEVERAL_WITH_GRANT_RECORDS",
  "AMBIGUOUS_MEMBER_ONLY",
  "ABSENT_NO_MEMBERSHIP",
  "UNAVAILABLE_TOO_MANY_MEMBERSHIPS",
] as const;
export type SelfContextCase = (typeof SELF_CONTEXT_CASES)[number];

/**
 * The read takes no parameter, so no query can pick a case: the double answers the first fixture case (a sole workspace with a
 * current grant record) until a spec or test names another here. A module-level choice, like `setUsersDoubleVariant`.
 */
let selfContextCase: SelfContextCase = SELF_CONTEXT_CASES[0];
export const setSelfContextCase = (name: SelfContextCase): void => {
  selfContextCase = name;
};

/** `GET self-context`, or `null` when the request is not this route. The read has no parameters: any query key is a 400. */
export function answerSelfContext(method: string, pathname: string, search: URLSearchParams, clock: SelfAccessClock): BffAnswerSelfAccess | null {
  if (pathname !== SELF_CONTEXT_ROUTE || method !== "GET") return null;
  if ([...search.keys()].length !== 0) return problem(400, "ACCESS_INPUT_INVALID", "This read takes no query.");
  const file = JSON.parse(readFileSync(join(CONTRACTS, "execution-access.synthetic.valid.json"), "utf8")) as { self_context_cases: { case_name: string; value: Record<string, unknown> }[] };
  const found = file.self_context_cases.find((entry) => entry.case_name === selfContextCase);
  if (!found) throw new Error(`canonical fixture has no AccessSelfContext/${selfContextCase}`);
  return { status: 200, body: { ...found.value, observed_at_ms: clock.nowMs, valid_until_ms: clock.nowMs + clock.ceilingMs } };
}

/** All four self-access reads (self-navigation, eligibility, the batch, the self-context), in the order the answerer asks. */
export function answerSelfAccess(method: string, pathname: string, search: URLSearchParams, clock: SelfAccessClock): BffAnswerSelfAccess | null {
  return answerSelfNavigation(method, pathname, search, clock)
    ?? answerEligibility(method, pathname, search, clock)
    ?? answerEligibilityBatch(method, pathname, search, clock)
    ?? answerSelfContext(method, pathname, search, clock);
}
