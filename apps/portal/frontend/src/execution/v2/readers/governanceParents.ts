/**
 * V2 governance parent readers: the bodies the server answers on the SAME
 * routes as the V1 reviews once the workspace is SCOPED_V2 (Codex 0d5ceaba,
 * 25218372; `execution-governance.d.ts`, `execution-canary.d.ts`,
 * `execution-profile-read.d.ts`).
 *
 * Families:
 * - `portal.execution.governance-parent.v2`: R2, PAPER_EXIT;
 * - `portal.execution.following-parent.v2`: SANDBOX, CANARY;
 * - `portal.execution.live-parent.v2`: LIVE_GATE;
 * - `portal.execution.governance-parent-operation.v2`: the operation of an R2 or
 *   Paper Exit decision.
 *
 * Reading rules (review2/04, consumer-review-2026-10-18 s3, s6):
 * - strict and closed: every object has exactly the keys the schema lists
 *   (the schemas are `additionalProperties:false`), every enum is the
 *   published vocabulary, and the schema's own conditionals are applied
 *   (`applied_at_ms` iff APPLIED, parent pins all-null or all-present,
 *   `EXTENDED` iff an extension). Anything else is `null`, never repaired;
 * - what the body publishes is exposed as published (lineage availability and
 *   the ids in it, findings `outcome`/`blocking`/`required`, quorum, policy
 *   version, the Portal timestamps); what it does not publish is a typed
 *   absence. An optional section is `{availability:"AVAILABLE", ...}` or
 *   `{availability:"NOT_PUBLISHED", reasonCode}`, never an empty list;
 * - what is not on the wire at all (criteria label/observed/limit, capital
 *   rows, an actor, the decision call) is NOT invented here and not inferred
 *   from what is: `notPublished` names each such datum with the FE request
 *   that will publish it, so a screen prints `Not published (FE-xxx)` from data
 *   instead of a bare dash or a "no R1 lineage" claim the body disproves;
 * - Portal timestamps are Portal lifecycle clocks, not source freshness, and a
 *   decimal crosses as the exact string (`readDecimal` over `readExactDecimal`);
 * - `APPLIED` on an operation is the stored Portal state, not Trading System
 *   acceptance, settlement or verification;
 * - every reader takes `unknown`, never throws, and answers a value or `null`.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import { readDecimal, type BoundaryDecimal } from "../boundary";

export const GOVERNANCE_PARENT_V2_SCHEMA = "portal.execution.governance-parent.v2";
export const GOVERNANCE_PARENT_OPERATION_V2_SCHEMA = "portal.execution.governance-parent-operation.v2";
export const FOLLOWING_PARENT_V2_SCHEMA = "portal.execution.following-parent.v2";
export const LIVE_PARENT_V2_SCHEMA = "portal.execution.live-parent.v2";
export const PARENT_FIELDS_REVISION = "portal.execution.parent-fields.v1";

/** Every `schema_version` this file reads. */
export const PARENT_V2_SCHEMAS = [
  GOVERNANCE_PARENT_V2_SCHEMA,
  GOVERNANCE_PARENT_OPERATION_V2_SCHEMA,
  FOLLOWING_PARENT_V2_SCHEMA,
  LIVE_PARENT_V2_SCHEMA,
] as const;

/* ── closed vocabularies ──────────────────────────────────────────────────── */

export const APPROVAL_STATUSES_V2 = ["PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"] as const;
export type ApprovalStatusV2 = (typeof APPROVAL_STATUSES_V2)[number];
export const REVIEW_STATES_V2 = ["PENDING", "EXTENDED", "REJECTED_TO_PAPER_HELD", "PROMOTION_AUTHORIZED"] as const;
export type ReviewStateV2 = (typeof REVIEW_STATES_V2)[number];
export const PANEL_KINDS_V2 = ["OBSERVATION_COVERAGE", "DRIFT", "LIMITS_HEALTH", "PORTFOLIO_FIT"] as const;
export type PanelKindV2 = (typeof PANEL_KINDS_V2)[number];
export const PANEL_STATES_V2 = ["OK", "PARTIAL", "STALE", "UNAVAILABLE", "ERROR"] as const;
export type PanelStateV2 = (typeof PANEL_STATES_V2)[number];
export const FINDING_OUTCOMES_V2 = ["PASS", "WATCH", "FAIL", "INSUFFICIENT"] as const;
export type FindingOutcomeV2 = (typeof FINDING_OUTCOMES_V2)[number];
const SOURCE_AUTHORITIES = ["RESEARCH", "EXECUTION", "BROKER", "DERIVED"] as const;
type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];
const FRESHNESS = ["OK", "STALE", "UNKNOWN"] as const;
const COMPLETENESS = ["EVENT_SOURCED", "POLL_BOUNDED", "UNKNOWN"] as const;
const CERTIFICATION_STATES = ["DRAFT", "IN_REVIEW", "APPROVED", "DENIED"] as const;
const STEP_KEYS = ["CONNECT", "SYNC", "ORDER_TYPES", "RECONCILIATION", "TIMEBOXED_RUN", "CLEANUP", "EXIT_REVIEW"] as const;
const STEP_EVALUATIONS = ["PASS", "FAIL", "STALE", "UNAVAILABLE"] as const;
const OPERATION_STATUSES = ["PLANNED", "APPLIED", "EXPIRED"] as const;
const R2_DECISIONS = ["APPROVE", "APPROVE_WITH_CONDITION", "DENY"] as const;
const EXIT_DECISIONS = ["PROMOTE", "EXTEND_OBSERVATION", "REJECT"] as const;

/* ── result types ─────────────────────────────────────────────────────────── */

/** An optional section the server did not publish, with the reason it gave. */
export interface AbsentSectionV2 {
  availability: "NOT_PUBLISHED";
  reasonCode: string;
}
export type SectionV2<T> = ({ availability: "AVAILABLE" } & T) | AbsentSectionV2;

/**
 * What the body does not carry at all, as `datum -> FE request`. A screen
 * prints `Not published (FE-xxx)` from this; a reader never fills the datum.
 */
export type NotPublishedV2 = Readonly<Record<string, string>>;

export interface ParentSourceV2 {
  authority: "PORTAL";
  sourceVerdict: "NOT_ASSERTED";
  /** Always false on a published parent; the reader refuses anything else. */
  sourceSideEffectRequested: false;
  runtimeActivationRequested?: false;
  promotionExecutionRequested?: false;
}

