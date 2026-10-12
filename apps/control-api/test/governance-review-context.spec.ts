import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import type { ControlApiConfig } from "../src/config";
import type { PortalUser } from "../src/domain";
import type { ApprovalRecord, EvidenceRecord, R2LineageRecord } from "../src/governance/governance.repository";
import type { ProfileProjectionSnapshot, ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import type { PaperExitRepository, PaperExitSnapshot } from "../src/governance/paper-exit.repository";
import { GovernanceReviewCaptureService } from "../src/governance/review-capture.service";
import type { OwnerAccessService } from "../src/auth/owner-access.service";
import { CaptureContextSchema, DecisionContextSchema, PaperExitDecisionContextSchema,
  decisionContext, paperCaptureContext, paperExitDecisionContext } from "../src/governance/review-context";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const user = { role: "ADMIN", userId: "usr_reviewer", username: "reviewer" } as PortalUser;
function approval(gate = "R1"): ApprovalRecord {
  return { approvalId: "apr_test", workspaceId: "ws_test", gate, subjectType: "ALPHA", subjectId: "alpha_test",
    subjectLabel: "Alpha", releaseCandidate: null, environment: "RESEARCH", targetLabel: "R1",
    requesterUserId: "usr_author", requesterUsername: "author", artifactCreatorUserId: "usr_author",
    artifactCreatorUsername: "author", status: "APPROVED", policyVersion: "policy.v1", quorumRequired: 1,
    quorumMet: 1, decisionActorIds: [], approvalVersion: 2, evidenceSetHash: HASH_A, evidenceComplete: true,
    blockerCount: 0, blockerSummary: null, slaDueAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(), updatedAt: new Date(), decidedAt: new Date(), decidedByUserId: user.userId };
}
function evidence(sha256: string): EvidenceRecord {
  return { evidenceId: "ev_test", ordinal: 0, kind: "ARTIFACT", label: "artifact", displayValue: "artifact",
    note: null, verification: null, artifactId: null, sha256, sizeBytes: null, mediaType: null,
    schemaVersion: "artifact.v1", sourceAuthority: "PORTAL", sourceReference: null, required: true,
    capturedAt: new Date(), retentionClass: "GOVERNANCE_LONG_TERM", accessPolicy: "WORKSPACE_APPROVER" };
}
function snapshot(): ProfileProjectionSnapshot {
  const relation = (source_id: string, name: string, fields: Record<string, string>[]) => ({ source_id, relation: name,
    availability: "AVAILABLE" as const, freshness: "FRESH" as const, completeness: "COMPLETE" as const,
    reason_code: null, as_of: new Date().toISOString(), items: fields.map(fields => ({ fields,
      lineage: { workspace_id: "ws_test", profile_id: "paper_test", source_contract_revision: "source.v1" } })) });
  return { document: { schema_version: "portal.execution.profile-projection.v1", workspace_id: "ws_test",
    profile_id: "paper_test", environment: "paper", source_contract_revision: "source.v1", relations: {
      "manager.deployments:strategy_deployments": relation("manager.deployments", "strategy_deployments", [
        { deployment_id: "dep_test", strategy_id: "alpha_test", account_id: "account_test", portfolio_id: "pf_test", venue: "BINANCE" }]),
      "manager.portfolios:portfolios": relation("manager.portfolios", "portfolios", [{ portfolio_id: "pf_test" }]),
      "manager.risk:risk_grants": relation("manager.risk", "risk_grants", [
        { risk_grant_id: "risk_test", strategy_id: "alpha_test", account_id: "account_test" }]),
    } }, sourceEpoch: "epoch", sourceCursor: "cursor", sourceAsOf: new Date(), receivedAt: new Date(),
    lastSuccessfulRefreshAt: new Date(), completeness: "COMPLETE", projectionEpoch: "epoch", projectionSequence: 1,
    payloadDigest: HASH_B, sourceCatalogueSha256: null };
}
function lineage(): R2LineageRecord & { portfolioId: string } {
  return { r1ApprovalId: "apr_parent", r1Status: "APPROVED", r1DecidedAt: new Date(), r1DecidedByUsername: "reviewer",
    r1ExpiresAt: new Date(Date.now() + 60_000), r1EvidenceSetHash: HASH_A, r1EvidenceComplete: true,
    grantId: "risk_test", grantName: "Observed reference", approverRole: "ADMIN", planAuthorUserId: "usr_author",
    planAuthorUsername: "author", portfolioId: "pf_test" };
}
function exitSnapshot(): PaperExitSnapshot {
  return { approval: approval(),
    review: { workspaceId: "ws_test", reviewId: "exit_test", reviewVersion: 3, sourceSnapshotHash: HASH_B } as PaperExitSnapshot["review"],
    evidence: [evidence(HASH_B), evidence(HASH_A), evidence(HASH_B)],
    lineage: [], panels: [], findings: [], decisions: [], promotionGrant: null };
}
function harness(split = false) {
  const config = { FEATURE_EXECUTION_LOCAL_PROJECTION: "true", FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_test", EXECUTION_EDGE_PAPER_PROFILE_ID: "paper_test",
    EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 60_000, EXECUTION_READ_PROFILE: "source_current_v1" } as ControlApiConfig;
  const core = {} as Pool;
  const domain = split ? {} as Pool : core;
  const read = vi.fn(async () => snapshot());
  const repo = { pool: domain, snapshot: read } as unknown as ExecutionProfileProjectionRepository;
  const access = vi.fn(async () => ({ isOwner: true, capabilities: [] as string[], scopes: {} }));
  const rights = { effectiveAccess: access } as unknown as OwnerAccessService;
  return { config, core, domain, read, access, service: new GovernanceReviewCaptureService(core, config, repo, {} as PaperExitRepository, rights) };
}

describe("Governance review context — bounded inputs, not source execution authority", () => {
  it("pins the Paper Exit review version and its complete manifest, independently from lineage", () => {
    expect(paperExitDecisionContext(exitSnapshot(), null)).toMatchObject({ gate: "PAPER_EXIT", workspace_id: "ws_test",
      review_id: "exit_test", expected_review_version: 3, evidence_set_hash: HASH_A, source_snapshot_hash: HASH_B,
      evidence_hashes: [HASH_A, HASH_B], command_type: "GOVERNANCE_PAPER_EXIT_DECISION",
      availability: { state: "AVAILABLE", reason_code: null } });
  });
  it("blocks oversized Paper Exit evidence instead of silently truncating plan inputs", () => {
    const snap = exitSnapshot();
    snap.evidence = Array.from({ length: 129 }, (_, n) => evidence(`sha256:${n.toString(16).padStart(64, "0")}`));
    expect(paperExitDecisionContext(snap, null)).toMatchObject({ evidence_hashes: null,
      availability: { state: "BLOCKED", reason_code: "EVIDENCE_HASH_LIMIT_EXCEEDED" } });
  });
  it("keeps Paper Exit command identity strict and typed refusal distinct from per-verb eligibility", () => {
    const context = paperExitDecisionContext(exitSnapshot(), null);
    expect(PaperExitDecisionContextSchema.safeParse({ ...context, command_type: "GOVERNANCE_R1_DECISION" }).success).toBe(false);
    expect(PaperExitDecisionContextSchema.safeParse({ ...context, evidence_hashes: null }).success).toBe(false);
    expect(PaperExitDecisionContextSchema.safeParse({ ...context, evidence_hashes: [HASH_A, HASH_A] }).success).toBe(false);
    expect(PaperExitDecisionContextSchema.safeParse({ ...context, availability: { state: "BLOCKED", reason_code: null } }).success).toBe(false);
    expect(paperExitDecisionContext(exitSnapshot(), "EXIT_REVIEW_EXPIRED").availability).toEqual({ state: "BLOCKED", reason_code: "EXIT_REVIEW_EXPIRED" });
  });
  it("publishes sorted, unique hashes and exact parent pins for R1", () => {
    const parent = { ...approval(), status: "PENDING" };
    expect(decisionContext(parent, [evidence(HASH_B), evidence(HASH_A), evidence(HASH_B)], true)).toMatchObject({
      gate: "R1", workspace_id: "ws_test", expected_approval_version: 2, evidence_set_hash: HASH_A,
      evidence_hashes: [HASH_A, HASH_B], command_type: "GOVERNANCE_R1_DECISION",
      availability: { state: "AVAILABLE", reason_code: null }, source_side_effect_requested: false,
    });
  });
  it("refuses missing permission, closed/expired approvals and oversized evidence without truncating command inputs", () => {
    const parent = { ...approval(), status: "PENDING" };
    expect(decisionContext(parent, [], false).availability.reason_code).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
    expect(decisionContext(approval(), [], true).availability.reason_code).toBe("APPROVAL_NOT_PENDING");
    expect(decisionContext({ ...parent, expiresAt: new Date(0) }, [], true).availability.reason_code).toBe("APPROVAL_EXPIRED");
    const large = Array.from({ length: 129 }, (_, n) => evidence(`sha256:${n.toString(16).padStart(64, "0")}`));
    expect(decisionContext(parent, large, true)).toMatchObject({ evidence_hashes: null,
      availability: { state: "BLOCKED", reason_code: "EVIDENCE_HASH_LIMIT_EXCEEDED" } });
  });
  it("cannot alias R2 into an R1 command or publish unbound/duplicate command hashes", () => {
    const context = decisionContext(approval("R2"), [evidence(HASH_A)], true);
    expect(context).toMatchObject({ command_type: null, plan_path: null, evidence_hashes: null,
      availability: { state: "BLOCKED", reason_code: "R2_EXECUTION_DECISION_NOT_COMMISSIONED" } });
    expect(DecisionContextSchema.safeParse({ ...context, command_type: "GOVERNANCE_R1_DECISION" }).success).toBe(false);
    expect(DecisionContextSchema.safeParse({ ...context, evidence_hashes: [HASH_A] }).success).toBe(false);
    const r1 = decisionContext({ ...approval(), status: "PENDING" }, [], true);
    expect(DecisionContextSchema.safeParse({ ...r1, evidence_hashes: null }).success).toBe(false);
    expect(DecisionContextSchema.safeParse({ ...r1, evidence_hashes: [HASH_A, HASH_A] }).success).toBe(false);
  });
  it("lists every accepted risk choice without guessing an unrecorded currency", () => {
    const snap = snapshot();
    const grants = snap.document.relations["manager.risk:risk_grants"];
    grants.items.push({ ...grants.items[0], fields: { ...grants.items[0].fields, risk_grant_id: "risk_second" } });
    const result = paperCaptureContext(approval(), "R2_CREATE", snap);
    expect(result.availability.state).toBe("AVAILABLE");
    expect(result.candidates.map(item => item.risk_grant_id)).toEqual(["risk_test", "risk_second"]);
    expect(result.candidates.every(item => item.currency === null)).toBe(true);
    expect(result.expected_projection_digest).toBe(HASH_B);
  });
  it.each(["manager.deployments:strategy_deployments", "manager.risk:risk_grants", "manager.portfolios:portfolios"])(
    "never joins another profile/workspace through %s", name => {
      const snap = snapshot();
      snap.document.relations[name].items[0].lineage.profile_id = "another-profile";
      expect(paperCaptureContext(approval(), "R2_CREATE", snap).availability.state).toBe("BLOCKED");
      snap.document.relations[name].items[0].lineage.workspace_id = "another-workspace";
      expect(paperCaptureContext(approval(), "R2_CREATE", snap).candidates).toEqual([]);
    });
  it("blocks stale or unavailable relations and emits no trusted capture inputs", () => {
    const snap = snapshot();
    snap.document.relations["manager.risk:risk_grants"].freshness = "STALE";
    const result = paperCaptureContext(approval(), "R2_CREATE", snap);
    expect(result).toMatchObject({ expected_projection_digest: null, candidates: [],
      availability: { state: "BLOCKED", reason_code: "R2_RISK_GRANT_SOURCE_UNAVAILABLE" } });
    expect(CaptureContextSchema.safeParse({ ...result, expected_projection_digest: HASH_A }).success).toBe(false);
  });
  it("binds Paper Exit to accepted R2 portfolio/deployment and checks venue before offering the action", () => {
    const parent = { ...approval("R2"), subjectId: "dep_test", status: "PENDING" };
    expect(paperCaptureContext(parent, "PAPER_EXIT_CREATE", snapshot(), lineage()).candidates).toHaveLength(1);
    expect(paperCaptureContext(parent, "PAPER_EXIT_CREATE", snapshot(), { ...lineage(), portfolioId: "another" }).availability.state).toBe("BLOCKED");
    const snap = snapshot();
    delete snap.document.relations["manager.deployments:strategy_deployments"].items[0].fields.venue;
    expect(paperCaptureContext(parent, "PAPER_EXIT_CREATE", snap, lineage()).availability.reason_code).toBe("PAPER_VENUE_UNAVAILABLE");
  });
  it("bounds candidates to 50 and marks the limited catalogue honestly", () => {
    const snap = snapshot();
    const deployments = snap.document.relations["manager.deployments:strategy_deployments"];
    deployments.items = Array.from({ length: 201 }, (_, n) => ({ ...deployments.items[0],
      fields: { ...deployments.items[0].fields, deployment_id: `dep_${n}` } }));
    expect(paperCaptureContext(approval(), "R2_CREATE", snap)).toMatchObject({ candidates_truncated: true });
    expect(paperCaptureContext(approval(), "R2_CREATE", snap).candidates).toHaveLength(50);
  });
  it("retained/source-off/nonadmin reads remain local and never query a source candidate", async () => {
    const h = harness();
    expect((await h.service.context({ ...user, role: "USER" }, "R2_CREATE", approval())).availability.reason_code).toBe("ADMIN_ROLE_REQUIRED");
    h.config.EXECUTION_READ_PROFILE = "retained_review_v1";
    expect((await h.service.context(user, "R2_CREATE", approval())).availability.reason_code).toBe("CAPTURE_RETAINED_REVIEW_READ_ONLY");
    h.config.EXECUTION_READ_PROFILE = "source_current_v1";
    h.config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER = "false";
    expect((await h.service.context(user, "R2_CREATE", approval())).availability.reason_code).toBe("CAPTURE_PROJECTION_NOT_AUTHORIZED");
    expect(h.read).not.toHaveBeenCalled();
  });
  it("domain outage/scope/stale failures degrade the context, not the readable Core approval", async () => {
    const h = harness();
    h.read.mockRejectedValueOnce(new Error("private db details"));
    expect((await h.service.context(user, "R2_CREATE", approval())).availability.reason_code).toBe("CAPTURE_PROJECTION_UNAVAILABLE");
    const foreign = snapshot(); foreign.document.workspace_id = "another";
    h.read.mockResolvedValueOnce(foreign);
    expect((await h.service.context(user, "R2_CREATE", approval())).availability.reason_code).toBe("CAPTURE_PROJECTION_SCOPE_MISMATCH");
    const stale = snapshot(); stale.lastSuccessfulRefreshAt = new Date(0);
    h.read.mockResolvedValueOnce(stale);
    expect((await h.service.context(user, "R2_CREATE", approval())).availability.reason_code).toBe("CAPTURE_PROJECTION_STALE");
  });
  it("does not grant capture rights from ADMIN alone or cache a revoked gate right", async () => {
    const h = harness();
    expect((await h.service.context(user, "R2_CREATE", approval())).availability.state).toBe("AVAILABLE");
    h.access.mockResolvedValue({ isOwner: false, capabilities: [], scopes: {} });
    expect((await h.service.context(user, "R2_CREATE", approval())).availability.reason_code).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(h.access).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])("uses the correct snapshot reader when stores are split=%s", async split => {
    const h = harness(split);
    const client = {} as PoolClient;
    const privateReader = h.service as unknown as {
      paperSnapshot(client: PoolClient, workspace: string, digest: string): Promise<ProfileProjectionSnapshot>;
    };
    await privateReader.paperSnapshot(client, "ws_test", HASH_B);
    expect(h.read).toHaveBeenCalledWith("ws_test", "paper", "paper_test", split ? h.domain : client);
  });
  it("still blocks a forged direct retained capture despite browser manipulation", async () => {
    const h = harness(); h.config.EXECUTION_READ_PROFILE = "retained_review_v1";
    const privateReader = h.service as unknown as { paperSnapshot(client: PoolClient, workspace: string, digest: string): Promise<unknown> };
    await expect(privateReader.paperSnapshot({} as PoolClient, "ws_test", HASH_B)).rejects.toMatchObject({ code: "CAPTURE_RETAINED_REVIEW_READ_ONLY" });
    expect(h.read).not.toHaveBeenCalled();
  });
});
