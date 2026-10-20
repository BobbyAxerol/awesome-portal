/**
 * V2 readers for the command bodies the F0 contract publishes (UXM-09, fixture lane):
 *
 * - `execution.command-plan.v1`            `ExecutionCommandPlan`        (POST /commands/plans, 201)
 * - `execution.command-operation.v1`       `ExecutionCommandOperation` / `F0BlockedOperationRead`
 *                                          (GET /operations/{id}, GET /operations/f0/{id}, apply)
 * - `execution.command-relay-decision.v1`  `RelayDenied`                 (the six-field decision; inside the apply 409 and the lookup)
 * - the F0 apply 409 bodies (BE-P13)       `F0ApplyDeniedProblem` / `F0ApplyKeyConflictProblem` (`{ error, request_id, details }`; the
 *                                          wire shape of POST /operations/f0/{id}/apply, which has NO 2xx)
 * - `portal.execution.f0-apply-attempt.v1` `F0ApplyAttemptLookup`        (GET /operations/f0/{id}/apply-attempts/{request_key}: NONE | FOUND | CONFLICT)
 * - `portal.execution.f0-command-collection.v1`  the finite F0 intent history for one exact resource
 * - `portal.execution.command-preview.v1`  `CommandPreview`              (capital commands, preview)
 * - `CommandProblem`                       the typed refusal envelope shared by the command routes
 *
 * What these bodies prove, and what no reader here may let a screen say:
 *
 * - Every field that decides the rendering is a CONSTANT in the F0 schemas
 *   (`status` BLOCKED, `apply_token` null, `relay_capability` DISABLED,
 *   `source_side_effect_requested` false, `relay_receipt` null, `retry_allowed`
 *   false, `source_request_sent` false). They are READ, not assumed: a body that
 *   carries any other value is not an F0 body, so it is refused whole (`null`)
 *   rather than repaired into one. A later contract that widens a constant
 *   needs its own reader, not a quiet pass-through.
 * - A plan or an operation with `operation_id` is a RECORD that a request was
 *   understood and refused. It is not work in progress, and it is not evidence
 *   of an effect at the Trading System (the plan has `source_side_effect_requested`
 *   false; a screen must not turn `operation_id` into "something is running").
 * - `payload_storage_policy` HASH_ONLY_NO_RAW: the plan carries only a hash.
 *   Nothing here can return the request payload, and the reader never exposes a
 *   server `message` (CommandProblem keeps `code` and `request_id`, validated,
 *   and drops the free text: the public dictionary is the only copy a screen uses).
 * - Times are ISO instants (`readInstant`), kept as text beside epoch ms. The F0
 *   timestamps are Portal timestamps, not source freshness.
 * - Text is held to the same rule as the other V2 readers: no ASCII/C1 control, no
 *   zero-width or bidi-control character, no lone surrogate, not whitespace-only.
 *   This is stricter than the schemas (which allow them); a body whose id, blocker or
 *   code can hide or reverse the text around it is refused whole, never sanitised.
 * - Fail-closed flags: a boolean that is dangerous when wrongly assumed is compared
 *   so an unreadable value voids the read (`source_side_effect_requested !== false`,
 *   `source_request_sent !== false`), and a permission flag voids on any `true`
 *   (`retry_allowed === true`).
 *
 * Each reader answers `null` (malformed, including a wrong constant or an unknown
 * word), `{ kind: "unsupported_shape" }` (a readable body of another `schema_version`),
 * or the typed value. None throws.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import { readInstant, RISK_TIERS_V2, type InstantV2, type RiskTierV2 } from "./operationalQueue";

export const COMMAND_PLAN_SCHEMA = "execution.command-plan.v1";
export const COMMAND_OPERATION_SCHEMA = "execution.command-operation.v1";
export const RELAY_DECISION_SCHEMA = "execution.command-relay-decision.v1";
export const F0_COLLECTION_SCHEMA = "portal.execution.f0-command-collection.v1";
export const COMMAND_PREVIEW_SCHEMA = "portal.execution.command-preview.v1";
export const F0_APPLY_ATTEMPT_SCHEMA = "portal.execution.f0-apply-attempt.v1";

/** `F0ApplyDeniedProblem.error.code` and `F0ApplyKeyConflictProblem.error.code`: the only two answers an F0 apply has. */
export const F0_APPLY_DENIED_CODE = "COMMAND_RELAY_DISABLED";
export const F0_APPLY_CONFLICT_CODE = "REQUEST_KEY_PAYLOAD_CONFLICT";
export const F0_APPLY_ATTEMPT_STATES = ["NONE", "FOUND", "CONFLICT"] as const;
export type F0ApplyAttemptState = (typeof F0_APPLY_ATTEMPT_STATES)[number];