export interface ParentHeaderV2 {
  workspaceId: string;
  recordAuthority: "PORTAL";
  provenanceBasis: "CURRENT_CORE_BASELINE";
  fieldContractRevision: typeof PARENT_FIELDS_REVISION;
  /** When the Portal read this; a Portal clock, not source freshness. */
  observedAt: UtcEpochMs;
  source: ParentSourceV2;
}

export interface ApprovalV2 {
  approvalId: string;
  gate: "R2" | "PAPER_EXIT" | "LIVE_GATE";
  status: ApprovalStatusV2;
  approvalVersion: number;
  policyVersion: string;
  quorumRequired: number;
  quorumMet: number;
  evidenceComplete: boolean;
  createdAt: UtcEpochMs;
  updatedAt: UtcEpochMs;
  slaDueAt: UtcEpochMs;
  expiresAt: UtcEpochMs;
  /** `null` = not decided yet. */
  decidedAt: UtcEpochMs | null;
}

export interface R2LineageV2 {
  basis: "STORED_IMMUTABLE_REFERENCE";
  r1ApprovalId: string;
  observedRiskGrantId: string;
  currency: string;
}

export interface ExitLineageV2 {
  basis: "VERIFIED_CURRENT_STORED_BYTES_NOT_SOURCE_ACCEPTANCE";
  r1ApprovalId: string;
  r2ApprovalId: string;
  sourceSnapshotHash: string;
  evidenceSetHash: string;
}

export interface R2ParentV2 {
  family: "R2";
  header: ParentHeaderV2;
  anchors: { deploymentId: string; portfolioId: string; environment: "PAPER" };
  approval: ApprovalV2 & { gate: "R2" };
  lineage: SectionV2<R2LineageV2>;
  notPublished: NotPublishedV2;
}

export interface ExitPanelV2 {
  panelId: string;
  ordinal: number;
  panelKind: PanelKindV2;
  sourceAuthority: SourceAuthority;
  panelState: PanelStateV2;
  /** `null` = the panel published no clock. */
  asOf: UtcEpochMs | null;
  freshness: "OK" | "STALE" | "UNKNOWN";
  sourceCompleteness: "EVENT_SOURCED" | "POLL_BOUNDED" | "UNKNOWN";
  pollIntervalMs: number | null;
  formulaVersion: string | null;
}

/**
 * One finding as published: an outcome and two flags. There is no label,
 * observed value or limit (FE-028), so none is shown.
 */
export interface ExitFindingV2 {
  findingId: string;
  panelId: string;
  ordinal: number;
  outcome: FindingOutcomeV2;
  blocking: boolean;
  required: boolean;
  asOf: UtcEpochMs | null;
}

export interface ExitEvaluationV2 {
  evaluationPolicyVersion: string;
  evaluationFormulaVersion: string;
  panels: readonly ExitPanelV2[];
  findings: readonly ExitFindingV2[];
}

export interface PaperExitParentV2 {
  family: "PAPER_EXIT";
  header: ParentHeaderV2;
  anchors: { deploymentId: string; portfolioId: string; environment: "PAPER" };
  approval: ApprovalV2 & { gate: "PAPER_EXIT" };
  review: {
    reviewId: string;
    reviewState: ReviewStateV2;
    reviewVersion: number;
    promoteTo: "SANDBOX_VALIDATION";
    extensionDays: 14 | null;
    extendedUntil: UtcEpochMs | null;
    createdAt: UtcEpochMs;
    updatedAt: UtcEpochMs;
  };
  evaluation: SectionV2<ExitEvaluationV2>;
  lineage: SectionV2<ExitLineageV2>;
  notPublished: NotPublishedV2;
}

export interface CertificationStepV2 {
  stepKey: (typeof STEP_KEYS)[number];
  /** `NOT_RECORDED` = no evidence stored for this step; every other field is then `null`. */
  recorded: boolean;
  evidenceId: string | null;
  storedEvaluation: (typeof STEP_EVALUATIONS)[number] | null;
  sourceAuthority: "PORTAL" | "EXECUTION" | "BROKER" | "DERIVED" | null;
  sourceVerification: "VERIFIED" | "UNAVAILABLE" | null;
  asOf: UtcEpochMs | null;
  expiresAt: UtcEpochMs | null;
}

export interface SandboxParentV2 {
  family: "SANDBOX";
  header: ParentHeaderV2;
  acceptedManagerFacts: AbsentSectionV2;
  anchors: {
    deploymentId: string;
    portfolioId: string;
    environment: "SANDBOX";
    associationBasis: "CURRENT_NATIVE_TARGET_CORRESPONDENCE";
    capturedEnvironmentAttested: false;
  };
  certification: {
    certificationId: string;
    workflowState: (typeof CERTIFICATION_STATES)[number];
    workflowVersion: number;
    policyVersion: string;
    formulaVersion: string;
    createdAt: UtcEpochMs;
    updatedAt: UtcEpochMs;
    submittedAt: UtcEpochMs | null;
    decidedAt: UtcEpochMs | null;
    sourceIntegrationState: "UNAVAILABLE" | "SHADOW";
    deliveryProfile: "fixture" | "shadow";
  };
  steps: SectionV2<{ basis: "CURRENT_LATEST_STORED"; items: readonly CertificationStepV2[] }>;
  lineage: SectionV2<{
    basis: "STORED_PORTAL_REFERENCE";
    promotionGrantId: string;
    paperExitReviewId: string;
    r1ApprovalId: string;
    r2ApprovalId: string;
  }>;
  notPublished: NotPublishedV2;
}

/** A proposed cap: the exact string and its display pair. Proposed, never effective. */
export interface ProposedAmountV2 {
  exact: string;
  decimal: BoundaryDecimal;
}

export interface CanaryParentV2 {
  family: "CANARY";
  header: ParentHeaderV2;
  acceptedManagerFacts: AbsentSectionV2;
  anchors: {
    deploymentId: string;
    portfolioId: string;
    environment: "LIVE";
    associationBasis: "CURRENT_NATIVE_TARGET_CORRESPONDENCE";
    capturedEnvironmentAttested: false;
  };
  envelope: {
    envelopeId: string;
    revision: number;
    previousEnvelopeId: string | null;
    status: "DRAFT";
    expectedCertificationVersion: number;
    createdAt: UtcEpochMs;
    sourceIntegrationState: "UNAVAILABLE";
    deliveryProfile: "fixture";
    productionCommandActive: false;
  };
  proposal: SectionV2<{
    basis: "PROPOSED_NOT_EFFECTIVE";
    baseRiskProfileRevision: string;
    currency: string;
    capitalCap: ProposedAmountV2;
    grossNotionalCap: ProposedAmountV2;
    dailyLossCap: ProposedAmountV2;
    maxOpenOrders: number;
    durationDays: number;
  }>;
  lineage: SectionV2<{
    basis: "STORED_PORTAL_REFERENCE";
    certificationId: string;
    promotionPlanId: string;
    paperExitReviewId: string;
    r1ApprovalId: string;
    r2ApprovalId: string;
  }>;
  notPublished: NotPublishedV2;
}

