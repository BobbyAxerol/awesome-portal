/**
 * Command confirmation (UXM-09, fixture lane): the pure model. No React, no network.
 *
 * What lives here, and why it is not in a component:
 *
 * - The plan view. A plan is shown as the server published it: exact action, target, amount and currency as exact strings,
 *   versions as strings, policy, gate. Nothing is computed. Cost and impact are NEVER derived on this side: when the plan
 *   does not publish them the screen says `Not published (FE-020)` and asks for an explicit acknowledgement.
 * - The confirmation matrix. Submit opens only when this says ready, and the same answer produces the "Still needed" sentence,
 *   so the button and the sentence cannot disagree.
 * - The classification of an answer into a receipt: ACCEPTED, REJECTED (typed), DENIED (relay denied), UNKNOWN (may already
 *   have been applied), REPLAYED, ACCESS_STOPPED (403/404/401: the screen stops disclosing). Doubt first: a 5xx, an
 *   unreadable 2xx, a missing answer and an unverified receipt are UNKNOWN, never "failed" and never "ok".
 * - The disabled operations: every operation that is not published as sendable, with the exact reason and, when one is
 *   published, the capability that would enable it. A name that is not published is not invented (FE-037).
 *
 * Four independent dimensions travel on a capital receipt (delivery, business, projection, venue). ACK + UNKNOWN and
 * APPLIED + CATCHING_UP are expected states, not contradictions; APPLIED is never inferred from an acknowledgement and a flat or
 * filled position is never inferred from APPLIED (ELP2-07 coverage-and-handoff section 3).
 */
import { BLOCKED_REASON_TEXT, CATALOG_GROUPS, GROUP_LABEL, RISK_TIER_LABEL, type BlockedReason, type CatalogGroupCode, type CatalogRiskTier } from "../../../adminCatalog";
import { notPublishedText } from "../../blocks";
import type { FlagKind } from "../../flagKinds";
import {
  COMMAND_REASON_CODES,
  F0_APPLY_CONFLICT_CODE,
  F0_APPLY_DENIED_CODE,
  RELAY_DECISION_SCHEMA,
  readCommandPlanV1,
  readCommandPreviewV1,
  readCommandProblemV1,
  readF0ApplyAnswerV1,
  type CommandPlanV1,
  type CommandPreviewV1,
  type CommandReasonCode,
  type CostImpactV1,
  type CurrentPrimitiveV1,
  type F0ApplyDenialV1,
  type SafeNextAction,
} from "../../readers/commandOperation";
import { readCommandSubmitResultV1, type CommandStatusV1 } from "../../readers/commandCurrency";
import type { UtcEpochMs } from "../../../screenDataContract";
import { hostileCharacters, showable, visibleCount } from "../request/model";
import { SEND_DISABLED_REASON, type Lane, type PortResponse } from "./port";

/* ───────────────────────────── plan view ───────────────────────────── */

export interface PlanFact {
  label: string;
  /** Exact text, printed as given. */
  value: string;
  /** Identifiers, hashes and exact amounts print in the id face. */
  mono?: boolean;
}

/**
 * The cost and impact of a plan. This lane has ONE state for it: not published. The type is a union so a future contract that
 * publishes a figure adds a member (with its own exact string and unit), and no code path can fill it from a local sum.
 */
export type PlanImpact = { kind: "not_published"; request: "FE-020" };

/** The impact of a plan, read from the plan's own `cost_impact` (a typed absence on the wire), never from a constant and never computed here. */
export function planImpact(costImpact: CostImpactV1): PlanImpact {
  switch (costImpact.state) {
    case "NOT_PUBLISHED": return { kind: "not_published", request: "FE-020" };
  }
}

/** What the plan says about the N16B primitive. `NONE` is the wire's null; `DARK` is the described-but-inactive object (both flags are constants false). */
export type PlanPrimitive =
  | { state: "NONE" }
  | { state: "DARK"; label: string; rows: readonly PlanFact[] }
  /** A capital preview has no such field (the contract publishes it on the F0 plan only): the screen shows nothing and guesses nothing. */
  | { state: "NOT_CARRIED" };

const PRIMITIVE_LABEL: Readonly<Record<CurrentPrimitiveV1["id"], string>> = { "live.emergency-close": "Emergency close" };

/** `current_primitive` as typed. Nothing is inferred from the command key. */
export function planPrimitive(primitive: CurrentPrimitiveV1 | null): PlanPrimitive {
  if (primitive === null) return { state: "NONE" };
  return {
    state: "DARK",
    label: PRIMITIVE_LABEL[primitive.id],
    rows: [
      { label: "Primitive", value: primitive.id, mono: true },
      { label: "Source environment", value: primitive.sourceEnvironment, mono: true },
      { label: "Targets", value: primitive.targetTypes.join(", "), mono: true },
      { label: "Active", value: primitive.runtimeActive ? "Yes" : "No" },
      { label: "Request to the source", value: primitive.sourceSideEffectRequested ? "Possibly: verify first" : "No" },
    ],
  };
}