/** The 64 command keys `F0BlockedOperationRead.command_key` allows (the catalogue's keys). Held equal to the schema enum by the conformance suite. */
export const F0_COMMAND_KEYS = [
  "account/policy", "account/reconcile-open-orders", "account/reconcile-positions", "account/seed-paper", "account/state", "account/sync",
  "allocation/<root>", "alpha/inspect", "alpha/register", "authority/create", "authority/list", "bracket-audit/<root>", "broker/bindings",
  "broker/exposure", "broker/reconcile-open-orders", "broker/reconcile-positions", "broker/state", "capital/history", "config/apply",
  "config/plan", "copy/policies", "copy/policy", "deployment/state", "health/<root>", "ops/alerts", "ops/alpha-activity", "ops/command-journal",
  "ops/dead-letters", "ops/emergency-close", "ops/emergency-close-verify", "ops/findings", "ops/redis-retention", "ops/streams",
  "ops/trace-order", "order-group/list", "order-group/show", "performance/account", "performance/account-history", "performance/dashboard",
  "performance/instrument", "performance/portfolio", "performance/portfolio-history", "portfolio/create", "portfolio/list", "portfolio/state",
  "redis/alpha-auth", "redis/get", "redis/scan", "redis/stream", "redis/trading-state", "replay/compare", "replay/create", "replay/events",
  "replay/export", "replay/jobs", "replay/lifecycle", "replay/quantbt-diff", "replay/run", "replay/show", "risk/profile", "risk/state",
  "sizing/decision", "sizing/history", "sizing/summary",
] as const;
export type F0CommandKey = (typeof F0_COMMAND_KEYS)[number];

/** `blockers[]` words an F0 intent may carry (at least `COMMAND_RELAY_DISABLED`, at most three). */
export const F0_BLOCKER_WORDS = [
  "COMMAND_RELAY_DISABLED", "GENERIC_REDIS_ACCESS_PROHIBITED", "N16B_CURRENT_PRIMITIVE_PLAN_INVALID", "N16B_RUNTIME_ACTIVATION_PENDING",
  "N16B_TARGET_SCOPE_UNSUPPORTED", "OWNER_REVIEW_REQUIRED", "SOURCE_ROUTE_MAPPING_AMBIGUOUS", "TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED",
  "TRADING_SYSTEM_TYPED_HTTP_ROUTE_UNPUBLISHED",
] as const;

export const F0_RESOURCE_KINDS = ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const;
export type F0ResourceKind = (typeof F0_RESOURCE_KINDS)[number];
export const F0_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type F0Environment = (typeof F0_ENVIRONMENTS)[number];

/** `CommandPreview.reason_code`: the closed refusal vocabulary of the capital-command routes. */
export const COMMAND_REASON_CODES = [
  "COMMAND_RELAY_NOT_QUALIFIED", "COMMAND_OPERATION_NOT_QUALIFIED", "COMMAND_CONTEXT_INVALID", "COMMAND_CONTEXT_EXPIRED",
  "COMMAND_PREVIEW_CHANGED", "COMMAND_IDEMPOTENCY_CONFLICT", "COMMAND_RETRY_REQUIRED", "COMMAND_RESOURCE_NOT_FOUND",
  "COMMAND_CAPACITY_EXCEEDED", "COMMAND_STATUS_UNVERIFIED", "COMMAND_APPROVAL_REQUIRED",
] as const;
export type CommandReasonCode = (typeof COMMAND_REASON_CODES)[number];
export const APPROVAL_GATES = ["R1", "R2", "CANARY", "LIVE", "CAPITAL"] as const;
export type ApprovalGate = (typeof APPROVAL_GATES)[number];
export const SAFE_NEXT_ACTIONS = ["QUERY_SAME_INTENT", "REVIEW_BLOCKER"] as const;
export type SafeNextAction = (typeof SAFE_NEXT_ACTIONS)[number];

/* ───────────────────────────── types ───────────────────────────── */

/**
 * FE-020: no plan or preview carries a cost, fee or impact value. The only value on the wire is this typed absence (`CostImpactAbsence`).
 * There is deliberately no branch that holds a figure: a screen reads the field instead of a constant, and never computes one.
 */
export interface CostImpactV1 {
  state: "NOT_PUBLISHED";
  reason: "NO_COST_OR_IMPACT_SOURCE";
}

/** The accepted-but-DARK N16B primitive (`ops/emergency-close` only). Both flags are constants false: this is a description, not an activation. */
export interface CurrentPrimitiveV1 {
  id: "live.emergency-close";
  sourceEnvironment: "LIVE_FULL";
  targetTypes: readonly ["ACCOUNT"];
  runtimeActive: false;
  sourceSideEffectRequested: false;
}

