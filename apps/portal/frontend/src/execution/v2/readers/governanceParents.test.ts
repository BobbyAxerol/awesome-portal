/**
 * V2 parent readers against the canonical fixtures Codex published
 * (`execution-positive-parent.synthetic.valid.json`,
 * `execution-live-source.synthetic.valid.json`), read from disk by
 * `loadCanonical`. The negative cases are mutations of those files, never a
 * second copy of them.
 *
 * Every fixture is `TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`
 * (`runtime_qualified=false`): this proves the reader against the contract, not
 * against a real API.
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../testkit/loadCanonical";
import {
  arrayCases, decimalCases, enumCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases,
  schemaVersionCases, stringCases, type NegativeCase,
} from "../testkit/negative";
import {
  FOLLOWING_PARENT_V2_SCHEMA,
  GOVERNANCE_PARENT_OPERATION_V2_SCHEMA,
  GOVERNANCE_PARENT_V2_SCHEMA,
  LIVE_PARENT_V2_SCHEMA,
  readCanaryParentV2,
  readGovernanceParentV2,
  readLiveParentV2,
  readOperationParentV2,
  readPaperExitParentV2,
  readR2ParentV2,
  readSandboxParentV2,
  type CanaryParentV2,
  type OperationParentV2,
  type PaperExitParentV2,
  type SandboxParentV2,
} from "./governanceParents";
import { LIVE_SOURCE_PANELS, LIVE_SOURCE_V2_SCHEMA, readLiveSourceOperationsV2 } from "./liveSourceOperations";

type Fixture = Record<string, any>;
const parent = () => loadCanonical<Fixture>("execution-positive-parent.synthetic");
const liveSource = () => loadCanonical<Fixture>("execution-live-source.synthetic");

function must<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`${what} was refused`);
  return value;
}

describe("the canonical files are what this suite thinks they are", () => {
  it("both are synthetic, unqualified receipts", () => {
    for (const file of [parent(), liveSource()]) {
      expect(file.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
      expect(file.runtime_qualified).toBe(false);
      expect(file.authority_installed).toBe(false);
    }
  });

  it("carries the 22 parent bodies and 2 compositions this suite covers", () => {
    const keys = Object.keys(parent()).filter((key) => typeof parent()[key] === "object");
    expect(keys.sort()).toEqual([
      "canary", "canary_absent", "canary_revision", "live", "live_composition", "paper_exit", "paper_exit_absent",
      "paper_exit_composition", "paper_exit_extended", "paper_exit_operation", "paper_exit_operation_applied",
      "paper_exit_operation_expired", "r2", "r2_absent", "r2_composition", "r2_operation", "r2_operation_applied",
      "r2_operation_expired", "r2_operation_uncaptured", "sandbox", "sandbox_absent", "sandbox_draft",
    ]);
  });
});

describe("R2 parent", () => {
  it("exposes the published lineage, its ids and the approval clocks", () => {
    const r2 = must(readR2ParentV2(parent().r2), "r2");
    expect(r2.family).toBe("R2");
    expect(r2.lineage).toEqual({
      availability: "AVAILABLE", basis: "STORED_IMMUTABLE_REFERENCE", r1ApprovalId: "apr_TEST_ONLY_r1",
      observedRiskGrantId: "grant_TEST_ONLY_historical", currency: "TEST_ONLY:USD",
    });
    expect(r2.approval).toMatchObject({
      approvalId: "apr_TEST_ONLY_r2", gate: "R2", status: "EXPIRED", approvalVersion: 1, policyVersion: "TEST_ONLY:policy-v1",
      quorumRequired: 2, quorumMet: 0, evidenceComplete: false, decidedAt: null,
    });
    expect(r2.approval.createdAt).toBe(1790812800000);
    expect(r2.approval.slaDueAt).toBe(1790899200000);
    expect(r2.approval.expiresAt).toBe(1790985600000);
    expect(r2.anchors).toEqual({ deploymentId: "dep_TEST_ONLY_parent", portfolioId: "pf_TEST_ONLY_parent", environment: "PAPER" });
    expect(r2.header.source).toEqual({ authority: "PORTAL", sourceVerdict: "NOT_ASSERTED", sourceSideEffectRequested: false });
  });

  it("types the absence of lineage with the reason the server gave, not an empty one", () => {
    const r2 = must(readR2ParentV2(parent().r2_absent), "r2_absent");
    expect(r2.lineage).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
  });

  it("names what the body never carries, with the FE request that will publish it", () => {
    const r2 = must(readR2ParentV2(parent().r2), "r2");
    expect(r2.notPublished).toMatchObject({ criteria: "FE-028", capitalRows: "FE-030", decisionCall: "FE-030", creator: "FE-030" });
    // It has no capital, no requested amount and no decision context: none is invented.
    expect(JSON.stringify(r2)).not.toMatch(/capital":\[|requestedAmount|decisionContext/);
  });
});

describe("Paper Exit parent", () => {
  it("exposes panels and findings as published: outcome, blocking, required", () => {
    const exit = must(readPaperExitParentV2(parent().paper_exit), "paper_exit") as PaperExitParentV2;
    expect(exit.evaluation.availability).toBe("AVAILABLE");
    if (exit.evaluation.availability !== "AVAILABLE") throw new Error("unreachable");
    expect(exit.evaluation.panels.map((panel) => panel.panelKind)).toEqual(["OBSERVATION_COVERAGE", "DRIFT", "LIMITS_HEALTH", "PORTFOLIO_FIT"]);
    expect(exit.evaluation.findings.map((f) => [f.outcome, f.blocking, f.required])).toEqual([
      ["PASS", false, true], ["INSUFFICIENT", true, true], ["INSUFFICIENT", true, true], ["INSUFFICIENT", true, true],
    ]);
    expect(exit.evaluation.panels[1]).toMatchObject({ panelState: "UNAVAILABLE", asOf: null, freshness: "UNKNOWN" });
    expect(exit.evaluation.panels[0]).toMatchObject({ pollIntervalMs: 1000, sourceCompleteness: "POLL_BOUNDED" });
    expect(exit.lineage).toMatchObject({
      availability: "AVAILABLE", r1ApprovalId: "apr_TEST_ONLY_r1", r2ApprovalId: "apr_TEST_ONLY_r2",
      sourceSnapshotHash: `sha256:${"1".repeat(64)}`, evidenceSetHash: `sha256:${"2".repeat(64)}`,
    });
    // quorum is published (2), the old reader said null.
    expect(exit.approval.quorumRequired).toBe(2);
    // No label/observed/limit and no gate verdict on the wire: the model names them, never fills them.
    expect(exit.notPublished).toMatchObject({ criteriaLabel: "FE-028", observedAndLimit: "FE-028", gateVerdict: "FE-028" });
    expect(JSON.stringify(exit.evaluation)).not.toMatch(/label|observed|limit|gateMet/);
  });

  it("reads the extended review and the absent sections", () => {
    const extended = must(readPaperExitParentV2(parent().paper_exit_extended), "paper_exit_extended");
    expect(extended.review).toMatchObject({ reviewState: "EXTENDED", reviewVersion: 2, extensionDays: 14, extendedUntil: 1792022400000 });
    const absent = must(readPaperExitParentV2(parent().paper_exit_absent), "paper_exit_absent");
    expect(absent.evaluation).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
    expect(absent.lineage).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
  });
});

describe("following parents", () => {
  it("Sandbox: seven steps in order, NOT_RECORDED is not a failure, the three effect flags are false", () => {
    const sandbox = must(readSandboxParentV2(parent().sandbox), "sandbox") as SandboxParentV2;
    expect(sandbox.header.source).toEqual({
      authority: "PORTAL", sourceVerdict: "NOT_ASSERTED", sourceSideEffectRequested: false,
      runtimeActivationRequested: false, promotionExecutionRequested: false,
    });
    expect(sandbox.certification).toMatchObject({ workflowState: "APPROVED", workflowVersion: 3, sourceIntegrationState: "UNAVAILABLE" });
    if (sandbox.steps.availability !== "AVAILABLE") throw new Error("steps absent");
    expect(sandbox.steps.items.map((s) => s.stepKey)).toEqual(["CONNECT", "SYNC", "ORDER_TYPES", "RECONCILIATION", "TIMEBOXED_RUN", "CLEANUP", "EXIT_REVIEW"]);
    expect(sandbox.steps.items[0]).toMatchObject({ recorded: true, storedEvaluation: "PASS", sourceVerification: "VERIFIED", asOf: 1790812800000 });
    expect(sandbox.steps.items[4]).toMatchObject({ recorded: false, storedEvaluation: null, evidenceId: null });
    expect(sandbox.lineage).toMatchObject({ availability: "AVAILABLE", promotionGrantId: "grant_TEST_ONLY_parent", r2ApprovalId: "apr_TEST_ONLY_r2" });
    expect(sandbox.acceptedManagerFacts).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION" });
  });

  it("Sandbox: the absent and draft bodies", () => {
    for (const key of ["sandbox_absent", "sandbox_draft"]) {
      const sandbox = must(readSandboxParentV2(parent()[key]), key);
      expect(sandbox.steps).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
      expect(sandbox.lineage.availability).toBe("NOT_PUBLISHED");
    }
    expect(must(readSandboxParentV2(parent().sandbox_draft), "draft").certification).toMatchObject({ workflowState: "DRAFT", submittedAt: null, decidedAt: null });
  });

  it("Canary: the proposal keeps every digit and is proposed, never effective", () => {
    const canary = must(readCanaryParentV2(parent().canary), "canary") as CanaryParentV2;
    if (canary.proposal.availability !== "AVAILABLE") throw new Error("proposal absent");
    expect(canary.proposal.basis).toBe("PROPOSED_NOT_EFFECTIVE");
    expect(canary.proposal.capitalCap.exact).toBe("9007199254740993.123456789123456789");
    expect(canary.proposal.grossNotionalCap.exact).toBe("9007199254740994.000000000000000001");
    expect(canary.proposal.dailyLossCap.exact).toBe("0.000000000000000001");
    // Displays as 0.00 and is not zero: the screen must print `exact` when `zero` is false.
    expect(canary.proposal.dailyLossCap.decimal.zero).toBe(false);
    expect(canary.proposal.maxOpenOrders).toBe(10);
    expect(canary.envelope).toMatchObject({ status: "DRAFT", revision: 1, previousEnvelopeId: null, productionCommandActive: false });
    expect(canary.anchors).toMatchObject({ environment: "LIVE", capturedEnvironmentAttested: false });
    expect(canary.lineage).toMatchObject({ availability: "AVAILABLE", certificationId: "cert_TEST_ONLY_parent", promotionPlanId: "plan_TEST_ONLY_parent" });
  });

  it("Canary: the absent body and the revision", () => {
    const absent = must(readCanaryParentV2(parent().canary_absent), "canary_absent");
    expect(absent.proposal).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
    expect(absent.lineage.availability).toBe("NOT_PUBLISHED");
    const revision = must(readCanaryParentV2(parent().canary_revision), "canary_revision");
    expect(revision.envelope).toMatchObject({ revision: 2, previousEnvelopeId: "env_TEST_ONLY_parent" });
  });
});

describe("Live parent", () => {
  it("carries the approval and nothing else: no portfolio, no lineage, no backbone", () => {
    const live = must(readLiveParentV2(parent().live), "live");
    expect(live.approval).toMatchObject({ approvalId: "apr_TEST_ONLY_live", gate: "LIVE_GATE", status: "PENDING" });
    expect(live.anchors).toEqual({ deploymentId: "dep_TEST_ONLY_parent", environment: "LIVE" });
    expect(live.header.source.runtimeActivationRequested).toBe(false);
    expect(live.acceptedManagerFacts.reasonCode).toBe("PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION");
    expect(live.notPublished).toMatchObject({ governanceBackbone: "FE-028", canaryBranches: "FE-029", liveFacts: "FE-029" });
    expect(JSON.stringify(live)).not.toMatch(/portfolio|lineage/);
  });
});

describe("operation parents", () => {
  const cases: [string, "R2" | "PAPER_EXIT", OperationParentV2["operation"]["status"], boolean][] = [
    ["r2_operation", "R2", "PLANNED", true],
    ["r2_operation_uncaptured", "R2", "PLANNED", false],
    ["r2_operation_applied", "R2", "APPLIED", true],
    ["r2_operation_expired", "R2", "EXPIRED", true],
    ["paper_exit_operation", "PAPER_EXIT", "PLANNED", false],
    ["paper_exit_operation_applied", "PAPER_EXIT", "APPLIED", false],
    ["paper_exit_operation_expired", "PAPER_EXIT", "EXPIRED", false],
  ];
  it.each(cases)("%s", (key, family, status, captured) => {
    const op = must(readOperationParentV2(parent()[key]), key);
    expect(op.family).toBe(family);
    expect(op.operation.status).toBe(status);
    expect(op.operation.capturedParent !== null).toBe(captured);
    expect((op.operation.appliedAt !== null)).toBe(status === "APPLIED");
    expect(op.operation.expectedVersion).toBe(1);
  });

  it("keeps the captured R1 pin whole and says nothing about the approval link", () => {
    const op = must(readOperationParentV2(parent().r2_operation), "r2_operation");
    expect(op.operation.capturedParent).toEqual({
      approvalId: "apr_TEST_ONLY_r1", approvalVersion: 1, evidenceSetHash: `sha256:${"3".repeat(64)}`,
    });
    expect(op.notPublished).toMatchObject({ operationLink: "FE-030", receiptRef: "FE-030" });
  });
});

describe("compositions carry the same parent bodies", () => {
  it("reads the parent inside the three parent compositions with the matching reader", () => {
    const p = parent();
    expect(readR2ParentV2(p.r2_composition.data.governance)).not.toBeNull();
    expect(readPaperExitParentV2(p.paper_exit_composition.data.exit_review)).not.toBeNull();
    expect(readLiveParentV2(p.live_composition.data.governance)).not.toBeNull();
  });
});

describe("readGovernanceParentV2 routes every delivered body to its family", () => {
  const expected: Record<string, string> = {
    r2: "R2", r2_absent: "R2", paper_exit: "PAPER_EXIT", paper_exit_absent: "PAPER_EXIT", paper_exit_extended: "PAPER_EXIT",
    r2_operation: "R2", r2_operation_uncaptured: "R2", r2_operation_applied: "R2", r2_operation_expired: "R2",
    paper_exit_operation: "PAPER_EXIT", paper_exit_operation_applied: "PAPER_EXIT", paper_exit_operation_expired: "PAPER_EXIT",
    sandbox: "SANDBOX", sandbox_absent: "SANDBOX", sandbox_draft: "SANDBOX", canary: "CANARY", canary_absent: "CANARY",
    canary_revision: "CANARY", live: "LIVE_GATE",
  };
  it.each(Object.entries(expected))("%s -> %s", (key, family) => {
    expect(readGovernanceParentV2(parent()[key])?.family).toBe(family);
  });
});

describe("live-source operations", () => {
  it("reads the populated body: eleven panels, retained, partial, no total, no clock", () => {
    const live = must(readLiveSourceOperationsV2(liveSource().populated), "populated");
    expect(Object.keys(live.panels)).toEqual([...LIVE_SOURCE_PANELS]);
    expect(live.realtimeActive).toBe(false);
    expect(live.commandsEnabled).toBe(false);
    expect(live.runtimeReasonCode).toBe("SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED");
    const deployments = live.panels.deployments;
    expect(deployments).toMatchObject({ state: "PARTIAL", grain: "DEPLOYMENT", returnedCount: 1, limit: 200, hasMore: false, sourceClockReason: "SOURCE_CLOCK_NOT_SCOPED" });
    // createdAt = 0 is a published instant, kept as one.
    expect(deployments.records[0].values.created_at_ms).toEqual({ kind: "instant", at: 0 });
    expect(live.panels.broker_sync).toMatchObject({ state: "NOT_PUBLISHED", reasonCode: "BROKER_PURPOSE_NOT_COMMISSIONED", grain: "NOT_COMMISSIONED", records: [] });
    expect(JSON.stringify(live)).not.toMatch(/exactTotal|exact_total/);
  });

  it("keeps decimals and counters as exact strings", () => {
    const live = must(readLiveSourceOperationsV2(liveSource().populated), "populated");
    const position = live.panels.positions.records[0].values;
    expect(position.quantity.kind).toBe("decimal");
    for (const value of Object.values(position)) if (value.kind === "decimal") expect(typeof value.exact).toBe("string");
    const session = live.panels.sessions.records[0].values;
    expect(session.submitted_count.kind).toBe("counter");
  });

  it("reads the unpublished body: ten panels NOT_PUBLISHED with a reason and no records", () => {
    const live = must(readLiveSourceOperationsV2(liveSource().unpublished), "unpublished");
    expect(live.panels.deployments.state).toBe("PARTIAL");
    for (const name of LIVE_SOURCE_PANELS.filter((n) => n !== "deployments")) {
      expect(live.panels[name].state).toBe("NOT_PUBLISHED");
      expect(live.panels[name].records).toEqual([]);
      expect(live.panels[name].reasonCode).toMatch(/SOURCE_PANEL_NOT_CAPTURED|BROKER_PURPOSE_NOT_COMMISSIONED/);
    }
  });
});

/* ── L3 negatives ─────────────────────────────────────────────────────────── */

