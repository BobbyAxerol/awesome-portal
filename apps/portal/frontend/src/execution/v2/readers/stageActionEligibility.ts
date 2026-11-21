/**
 * V2 reader for `portal.stage-action-eligibility.v1` (FE-068, Claude BE-P5 f48a97c6):
 * `GET /api/v1/execution/governance/stage-action-eligibility[?workspace_id=]`, operationId `executionStageActionEligibilityV1`.
 *
 * The body is the caller's OWN, ADVISORY answer to "why is this stage button off", for exactly ten stage actions in a fixed order.
 * What this reader keeps true for a screen:
 *
 * - it is advisory and current-only (both constants on the wire). `ELIGIBLE` means "the route's own knowable preconditions did not
 *   refuse the caller"; run completeness, parent approval, versions, freshness and idempotency are still checked at submit, and the
 *   server's answer to the submit is the only authority. Nothing here enables a control; the helpers below only EXPLAIN a control that
 *   is off, and an `ELIGIBLE` row leaves the control exactly as it was;
 * - `stage_action` is a display identifier for a button. It is NOT a capability name, it is never sent as authority and it is not
 *   one of the provisional capability names (FE-037);
 * - `NOT_COMMISSIONED` means no Portal route exists for the action, whatever the caller holds. Those rows say
 *   `basis: NONE_PUBLISHED` and `step_up_required: null` (not determined, never `false`);
 * - the session step-up is this session's own fact (`ACTIVE` with an end instant, or `NOT_ACTIVE`). It changes no verdict.
 *
 * Boundary rules (the same as the other V2 readers): `unknown` until every check passes; closed keys; every cross-field rule of the
 * published schema (one fixed basis / step-up / alpha scope / verdict set per action, `public_copy_key` = `reason_class`, verdict x
 * `eligible` x reason) is enforced here, so an inconsistent row voids the whole read instead of being repaired; exactly ten rows in
 * the published order; another `schema_version` is `unsupported_shape`; never throws.
 */
import { closed, instant, oneOf, plain, rec, type UnsupportedStatusShape } from "./commandCurrency";

export const STAGE_ACTION_ELIGIBILITY_SCHEMA = "portal.stage-action-eligibility.v1";
export const STAGE_ACTION_ELIGIBILITY_PATH = "/api/v1/execution/governance/stage-action-eligibility";

/** Exactly these ten, in exactly this order (`prefixItems` + `minItems = maxItems = 10`). */
export const STAGE_ACTIONS = [
  "approval.create", "sandbox.review_note", "paper.exit_review_request",
  "canary.hold", "canary.reduce", "canary.rollback", "canary.request_scale",
  "live.halt", "live.reduce", "live.emergency_close",
] as const;
export type StageAction = (typeof STAGE_ACTIONS)[number];

export const STAGE_VERDICTS = ["ELIGIBLE", "NOT_ELIGIBLE", "NOT_COMMISSIONED"] as const;
export type StageVerdict = (typeof STAGE_VERDICTS)[number];
export const STAGE_REASON_CLASSES = [
  "SUBMIT_CHECKS_REQUIRED", "RETAINED_REVIEW_READ_ONLY", "ADMIN_ROLE_REQUIRED", "GOVERNANCE_CAPABILITY_REQUIRED", "GOVERNANCE_SCOPE_MISMATCH",
  "CAPTURE_PROJECTION_NOT_AUTHORIZED", "COMMAND_FAMILY_NOT_COMMISSIONED",
] as const;
export type StageReasonClass = (typeof STAGE_REASON_CLASSES)[number];
export const STAGE_BASES = ["WORKSPACE_MEMBERSHIP", "ADMIN_ROLE", "ADMIN_ROLE_AND_GOVERNANCE_R2_READ", "NONE_PUBLISHED"] as const;
export type StageBasis = (typeof STAGE_BASES)[number];
export const STAGE_STEP_UP_STATES = ["NOT_REQUIRED", "NOT_DETERMINED"] as const;
export type StageStepUpState = (typeof STAGE_STEP_UP_STATES)[number];
export const STAGE_ALPHA_SCOPES = ["WORKSPACE_ALL_COMPLETED_RUNS"] as const;
export type StageAlphaScope = (typeof STAGE_ALPHA_SCOPES)[number];

/** The reasons a NOT_ELIGIBLE row may carry (the schema's `then` for that verdict). */
const NOT_ELIGIBLE_REASONS: readonly StageReasonClass[] = [
  "RETAINED_REVIEW_READ_ONLY", "ADMIN_ROLE_REQUIRED", "GOVERNANCE_CAPABILITY_REQUIRED", "GOVERNANCE_SCOPE_MISMATCH", "CAPTURE_PROJECTION_NOT_AUTHORIZED",
];