export interface CommandPlanV1 {
  operationId: string;
  commandKey: string;
  riskTier: RiskTierV2;
  /** `sha256:` + 64 lowercase hex, verbatim. */
  payloadHash: string;
  planDigest: string;
  /** Constant `BLOCKED` in F0: the plan was understood and refused, not prepared. */
  status: "BLOCKED";
  blockers: readonly string[];
  warnings: readonly string[];
  /** Constant null in F0. There is no token to apply with. */
  applyToken: null;
  expiresAt: InstantV2;
  relayCapability: "DISABLED";
  sourceSideEffectRequested: false;
  payloadStoragePolicy: "HASH_ONLY_NO_RAW";
  /** `null` for every command but `ops/emergency-close`, whose N16B primitive is described here (dark, not active). */
  currentPrimitive: CurrentPrimitiveV1 | null;
  costImpact: CostImpactV1;
  /** The server recognised the request key and returned the existing plan. */
  replayed: boolean;
}

export interface CommandOperationV1 {
  operationId: string;
  commandKey: string;
  status: "BLOCKED";
  verificationResult: "NOT_STARTED";
  blockers: readonly string[];
  warnings: readonly string[];
  relayReceipt: null;
  sourceSideEffectRequested: false;
  createdAt: InstantV2;
  updatedAt: InstantV2;
}

export interface RelayDecisionV1 {
  operationId: string;
  decision: "DENIED";
  reason: "COMMAND_RELAY_DISABLED";
  retryAllowed: false;
  /** Constant false: the denial happened before any relay or source call. */
  sourceRequestSent: false;
}

/** The `details` of the F0 apply 409: the six `RelayDenied` fields unchanged, plus the key and whether this answer is the stored one repeated. */
export interface F0ApplyDenialV1 {
  /** `error.code`, a constant. The server's free text is validated and dropped. */
  code: typeof F0_APPLY_DENIED_CODE;
  requestId: string;
  operationId: string;
  decision: "DENIED";
  reason: "COMMAND_RELAY_DISABLED";
  retryAllowed: false;
  /** Constant false: the denial happened before any relay or source call. */
  sourceRequestSent: false;
  requestKey: string;
  /** This answer is the stored first answer repeated for a known key; nothing new was recorded. */
  replayed: boolean;
}

/** `REQUEST_KEY_PAYLOAD_CONFLICT`: the key was first used for another operation of this actor. The other operation is not named. */
export interface F0ApplyKeyConflictV1 {
  code: typeof F0_APPLY_CONFLICT_CODE;
  requestId: string;
  requestKey: string;
  sourceRequestSent: false;
}

export type F0ApplyAttemptV1 =
  | { state: "NONE"; operationId: string; requestKey: string }
  | { state: "CONFLICT"; operationId: string; requestKey: string }
  | { state: "FOUND"; operationId: string; requestKey: string; relayDecision: RelayDecisionV1; firstRecordedAt: InstantV2 };

export interface CommandProblemV1 {
  /** Upper-case machine word. A screen maps it through its own dictionary; the server's free text is never exposed. */
  code: string;
  requestId: string;
  publicCopyKey: string | null;
  safeNextAction: SafeNextAction | null;
}

export interface CommandPreviewV1 {
  allowed: boolean;
  reasonCode: CommandReasonCode | null;
  previewDigest: string | null;
  expiresAtMs: UtcEpochMs | null;
  profileRef: string | null;
  approvalRequired: boolean | null;
  approvalGate: ApprovalGate | null;
  costImpact: CostImpactV1;
  /** Constants on the wire: a preview never applies and never reserves. */
  businessApplied: false;
  reserved: false;
}

export interface F0CommandCollectionV1 {
  resource: { kind: F0ResourceKind; id: string };
  environment: F0Environment;
  items: readonly CommandOperationV1[];
  page: { limit: number; returnedCount: number; hasMore: boolean; nextCursor: string | null };
}

export interface UnsupportedCommandShape {
  kind: "unsupported_shape";
  schemaVersion: string | null;
}