export interface PlanView {
  lane: Lane;
  /** What the key table is keyed by: the plan identity. Two different plans never share a key. */
  identity: string;
  title: string;
  facts: readonly PlanFact[];
  blockers: readonly string[];
  warnings: readonly string[];
  impact: PlanImpact;
  primitive: PlanPrimitive;
  /** `sha256:` digest the submit is bound to; null while the preview publishes none. */
  digest: string | null;
  /** Epoch ms the plan stops being usable, or null when none is published. */
  expiresAtMs: UtcEpochMs | null;
  /** F0: operation id. Capital: null. */
  operationId: string | null;
  /** The plan came back for a request key the server already knew. */
  replayed: boolean;
  /** The word the reader types to confirm: the operation name or the command key. */
  confirmWord: string;
  /** May Confirm be pressed at all, and if not, why. */
  confirmable: { ok: true; note: string | null } | { ok: false; reason: string };
}

/** The capital intent the fixture previews. It is the request this screen makes, not a server body. */
export interface CapitalIntentView {
  operation: string;
  resource: { kind: string; id: string };
  environment: string;
  currency: string;
  /** Exact decimal string. */
  amount: string;
  /** Exact int64 strings. */
  expectedVersions: Readonly<Record<string, string>>;
  policyRevision: string;
}

export const F0_NO_EFFECT = "No request to the Trading System was made by this plan.";

export function planViewFromF0(plan: CommandPlanV1): PlanView {
  return {
    lane: "F0",
    identity: `f0:${plan.operationId}:${plan.planDigest}`,
    title: `${plan.commandKey}`,
    facts: [
      { label: "Command", value: plan.commandKey, mono: true },
      { label: "Operation", value: plan.operationId, mono: true },
      { label: "Risk tier", value: RISK_TIER_LABEL_V2[plan.riskTier] },
      { label: "Relay", value: `${plan.relayCapability === "DISABLED" ? "Disabled" : plan.relayCapability}` },
      { label: "Request sent to the Trading System", value: plan.sourceSideEffectRequested ? "Possibly: verify first" : "No" },
      { label: "Payload", value: "Stored as a hash only; the Portal never keeps or returns it" },
      { label: "Payload hash", value: plan.payloadHash, mono: true },
      { label: "Plan digest", value: plan.planDigest, mono: true },
    ],
    blockers: plan.blockers,
    warnings: plan.warnings,
    impact: planImpact(plan.costImpact),
    primitive: planPrimitive(plan.currentPrimitive),
    digest: plan.planDigest,
    expiresAtMs: plan.expiresAt.ms,
    operationId: plan.operationId,
    replayed: plan.replayed,
    confirmWord: plan.commandKey,
    // Applying a blocked plan is allowed to be ASKED: the contract answers it with a denial, before any relay or source call.
    confirmable: {
      ok: true,
      note: "The plan is blocked. Applying it is expected to be denied before anything is sent; confirming records that answer.",
    },
  };
}

const RISK_TIER_LABEL_V2: Readonly<Record<CommandPlanV1["riskTier"], string>> = {
  R0_READ: "R0 · read",
  R1_PAPER_MUTATION: "R1 · paper mutation",
  R2_SANDBOX: "R2 · sandbox",
  R3_LIVE_PROTECTIVE: "R3 · live protective",
  R4_LIVE_RISK_INCREASING: "R4 · live risk-increasing",
  UNCLASSIFIED: "unclassified",
  BLOCKED: "blocked",
};

export function planViewFromCapital(intent: CapitalIntentView, preview: CommandPreviewV1): PlanView {
  const versions = Object.entries(intent.expectedVersions).map(([key, value]): PlanFact => ({ label: `Expected ${key} version`, value, mono: true }));
  const reason = preview.reasonCode === null ? null : REASON_COPY[preview.reasonCode];
  return {
    lane: "CAPITAL",
    identity: `cap:${intent.operation}:${intent.resource.kind}:${intent.resource.id}:${intent.amount}:${preview.previewDigest ?? "none"}`,
    title: `${intent.operation} · ${intent.resource.kind} ${intent.resource.id}`,
    facts: [
      { label: "Action", value: intent.operation, mono: true },
      { label: "Target", value: `${intent.resource.kind} ${intent.resource.id}`, mono: true },
      { label: "Environment", value: intent.environment },
      { label: "Amount", value: `${intent.amount} ${intent.currency}`, mono: true },
      ...versions,
      { label: "Policy revision", value: intent.policyRevision, mono: true },
      { label: "Profile", value: preview.profileRef ?? "Not stated by the preview", mono: preview.profileRef !== null },
      { label: "Required gate", value: preview.approvalGate ?? "Not stated by the preview" },
      { label: "Approval required", value: preview.approvalRequired === null ? "Not stated by the preview" : preview.approvalRequired ? "Yes" : "No" },
      { label: "Preview digest", value: preview.previewDigest ?? "Not stated by the preview", mono: preview.previewDigest !== null },
    ],
    blockers: preview.allowed ? [] : [preview.reasonCode ?? "NO_REASON_PUBLISHED"],
    warnings: [],
    impact: planImpact(preview.costImpact),
    primitive: { state: "NOT_CARRIED" },
    digest: preview.previewDigest,
    expiresAtMs: preview.expiresAtMs,
    operationId: null,
    replayed: false,
    confirmWord: intent.operation,
    confirmable: !preview.allowed
      ? { ok: false, reason: reason ?? "The preview does not allow this command and publishes no reason." }
      : preview.previewDigest === null
        ? { ok: false, reason: "The preview allows the command but publishes no digest to bind the submit to." }
        : { ok: true, note: preview.approvalRequired === true ? "Confirming is not an approval: the required gate decides separately." : null },
  };
}