/**
 * The stored Live gate. It carries the approval and nothing else: no portfolio,
 * no R1/R2 predecessor, no canary reference, no governance backbone.
 */
export interface LiveParentV2 {
  family: "LIVE_GATE";
  header: ParentHeaderV2;
  anchors: { deploymentId: string; environment: "LIVE" };
  approval: ApprovalV2 & { gate: "LIVE_GATE" };
  acceptedManagerFacts: AbsentSectionV2;
  notPublished: NotPublishedV2;
}

export interface OperationParentV2 {
  family: "R2" | "PAPER_EXIT";
  header: ParentHeaderV2;
  anchors: { deploymentId: string; portfolioId: string; environment: "PAPER" };
  approval: ApprovalV2;
  operation: {
    operationId: string;
    commandType: "GOVERNANCE_R2_DECISION" | "GOVERNANCE_PAPER_EXIT_DECISION";
    commandVersion: 1;
    /** The version the plan captured, not the approval's current one. */
    expectedVersion: number;
    /** Stored Portal state; APPLIED is not Trading System acceptance. */
    status: (typeof OPERATION_STATUSES)[number];
    decision: (typeof R2_DECISIONS)[number] | (typeof EXIT_DECISIONS)[number];
    /** The captured R1 parent, all three or none (always none for Paper Exit). */
    capturedParent: { approvalId: string; approvalVersion: number; evidenceSetHash: string } | null;
    createdAt: UtcEpochMs;
    expiresAt: UtcEpochMs;
    appliedAt: UtcEpochMs | null;
  };
  notPublished: NotPublishedV2;
}

export type GovernanceParentV2 =
  | R2ParentV2
  | PaperExitParentV2
  | SandboxParentV2
  | CanaryParentV2
  | LiveParentV2
  | OperationParentV2;

/* ── what no parent body carries ──────────────────────────────────────────── */

const APPROVAL_GAPS = {
  creator: "FE-030",
  ladder: "FE-030",
  decisionCall: "FE-030",
} as const;

const R2_NOT_PUBLISHED: NotPublishedV2 = {
  ...APPROVAL_GAPS,
  criteria: "FE-028",
  capitalRows: "FE-030",
  r1State: "FE-028",
  r1DecidedBy: "FE-030",
  r1Expiry: "FE-028",
};
const EXIT_NOT_PUBLISHED: NotPublishedV2 = {
  ...APPROVAL_GAPS,
  criteriaLabel: "FE-028",
  observedAndLimit: "FE-028",
  gateVerdict: "FE-028",
  chart: "FE-029",
};
const LIVE_NOT_PUBLISHED: NotPublishedV2 = {
  ...APPROVAL_GAPS,
  criteria: "FE-028",
  governanceBackbone: "FE-028",
  canaryBranches: "FE-029",
  liveFacts: "FE-029",
  chart: "FE-029",
};
const FOLLOWING_NOT_PUBLISHED: NotPublishedV2 = {
  criteria: "FE-028",
  chart: "FE-029",
  decisionCall: "FE-030",
};
const OPERATION_NOT_PUBLISHED: NotPublishedV2 = {
  receiptRef: "FE-030",
  operationLink: "FE-030",
  creator: "FE-030",
};

/* ── strict helpers ───────────────────────────────────────────────────────── */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null;
}

/** The object, only when it has exactly `keys` (the schemas are closed). */
function closed(value: unknown, keys: readonly string[]): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  const own = Object.keys(r);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(r, key)) ? r : null;
}

const ID = /^[A-Za-z0-9._:-]{1,191}$/;
const SHA = /^sha256:[0-9a-f]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const REASON = /^[A-Z][A-Z0-9_]{0,127}$/;

function id(value: unknown): string | null {
  return typeof value === "string" && ID.test(value) ? value : null;
}
function sha(value: unknown): string | null {
  return typeof value === "string" && SHA.test(value) ? value : null;
}
/** Free text the schema bounds (workspace, policy and formula versions): non-empty, no control characters. */
function text(value: unknown, max = 191): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max && !CONTROL.test(value) ? value : null;
}
function reason(value: unknown): string | null {
  return typeof value === "string" && REASON.test(value) ? value : null;
}
function version(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}
function natural(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}
/**
 * Exactly `false`. Spelled as a function so the contract flags it guards
 * (`production_command_active`) are not read with a bare `!== false` here while
 * V1 reads the same field with `=== true`: failClosed.test.ts holds one operator
 * per field, and this reader's rule is stricter than either (refuse anything
 * that is not literally false).
 */
const isFalse = (value: unknown): boolean => value === false;

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}
/** Epoch milliseconds, never before 1970: every published clock in these schemas has `minimum: 0`. */
function ms(value: unknown): UtcEpochMs | null {
  const at = readUtcEpochMs(value);
  return at !== null && at >= 0 ? at : null;
}
function msOrNull(value: unknown): UtcEpochMs | null | undefined {
  return value === null ? null : ms(value) ?? undefined;
}
/**
 * A nullable field: `null` is the published "not set", a good value is itself,
 * and a PRESENT BAD value is `undefined`, which every caller refuses. Writing
 * `x === null ? null : read(x)` and testing the result for `undefined` reads a
 * wrong-typed value as absent, because `read` answers `null` for a bad value (GP-3).
 */
function nullable<T>(value: unknown, read: (v: unknown) => T | null): T | null | undefined {
  return value === null ? null : read(value) ?? undefined;
}
/** `workspace_id`: schema string, minLength 3, maxLength 96 (every parent schema); control characters stay refused. */
function workspace(value: unknown): string | null {
  return typeof value === "string" && value.length >= 3 ? text(value, 96) : null;
}
/** Canary `proposal.currency`: schema pattern ^[A-Z0-9]{2,12}$. */
function currencyCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z0-9]{2,12}$/.test(value) ? value : null;
}

/* ── shared sections ──────────────────────────────────────────────────────── */

type SourceFlags = "runtime" | "promotion";