export type CommandPlanRead = { kind: "command_plan"; plan: CommandPlanV1 } | UnsupportedCommandShape;
export type CommandOperationRead = { kind: "command_operation"; operation: CommandOperationV1 } | UnsupportedCommandShape;
export type RelayDecisionRead = { kind: "relay_decision"; decision: RelayDecisionV1 } | UnsupportedCommandShape;
export type F0ApplyAnswerRead = { kind: "f0_apply_denied"; denial: F0ApplyDenialV1 } | { kind: "f0_apply_key_conflict"; conflict: F0ApplyKeyConflictV1 };
export type F0ApplyAttemptRead = { kind: "f0_apply_attempt"; attempt: F0ApplyAttemptV1 } | UnsupportedCommandShape;
export type CommandPreviewRead = { kind: "command_preview"; preview: CommandPreviewV1 } | UnsupportedCommandShape;
export type F0CommandCollectionRead = { kind: "f0_collection"; collection: F0CommandCollectionV1 } | UnsupportedCommandShape;

/* ───────────────────────────── low-level checks ───────────────────────────── */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null;
}

/** Own keys: every required one, no one outside required + optional (a planted `__proto__` is an own key and is refused). */
function shape(value: unknown, required: readonly string[], optional: readonly string[] = []): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  const own = Object.keys(r);
  if (!required.every((key) => Object.prototype.hasOwnProperty.call(r, key))) return null;
  return own.every((key) => required.includes(key) || optional.includes(key)) ? r : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}

/** C0/C1 controls and DEL, zero-width and bidi-control format characters. */
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/** Plain text of 1..`max` code points: no control or invisible format character, well-formed, not whitespace-only. */
function plain(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > max * 2 || UNSAFE_TEXT.test(value) || LONE_SURROGATE.test(value) || value.trim().length === 0) return null;
  return codePoints(value) <= max ? value : null;
}

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,191}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const PREVIEW_HASH = /^sha256:[a-f0-9]{64}$/;
const WORD = /^[A-Z][A-Z0-9_]{2,119}$/;
/** `request_key` grammar of the F0 apply request, denial and lookup. */
const REQUEST_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

function requestKey(value: unknown): string | null {
  return typeof value === "string" && REQUEST_KEY.test(value) ? value : null;
}

/** `CostImpactAbsence`: the one value there is. Any other state or reason voids the field; nothing is ever filled in. */
function costImpact(value: unknown): CostImpactV1 | null {
  const r = shape(value, ["state", "reason"]);
  return r !== null && r.state === "NOT_PUBLISHED" && r.reason === "NO_COST_OR_IMPACT_SOURCE"
    ? { state: "NOT_PUBLISHED", reason: "NO_COST_OR_IMPACT_SOURCE" }
    : null;
}

/** `current_primitive`: `null` (undefined here is "unreadable") or exactly the five-key N16B object with its three constants. */
function currentPrimitive(value: unknown): CurrentPrimitiveV1 | null | undefined {
  if (value === null) return null;
  const r = shape(value, ["id", "source_environment", "target_types", "runtime_active", "source_side_effect_requested"]);
  if (r === null) return undefined;
  if (
    r.id !== "live.emergency-close" || r.source_environment !== "LIVE_FULL" || r.runtime_active !== false || r.source_side_effect_requested !== false
    || !Array.isArray(r.target_types) || r.target_types.length !== 1 || r.target_types[0] !== "ACCOUNT"
  ) return undefined;
  return { id: "live.emergency-close", sourceEnvironment: "LIVE_FULL", targetTypes: ["ACCOUNT"], runtimeActive: false, sourceSideEffectRequested: false };
}

function identifier(value: unknown): string | null {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : null;
}

/** `null` stays null; a value is read or the whole field is invalid (`undefined`). */
function nullable<T>(value: unknown, read: (v: unknown) => T | null): T | null | undefined {
  if (value === null) return null;
  const read1 = read(value);
  return read1 === null ? undefined : read1;
}

function version(root: Rec): string | null {
  return typeof root.schema_version === "string" ? root.schema_version : null;
}

/** `blockers` / `warnings`: unique plain strings of 1..128 code points, at most `max` of them, at least `min`. */
function words(value: unknown, min: number, max: number): readonly string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  const out: string[] = [];
  for (const entry of value) {
    const text = plain(entry, 128);
    if (text === null || out.includes(text)) return null;
    out.push(text);
  }
  return out;
}

/* ───────────────────────────── plan ───────────────────────────── */

const PLAN_KEYS = [
  "schema_version", "operation_id", "command_type", "command_version", "command_key", "risk_tier", "payload_hash", "plan_digest", "status",
  "blockers", "warnings", "apply_token", "expires_at", "payload_storage_policy", "relay_capability", "source_side_effect_requested",
  "current_primitive", "cost_impact", "replayed",
] as const;

/** Max blockers/warnings the schemas allow is unbounded; the screen bound is generous and a larger list voids the read. */
const MAX_WORDS = 128;