interface ActionRule {
  basis: StageBasis;
  stepUpRequired: boolean | null;
  stepUpState: StageStepUpState;
  alphaScope: StageAlphaScope | null;
  /** `true`: the verdict can only be NOT_COMMISSIONED. `false`: only ELIGIBLE or NOT_ELIGIBLE. */
  commissioned: boolean;
}

const NO_ROUTE: ActionRule = { basis: "NONE_PUBLISHED", stepUpRequired: null, stepUpState: "NOT_DETERMINED", alphaScope: null, commissioned: false };
/** One fixed row of facts per action (the schema's ten `if/then` blocks). */
export const STAGE_ACTION_RULES: Readonly<Record<StageAction, ActionRule>> = {
  "approval.create": { basis: "WORKSPACE_MEMBERSHIP", stepUpRequired: false, stepUpState: "NOT_REQUIRED", alphaScope: "WORKSPACE_ALL_COMPLETED_RUNS", commissioned: true },
  "sandbox.review_note": { basis: "ADMIN_ROLE", stepUpRequired: false, stepUpState: "NOT_REQUIRED", alphaScope: null, commissioned: true },
  "paper.exit_review_request": { basis: "ADMIN_ROLE_AND_GOVERNANCE_R2_READ", stepUpRequired: false, stepUpState: "NOT_REQUIRED", alphaScope: null, commissioned: true },
  "canary.hold": NO_ROUTE,
  "canary.reduce": NO_ROUTE,
  "canary.rollback": NO_ROUTE,
  "canary.request_scale": NO_ROUTE,
  "live.halt": NO_ROUTE,
  "live.reduce": NO_ROUTE,
  "live.emergency_close": NO_ROUTE,
};

export interface StageActionRow {
  /** A display identifier for a button; not a capability name and never authority. */
  action: StageAction;
  verdict: StageVerdict;
  /** Equal to `verdict === "ELIGIBLE"` (the schema pins it). Advice, never an enable switch. */
  eligible: boolean;
  /** The class of the reason; the key the UI copy is chosen by (`public_copy_key` is always equal and is not kept apart). */
  reasonClass: StageReasonClass;
  /** The rule the producing route enforces today. */
  basis: StageBasis;
  /** `null` is "not determined", which is NOT `false`. */
  stepUpRequired: boolean | null;
  stepUpState: StageStepUpState;
  /** Only `approval.create` carries one: the create route's scope, as the server words it. */
  alphaScope: StageAlphaScope | null;
}

export type SessionStepUp =
  | { state: "ACTIVE"; validUntilMs: number }
  | { state: "NOT_ACTIVE"; validUntilMs: null };

export interface StageActionEligibility {
  workspaceId: string;
  currentOnly: true;
  advisoryOnly: true;
  /** Portal evaluation time (UTC epoch ms): not a source observation, not a permission lease. Re-ask on mount, workspace switch and focus. */
  observedAtMs: number;
  /** This session's own step-up fact. It changes no verdict. */
  sessionStepUp: SessionStepUp;
  /** Exactly ten, in the published order. */
  actions: readonly StageActionRow[];
}

export type StageActionEligibilityRead = { kind: "stage_action_eligibility"; eligibility: StageActionEligibility } | UnsupportedStatusShape;

const ROW_KEYS = [
  "stage_action", "verdict", "eligible", "reason_class", "public_copy_key", "basis", "step_up_required", "step_up_state", "alpha_scope",
] as const;
const BODY_KEYS = ["schema_version", "workspace_id", "current_only", "advisory_only", "observed_at_ms", "session_step_up", "actions"] as const;

