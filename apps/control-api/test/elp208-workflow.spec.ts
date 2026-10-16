/** TEST_ONLY synthetic projection evidence: no source, transport or product authority. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { commandStatus, type CommandStatus } from "../src/execution-v2/command.contract";
import { workflowContext, workflowCreate, workflowNavigation } from "../src/execution-v2/workflow.contract";
import { capitalWorkflow, createWorkflow, governanceWorkflowLink, lifecycleWorkflow, readWorkflowState,
  type LifecyclePrerequisites } from "../src/execution-v2/workflow";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const shared = JSON.parse(readFileSync(resolve(root, "fixtures/execution-trusted-commands.synthetic.valid.json"), "utf8"));
const now = 1792100000000;
type Context = z.infer<typeof workflowContext>;
type CreateInput = Parameters<typeof createWorkflow>[0];
type LifecycleInput = Parameters<typeof lifecycleWorkflow>[0];
type Navigation = z.infer<typeof workflowNavigation>;
const context = (patch: Partial<Context> = {}): Context => ({ workspace_id: "TEST_ONLY:workspace", environment: "paper",
  resource: { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" }, policy_revision: "TEST_ONLY:policy1",
  snapshot_ref: "TEST_ONLY:snapshot", source_as_of_ms: now - 60000, observed_at_ms: now, ...patch });
const readContext = () => ({ source_as_of_ms: now - 60000, observed_at_ms: now });
const applied = (receipt: string) => ({ state: "APPLIED" as const, receipt_ref: `TEST_ONLY:${receipt}` });
const absent = () => ({ state: "NOT_REQUIRED" as const, receipt_ref: null });
const createInput = (patch: Partial<CreateInput> = {}): CreateInput => ({ context: context(),
  requested_economic_capital: "0", requested_initial_budget: "0", currency: "USDT",
  create: applied("registration"), fund: absent(), initial_grant: absent(), ...patch });
const status = (patch: Partial<CommandStatus> = {}): CommandStatus => commandStatus.parse({ ...shared.ack_only, ...patch });
const business = (state: CommandStatus["business"]["state"] = "APPLIED", amounts = {
  requested: "100.000000000000000001", applied: "100.000000000000000001", pending: "0", cancelled: "0", rejected: "0",
}): CommandStatus["business"] => ({ state, receipt_ref: "TEST_ONLY:receipt", source_event_ref: "TEST_ONLY:event",
  revision: "9007199254740993", amounts });
const counts = () => ({ positions: 0, working_orders: 0, reservations: 0, unknown_outcomes: 0,
  locks: 0, recalls: 0, settlements: 0, active_children: 0 });
const prerequisites = (patch: Partial<LifecyclePrerequisites> = {}): LifecyclePrerequisites => ({
  current_source_access: true, current_destination_access: true, exact_instance_selected: true,
  source_operation_qualified: true, inherited_restriction: false,
  residual_disposition_receipt_ref: "TEST_ONLY:residual-disposition", ...patch });
const lifecycleInput = (patch: Partial<LifecycleInput> = {}): LifecycleInput => ({ context: context({ resource: {
  kind: "DEPLOYMENT", id: "TEST_ONLY:deployment" } }), operation: "MOVE_ASSIGNMENT", financial_stage: "PAPER", lifecycle: "ACTIVE",
  obligations: { counts: counts(), coverage: "COMPLETE", freshness: "FRESH", source_receipt_ref: "TEST_ONLY:census" },
  source_portfolio_id: "TEST_ONLY:source-portfolio", destination_portfolio_id: "TEST_ONLY:destination-portfolio",
  remaining_budget: "0", source_budget_return: applied("return"), destination_budget_grant: applied("grant"),
  economic_settlement: applied("settlement"), monitor: { state: "NOT_PROVISIONED", deployment_id: null,
    origin_deployment_id: null, alpha_version_id: null, params_digest: null, lineage_receipt_ref: null,
    reason: null, effective_at_ms: null, approved_config_digest: null,
    last_observation_ms: null, virtual_capital: null, currency: null }, ...patch });
const navigation = (patch: Partial<Navigation> = {}): Navigation => ({ schema_version: "portal.execution.workflow-navigation.v1",
  workspace_id: "TEST_ONLY:workspace", view: "MANAGER", financial_stage_filter: "ALL", lifecycle_filter: "ACTIVE",
  environment: null, currency: "USDT", window: { from_ms: now - 86400000, to_ms: now },
  portfolio_id: "TEST_ONLY:portfolio", alpha_id: null, deployment_id: null, query_revision: "TEST_ONLY:query",
  origin: { run_id: "TEST_ONLY:run", release_candidate_id: "TEST_ONLY:rc", approval_id: "TEST_ONLY:approval",
    gate: "R1", review_id: null, evidence_set_hash: `sha256:${"a".repeat(64)}` },
  economic_aggregation: "EXPLICIT_AUTHORIZED_PARTITION_ONLY", saved_view_grants_access: false, ...patch });

describe("ELP2-08 create workflow — separate receipts, never automatic trading", () => {
  it("reuses the explicitly synthetic command fixture, not a product receipt", () => {
    expect(shared.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(status().authority).toBe("TEST_ONLY");
  });
  it.each(["0", "0.000000000000000000"]) ("T08-02 explicit zero %s never invents seed capital", amount => {
    const v = createWorkflow(createInput({ requested_economic_capital: amount, requested_initial_budget: amount }));
    expect(v.state).toBe("CREATED_ZERO_CAPITAL");
    expect(v.requested_economic_capital).toBe(amount);
    expect(v.fund.state).toBe("NOT_REQUIRED");
    expect(v.initial_grant.state).toBe("NOT_REQUIRED");
    expect(v.automatic_activation).toBe(false);
    expect(v.physical_transfer_performed).toBe(false);
    expect(v.trading_readiness).toBe("SEPARATE_AUTHORITY_REQUIRED");
  });
  it("T08-02 registration alone is CREATED_UNFUNDED, not funding or readiness", () => {
    const v = createWorkflow(createInput({ requested_economic_capital: "100.000000000000000001",
      requested_initial_budget: "20", fund: { state: "NOT_REQUESTED", receipt_ref: null },
      initial_grant: { state: "NOT_REQUESTED", receipt_ref: null } }));
    expect(v.state).toBe("CREATED_UNFUNDED");
    expect(v.create.receipt_ref).toBe("TEST_ONLY:registration");
    expect(v.fund.receipt_ref).toBeNull();
    expect(v.initial_grant.receipt_ref).toBeNull();
  });
  it("T08-02 three separate applied steps preserve exact amounts and separate authority", () => {
    const v = createWorkflow(createInput({ requested_economic_capital: "100.000000000000000001",
      requested_initial_budget: "20.000000000000000001", fund: applied("fund"), initial_grant: applied("initial-grant") }));
    expect(v.state).toBe("CREATED_WITH_CAPITAL");
    expect([v.create.receipt_ref, v.fund.receipt_ref, v.initial_grant.receipt_ref]).toEqual([
      "TEST_ONLY:registration", "TEST_ONLY:fund", "TEST_ONLY:initial-grant",
    ]);
    expect(v.requested_initial_budget).toBe("20.000000000000000001");
    expect(v.automatic_activation).toBe(false);
    expect(v.trading_readiness).toBe("SEPARATE_AUTHORITY_REQUIRED");
  });
  it.each([
    ["DRAFT", "NOT_REQUESTED", "NOT_REQUESTED", "NOT_REQUESTED"],
    ["CREATE_PENDING", "PENDING", "NOT_REQUESTED", "NOT_REQUESTED"],
    ["FUNDING_PENDING", "APPLIED", "PENDING", "NOT_REQUESTED"],
    ["BUDGET_PENDING", "APPLIED", "APPLIED", "PENDING"],
    ["OUTCOME_UNKNOWN", "APPLIED", "UNKNOWN", "NOT_REQUESTED"],
    ["REJECTED", "APPLIED", "REJECTED", "NOT_REQUESTED"],
  ] as const)("T08-02 %s is derived from sourced step states", (expected, create, fund, grant) => {
    const step = (state: CreateInput["create"]["state"]) => ({ state, receipt_ref: state === "APPLIED" ? `TEST_ONLY:${state}` : null });
    const v = createWorkflow(createInput({ requested_economic_capital: "100", requested_initial_budget: "20",
      create: step(create), fund: step(fund), initial_grant: step(grant) }));
    expect(v.state).toBe(expected);
    expect(v.automatic_activation).toBe(false);
  });
  it("rejects missing applied receipt, missing explicit zero and funds preceding creation", () => {
    expect(() => createWorkflow(createInput({ create: { state: "APPLIED", receipt_ref: null } }))).toThrow();
    expect(() => createWorkflow(createInput({ requested_economic_capital: "100" }))).toThrow();
    expect(() => createWorkflow(createInput({ requested_initial_budget: "1" }))).toThrow();
    expect(() => createWorkflow(createInput({ fund: { state: "NOT_REQUESTED", receipt_ref: null } }))).toThrow();
    expect(() => createWorkflow(createInput({ create: { state: "PENDING", receipt_ref: null }, requested_economic_capital: "100",
      fund: applied("fund") }))).toThrow();
  });
  it("rejects a forged funded headline without an independent funding receipt", () => {
    const v = createWorkflow(createInput({ requested_economic_capital: "100", fund: { state: "NOT_REQUESTED", receipt_ref: null } }));
    expect(workflowCreate.safeParse({ ...v, state: "CREATED_WITH_CAPITAL" }).success).toBe(false);
  });
});

describe("ELP2-08 capital receipt projections — no ledger or transport side effect", () => {
  it.each([
    ["FUND", "ECONOMIC_ASSIGNMENT"], ["TOP_UP", "MANAGEMENT_BUDGET"], ["INITIAL_GRANT", "MANAGEMENT_BUDGET"],
    ["RECALL_PARTIAL", "MANAGEMENT_BUDGET"], ["SET_ROOT_LIMIT", "NOMINAL_ROOT_CAP"],
  ] as const)("T08-03 %s has its distinct effect kind", (operation, effect) => {
    const v = capitalWorkflow(context(), "USDT", status({ operation }));
    expect(v.effect_kind).toBe(effect);
    expect(v.physical_transfer_performed).toBe(false);
    expect(v.after_submit_cancel).toBe("SEPARATE_CANCEL_REMAINING_AUTHORITY_REQUIRED");
  });
  it("T08-10 ACK plus CURRENT still means unknown business and query the original intent", () => {
    const v = capitalWorkflow(context(), "USDT", status({ projection: "CURRENT", venue: "UNKNOWN" }));
    expect(v.status.delivery).toBe("ACKNOWLEDGED");
    expect(v.status.business.state).toBe("UNKNOWN");
    expect(v.status.business.amounts).toBeNull();
    expect(v.public_copy_key).toBe("QUERY_SAME_INTENT");
    expect(v.automatic_resend).toBe(false);
    expect(v.refresh).toBe("GET_ORIGINAL_COMMAND_NO_RESUBMIT");
    expect(v.form_cancel).toBe("DISCARD_LOCAL_DRAFT_ONLY");
  });
  it("T08-04 immediate decrease rejection is not converted into a recall", () => {
    const v = capitalWorkflow(context(), "USDT", status({ operation: "IMMEDIATE_DECREASE", business: business("REJECTED", {
      requested: "100.000000000000000001", applied: "0", pending: "0", cancelled: "0", rejected: "100.000000000000000001",
    }) }));
    expect(v.status.operation).toBe("IMMEDIATE_DECREASE");
    expect(v.public_copy_key).toBe("SOURCE_REJECTED");
    expect(v.status.business.amounts?.pending).toBe("0");
  });
  it("T08-04/05 pending recall preserves the exact five-way partition", () => {
    const amounts = { requested: "100.000000000000000001", applied: "40.000000000000000001", pending: "60", cancelled: "0", rejected: "0" };
    const v = capitalWorkflow(context(), "USDT", status({ operation: "RECALL_PARTIAL", business: business("PARTIALLY_APPLIED", amounts) }));
    expect(v.status.business.amounts).toEqual(amounts);
    expect(v.public_copy_key).toBe("PARTIAL_REMAINDER_PENDING");
    expect(v.status.business.revision).toBe("9007199254740993");
    expect(v.status.projection).toBe("CATCHING_UP");
    expect(v.status.venue).toBe("UNKNOWN");
  });
  it("T08-05 cancel remaining keeps applied capital, not a generic cancelled success", () => {
    const amounts = { requested: "100.000000000000000001", applied: "40.000000000000000001", pending: "0", cancelled: "60", rejected: "0" };
    const v = capitalWorkflow(context(), "USDT", status({ operation: "RECALL_PARTIAL", business: business("PARTIALLY_APPLIED_CANCELLED", amounts) }));
    expect(v.public_copy_key).toBe("APPLIED_PART_RETAINED");
    expect(v.status.business.amounts?.applied).toBe("40.000000000000000001");
    expect(v.automatic_resend).toBe(false);
  });
  it("T08-10 applied receipt with a stale projection does not imply venue execution", () => {
    const v = capitalWorkflow(context(), "USDT", status({ business: business(), projection: "STALE", venue: "NOT_APPLICABLE" }));
    expect(v.public_copy_key).toBe("REVIEW_RECEIPT");
    expect(v.status.business.state).toBe("APPLIED");
    expect(v.status.projection).toBe("STALE");
    expect(v.status.venue).toBe("NOT_APPLICABLE");
    expect(v.automatic_resend).toBe(false);
  });
  it("rejects invalid partition, missing causal receipt and fabricated facts on UNKNOWN", () => {
    expect(() => capitalWorkflow(context(), "USDT", status({ business: business("APPLIED", {
      requested: "100.000000000000000001", applied: "100", pending: "0", cancelled: "0", rejected: "0",
    }) }))).toThrow();
    expect(() => capitalWorkflow(context(), "USDT", status({ business: { ...business(), source_event_ref: null } }))).toThrow();
    expect(() => capitalWorkflow(context(), "USDT", status({ business: { ...business(), state: "UNKNOWN" } }))).toThrow();
  });
  it("rejects state/amount inconsistency instead of rendering APPLIED while remainder is pending", () => {
    expect(() => capitalWorkflow(context(), "USDT", status({ business: business("APPLIED", {
      requested: "100", applied: "40", pending: "60", cancelled: "0", rejected: "0",
    }) }))).toThrow();
  });
  it.each([
    { environment: "live" as const }, { resource: { kind: "PORTFOLIO" as const, id: "TEST_ONLY:other" } },
    { resource: { kind: "DEPLOYMENT" as const, id: "TEST_ONLY:portfolio" } },
  ])("rejects receipt scope mismatch %j", patch => {
    expect(() => capitalWorkflow(context(patch), "USDT", status())).toThrow();
  });
});

describe("ELP2-08 lifecycle readiness — full scoped proof, no mutations", () => {
  it("T08-07 checks current access before parsing or disclosing hidden facts", () => {
    expect(() => lifecycleWorkflow({ operation: "MOVE_ASSIGNMENT" } as LifecycleInput,
      prerequisites({ current_source_access: false }))).toThrow("WORKFLOW_CURRENT_ACCESS_REQUIRED");
    for (const operation of ["MOVE_ASSIGNMENT", "REBIND"] as const)
      expect(() => lifecycleWorkflow(lifecycleInput({ operation }), prerequisites({ current_destination_access: false })))
        .toThrow("WORKFLOW_CURRENT_ACCESS_REQUIRED");
  });
  it("T08-07 ambiguous alpha/instance never becomes action readiness", () => {
    const v = lifecycleWorkflow(lifecycleInput(), prerequisites({ exact_instance_selected: false }));
    expect(v.state).toBe("BLOCKED");
    expect(v.reason_code).toBe("EXACT_INSTANCE_REQUIRED");
    expect(v.dispatch_enabled).toBe(false);
  });
  it.each(Object.keys(counts()) as Array<keyof ReturnType<typeof counts>>)("T08-08 %s obligation keeps old assignment draining", field => {
    const input = lifecycleInput();
    input.obligations.counts[field] = 1;
    const v = lifecycleWorkflow(input, prerequisites());
    expect(v.state).toBe("PENDING_DRAIN");
    expect(v.reason_code).toBe("PENDING_DRAIN");
    expect(v.original_attribution).toBe("ORIGINAL_CAUSAL_BINDING");
    expect(v.automatic_liquidation).toBe(false);
    expect(v.automatic_order_cancel).toBe(false);
    expect(v.automatic_capital_return).toBe(false);
  });
  it.each(["source_budget_return", "destination_budget_grant", "economic_settlement"] as const)(
    "T08-08 drained assignment still requires separate %s", field => {
      const v = lifecycleWorkflow(lifecycleInput({ [field]: { state: "PENDING", receipt_ref: null } }), prerequisites());
      expect(v.state).toBe("BLOCKED");
      expect(v.reason_code).toBe("ASSIGNMENT_RECEIPTS_REQUIRED");
    });
  it("T08-08 all receipts only permit authority review; they do not apply or relabel history", () => {
    const v = lifecycleWorkflow(lifecycleInput(), prerequisites());
    expect(v.state).toBe("READY_FOR_AUTHORITY_REVIEW");
    expect(v.reason_code).toBeNull();
    expect(v.dispatch_enabled).toBe(false);
    expect(v.original_attribution).toBe("ORIGINAL_CAUSAL_BINDING");
    expect(v.source_portfolio_id).toBe("TEST_ONLY:source-portfolio");
    expect(v.destination_portfolio_id).toBe("TEST_ONLY:destination-portfolio");
  });
  it("T08-08 requires distinct selected source/destination, not a label-only move", () => {
    expect(() => lifecycleWorkflow(lifecycleInput({ destination_portfolio_id: "TEST_ONLY:source-portfolio" }), prerequisites()))
      .toThrow("WORKFLOW_DISTINCT_ASSIGNMENT_REQUIRED");
    expect(() => lifecycleWorkflow(lifecycleInput({ source_portfolio_id: null }), prerequisites())).toThrow();
  });
  it.each(["coverage", "freshness", "source_receipt_ref", "nullable_count"] as const)(
    "T08-08 unknown/stale obligations (%s) cannot masquerade as drained", field => {
      const input = lifecycleInput();
      if (field === "coverage") input.obligations.coverage = "PARTIAL";
      if (field === "freshness") input.obligations.freshness = "STALE";
      if (field === "source_receipt_ref") input.obligations.source_receipt_ref = null;
      if (field === "nullable_count") input.obligations.counts.positions = null;
      const v = lifecycleWorkflow(input, prerequisites());
      expect(v.state).toBe("BLOCKED");
      expect(v.reason_code).toBe(field === "freshness" ? "OBLIGATIONS_STALE" : "OBLIGATIONS_NOT_PUBLISHED");
    });
  it("T08-06 local unlock cannot bypass an ancestor restriction", () => {
    const v = lifecycleWorkflow(lifecycleInput({ operation: "RESUME" }), prerequisites({ inherited_restriction: true }));
    expect(v.state).toBe("BLOCKED");
    expect(v.reason_code).toBe("INHERITED_RESTRICTION");
  });
  it("T08-06 RESUME cannot erase a still-active local lock", () => {
    const input = lifecycleInput({ operation: "RESUME" });
    input.obligations.counts.locks = 1;
    expect(lifecycleWorkflow(input, prerequisites()).state).not.toBe("READY_FOR_AUTHORITY_REVIEW");
  });
  it("T08-09 rebind remains distinct and blocked until owning operation is qualified", () => {
    const v = lifecycleWorkflow(lifecycleInput({ operation: "REBIND" }), prerequisites({ source_operation_qualified: false }));
    expect(v.state).toBe("BLOCKED");
    expect(v.reason_code).toBe("BINDING_CHANGE_NOT_QUALIFIED");
    const input = lifecycleInput({ operation: "REBIND" });
    input.obligations.counts.working_orders = 1;
    expect(lifecycleWorkflow(input, prerequisites()).state).toBe("PENDING_DRAIN");
  });
  it("T08-12 keeps financial stage when archived; archive is not a stage", () => {
    const v = lifecycleWorkflow(lifecycleInput({ operation: "ARCHIVE", lifecycle: "ARCHIVED" }), prerequisites());
    expect(v.financial_stage).toBe("PAPER");
    expect(v.lifecycle).toBe("ARCHIVED");
    // PM R2 archive is terminal; preserving its financial stage cannot reopen it.
    expect(v.state).toBe("BLOCKED");
    expect(v.reason_code).toBe("REACTIVATION_REVIEW_REQUIRED");
    expect(v.automatic_live_activation).toBe(false);
  });
  it.each(["remaining_budget", "active_children", "active_lifecycle", "disposition"] as const)(
    "T08-13 archive cannot bypass %s", field => {
      const input = lifecycleInput({ operation: "ARCHIVE", lifecycle: "ARCHIVE_REQUESTED" });
      const p = prerequisites();
      if (field === "remaining_budget") input.remaining_budget = "0.000000000000000001";
      if (field === "active_children") input.obligations.counts.active_children = 1;
      if (field === "active_lifecycle") input.lifecycle = "ACTIVE";
      if (field === "disposition") p.residual_disposition_receipt_ref = null;
      const v = lifecycleWorkflow(input, p);
      expect(v.state).not.toBe("READY_FOR_AUTHORITY_REVIEW");
      expect(v.automatic_capital_return).toBe(false);
      expect(v.automatic_liquidation).toBe(false);
      expect(v.automatic_order_cancel).toBe(false);
    });
  it("T08-13 unprovisioned clone remains blocked and archive never implies reactivation", () => {
    expect(lifecycleWorkflow(lifecycleInput({ operation: "CREATE_PAPER_MONITOR" }), prerequisites()).reason_code).toBe("MONITOR_NOT_PROVISIONED");
    const v = lifecycleWorkflow(lifecycleInput({ operation: "REACTIVATE", lifecycle: "ARCHIVED" }), prerequisites());
    expect(v.reason_code).toBe("REACTIVATION_REVIEW_REQUIRED");
    expect(v.automatic_live_activation).toBe(false);
  });
  it("T08-13 Paper monitor has a separate deployment and immutable lineage", () => {
    const monitor: LifecycleInput["monitor"] = { state: "RUNNING", deployment_id: "TEST_ONLY:paper-monitor",
      origin_deployment_id: "TEST_ONLY:original-deployment", alpha_version_id: "TEST_ONLY:av",
      params_digest: `sha256:${"b".repeat(64)}`, lineage_receipt_ref: "TEST_ONLY:clone-lineage",
      reason: "ARCHIVE_MONITOR", effective_at_ms: now - 2000, approved_config_digest: `sha256:${"c".repeat(64)}`,
      last_observation_ms: now - 1000, virtual_capital: "1000.000000000000000001", currency: "USDT" };
    const v = lifecycleWorkflow(lifecycleInput({ operation: "CREATE_PAPER_MONITOR", monitor }), prerequisites());
    expect(v.monitor).toEqual(monitor);
    expect(v.automatic_live_activation).toBe(false);
    expect(v.dispatch_enabled).toBe(false);
    for (const patch of [{ deployment_id: monitor.origin_deployment_id }, { lineage_receipt_ref: null },
      { last_observation_ms: null }, { params_digest: null }])
      expect(() => lifecycleWorkflow(lifecycleInput({ operation: "CREATE_PAPER_MONITOR", monitor: { ...monitor, ...patch } }), prerequisites())).toThrow();
  });
  it("rejects lifecycle/stage environment mismatch instead of changing economics", () => {
    expect(() => lifecycleWorkflow(lifecycleInput({ financial_stage: "LIVE" }), prerequisites())).toThrow();
    expect(() => lifecycleWorkflow(lifecycleInput({ context: context({ environment: "sandbox" }), financial_stage: "PAPER" }), prerequisites())).toThrow();
    expect(lifecycleWorkflow(lifecycleInput({ context: context({ environment: "live" }), financial_stage: "CANARY" }), prerequisites()).financial_stage).toBe("CANARY");
  });
  it("T08-13 archived resource cannot resume/move/rebind via readiness", () => {
    for (const operation of ["RESUME", "MOVE_ASSIGNMENT", "REBIND"] as const)
      expect(lifecycleWorkflow(lifecycleInput({ operation, lifecycle: "ARCHIVED" }), prerequisites()).reason_code).toBe("REACTIVATION_REVIEW_REQUIRED");
  });
});

describe("ELP2-08 common read and navigation states", () => {
  it.each(["DENIED", "REVOKED", "RESYNC_REQUIRED", "UNAVAILABLE"] as const)(
    "T08-10 %s cannot show old data even when last-known display was requested", state => {
      const v = readWorkflowState(state, readContext(), true);
      expect(v.may_display_data).toBe(false);
      expect(v.source_as_of_ms).toBe(now - 60000);
      expect(v.observed_at_ms).toBe(now);
      if (state === "REVOKED") expect(v.next_action).toBe("DISCARD_AND_REFRESH");
    });
  it.each(["STALE", "DISCONNECTED"] as const)("T08-10 %s last-known policy is explicit, not an available zero", state => {
    expect(readWorkflowState(state, readContext()).may_display_data).toBe(false);
    expect(readWorkflowState(state, readContext(), true).may_display_data).toBe(true);
    expect(readWorkflowState(state, readContext(), true).next_action).toBe("REFRESH_ONCE");
  });
  it("T08-10 distinguishes authorized empty, partial, insufficient evidence and unknown outcome", () => {
    expect(readWorkflowState("AUTHORIZED_EMPTY", readContext()).public_copy_key).toBe("NO_AUTHORIZED_RESULTS");
    expect(readWorkflowState("PARTIAL", readContext()).next_action).toBe("REFRESH_ONCE");
    expect(readWorkflowState("INSUFFICIENT_EVIDENCE", readContext()).public_copy_key).toBe("MORE_EVIDENCE_REQUIRED");
    expect(readWorkflowState("OUTCOME_UNKNOWN", readContext()).next_action).toBe("QUERY_SAME_INTENT");
    expect(readWorkflowState("READY", { source_as_of_ms: null, observed_at_ms: now }).source_as_of_ms).toBeNull();
  });
  it.each([["PAPER", "paper"], ["SANDBOX", "sandbox"], ["CANARY", "live"], ["LIVE", "live"]] as const)(
    "T08-12 %s uses its explicit environment, with lifecycle separate", (stage, environment) => {
      const v = workflowNavigation.parse(navigation({ financial_stage_filter: stage, environment, lifecycle_filter: "ARCHIVED" }));
      expect(v.financial_stage_filter).toBe(stage);
      expect(v.lifecycle_filter).toBe("ARCHIVED");
      expect(v.economic_aggregation).toBe("EXPLICIT_AUTHORIZED_PARTITION_ONLY");
      expect(v.saved_view_grants_access).toBe(false);
    });
  it("T08-11/12 All is navigation only, not actual+virtual NAV permission", () => {
    const v = workflowNavigation.parse(navigation());
    expect(v.financial_stage_filter).toBe("ALL");
    expect(v.environment).toBeNull();
    expect(v.economic_aggregation).toBe("EXPLICIT_AUTHORIZED_PARTITION_ONLY");
    expect(workflowNavigation.safeParse({ ...v, financial_stage_filter: "RESEARCH" }).success).toBe(false);
    expect(workflowNavigation.safeParse({ ...v, financial_stage_filter: "PAPER", environment: "live" }).success).toBe(false);
    expect(workflowNavigation.safeParse({ ...v, window: { from_ms: now, to_ms: now } }).success).toBe(false);
  });
  it.each([["R1", "r1"], ["R2", "r2"], ["LIVE_GATE", "live"]] as const)(
    "T08-11 Governance %s keeps the exact existing gate path and workspace", (gate, suffix) => {
      const n = navigation();
      n.origin!.gate = gate;
      const url = governanceWorkflowLink(n);
      expect(url).toBe(`/governance/approvals/TEST_ONLY%3Aapproval/${suffix}?workspace_id=TEST_ONLY%3Aworkspace`);
      expect(new URL(url, "https://test.invalid").origin).toBe("https://test.invalid");
    });
  it("T08-11 Paper Exit uses the review id, not the approval id or R1 executor", () => {
    const n = navigation();
    n.origin = { ...n.origin!, gate: "PAPER_EXIT", review_id: "TEST_ONLY:review" };
    expect(governanceWorkflowLink(n)).toBe("/governance/exit-reviews/TEST_ONLY%3Areview?workspace_id=TEST_ONLY%3Aworkspace");
    expect(() => governanceWorkflowLink({ ...n, origin: { ...n.origin!, review_id: null } })).toThrow();
    expect(() => governanceWorkflowLink({ ...n, origin: null })).toThrow("WORKFLOW_GOVERNANCE_ORIGIN_REQUIRED");
  });
  it("T08-11 encodes hostile identifiers as same-origin data and accepts no redirect", () => {
    const n = navigation({ workspace_id: "TEST_ONLY:workspace&admin=true#next" });
    n.origin!.approval_id = "//foreign.invalid/path?x=1#fragment";
    const result = governanceWorkflowLink(n);
    const url = new URL(result, "https://test.invalid");
    expect(url.origin).toBe("https://test.invalid");
    expect(url.searchParams.get("workspace_id")).toBe(n.workspace_id);
    expect(url.searchParams.has("admin")).toBe(false);
    expect(url.hash).toBe("");
    expect(workflowNavigation.safeParse({ ...n, redirect: "https://foreign.invalid" }).success).toBe(false);
  });
});
