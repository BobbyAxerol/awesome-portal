/**
 * V2 reader for the multi-resource self-eligibility projection (FE-068, Claude BE-P5 a74f6456; v2 = BE-P7 10149b66):
 * `GET /api/admin/profile-access/v2/eligibility/batch`, schema `portal.self-eligibility-batch.v2` (`AccessEligibilityBatch`),
 * operationId `portalScopedAccessEligibilityBatchGetV1`. `...batch.v1` (one `challenge`) was never served by an installed image and
 * is another schema here: typed `unsupported_shape`.
 *
 * `portal.self-eligibility.v1` (one resource, `accessSelf.ts`) is unchanged and stays the single-resource reader. This one answers up
 * to eight resources x the same 1 to 16 actions in one current-only read. Each resource carries exactly the v1 rows (same evaluator,
 * same reasons, same target rules: an action one resource cannot take is a per-resource `ACTION_TARGET_UNSUPPORTED`, never a batch
 * failure) plus a typed `step_up_state`, and the body carries this session's own step-up fact and the build's step-up challenge.
 *
 * What the body is NOT (kept true for a screen, the same doctrine as `accessSelf.ts`):
 * - advisory and current-only. `ALLOWED` means "a current own grant exists"; family existence, entity existence, source readiness and
 *   the real step-up recheck are not checked here and every API behind it rechecks. Nothing here enables a control or replaces a 403;
 * - `step_up_state` is a statement about the rule and THIS session (`NOT_REQUIRED`, `PLAN_DEPENDENT`, `REQUIRED`, `ACTIVE`): never a
 *   permission and not a refusal. `session_step_up.challenges` are exactly two entries, one per proof family, in the fixed order
 *   `CAPITAL_COMMAND` then `ACCESS_ADMIN`; each `precondition_met` says whether the step-up ROUTE's own precondition FOR THAT FAMILY
 *   holds for the caller now (CAPITAL_COMMAND: a current own ALLOW of a step-up-requiring action, so a capital delegate needs no
 *   `access.grant`; ACCESS_ADMIN: a current own `access.grant` or `access.revoke` ALLOW). Neither is a promise the password will be accepted;
 * - `valid_until_ms` is the end-exclusive ceiling of THIS actor's session only, and the session step-up never ends after it. It is the
 *   same one-direction fact as in `accessSelf.ts` (`selfProjectionExpiry`): it can only shut a projection.
 *
 * Runtime rules the schema cannot say and the server enforces (checked here; a violation voids the read): resources are unique,
 * every resource answers the same actions in the same order, `step_up_state` follows `step_up_required` (and the session fact:
 * a `true` rule is `ACTIVE` exactly when the session step-up is `ACTIVE`, otherwise `REQUIRED`), and an ALLOWED row of a
 * step-up-requiring action beside `CAPITAL_COMMAND.precondition_met: false` is a disagreement between two readings of the same
 * witness (server code `STEP_UP_CHALLENGE_ROW_DISAGREE`): the WHOLE read is refused, not repaired. Closed keys everywhere; another
 * `schema_version` is `unsupported_shape`; never throws.
 */
import { ACCESS_ENVIRONMENTS, ACCESS_RESOURCE_KINDS, type AccessEnvironment, type AccessResourceKind, type UnsupportedAccessShape } from "./accessEffective";
import {
  ELIGIBILITY_ACTIONS, ELIGIBILITY_ACTION_RULES, MAX_ELIGIBILITY_ACTIONS, closed, oneOf, projectionTimes, readEligibilityRow, rec, selectorText,
  type EligibilityAction, type EligibilityRow,
} from "./accessSelf";