export function readCommandPlanV1(raw: unknown): CommandPlanRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const schemaVersion = version(root);
  if (schemaVersion !== COMMAND_PLAN_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
  const r = shape(root, PLAN_KEYS);
  if (r === null) return null;

  const operationId = identifier(r.operation_id);
  const commandKey = typeof r.command_key === "string" && r.command_key.length >= 3 && r.command_key.length <= 128 ? plain(r.command_key, 128) : null;
  const riskTier = oneOf(r.risk_tier, RISK_TIERS_V2);
  const blockers = words(r.blockers, 1, MAX_WORDS);
  const warnings = words(r.warnings, 0, MAX_WORDS);
  const expiresAt = readInstant(r.expires_at);
  const primitive = currentPrimitive(r.current_primitive);
  const cost = costImpact(r.cost_impact);
  if (
    r.command_type !== "EXECUTION_COMMAND" || r.command_version !== 1 || r.status !== "BLOCKED" || r.apply_token !== null
    || r.relay_capability !== "DISABLED" || r.payload_storage_policy !== "HASH_ONLY_NO_RAW"
    // Fail closed: anything but the published `false` voids the read, so an unreadable flag is never "nothing was asked".
    || r.source_side_effect_requested !== false
    || typeof r.replayed !== "boolean"
    || typeof r.payload_hash !== "string" || !HASH.test(r.payload_hash)
    || typeof r.plan_digest !== "string" || !HASH.test(r.plan_digest)
    || operationId === null || commandKey === null || riskTier === null || blockers === null || warnings === null || expiresAt === null
    || primitive === undefined || cost === null
    // Group `primitive-identity` (stricter than the schema): the N16B primitive is described for `ops/emergency-close` and for no other command.
    || (primitive !== null && commandKey !== "ops/emergency-close")
  ) return null;

  return {
    kind: "command_plan",
    plan: {
      operationId, commandKey, riskTier, payloadHash: r.payload_hash, planDigest: r.plan_digest, status: "BLOCKED", blockers, warnings,
      applyToken: null, expiresAt, relayCapability: "DISABLED", sourceSideEffectRequested: false, payloadStoragePolicy: "HASH_ONLY_NO_RAW",
      currentPrimitive: primitive, costImpact: cost, replayed: r.replayed,
    },
  };
}

/* ───────────────────────────── operation ───────────────────────────── */

const OPERATION_KEYS = [
  "schema_version", "operation_id", "command_type", "command_key", "status", "verification_result", "blockers", "warnings", "relay_receipt",
  "source_side_effect_requested", "created_at", "updated_at",
] as const;

function operationBody(root: Rec): CommandOperationV1 | null {
  const r = shape(root, OPERATION_KEYS);
  if (r === null) return null;
  const operationId = identifier(r.operation_id);
  const commandKey = typeof r.command_key === "string" && r.command_key.length >= 3 && r.command_key.length <= 128 ? plain(r.command_key, 128) : null;
  const blockers = words(r.blockers, 1, MAX_WORDS);
  const warnings = words(r.warnings, 0, MAX_WORDS);
  const createdAt = readInstant(r.created_at);
  const updatedAt = readInstant(r.updated_at);
  if (
    r.command_type !== "EXECUTION_COMMAND" || r.status !== "BLOCKED" || r.verification_result !== "NOT_STARTED" || r.relay_receipt !== null
    || r.source_side_effect_requested !== false
    || operationId === null || commandKey === null || blockers === null || warnings === null || createdAt === null || updatedAt === null
    // Runtime rule the schema cannot say (F0BlockedOperationRead): the record is not updated before it is created.
    || updatedAt.ms < createdAt.ms
  ) return null;
  return {
    operationId, commandKey, status: "BLOCKED", verificationResult: "NOT_STARTED", blockers, warnings, relayReceipt: null,
    sourceSideEffectRequested: false, createdAt, updatedAt,
  };
}

export function readCommandOperationV1(raw: unknown): CommandOperationRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const schemaVersion = version(root);
  if (schemaVersion !== COMMAND_OPERATION_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
  const operation = operationBody(root);
  return operation === null ? null : { kind: "command_operation", operation };
}

/**
 * `F0BlockedOperationRead`: the same twelve-field body with three more rules. The key is one of the 64 catalogue keys, `blockers` holds 1 to 3
 * of the nine published words and contains `COMMAND_RELAY_DISABLED`, and `warnings` is empty.
 */
function f0Refinement(operation: CommandOperationV1): boolean {
  const known: readonly string[] = F0_COMMAND_KEYS;
  const allowed: readonly string[] = F0_BLOCKER_WORDS;
  return known.includes(operation.commandKey)
    && operation.blockers.length <= 3
    && operation.blockers.includes("COMMAND_RELAY_DISABLED")
    && operation.blockers.every((word) => allowed.includes(word))
    && operation.warnings.length === 0;
}