function readSource(value: unknown, flags: readonly SourceFlags[]): ParentSourceV2 | null {
  const keys = ["authority", "source_verdict", "source_side_effect_requested"];
  if (flags.includes("runtime")) keys.push("runtime_activation_requested");
  if (flags.includes("promotion")) keys.push("promotion_execution_requested");
  const s = closed(value, keys);
  if (s === null || s.authority !== "PORTAL" || s.source_verdict !== "NOT_ASSERTED" || s.source_side_effect_requested !== false) return null;
  if (flags.includes("runtime") && s.runtime_activation_requested !== false) return null;
  if (flags.includes("promotion") && s.promotion_execution_requested !== false) return null;
  const source: ParentSourceV2 = { authority: "PORTAL", sourceVerdict: "NOT_ASSERTED", sourceSideEffectRequested: false };
  if (flags.includes("runtime")) source.runtimeActivationRequested = false;
  if (flags.includes("promotion")) source.promotionExecutionRequested = false;
  return source;
}

function readHeader(r: Rec, flags: readonly SourceFlags[]): ParentHeaderV2 | null {
  const workspaceId = workspace(r.workspace_id);
  const observedAt = ms(r.observed_at_ms);
  const source = readSource(r.source, flags);
  if (
    workspaceId === null || observedAt === null || source === null || r.record_authority !== "PORTAL"
    || r.provenance_basis !== "CURRENT_CORE_BASELINE" || r.field_contract_revision !== PARENT_FIELDS_REVISION
  ) return null;
  return {
    workspaceId, recordAuthority: "PORTAL", provenanceBasis: "CURRENT_CORE_BASELINE",
    fieldContractRevision: PARENT_FIELDS_REVISION, observedAt, source,
  };
}

function readApproval<G extends "R2" | "PAPER_EXIT" | "LIVE_GATE">(value: unknown, gate: G): (ApprovalV2 & { gate: G }) | null {
  const a = closed(value, [
    "approval_id", "gate", "status", "approval_version", "policy_version", "quorum_required", "quorum_met",
    "evidence_complete", "created_at_ms", "updated_at_ms", "sla_due_at_ms", "expires_at_ms", "decided_at_ms",
  ]);
  if (a === null || a.gate !== gate) return null;
  const approvalId = id(a.approval_id);
  const status = oneOf(a.status, APPROVAL_STATUSES_V2);
  const approvalVersion = version(a.approval_version);
  const policyVersion = text(a.policy_version);
  const quorumRequired = version(a.quorum_required); // schema minimum 1
  const quorumMet = natural(a.quorum_met);
  const evidenceComplete = bool(a.evidence_complete);
  const createdAt = ms(a.created_at_ms);
  const updatedAt = ms(a.updated_at_ms);
  const slaDueAt = ms(a.sla_due_at_ms);
  const expiresAt = ms(a.expires_at_ms);
  const decidedAt = msOrNull(a.decided_at_ms);
  if (
    approvalId === null || status === null || approvalVersion === null || policyVersion === null || quorumRequired === null
    || quorumMet === null || evidenceComplete === null || createdAt === null || updatedAt === null || slaDueAt === null
    || expiresAt === null || decidedAt === undefined
  ) return null;
  // The schema's runtime relations ("updated/expires/SLA/nonnull decided >= created"): an approval
  // never updates, is due, expires or is decided before it was created.
  if (updatedAt < createdAt || expiresAt < createdAt || slaDueAt < createdAt || (decidedAt !== null && decidedAt < createdAt)) return null;
  return {
    approvalId, gate, status, approvalVersion, policyVersion, quorumRequired, quorumMet, evidenceComplete,
    createdAt, updatedAt, slaDueAt, expiresAt, decidedAt,
  };
}

function readAbsent(value: unknown, code?: string): AbsentSectionV2 | null {
  const a = closed(value, ["availability", "reason_code"]);
  if (a === null || a.availability !== "NOT_PUBLISHED") return null;
  const reasonCode = reason(a.reason_code);
  if (reasonCode === null || (code !== undefined && reasonCode !== code)) return null;
  return { availability: "NOT_PUBLISHED", reasonCode };
}

const NOT_QUALIFIED = "PARENT_FIELD_PURPOSE_NOT_QUALIFIED";
const MANAGER_FACTS_REASON = "PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION";

/** An optional section: its `AVAILABLE` branch is read by `available`, its absence is the one published branch. */
function section<T>(value: unknown, available: (r: Rec) => T | null, keys: readonly string[]): SectionV2<T> | null {
  const r = rec(value);
  if (r === null) return null;
  if (r.availability === "NOT_PUBLISHED") return readAbsent(value, NOT_QUALIFIED);
  if (r.availability !== "AVAILABLE") return null;
  const body = closed(value, keys);
  if (body === null) return null;
  const read = available(body);
  return read === null ? null : { availability: "AVAILABLE", ...read };
}

function readManagerFacts(value: unknown): AbsentSectionV2 | null {
  return readAbsent(value, MANAGER_FACTS_REASON);
}

/* ── R2 ───────────────────────────────────────────────────────────────────── */

const R2_KEYS = [
  "schema_version", "workspace_id", "record_authority", "provenance_basis", "field_contract_revision", "observed_at_ms",
  "source", "anchors", "approval", "family", "lineage",
];

function readParentAnchors(value: unknown): { deploymentId: string; portfolioId: string; environment: "PAPER" } | null {
  const a = closed(value, ["deployment_id", "portfolio_id", "environment"]);
  if (a === null || a.environment !== "PAPER") return null;
  const deploymentId = id(a.deployment_id); // schema pattern ^[A-Za-z0-9._:-]+$, maxLength 191
  const portfolioId = id(a.portfolio_id);
  return deploymentId === null || portfolioId === null ? null : { deploymentId, portfolioId, environment: "PAPER" };
}

/** `GET /governance/approvals/{id}/r2` when the workspace is SCOPED_V2. */
export function readR2ParentV2(raw: unknown): R2ParentV2 | null {
  const r = closed(raw, R2_KEYS);
  if (r === null || r.schema_version !== GOVERNANCE_PARENT_V2_SCHEMA || r.family !== "R2") return null;
  const header = readHeader(r, []);
  const anchors = readParentAnchors(r.anchors);
  const approval = readApproval(r.approval, "R2");
  const lineage = section<Omit<R2LineageV2, never>>(r.lineage, (l) => {
    const r1ApprovalId = id(l.r1_approval_id);
    const observedRiskGrantId = id(l.observed_risk_grant_id);
    const currency = text(l.currency, 64);
    return l.basis !== "STORED_IMMUTABLE_REFERENCE" || r1ApprovalId === null || observedRiskGrantId === null || currency === null
      ? null
      : { basis: "STORED_IMMUTABLE_REFERENCE", r1ApprovalId, observedRiskGrantId, currency };
  }, ["availability", "basis", "r1_approval_id", "observed_risk_grant_id", "currency"]);
  if (header === null || anchors === null || approval === null || lineage === null) return null;
  return { family: "R2", header, anchors, approval, lineage: lineage as SectionV2<R2LineageV2>, notPublished: R2_NOT_PUBLISHED };
}