export const ACCESS_ELIGIBILITY_BATCH_SCHEMA = "portal.self-eligibility-batch.v2";
export const ACCESS_ELIGIBILITY_BATCH_PATH = "/api/admin/profile-access/v2/eligibility/batch";
export const MAX_BATCH_RESOURCES = 8;
export const ELIGIBILITY_STEP_UP_STATES = ["NOT_REQUIRED", "PLAN_DEPENDENT", "REQUIRED", "ACTIVE"] as const;
export type EligibilityStepUpState = (typeof ELIGIBILITY_STEP_UP_STATES)[number];
export const STEP_UP_ROUTE = "/api/admin/profile-access/v2/step-up";
/** The two proof families, in the order the batch lists them (`challenges[0]` then `challenges[1]`). */
export const STEP_UP_FAMILIES = ["CAPITAL_COMMAND", "ACCESS_ADMIN"] as const;
export type StepUpFamily = (typeof STEP_UP_FAMILIES)[number];
/** Which precondition the step-up route enforces for each family (the schema binds the pair). */
export const STEP_UP_PRECONDITIONS = {
  CAPITAL_COMMAND: "CURRENT_OWN_STEP_UP_ACTION_ALLOW",
  ACCESS_ADMIN: "CURRENT_OWN_ACCESS_GRANT_OR_REVOKE_ALLOW",
} as const satisfies Record<StepUpFamily, string>;

export type BatchEligibilityRow = EligibilityRow & {
  /** The rule x this session: `PLAN_DEPENDENT` is "the plan decides", `REQUIRED` is "this session holds no step-up". Not a refusal. */
  stepUpState: EligibilityStepUpState;
};

export interface BatchResourceResult {
  resource: { kind: AccessResourceKind; id: string };
  /** In the order the server answered, the same actions for every resource. */
  actions: readonly BatchEligibilityRow[];
}

export interface BatchStepUpChallenge {
  family: StepUpFamily;
  mechanism: "PASSWORD_REAUTH";
  route: typeof STEP_UP_ROUTE;
  precondition: (typeof STEP_UP_PRECONDITIONS)[StepUpFamily];
  /** Whether the step-up route's own precondition FOR THIS FAMILY holds for the caller. `false` is a dead step-up button, said before the click. */
  preconditionMet: boolean;
}

export interface BatchSessionStepUp {
  state: "ACTIVE" | "NOT_ACTIVE";
  /** When THIS session's step-up ends (never after the session ceiling); `null` when NOT_ACTIVE. */
  validUntilMs: number | null;
  /** Exactly two, `CAPITAL_COMMAND` first, `ACCESS_ADMIN` second. */
  challenges: readonly [BatchStepUpChallenge, BatchStepUpChallenge];
}

export interface AccessEligibilityBatch {
  workspaceId: string;
  environment: AccessEnvironment;
  currentOnly: true;
  advisoryOnly: true;
  /** Portal evaluation time, UTC epoch ms. */
  observedAtMs: number;
  /** End-exclusive ceiling of this actor's session only, `> observedAtMs`. Not a TTL, lease or readiness. */
  validUntilMs: number;
  sessionStepUp: BatchSessionStepUp;
  results: readonly BatchResourceResult[];
}

export type AccessEligibilityBatchRead = { kind: "eligibility_batch"; batch: AccessEligibilityBatch } | UnsupportedAccessShape;

const BATCH_KEYS = [
  "schema_version", "workspace_id", "environment", "current_only", "advisory_only", "observed_at_ms", "valid_until_ms", "session_step_up", "results",
] as const;
const ROW_KEYS = [
  "action", "permission", "reason_class", "public_copy_key", "grant_ref", "authority_mode", "step_up_required", "step_up_freshness",
  "challenge_availability", "command_readiness", "family_check", "step_up_state",
] as const;

function readChallenge(raw: unknown, family: StepUpFamily): BatchStepUpChallenge | null {
  const challenge = closed(raw, ["family", "mechanism", "route", "precondition", "precondition_met"]);
  if (challenge === null) return null;
  // The family is the position (fixed order); the precondition is bound to the family, never to the other one.
  if (challenge.family !== family || challenge.mechanism !== "PASSWORD_REAUTH" || challenge.route !== STEP_UP_ROUTE) return null;
  if (challenge.precondition !== STEP_UP_PRECONDITIONS[family] || typeof challenge.precondition_met !== "boolean") return null;
  return { family, mechanism: "PASSWORD_REAUTH", route: STEP_UP_ROUTE, precondition: STEP_UP_PRECONDITIONS[family], preconditionMet: challenge.precondition_met };
}