/** The plan can no longer be used: its published expiry is not after `now`. Null expiry never expires on its own. */
export function planExpired(plan: PlanView, now: number): boolean {
  return plan.expiresAtMs !== null && plan.expiresAtMs <= now;
}

/* ───────────────────────────── plan answer ───────────────────────────── */

export type PlanLoad =
  | { kind: "ready"; view: PlanView }
  | { kind: "failed"; tone: "denied" | "unavailable" | "refused" | "unreadable"; sentence: string };

/** A plan read has no side effect: any failure is shown as such, and a retry sends the same plan key. */
export function classifyPlan(lane: Lane, answer: PortResponse, capital: CapitalIntentView): PlanLoad {
  if (answer.kind === "no_response") {
    return {
      kind: "failed",
      tone: "unavailable",
      sentence: answer.why === "not_connected" ? "The command plan is not connected to a source: UXM-09 fixture." : "No answer came back. Nothing was changed by reading a plan; try again.",
    };
  }
  const { status, body } = answer;
  if (status === 401 || status === 403 || status === 404) {
    return { kind: "failed", tone: "denied", sentence: "You can't read command plans here. Nothing is shown from an earlier plan." };
  }
  if (status >= 500) return { kind: "failed", tone: "unavailable", sentence: "The server could not produce a plan. Nothing was changed; try again." };
  if (lane === "F0") {
    const read = readCommandPlanV1(body);
    if ((status === 200 || status === 201) && read !== null && read.kind === "command_plan") return { kind: "ready", view: planViewFromF0(read.plan) };
  } else {
    const read = readCommandPreviewV1(body);
    if (status === 200 && read !== null && read.kind === "command_preview") return { kind: "ready", view: planViewFromCapital(capital, read.preview) };
  }
  if (status >= 400) return { kind: "failed", tone: "refused", sentence: "The server refused to plan this command." };
  return { kind: "failed", tone: "unreadable", sentence: "The plan could not be read, so none is shown. Nothing was changed." };
}

/* ───────────────────────────── typed confirmation ───────────────────────────── */

export const MIN_REASON = 8;
export const MAX_REASON = 2000;

export interface ConfirmFields {
  reason: string;
  confirmWord: string;
  /** The reader acknowledged that the plan publishes no cost or impact figure. */
  impactAck: boolean;
}
export const EMPTY_CONFIRM: ConfirmFields = { reason: "", confirmWord: "", impactAck: false };

/** What a send carries, trimmed and fixed. */
export interface SubmitPayload {
  lane: Lane;
  identity: string;
  operationId: string | null;
  digest: string | null;
  reason: string;
}

export function payloadIdentity(payload: SubmitPayload): string {
  return JSON.stringify([payload.lane, payload.identity, payload.operationId, payload.digest, payload.reason]);
}

export type ConfirmField = "reason" | "word" | "ack";
export interface Need {
  field: ConfirmField;
  text: string;
}

export type ReasonState = "empty" | "short" | "ok" | "long" | "hostile";

export interface ConfirmValidation {
  needs: readonly Need[];
  reason: { state: ReasonState; count: number; hostile: readonly string[] };
  wordMatches: boolean;
  payload: SubmitPayload | null;
}

export function reasonCounter(count: number): string {
  return `${count.toLocaleString("en-US")} / ${MAX_REASON.toLocaleString("en-US")}`;
}

export function validateConfirm(fields: ConfirmFields, plan: PlanView): ConfirmValidation {
  const trimmed = fields.reason.trim();
  const count = visibleCount(trimmed);
  const hostile = hostileCharacters(trimmed);
  const state: ReasonState = hostile.length > 0 ? "hostile" : trimmed === "" ? "empty" : count < MIN_REASON ? "short" : [...trimmed].length > MAX_REASON ? "long" : "ok";
  // Exact, case-sensitive: the word is the thing being done, typed by the person doing it.
  const wordMatches = fields.confirmWord === plan.confirmWord;
  const needs: Need[] = [];
  if (state !== "ok") needs.push({ field: "reason", text: `a reason of ${MIN_REASON} to ${MAX_REASON.toLocaleString("en-US")} visible characters` });
  if (!wordMatches) needs.push({ field: "word", text: `to type ${plan.confirmWord}` });
  if (plan.impact.kind === "not_published" && !fields.impactAck) needs.push({ field: "ack", text: "to acknowledge that the plan publishes no cost or impact" });
  return {
    needs,
    reason: { state, count, hostile },
    wordMatches,
    payload: needs.length === 0 ? { lane: plan.lane, identity: plan.identity, operationId: plan.operationId, digest: plan.digest, reason: trimmed } : null,
  };
}

export function stillNeeded(needs: readonly Need[]): string {
  return needs.length === 0 ? "" : `Still needed: ${needs.map((n) => n.text).join("; ")}.`;
}

export type SubmitGate =
  | { open: true }
  | { open: false; kind: "policy" | "plan" | "expired" | "sending" | "uncertain" | "settled" | "incomplete" | "held"; reason: string };