type Reader = (raw: unknown) => unknown;
const READERS: [string, string, Reader][] = [
  ["r2", "r2", readR2ParentV2],
  ["paper_exit", "paper_exit", readPaperExitParentV2],
  ["sandbox", "sandbox", readSandboxParentV2],
  ["canary", "canary", readCanaryParentV2],
  ["live", "live", readLiveParentV2],
  ["r2_operation", "r2_operation", readOperationParentV2],
  ["paper_exit_operation", "paper_exit_operation", readOperationParentV2],
];

describe("L3: a swapped schema_version or family is refused by every reader", () => {
  const ALL = [GOVERNANCE_PARENT_V2_SCHEMA, GOVERNANCE_PARENT_OPERATION_V2_SCHEMA, FOLLOWING_PARENT_V2_SCHEMA, LIVE_PARENT_V2_SCHEMA];
  for (const [label, key, reader] of READERS) {
    const own = parent()[key].schema_version as string;
    const cases = schemaVersionCases(parent()[key], ["schema_version"], own, ALL.filter((v) => v !== own));
    it.each(cases.map((c) => [c.name, c] as const))(`${label}: %s`, (_name, c) => {
      expect(reader(c.value)).toBeNull();
    });
  }

  it("a body is never read by a reader of another family under the right schema_version", () => {
    const p = parent();
    // Same schema_version (governance-parent.v2), other family.
    expect(readR2ParentV2(p.paper_exit)).toBeNull();
    expect(readPaperExitParentV2(p.r2)).toBeNull();
    // Same schema_version (following-parent.v2), other family.
    expect(readSandboxParentV2(p.canary)).toBeNull();
    expect(readCanaryParentV2(p.sandbox)).toBeNull();
    // The operation reader does not take an approval body, the approval reader not an operation.
    expect(readOperationParentV2(p.r2)).toBeNull();
    expect(readR2ParentV2(p.r2_operation)).toBeNull();
    expect(readLiveParentV2(p.r2)).toBeNull();
    expect(readR2ParentV2(p.live)).toBeNull();
  });

  it("mixed shapes: a family label that disagrees with the body, or with the command, is refused", () => {
    const p = parent();
    const swapped = { ...p.r2, family: "PAPER_EXIT" };
    expect(readR2ParentV2(swapped)).toBeNull();
    expect(readPaperExitParentV2(swapped)).toBeNull();
    expect(readGovernanceParentV2(swapped)).toBeNull();
    const wrongGate = structuredClone(p.r2);
    wrongGate.approval.gate = "PAPER_EXIT";
    expect(readR2ParentV2(wrongGate)).toBeNull();
    const wrongCommand = structuredClone(p.r2_operation);
    wrongCommand.command_type = "GOVERNANCE_PAPER_EXIT_DECISION";
    expect(readOperationParentV2(wrongCommand)).toBeNull();
    const wrongDecision = structuredClone(p.r2_operation);
    wrongDecision.decision = "PROMOTE";
    expect(readOperationParentV2(wrongDecision)).toBeNull();
  });
});

