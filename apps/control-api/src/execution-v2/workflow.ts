/** Pure read-side presentation projections. Inputs must already be authorized/scoped.
 * No route accepts these facts; none of these functions grants or dispatches an action. */
import { z } from "zod";
import { deriveCreateWorkflowState, workflowCapital, workflowContext, workflowCreate, workflowLifecycle, workflowNavigation, workflowReadState } from "./workflow.contract";
import { commandStatus } from "./command.contract";

const zero = (v: string) => /^0(?:\.0+)?$/.test(v);
type Context = z.infer<typeof workflowContext>;
type Create = z.infer<typeof workflowCreate>;
export function createWorkflow(input: Omit<Create, "schema_version" | "state" | "automatic_activation" | "physical_transfer_performed" | "trading_readiness">): Create {
  return workflowCreate.parse({ ...input, schema_version: "portal.execution.create-workflow.v1", state: deriveCreateWorkflowState(input),
    automatic_activation: false, physical_transfer_performed: false, trading_readiness: "SEPARATE_AUTHORITY_REQUIRED" });
}

export function capitalWorkflow(context: Context, currency: string, status: z.infer<typeof commandStatus>) {
  const b = status.business;
  const public_copy_key = b.state === "UNKNOWN" ? "QUERY_SAME_INTENT" : b.state === "REJECTED" ? "SOURCE_REJECTED"
    : b.state === "PARTIALLY_APPLIED_CANCELLED" ? "APPLIED_PART_RETAINED"
    : ["PARTIALLY_APPLIED", "WAITING_ENCUMBRANCE"].includes(b.state) ? "PARTIAL_REMAINDER_PENDING" : "REVIEW_RECEIPT";
  return workflowCapital.parse({ schema_version: "portal.execution.capital-workflow.v1", context, currency, status,
    effect_kind: status.operation === "FUND" ? "ECONOMIC_ASSIGNMENT" : status.operation === "SET_ROOT_LIMIT" ? "NOMINAL_ROOT_CAP" : "MANAGEMENT_BUDGET",
    physical_transfer_performed: false, form_cancel: "DISCARD_LOCAL_DRAFT_ONLY", after_submit_cancel: "SEPARATE_CANCEL_REMAINING_AUTHORITY_REQUIRED",
    refresh: "GET_ORIGINAL_COMMAND_NO_RESUBMIT", public_copy_key, automatic_resend: false });
}

type Lifecycle = z.infer<typeof workflowLifecycle>;
type LifecycleInput = Omit<Lifecycle, "schema_version" | "state" | "reason_code" | "original_attribution" | "automatic_liquidation" |
  "automatic_order_cancel" | "automatic_capital_return" | "automatic_live_activation" | "dispatch_enabled">;
