import { z } from "zod";
import { assertAmountPartition, executionEnvironment, financialStage, opaqueRevision, unsignedDecimal, utcMilliseconds } from "./foundation.contract";
import { commandIntent, commandPreview, commandStatus } from "./command.contract";

const text = z.string().min(1).max(256);
export const workflowResource = z.object({ kind: z.enum(["ROOT", "PORTFOLIO", "ALPHA", "DEPLOYMENT", "ACCOUNT", "BINDING"]), id: text }).strict();
export const workflowContext = z.object({ workspace_id: text, environment: executionEnvironment,
  resource: workflowResource, policy_revision: opaqueRevision, snapshot_ref: text,
  source_as_of_ms: utcMilliseconds.nullable(), observed_at_ms: utcMilliseconds }).strict();
export const workflowReasons = z.enum(["CURRENT_ACCESS_REQUIRED", "EXACT_INSTANCE_REQUIRED", "SOURCE_NOT_QUALIFIED",
  "OBLIGATIONS_NOT_PUBLISHED", "OBLIGATIONS_STALE", "PENDING_DRAIN", "INHERITED_RESTRICTION",
  "BINDING_CHANGE_NOT_QUALIFIED", "ARCHIVE_DISPOSITION_REQUIRED", "ASSIGNMENT_RECEIPTS_REQUIRED", "BUDGET_NOT_DRAINED", "MONITOR_NOT_PROVISIONED",
  "REACTIVATION_REVIEW_REQUIRED", "CREATED_UNFUNDED", "INITIAL_BUDGET_NOT_APPLIED", "OUTCOME_UNKNOWN",
  "SOURCE_REJECTED", "SCOPE_CHANGED", "DATA_UNAVAILABLE", "CURRENT_GRANT_REVOKED", "RESYNC_REQUIRED"]);

/** Public copy keys are finite. Never render an owning-source exception as copy. */
export const workflowReadState = z.object({ state: z.enum(["LOADING", "AUTHORIZED_EMPTY", "READY", "PARTIAL", "STALE",
  "UNAVAILABLE", "DENIED", "REVOKED", "DISCONNECTED", "RESYNC_REQUIRED", "INSUFFICIENT_EVIDENCE", "OUTCOME_UNKNOWN"]),
  may_display_data: z.boolean(), public_copy_key: z.enum(["LOADING", "NO_AUTHORIZED_RESULTS", "READY", "PARTIAL_DATA", "STALE_DATA",
    "DATA_UNAVAILABLE", "ACCESS_REQUIRED", "ACCESS_REVOKED", "DISCONNECTED", "REFRESH_REQUIRED", "MORE_EVIDENCE_REQUIRED", "QUERY_SAME_INTENT"]),
  next_action: z.enum(["NONE", "REFRESH_ONCE", "REQUEST_ACCESS", "DISCARD_AND_REFRESH", "QUERY_SAME_INTENT"]),
  source_as_of_ms: utcMilliseconds.nullable(), observed_at_ms: utcMilliseconds }).strict().superRefine((v, c) => {
  if (["LOADING", "UNAVAILABLE", "DENIED", "REVOKED", "RESYNC_REQUIRED"].includes(v.state) && v.may_display_data)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_PROTECTED_DATA_MUST_BE_DISCARDED" });
});

export const workflowReceiptStep = z.object({ state: z.enum(["NOT_REQUESTED", "PENDING", "APPLIED", "REJECTED", "UNKNOWN", "NOT_REQUIRED"]),
  receipt_ref: text.nullable() }).strict().superRefine((v, c) => {
  if ((v.state === "APPLIED") !== (v.receipt_ref !== null))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_STEP_RECEIPT_REQUIRED" });
});
export const workflowCreateState = z.enum(["DRAFT", "CREATE_PENDING", "CREATED_UNFUNDED", "FUNDING_PENDING", "BUDGET_PENDING", "CREATED_ZERO_CAPITAL",
  "CREATED_WITH_CAPITAL", "OUTCOME_UNKNOWN", "REJECTED"]);