export function submitGate(input: {
  validation: ConfirmValidation;
  plan: PlanView | null;
  expired: boolean;
  submitting: boolean;
  settled: boolean;
  uncertain: boolean;
  blockedReason: string | null;
  held?: string | null;
}): SubmitGate {
  const { validation, plan } = input;
  if (input.blockedReason !== null) return { open: false, kind: "policy", reason: input.blockedReason };
  if (plan === null) return { open: false, kind: "plan", reason: "Read the plan first." };
  if (input.settled) return { open: false, kind: "settled", reason: "This command has an answer. Start a new plan to do anything else." };
  if (input.submitting) return { open: false, kind: "sending", reason: "A send is in progress. Wait for its answer." };
  if (input.uncertain) return { open: false, kind: "uncertain", reason: "The outcome is unknown. Retry with the same key, or discard after reading the warning." };
  if (input.held) return { open: false, kind: "held", reason: input.held };
  if (!plan.confirmable.ok) return { open: false, kind: "plan", reason: plan.confirmable.reason };
  if (input.expired) return { open: false, kind: "expired", reason: "The plan has expired. Read a new plan before confirming." };
  if (validation.payload === null) return { open: false, kind: "incomplete", reason: stillNeeded(validation.needs) };
  return { open: true };
}

/* ───────────────────────────── receipts ───────────────────────────── */

/** `CommandPreview.reason_code`, in the operator's words. One fixed dictionary; a server message is never printed. */
export const REASON_COPY: Readonly<Record<CommandReasonCode, string>> = {
  COMMAND_RELAY_NOT_QUALIFIED: "The command relay is not qualified for this operation yet, so nothing is sent.",
  COMMAND_OPERATION_NOT_QUALIFIED: "This operation is not qualified in this environment.",
  COMMAND_CONTEXT_INVALID: "The request context is not valid. Read a new plan and confirm again.",
  COMMAND_CONTEXT_EXPIRED: "The preview expired before it was submitted. Read a new plan and confirm again.",
  COMMAND_PREVIEW_CHANGED: "The command changed after you previewed it (policy, payload, approval or versions). Review the new plan before confirming.",
  COMMAND_IDEMPOTENCY_CONFLICT: "This key was already used for a different command. Nothing was changed.",
  COMMAND_RETRY_REQUIRED: "Current authority changed while the request was handled. Read the plan again before confirming.",
  COMMAND_RESOURCE_NOT_FOUND: "The target does not exist or is not visible to you.",
  COMMAND_CAPACITY_EXCEEDED: "The workspace is at its limit of open commands, so a new one is not taken in.",
  COMMAND_STATUS_UNVERIFIED: "The receipt could not be verified. This is not proof that nothing happened.",
  COMMAND_APPROVAL_REQUIRED: "This command needs an approval before it can be sent. Confirming is not an approval.",
};

export const UNKNOWN_WHY = ["no_response", "server_error", "unverified", "unreadable", "delivery_unknown"] as const;
export type UnknownWhy = (typeof UNKNOWN_WHY)[number];

export type Receipt =
  | { kind: "ACCEPTED"; status: CommandStatusV1 }
  /** The server answered with a command this screen already holds: the key created it once. */
  | { kind: "REPLAYED"; status: CommandStatusV1 }
  | {
    kind: "REJECTED";
    /** The typed reason word, or null when none was published. */
    code: string | null;
    /** The word is in this build's dictionary. */
    known: boolean;
    sentence: string;
    nextAction: SafeNextAction | null;
    status: CommandStatusV1 | null;
  }
  /** The F0 apply 409 (`details`, the eight keys). `decision.replayed` says the stored first answer was repeated for a key the server already knew. */
  | { kind: "DENIED"; decision: F0ApplyDenialV1 }
  | { kind: "UNKNOWN"; why: UnknownWhy; httpStatus: number | null; status: CommandStatusV1 | null }
  /** 401, 403 or 404: the screen stops showing what it showed. */
  | { kind: "ACCESS_STOPPED"; httpStatus: number };

export interface ClassifyContext {
  /** F0: the plan's operation id; a denial for another operation is not this command's answer. */
  operationId: string | null;
  /** F0: the request key this send carried. When given, a denial or conflict that echoes another key is not this send's answer. */
  requestKey?: string | null;
}

/** `replayed` is the server's bit (`CommandSubmitResult.replayed`): true when a known key answered with the existing command and this call did not send. */
export function classifyStatus(status: CommandStatusV1, replayed: boolean): Receipt {
  if (status.business.state === "REJECTED") {
    return { kind: "REJECTED", code: null, known: false, sentence: "The source rejected this command.", nextAction: null, status };
  }
  if (status.delivery === "FAILED_BEFORE_SEND") {
    return {
      kind: "REJECTED",
      code: "FAILED_BEFORE_SEND",
      known: true,
      sentence: "The command failed before it was sent. That is not an invitation to use a new key: a second command needs its own plan.",
      nextAction: status.nextAction === "REVIEW_BLOCKER" ? "REVIEW_BLOCKER" : null,
      status,
    };
  }
  if (status.delivery === "PREPARED" || status.delivery === "SENDING" || status.delivery === "DELIVERY_UNKNOWN") {
    return { kind: "UNKNOWN", why: "delivery_unknown", httpStatus: null, status };
  }
  return replayed ? { kind: "REPLAYED", status } : { kind: "ACCEPTED", status };
}

/**
 * A body that says it is an F0 apply answer (a denial or key-conflict code, or the bare relay-decision schema) but did not read as one: a
 * danger flag that is not `false`, a key the closed shape does not allow, the legacy top-level `source_request_sent`. It is never a clean refusal
 * that "changed nothing": it is an answer that could not be read, so it is UNKNOWN.
 */
