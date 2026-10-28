/**
 * Governance and pending-control reads for the e2e BFF double and the fixture BFF (FIXTURE_LAB / BFF_DOUBLE lane, NOT acceptance
 * evidence). Three advisory reads Claude's BE-P5 published (FE-062, FE-068, FE-069) and the RV-10 Paper exit parent:
 *
 *   GET /api/v1/execution/governance/paper-exit/parent?deployment_id=[&workspace_id=]  governance.paper-exit-parent.v1
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
 * The Paper exit request (RV-10), reachable and demonstrable WITHOUT the dark `command` flag and without any Live or command route:
 *
 *   GET  /governance/review-capture-capabilities?workspace_id=   PAPER_EXIT_CREATE AVAILABLE in `ws_TEST_ONLY_shared`; UNAVAILABLE in
 *                                                                `ws_TEST_EXIT_OFF` (the canonical `review_capture_capabilities` rows);
 *                                                                every other workspace keeps the double's V1 answer (UNAVAILABLE)
 *   GET  /governance/paper-exit/parent                           the canonical positive parent (above), the pins the request is bound to
 *   POST /governance/paper-exit/create                           typed success or denial, by the TEXT of the summary:
 *          (anything else)  201, the review `pexit_fx_<deployment>_<hash of the key>` (the canonical capture response, echoed)
 *          "REPLAY ..."     201 with `replayed: true`
 *          "DENIED ..."     403 ADMIN_ROLE_REQUIRED
 *          "REFUSE ..."     409 APPROVAL_VERSION_CONFLICT (the R2 moved to another version)
 *          "STALE ..."      409 CAPTURE_PROJECTION_VERSION_CONFLICT (the Paper projection moved)
 *        The pins in the body must be the ones the parent serves for that workspace and deployment; otherwise 404/409 as the server would.
 *   GET  /governance/exit-reviews/pexit_fx_...                   the canonical Paper exit review, read back for the deployment the id names
 *
 * Nothing is stored: the same request answers the same way every time. In the preview this write is served only with
 * the writes switch set to `doubles`; with the default `refuse` it is 405 and the screen says the server did not record it.
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

import { positiveRecallOf } from "./bffPositiveMode";

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
  // WP-P: a native portfolio's open recall is the amount its capital statement states as Recalling (one WAITING item), next to a finished APPLIED and a REJECTED one on the Core book.
  const world = held === undefined && kind === "PORTFOLIO" ? positiveRecallOf(id!, environment) : null;
  if (world !== null) {
    const template = structuredClone(file.discovery_open.items[0]);
    const item = (suffix: string, state: string, amounts: Draft): Draft => ({ ...structuredClone(template), original_recall_id: `recall_${id}_${suffix}`, currency: world.currency, state, amounts, recipient_account_id: null,
      last_operation: state === "WAITING_ENCUMBRANCE" ? "APPLY_PENDING" : state === "APPLIED" ? "APPLY" : "REJECT" });
    body.policy_revision = structuredClone(file.discovery_open.policy_revision);
    // WP-B2-A3 (W128): discovery lists only OPEN recalls (the published item state enum is WAITING_ENCUMBRANCE | UNKNOWN); a finished APPLIED / REJECTED recall is not a discovery item
    body.items = [item("1", "WAITING_ENCUMBRANCE", { requested: world.pending, applied: "0", pending: world.pending, cancelled: "0", rejected: "0" })];
  }
  body.resource = { kind, id };
  body.environment = environment;
  return { status: 200, body };
}

/* ── paper exit parent (RV-10) ───────────────────────────────────────────── */

export const PAPER_EXIT_PARENT_ROUTE = "/governance/paper-exit/parent";
const DEPLOYMENT_ID = /^[A-Za-z0-9._:-]{1,192}$/;

/**
 * The case is chosen by the deployment asked (the double keeps no state): `dep_exit_none` has no R2; `dep_exit_not_approved`,
 * `dep_exit_not_admin` and `dep_exit_expired` have a BLOCKED context with that typed reason; every other deployment has an available
 * context. The body echoes the deployment and the workspace asked (the port refuses a body that answers another question), and the
 * context lists only that deployment.
 */