/* ── Paper Exit ───────────────────────────────────────────────────────────── */

const EXIT_KEYS = [...R2_KEYS, "review", "evaluation"];

function readExitPanel(value: unknown): ExitPanelV2 | null {
  const p = closed(value, [
    "panel_id", "ordinal", "panel_kind", "source_authority", "panel_state", "as_of_ms", "freshness_state",
    "source_completeness", "poll_interval_ms", "formula_version",
  ]);
  if (p === null) return null;
  const panelId = id(p.panel_id);
  const ordinal = natural(p.ordinal);
  const panelKind = oneOf(p.panel_kind, PANEL_KINDS_V2);
  const sourceAuthority = oneOf(p.source_authority, SOURCE_AUTHORITIES);
  const panelState = oneOf(p.panel_state, PANEL_STATES_V2);
  const asOf = msOrNull(p.as_of_ms);
  const freshness = oneOf(p.freshness_state, FRESHNESS);
  const sourceCompleteness = oneOf(p.source_completeness, COMPLETENESS);
  const poll = nullable(p.poll_interval_ms, (v) => natural(v, 3_600_000));
  const formulaVersion = nullable(p.formula_version, (v) => text(v));
  if (
    panelId === null || ordinal === null || panelKind === null || sourceAuthority === null || panelState === null
    || asOf === undefined || freshness === null || sourceCompleteness === null || poll === undefined
    || (poll !== null && poll < 100) || formulaVersion === undefined
  ) return null;
  // The schema's conditionals: a fresh panel has a clock; only a polled panel has an interval.
  if (freshness === "OK" && asOf === null) return null;
  if ((sourceCompleteness === "POLL_BOUNDED") !== (poll !== null)) return null;
  return { panelId, ordinal, panelKind, sourceAuthority, panelState, asOf, freshness, sourceCompleteness, pollIntervalMs: poll, formulaVersion };
}

function readExitFinding(value: unknown): ExitFindingV2 | null {
  const f = closed(value, ["finding_id", "panel_id", "ordinal", "outcome", "blocking", "required", "as_of_ms"]);
  if (f === null) return null;
  const findingId = id(f.finding_id);
  const panelId = id(f.panel_id);
  const ordinal = natural(f.ordinal);
  const outcome = oneOf(f.outcome, FINDING_OUTCOMES_V2);
  const blocking = bool(f.blocking);
  const required = bool(f.required);
  const asOf = msOrNull(f.as_of_ms);
  return findingId === null || panelId === null || ordinal === null || outcome === null || blocking === null || required === null || asOf === undefined
    ? null
    : { findingId, panelId, ordinal, outcome, blocking, required, asOf };
}

function readEvaluation(r: Rec): ExitEvaluationV2 | null {
  const evaluationPolicyVersion = text(r.evaluation_policy_version);
  const evaluationFormulaVersion = text(r.evaluation_formula_version);
  if (evaluationPolicyVersion === null || evaluationFormulaVersion === null) return null;
  if (!Array.isArray(r.panels) || r.panels.length > 4 || !Array.isArray(r.findings) || r.findings.length > 256) return null;
  const panels: ExitPanelV2[] = [];
  for (const entry of r.panels) {
    const panel = readExitPanel(entry);
    if (panel === null) return null;
    panels.push(panel);
  }
  const findings: ExitFindingV2[] = [];
  for (const entry of r.findings) {
    const finding = readExitFinding(entry);
    if (finding === null) return null;
    findings.push(finding);
  }
  // One panel per id and per kind; a finding names a panel that is in the list.
  const panelIds = new Set(panels.map((panel) => panel.panelId));
  const kinds = new Set(panels.map((panel) => panel.panelKind));
  const findingIds = new Set(findings.map((finding) => finding.findingId));
  if (panelIds.size !== panels.length || kinds.size !== panels.length || findingIds.size !== findings.length) return null;
  if (findings.some((finding) => !panelIds.has(finding.panelId))) return null;
  return { evaluationPolicyVersion, evaluationFormulaVersion, panels, findings };
}

/** `GET /governance/exit-reviews/{id}` when the workspace is SCOPED_V2. */
export function readPaperExitParentV2(raw: unknown): PaperExitParentV2 | null {
  const r = closed(raw, EXIT_KEYS);
  if (r === null || r.schema_version !== GOVERNANCE_PARENT_V2_SCHEMA || r.family !== "PAPER_EXIT") return null;
  const header = readHeader(r, []);
  const anchors = readParentAnchors(r.anchors);
  const approval = readApproval(r.approval, "PAPER_EXIT");
  const review = closed(r.review, [
    "review_id", "review_state", "review_version", "promote_to", "extension_days", "extended_until_ms", "created_at_ms", "updated_at_ms",
  ]);
  const evaluation = section<ExitEvaluationV2>(
    r.evaluation,
    (e) => readEvaluation(e),
    ["availability", "evaluation_policy_version", "evaluation_formula_version", "panels", "findings"],
  );
  const lineage = section<Omit<ExitLineageV2, never>>(r.lineage, (l) => {
    const r1ApprovalId = id(l.r1_approval_id);
    const r2ApprovalId = id(l.r2_approval_id);
    const sourceSnapshotHash = sha(l.source_snapshot_hash);
    const evidenceSetHash = sha(l.evidence_set_hash);
    return l.basis !== "VERIFIED_CURRENT_STORED_BYTES_NOT_SOURCE_ACCEPTANCE" || r1ApprovalId === null || r2ApprovalId === null
      || sourceSnapshotHash === null || evidenceSetHash === null
      ? null
      : { basis: "VERIFIED_CURRENT_STORED_BYTES_NOT_SOURCE_ACCEPTANCE", r1ApprovalId, r2ApprovalId, sourceSnapshotHash, evidenceSetHash };
  }, ["availability", "basis", "r1_approval_id", "r2_approval_id", "source_snapshot_hash", "evidence_set_hash"]);
  if (header === null || anchors === null || approval === null || review === null || evaluation === null || lineage === null) return null;

  const reviewId = id(review.review_id);
  const reviewState = oneOf(review.review_state, REVIEW_STATES_V2);
  const reviewVersion = version(review.review_version);
  const createdAt = ms(review.created_at_ms);
  const updatedAt = ms(review.updated_at_ms);
  const extendedUntil = msOrNull(review.extended_until_ms);
  if (
    reviewId === null || reviewState === null || reviewVersion === null || review.promote_to !== "SANDBOX_VALIDATION"
    || createdAt === null || updatedAt === null || extendedUntil === undefined || updatedAt < createdAt
  ) return null;
  // The review is the approval's own record, and an extension exists exactly when the state says so.
  if (reviewId !== approval.approvalId) return null;
  const extensionDays = review.extension_days;
  if (reviewState === "EXTENDED" ? extensionDays !== 14 || extendedUntil === null : extensionDays !== null || extendedUntil !== null) return null;

  return {
    family: "PAPER_EXIT", header, anchors, approval,
    review: {
      reviewId, reviewState, reviewVersion, promoteTo: "SANDBOX_VALIDATION",
      extensionDays: extensionDays === 14 ? 14 : null, extendedUntil, createdAt, updatedAt,
    },
    evaluation: evaluation as SectionV2<ExitEvaluationV2>,
    lineage: lineage as SectionV2<ExitLineageV2>,
    notPublished: EXIT_NOT_PUBLISHED,
  };
}

