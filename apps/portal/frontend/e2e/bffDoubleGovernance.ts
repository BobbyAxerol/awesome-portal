/**
 * Governance and pending-control reads for the e2e BFF double and the fixture BFF (FIXTURE_LAB / BFF_DOUBLE lane, NOT acceptance
 * evidence). Three advisory reads Claude's BE-P5 published (FE-062, FE-068, FE-069):
 *
 *   GET /api/v1/execution/governance/stage-action-eligibility[?workspace_id=]        portal.stage-action-eligibility.v1
 *   GET /api/v1/execution/governance/approvals/request-lookup?request_key=[&...]     governance.approval-request-lookup.v1
 *   GET /api/v1/execution/pending-recalls?workspace_id&resource_kind&resource_id&environment
 *                                                                                    portal.execution.pending-recall-discovery.v1
 *
 * Every body is a published canonical fixture (`governance-requester-reads.synthetic.valid.json`,
 * `execution-pending-control-currency.synthetic.valid.json`), never a hand-written object. A body is rewritten only where the REQUEST
 * decides a field (the workspace, the request key, the resource and environment the question names), because the ports refuse a
 * well-formed body that answers another question (`approvalRequestLookupAnswers`, `pendingRecallDiscoveryAnswers`, the workspace
 * check of the stage-action reader). A query the server would refuse is a 400; no route here answers a question by guessing.
 *
 * Opt-in: `answerExecutionBff` asks this module only with `screensV2`, so the V1 stubs keep their 501.
 *
 * stage-action-eligibility: the case is chosen by the `workspace_id` of the read (the convention `bffDoubleAccess.ts` uses), and the
 * body echoes the workspace asked:
 *   (none, anything else)        admin_with_r2_read
 *   ws_TEST_PLAIN_USER           plain_user
 *   ws_TEST_NO_R2_GRANT          admin_without_r2_grant
 *   ws_TEST_OTHER_WORKSPACE      admin_other_workspace_grant
 *   ws_TEST_NOT_AUTHORIZED       projection_not_authorized
 *   ws_TEST_RETAINED_REVIEW      retained_review_read_only
 *   ws_TEST_STEP_UP_ACTIVE       session_step_up_active
 *   ws_TEST_DENIED               403 ACCESS_DENIED
 *   ws_TEST_UNAVAILABLE          503 ACCESS_UNAVAILABLE
 *
 * request-lookup: the double holds ONE stored request, the fixture's (`req-TEST_ONLY-0001` with its four payload fields), and keeps
 * no state. A key under which nothing is stored is NONE. The stored key is FOUND; with no payload NOT_COMPARED, with the stored
 * payload MATCH, with another payload KEY_PAYLOAD_CONFLICT. The body echoes the workspace and key asked.
 *
 * pending-recalls: the Portal controlled recalls on two resources in the fixtures: PORTFOLIO `TEST_ONLY:portfolio` and DEPLOYMENT
 * `TEST_ONLY:deployment`, both in `paper`. The question for exactly one of them is answered with its recalls; any other resource or
 * environment is "none the Portal controlled" (the fixture's empty body, naming the resource asked): the contract's own absence, not a
 * claim that no recall exists on the source.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BffAnswerGovernance {
  status: number;
  body: unknown;
  contentType?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): Draft => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8"));
const REQUESTER_READS = "governance-requester-reads.synthetic.valid.json";
const PENDING_CONTROL = "execution-pending-control-currency.synthetic.valid.json";

const problem = (status: number, code: string, message: string): BffAnswerGovernance => ({ status, body: { error: { code, message } } });
const invalid = (message: string) => problem(400, "GOVERNANCE_INPUT_INVALID", message);

const TEXT = /^[^\u0000-\u001f\u007f]+$/;
const text = (value: string | null, max: number): value is string => value !== null && value.length >= 1 && value.length <= max && TEXT.test(value);
const keysOk = (search: URLSearchParams, allowed: readonly string[]): boolean => {
  const keys = [...search.keys()];
  return new Set(keys).size === keys.length && keys.every((key) => allowed.includes(key));
};

/* ── stage-action eligibility ─────────────────────────────────────────────── */

export const STAGE_ACTION_ELIGIBILITY_ROUTE = "/governance/stage-action-eligibility";

export const STAGE_ACTION_DOUBLE_WORKSPACES = {
  plainUser: "ws_TEST_PLAIN_USER",
  noR2Grant: "ws_TEST_NO_R2_GRANT",
  otherWorkspaceGrant: "ws_TEST_OTHER_WORKSPACE",
  notAuthorized: "ws_TEST_NOT_AUTHORIZED",
  retainedReview: "ws_TEST_RETAINED_REVIEW",
  stepUpActive: "ws_TEST_STEP_UP_ACTIVE",
  denied: "ws_TEST_DENIED",
  unavailable: "ws_TEST_UNAVAILABLE",
} as const;

const STAGE_CASE_BY_WORKSPACE: Readonly<Record<string, string>> = {
  [STAGE_ACTION_DOUBLE_WORKSPACES.plainUser]: "plain_user",
  [STAGE_ACTION_DOUBLE_WORKSPACES.noR2Grant]: "admin_without_r2_grant",
  [STAGE_ACTION_DOUBLE_WORKSPACES.otherWorkspaceGrant]: "admin_other_workspace_grant",
  [STAGE_ACTION_DOUBLE_WORKSPACES.notAuthorized]: "projection_not_authorized",
  [STAGE_ACTION_DOUBLE_WORKSPACES.retainedReview]: "retained_review_read_only",
  [STAGE_ACTION_DOUBLE_WORKSPACES.stepUpActive]: "session_step_up_active",
};