function claimsApplyAnswer(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const record = body as { error?: { code?: unknown }; schema_version?: unknown };
  const code = typeof record.error === "object" && record.error !== null ? record.error.code : undefined;
  return code === F0_APPLY_DENIED_CODE || code === F0_APPLY_CONFLICT_CODE || record.schema_version === RELAY_DECISION_SCHEMA;
}

export function classifySubmit(answer: PortResponse, context: ClassifyContext): Receipt {
  if (answer.kind === "no_response") return { kind: "UNKNOWN", why: "no_response", httpStatus: null, status: null };
  const { status, body } = answer;
  // Access stops first, and the body is not read: a revoked reader is shown nothing from the server.
  if (status === 401 || status === 403 || status === 404) return { kind: "ACCESS_STOPPED", httpStatus: status };

  // The F0 apply has two answers, both 409 with the shared `{ error, request_id, details }` envelope (it has no 2xx). `details`, not the top
  // level, holds `source_request_sent`, `retry_allowed` and `replayed`; the body decides which answer it is, the status only has to agree.
  const apply = readF0ApplyAnswerV1(body);
  if (apply !== null) {
    const keyOk = (key: string) => context.requestKey == null || key === context.requestKey;
    if (apply.kind === "f0_apply_denied") {
      const mine = (context.operationId === null || apply.denial.operationId === context.operationId) && keyOk(apply.denial.requestKey);
      return status === 409 && mine ? { kind: "DENIED", decision: apply.denial } : { kind: "UNKNOWN", why: "unreadable", httpStatus: status, status: null };
    }
    // REQUEST_KEY_PAYLOAD_CONFLICT: the key was first used for another operation. Nothing was recorded and nothing was sent.
    if (status === 409 && keyOk(apply.conflict.requestKey)) {
      return { kind: "REJECTED", code: apply.conflict.code, known: true, sentence: REASON_COPY.COMMAND_IDEMPOTENCY_CONFLICT, nextAction: null, status: null };
    }
    return { kind: "UNKNOWN", why: "unreadable", httpStatus: status, status: null };
  }
  if (claimsApplyAnswer(body)) return { kind: "UNKNOWN", why: "unreadable", httpStatus: status, status: null };
  if (status >= 200 && status < 300) {
    // The capital submit answers with a CommandSubmitResult: the status plus the server's `replayed` bit. A bare status is not that answer.
    const read = readCommandSubmitResultV1(body);
    return read !== null && read.kind === "command_submit_result"
      ? classifyStatus(read.result.status, read.result.replayed)
      : { kind: "UNKNOWN", why: "unreadable", httpStatus: status, status: null };
  }
  const problem = readCommandProblemV1(body);
  if (problem !== null && problem.code === "COMMAND_STATUS_UNVERIFIED") return { kind: "UNKNOWN", why: "unverified", httpStatus: status, status: null };
  if (status >= 500) return { kind: "UNKNOWN", why: "server_error", httpStatus: status, status: null };
  if (status >= 400) {
    const code = problem?.code ?? null;
    const known = code !== null && (COMMAND_REASON_CODES as readonly string[]).includes(code);
    return {
      kind: "REJECTED",
      code,
      known,
      sentence: known
        ? REASON_COPY[code as CommandReasonCode]
        : code === null
          ? "The server refused the command and its reason could not be read."
          : "The server refused the command with a reason this build does not have words for.",
      nextAction: problem?.safeNextAction ?? null,
      status: null,
    };
  }
  return { kind: "UNKNOWN", why: "unreadable", httpStatus: status, status: null };
}

/** A receipt that keeps the payload locked and the key alive. */
export function isUncertain(receipt: Receipt | null): boolean {
  return receipt !== null && receipt.kind === "UNKNOWN";
}

/**
 * A receipt that ends the intent: a command now exists (accepted, replayed, or a source rejection / failed-before-send status), the
 * relay denied it, or access stopped. The form does not reopen; anything further is a new plan.
 */
export function isSettled(receipt: Receipt | null): boolean {
  if (receipt === null) return false;
  switch (receipt.kind) {
    case "ACCEPTED":
    case "REPLAYED":
    case "DENIED":
    case "ACCESS_STOPPED": return true;
    case "REJECTED": return receipt.status !== null;
    case "UNKNOWN": return false;
  }
}

/** A definite refusal that created nothing: the form stays editable and a changed request may be sent. */
export function isDismissible(receipt: Receipt | null): boolean {
  return receipt !== null && receipt.kind === "REJECTED" && receipt.status === null;
}

/** The command id a receipt carries, for "query the same intent". */
export function receiptCommandId(receipt: Receipt | null): string | null {
  if (receipt === null) return null;
  switch (receipt.kind) {
    case "ACCEPTED":
    case "REPLAYED": return receipt.status.commandId;
    case "UNKNOWN": return receipt.status?.commandId ?? null;
    case "REJECTED": return receipt.status?.commandId ?? null;
    // An F0 denial is addressed by its operation id.
    case "DENIED": return receipt.decision.operationId;
    default: return null;
  }
}

export const UNKNOWN_COPY: Readonly<Record<UnknownWhy, string>> = {
  no_response: "No answer came back.",
  server_error: "The server answered with an error that does not say whether the command ran.",
  unverified: "The receipt could not be verified.",
  unreadable: "The answer could not be read.",
  delivery_unknown: "The command was prepared or sent and delivery is not confirmed.",
};

/* ───────────────────────────── the four dimensions ───────────────────────────── */