export function deriveCreateWorkflowState(v: { requested_economic_capital: string; requested_initial_budget: string;
  create: z.infer<typeof workflowReceiptStep>; fund: z.infer<typeof workflowReceiptStep>; initial_grant: z.infer<typeof workflowReceiptStep> }): z.infer<typeof workflowCreateState> {
  const zero = (s: string) => /^0(?:\.0+)?$/.test(s), steps = [v.create, v.fund, v.initial_grant];
  return steps.some(s => s.state === "UNKNOWN") ? "OUTCOME_UNKNOWN"
    : steps.some(s => s.state === "REJECTED") ? "REJECTED"
    : v.create.state === "NOT_REQUESTED" ? "DRAFT" : v.create.state !== "APPLIED" ? "CREATE_PENDING"
    : !zero(v.requested_economic_capital) && v.fund.state !== "APPLIED" ? v.fund.state === "PENDING" ? "FUNDING_PENDING" : "CREATED_UNFUNDED"
    : !zero(v.requested_initial_budget) && v.initial_grant.state !== "APPLIED" ? "BUDGET_PENDING"
    : zero(v.requested_economic_capital) ? "CREATED_ZERO_CAPITAL" : "CREATED_WITH_CAPITAL";
}
export const workflowCreate = z.object({ schema_version: z.literal("portal.execution.create-workflow.v1"), context: workflowContext,
  requested_economic_capital: unsignedDecimal, requested_initial_budget: unsignedDecimal, currency: text,
  create: workflowReceiptStep, fund: workflowReceiptStep, initial_grant: workflowReceiptStep,
  state: workflowCreateState,
  automatic_activation: z.literal(false), physical_transfer_performed: z.literal(false),
  trading_readiness: z.literal("SEPARATE_AUTHORITY_REQUIRED") }).strict().superRefine((v, c) => {
  const zero = (s: string) => /^0(?:\.0+)?$/.test(s);
  if (v.create.state === "NOT_REQUIRED" || zero(v.requested_economic_capital) !== (v.fund.state === "NOT_REQUIRED") ||
    zero(v.requested_initial_budget) !== (v.initial_grant.state === "NOT_REQUIRED") ||
    v.create.state !== "APPLIED" && [v.fund, v.initial_grant].some(s => s.state === "APPLIED"))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_CREATE_STEPS_INVALID" });
  if (v.state !== deriveCreateWorkflowState(v))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_CREATE_STATE_INCONSISTENT" });
});