export function readF0BlockedOperationV1(raw: unknown): CommandOperationRead | null {
  const read = readCommandOperationV1(raw);
  if (read === null || read.kind !== "command_operation") return read;
  return f0Refinement(read.operation) ? read : null;
}

/* ───────────────────────────── relay decision ───────────────────────────── */

const DECISION_KEYS = ["schema_version", "operation_id", "decision", "reason", "retry_allowed", "source_request_sent"] as const;

/** The six `RelayDenied` fields as a typed value, or `null`. Shared by the stand-alone decision, the lookup's FOUND branch and the apply 409. */
function decisionFields(r: Rec): RelayDecisionV1 | null {
  const operationId = identifier(r.operation_id);
  if (
    r.schema_version !== RELAY_DECISION_SCHEMA
    || operationId === null || r.decision !== "DENIED" || r.reason !== "COMMAND_RELAY_DISABLED"
    // Permission flag: any `true` (or any non-boolean) voids the read, so a retry is never invited by a guess.
    || typeof r.retry_allowed !== "boolean" || r.retry_allowed === true
    // Danger flag: only the published `false` means "nothing reached the source".
    || r.source_request_sent !== false
  ) return null;
  return { operationId, decision: "DENIED", reason: "COMMAND_RELAY_DISABLED", retryAllowed: false, sourceRequestSent: false };
}

export function readRelayDecisionV1(raw: unknown): RelayDecisionRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const schemaVersion = version(root);
  if (schemaVersion !== RELAY_DECISION_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
  const r = shape(root, DECISION_KEYS);
  if (r === null) return null;
  const decision = decisionFields(r);
  return decision === null ? null : { kind: "relay_decision", decision };
}

/* ───────────────────────────── F0 apply answers (BE-P13) ───────────────────────────── */

/**
 * F0 apply has NO 2xx: the plan table is trigger-immutable BLOCKED and the service throws `COMMAND_RELAY_DISABLED` for every plan the creator
 * can see. The wire bodies are the shared error filter's envelope, `{ error: { code, message }, request_id, details }`, with NO
 * `schema_version` at the root and NO `source_request_sent` at the top level (that fact lives in `details`; the legacy V1
 * `readRelayDenial` reads it from the top level, where it is absent). These readers are the V2 story's only way to read an apply answer.
 *
 * Two answers, two closed shapes; any other code, key or constant is `null`:
 * - 409 `COMMAND_RELAY_DISABLED` + `details` (the eight `F0ApplyDecision` keys): denied, `replayed` says whether this is the stored first answer;
 * - 409 `REQUEST_KEY_PAYLOAD_CONFLICT` + `details` `{ request_key, source_request_sent: false }`: the key belongs to another operation of this actor.
 */
const APPLY_DETAIL_KEYS = [...DECISION_KEYS, "request_key", "replayed"] as const;
const APPLY_ERROR_KEYS = ["code", "message"] as const;

/** `error.message` is validated (1..512 plain characters) and dropped: the words a screen shows are its own dictionary's. */
function applyEnvelope(raw: unknown, code: string): { requestId: string; details: unknown } | null {
  const r = shape(raw, ["error", "request_id", "details"]);
  const error = shape(r?.error, APPLY_ERROR_KEYS);
  if (r === null || error === null || error.code !== code || plain(error.message, 512) === null) return null;
  const requestId = plain(r.request_id, 128);
  return requestId === null ? null : { requestId, details: r.details };
}

export function readF0ApplyDeniedV1(raw: unknown): F0ApplyDenialV1 | null {
  const envelope = applyEnvelope(raw, F0_APPLY_DENIED_CODE);
  const details = shape(envelope?.details, APPLY_DETAIL_KEYS);
  if (envelope === null || details === null) return null;
  const decision = decisionFields(details);
  const key = requestKey(details.request_key);
  if (decision === null || key === null || typeof details.replayed !== "boolean") return null;
  return {
    code: F0_APPLY_DENIED_CODE, requestId: envelope.requestId, operationId: decision.operationId, decision: "DENIED", reason: "COMMAND_RELAY_DISABLED",
    retryAllowed: false, sourceRequestSent: false, requestKey: key, replayed: details.replayed,
  };
}

