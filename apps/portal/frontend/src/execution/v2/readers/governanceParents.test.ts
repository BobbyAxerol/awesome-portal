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

  it("carries the 32 parent bodies and 3 compositions this suite covers (25 before BE-P12 c159bb40: four more, the optional identity of each following parent, published and hidden)", () => {
    const keys = Object.keys(parent()).filter((key) => typeof parent()[key] === "object");
    expect(keys.sort()).toEqual([
      "canary", "canary_absent", "canary_identity", "canary_identity_hidden", "canary_revision", "live", "live_blockers", "live_blockers_absent", "live_blockers_zero", "live_composition", "paper_exit", "paper_exit_absent",
      "paper_exit_composition", "paper_exit_criteria", "paper_exit_extended", "paper_exit_followthrough", "paper_exit_operation",
      "paper_exit_operation_applied", "paper_exit_operation_expired", "paper_exit_recorded", "r2", "r2_absent", "r2_composition",
      "r2_followthrough", "r2_followthrough_hashes_absent", "r2_operation", "r2_operation_applied", "r2_operation_expired",
      "r2_operation_uncaptured", "r2_recorded", "sandbox", "sandbox_absent", "sandbox_draft", "sandbox_identity", "sandbox_identity_hidden",
    ]);
    expect(keys).toHaveLength(35);
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
    // Every section of the plain `r2` body is the typed absence, so every datum they would carry is named with its FE request.
    expect(r2.notPublished).toMatchObject({
      criteria: "FE-028", capitalRows: "FE-030", decisionCall: "FE-030", ladder: "FE-030", receiptRef: "FE-030",
      creator: "FE-030", operationLink: "FE-030", decisionPins: "FE-030", recordedDecisions: "FE-030", recordedFindings: "FE-028",
    });
    for (const section of [r2.actors, r2.latestOperation, r2.decisionContext, r2.recordedActivity, r2.recordedVerdicts]) {
      expect(section).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
    }
    // No parent carries capital rows or a requested amount: none is invented.
    expect(JSON.stringify(r2)).not.toMatch(/capital":\[|requestedAmount/);
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
    // In the plain `paper_exit` body the criteria section is the typed absence, so label, observed and limit are still FE-028.
    expect(exit.criteria).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
    expect(exit.notPublished).toMatchObject({ criteriaLabel: "FE-028", observedAndLimit: "FE-028", gateVerdict: "FE-028", comparator: "FE-028" });
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

describe("R2 parent sections added by Codex e19ad906", () => {
  it("r2_followthrough: stored actors, the latest recorded plan and the decision inputs, as published", () => {
    const r2 = must(readR2ParentV2(parent().r2_followthrough), "r2_followthrough");
    expect(r2.actors).toEqual({
      availability: "AVAILABLE", basis: "STORED_PORTAL_ACTOR_IDS_NOT_DECISION_AUTHORIZATION", requesterUserId: "user_TEST_ONLY_requester",
      artifactCreatorUserId: "user_TEST_ONLY_creator", decidedByUserId: null, viewerIsRequester: false, viewerIsArtifactCreator: true, viewerIsDecidedBy: null,
    });
    expect(r2.latestOperation).toEqual({
      availability: "AVAILABLE", basis: "LATEST_RECORDED_PORTAL_PLAN_NOT_ACTION_ELIGIBILITY", operationId: "op_TEST_ONLY_R2_EXPIRED", commandVersion: 1,
      commandType: "GOVERNANCE_R2_DECISION", storedStatus: "EXPIRED", createdAt: 1790812800000, orderBasis: "POSTGRES_CREATED_AT_DESC_OPERATION_ID_C_ASC",
    });
    expect(r2.decisionContext).toMatchObject({
      availability: "AVAILABLE", gate: "R2", workspaceId: r2.header.workspaceId, approvalId: r2.approval.approvalId,
      expectedApprovalVersion: r2.approval.approvalVersion, evidenceSetHash: `sha256:${"5".repeat(64)}`,
      evidenceHashes: { availability: "AVAILABLE", value: [`sha256:${"3".repeat(64)}`, `sha256:${"4".repeat(64)}`] },
      commandType: "GOVERNANCE_R2_DECISION", planPath: "/api/v1/execution/commands/plans",
      admission: { state: "NOT_EVALUATED", reasonCode: "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN" }, sourceSideEffectRequested: false,
    });
    // What the three sections now publish is no longer listed as missing; what the other two would carry still is.
    expect(r2.notPublished).not.toHaveProperty("creator");
    expect(r2.notPublished).not.toHaveProperty("operationLink");
    expect(r2.notPublished).not.toHaveProperty("decisionPins");
    expect(r2.notPublished).toMatchObject({ recordedDecisions: "FE-030", recordedFindings: "FE-028", capitalRows: "FE-030", ladder: "FE-030", receiptRef: "FE-030", criteria: "FE-028" });
  });

  it("r2_followthrough_hashes_absent: more than 128 evidence hashes is a typed absence, never a truncated or empty list", () => {
    const r2 = must(readR2ParentV2(parent().r2_followthrough_hashes_absent), "hashes_absent");
    if (r2.decisionContext.availability !== "AVAILABLE") throw new Error("context absent");
    expect(r2.decisionContext.evidenceHashes).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "EVIDENCE_HASH_LIMIT_EXCEEDED" });
    expect(r2.decisionContext.evidenceSetHash).toBe(`sha256:${"5".repeat(64)}`);
  });

  it("r2_recorded: a decided approval names its decider, the recorded decisions newest first, and four stored verdicts with no criterion fields", () => {
    const r2 = must(readR2ParentV2(parent().r2_recorded), "r2_recorded");
    expect(r2.approval).toMatchObject({ status: "DENIED", approvalVersion: 3 });
    expect(r2.actors).toMatchObject({ availability: "AVAILABLE", decidedByUserId: "user_TEST_ONLY_reviewer", viewerIsDecidedBy: false, viewerIsArtifactCreator: true });
    if (r2.recordedActivity.availability !== "AVAILABLE") throw new Error("activity absent");
    expect(r2.recordedActivity).toMatchObject({ limit: 32, hasMore: false, coverage: "BOUNDED_RECENT_DECISIONS_NOT_FULL_HISTORY" });
    expect(r2.recordedActivity.items.map((i) => [i.decision, i.versionBefore, i.versionAfter, i.decidedAt])).toEqual([
      ["DENY", 2, 3, 1790812802000], ["APPROVE_WITH_CONDITION", 1, 2, 1790812801000],
    ]);
    if (r2.recordedVerdicts.availability !== "AVAILABLE") throw new Error("verdicts absent");
    expect(r2.recordedVerdicts).toMatchObject({ limit: 64, hasMore: false, admission: { state: "NOT_EVALUATED" } });
    expect(r2.recordedVerdicts.items.map((v) => [v.ordinal, v.outcome, v.blocking])).toEqual([[0, "PASS", false], [1, "WATCH", false], [2, "FAIL", true], [3, "INSUFFICIENT", true]]);
    for (const verdict of r2.recordedVerdicts.items) {
      expect(verdict.structuredCriterion).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOURCE_STRUCTURED_CRITERION_NOT_RECORDED" });
      expect(verdict.sourceRef).toMatchObject({ approvalId: r2.approval.approvalId, findingId: verdict.findingId });
    }
    // No label, observed value or limit exists on an R2 verdict: none is invented, and the R2 list still names them.
    expect(JSON.stringify(r2.recordedVerdicts)).not.toMatch(/"label|"observed|"limit":\s*"/);
    expect(r2.notPublished).toMatchObject({ criteria: "FE-028" });
    expect(r2.notPublished).not.toHaveProperty("recordedFindings");
    expect(r2.notPublished).not.toHaveProperty("recordedDecisions");
  });
});

describe("Paper Exit parent sections added by Codex e19ad906", () => {
  it("paper_exit_criteria: label, observed value and limit as published, the comparator always absent", () => {
    const exit = must(readPaperExitParentV2(parent().paper_exit_criteria), "paper_exit_criteria");
    if (exit.criteria.availability !== "AVAILABLE") throw new Error("criteria absent");
    expect(exit.criteria.basis).toBe("VERIFIED_CURRENT_STORED_FINDING_BYTES_NOT_SOURCE_ACCEPTANCE");
    expect(exit.criteria.panels).toHaveLength(4);
    const [first, second, third] = exit.criteria.items;
    expect(first).toMatchObject({
      criterionKey: { availability: "AVAILABLE", value: "OBSERVATION_COVERAGE" },
      labelKey: { availability: "AVAILABLE", value: "paper_exit.observation_coverage" },
      // The exact string, every digit: 1842.000000000000000001 is not 1842.
      observed: { availability: "AVAILABLE", value: "1842.000000000000000001" },
      limit: { availability: "AVAILABLE", value: "6.00" },
      unit: { availability: "AVAILABLE", value: "CURRENCY" }, currency: { availability: "AVAILABLE", value: "USDC" },
      evidence: { availability: "AVAILABLE", value: `sha256:${"4".repeat(64)}` },
      sourceTime: { availability: "AVAILABLE", value: 1790812800000 },
      comparator: { availability: "NOT_PUBLISHED", reasonCode: "SOURCE_COMPARATOR_FIELD_NOT_RECORDED" },
    });
    // A published "0" is a value; a value the source never recorded is an absence with its reason, never 0.
    expect(second!.observed).toEqual({ availability: "AVAILABLE", value: "0" });
    expect(second!.limit).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOURCE_VALUE_NOT_RECORDED" });
    expect(third!.observed).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOURCE_VALUE_NOT_RECORDED" });
    expect(third!.unit).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOURCE_TEXT_NOT_RECORDED" });
    expect(third!.sourceTime).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOURCE_TIME_NOT_RECORDED" });
    expect(exit.criteria.items.map((i) => [i.finding.findingId, i.finding.outcome])).toEqual([
      ["finding_TEST_ONLY_0", "PASS"], ["finding_TEST_ONLY_1", "INSUFFICIENT"], ["finding_TEST_ONLY_2", "INSUFFICIENT"], ["finding_TEST_ONLY_3", "INSUFFICIENT"],
    ]);
    expect(first!.sourceRef).toEqual({ kind: "PORTAL_STORED_PAPER_EXIT_FINDING", reviewId: exit.review.reviewId, panelId: "panel_TEST_ONLY_0", findingId: "finding_TEST_ONLY_0", basis: "STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE" });
    // The label and the observed/limit are no longer missing; the comparator, the gate verdict and the chart still are.
    expect(exit.notPublished).not.toHaveProperty("criteriaLabel");
    expect(exit.notPublished).not.toHaveProperty("observedAndLimit");
    expect(exit.notPublished).toMatchObject({ comparator: "FE-028", gateVerdict: "FE-028", chart: "FE-029", ladder: "FE-030", decisionCall: "FE-030" });
  });

  it("paper_exit_followthrough: a decided review names its decider and the latest plan is the Paper Exit command", () => {
    const exit = must(readPaperExitParentV2(parent().paper_exit_followthrough), "paper_exit_followthrough");
    expect(exit.review.reviewState).toBe("REJECTED_TO_PAPER_HELD");
    expect(exit.approval).toMatchObject({ status: "DENIED" });
    expect(exit.actors).toMatchObject({ availability: "AVAILABLE", decidedByUserId: "user_TEST_ONLY_reviewer", viewerIsDecidedBy: true, viewerIsArtifactCreator: false });
    expect(exit.latestOperation).toMatchObject({ availability: "AVAILABLE", commandType: "GOVERNANCE_PAPER_EXIT_DECISION", storedStatus: "APPLIED", operationId: "op_TEST_ONLY_PAPER_EXIT_APPLIED" });
    expect(exit.recordedActivity.availability).toBe("NOT_PUBLISHED");
    expect(exit.notPublished).toMatchObject({ recordedDecisions: "FE-030" });
    expect(exit.notPublished).not.toHaveProperty("creator");
  });

  it("paper_exit_recorded: one recorded REJECT, version 1 to 2", () => {
    const exit = must(readPaperExitParentV2(parent().paper_exit_recorded), "paper_exit_recorded");
    if (exit.recordedActivity.availability !== "AVAILABLE") throw new Error("activity absent");
    expect(exit.recordedActivity.items).toEqual([{
      decisionId: "decision_TEST_ONLY_exit_1", operationId: "op_TEST_ONLY_PAPER_EXIT_APPLIED", versionBefore: 1, versionAfter: 2,
      decidedAt: 1790812801000, kind: "PAPER_EXIT_DECISION_RECORDED", decision: "REJECT",
    }]);
    expect(exit.notPublished).not.toHaveProperty("recordedDecisions");
  });

  it("the plain bodies keep every new section as the typed absence", () => {
    for (const key of ["paper_exit", "paper_exit_absent", "paper_exit_extended"]) {
      const exit = must(readPaperExitParentV2(parent()[key]), key);
      for (const section of [exit.criteria, exit.actors, exit.latestOperation, exit.recordedActivity]) {
        expect(section, key).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
      }
    }
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
    // added by Codex e19ad906
    paper_exit_criteria: "PAPER_EXIT", r2_followthrough: "R2", r2_followthrough_hashes_absent: "R2", paper_exit_followthrough: "PAPER_EXIT",
    r2_recorded: "R2", paper_exit_recorded: "PAPER_EXIT",
    // added by BE-P12 c159bb40 (the optional identity member)
    sandbox_identity: "SANDBOX", sandbox_identity_hidden: "SANDBOX", canary_identity: "CANARY", canary_identity_hidden: "CANARY",
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

describe("L3: relations and closed sets of the sections added by e19ad906", () => {
  const refuses = (reader: Reader, key: string, edit: (body: Fixture) => void, what?: string) => {
    const body = structuredClone(parent()[key]);
    edit(body);
    expect(reader(body), what ?? key).toBeNull();
  };
  const accepts = (reader: Reader, key: string, edit: (body: Fixture) => void) => {
    const body = structuredClone(parent()[key]);
    edit(body);
    expect(reader(body)).not.toBeNull();
  };

  it("actors: the decider and the viewer flag are null together and only together", () => {
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.actors.viewer_is_decided_by = true; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.actors.viewer_is_decided_by = null; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.actors.decided_by_user_id = null; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.actors.viewer_is_requester = "false"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.actors.requester_user_id = "a b"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.actors.username = "stan"; }, "an actor with a name is not on the wire");
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.actors.basis = "DECISION_AUTHORIZATION"; });
    refuses(readPaperExitParentV2, "paper_exit_followthrough", (b) => { b.actors.viewer_is_decided_by = null; });
  });

  it("latest_operation: the command is this family's, the status a stored one, the absence one of three words", () => {
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.latest_operation.command_type = "GOVERNANCE_PAPER_EXIT_DECISION"; });
    refuses(readPaperExitParentV2, "paper_exit_followthrough", (b) => { b.latest_operation.command_type = "GOVERNANCE_R2_DECISION"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.latest_operation.stored_status = "READY"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.latest_operation.command_version = 2; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.latest_operation.created_at_ms = -1; });
    for (const reason of ["NO_RECORDED_PORTAL_OPERATION", "LATEST_RECORDED_OPERATION_NOT_PUBLIC", "PARENT_FIELD_PURPOSE_NOT_QUALIFIED"]) {
      accepts(readR2ParentV2, "r2_followthrough", (b) => { b.latest_operation = { availability: "NOT_PUBLISHED", reason_code: reason }; });
    }
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.latest_operation = { availability: "NOT_PUBLISHED", reason_code: "RECORDED_ACTIVITY_NOT_PUBLIC" }; });
  });

  it("decision_context: the inputs are this approval's own, hashes strictly ascending and at most 128", () => {
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.workspace_id = "ws_other"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.approval_id = "apr_other"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.expected_approval_version = 2; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.evidence_hashes.value.reverse(); }, "descending");
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.evidence_hashes.value.push(b.decision_context.evidence_hashes.value[1]); }, "duplicate");
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.evidence_hashes.value = Array.from({ length: 129 }, (_, i) => `sha256:${i.toString(16).padStart(64, "0")}`); }, "129");
    accepts(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.evidence_hashes.value = Array.from({ length: 128 }, (_, i) => `sha256:${i.toString(16).padStart(64, "0")}`); });
    accepts(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.evidence_hashes.value = []; });
    refuses(readR2ParentV2, "r2_followthrough_hashes_absent", (b) => { b.decision_context.evidence_hashes.reason_code = "SOMETHING_ELSE"; });
    refuses(readR2ParentV2, "r2_followthrough_hashes_absent", (b) => { b.decision_context.evidence_hashes.value = []; }, "an empty list wearing an absence");
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.evidence_hashes.reason_code = "EVIDENCE_HASH_LIMIT_EXCEEDED"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.plan_path = "/api/v1/execution/commands/apply"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.request_schema_version = "governance.r2-decision-plan-request.v2"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.admission = { state: "READY", reason_code: "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN" }; }, "READY is never published");
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.source_side_effect_requested = true; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.gate = "PAPER_EXIT"; });
    refuses(readR2ParentV2, "r2_followthrough", (b) => { b.decision_context.evidence_set_hash = "sha256:xyz"; });
  });

  it("recorded_activity: version +1, unique ids, clocks that do not increase, 32 rows when there are more", () => {
    const item = (b: Fixture, i: number) => b.recorded_activity.items[i];
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0).version_after = 4; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 1).decision_id = item(b, 0).decision_id; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 1).operation_id = item(b, 0).operation_id; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_activity.items.reverse(); }, "oldest first");
    accepts(readR2ParentV2, "r2_recorded", (b) => { item(b, 1).decided_at_ms = item(b, 0).decided_at_ms; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_activity.has_more = true; }, "has_more with 2 rows");
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0).kind = "PAPER_EXIT_DECISION_RECORDED"; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0).decision = "PROMOTE"; });
    refuses(readPaperExitParentV2, "paper_exit_recorded", (b) => { b.recorded_activity.items[0].decision = "DENY"; });
    refuses(readPaperExitParentV2, "paper_exit_recorded", (b) => { b.recorded_activity.items[0].kind = "R2_DECISION_RECORDED"; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_activity.limit = 33; });
    const full = (b: Fixture, n: number, more: boolean) => {
      b.recorded_activity.items = Array.from({ length: n }, (_, i) => ({
        decision_id: `decision_${i}`, operation_id: `op_${i}`, version_before: 1, version_after: 2, decided_at_ms: 1790812800000 - i, kind: "R2_DECISION_RECORDED", decision: "DENY",
      }));
      b.recorded_activity.has_more = more;
    };
    accepts(readR2ParentV2, "r2_recorded", (b) => full(b, 32, true));
    accepts(readR2ParentV2, "r2_recorded", (b) => full(b, 32, false));
    refuses(readR2ParentV2, "r2_recorded", (b) => full(b, 33, false), "33 rows");
    refuses(readR2ParentV2, "r2_recorded", (b) => full(b, 31, true), "has_more with 31 rows");
    for (const reason of ["RECORDED_ACTIVITY_NOT_PUBLIC", "PARENT_FIELD_PURPOSE_NOT_QUALIFIED"]) {
      accepts(readR2ParentV2, "r2_recorded", (b) => { b.recorded_activity = { availability: "NOT_PUBLISHED", reason_code: reason }; });
    }
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_activity = { availability: "NOT_PUBLISHED", reason_code: "RECORDED_VERDICTS_NOT_PUBLIC" }; });
  });

  it("recorded_verdicts: a blocking verdict fails or is insufficient, ordinals ascend, each reference is this approval's finding, no criterion field is filled", () => {
    const item = (b: Fixture, i: number) => b.recorded_verdicts.items[i];
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0).blocking = true; }, "PASS that blocks");
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 1).blocking = true; }, "WATCH that blocks");
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 1).ordinal = 0; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_verdicts.items.reverse(); });
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 1).finding_id = item(b, 0).finding_id; item(b, 1).source_ref.finding_id = item(b, 0).finding_id; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0).source_ref.approval_id = "apr_other"; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0).source_ref.finding_id = "finding_other"; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0).source_ref.kind = "PORTAL_STORED_PAPER_EXIT_FINDING"; });
    for (const field of ["criterion_key", "label_key", "observed", "limit", "op", "unit", "currency"]) {
      refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0)[field] = { availability: "AVAILABLE", value: "x", reason_code: null }; }, `${field} filled`);
      refuses(readR2ParentV2, "r2_recorded", (b) => { item(b, 0)[field].reason_code = "SOURCE_VALUE_NOT_RECORDED"; }, `${field} other reason`);
      refuses(readR2ParentV2, "r2_recorded", (b) => { delete item(b, 0)[field]; }, `${field} missing`);
    }
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_verdicts.limit = 65; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_verdicts.has_more = true; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_verdicts.admission.state = "READY"; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_verdicts.items = Array.from({ length: 65 }, (_, i) => ({ ...structuredClone(item(b, 0)), finding_id: `f${i}`, ordinal: i, source_ref: { ...item(b, 0).source_ref, finding_id: `f${i}` } })); }, "65 rows");
    accepts(readR2ParentV2, "r2_recorded", (b) => { b.recorded_verdicts.items = []; });
    accepts(readR2ParentV2, "r2_recorded", (b) => { b.recorded_verdicts = { availability: "NOT_PUBLISHED", reason_code: "RECORDED_VERDICTS_NOT_PUBLIC" }; });
    refuses(readR2ParentV2, "r2_recorded", (b) => { b.recorded_verdicts = { availability: "NOT_PUBLISHED", reason_code: "RECORDED_ACTIVITY_NOT_PUBLIC" }; });
  });

  it("criteria: the label is the key's own, the reference is this review's finding, the source clock is the finding's, no URL in a text, no comparator", () => {
    const item = (b: Fixture, i: number) => b.criteria.items[i];
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).label_key.value = "paper_exit.drift"; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).label_key = { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_METRIC_NOT_REGISTERED" }; }, "key without a label");
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).criterion_key = { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_METRIC_NOT_REGISTERED" }; }, "label without a key");
    accepts(readPaperExitParentV2, "paper_exit_criteria", (b) => {
      item(b, 0).criterion_key = { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_METRIC_NOT_REGISTERED" };
      item(b, 0).label_key = { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_METRIC_NOT_REGISTERED" };
    });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).label_key.value = "Observation coverage"; item(b, 0).criterion_key.value = "OBSERVATION_COVERAGE"; }, "free text label");
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).source_ref.review_id = "apr_other"; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).source_ref.panel_id = "panel_TEST_ONLY_1"; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).source_ref.finding_id = "finding_TEST_ONLY_1"; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).source_time.value = 1; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 1).source_time = { availability: "AVAILABLE", value: 5, reason_code: null }; }, "a source clock for a finding with none");
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).source_time = { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_TIME_NOT_RECORDED" }; }, "no source clock for a finding that has one");
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).op = { availability: "AVAILABLE", value: "<=", reason_code: null }; }, "a comparator");
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).op.reason_code = "SOURCE_VALUE_NOT_RECORDED"; });
    for (const bad of [1842, "1e5", "01", "1.", ".5", "+1", " 1", "1\n", "1,5", "NaN", "1".repeat(129)]) {
      refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).observed.value = bad; }, `observed ${JSON.stringify(bad).slice(0, 20)}`);
      refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).limit.value = bad; }, `limit ${JSON.stringify(bad).slice(0, 20)}`);
    }
    // The schema pattern allows a negative zero and a long scale; the reader keeps the exact string and does not refuse them.
    for (const ok of ["-0", "-0.50", "0.000000000000000001", "1".repeat(128)]) {
      accepts(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).observed.value = ok; });
    }
    for (const bad of ["http://evil.example", "https://x", "javascript:alert(1)", "JAVASCRIPT:1", "data:text/html,x", "file:///etc/passwd", "/etc/passwd", "\\\\share", "ab\ncd", ""]) {
      refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).unit.value = bad; }, `unit ${JSON.stringify(bad)}`);
      refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).currency.value = bad; }, `currency ${JSON.stringify(bad)}`);
      refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).finding_formula_version = { availability: "AVAILABLE", value: bad, reason_code: null }; }, `formula ${JSON.stringify(bad)}`);
    }
    accepts(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 0).unit.value = "basis points"; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 1).observed = { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_TEXT_NOT_RECORDED" }; }, "a text reason on a value");
    accepts(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 1).observed = { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_VALUE_NOT_DECIMAL" }; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 1).observed = { availability: "AVAILABLE", value: "1", reason_code: "SOURCE_VALUE_NOT_RECORDED" }; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 1).evidence = { availability: "AVAILABLE", value: "sha256:zz", reason_code: null }; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { item(b, 1).extra = 1; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { delete item(b, 1).limit; });
  });

  it("criteria: identities and counts (unique findings, known panels, at most 4 panels and 256 items)", () => {
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria.items[1].original.finding_id = b.criteria.items[0].original.finding_id; b.criteria.items[1].source_ref.finding_id = b.criteria.items[0].original.finding_id; }, "duplicate finding");
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria.items[1].original.panel_id = "panel_missing"; b.criteria.items[1].source_ref.panel_id = "panel_missing"; }, "unknown panel");
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria.panels[1].panel_id = b.criteria.panels[0].panel_id; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria.panels[1].panel_kind = b.criteria.panels[0].panel_kind; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria.panels[1].ordinal = b.criteria.panels[0].ordinal; }, "duplicate panel ordinal");
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria.basis = "SOURCE_ACCEPTANCE"; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria.items = Array.from({ length: 257 }, (_, i) => ({ ...structuredClone(b.criteria.items[0]), original: { ...b.criteria.items[0].original, finding_id: `f${i}` }, source_ref: { ...b.criteria.items[0].source_ref, finding_id: `f${i}` } })); }, "257 items");
    accepts(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria.items = []; });
    refuses(readPaperExitParentV2, "paper_exit_criteria", (b) => { b.criteria = { availability: "NOT_PUBLISHED", reason_code: "RECORDED_ACTIVITY_NOT_PUBLIC" }; });
  });

  /*
   * FIXED GP-7: the schema's description of `evaluation` says runtime checks
   * unique panel ordinals too, and positive-parent.contract.ts does; the V2
   * reader checked ids and kinds only.
   */
  it("FIXED GP-7: two evaluation panels with the same ordinal are refused", () => {
    refuses(readPaperExitParentV2, "paper_exit", (b) => { b.evaluation.panels[1].ordinal = b.evaluation.panels[0].ordinal; });
  });

  it("every new container is closed: one extra key voids the read", () => {
    const targets: [Reader, string, (string | number)[]][] = [
      [readR2ParentV2, "r2_recorded", ["actors"]], [readR2ParentV2, "r2_recorded", ["latest_operation"]],
      [readR2ParentV2, "r2_recorded", ["decision_context"]], [readR2ParentV2, "r2_recorded", ["decision_context", "evidence_hashes"]],
      [readR2ParentV2, "r2_recorded", ["decision_context", "admission"]], [readR2ParentV2, "r2_recorded", ["recorded_activity"]],
      [readR2ParentV2, "r2_recorded", ["recorded_activity", "items", 0]], [readR2ParentV2, "r2_recorded", ["recorded_verdicts"]],
      [readR2ParentV2, "r2_recorded", ["recorded_verdicts", "items", 0]], [readR2ParentV2, "r2_recorded", ["recorded_verdicts", "items", 0, "observed"]],
      [readR2ParentV2, "r2_recorded", ["recorded_verdicts", "items", 0, "source_ref"]], [readR2ParentV2, "r2_recorded", ["recorded_verdicts", "admission"]],
      [readPaperExitParentV2, "paper_exit_criteria", ["criteria"]], [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "panels", 0]],
      [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0]], [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0, "original"]],
      [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0, "observed"]], [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0, "op"]],
      [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0, "source_ref"]], [readPaperExitParentV2, "paper_exit_recorded", ["recorded_activity"]],
      [readPaperExitParentV2, "paper_exit_followthrough", ["actors"]], [readPaperExitParentV2, "paper_exit_followthrough", ["latest_operation"]],
    ];
    for (const [reader, key, path] of targets) {
      const body = structuredClone(parent()[key]);
      let host: Fixture = body;
      for (const step of path) host = host[step];
      host.extra_key = "x";
      expect(reader(body), `${key} ${path.join(".")}`).toBeNull();
    }
  });

  it("an absent section with the wrong word is refused, and the three sections an R2 has and an Exit does not are not read on the other", () => {
    refuses(readR2ParentV2, "r2", (b) => { b.actors.reason_code = "RECORDED_ACTIVITY_NOT_PUBLIC"; });
    refuses(readR2ParentV2, "r2", (b) => { b.decision_context.reason_code = "NO_RECORDED_PORTAL_OPERATION"; });
    refuses(readR2ParentV2, "r2", (b) => { delete b.recorded_verdicts; });
    refuses(readR2ParentV2, "r2", (b) => { delete b.actors; });
    refuses(readPaperExitParentV2, "paper_exit", (b) => { delete b.criteria; });
    refuses(readPaperExitParentV2, "paper_exit", (b) => { b.decision_context = structuredClone(parent().r2_followthrough.decision_context); }, "an exit has no decision_context");
    refuses(readPaperExitParentV2, "paper_exit", (b) => { b.recorded_verdicts = structuredClone(parent().r2_recorded.recorded_verdicts); }, "an exit has no recorded_verdicts");
    refuses(readR2ParentV2, "r2", (b) => { b.criteria = { availability: "NOT_PUBLISHED", reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" }; }, "an R2 has no criteria");
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