/* ── Live ─────────────────────────────────────────────────────────────────── */

const LIVE_KEYS = [
  "schema_version", "family", "workspace_id", "record_authority", "provenance_basis", "field_contract_revision",
  "observed_at_ms", "anchors", "source", "approval", "accepted_manager_facts",
];

/** `GET /governance/approvals/{id}/live` when the workspace is SCOPED_V2. */
export function readLiveParentV2(raw: unknown): LiveParentV2 | null {
  const r = closed(raw, LIVE_KEYS);
  if (r === null || r.schema_version !== LIVE_PARENT_V2_SCHEMA || r.family !== "LIVE_GATE") return null;
  const header = readHeader(r, ["runtime"]);
  const anchors = closed(r.anchors, ["deployment_id", "environment"]);
  const approval = readApproval(r.approval, "LIVE_GATE");
  const acceptedManagerFacts = readManagerFacts(r.accepted_manager_facts);
  const deploymentId = id(anchors?.deployment_id);
  if (header === null || anchors === null || anchors.environment !== "LIVE" || deploymentId === null || approval === null || acceptedManagerFacts === null) return null;
  return {
    family: "LIVE_GATE", header, anchors: { deploymentId, environment: "LIVE" }, approval, acceptedManagerFacts,
    notPublished: LIVE_NOT_PUBLISHED,
  };
}

/* ── following parents: Sandbox and Canary ────────────────────────────────── */

const FOLLOWING_FLAGS: readonly SourceFlags[] = ["runtime", "promotion"];
const SANDBOX_KEYS = [
  "schema_version", "workspace_id", "record_authority", "provenance_basis", "field_contract_revision", "observed_at_ms",
  "source", "accepted_manager_facts", "family", "anchors", "certification", "steps", "lineage",
];
const CANARY_KEYS = [
  "schema_version", "workspace_id", "record_authority", "provenance_basis", "field_contract_revision", "observed_at_ms",
  "source", "accepted_manager_facts", "family", "anchors", "envelope", "proposal", "lineage",
];

function readStep(value: unknown): CertificationStepV2 | null {
  const s = closed(value, ["step_key", "availability", "evidence_id", "stored_evaluation_state", "source_authority", "source_verification_state", "as_of_ms", "expires_at_ms"]);
  if (s === null) return null;
  const stepKey = oneOf(s.step_key, STEP_KEYS);
  const availability = oneOf(s.availability, ["AVAILABLE", "NOT_RECORDED"] as const);
  if (stepKey === null || availability === null) return null;
  if (availability === "NOT_RECORDED") {
    // No evidence stored: the rest is null, not "failed" and not "not yet".
    return ["evidence_id", "stored_evaluation_state", "source_authority", "source_verification_state", "as_of_ms", "expires_at_ms"].every((key) => s[key] === null)
      ? { stepKey, recorded: false, evidenceId: null, storedEvaluation: null, sourceAuthority: null, sourceVerification: null, asOf: null, expiresAt: null }
      : null;
  }
  const evidenceId = id(s.evidence_id);
  const storedEvaluation = oneOf(s.stored_evaluation_state, STEP_EVALUATIONS);
  const sourceAuthority = oneOf(s.source_authority, ["PORTAL", "EXECUTION", "BROKER", "DERIVED"] as const);
  const sourceVerification = oneOf(s.source_verification_state, ["VERIFIED", "UNAVAILABLE"] as const);
  const asOf = msOrNull(s.as_of_ms);
  const expiresAt = msOrNull(s.expires_at_ms);
  return evidenceId === null || storedEvaluation === null || sourceAuthority === null || sourceVerification === null || asOf === undefined || expiresAt === undefined
    ? null
    : { stepKey, recorded: true, evidenceId, storedEvaluation, sourceAuthority, sourceVerification, asOf, expiresAt };
}