function readSessionStepUp(raw: unknown, observedAtMs: number, ceilingMs: number): BatchSessionStepUp | null {
  const s = closed(raw, ["state", "valid_until_ms", "challenges"]);
  if (s === null || !Array.isArray(s.challenges) || s.challenges.length !== STEP_UP_FAMILIES.length) return null;
  const capital = readChallenge(s.challenges[0], "CAPITAL_COMMAND");
  const access = readChallenge(s.challenges[1], "ACCESS_ADMIN");
  if (capital === null || access === null) return null;
  const challenges = [capital, access] as const;
  if (s.state === "NOT_ACTIVE") return s.valid_until_ms === null ? { state: "NOT_ACTIVE", validUntilMs: null, challenges } : null;
  if (s.state !== "ACTIVE") return null;
  const until = s.valid_until_ms;
  // ACTIVE ends after the evaluation clock and never after the session ceiling (both stated by the schema text, neither expressible in it).
  if (typeof until !== "number" || !Number.isSafeInteger(until) || until <= observedAtMs || until > ceilingMs) return null;
  return { state: "ACTIVE", validUntilMs: until, challenges };
}

/** A row that says "a current own grant exists" for an action whose follow-up demands a step-up (the capital / pending-control / registration actions). */
function isAllowedStepUpAction(row: BatchEligibilityRow): boolean {
  return row.permission === "ALLOWED" && ELIGIBILITY_ACTION_RULES[row.action].stepUp === true;
}

function readResult(raw: unknown, sessionActive: boolean): BatchResourceResult | null {
  const r = closed(raw, ["resource", "actions"]);
  const resource = closed(r?.resource, ["kind", "id"]);
  if (r === null || resource === null) return null;
  const kind = oneOf(resource.kind, ACCESS_RESOURCE_KINDS);
  const id = selectorText(resource.id);
  if (kind === null || id === null || !Array.isArray(r.actions) || r.actions.length < 1 || r.actions.length > MAX_ELIGIBILITY_ACTIONS) return null;
  const actions: BatchEligibilityRow[] = [];
  for (const entry of r.actions) {
    const row = closed(entry, ROW_KEYS);
    if (row === null) return null;
    // The v1 row, verbatim (same keys minus the new one, same family / step-up / target rules): one reader for both projections.
    const { step_up_state: rawState, ...v1 } = row;
    const base = readEligibilityRow(v1, kind);
    const stepUpState = oneOf(rawState, ELIGIBILITY_STEP_UP_STATES);
    if (base === null || stepUpState === null) return null;
    // step_up_state follows the rule (false / null / true) and, for a true rule, this session.
    const expected = base.stepUpRequired === false ? "NOT_REQUIRED" : base.stepUpRequired === null ? "PLAN_DEPENDENT" : sessionActive ? "ACTIVE" : "REQUIRED";
    if (stepUpState !== expected) return null;
    actions.push({ ...base, stepUpState });
  }
  // One row per action (every action `contains` at most once).
  if (new Set(actions.map((row) => row.action)).size !== actions.length) return null;
  return { resource: { kind, id }, actions };
}

/**
 * Batch body -> typed read. `null` is "malformed" and renders as unavailable (the single-resource constants stay what they were);
 * another `schema_version` is `unsupported_shape`.
 */