describe("L3: closed shapes and conditionals", () => {
  const refuses = (reader: Reader, edit: (body: Fixture) => void, key: string) => {
    const body = structuredClone(parent()[key]);
    edit(body);
    expect(reader(body)).toBeNull();
  };

  it("refuses an extra key anywhere the schema is closed", () => {
    refuses(readR2ParentV2, (b) => { b.extra = 1; }, "r2");
    refuses(readR2ParentV2, (b) => { b.approval.actor = "x"; }, "r2");
    refuses(readR2ParentV2, (b) => { b.lineage.note = "x"; }, "r2");
    refuses(readPaperExitParentV2, (b) => { b.evaluation.findings[0].label = "x"; }, "paper_exit");
    refuses(readCanaryParentV2, (b) => { b.proposal.effective = true; }, "canary");
  });

  it("refuses a side-effect flag that is not false", () => {
    refuses(readR2ParentV2, (b) => { b.source.source_side_effect_requested = true; }, "r2");
    refuses(readSandboxParentV2, (b) => { b.source.runtime_activation_requested = true; }, "sandbox");
    refuses(readSandboxParentV2, (b) => { b.source.promotion_execution_requested = true; }, "sandbox");
    refuses(readCanaryParentV2, (b) => { b.envelope.production_command_active = true; }, "canary");
    refuses(readLiveParentV2, (b) => { b.source.runtime_activation_requested = true; }, "live");
  });

  it("refuses an absence with the wrong reason and an AVAILABLE section with missing keys", () => {
    refuses(readR2ParentV2, (b) => { b.lineage.reason_code = "SOMETHING_ELSE"; }, "r2_absent");
    refuses(readR2ParentV2, (b) => { delete b.lineage.currency; }, "r2");
    refuses(readR2ParentV2, (b) => { b.lineage = { availability: "AVAILABLE" }; }, "r2");
    refuses(readLiveParentV2, (b) => { b.accepted_manager_facts.reason_code = "X"; }, "live");
  });

  it("applies the schema's own relations", () => {
    refuses(readOperationParentV2, (b) => { b.applied_at_ms = 1790812801000; }, "r2_operation");
    refuses(readOperationParentV2, (b) => { b.applied_at_ms = null; }, "r2_operation_applied");
    refuses(readOperationParentV2, (b) => { b.parent_approval_version = null; }, "r2_operation");
    refuses(readOperationParentV2, (b) => { b.parent_approval_id = "apr_x"; b.parent_approval_version = 1; b.parent_evidence_set_hash = `sha256:${"a".repeat(64)}`; }, "paper_exit_operation");
    refuses(readOperationParentV2, (b) => { b.expires_at_ms = b.created_at_ms - 1; }, "r2_operation");
    refuses(readPaperExitParentV2, (b) => { b.review.extension_days = 14; }, "paper_exit");
    refuses(readPaperExitParentV2, (b) => { b.review.extended_until_ms = null; }, "paper_exit_extended");
    refuses(readPaperExitParentV2, (b) => { b.review.review_id = "apr_other"; }, "paper_exit");
    refuses(readPaperExitParentV2, (b) => { b.evaluation.findings[1].panel_id = "panel_missing"; }, "paper_exit");
    refuses(readPaperExitParentV2, (b) => { b.evaluation.panels[0].freshness_state = "OK"; b.evaluation.panels[0].as_of_ms = null; }, "paper_exit");
    refuses(readPaperExitParentV2, (b) => { b.evaluation.panels[1].poll_interval_ms = 1000; }, "paper_exit");
    refuses(readR2ParentV2, (b) => { b.approval.updated_at_ms = b.approval.created_at_ms - 1; }, "r2");
    refuses(readSandboxParentV2, (b) => { b.steps.items.reverse(); }, "sandbox");
    refuses(readSandboxParentV2, (b) => { b.steps.items[4].evidence_id = "evidence_x"; }, "sandbox");
    refuses(readCanaryParentV2, (b) => { b.envelope.previous_envelope_id = "env_x"; }, "canary");
    refuses(readCanaryParentV2, (b) => { b.envelope.previous_envelope_id = null; }, "canary_revision");
  });

  it("refuses a cap that is not a positive exact decimal string", () => {
    for (const bad of [10, 1e21, "1e5", "-1", "0", "0.000000000000000000", "1.0000000000000000001", "123456789012345678901", "01"]) {
      refuses(readCanaryParentV2, (b) => { b.proposal.capital_cap = bad; }, "canary");
    }
  });

  it("refuses a timestamp that is not epoch milliseconds", () => {
    for (const bad of ["2026-10-18T00:00:00Z", 1.5, -1, "1792281600000", null, 2 ** 53]) {
      refuses(readR2ParentV2, (b) => { b.observed_at_ms = bad; }, "r2");
      refuses(readR2ParentV2, (b) => { b.approval.created_at_ms = bad; }, "r2");
    }
  });
});