function readRow(raw: unknown, expected: StageAction): StageActionRow | null {
  const r = closed(raw, ROW_KEYS);
  if (r === null) return null;
  const action = oneOf(r.stage_action, STAGE_ACTIONS);
  const verdict = oneOf(r.verdict, STAGE_VERDICTS);
  const reasonClass = oneOf(r.reason_class, STAGE_REASON_CLASSES);
  const copyKey = oneOf(r.public_copy_key, STAGE_REASON_CLASSES);
  const basis = oneOf(r.basis, STAGE_BASES);
  const stepUpState = oneOf(r.step_up_state, STAGE_STEP_UP_STATES);
  if (action === null || action !== expected || verdict === null || reasonClass === null || copyKey === null || basis === null || stepUpState === null) return null;
  if (typeof r.eligible !== "boolean" || (r.step_up_required !== null && typeof r.step_up_required !== "boolean")) return null;
  const alphaScope = r.alpha_scope === null ? null : oneOf(r.alpha_scope, STAGE_ALPHA_SCOPES);
  if (r.alpha_scope !== null && alphaScope === null) return null;
  const rule = STAGE_ACTION_RULES[action];
  // The action fixes its basis, step-up facts, alpha scope and which verdicts it may carry.
  if (basis !== rule.basis || r.step_up_required !== rule.stepUpRequired || stepUpState !== rule.stepUpState || alphaScope !== rule.alphaScope) return null;
  if (rule.commissioned ? verdict === "NOT_COMMISSIONED" : verdict !== "NOT_COMMISSIONED") return null;
  // The copy key is the reason, always.
  if (copyKey !== reasonClass) return null;
  // Verdict x eligible x reason.
  // `eligible` is true exactly for the ELIGIBLE verdict: anything else (absent, non-boolean) never reads as eligibility.
  const shouldBeEligible = verdict === "ELIGIBLE";
  if (r.eligible !== shouldBeEligible) return null;
  if (shouldBeEligible) {
    if (reasonClass !== "SUBMIT_CHECKS_REQUIRED") return null;
  } else if (verdict === "NOT_COMMISSIONED" ? reasonClass !== "COMMAND_FAMILY_NOT_COMMISSIONED" : !NOT_ELIGIBLE_REASONS.includes(reasonClass)) {
    return null;
  }
  return { action, verdict, eligible: r.eligible, reasonClass, basis, stepUpRequired: rule.stepUpRequired, stepUpState, alphaScope };
}

/** Workspace text as the contract bounds it: 3 to 96 characters, no control, no invisible format character. */
function workspaceText(value: unknown): string | null {
  const text = plain(value, 96);
  return text !== null && text.length >= 3 ? text : null;
}

export function readSessionStepUp(raw: unknown, observedAtMs: number, ceilingMs: number | null = null): SessionStepUp | null {
  const s = closed(raw, ["state", "valid_until_ms"]);
  if (s === null) return null;
  if (s.state === "NOT_ACTIVE") return s.valid_until_ms === null ? { state: "NOT_ACTIVE", validUntilMs: null } : null;
  if (s.state !== "ACTIVE") return null;
  const until = typeof s.valid_until_ms === "number" && Number.isSafeInteger(s.valid_until_ms) && s.valid_until_ms >= 0 ? s.valid_until_ms : null;
  // ACTIVE requires an end strictly after the evaluation clock (a producer invariant the schema cannot say), and never beyond the session ceiling.
  if (until === null || until <= observedAtMs || (ceilingMs !== null && until > ceilingMs)) return null;
  return { state: "ACTIVE", validUntilMs: until };
}

/**
 * Stage-action eligibility body -> typed read. `null` is "malformed" and must render as "not read" (the generic reason stays);
 * another `schema_version` is `unsupported_shape`.
 */
export function readStageActionEligibilityV1(raw: unknown): StageActionEligibilityRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== STAGE_ACTION_ELIGIBILITY_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, BODY_KEYS);
  if (body === null) return null;
  const workspaceId = workspaceText(body.workspace_id);
  const observedAt = instant(body.observed_at_ms);
  if (
    workspaceId === null || observedAt === null || body.current_only !== true || body.advisory_only !== true
    || !Array.isArray(body.actions) || body.actions.length !== STAGE_ACTIONS.length
  ) return null;
  const sessionStepUp = readSessionStepUp(body.session_step_up, observedAt);
  if (sessionStepUp === null) return null;
  const actions: StageActionRow[] = [];
  for (let index = 0; index < STAGE_ACTIONS.length; index += 1) {
    const row = readRow(body.actions[index], STAGE_ACTIONS[index]!);
    if (row === null) return null;
    actions.push(row);
  }
  return {
    kind: "stage_action_eligibility",
    eligibility: { workspaceId, currentOnly: true, advisoryOnly: true, observedAtMs: observedAt, sessionStepUp, actions },
  };
}

/** The request URL. `workspace_id` is optional (the server resolves the caller's own); a malformed one is refused here. */
export function stageActionEligibilityUrl(workspaceId?: string): string | null {
  if (workspaceId === undefined || workspaceId === "") return STAGE_ACTION_ELIGIBILITY_PATH;
  return workspaceText(workspaceId) === null ? null : `${STAGE_ACTION_ELIGIBILITY_PATH}?workspace_id=${encodeURIComponent(workspaceId)}`;
}

/** The row for one action, or `undefined`. Absence is not "not eligible". */
export function stageActionRow(eligibility: StageActionEligibility | null, action: StageAction): StageActionRow | undefined {
  return eligibility?.actions.find((row) => row.action === action);
}