/** `GET /deployments/{id}/certification` when the workspace is SCOPED_V2. */
export function readSandboxParentV2(raw: unknown): SandboxParentV2 | null {
  const r = closed(raw, SANDBOX_KEYS);
  if (r === null || r.schema_version !== FOLLOWING_PARENT_V2_SCHEMA || r.family !== "SANDBOX") return null;
  const header = readHeader(r, FOLLOWING_FLAGS);
  const acceptedManagerFacts = readManagerFacts(r.accepted_manager_facts);
  const a = closed(r.anchors, ["deployment_id", "portfolio_id", "environment", "association_basis", "captured_environment_attested"]);
  const c = closed(r.certification, [
    "certification_id", "workflow_state", "workflow_version", "policy_version", "formula_version", "created_at_ms",
    "updated_at_ms", "submitted_at_ms", "decided_at_ms", "source_integration_state", "delivery_profile",
  ]);
  const steps = section<{ basis: "CURRENT_LATEST_STORED"; items: readonly CertificationStepV2[] }>(r.steps, (s) => {
    if (s.basis !== "CURRENT_LATEST_STORED" || !Array.isArray(s.items) || s.items.length !== STEP_KEYS.length) return null;
    const items: CertificationStepV2[] = [];
    for (const [index, entry] of s.items.entries()) {
      const step = readStep(entry);
      // Seven steps, once each, in the published order.
      if (step === null || step.stepKey !== STEP_KEYS[index]) return null;
      items.push(step);
    }
    return { basis: "CURRENT_LATEST_STORED", items };
  }, ["availability", "basis", "items"]);
  const lineage = section(r.lineage, (l) => {
    const promotionGrantId = id(l.promotion_grant_id);
    const paperExitReviewId = id(l.paper_exit_review_id);
    const r1ApprovalId = id(l.r1_approval_id);
    const r2ApprovalId = id(l.r2_approval_id);
    return l.basis !== "STORED_PORTAL_REFERENCE" || promotionGrantId === null || paperExitReviewId === null || r1ApprovalId === null || r2ApprovalId === null
      ? null
      : { basis: "STORED_PORTAL_REFERENCE" as const, promotionGrantId, paperExitReviewId, r1ApprovalId, r2ApprovalId };
  }, ["availability", "basis", "promotion_grant_id", "paper_exit_review_id", "r1_approval_id", "r2_approval_id"]);
  if (header === null || acceptedManagerFacts === null || a === null || c === null || steps === null || lineage === null) return null;

  const deploymentId = id(a.deployment_id);
  const portfolioId = id(a.portfolio_id);
  if (
    deploymentId === null || portfolioId === null || a.environment !== "SANDBOX"
    || a.association_basis !== "CURRENT_NATIVE_TARGET_CORRESPONDENCE" || a.captured_environment_attested !== false
  ) return null;
  const certificationId = id(c.certification_id);
  const workflowState = oneOf(c.workflow_state, CERTIFICATION_STATES);
  const workflowVersion = version(c.workflow_version);
  const policyVersion = text(c.policy_version);
  const formulaVersion = text(c.formula_version);
  const createdAt = ms(c.created_at_ms);
  const updatedAt = ms(c.updated_at_ms);
  const submittedAt = msOrNull(c.submitted_at_ms);
  const decidedAt = msOrNull(c.decided_at_ms);
  const sourceIntegrationState = oneOf(c.source_integration_state, ["UNAVAILABLE", "SHADOW"] as const);
  const deliveryProfile = oneOf(c.delivery_profile, ["fixture", "shadow"] as const);
  if (
    certificationId === null || workflowState === null || workflowVersion === null || policyVersion === null || formulaVersion === null
    || createdAt === null || updatedAt === null || submittedAt === undefined || decidedAt === undefined
    || sourceIntegrationState === null || deliveryProfile === null
  ) return null;
  // The schema's relations: updated >= created, submitted >= created, decided >= submitted.
  if (updatedAt < createdAt || (submittedAt !== null && submittedAt < createdAt) || (decidedAt !== null && (submittedAt === null || decidedAt < submittedAt))) return null;
  // The schema's if/then rules: only DRAFT has no submit clock, and only APPROVED / DENIED carry a decision clock.
  if ((workflowState === "DRAFT") !== (submittedAt === null)) return null;
  if ((workflowState === "APPROVED" || workflowState === "DENIED") !== (decidedAt !== null)) return null;

  return {
    family: "SANDBOX", header, acceptedManagerFacts,
    anchors: { deploymentId, portfolioId, environment: "SANDBOX", associationBasis: "CURRENT_NATIVE_TARGET_CORRESPONDENCE", capturedEnvironmentAttested: false },
    certification: {
      certificationId, workflowState, workflowVersion, policyVersion, formulaVersion, createdAt, updatedAt, submittedAt, decidedAt,
      sourceIntegrationState, deliveryProfile,
    },
    steps: steps as SandboxParentV2["steps"],
    lineage: lineage as SandboxParentV2["lineage"],
    notPublished: FOLLOWING_NOT_PUBLISHED,
  };
}

function amount(value: unknown): ProposedAmountV2 | null {
  if (typeof value !== "string") return null;
  const decimal = readDecimal(value, { unit: "money" });
  // A cap is positive, at most 20 integer and 18 fractional digits (the schema's words).
  if (decimal === null || decimal.zero || value.startsWith("-") || !/^\d{1,20}(\.\d{1,18})?$/.test(value)) return null;
  return { exact: value, decimal };
}