export interface Facet {
  dimension: "Delivery" | "Business" | "Projection" | "Venue";
  kind: FlagKind;
  label: string;
  /** What the word means, and what it does not. */
  note: string;
  /** The typed absence this dimension carries (`venue_fill`, `source_rejection`), read from its own field and never from the dimension's word. */
  absence?: FacetAbsence;
}

/** One typed absence in one line: NOT_APPLICABLE ("nothing to publish here") and NOT_PUBLISHED ("the source has not published it") are different words. */
export interface FacetAbsence {
  field: "fill" | "rejection";
  state: "NOT_APPLICABLE" | "NOT_PUBLISHED";
  text: string;
  /** Hover text: the request id and the wire reason, kept out of the line itself. */
  title: string;
}

export function fillAbsence(fill: CommandStatusV1["venueFill"]): FacetAbsence {
  switch (fill.state) {
    case "NOT_APPLICABLE": return { field: "fill", state: fill.state, text: "Fill: not applicable", title: "This command has no fill." };
    case "NOT_PUBLISHED": return { field: "fill", state: fill.state, text: "Fill: not published", title: `${notPublishedText("FE-032")} · ${fill.reason}` };
  }
}

export function rejectionAbsence(rejection: CommandStatusV1["sourceRejection"]): FacetAbsence {
  switch (rejection.state) {
    case "NOT_APPLICABLE": return { field: "rejection", state: rejection.state, text: "Reason: not applicable", title: "Nothing was rejected." };
    case "NOT_PUBLISHED": return { field: "rejection", state: rejection.state, text: "Reason: not published", title: `${notPublishedText("FE-032")} · ${rejection.reason}` };
  }
}

export function statusFacets(status: CommandStatusV1): readonly Facet[] {
  const delivery: Facet = (() => {
    switch (status.delivery) {
      case "PREPARED": return { dimension: "Delivery", kind: "pending", label: "Prepared", note: "Recorded in the Portal, not sent." };
      case "SENDING": return { dimension: "Delivery", kind: "pending", label: "Sending", note: "Sent or being sent. A crash here is not proof of no effect." };
      case "ACKNOWLEDGED": return { dimension: "Delivery", kind: "neutral", label: "Acknowledged", note: "Transport acceptance only. It does not say the command was applied." };
      case "DELIVERY_UNKNOWN": return { dimension: "Delivery", kind: "unknown", label: "Delivery unknown", note: "Whether it arrived is not known. It may already have been applied." };
      case "FAILED_BEFORE_SEND": return { dimension: "Delivery", kind: "rejected", label: "Failed before send", note: "It did not leave the Portal." };
    }
  })();
  const business: Facet = (() => {
    switch (status.business.state) {
      case "UNKNOWN": return { dimension: "Business", kind: "unknown", label: "Unknown", note: "No owning receipt yet: not applied, not rejected." };
      case "APPLIED": return { dimension: "Business", kind: "applied", label: "Applied", note: "The source recorded it. This says nothing about a flat or filled position." };
      case "PARTIALLY_APPLIED": return { dimension: "Business", kind: "partial", label: "Partially applied", note: "Part of the amount is applied; read the partition below." };
      case "WAITING_ENCUMBRANCE": return { dimension: "Business", kind: "pending", label: "Waiting", note: "Waiting for capacity. Some of it may already be applied." };
      case "CANCELLED": return { dimension: "Business", kind: "neutral", label: "Cancelled", note: "Cancelled at the source." };
      case "PARTIALLY_APPLIED_CANCELLED": return { dimension: "Business", kind: "partial", label: "Partly applied, rest cancelled", note: "Part applied, the remainder cancelled." };
      case "REJECTED": return { dimension: "Business", kind: "rejected", label: "Rejected", note: "The source rejected it." };
    }
  })();
  const projection: Facet = (() => {
    switch (status.projection) {
      case "UNKNOWN": return { dimension: "Projection", kind: "unknown", label: "Unknown", note: "The Portal view's state is not known." };
      case "CURRENT": return { dimension: "Projection", kind: "ok", label: "Current", note: "The Portal view has caught up." };
      case "CATCHING_UP": return { dimension: "Projection", kind: "display", label: "Catching up", note: "The Portal view is behind. Never resubmit because a view is stale." };
      case "STALE": return { dimension: "Projection", kind: "stale", label: "Stale", note: "The Portal view is out of date." };
      case "UNAVAILABLE": return { dimension: "Projection", kind: "attention", label: "Unavailable", note: "The Portal view cannot be read." };
    }
  })();
  const venue: Facet = (() => {
    switch (status.venue) {
      case "NOT_APPLICABLE": return { dimension: "Venue", kind: "na", label: "Not applicable", note: "This command does not go to a venue." };
      case "UNKNOWN": return { dimension: "Venue", kind: "unknown", label: "Unknown", note: "The venue's state is not known." };
      case "PENDING": return { dimension: "Venue", kind: "pending", label: "Pending", note: "Waiting at the venue." };
      case "ACKNOWLEDGED": return { dimension: "Venue", kind: "neutral", label: "Acknowledged", note: "The venue acknowledged it." };
      case "FILLED": return { dimension: "Venue", kind: "ok", label: "Filled", note: "The venue reports a fill." };
      case "REJECTED": return { dimension: "Venue", kind: "rejected", label: "Rejected", note: "The venue rejected it." };
    }
  })();
  // The absences come from their own typed fields. The venue word and the business word decide nothing here.
  return [delivery, { ...business, absence: rejectionAbsence(status.sourceRejection) }, projection, { ...venue, absence: fillAbsence(status.venueFill) }];
}