const PAPER_EXIT_CASE: Readonly<Record<string, string>> = {
  dep_exit_none: "none",
  dep_exit_not_approved: "found_blocked_r2_not_approved",
  dep_exit_not_admin: "found_blocked_not_admin",
  dep_exit_expired: "found_blocked_expired",
};

export function answerPaperExitParent(method: string, path: string, search: URLSearchParams): BffAnswerGovernance | null {
  if (path !== PAPER_EXIT_PARENT_ROUTE || method !== "GET") return null;
  if (!keysOk(search, ["deployment_id", "workspace_id"])) return invalid("The query is deployment_id and workspace_id, nothing else.");
  const deploymentId = search.get("deployment_id");
  if (deploymentId === null || !DEPLOYMENT_ID.test(deploymentId)) return invalid("deployment_id is 1 to 192 characters of A-Z a-z 0-9 . _ : -.");
  const workspaceId = search.get("workspace_id");
  if (search.has("workspace_id") && !text(workspaceId, 96)) return invalid("workspace_id is 1 to 96 printable characters.");
  if (workspaceId === STAGE_ACTION_DOUBLE_WORKSPACES.denied) return problem(403, "ACCESS_DENIED", "Not permitted.");
  if (workspaceId === STAGE_ACTION_DOUBLE_WORKSPACES.unavailable) return problem(503, "ACCESS_UNAVAILABLE", "Unavailable.");
  return { status: 200, body: paperExitParentFor(deploymentId, workspaceId) };
}

/** The parent the double serves for a deployment (and workspace): the canonical row, echoing both. */
function paperExitParentFor(deploymentId: string, workspaceId: string | null): Draft {
  const body: Draft = structuredClone(canonical(REQUESTER_READS).paper_exit_parent[PAPER_EXIT_CASE[deploymentId] ?? "found_available"]);
  body.deployment_id = deploymentId;
  if (workspaceId !== null) body.workspace_id = workspaceId;
  if (body.capture_context !== null) {
    body.capture_context.workspace_id = body.workspace_id;
    for (const candidate of body.capture_context.candidates) candidate.deployment_id = deploymentId;
  }
  return body;
}

/* ── Paper exit request (RV-10): capabilities, create, read-back ──────────── */

export const REVIEW_CAPTURE_CAPABILITIES_ROUTE = "/governance/review-capture-capabilities";
export const PAPER_EXIT_CREATE_ROUTE = "/governance/paper-exit/create";
/** The fixture lab's shared workspace (`?workspace_id=ws_TEST_ONLY_shared`): the Paper exit request is open here. */
export const PAPER_EXIT_OPEN_WORKSPACE = "ws_TEST_ONLY_shared";
/** A workspace where the server does not open it: the capabilities row is UNAVAILABLE with its reason. */
export const PAPER_EXIT_OFF_WORKSPACE = "ws_TEST_EXIT_OFF";

const REVIEW_PREFIX = "pexit_fx_";
const REVIEW_ID = /^pexit_fx_([A-Za-z0-9._:-]+)_([0-9a-f]{8})$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

/** The capabilities of the two Paper exit workspaces, from the canonical rows. `null` = not mine (the double's other answers stand). */
export function answerCaptureCapabilities(method: string, path: string, search: URLSearchParams): BffAnswerGovernance | null {
  if (path !== REVIEW_CAPTURE_CAPABILITIES_ROUTE || method !== "GET") return null;
  const workspaceId = search.get("workspace_id");
  const rows = canonical(REQUESTER_READS).review_capture_capabilities;
  if (workspaceId === PAPER_EXIT_OPEN_WORKSPACE) return { status: 200, body: structuredClone(rows.paper_exit_open) };
  if (workspaceId === PAPER_EXIT_OFF_WORKSPACE) return { status: 200, body: structuredClone(rows.paper_exit_off) };
  return null;
}