/** Internal scoped evidence, not a substitute for access.service or a TS commit check. */
export interface LifecyclePrerequisites {
  current_source_access: boolean; current_destination_access: boolean; exact_instance_selected: boolean;
  source_operation_qualified: boolean; inherited_restriction: boolean; residual_disposition_receipt_ref: string | null;
}
export function lifecycleWorkflow(input: LifecycleInput, p: LifecyclePrerequisites): Lifecycle {
  if (!p.current_source_access || (input.operation === "MOVE_ASSIGNMENT" || input.operation === "REBIND") && !p.current_destination_access)
    throw new Error("WORKFLOW_CURRENT_ACCESS_REQUIRED"); // Do not disclose hidden obligations/target IDs.
  const v = workflowLifecycle.parse({ ...input, schema_version: "portal.execution.lifecycle-workflow.v1", state: "BLOCKED",
    reason_code: "SOURCE_NOT_QUALIFIED", original_attribution: "ORIGINAL_CAUSAL_BINDING", automatic_liquidation: false,
    automatic_order_cancel: false, automatic_capital_return: false, automatic_live_activation: false, dispatch_enabled: false });
  const counts = Object.values(v.obligations.counts);
  const reason: Lifecycle["reason_code"] = !p.exact_instance_selected ? "EXACT_INSTANCE_REQUIRED"
    : !p.source_operation_qualified ? v.operation === "REBIND" ? "BINDING_CHANGE_NOT_QUALIFIED" : "SOURCE_NOT_QUALIFIED"
    : (v.lifecycle === "ARCHIVED" && !["CREATE_PAPER_MONITOR", "REACTIVATE"].includes(v.operation) || v.lifecycle === "ARCHIVE_REQUESTED" && v.operation === "RESUME") ? "REACTIVATION_REVIEW_REQUIRED"
    : v.obligations.coverage !== "COMPLETE" || counts.some(n => n === null) || !v.obligations.source_receipt_ref ? "OBLIGATIONS_NOT_PUBLISHED"
    : v.obligations.freshness !== "FRESH" ? "OBLIGATIONS_STALE"
    : p.inherited_restriction && v.operation === "RESUME" ? "INHERITED_RESTRICTION"
    : Object.entries(v.obligations.counts).some(([key, n]) => n! > 0 &&
      (v.operation !== "RESUME" || ["locks", "recalls", "unknown_outcomes"].includes(key))) ? "PENDING_DRAIN"
    : v.operation === "MOVE_ASSIGNMENT" && [v.source_budget_return, v.destination_budget_grant, v.economic_settlement].some(s => s.state !== "APPLIED") ? "ASSIGNMENT_RECEIPTS_REQUIRED"
    : v.operation === "ARCHIVE" && (v.remaining_budget === null || !zero(v.remaining_budget)) ? "BUDGET_NOT_DRAINED"
    : v.operation === "ARCHIVE" && (v.lifecycle === "ACTIVE" || p.inherited_restriction || !p.residual_disposition_receipt_ref) ? "ARCHIVE_DISPOSITION_REQUIRED"
    : v.operation === "CREATE_PAPER_MONITOR" && v.monitor.state === "NOT_PROVISIONED" ? "MONITOR_NOT_PROVISIONED"
    : v.operation === "REACTIVATE" ? "REACTIVATION_REVIEW_REQUIRED" : null;
  if (v.operation === "MOVE_ASSIGNMENT" && (!v.source_portfolio_id || !v.destination_portfolio_id || v.source_portfolio_id === v.destination_portfolio_id))
    throw new Error("WORKFLOW_DISTINCT_ASSIGNMENT_REQUIRED");
  return workflowLifecycle.parse({ ...v, state: reason === "PENDING_DRAIN" ? "PENDING_DRAIN" : reason ? "BLOCKED" : "READY_FOR_AUTHORITY_REVIEW", reason_code: reason });
}

export function readWorkflowState(state: z.infer<typeof workflowReadState>["state"], context: Pick<Context, "source_as_of_ms" | "observed_at_ms">,
  allowLastKnown = false) {
  const map = {
    LOADING: [false, "LOADING", "NONE"], AUTHORIZED_EMPTY: [true, "NO_AUTHORIZED_RESULTS", "NONE"], READY: [true, "READY", "NONE"],
    PARTIAL: [true, "PARTIAL_DATA", "REFRESH_ONCE"], STALE: [allowLastKnown, "STALE_DATA", "REFRESH_ONCE"],
    UNAVAILABLE: [false, "DATA_UNAVAILABLE", "REFRESH_ONCE"], DENIED: [false, "ACCESS_REQUIRED", "REQUEST_ACCESS"],
    REVOKED: [false, "ACCESS_REVOKED", "DISCARD_AND_REFRESH"], DISCONNECTED: [allowLastKnown, "DISCONNECTED", "REFRESH_ONCE"],
    RESYNC_REQUIRED: [false, "REFRESH_REQUIRED", "DISCARD_AND_REFRESH"],
    INSUFFICIENT_EVIDENCE: [true, "MORE_EVIDENCE_REQUIRED", "NONE"], OUTCOME_UNKNOWN: [true, "QUERY_SAME_INTENT", "QUERY_SAME_INTENT"],
  } as const;
  const [may_display_data, public_copy_key, next_action] = map[state];
  return workflowReadState.parse({ state, ...context, may_display_data, public_copy_key, next_action });
}

/** Serialize only fixed, same-origin product context; never an arbitrary redirect. */
export function governanceWorkflowLink(input: z.infer<typeof workflowNavigation>): string {
  const v = workflowNavigation.parse(input);
  if (!v.origin) throw new Error("WORKFLOW_GOVERNANCE_ORIGIN_REQUIRED");
  const params = new URLSearchParams({ workspace_id: v.workspace_id });
  const route = { R1: "r1", R2: "r2", LIVE_GATE: "live", PAPER_EXIT: "paper-exit" }[v.origin.gate];
  // Existing governance readers resolve immutable evidence/current rights themselves.
  return v.origin.gate === "PAPER_EXIT"
    ? `/governance/exit-reviews/${encodeURIComponent(v.origin.review_id!)}?${params}`
    : `/governance/approvals/${encodeURIComponent(v.origin.approval_id)}/${route}?${params}`;
}