/** `GET /deployments/{id}/canary` when the workspace is SCOPED_V2. */
export function readCanaryParentV2(raw: unknown): CanaryParentV2 | null {
  const r = closed(raw, CANARY_KEYS);
  if (r === null || r.schema_version !== FOLLOWING_PARENT_V2_SCHEMA || r.family !== "CANARY") return null;
  const header = readHeader(r, FOLLOWING_FLAGS);
  const acceptedManagerFacts = readManagerFacts(r.accepted_manager_facts);
  const a = closed(r.anchors, ["deployment_id", "portfolio_id", "environment", "association_basis", "captured_environment_attested"]);
  const e = closed(r.envelope, [
    "envelope_id", "revision", "previous_envelope_id", "status", "expected_certification_version", "created_at_ms",
    "source_integration_state", "delivery_profile", "production_command_active",
  ]);
  const proposal = section(r.proposal, (p) => {
    const baseRiskProfileRevision = text(p.base_risk_profile_revision);
    const currency = currencyCode(p.currency);
    const capitalCap = amount(p.capital_cap);
    const grossNotionalCap = amount(p.gross_notional_cap);
    const dailyLossCap = amount(p.daily_loss_cap);
    const maxOpenOrders = version(p.max_open_orders);
    const durationDays = version(p.duration_days);
    return p.basis !== "PROPOSED_NOT_EFFECTIVE" || baseRiskProfileRevision === null || currency === null || capitalCap === null
      || grossNotionalCap === null || dailyLossCap === null || maxOpenOrders === null || durationDays === null
      ? null
      : { basis: "PROPOSED_NOT_EFFECTIVE" as const, baseRiskProfileRevision, currency, capitalCap, grossNotionalCap, dailyLossCap, maxOpenOrders, durationDays };
  }, ["availability", "basis", "base_risk_profile_revision", "currency", "capital_cap", "gross_notional_cap", "daily_loss_cap", "max_open_orders", "duration_days"]);
  const lineage = section(r.lineage, (l) => {
    const certificationId = id(l.certification_id);
    const promotionPlanId = id(l.promotion_plan_id);
    const paperExitReviewId = id(l.paper_exit_review_id);
    const r1ApprovalId = id(l.r1_approval_id);
    const r2ApprovalId = id(l.r2_approval_id);
    return l.basis !== "STORED_PORTAL_REFERENCE" || certificationId === null || promotionPlanId === null || paperExitReviewId === null
      || r1ApprovalId === null || r2ApprovalId === null
      ? null
      : { basis: "STORED_PORTAL_REFERENCE" as const, certificationId, promotionPlanId, paperExitReviewId, r1ApprovalId, r2ApprovalId };
  }, ["availability", "basis", "certification_id", "promotion_plan_id", "paper_exit_review_id", "r1_approval_id", "r2_approval_id"]);
  if (header === null || acceptedManagerFacts === null || a === null || e === null || proposal === null || lineage === null) return null;

  const deploymentId = id(a.deployment_id);
  const portfolioId = id(a.portfolio_id);
  if (
    deploymentId === null || portfolioId === null || a.environment !== "LIVE"
    || a.association_basis !== "CURRENT_NATIVE_TARGET_CORRESPONDENCE" || a.captured_environment_attested !== false
  ) return null;
  const envelopeId = id(e.envelope_id);
  const revision = version(e.revision);
  const previousEnvelopeId = nullable(e.previous_envelope_id, id);
  const expectedCertificationVersion = version(e.expected_certification_version);
  const createdAt = ms(e.created_at_ms);
  if (
    envelopeId === null || revision === null || previousEnvelopeId === undefined || expectedCertificationVersion === null || createdAt === null
    || e.status !== "DRAFT" || e.source_integration_state !== "UNAVAILABLE" || e.delivery_profile !== "fixture" || !isFalse(e.production_command_active)
  ) return null;
  // A first revision has no predecessor; every later one names it.
  if ((revision === 1) !== (previousEnvelopeId === null)) return null;

  return {
    family: "CANARY", header, acceptedManagerFacts,
    anchors: { deploymentId, portfolioId, environment: "LIVE", associationBasis: "CURRENT_NATIVE_TARGET_CORRESPONDENCE", capturedEnvironmentAttested: false },
    envelope: {
      envelopeId, revision, previousEnvelopeId, status: "DRAFT", expectedCertificationVersion, createdAt,
      sourceIntegrationState: "UNAVAILABLE", deliveryProfile: "fixture", productionCommandActive: false,
    },
    proposal: proposal as CanaryParentV2["proposal"],
    lineage: lineage as CanaryParentV2["lineage"],
    notPublished: FOLLOWING_NOT_PUBLISHED,
  };
}

/* ── operation parents ────────────────────────────────────────────────────── */

const OPERATION_KEYS = [
  "schema_version", "workspace_id", "record_authority", "provenance_basis", "field_contract_revision", "observed_at_ms",
  "source", "anchors", "approval", "operation_id", "command_version", "expected_version", "status", "parent_approval_id",
  "parent_approval_version", "parent_evidence_set_hash", "created_at_ms", "expires_at_ms", "applied_at_ms", "family",
  "command_type", "decision",
];

/** `GET /operations/{id}` for an R2 or Paper Exit decision when the workspace is SCOPED_V2. */
export function readOperationParentV2(raw: unknown): OperationParentV2 | null {
  const r = closed(raw, OPERATION_KEYS);
  if (r === null || r.schema_version !== GOVERNANCE_PARENT_OPERATION_V2_SCHEMA) return null;
  const family = oneOf(r.family, ["R2", "PAPER_EXIT"] as const);
  if (family === null) return null;
  const header = readHeader(r, []);
  const anchors = readParentAnchors(r.anchors);
  const approval = readApproval(r.approval, family);
  const operationId = id(r.operation_id);
  const expectedVersion = version(r.expected_version);
  const status = oneOf(r.status, OPERATION_STATUSES);
  const createdAt = ms(r.created_at_ms);
  const expiresAt = ms(r.expires_at_ms);
  const appliedAt = msOrNull(r.applied_at_ms);
  if (
    header === null || anchors === null || approval === null || operationId === null || expectedVersion === null || status === null
    || createdAt === null || expiresAt === null || appliedAt === undefined || r.command_version !== 1 || expiresAt < createdAt
  ) return null;
  // `applied_at_ms` exists exactly when the stored state is APPLIED, and not before the plan was made.
  if ((status === "APPLIED") !== (appliedAt !== null) || (appliedAt !== null && appliedAt < createdAt)) return null;

  const commandType = family === "R2" ? "GOVERNANCE_R2_DECISION" : "GOVERNANCE_PAPER_EXIT_DECISION";
  const decision = family === "R2" ? oneOf(r.decision, R2_DECISIONS) : oneOf(r.decision, EXIT_DECISIONS);
  if (r.command_type !== commandType || decision === null) return null;

  // The captured R1 parent: all three or none; a Paper Exit plan never captures one.
  const pinId = r.parent_approval_id;
  const pinVersion = r.parent_approval_version;
  const pinHash = r.parent_evidence_set_hash;
  let capturedParent: OperationParentV2["operation"]["capturedParent"] = null;
  if (pinId !== null || pinVersion !== null || pinHash !== null) {
    const parentId = id(pinId);
    const parentVersion = version(pinVersion);
    const evidenceSetHash = sha(pinHash);
    if (family !== "R2" || parentId === null || parentVersion === null || evidenceSetHash === null) return null;
    capturedParent = { approvalId: parentId, approvalVersion: parentVersion, evidenceSetHash };
  }

  return {
    family, header, anchors, approval,
    operation: { operationId, commandType, commandVersion: 1, expectedVersion, status, decision, capturedParent, createdAt, expiresAt, appliedAt },
    notPublished: OPERATION_NOT_PUBLISHED,
  };
}

/* ── any parent ───────────────────────────────────────────────────────────── */

/** Any V2 parent body, routed by `schema_version` and `family`; `null` when it is none of them. */
export function readGovernanceParentV2(raw: unknown): GovernanceParentV2 | null {
  const body = rec(raw);
  switch (body?.schema_version) {
    case GOVERNANCE_PARENT_V2_SCHEMA:
      return body.family === "R2" ? readR2ParentV2(raw) : body.family === "PAPER_EXIT" ? readPaperExitParentV2(raw) : null;
    case GOVERNANCE_PARENT_OPERATION_V2_SCHEMA:
      return readOperationParentV2(raw);
    case FOLLOWING_PARENT_V2_SCHEMA:
      return body.family === "SANDBOX" ? readSandboxParentV2(raw) : body.family === "CANARY" ? readCanaryParentV2(raw) : null;
    case LIVE_PARENT_V2_SCHEMA:
      return readLiveParentV2(raw);
    default:
      return null;
  }
}