/** A short stable digest of a key (FNV-1a): the same request key names the same review. */
function hex8(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const isRecord = (value: unknown): value is Record<string, Draft> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `POST /governance/paper-exit/create`. `null` when the request carries no body to read (the golden's POSTs carry none): the caller keeps
 * its own answer. The pins are checked against the parent this same double serves, so a form that builds them from anything else fails.
 */
export function answerPaperExitCreate(method: string, path: string, body: unknown): BffAnswerGovernance | null {
  if (path !== PAPER_EXIT_CREATE_ROUTE || method !== "POST") return null;
  if (!isRecord(body)) return null;
  const { workspace_id: workspaceId, request_key: key, r2_approval_id: approvalId, expected_r2_version: version, deployment_id: deploymentId,
    expected_projection_digest: digest } = body;
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (typeof workspaceId !== "string" || typeof key !== "string" || !REQUEST_KEY.test(key) || typeof approvalId !== "string"
    || typeof version !== "number" || !Number.isSafeInteger(version) || typeof deploymentId !== "string" || !DEPLOYMENT_ID.test(deploymentId)
    || typeof digest !== "string" || !DIGEST.test(digest) || summary.length < 8 || summary.length > 1000) {
    return problem(422, "INVALID_REVIEW_CAPTURE_REQUEST", "workspace_id, request_key, r2_approval_id, expected_r2_version, deployment_id, expected_projection_digest and a summary of 8 to 1000 characters are required.");
  }
  if (workspaceId === STAGE_ACTION_DOUBLE_WORKSPACES.denied) return problem(403, "ACCESS_DENIED", "Not permitted.");
  if (workspaceId !== PAPER_EXIT_OPEN_WORKSPACE) return problem(403, "PAPER_EXIT_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE", "The Paper exit review is not open for this workspace.");
  if (summary.startsWith("DENIED")) return problem(403, "ADMIN_ROLE_REQUIRED", "Requesting a Paper exit review needs the admin role in this workspace.");

  const parent = paperExitParentFor(deploymentId, workspaceId);
  const context = parent.capture_context;
  if (parent.state !== "FOUND" || context === null) return problem(422, "R2_APPROVAL_REQUIRED", "This deployment has no R2 review to request an exit from.");
  if (context.availability.state !== "AVAILABLE") return problem(422, context.availability.reason_code, "The R2 review does not allow an exit request now.");
  if (approvalId !== context.parent_approval_id) return problem(404, "APPROVAL_NOT_FOUND", "No such R2 approval in this workspace.");
  if (summary.startsWith("REFUSE") || version !== context.expected_parent_version) {
    return problem(409, "APPROVAL_VERSION_CONFLICT", "The R2 approval moved to another version; read it again before requesting an exit review.");
  }
  if (summary.startsWith("STALE") || digest !== context.expected_projection_digest) {
    return problem(409, "CAPTURE_PROJECTION_VERSION_CONFLICT", "The Paper projection moved since the request was prepared; read it again.");
  }

  const reviewId = `${REVIEW_PREFIX}${deploymentId}_${hex8(key)}`;
  const response: Draft = canonical("execution-governance.review-capture.paper-exit.valid.json");
  Object.assign(response, {
    workspace_id: workspaceId, replayed: summary.startsWith("REPLAY"), aggregate_id: reviewId, review_id: reviewId,
    read_path: `/api/v1/execution/governance/exit-reviews/${reviewId}`, captured_projection_digest: digest,
  });
  return { status: 201, body: response };
}

/** The Paper exit review a create of this double made, read back: the canonical review, for the deployment its id names. */
export function answerFixtureExitReview(method: string, path: string): BffAnswerGovernance | null {
  if (method !== "GET") return null;
  const match = /^\/governance\/exit-reviews\/([^/]+)$/.exec(path);
  const parts = match === null ? null : REVIEW_ID.exec(match[1]!);
  if (match === null || parts === null) return null;
  const deploymentId = parts[1]!;
  const body: Draft = JSON.parse(JSON.stringify(canonical("execution-governance.paper-exit-review.valid.json")).split("dep_94").join(deploymentId));
  body.data.review.review_id = match[1];
  return { status: 200, body };
}

/** The reads and the one write, in the order the answerer asks. `path` has the execution prefix stripped. */
export function answerGovernance(method: string, path: string, search: URLSearchParams, requestBody?: unknown): BffAnswerGovernance | null {
  return answerStageActionEligibility(method, path, search) ?? answerApprovalRequestLookup(method, path, search) ?? answerPaperExitParent(method, path, search)
    ?? answerPendingRecallDiscovery(method, path, search) ?? answerCaptureCapabilities(method, path, search) ?? answerPaperExitCreate(method, path, requestBody)
    ?? answerFixtureExitReview(method, path);
}