export const NEXT_ACTION_COPY: Readonly<Record<CommandStatusV1["nextAction"], string>> = {
  REVIEW_PREVIEW: "Review the preview before doing anything else.",
  QUERY_SAME_INTENT: "Query the same intent. Do not create a new command or a new key.",
  REVIEW_RECEIPT: "Review the receipt.",
  REVIEW_BLOCKER: "Review the blocker. Do not create a new key to get around it.",
};


/* ───────────────────────────── status lookup ───────────────────────────── */

export const COMMAND_ID_PATTERN = /^ecm_[a-f0-9]{32}$/;
export const OPERATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,191}$/;

export type LookupRoute = { kind: "command"; id: string } | { kind: "operation"; id: string } | { kind: "invalid"; reason: string };

export function routeLookup(raw: string): LookupRoute {
  const id = raw.trim();
  if (id === "") return { kind: "invalid", reason: "Type a receipt id." };
  if (COMMAND_ID_PATTERN.test(id)) return { kind: "command", id };
  if (id.startsWith("ecm_")) return { kind: "invalid", reason: "A command id is ecm_ followed by 32 lower-case hex characters." };
  if (OPERATION_ID_PATTERN.test(id)) return { kind: "operation", id };
  return { kind: "invalid", reason: "Not a receipt id: use letters, digits and . _ : - only, up to 191 characters." };
}

/** An operation id the Operations screen can open (`links.ts` routes `op_` ids by query). */
export function operationHref(id: string): string | null {
  return /^op_\w+$/.test(id) ? `/execution/operations?operation=${encodeURIComponent(id)}` : null;
}

/* ───────────────────────────── disabled operations ───────────────────────────── */

/**
 * The staged-activation capability that governs a command risk tier. These four keys are PUBLISHED
 * (`execution-staged-activation.capabilities.valid.json`); the tier-to-key reading is the one `v2/screens/admin` already uses.
 */
const TIER_CAPABILITY: Readonly<Record<string, string>> = {
  R1_PAPER_MUTATION: "COMMAND_R1",
  R2_SANDBOX: "COMMAND_R2",
  R3_LIVE_PROTECTIVE: "COMMAND_R3",
  R4_LIVE_RISK_INCREASING: "COMMAND_R4",
};

export type EnablingCapability =
  | { kind: "staged_activation"; key: string }
  | { kind: "none_published"; because: string };

/** Provisional, FE-037: the Portal grant a person would need has no published name; none is invented. */
export const GRANT_NAME_NOTE = "Portal grant name: not published, provisional (FE-037).";

export function enablingCapability(entry: Pick<CatalogueEntryView, "blockedReason" | "riskTier">): EnablingCapability {
  if (entry.blockedReason !== "COMMAND_RELAY_DISABLED") {
    return { kind: "none_published", because: "No capability enables it: the route itself is not available (see the reason)." };
  }
  const key = entry.riskTier === null ? undefined : TIER_CAPABILITY[entry.riskTier];
  return key === undefined
    ? { kind: "none_published", because: `${notPublishedText("FE-015")}: no capability is published for this tier.` }
    : { kind: "staged_activation", key };
}

export interface DisabledRow {
  id: string;
  label: string;
  /** Group or family heading. */
  group: string;
  /** Tier or family line, when published. */
  tier: string | null;
  /** The exact reason, one sentence. */
  reason: string;
  capability: EnablingCapability;
  /** A short typed word for the reason, when the contract has one. */
  code: string | null;
}

/** The N16B reason word the served catalogue adds beside `ops/emergency-close`. The V1 vocabulary does not know it; the strict reader does. */
export const N16B_BLOCKED_REASON = "N16B_RUNTIME_ACTIVATION_PENDING";

/** What the disabled-operations list needs of one entry. The strict V2 read satisfies it, and so does the V1 `CatalogEntry` (which reads the N16B word as null). */
export interface CatalogueEntryView {
  key: string;
  group: CatalogGroupCode | null;
  riskTier: CatalogRiskTier | null;
  blockedReason: BlockedReason | typeof N16B_BLOCKED_REASON | null;
}
/** What the disabled-operations list needs of a catalogue: its entries. */
export interface CatalogueView {
  entries: readonly CatalogueEntryView[];
}

/** Every blocked reason an entry can carry, in the operator's words: the V1 sentences, and one for the N16B primitive (accepted, described, not active). */
const BLOCKED_TEXT: Readonly<Record<BlockedReason | typeof N16B_BLOCKED_REASON, string>> = {
  ...BLOCKED_REASON_TEXT,
  N16B_RUNTIME_ACTIVATION_PENDING: "The one accepted current protective primitive. It is described, not active in the Portal, so it cannot be sent.",
};

/** The contract's group order; an entry with no group still appears (a catalogue's point is completeness). Same shape as the V1 grouping. */
function groupView(entries: readonly CatalogueEntryView[]): readonly { code: CatalogGroupCode | null; label: string; items: readonly CatalogueEntryView[] }[] {
  const out: { code: CatalogGroupCode | null; label: string; items: CatalogueEntryView[] }[] = [];
  for (const code of CATALOG_GROUPS) {
    const items = entries.filter((e) => e.group === code);
    if (items.length > 0) out.push({ code, label: GROUP_LABEL[code], items });
  }
  const ungrouped = entries.filter((e) => e.group === null);
  if (ungrouped.length > 0) out.push({ code: null, label: "Group not stated", items: ungrouped });
  return out;
}