describe("L3: generated negatives never throw, leak or read", () => {
  const ENUMS: [string, string, (string | number)[], readonly string[]][] = [
    ["r2", "r2", ["approval", "status"], ["PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"]],
    ["paper_exit", "paper_exit", ["evaluation", "findings", 0, "outcome"], ["PASS", "WATCH", "FAIL", "INSUFFICIENT"]],
    ["paper_exit", "paper_exit", ["review", "review_state"], ["PENDING", "EXTENDED"]],
    ["sandbox", "sandbox", ["certification", "workflow_state"], ["DRAFT", "IN_REVIEW", "APPROVED", "DENIED"]],
    ["r2_operation", "r2_operation", ["status"], ["PLANNED", "APPLIED", "EXPIRED"]],
  ];
  const cases: [string, Reader, NegativeCase][] = [];
  const add = (label: string, reader: Reader, list: NegativeCase[]) => list.forEach((c) => cases.push([`${label}: ${c.name}`, reader, c]));

  for (const [label, key, path, valid] of ENUMS) {
    const reader = READERS.find(([l]) => l === label)?.[2] ?? readOperationParentV2;
    add(label, reader, enumCases(parent()[key], path, valid));
  }
  add("canary", readCanaryParentV2, decimalCases(parent().canary, ["proposal", "capital_cap"]));
  add("canary", readCanaryParentV2, decimalCases(parent().canary, ["proposal", "daily_loss_cap"]));
  add("r2", readR2ParentV2, stringCases(parent().r2, ["lineage", "r1_approval_id"]));
  add("r2", readR2ParentV2, stringCases(parent().r2, ["workspace_id"]));
  add("r2", readR2ParentV2, requiredCases(parent().r2, [["approval"], ["approval", "approval_id"], ["lineage"], ["source"], ["anchors", "portfolio_id"], ["family"], ["observed_at_ms"]]));
  add("paper_exit", readPaperExitParentV2, arrayCases(parent().paper_exit, ["evaluation", "panels"], { idKey: "panel_id" }));
  add("paper_exit", readPaperExitParentV2, arrayCases(parent().paper_exit, ["evaluation", "findings"], { idKey: "finding_id" }));
  add("sandbox", readSandboxParentV2, arrayCases(parent().sandbox, ["steps", "items"], { idKey: "step_key" }));
  add("live", readLiveParentV2, requiredCases(parent().live, [["approval"], ["anchors"], ["accepted_manager_facts"], ["source", "runtime_activation_requested"]]));
  add("r2", readR2ParentV2, pollutionCases(parent().r2, [[], ["approval"], ["lineage"], ["source"]]));
  add("live-source", readLiveSourceOperationsV2, pollutionCases(liveSource().populated, [[], ["data", "positions"]]));
  add("live-source", readLiveSourceOperationsV2, requiredCases(liveSource().populated, [["data", "positions", "records"], ["data", "positions", "provenance"], ["runtime"], ["realtime"], ["commands"], ["data", "broker_sync"]]));

  it("builds a non-trivial matrix", () => {
    expect(cases.length).toBeGreaterThan(250);
  });

  it.each(cases.map(([name, reader, c]) => [name, reader, c] as const))("%s", (_name, reader, c) => {
    let answer: unknown;
    expect(() => { answer = reader(c.value); }).not.toThrow();
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    // A cut-short list and a long-but-legal string can stay inside the contract; every other mutation leaves it.
    if (c.category !== "truncated" && c.category !== "huge-string") expect(answer).toBeNull();
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing in every reader", (_name, c) => {
    for (const [, , reader] of READERS) expect(reader(c.value)).toBeNull();
    expect(readLiveSourceOperationsV2(c.value)).toBeNull();
    expect(readGovernanceParentV2(c.value)).toBeNull();
  });

});