export function readF0ApplyKeyConflictV1(raw: unknown): F0ApplyKeyConflictV1 | null {
  const envelope = applyEnvelope(raw, F0_APPLY_CONFLICT_CODE);
  const details = shape(envelope?.details, ["request_key", "source_request_sent"]);
  if (envelope === null || details === null) return null;
  const key = requestKey(details.request_key);
  // Danger flag: only the published `false` says nothing was sent.
  if (key === null || details.source_request_sent !== false) return null;
  return { code: F0_APPLY_CONFLICT_CODE, requestId: envelope.requestId, requestKey: key, sourceRequestSent: false };
}

/** Either 409 an F0 apply gives, picked by `error.code` (the body decides, never the HTTP status alone). `null` for anything else. */
export function readF0ApplyAnswerV1(raw: unknown): F0ApplyAnswerRead | null {
  const denial = readF0ApplyDeniedV1(raw);
  if (denial !== null) return { kind: "f0_apply_denied", denial };
  const conflict = readF0ApplyKeyConflictV1(raw);
  return conflict === null ? null : { kind: "f0_apply_key_conflict", conflict };
}

/* ───────────────────────────── F0 apply attempt lookup (BE-P13) ───────────────────────────── */

const ATTEMPT_KEYS = ["schema_version", "operation_id", "request_key", "state", "relay_decision", "first_recorded_at"] as const;

/**
 * `F0ApplyAttemptLookup`: recovery of the apply answer by key after a lost response. Three closed variants:
 *
 * - NONE      this actor never recorded that key; `relay_decision` and `first_recorded_at` are null. It is NOT "the apply did not happen elsewhere".
 * - FOUND     the key was recorded for THIS operation: `relay_decision` is what a replay returns, `first_recorded_at` its instant.
 * - CONFLICT  the key is bound to a different operation, which is deliberately not named; both fields null.
 *
 * Group `lookup-identity` (stricter than the schema): a FOUND decision names the operation the lookup named.
 */
export function readF0ApplyAttemptLookupV1(raw: unknown): F0ApplyAttemptRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const schemaVersion = version(root);
  if (schemaVersion !== F0_APPLY_ATTEMPT_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
  const r = shape(root, ATTEMPT_KEYS);
  if (r === null) return null;
  const operationId = identifier(r.operation_id);
  const key = requestKey(r.request_key);
  const state = oneOf(r.state, F0_APPLY_ATTEMPT_STATES);
  if (operationId === null || key === null || state === null) return null;
  if (state === "FOUND") {
    const decisionRoot = shape(r.relay_decision, DECISION_KEYS);
    const relayDecision = decisionRoot === null ? null : decisionFields(decisionRoot);
    const firstRecordedAt = readInstant(r.first_recorded_at);
    if (relayDecision === null || firstRecordedAt === null || relayDecision.operationId !== operationId) return null;
    return { kind: "f0_apply_attempt", attempt: { state: "FOUND", operationId, requestKey: key, relayDecision, firstRecordedAt } };
  }
  if (r.relay_decision !== null || r.first_recorded_at !== null) return null;
  return { kind: "f0_apply_attempt", attempt: { state, operationId, requestKey: key } };
}

/* ───────────────────────────── problem ───────────────────────────── */

/**
 * The `CommandProblem` envelope (`{ error: { code, message }, request_id, public_copy_key?, safe_next_action? }`). It carries no
 * `schema_version`, so a body that is not exactly this shape is `null`. The free-text `message` is validated and dropped.
 */
export function readCommandProblemV1(raw: unknown): CommandProblemV1 | null {
  const r = shape(raw, ["error", "request_id"], ["public_copy_key", "safe_next_action"]);
  const error = shape(r?.error, ["code", "message"]);
  if (r === null || error === null) return null;
  const code = typeof error.code === "string" && WORD.test(error.code) ? error.code : null;
  const message = plain(error.message, 2048);
  const requestId = plain(r.request_id, 191);
  const publicCopyKey = r.public_copy_key === undefined ? null : plain(r.public_copy_key, 128);
  const safeNextAction = r.safe_next_action === undefined ? null : oneOf(r.safe_next_action, SAFE_NEXT_ACTIONS);
  if (code === null || message === null || requestId === null || (r.public_copy_key !== undefined && publicCopyKey === null)
    || (r.safe_next_action !== undefined && safeNextAction === null)) return null;
  return { code, requestId, publicCopyKey, safeNextAction };
}

/* ───────────────────────────── preview ───────────────────────────── */

const PREVIEW_KEYS = [
  "schema_version", "allowed", "reason_code", "preview_digest", "expires_at_ms", "profile_ref", "approval_required", "approval_gate",
  "cost_impact", "business_applied", "reserved",
] as const;