export function catalogueRows(catalogue: CatalogueView): readonly { code: string | null; label: string; rows: readonly DisabledRow[] }[] {
  return groupView(catalogue.entries).map((group) => ({
    code: group.code,
    label: group.label,
    rows: group.items.map((entry): DisabledRow => ({
      id: entry.key,
      label: entry.key,
      group: group.label,
      tier: entry.riskTier === null ? null : RISK_TIER_LABEL[entry.riskTier],
      reason: entry.blockedReason === null ? "This command is not available through the Portal, and no reason was published." : BLOCKED_TEXT[entry.blockedReason],
      capability: enablingCapability(entry),
      code: entry.blockedReason,
    })),
  }));
}

export { GROUP_LABEL };

/** Capital operations: the eight bodies the bridge supports technically. None is sendable (source-dark). */
export const CAPITAL_OPERATION_ROWS: readonly DisabledRow[] = [
  "FUND", "INITIAL_GRANT", "TOP_UP", "IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL", "ADJUST_TARGET_BUDGET", "SET_ROOT_LIMIT",
].map((operation): DisabledRow => ({
  id: operation,
  label: operation,
  group: "Capital commands",
  tier: null,
  reason: `${SEND_DISABLED_REASON}. The preview reports COMMAND_RELAY_NOT_QUALIFIED until a relay is qualified for this operation and environment.`,
  capability: { kind: "none_published", because: `${notPublishedText("FE-015")}: which capability and grant enable this operation is not published.` },
  code: "COMMAND_RELAY_NOT_QUALIFIED",
}));

/** Families the source has not admitted, with the reason the ELP2-07 coverage table gives. */
export const EXCLUDED_FAMILY_ROWS: readonly DisabledRow[] = [
  { id: "RETURN_CAPITAL", reason: "The source parser knows it but operator dispatch excludes it (PM-G07-SEED-RETURN); no synthetic economic adjustment is made." },
  { id: "ADMIN_LOCK / ADMIN_UNLOCK", reason: "A source candidate control schema exists; it is not the frozen capital body or a current Portal action, and the capital route rejects it." },
  { id: "REALLOCATE_BUDGET", reason: "A source candidate control schema exists; it is not the frozen capital body or a current Portal action, and the capital route rejects it." },
  { id: "APPLY_PENDING / CANCEL_REMAINING", reason: "Pending-recall controls are a separate family with their own coverage packet; this screen does not send them and does not map them to a weaker existing action." },
  { id: "SET_LEVERAGE / SET_MARGIN_MODE / SET_POSITION_MODE / SET_ACCOUNT_MODE", reason: "Profile preparation and reconcile have separate source semantics; they are not capital APPLIED and not native execution." },
  { id: "Entity create / register / assignment / archive, HALT / REDUCING / RESUME", reason: "These keep their own gate-specific paths and are not routed through the capital bridge." },
].map(({ id, reason }): DisabledRow => ({
  id,
  label: id,
  group: "Families the source has not admitted",
  tier: null,
  reason: `${reason}`,
  capability: { kind: "none_published", because: `${notPublishedText("FE-015")}: no capability is published for this family.` },
  code: null,
}));

/* ───────────────────────────── separate certification ───────────────────────────── */

export const CERTIFICATION_PHRASE = "Requires separate certification";

export interface CertificationFlow {
  id: string;
  label: string;
  /** The UX-F cases of the guide this flow belongs to. */
  cases: readonly string[];
  /** Why the Portal does not offer it. One sentence. */
  why: string;
}

/**
 * Trading flows an operation can impact. None of them is enabled by this lane or by any flag in it: each needs its own
 * certification, and the control is a disabled button. The mainnet canary never runs from here.
 */
export const CERTIFICATION_FLOWS: readonly CertificationFlow[] = [
  {
    id: "archive-live",
    label: "Archive an alpha that holds Live positions or working orders",
    cases: ["UX-F14"],
    why: "Positions and working orders need a pending disposition. The Portal does not fake a flat book or return funds. The archive lifecycle read and commands are not published (FE-034).",
  },
  {
    id: "archived-monitor",
    label: "Provision or resume the paper monitor of an archived alpha",
    cases: ["UX-F15"],
    why: "A monitor that is not provisioned, stale or quota-stopped shows its last observation, never invented paper evidence. Monitor commands are not published (FE-034).",
  },
  {
    id: "reactivate",
    label: "Reactivate a reviewed archived alpha",
    cases: ["UX-F16"],
    why: "Review is not certification. Reactivation never goes live or sends funds by itself, and its action stays gated until certified (FE-034).",
  },
  {
    id: "live-protective",
    label: "Live protective and risk-increasing commands (R3 and R4, including emergency close)",
    cases: ["UX-F17"],
    why: "An applied command can coexist with a lagging projection and a partial venue fill. Commands that touch Live trading need a certified path before any of them is offered.",
  },
  {
    id: "mainnet-canary",
    label: "Run the mainnet canary",
    cases: ["UX-F14", "UX-F17"],
    why: "The mainnet canary never runs from the Portal, from this fixture or from any flag.",
  },
];

/* ───────────────────────────── text helpers ───────────────────────────── */

/** A string from outside, printed safely. */
export { showable };