export function answerStageActionEligibility(method: string, path: string, search: URLSearchParams): BffAnswerGovernance | null {
  if (path !== STAGE_ACTION_ELIGIBILITY_ROUTE || method !== "GET") return null;
  if (!keysOk(search, ["workspace_id"])) return invalid("The query is workspace_id, nothing else.");
  const workspaceId = search.get("workspace_id");
  if (search.has("workspace_id") && !text(workspaceId, 256)) return invalid("workspace_id is 1 to 256 printable characters.");
  if (workspaceId === STAGE_ACTION_DOUBLE_WORKSPACES.denied) return problem(403, "ACCESS_DENIED", "Not permitted.");
  if (workspaceId === STAGE_ACTION_DOUBLE_WORKSPACES.unavailable) return problem(503, "ACCESS_UNAVAILABLE", "Unavailable.");
  const body = canonical(REQUESTER_READS).stage_action_eligibility[STAGE_CASE_BY_WORKSPACE[workspaceId ?? ""] ?? "admin_with_r2_read"] as Draft;
  if (workspaceId !== null) body.workspace_id = workspaceId;
  return { status: 200, body };
}

/* ── approval request lookup ─────────────────────────────────────────────── */

export const APPROVAL_REQUEST_LOOKUP_ROUTE = "/governance/approvals/request-lookup";

const REQUEST_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const PAYLOAD_KEYS = ["alpha_id", "evidence_run_id", "methodology_claim_id", "summary"] as const;

export function answerApprovalRequestLookup(method: string, path: string, search: URLSearchParams): BffAnswerGovernance | null {
  if (path !== APPROVAL_REQUEST_LOOKUP_ROUTE || method !== "GET") return null;
  if (!keysOk(search, ["request_key", "workspace_id", ...PAYLOAD_KEYS])) return invalid("The query is request_key, workspace_id and the four payload fields.");
  const requestKey = search.get("request_key");
  if (requestKey === null || !REQUEST_KEY.test(requestKey)) return invalid("request_key is 1 to 192 characters of A-Z a-z 0-9 . _ : -.");
  const workspaceId = search.get("workspace_id");
  if (search.has("workspace_id") && !text(workspaceId, 256)) return invalid("workspace_id is 1 to 256 printable characters.");
  const supplied = PAYLOAD_KEYS.filter((key) => search.has(key));
  if (supplied.length !== 0 && supplied.length !== PAYLOAD_KEYS.length) return invalid("The payload is all four fields or none.");
  if (supplied.length > 0) {
    for (const key of ["alpha_id", "evidence_run_id", "methodology_claim_id"] as const) if (!text(search.get(key), 191)) return invalid(`${key} is 1 to 191 printable characters.`);
    const summary = search.get("summary")!;
    if (summary.length < 8 || summary.length > 2000) return invalid("summary is 8 to 2000 characters.");
  }

  const file = canonical(REQUESTER_READS);
  const stored = file.approval_request_lookup_payload_example as Record<string, string>;
  const cases = file.approval_request_lookup as Record<string, Draft>;
  let body: Draft;
  if (requestKey !== stored.request_key) body = cases.none;
  else if (supplied.length === 0) body = cases.found_not_compared;
  else body = PAYLOAD_KEYS.every((key) => search.get(key) === stored[key]) ? cases.found_payload_match : cases.key_payload_conflict;
  body = structuredClone(body);
  body.request_key = requestKey;
  if (workspaceId !== null) body.workspace_id = workspaceId;
  return { status: 200, body };
}

/* ── pending recall discovery ────────────────────────────────────────────── */

export const PENDING_RECALLS_ROUTE = "/pending-recalls";

export function answerPendingRecallDiscovery(method: string, path: string, search: URLSearchParams): BffAnswerGovernance | null {
  if (path !== PENDING_RECALLS_ROUTE || method !== "GET") return null;
  if (!keysOk(search, ["workspace_id", "resource_kind", "resource_id", "environment"]) || [...search.keys()].length !== 4) {
    return invalid("The query is workspace_id, resource_kind, resource_id and environment, all four.");
  }
  const kind = search.get("resource_kind");
  const id = search.get("resource_id");
  const environment = search.get("environment");
  if (!text(search.get("workspace_id"), 256) || !text(id, 256)) return invalid("workspace_id and resource_id are 1 to 256 printable characters.");
  if (kind !== "PORTFOLIO" && kind !== "DEPLOYMENT") return invalid("resource_kind is PORTFOLIO or DEPLOYMENT.");
  if (environment !== "paper" && environment !== "sandbox" && environment !== "live") return invalid("environment is paper, sandbox or live.");

  const file = canonical(PENDING_CONTROL);
  const held = [file.discovery_open, file.discovery_deployment].find((body: Draft) => body.resource.kind === kind && body.resource.id === id && body.environment === environment);
  const body: Draft = structuredClone(held ?? file.discovery_empty);
  body.resource = { kind, id };
  body.environment = environment;
  return { status: 200, body };
}

/** The three reads, in the order the answerer asks. `path` has the execution prefix stripped. */
export function answerGovernance(method: string, path: string, search: URLSearchParams): BffAnswerGovernance | null {
  return answerStageActionEligibility(method, path, search) ?? answerApprovalRequestLookup(method, path, search) ?? answerPendingRecallDiscovery(method, path, search);
}