export function readCommandPreviewV1(raw: unknown): CommandPreviewRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const schemaVersion = version(root);
  if (schemaVersion !== COMMAND_PREVIEW_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
  const r = shape(root, PREVIEW_KEYS);
  if (r === null) return null;
  const reasonCode = nullable(r.reason_code, (v) => oneOf(v, COMMAND_REASON_CODES));
  const previewDigest = nullable(r.preview_digest, (v) => (typeof v === "string" && PREVIEW_HASH.test(v) ? v : null));
  const expiresAtMs = nullable(r.expires_at_ms, (v) => {
    const at = readUtcEpochMs(v);
    return at !== null && at >= 0 ? at : null;
  });
  const profileRef = nullable(r.profile_ref, (v) => plain(v, 256));
  const approvalRequired = nullable(r.approval_required, (v) => (typeof v === "boolean" ? { value: v } : null));
  const approvalGate = nullable(r.approval_gate, (v) => oneOf(v, APPROVAL_GATES));
  const cost = costImpact(r.cost_impact);
  if (
    typeof r.allowed !== "boolean"
    || reasonCode === undefined || previewDigest === undefined || expiresAtMs === undefined || profileRef === undefined
    || approvalRequired === undefined || approvalGate === undefined || cost === null
    // A preview never applies and never reserves; anything but the published `false` voids it.
    || r.business_applied !== false || r.reserved !== false
  ) return null;
  return {
    kind: "command_preview",
    preview: {
      allowed: r.allowed, reasonCode, previewDigest, expiresAtMs, profileRef, approvalRequired: approvalRequired === null ? null : approvalRequired.value, approvalGate, costImpact: cost,
      businessApplied: false, reserved: false,
    },
  };
}

/* ───────────────────────────── F0 collection ───────────────────────────── */

const COLLECTION_KEYS = ["schema_version", "family", "coverage", "resource", "environment", "items", "page"] as const;
const MAX_COLLECTION_ITEMS = 100;

export function readF0CommandCollectionV1(raw: unknown): F0CommandCollectionRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const schemaVersion = version(root);
  if (schemaVersion !== F0_COLLECTION_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
  const r = shape(root, COLLECTION_KEYS);
  const resource = shape(r?.resource, ["kind", "id"]);
  const page = shape(r?.page, ["limit", "returned_count", "has_more", "next_cursor"]);
  if (r === null || resource === null || page === null) return null;
  const kind = oneOf(resource.kind, F0_RESOURCE_KINDS);
  const resourceId = identifier(resource.id);
  const environment = oneOf(r.environment, F0_ENVIRONMENTS);
  const limit = typeof page.limit === "number" && Number.isInteger(page.limit) && page.limit >= 1 && page.limit <= MAX_COLLECTION_ITEMS ? page.limit : null;
  const returnedCount = typeof page.returned_count === "number" && Number.isInteger(page.returned_count) && page.returned_count >= 0 && page.returned_count <= MAX_COLLECTION_ITEMS ? page.returned_count : null;
  const nextCursor = page.next_cursor === null ? null : typeof page.next_cursor === "string" && page.next_cursor.length <= 4096 ? plain(page.next_cursor, 4096) : undefined;
  if (
    r.family !== "F0_BLOCKED_INTENTS_ONLY" || r.coverage !== "CURRENT_ACTOR_EXACT_RESOURCE_ONLY"
    || kind === null || resourceId === null || environment === null || limit === null || returnedCount === null
    || typeof page.has_more !== "boolean" || nextCursor === undefined || (page.next_cursor !== null && nextCursor === null)
    || !Array.isArray(r.items) || r.items.length > MAX_COLLECTION_ITEMS
  ) return null;

  const items: CommandOperationV1[] = [];
  for (const entry of r.items) {
    const item = rec(entry);
    if (item === null || item.schema_version !== COMMAND_OPERATION_SCHEMA) return null;
    const operation = operationBody(item);
    if (operation === null || !f0Refinement(operation)) return null;
    items.push(operation);
  }
  // Runtime rules the schema cannot say: the count is the length and fits the limit, ids are unique, the page is ordered
  // newest first then by id, and "more" holds exactly when a cursor is given.
  if (returnedCount !== items.length || items.length > limit || new Set(items.map((item) => item.operationId)).size !== items.length) return null;
  if (page.has_more !== (nextCursor !== null)) return null;
  for (let i = 1; i < items.length; i += 1) {
    const prev = items[i - 1]!;
    const cur = items[i]!;
    if (cur.createdAt.ms > prev.createdAt.ms || (cur.createdAt.ms === prev.createdAt.ms && cur.operationId < prev.operationId)) return null;
  }
  return {
    kind: "f0_collection",
    collection: { resource: { kind, id: resourceId }, environment, items, page: { limit, returnedCount, hasMore: page.has_more, nextCursor } },
  };
}