describe("L3: live-source", () => {
  const refuses = (edit: (body: Fixture) => void, key: "populated" | "unpublished" = "populated") => {
    const body = structuredClone(liveSource()[key]);
    edit(body);
    expect(readLiveSourceOperationsV2(body)).toBeNull();
  };

  it("refuses a swapped or missing schema_version", () => {
    for (const bad of [GOVERNANCE_PARENT_V2_SCHEMA, "portal.execution.live-source-operations.v1", "execution.live-full-operations.v1", null, 2]) {
      refuses((b) => { b.schema_version = bad; });
    }
    refuses((b) => { delete b.schema_version; });
    expect(LIVE_SOURCE_V2_SCHEMA).toBe(liveSource().populated.schema_version);
  });

  it("refuses a body that claims a source verdict, a clock, a total, a stream or a command", () => {
    refuses((b) => { b.source_verdict = "ASSERTED"; });
    refuses((b) => { b.runtime.state = "RUNNING"; });
    refuses((b) => { b.realtime.active = true; });
    refuses((b) => { b.commands.enabled = true; });
    refuses((b) => { b.data.positions.exact_total = "0"; });
    refuses((b) => { b.data.positions.source_as_of_ms = 1790812800000; });
    refuses((b) => { b.environment = "paper"; });
  });

  it("refuses records on a panel that was not published, a count that disagrees, a number for a decimal", () => {
    refuses((b) => { b.data.positions.records = structuredClone(liveSource().populated.data.positions.records); }, "unpublished");
    refuses((b) => { b.data.positions.returned_count = 2; });
    refuses((b) => { b.data.positions.records[0].values.quantity = 1.5; });
    refuses((b) => { b.data.positions.records[0].values.quantity = "1e5"; });
    refuses((b) => { b.data.positions.records[0].values.surprise = "x"; });
    refuses((b) => { b.data.sessions.records[0].values.submitted_count = 3; });
    refuses((b) => { b.data.positions.records.push(structuredClone(b.data.positions.records[0])); b.data.positions.returned_count = 2; });
    refuses((b) => { b.data.positions.has_more = true; });
  });

  it("refuses a panel in the wrong grain", () => {
    refuses((b) => { b.data.accounts.grain = "DEPLOYMENT"; });
    refuses((b) => { b.data.broker_sync.grain = "DEPLOYMENT"; });
  });
});