export const workflowCapital = z.object({ schema_version: z.literal("portal.execution.capital-workflow.v1"), context: workflowContext,
  currency: text, status: commandStatus,
  effect_kind: z.enum(["ECONOMIC_ASSIGNMENT", "MANAGEMENT_BUDGET", "NOMINAL_ROOT_CAP"]),
  physical_transfer_performed: z.literal(false), form_cancel: z.literal("DISCARD_LOCAL_DRAFT_ONLY"),
  after_submit_cancel: z.literal("SEPARATE_CANCEL_REMAINING_AUTHORITY_REQUIRED"),
  refresh: z.literal("GET_ORIGINAL_COMMAND_NO_RESUBMIT"), public_copy_key: z.enum(["QUERY_SAME_INTENT", "REVIEW_RECEIPT",
    "PARTIAL_REMAINDER_PENDING", "APPLIED_PART_RETAINED", "SOURCE_REJECTED"]),
  automatic_resend: z.literal(false) }).strict().superRefine((v, c) => {
  if (v.context.environment !== v.status.environment || v.context.resource.kind !== v.status.resource.kind || v.context.resource.id !== v.status.resource.id)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_COMMAND_CONTEXT_MISMATCH" });
  const b = v.status.business;
  try { if (b.amounts) assertAmountPartition(b.amounts); }
  catch { c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_AMOUNT_PARTITION_INVALID" }); }
  if (b.state === "UNKNOWN" ? b.amounts !== null || b.receipt_ref !== null || b.source_event_ref !== null || b.revision !== null
    : b.amounts === null || b.receipt_ref === null || b.source_event_ref === null || b.revision === null)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_BUSINESS_RECEIPT_INVALID" });
  if (b.amounts) {
    const a = b.amounts, positive = (s: string) => !/^0(?:\.0+)?$/.test(s);
    if (b.state === "APPLIED" && [a.pending, a.cancelled, a.rejected].some(positive) ||
      b.state === "REJECTED" && [a.applied, a.pending, a.cancelled].some(positive) ||
      b.state === "WAITING_ENCUMBRANCE" && (!positive(a.pending) || [a.applied, a.cancelled, a.rejected].some(positive)) ||
      b.state === "PARTIALLY_APPLIED" && (!positive(a.applied) || !positive(a.pending) || [a.cancelled, a.rejected].some(positive)) ||
      b.state === "CANCELLED" && (!positive(a.cancelled) || [a.applied, a.pending, a.rejected].some(positive)) ||
      b.state === "PARTIALLY_APPLIED_CANCELLED" && (!positive(a.applied) || !positive(a.cancelled) || [a.pending, a.rejected].some(positive)))
      c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_BUSINESS_AMOUNTS_INCONSISTENT" });
  }
  if (v.effect_kind !== (v.status.operation === "FUND" ? "ECONOMIC_ASSIGNMENT" : v.status.operation === "SET_ROOT_LIMIT" ? "NOMINAL_ROOT_CAP" : "MANAGEMENT_BUDGET"))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_CAPITAL_EFFECT_MISMATCH" });
});

const capacity = z.object({ economic_backing: unsignedDecimal.nullable(), margin_risk_budget: unsignedDecimal.nullable(),
  exposure_cap: unsignedDecimal.nullable(), source_receipt_ref: text.nullable(), source_as_of_ms: utcMilliseconds.nullable() }).strict()
  .superRefine((v, c) => {
    if ([v.economic_backing, v.margin_risk_budget, v.exposure_cap].some(n => n !== null) && (!v.source_receipt_ref || v.source_as_of_ms === null))
      c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_CAPACITY_PROVENANCE_REQUIRED" });
  });
export const workflowConfirmation = z.object({ schema_version: z.literal("portal.execution.workflow-confirmation.v1"),
  intent: commandIntent, preview: commandPreview, before: capacity, projected_after: capacity,
  effect_is_projection_not_receipt: z.literal(true), source_parent_ref: text.nullable(),
  confirm_is_approval: z.literal(false), physical_transfer_performed: z.literal(false) }).strict();

/** Coverage inventory, not a way to activate an operation or to install a grant. */
export const workflowAction = z.object({ operation: z.enum(["CREATE_PORTFOLIO", "REGISTER_INSTANCE", "FUND", "RETURN_CAPITAL", "INITIAL_GRANT", "TOP_UP",
  "IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL", "ADJUST_TARGET_BUDGET", "SET_ROOT_LIMIT", "APPLY_PENDING", "CANCEL_REMAINING",
  "REALLOCATE_BUDGET", "ADMIN_LOCK", "ADMIN_UNLOCK", "HALT", "REDUCING", "RESUME", "MOVE_ASSIGNMENT", "REBIND", "ARCHIVE", "CREATE_PAPER_MONITOR", "REACTIVATE"]),
  capability_ref: text.nullable(), dataset_refs: z.array(text).min(1).max(8),
  preview_operation_id: text.nullable(), submit_operation_id: text.nullable(), status_operation_id: text.nullable(),
  state_schema: z.enum(["WorkflowCreate", "WorkflowCapital", "WorkflowLifecycle"]).nullable(),
  commissioning: z.enum(["TECHNICAL_SOURCE_DARK", "EXACT_ACTION_CATALOGUE_PENDING", "SOURCE_ADAPTER_PENDING"]),
  runtime_enabled: z.literal(false), public_copy_key: z.literal("SOURCE_NOT_QUALIFIED") }).strict();

export const workflowScreen = z.object({ screen_id: z.enum(["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10"]),
  scope: z.enum(["MANAGER", "OWN_SLICE", "BOTH_WITH_DISTINCT_PROJECTION"]),
  ui_route: text.nullable(), route_state: z.enum(["EXISTING_SOURCE_ROUTE", "PROPOSED", "EXISTING_DETAIL_REQUIRES_DIRECTORY_REFINEMENT"]),
  read_operation_ids: z.array(text).max(8), source_qualified: z.literal(false),
  consumer_status: z.literal("AWAITING_CONSUMER_REVIEW") }).strict();

export const workflowObligationCounts = z.object(Object.fromEntries(["positions", "working_orders", "reservations", "unknown_outcomes", "locks", "recalls", "settlements", "active_children"]
  .map(key => [key, z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()])) as Record<
    "positions" | "working_orders" | "reservations" | "unknown_outcomes" | "locks" | "recalls" | "settlements" | "active_children", z.ZodNullable<z.ZodNumber>>).strict();
export const workflowLifecycleOperation = z.enum(["MOVE_ASSIGNMENT", "REBIND", "ARCHIVE", "RESUME", "CREATE_PAPER_MONITOR", "REACTIVATE"]);
export const workflowLifecycle = z.object({ schema_version: z.literal("portal.execution.lifecycle-workflow.v1"), context: workflowContext,
  operation: workflowLifecycleOperation, financial_stage: financialStage,
  lifecycle: z.enum(["ACTIVE", "ARCHIVE_REQUESTED", "ARCHIVED"]),
  state: z.enum(["BLOCKED", "PENDING_DRAIN", "READY_FOR_AUTHORITY_REVIEW"]), reason_code: workflowReasons.nullable(),
  obligations: z.object({ counts: workflowObligationCounts, coverage: z.enum(["COMPLETE", "PARTIAL", "UNPUBLISHED"]),
    freshness: z.enum(["FRESH", "STALE", "UNKNOWN"]), source_receipt_ref: text.nullable() }).strict(),
  source_portfolio_id: text.nullable(), destination_portfolio_id: text.nullable(),
  remaining_budget: unsignedDecimal.nullable(),
  original_attribution: z.literal("ORIGINAL_CAUSAL_BINDING"),
  automatic_liquidation: z.literal(false), automatic_order_cancel: z.literal(false), automatic_capital_return: z.literal(false),
  automatic_live_activation: z.literal(false), dispatch_enabled: z.literal(false),
  source_budget_return: workflowReceiptStep, destination_budget_grant: workflowReceiptStep,
  economic_settlement: workflowReceiptStep,
  monitor: z.object({ state: z.enum(["NOT_PROVISIONED", "RUNNING", "PAUSED", "STALE", "QUOTA_STOPPED"]),
    deployment_id: text.nullable(), origin_deployment_id: text.nullable(), alpha_version_id: text.nullable(),
    params_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(), lineage_receipt_ref: text.nullable(),
    reason: z.literal("ARCHIVE_MONITOR").nullable(), effective_at_ms: utcMilliseconds.nullable(),
    approved_config_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
    last_observation_ms: utcMilliseconds.nullable(), virtual_capital: unsignedDecimal.nullable(), currency: text.nullable() }).strict(),
}).strict().superRefine((v, c) => {
  if ((v.state === "READY_FOR_AUTHORITY_REVIEW") !== (v.reason_code === null))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_READINESS_REASON_REQUIRED" });
  if (v.state === "READY_FOR_AUTHORITY_REVIEW" && (v.operation === "REACTIVATE" ||
    v.lifecycle === "ARCHIVED" && v.operation !== "CREATE_PAPER_MONITOR" ||
    v.lifecycle === "ARCHIVE_REQUESTED" && v.operation === "RESUME"))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_REACTIVATION_REVIEW_REQUIRED" });
  if ((v.context.environment === "paper" && v.financial_stage !== "PAPER") ||
    (v.context.environment === "sandbox" && v.financial_stage !== "SANDBOX") ||
    (v.context.environment === "live" && !["CANARY", "LIVE"].includes(v.financial_stage)))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_STAGE_ENVIRONMENT_MISMATCH" });
  if (v.state === "READY_FOR_AUTHORITY_REVIEW" && (v.obligations.coverage !== "COMPLETE" || v.obligations.freshness !== "FRESH" ||
    !v.obligations.source_receipt_ref || Object.entries(v.obligations.counts).some(([key, n]) => n === null ||
      n > 0 && (v.operation !== "RESUME" || ["locks", "recalls", "unknown_outcomes"].includes(key)))))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_DRAIN_PROOF_REQUIRED" });
  if (v.state === "READY_FOR_AUTHORITY_REVIEW" && v.operation === "MOVE_ASSIGNMENT" &&
    [v.source_budget_return, v.destination_budget_grant, v.economic_settlement].some(s => s.state !== "APPLIED"))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_ASSIGNMENT_RECEIPTS_REQUIRED" });
  if (v.state === "READY_FOR_AUTHORITY_REVIEW" && v.operation === "ARCHIVE" &&
    (v.lifecycle === "ACTIVE" || v.remaining_budget === null || !/^0(?:\.0+)?$/.test(v.remaining_budget)))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_ARCHIVE_DRAIN_REQUIRED" });
  const m = v.monitor;
  if (m.state !== "NOT_PROVISIONED" && (!m.deployment_id || !m.origin_deployment_id || !m.alpha_version_id || !m.params_digest || !m.lineage_receipt_ref ||
    m.reason === null || m.effective_at_ms === null || m.approved_config_digest === null || m.deployment_id === m.origin_deployment_id ||
    m.virtual_capital === null || m.currency === null || m.state === "RUNNING" && m.last_observation_ms === null ||
    m.last_observation_ms !== null && m.effective_at_ms !== null && m.last_observation_ms < m.effective_at_ms))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_MONITOR_LINEAGE_REQUIRED" });
});

/** Navigation only. It cannot grant a gate, install decision evidence or send an upstream action. */
export const workflowNavigation = z.object({ schema_version: z.literal("portal.execution.workflow-navigation.v1"),
  workspace_id: text, view: z.enum(["MANAGER", "OWN_SLICE"]),
  financial_stage_filter: z.enum(["ALL", "PAPER", "SANDBOX", "CANARY", "LIVE"]),
  lifecycle_filter: z.enum(["ACTIVE", "ARCHIVE_REQUESTED", "ARCHIVED"]),
  environment: executionEnvironment.nullable(), currency: text.nullable(), window: z.object({ from_ms: utcMilliseconds, to_ms: utcMilliseconds }).strict().nullable(),
  portfolio_id: text.nullable(), alpha_id: text.nullable(), deployment_id: text.nullable(), query_revision: text.nullable(),
  origin: z.object({ run_id: text, release_candidate_id: text, approval_id: text,
    gate: z.enum(["R1", "R2", "LIVE_GATE", "PAPER_EXIT"]), review_id: text.nullable(),
    evidence_set_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict().nullable(),
  economic_aggregation: z.literal("EXPLICIT_AUTHORIZED_PARTITION_ONLY"), saved_view_grants_access: z.literal(false),
}).strict().superRefine((v, c) => {
  if (v.origin?.gate === "PAPER_EXIT" && v.origin.review_id === null || v.window && v.window.from_ms >= v.window.to_ms || v.financial_stage_filter !== "ALL" &&
    v.environment !== ({ PAPER: "paper", SANDBOX: "sandbox", CANARY: "live", LIVE: "live" } as const)[v.financial_stage_filter])
    c.addIssue({ code: z.ZodIssueCode.custom, message: "WORKFLOW_NAVIGATION_CONTEXT_INVALID" });
});