export function readAccessEligibilityBatch(raw: unknown): AccessEligibilityBatchRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== ACCESS_ELIGIBILITY_BATCH_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, BATCH_KEYS);
  if (body === null) return null;
  const workspaceId = selectorText(body.workspace_id);
  const environment = oneOf(body.environment, ACCESS_ENVIRONMENTS);
  const times = projectionTimes(body);
  if (
    workspaceId === null || environment === null || times === null || body.current_only !== true || body.advisory_only !== true
    || !Array.isArray(body.results) || body.results.length < 1 || body.results.length > MAX_BATCH_RESOURCES
  ) return null;
  const sessionStepUp = readSessionStepUp(body.session_step_up, times.observedAtMs, times.validUntilMs);
  if (sessionStepUp === null) return null;
  const results: BatchResourceResult[] = [];
  for (const entry of body.results) {
    const result = readResult(entry, sessionStepUp.state === "ACTIVE");
    if (result === null) return null;
    results.push(result);
  }
  // An ALLOWED row of a step-up-requiring action proves a current own witness for a step-up action, so the capital challenge (the
  // same witness search) cannot be unmet. If it is, one of the two readings is wrong (server: STEP_UP_CHALLENGE_ROW_DISAGREE):
  // refuse the whole read rather than publish a re-auth button that cannot work.
  if (sessionStepUp.challenges[0].preconditionMet === false && results.some((r) => r.actions.some(isAllowedStepUpAction))) return null;
  // Unique resources, and every resource answers the same actions in the same order (runtime-enforced).
  if (new Set(results.map((r) => `${r.resource.kind}:${r.resource.id}`)).size !== results.length) return null;
  const order = results[0]!.actions.map((row) => row.action).join(",");
  if (results.some((r) => r.actions.map((row) => row.action).join(",") !== order)) return null;
  return {
    kind: "eligibility_batch",
    batch: { workspaceId, environment, currentOnly: true, advisoryOnly: true, ...times, sessionStepUp, results },
  };
}

export interface EligibilityBatchRequest {
  workspaceId: string;
  environment: AccessEnvironment;
  /** 1 to 8, no repeats. */
  resources: readonly { kind: AccessResourceKind; id: string }[];
  /** 1 to 16, no repeats. */
  actions: readonly EligibilityAction[];
}

/**
 * The request URL, or `null` when the server's strict query would refuse it. `resources` is ONE comma-separated value of
 * `KIND:encodeURIComponent(id)` tokens (the id is encoded once on top of the query encoding, so a comma inside an id can never split a
 * token); `actions` is one comma-separated value, never a repeated key.
 */
export function accessEligibilityBatchUrl(request: EligibilityBatchRequest): string | null {
  const resources = request.resources;
  if (
    selectorText(request.workspaceId) === null || oneOf(request.environment, ACCESS_ENVIRONMENTS) === null
    || resources.length < 1 || resources.length > MAX_BATCH_RESOURCES
    || resources.some((r) => oneOf(r.kind, ACCESS_RESOURCE_KINDS) === null || selectorText(r.id) === null)
    || new Set(resources.map((r) => `${r.kind}:${r.id}`)).size !== resources.length
    || request.actions.length < 1 || request.actions.length > MAX_ELIGIBILITY_ACTIONS
    || request.actions.some((action) => oneOf(action, ELIGIBILITY_ACTIONS) === null) || new Set(request.actions).size !== request.actions.length
  ) return null;
  // Percent-encode each token once more for the query: `%` in a token becomes `%25`, the separating commas stay literal.
  const tokens = resources.map((r) => encodeURIComponent(`${r.kind}:${encodeURIComponent(r.id)}`).replace(/%3A/g, ":"));
  const query = [
    `workspace_id=${encodeURIComponent(request.workspaceId)}`,
    `environment=${request.environment}`,
    `resources=${tokens.join(",")}`,
    `actions=${request.actions.map((action) => encodeURIComponent(action)).join(",")}`,
  ];
  return `${ACCESS_ELIGIBILITY_BATCH_PATH}?${query.join("&")}`;
}

/** True when the body answers THIS request: same workspace, environment, the same resources and the same set of actions. */
export function eligibilityBatchAnswers(batch: AccessEligibilityBatch, request: EligibilityBatchRequest): boolean {
  return batch.workspaceId === request.workspaceId && batch.environment === request.environment
    && batch.results.length === request.resources.length
    && request.resources.every((r) => batch.results.some((got) => got.resource.kind === r.kind && got.resource.id === r.id))
    && batch.results.every((got) => got.actions.length === request.actions.length && request.actions.every((a) => got.actions.some((row) => row.action === a)));
}

/** The result for one resource, or `undefined` when it was not asked about. Absence is not "not allowed". */
export function batchResult(batch: AccessEligibilityBatch, kind: AccessResourceKind, id: string): BatchResourceResult | undefined {
  return batch.results.find((r) => r.resource.kind === kind && r.resource.id === id);
}
