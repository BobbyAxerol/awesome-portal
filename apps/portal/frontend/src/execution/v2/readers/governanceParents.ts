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
 * - what is not on the wire at all (R2 criteria label/observed/limit, capital
 *   rows, the ladder, the decision call and its receipt, a criterion comparator)
 *   is NOT invented here and not inferred from what is: `notPublished` names
 *   each such datum with the FE request that will publish it, so a screen
 *   prints `Not published (FE-xxx)` from data instead of a bare dash or a "no
 *   R1 lineage" claim the body disproves. Since Codex e19ad906 the R2 and Paper
 *   Exit parents also carry stored actor ids, the latest recorded plan, the
 *   recorded decisions, the R2 stored decision inputs, the R2 recorded verdicts
 *   and the Paper Exit criteria; each is a typed section (AVAILABLE, or absent
 *   with the server's reason), and a datum is in `notPublished` only while the
 *   section that would carry it is absent;
 * - the runtime-only relations the schema descriptions state (and
 *   `positive-parent.contract.ts` enforces) are applied here: unique panel
 *   ids, kinds and ordinals, finding and panel membership, recorded activity
 *   `version_after = version_before + 1` with unique ids and non-increasing
 *   clocks, strictly ascending evidence hashes and finding ordinals, a
 *   blocking verdict only FAIL or INSUFFICIENT, the stored decision inputs
 *   naming the parent's own workspace, approval and version;
 * - Portal timestamps are Portal lifecycle clocks, not source freshness, and a
 *   decimal crosses as the exact string (`readDecimal` over `readExactDecimal`);
 * - `APPLIED` on an operation is the stored Portal state, not Trading System
 *   acceptance, settlement or verification;
 * - every reader takes `unknown`, never throws, and answers a value or `null`.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import { readDecimal, type BoundaryDecimal } from "../boundary";
import { readScopedIdentityV2, type ScopedIdentityV2 } from "./scopedIdentity";

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
  actors: SectionV2<ActorsV2>;
  latestOperation: SectionV2<LatestOperationV2>;
  decisionContext: SectionV2<DecisionContextV2>;
  recordedActivity: SectionV2<RecordedActivityV2>;
  recordedVerdicts: SectionV2<RecordedVerdictsV2>;
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
 * One finding as the `evaluation` section publishes it: an outcome and two
 * flags. Its label, observed value and limit live in the `criteria` section
 * (`ExitCriterionV2`), not here.
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

/* ── sections added by Codex e19ad906 (R2 and Paper Exit parents) ────────── */

/** `{availability:"AVAILABLE", value}` or the typed absence with the server's reason; `value` is `null` only on the wire. */
export type ScalarV2<T> = { availability: "AVAILABLE"; value: T } | { availability: "NOT_PUBLISHED"; reasonCode: string };

/**
 * Stored Portal actor ids and whether each is the viewer. Not a role, not a
 * separation-of-duty verdict, not decision eligibility: the schema names the
 * basis `STORED_PORTAL_ACTOR_IDS_NOT_DECISION_AUTHORIZATION`. There is no
 * username on the wire, so none is shown.
 */
export interface ActorsV2 {
  basis: "STORED_PORTAL_ACTOR_IDS_NOT_DECISION_AUTHORIZATION";
  requesterUserId: string;
  artifactCreatorUserId: string;
  /** `null` = not decided yet; `viewerIsDecidedBy` is then `null` too. */
  decidedByUserId: string | null;
  viewerIsRequester: boolean;
  viewerIsArtifactCreator: boolean;
  viewerIsDecidedBy: boolean | null;
}

export const LATEST_OPERATION_ABSENCES = ["PARENT_FIELD_PURPOSE_NOT_QUALIFIED", "NO_RECORDED_PORTAL_OPERATION", "LATEST_RECORDED_OPERATION_NOT_PUBLIC"] as const;

/** The newest recorded Portal plan for this approval: its stored state is neither apply eligibility nor source settlement. */
export interface LatestOperationV2 {
  basis: "LATEST_RECORDED_PORTAL_PLAN_NOT_ACTION_ELIGIBILITY";
  operationId: string;
  commandVersion: 1;
  commandType: "GOVERNANCE_R2_DECISION" | "GOVERNANCE_PAPER_EXIT_DECISION";
  storedStatus: (typeof OPERATION_STATUSES)[number];
  createdAt: UtcEpochMs;
  orderBasis: "POSTGRES_CREATED_AT_DESC_OPERATION_ID_C_ASC";
}

/** The R2 inputs a decision plan would carry. Stored facts, never READY or action authorization. */
export interface DecisionContextV2 {
  basis: "VERIFIED_STORED_R2_INPUTS_NOT_ACTION_AUTHORIZATION";
  gate: "R2";
  workspaceId: string;
  approvalId: string;
  expectedApprovalVersion: number;
  evidenceSetHash: string;
  /** Strictly ascending; absent (never a truncated or empty list) above 128 hashes. */
  evidenceHashes: { availability: "AVAILABLE"; value: readonly string[] } | { availability: "NOT_PUBLISHED"; reasonCode: "EVIDENCE_HASH_LIMIT_EXCEEDED" };
  commandType: "GOVERNANCE_R2_DECISION";
  requestSchemaVersion: "governance.r2-decision-plan-request.v1";
  planPath: "/api/v1/execution/commands/plans";
  admission: { state: "NOT_EVALUATED"; reasonCode: "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN" };
  sourceSideEffectRequested: false;
}

export interface RecordedDecisionV2 {
  decisionId: string;
  operationId: string;
  versionBefore: number;
  versionAfter: number;
  decidedAt: UtcEpochMs;
  kind: "R2_DECISION_RECORDED" | "PAPER_EXIT_DECISION_RECORDED";
  decision: (typeof R2_DECISIONS)[number] | (typeof EXIT_DECISIONS)[number];
}

/** Bounded recent Portal decision rows, newest first. Not source, order or stage history, and not full history. */
export interface RecordedActivityV2 {
  basis: "IMMUTABLE_PORTAL_DECISION_ROWS_NOT_SOURCE_OR_STAGE_HISTORY";
  orderBasis: "POSTGRES_DECIDED_AT_DESC_DECISION_ID_C_ASC";
  coverage: "BOUNDED_RECENT_DECISIONS_NOT_FULL_HISTORY";
  limit: 32;
  /** More rows exist than the 32 shown. */
  hasMore: boolean;
  items: readonly RecordedDecisionV2[];
}

export const RECORDED_ACTIVITY_ABSENCES = ["PARENT_FIELD_PURPOSE_NOT_QUALIFIED", "RECORDED_ACTIVITY_NOT_PUBLIC"] as const;
export const RECORDED_VERDICT_ABSENCES = ["PARENT_FIELD_PURPOSE_NOT_QUALIFIED", "RECORDED_VERDICTS_NOT_PUBLIC"] as const;

/**
 * One stored R2 finding. The schema pins every structured criterion field
 * (criterion key, label, observed, limit, comparator, unit, currency) to the
 * typed absence `SOURCE_STRUCTURED_CRITERION_NOT_RECORDED`, so they are one
 * fact here (`structuredCriterion`), not seven nulls.
 */
export interface RecordedVerdictV2 {
  findingId: string;
  ordinal: number;
  outcome: FindingOutcomeV2;
  /** Only FAIL or INSUFFICIENT can block (the schema's if/then). */
  blocking: boolean;
  evaluatedAt: UtcEpochMs;
  structuredCriterion: { availability: "NOT_PUBLISHED"; reasonCode: "SOURCE_STRUCTURED_CRITERION_NOT_RECORDED" };
  sourceRef: { kind: "PORTAL_STORED_R2_FINDING"; approvalId: string; findingId: string; basis: "STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE" };
}

export interface RecordedVerdictsV2 {
  basis: "STORED_PORTAL_R2_FINDINGS_NOT_CURRENT_GATE_READINESS";
  orderBasis: "POSTGRES_ORDINAL_ASC_FINDING_ID_C_ASC";
  coverage: "BOUNDED_RECORDED_FINDINGS_NOT_FULL_CRITERIA_HISTORY";
  limit: 64;
  hasMore: boolean;
  items: readonly RecordedVerdictV2[];
  admission: { state: "NOT_EVALUATED"; reasonCode: "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN" };
}

export const PAPER_EXIT_LABEL_KEYS = {
  OBSERVATION_COVERAGE: "paper_exit.observation_coverage",
  DRIFT: "paper_exit.drift",
  LIMITS_HEALTH: "paper_exit.limits_health",
  PORTFOLIO_FIT: "paper_exit.portfolio_fit",
} as const satisfies Record<PanelKindV2, string>;
export type PaperExitLabelKeyV2 = (typeof PAPER_EXIT_LABEL_KEYS)[PanelKindV2];

/**
 * One Paper Exit finding with its stored criterion facts. `observed` and
 * `limit` are the exact decimal strings of the wire (the unit is free text, so
 * no unit class is guessed and nothing is rounded); the comparator is always
 * absent on the wire, so no "at most" or "at least" is ever drawn.
 */
export interface ExitCriterionV2 {
  finding: ExitFindingV2;
  criterionKey: ScalarV2<PanelKindV2>;
  labelKey: ScalarV2<PaperExitLabelKeyV2>;
  observed: ScalarV2<string>;
  limit: ScalarV2<string>;
  comparator: { availability: "NOT_PUBLISHED"; reasonCode: "SOURCE_COMPARATOR_FIELD_NOT_RECORDED" };
  unit: ScalarV2<string>;
  currency: ScalarV2<string>;
  /** `sha256:` digest of the evidence the finding was computed from. */
  evidence: ScalarV2<string>;
  findingFormulaVersion: ScalarV2<string>;
  sourceTime: ScalarV2<UtcEpochMs>;
  sourceRef: { kind: "PORTAL_STORED_PAPER_EXIT_FINDING"; reviewId: string; panelId: string; findingId: string; basis: "STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE" };
}

export interface ExitCriteriaV2 {
  basis: "VERIFIED_CURRENT_STORED_FINDING_BYTES_NOT_SOURCE_ACCEPTANCE";
  evaluationPolicyVersion: string;
  evaluationFormulaVersion: string;
  panels: readonly ExitPanelV2[];
  items: readonly ExitCriterionV2[];
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
  criteria: SectionV2<ExitCriteriaV2>;
  lineage: SectionV2<ExitLineageV2>;
  actors: SectionV2<ActorsV2>;
  latestOperation: SectionV2<LatestOperationV2>;
  recordedActivity: SectionV2<RecordedActivityV2>;
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
  /** BE-P12: the closed `identity` member, present only when the read asked `include=identity`; `null` = the body carries none. */
  identity: ScopedIdentityV2 | null;
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
  /** BE-P12: the closed `identity` member, present only when the read asked `include=identity`; `null` = the body carries none. */
  identity: ScopedIdentityV2 | null;
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

/**
 * Data the R2 and Paper Exit schemas never carry, whatever the viewer may read:
 * the approval ladder, the one idempotent decision call and its receipt
 * reference (FE-030). The per-family lists below add what the schema leaves out
 * of that family; `withAbsentSections` adds what a section would have carried
 * and did not, so the list describes the body in hand, not the schema alone.
 */
const APPROVAL_GAPS = {
  ladder: "FE-030",
  decisionCall: "FE-030",
  receiptRef: "FE-030",
} as const;

/** R2: no capital rows, no R1 state, decider or expiry, and (recorded verdicts included) no criterion label, observed value or limit. */
const R2_NOT_PUBLISHED: NotPublishedV2 = {
  ...APPROVAL_GAPS,
  criteria: "FE-028",
  capitalRows: "FE-030",
  r1State: "FE-028",
  r1DecidedBy: "FE-030",
  r1Expiry: "FE-028",
};
/** Paper Exit: no gate verdict, no comparator on any criterion (`op` is always absent on the wire), no evidence chart. */
const EXIT_NOT_PUBLISHED: NotPublishedV2 = {
  ...APPROVAL_GAPS,
  gateVerdict: "FE-028",
  comparator: "FE-028",
  chart: "FE-029",
};
const LIVE_NOT_PUBLISHED: NotPublishedV2 = {
  ...APPROVAL_GAPS,
  creator: "FE-030",
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

/** A datum the section would have carried is not published exactly when the section is absent. */
function withAbsentSections(base: NotPublishedV2, sections: readonly [section: { availability: string }, datum: string, fe: string][]): NotPublishedV2 {
  const out: Record<string, string> = { ...base };
  for (const [section, datum, fe] of sections) if (section.availability !== "AVAILABLE") out[datum] = fe;
  return out;
}

/* ── strict helpers ───────────────────────────────────────────────────────── */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null;
}

/** The object when it has exactly `keys`, or `keys` plus the one optional member `extra` (BE-P12 `identity`). */
function closedOptional(value: unknown, keys: readonly string[], extra: string): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  return closed(r, Object.hasOwn(r, extra) ? [...keys, extra] : keys);
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

/**
 * An optional section: its `AVAILABLE` branch is read by `available`, its
 * absence is the published `NOT_PUBLISHED` branch with one of `reasons` (the
 * schema lists them per section; any other word voids the read).
 */
function section<T>(value: unknown, available: (r: Rec) => T | null, keys: readonly string[], reasons: readonly string[] = [NOT_QUALIFIED]): SectionV2<T> | null {
  const r = rec(value);
  if (r === null) return null;
  if (r.availability === "NOT_PUBLISHED") {
    const absent = readAbsent(value);
    return absent !== null && reasons.includes(absent.reasonCode) ? absent : null;
  }
  if (r.availability !== "AVAILABLE") return null;
  const body = closed(value, keys);
  if (body === null) return null;
  const read = available(body);
  return read === null ? null : { availability: "AVAILABLE", ...read };
}

function readManagerFacts(value: unknown): AbsentSectionV2 | null {
  return readAbsent(value, MANAGER_FACTS_REASON);
}

/* ── sections added by e19ad906, shared by R2 and Paper Exit ─────────────── */

type Family = "R2" | "PAPER_EXIT";
const COMMAND_OF: Readonly<Record<Family, LatestOperationV2["commandType"]>> = {
  R2: "GOVERNANCE_R2_DECISION",
  PAPER_EXIT: "GOVERNANCE_PAPER_EXIT_DECISION",
};

/** `actors`: schema `oneOf[AVAILABLE, NOT_PUBLISHED]`; `decided_by_user_id` is null exactly when `viewer_is_decided_by` is. */
function readActors(value: unknown): SectionV2<ActorsV2> | null {
  return section<ActorsV2>(value, (a) => {
    const requesterUserId = id(a.requester_user_id);
    const artifactCreatorUserId = id(a.artifact_creator_user_id);
    const decidedByUserId = nullable(a.decided_by_user_id, id);
    const viewerIsRequester = bool(a.viewer_is_requester);
    const viewerIsArtifactCreator = bool(a.viewer_is_artifact_creator);
    const viewerIsDecidedBy = nullable(a.viewer_is_decided_by, bool);
    if (
      a.basis !== "STORED_PORTAL_ACTOR_IDS_NOT_DECISION_AUTHORIZATION" || requesterUserId === null || artifactCreatorUserId === null
      || decidedByUserId === undefined || viewerIsRequester === null || viewerIsArtifactCreator === null || viewerIsDecidedBy === undefined
    ) return null;
    if ((decidedByUserId === null) !== (viewerIsDecidedBy === null)) return null;
    return {
      basis: "STORED_PORTAL_ACTOR_IDS_NOT_DECISION_AUTHORIZATION",
      requesterUserId, artifactCreatorUserId, decidedByUserId, viewerIsRequester, viewerIsArtifactCreator, viewerIsDecidedBy,
    };
  }, ["availability", "basis", "requester_user_id", "artifact_creator_user_id", "decided_by_user_id", "viewer_is_requester", "viewer_is_artifact_creator", "viewer_is_decided_by"]);
}

/** `latest_operation`: three branches (available; purpose not qualified; no recorded or no public plan). */
function readLatestOperation(value: unknown, family: Family): SectionV2<LatestOperationV2> | null {
  const read = section<LatestOperationV2>(value, (o) => {
    const operationId = id(o.operation_id);
    const storedStatus = oneOf(o.stored_status, OPERATION_STATUSES);
    const createdAt = ms(o.created_at_ms);
    if (
      o.basis !== "LATEST_RECORDED_PORTAL_PLAN_NOT_ACTION_ELIGIBILITY" || o.order_basis !== "POSTGRES_CREATED_AT_DESC_OPERATION_ID_C_ASC"
      || o.command_version !== 1 || o.command_type !== COMMAND_OF[family] || operationId === null || storedStatus === null || createdAt === null
    ) return null;
    return {
      basis: "LATEST_RECORDED_PORTAL_PLAN_NOT_ACTION_ELIGIBILITY", operationId, commandVersion: 1, commandType: COMMAND_OF[family],
      storedStatus, createdAt, orderBasis: "POSTGRES_CREATED_AT_DESC_OPERATION_ID_C_ASC",
    };
  }, ["availability", "basis", "operation_id", "command_version", "command_type", "stored_status", "created_at_ms", "order_basis"], LATEST_OPERATION_ABSENCES);
  return read;
}

/** `decision_context` (R2 only): the stored plan inputs, correlated with the parent's own workspace, approval and version. */
function readDecisionContext(value: unknown, workspaceId: string, approval: ApprovalV2): SectionV2<DecisionContextV2> | null {
  return section<DecisionContextV2>(value, (c) => {
    const ctxWorkspace = workspace(c.workspace_id);
    const approvalId = id(c.approval_id);
    const expectedApprovalVersion = version(c.expected_approval_version);
    const evidenceSetHash = sha(c.evidence_set_hash);
    const hashes = closed(c.evidence_hashes, ["availability", "value", "reason_code"]);
    const admission = closed(c.admission, ["state", "reason_code"]);
    if (
      c.basis !== "VERIFIED_STORED_R2_INPUTS_NOT_ACTION_AUTHORIZATION" || c.gate !== "R2" || ctxWorkspace === null || approvalId === null
      || expectedApprovalVersion === null || evidenceSetHash === null || hashes === null || admission === null
      || c.command_type !== "GOVERNANCE_R2_DECISION" || c.request_schema_version !== "governance.r2-decision-plan-request.v1"
      || c.plan_path !== "/api/v1/execution/commands/plans" || c.source_side_effect_requested !== false
      || admission.state !== "NOT_EVALUATED" || admission.reason_code !== "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN"
    ) return null;
    // Runtime relation: the inputs are this approval's own, at the version the parent shows.
    if (ctxWorkspace !== workspaceId || approvalId !== approval.approvalId || expectedApprovalVersion !== approval.approvalVersion) return null;
    let evidenceHashes: DecisionContextV2["evidenceHashes"];
    if (hashes.availability === "AVAILABLE") {
      if (hashes.reason_code !== null || !Array.isArray(hashes.value) || hashes.value.length > 128) return null;
      const list: string[] = [];
      for (const entry of hashes.value) {
        const digest = sha(entry);
        if (digest === null) return null;
        list.push(digest);
      }
      // Runtime relation: strictly ascending lexical order (so unique); standard JSON Schema cannot say it.
      if (list.some((digest, index) => index > 0 && !(list[index - 1]! < digest))) return null;
      evidenceHashes = { availability: "AVAILABLE", value: list };
    } else if (hashes.availability === "NOT_PUBLISHED" && hashes.value === null && hashes.reason_code === "EVIDENCE_HASH_LIMIT_EXCEEDED") {
      evidenceHashes = { availability: "NOT_PUBLISHED", reasonCode: "EVIDENCE_HASH_LIMIT_EXCEEDED" };
    } else return null;
    return {
      basis: "VERIFIED_STORED_R2_INPUTS_NOT_ACTION_AUTHORIZATION", gate: "R2", workspaceId: ctxWorkspace, approvalId, expectedApprovalVersion,
      evidenceSetHash, evidenceHashes, commandType: "GOVERNANCE_R2_DECISION", requestSchemaVersion: "governance.r2-decision-plan-request.v1",
      planPath: "/api/v1/execution/commands/plans",
      admission: { state: "NOT_EVALUATED", reasonCode: "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN" }, sourceSideEffectRequested: false,
    };
  }, [
    "availability", "basis", "gate", "workspace_id", "approval_id", "expected_approval_version", "evidence_set_hash", "evidence_hashes",
    "command_type", "request_schema_version", "plan_path", "admission", "source_side_effect_requested",
  ]);
}

/** `recorded_activity`: at most 32 immutable decision rows, newest first; more than shown only when exactly 32 are. */
function readRecordedActivity(value: unknown, family: Family): SectionV2<RecordedActivityV2> | null {
  const kind = family === "R2" ? "R2_DECISION_RECORDED" : "PAPER_EXIT_DECISION_RECORDED";
  return section<RecordedActivityV2>(value, (a) => {
    const hasMore = bool(a.has_more);
    if (
      a.basis !== "IMMUTABLE_PORTAL_DECISION_ROWS_NOT_SOURCE_OR_STAGE_HISTORY" || a.order_basis !== "POSTGRES_DECIDED_AT_DESC_DECISION_ID_C_ASC"
      || a.coverage !== "BOUNDED_RECENT_DECISIONS_NOT_FULL_HISTORY" || a.limit !== 32 || hasMore === null
      || !Array.isArray(a.items) || a.items.length > 32 || (hasMore && a.items.length !== 32)
    ) return null;
    const items: RecordedDecisionV2[] = [];
    for (const entry of a.items) {
      const row = closed(entry, ["decision_id", "operation_id", "version_before", "version_after", "decided_at_ms", "kind", "decision"]);
      if (row === null) return null;
      const decisionId = id(row.decision_id);
      const operationId = id(row.operation_id);
      const versionBefore = version(row.version_before);
      const versionAfter = version(row.version_after);
      const decidedAt = ms(row.decided_at_ms);
      const decision = family === "R2" ? oneOf(row.decision, R2_DECISIONS) : oneOf(row.decision, EXIT_DECISIONS);
      if (row.kind !== kind || decisionId === null || operationId === null || versionBefore === null || versionAfter === null || decidedAt === null || decision === null) return null;
      // Runtime relation: one decision advances the version by exactly one.
      if (versionAfter !== versionBefore + 1) return null;
      items.push({ decisionId, operationId, versionBefore, versionAfter, decidedAt, kind, decision });
    }
    // Runtime relations: unique decision and operation ids; public clocks never increase (equal milliseconds may tie in either id order).
    if (new Set(items.map((i) => i.decisionId)).size !== items.length || new Set(items.map((i) => i.operationId)).size !== items.length) return null;
    if (items.some((item, index) => index > 0 && items[index - 1]!.decidedAt < item.decidedAt)) return null;
    return {
      basis: "IMMUTABLE_PORTAL_DECISION_ROWS_NOT_SOURCE_OR_STAGE_HISTORY", orderBasis: "POSTGRES_DECIDED_AT_DESC_DECISION_ID_C_ASC",
      coverage: "BOUNDED_RECENT_DECISIONS_NOT_FULL_HISTORY", limit: 32, hasMore, items,
    };
  }, ["availability", "basis", "order_basis", "coverage", "limit", "has_more", "items"], RECORDED_ACTIVITY_ABSENCES);
}

/** `recorded_verdicts` (R2 only): at most 64 stored findings, ordinals strictly ascending, each naming this approval. */
function readRecordedVerdicts(value: unknown, approvalId: string): SectionV2<RecordedVerdictsV2> | null {
  return section<RecordedVerdictsV2>(value, (v) => {
    const hasMore = bool(v.has_more);
    const admission = closed(v.admission, ["state", "reason_code"]);
    if (
      v.basis !== "STORED_PORTAL_R2_FINDINGS_NOT_CURRENT_GATE_READINESS" || v.order_basis !== "POSTGRES_ORDINAL_ASC_FINDING_ID_C_ASC"
      || v.coverage !== "BOUNDED_RECORDED_FINDINGS_NOT_FULL_CRITERIA_HISTORY" || v.limit !== 64 || hasMore === null || admission === null
      || admission.state !== "NOT_EVALUATED" || admission.reason_code !== "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN"
      || !Array.isArray(v.items) || v.items.length > 64 || (hasMore && v.items.length !== 64)
    ) return null;
    const items: RecordedVerdictV2[] = [];
    for (const entry of v.items) {
      const row = closed(entry, [
        "finding_id", "ordinal", "outcome", "blocking", "evaluated_at_ms", "criterion_key", "label_key", "observed", "limit", "op", "unit", "currency", "source_ref",
      ]);
      if (row === null) return null;
      const findingId = id(row.finding_id);
      const ordinal = natural(row.ordinal);
      const outcome = oneOf(row.outcome, FINDING_OUTCOMES_V2);
      const blocking = bool(row.blocking);
      const evaluatedAt = ms(row.evaluated_at_ms);
      const ref = closed(row.source_ref, ["kind", "approval_id", "finding_id", "basis"]);
      if (findingId === null || ordinal === null || outcome === null || blocking === null || evaluatedAt === null || ref === null) return null;
      // Schema if/then: a blocking verdict is a FAIL or an INSUFFICIENT.
      if (blocking && outcome !== "FAIL" && outcome !== "INSUFFICIENT") return null;
      // Each structured criterion field is the one published absence.
      for (const key of ["criterion_key", "label_key", "observed", "limit", "op", "unit", "currency"]) {
        const field = closed(row[key], ["availability", "value", "reason_code"]);
        if (field === null || field.availability !== "NOT_PUBLISHED" || field.value !== null || field.reason_code !== "SOURCE_STRUCTURED_CRITERION_NOT_RECORDED") return null;
      }
      // Runtime relation: the reference names this finding of this approval.
      if (ref.kind !== "PORTAL_STORED_R2_FINDING" || ref.basis !== "STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE" || ref.finding_id !== findingId || ref.approval_id !== approvalId) return null;
      items.push({
        findingId, ordinal, outcome, blocking, evaluatedAt,
        structuredCriterion: { availability: "NOT_PUBLISHED", reasonCode: "SOURCE_STRUCTURED_CRITERION_NOT_RECORDED" },
        sourceRef: { kind: "PORTAL_STORED_R2_FINDING", approvalId, findingId, basis: "STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE" },
      });
    }
    // Runtime relations: unique finding ids, ordinals strictly ascending.
    if (new Set(items.map((i) => i.findingId)).size !== items.length || items.some((item, index) => index > 0 && !(items[index - 1]!.ordinal < item.ordinal))) return null;
    return {
      basis: "STORED_PORTAL_R2_FINDINGS_NOT_CURRENT_GATE_READINESS", orderBasis: "POSTGRES_ORDINAL_ASC_FINDING_ID_C_ASC",
      coverage: "BOUNDED_RECORDED_FINDINGS_NOT_FULL_CRITERIA_HISTORY", limit: 64, hasMore, items,
      admission: { state: "NOT_EVALUATED", reasonCode: "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN" },
    };
  }, ["availability", "basis", "order_basis", "coverage", "limit", "has_more", "items", "admission"], RECORDED_VERDICT_ABSENCES);
}

/* ── R2 ───────────────────────────────────────────────────────────────────── */

/** The keys both governance parents share (`R2ParentReadV2` and `PaperExitParentReadV2`, execution-operations.v1 schema). */
const PARENT_KEYS = [
  "schema_version", "workspace_id", "record_authority", "provenance_basis", "field_contract_revision", "observed_at_ms",
  "source", "anchors", "approval", "family", "lineage", "actors", "latest_operation",
];
const R2_KEYS = [...PARENT_KEYS, "decision_context", "recorded_activity", "recorded_verdicts"];

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
  const actors = readActors(r.actors);
  const latestOperation = readLatestOperation(r.latest_operation, "R2");
  if (header === null || anchors === null || approval === null || lineage === null || actors === null || latestOperation === null) return null;
  const decisionContext = readDecisionContext(r.decision_context, header.workspaceId, approval);
  const recordedActivity = readRecordedActivity(r.recorded_activity, "R2");
  const recordedVerdicts = readRecordedVerdicts(r.recorded_verdicts, approval.approvalId);
  if (decisionContext === null || recordedActivity === null || recordedVerdicts === null) return null;
  return {
    family: "R2", header, anchors, approval, lineage: lineage as SectionV2<R2LineageV2>, actors, latestOperation, decisionContext, recordedActivity, recordedVerdicts,
    notPublished: withAbsentSections(R2_NOT_PUBLISHED, [
      [actors, "creator", "FE-030"],
      [latestOperation, "operationLink", "FE-030"],
      [decisionContext, "decisionPins", "FE-030"],
      [recordedActivity, "recordedDecisions", "FE-030"],
      [recordedVerdicts, "recordedFindings", "FE-028"],
    ]),
  };
}

/* ── Paper Exit ───────────────────────────────────────────────────────────── */

const EXIT_KEYS = [...PARENT_KEYS, "review", "evaluation", "criteria", "recorded_activity"];

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

/** At most four panels; unique ids, kinds and ordinals (the schema description's runtime relations). */
function readPanels(value: unknown): ExitPanelV2[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const panels: ExitPanelV2[] = [];
  for (const entry of value) {
    const panel = readExitPanel(entry);
    if (panel === null) return null;
    panels.push(panel);
  }
  const unique = (pick: (panel: ExitPanelV2) => string | number) => new Set(panels.map(pick)).size === panels.length;
  return unique((panel) => panel.panelId) && unique((panel) => panel.panelKind) && unique((panel) => panel.ordinal) ? panels : null;
}

function readEvaluation(r: Rec): ExitEvaluationV2 | null {
  const evaluationPolicyVersion = text(r.evaluation_policy_version);
  const evaluationFormulaVersion = text(r.evaluation_formula_version);
  const panels = readPanels(r.panels);
  if (evaluationPolicyVersion === null || evaluationFormulaVersion === null || panels === null) return null;
  if (!Array.isArray(r.findings) || r.findings.length > 256) return null;
  const findings: ExitFindingV2[] = [];
  for (const entry of r.findings) {
    const finding = readExitFinding(entry);
    if (finding === null) return null;
    findings.push(finding);
  }
  // One finding id once; a finding names a panel that is in the list.
  const panelIds = new Set(panels.map((panel) => panel.panelId));
  const findingIds = new Set(findings.map((finding) => finding.findingId));
  if (findingIds.size !== findings.length) return null;
  if (findings.some((finding) => !panelIds.has(finding.panelId))) return null;
  return { evaluationPolicyVersion, evaluationFormulaVersion, panels, findings };
}

/* criteria: scalars are `{availability, value, reason_code}`, closed, with the reasons the schema lists per field */

function scalar<T>(value: unknown, read: (v: unknown) => T | null, reasons: readonly string[]): ScalarV2<T> | null {
  const s = closed(value, ["availability", "value", "reason_code"]);
  if (s === null) return null;
  if (s.availability === "AVAILABLE") {
    const v = read(s.value);
    return s.reason_code === null && v !== null ? { availability: "AVAILABLE", value: v } : null;
  }
  if (s.availability !== "NOT_PUBLISHED" || s.value !== null) return null;
  const code = typeof s.reason_code === "string" && reasons.includes(s.reason_code) ? s.reason_code : null;
  return code === null ? null : { availability: "NOT_PUBLISHED", reasonCode: code };
}

const NOT_REGISTERED = ["SOURCE_METRIC_NOT_REGISTERED"] as const;
const VALUE_ABSENCES = ["SOURCE_VALUE_NOT_RECORDED", "SOURCE_VALUE_NOT_DECIMAL"] as const;
const TEXT_ABSENCES = ["SOURCE_TEXT_NOT_RECORDED", "SOURCE_TEXT_NOT_PUBLIC_SAFE"] as const;
/** `observed` / `limit`: schema string, maxLength 128, `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$`. Kept as the exact string; `-0` is a legal spelling here. */
const CRITERION_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
/** `unit` / `currency` / `finding_formula_version`: public text, no URL, no `javascript:` / `data:` / `file:` scheme, no leading slash (schema `allOf.not.pattern`). */
const PUBLIC_TEXT_REFUSED = /[A-Za-z][A-Za-z0-9+.-]*:\/\/|^(?:[Jj][Aa][Vv][Aa][Ss][Cc][Rr][Ii][Pp][Tt]|[Dd][Aa][Tt][Aa]|[Ff][Ii][Ll][Ee]):|^[/\\]/;

function criterionDecimal(value: unknown): string | null {
  return typeof value === "string" && value.length <= 128 && CRITERION_DECIMAL.test(value) ? value : null;
}
function publicText(value: unknown): string | null {
  const t = text(value);
  return t !== null && !PUBLIC_TEXT_REFUSED.test(t) ? t : null;
}
function labelKeyOf(value: unknown): PaperExitLabelKeyV2 | null {
  return oneOf(value, Object.values(PAPER_EXIT_LABEL_KEYS));
}

function readCriterion(value: unknown, reviewId: string): ExitCriterionV2 | null {
  const c = closed(value, [
    "original", "criterion_key", "label_key", "observed", "limit", "op", "unit", "currency", "evidence", "finding_formula_version", "source_time", "source_ref",
  ]);
  if (c === null) return null;
  const finding = readExitFinding(c.original);
  const criterionKey = scalar(c.criterion_key, (v) => oneOf(v, PANEL_KINDS_V2), NOT_REGISTERED);
  const labelKey = scalar(c.label_key, labelKeyOf, NOT_REGISTERED);
  const observed = scalar(c.observed, criterionDecimal, VALUE_ABSENCES);
  const limit = scalar(c.limit, criterionDecimal, VALUE_ABSENCES);
  const op = scalar(c.op, () => null, ["SOURCE_COMPARATOR_FIELD_NOT_RECORDED"]);
  const unit = scalar(c.unit, publicText, TEXT_ABSENCES);
  const currency = scalar(c.currency, publicText, TEXT_ABSENCES);
  const evidence = scalar(c.evidence, sha, ["SOURCE_EVIDENCE_HASH_NOT_RECORDED"]);
  const findingFormulaVersion = scalar(c.finding_formula_version, publicText, TEXT_ABSENCES);
  const sourceTime = scalar(c.source_time, ms, ["SOURCE_TIME_NOT_RECORDED"]);
  const ref = closed(c.source_ref, ["kind", "review_id", "panel_id", "finding_id", "basis"]);
  if (
    finding === null || criterionKey === null || labelKey === null || observed === null || limit === null || op === null || unit === null
    || currency === null || evidence === null || findingFormulaVersion === null || sourceTime === null || ref === null
    || op.availability !== "NOT_PUBLISHED" || ref.kind !== "PORTAL_STORED_PAPER_EXIT_FINDING" || ref.basis !== "STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE"
  ) return null;
  const refReview = id(ref.review_id);
  const refPanel = id(ref.panel_id);
  const refFinding = id(ref.finding_id);
  if (refReview === null || refPanel === null || refFinding === null) return null;
  // The schema's if/then: a published key has exactly its label; an unregistered key has no label.
  if (criterionKey.availability === "AVAILABLE" ? labelKey.availability !== "AVAILABLE" || labelKey.value !== PAPER_EXIT_LABEL_KEYS[criterionKey.value] : labelKey.availability !== "NOT_PUBLISHED") return null;
  // Runtime relations: the reference is this review's, names the same panel and finding, and the source clock is the finding's own.
  if (refReview !== reviewId || refPanel !== finding.panelId || refFinding !== finding.findingId) return null;
  if ((sourceTime.availability === "AVAILABLE" ? sourceTime.value : null) !== finding.asOf) return null;
  return {
    finding, criterionKey, labelKey, observed, limit,
    comparator: { availability: "NOT_PUBLISHED", reasonCode: "SOURCE_COMPARATOR_FIELD_NOT_RECORDED" },
    unit, currency, evidence, findingFormulaVersion, sourceTime,
    sourceRef: { kind: "PORTAL_STORED_PAPER_EXIT_FINDING", reviewId: refReview, panelId: refPanel, findingId: refFinding, basis: "STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE" },
  };
}

function readCriteria(r: Rec, reviewId: string): ExitCriteriaV2 | null {
  const evaluationPolicyVersion = text(r.evaluation_policy_version);
  const evaluationFormulaVersion = text(r.evaluation_formula_version);
  const panels = readPanels(r.panels);
  if (
    r.basis !== "VERIFIED_CURRENT_STORED_FINDING_BYTES_NOT_SOURCE_ACCEPTANCE" || evaluationPolicyVersion === null || evaluationFormulaVersion === null
    || panels === null || !Array.isArray(r.items) || r.items.length > 256
  ) return null;
  const items: ExitCriterionV2[] = [];
  for (const entry of r.items) {
    const item = readCriterion(entry, reviewId);
    if (item === null) return null;
    items.push(item);
  }
  const panelIds = new Set(panels.map((panel) => panel.panelId));
  if (new Set(items.map((item) => item.finding.findingId)).size !== items.length || items.some((item) => !panelIds.has(item.finding.panelId))) return null;
  return { basis: "VERIFIED_CURRENT_STORED_FINDING_BYTES_NOT_SOURCE_ACCEPTANCE", evaluationPolicyVersion, evaluationFormulaVersion, panels, items };
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
  const actors = readActors(r.actors);
  const latestOperation = readLatestOperation(r.latest_operation, "PAPER_EXIT");
  const recordedActivity = readRecordedActivity(r.recorded_activity, "PAPER_EXIT");
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
  if (
    header === null || anchors === null || approval === null || review === null || evaluation === null || lineage === null
    || actors === null || latestOperation === null || recordedActivity === null
  ) return null;

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
  // The criteria name this review in every source reference (runtime relation), so they are read once the review's id is known.
  const criteria = section<ExitCriteriaV2>(
    r.criteria,
    (c) => readCriteria(c, reviewId),
    ["availability", "basis", "evaluation_policy_version", "evaluation_formula_version", "panels", "items"],
  );
  if (criteria === null) return null;

  return {
    family: "PAPER_EXIT", header, anchors, approval,
    review: {
      reviewId, reviewState, reviewVersion, promoteTo: "SANDBOX_VALIDATION",
      extensionDays: extensionDays === 14 ? 14 : null, extendedUntil, createdAt, updatedAt,
    },
    evaluation: evaluation as SectionV2<ExitEvaluationV2>,
    criteria,
    lineage: lineage as SectionV2<ExitLineageV2>,
    actors, latestOperation, recordedActivity,
    notPublished: withAbsentSections(EXIT_NOT_PUBLISHED, [
      [actors, "creator", "FE-030"],
      [latestOperation, "operationLink", "FE-030"],
      [criteria, "criteriaLabel", "FE-028"],
      [criteria, "observedAndLimit", "FE-028"],
      [recordedActivity, "recordedDecisions", "FE-030"],
    ]),
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
  const r = closedOptional(raw, SANDBOX_KEYS, "identity");
  if (r === null || r.schema_version !== FOLLOWING_PARENT_V2_SCHEMA || r.family !== "SANDBOX") return null;
  const identity = readScopedIdentityV2(r.identity, Object.hasOwn(r, "identity"));
  if (identity === undefined) return null;
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
    identity,
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
  const r = closedOptional(raw, CANARY_KEYS, "identity");
  if (r === null || r.schema_version !== FOLLOWING_PARENT_V2_SCHEMA || r.family !== "CANARY") return null;
  const identity = readScopedIdentityV2(r.identity, Object.hasOwn(r, "identity"));
  if (identity === undefined) return null;
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
    identity,
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
