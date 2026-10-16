/** TEST_ONLY authority fixtures; real scope minting, no production qualification. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AuthSession, PortalUser } from "../src/domain";
import { testConfig } from "./harness";
import { CommandCenterRepository } from "../src/command-center/command-center.repository";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { accessDigest, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import type { ReviewedAccessPolicy, ScopedAccessGrant, AccessResource } from "../src/execution-v2/access.contract";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import type { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import type { WorkspacesRepository } from "../src/repos/workspaces";
import type { OwnerAccessService } from "../src/auth/owner-access.service";

const CORE = "TEST_ONLY-Core", SOURCE = "TEST_ONLY-source", USER = "TEST_ONLY-user", OWNER = "TEST_ONLY-owner";
function fixture(options: { coreV2?: boolean; sourceV2?: boolean; sourceDenied?: boolean } = {}) {
  const now = Date.now(), readAt = new Date(now);
  const user = { userId: USER, role: "USER", sessionVersion: 1 } as PortalUser;
  const session = { userId: USER, sessionId: "TEST_ONLY-session", sessionVersion: 1 } as AuthSession;
  const principal: ReadScopePrincipal = { user, session, workspaceId: CORE };
  const tuple = { alpha_id: "alpha", alpha_version_id: "av", portfolio_id: "portfolio", deployment_id: "dep", account_id: "account" };
  const resources: AccessResource[] = [{ kind: "ALPHA", id: "alpha" }, { kind: "ALPHA_VERSION", id: "av" },
    { kind: "PORTFOLIO", id: "portfolio" }, { kind: "DEPLOYMENT", id: "dep" }, { kind: "ACCOUNT", id: "account" }];
  const policy: ReviewedAccessPolicy = { workspace_id: SOURCE, revision: "TEST_ONLY-policy", artifact_digest: accessDigest("TEST_ONLY"),
    approval_ref: "TEST_ONLY-not-approval", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: OWNER,
    researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-fields", fields: ["deployment_id", "state"] } };
  const membership = { revision: "TEST_ONLY-membership", receipt_id: "TEST_ONLY-receipt", mapping_revision: "TEST_ONLY-map" };
  const grant: ScopedAccessGrant = { grant_id: "TEST_ONLY-grant", subject_user_id: USER, workspace_id: SOURCE,
    action: "business.read_all", effect: "ALLOW", selector: { kind: "ROOT_SCOPE", root_id: "root" }, environments: ["paper"],
    valid_from_ms: now - 60000, valid_until_ms: now + 3600000, delegable_actions: [], issued_by: OWNER,
    parent_grant_id: null, revision: "TEST_ONLY-grant", policy_revision: policy.revision, revoked_at_ms: null,
    requires_ts_acceptance: true, ts_receipt: { ...membership, membership_revision: membership.revision,
      effective_at_ms: now - 60000, expires_at_ms: now + 3600000 }, field_policy_ref: policy.researcher_fields.policy_ref };
  const state = { coreV2: !!options.coreV2, sourceV2: !!options.sourceV2, sourceDenied: !!options.sourceDenied,
    deletedPolicy: false, coreCurrent: true };
  const context = (): AccessEvaluationContext => ({ principal_id: USER, workspace_id: SOURCE, now_ms: now,
    actor_current: true, actor_role: "USER", allow_test_only: true, authority_fingerprint: "TEST_ONLY-authority",
    policy: state.deletedPolicy ? null : policy, grants: [grant], active_principals: new Set([USER, OWNER]),
    relationsFor: () => ({ qualified: true, revision: "TEST_ONLY-relations", own_alpha_ids: [], member_portfolio_ids: [],
      roots: { root: resources }, membership }) });
  const access = { readContext: vi.fn(async () => context()), confirmReadContext: vi.fn(async () => context()),
    readPublication: vi.fn(async (r: ExecutionReadPublicationRequest) => ({ workspace_id: SOURCE, environment: r.environment,
      profile_id: r.profile_id, binding: r.binding, qualification: "TEST_ONLY", publication_revision: "TEST_ONLY-publication",
      population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY", resources, tuples: [tuple],
      current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-links", provenance_ref: "TEST_ONLY",
        pairs: [{ alpha_id: "alpha", portfolio_id: "portfolio" }] } })) };
  const transaction = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  const pool = { connect: vi.fn(async () => transaction), query: vi.fn(async (_sql: string, values: unknown[]) => {
    const workspace = values[3];
    if (!state.coreCurrent || values[0] !== USER || values[2] !== session.sessionId) return { rows: [] };
    const v2 = workspace === CORE ? state.coreV2 : state.sourceV2;
    return { rows: [{ role: "USER", session_version: 1, policy: v2 && !state.deletedPolicy ? policy : null,
      policy_seen: v2, workspace_exists: workspace === CORE || workspace === SOURCE,
      member: workspace === CORE || !state.sourceDenied, owner: false, retained: [] }] };
  }) };
  // TEST_ONLY dependency fixture, not a deployable retained profile. The
  // production parser separately requires all three pinned profile IDs.
  const config = { ...testConfig(), EXECUTION_READ_PROFILE: "retained_review_v1" as const, FEATURE_EXECUTION_LOCAL_PROJECTION: "true" as const,
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: SOURCE, EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_TEST",
    EXECUTION_EDGE_SANDBOX_PROFILE_ID: "", EXECUTION_EDGE_LIVE_PROFILE_ID: "" };
  const snapshot = { payloadDigest: "TEST_ONLY-digest", projectionEpoch: "TEST_ONLY-epoch", sourceCatalogueSha256: null,
    sourceCursor: "TEST_ONLY-cursor", sourceAsOf: readAt, receivedAt: readAt, lastSuccessfulRefreshAt: readAt, projectionSequence: 1,
    document: { workspace_id: SOURCE, environment: "paper", profile_id: "PAPER_TEST", relations: {
      "manager.deployments:strategy_deployments": { availability: "AVAILABLE", items: [{ fields: { ...tuple, state: "PAPER" },
        lineage: { workspace_id: SOURCE, profile_id: "PAPER_TEST" } }] } } } };
  const projections = { snapshot: vi.fn(async () => snapshot), rawSnapshot: vi.fn(async () => snapshot),
    snapshotMetadata: vi.fn(async () => snapshot) };
  const dataPool = { query: vi.fn(async () => ({ rows: [] })) };
  const workspaces = { canReadExecution: vi.fn(async () => !state.sourceDenied) };
  const owner = { effectiveAccess: vi.fn(async () => ({ isOwner: false, capabilities: [], scopes: {} })) };
  const scopes = new ExecutionReadScopes(pool as unknown as Pool, access as unknown as ExecutionAccessService, config);
  const repo = new CommandCenterRepository(pool as unknown as Pool, config, dataPool as unknown as Pool,
    projections as unknown as ExecutionProfileProjectionRepository, workspaces as unknown as WorkspacesRepository,
    owner as unknown as OwnerAccessService, scopes);
  return { repo, state, principal, readAt, pool, projections, grant, dataPool, scopes };
}

describe("ELP2 Command Center Core/source separation", () => {
  it("keeps Core DTO identity while reading independently authorized legacy source", async () => {
    const f = fixture();
    const value = await f.repo.readAuthorized(f.principal, f.readAt, (input, scoped) => ({ input, scoped }));
    expect(value.input.workspaceId).toBe(CORE); expect(value.scoped).toBe(false);
    expect(f.projections.snapshot).toHaveBeenCalledWith(SOURCE, "paper", "PAPER_TEST");
    expect(f.pool.connect).toHaveBeenCalledOnce();
  });
  it("returns Core-only unavailable fleet after source access revocation without projection I/O", async () => {
    const f = fixture({ sourceDenied: true });
    const value = await f.repo.readAuthorized(f.principal, f.readAt, input => input);
    expect(value.workspaceId).toBe(CORE); expect(value.fleet.status.reason).toBe("WORKSPACE_NOT_FOUND");
    expect(f.projections.snapshot).not.toHaveBeenCalled(); expect(f.projections.rawSnapshot).not.toHaveBeenCalled();
    expect(f.dataPool.query).not.toHaveBeenCalled(); expect(f.pool.connect).toHaveBeenCalledOnce();
  });
  it("does not expose unqualified Core parent cards when only Core has V2 policy", async () => {
    const f = fixture({ coreV2: true });
    const value = await f.repo.readAuthorized(f.principal, f.readAt, (input, scoped) => ({ input, scoped }));
    expect(value.scoped).toBe(true); expect(f.pool.connect).not.toHaveBeenCalled();
    expect(value.input.triageSources.slice(0, 3).every(x => x.status.reason === "PORTAL_WORKFLOW_TARGET_LINEAGE_NOT_PUBLISHED")).toBe(true);
    expect(f.projections.snapshot).toHaveBeenCalledWith(SOURCE, "paper", "PAPER_TEST");
  });
  it("uses genuine source V2 scopes even when Core remains legacy; never reads legacy raw data", async () => {
    const f = fixture({ sourceV2: true });
    const legacy = vi.spyOn(f.repo, "read");
    const value = await f.repo.readAuthorized(f.principal, f.readAt, (input, scoped) => ({ input, scoped }));
    expect(value.scoped).toBe(true); expect(value.input.workspaceId).toBe(CORE);
    expect(value.input.fleet.items[0]?.cells.find(c => c.code === "PAPER")?.value).toBe(1);
    expect(legacy).not.toHaveBeenCalled(); expect(f.projections.snapshot).not.toHaveBeenCalled();
    expect(f.projections.rawSnapshot).toHaveBeenCalledWith(SOURCE, "paper", "PAPER_TEST");
  });
  it.each(["revoke", "activate-policy"] as const)("fences legacy source %s during async completion", async change => {
    const f = fixture();
    await expect(f.repo.readAuthorized(f.principal, f.readAt, async input => {
      if (change === "revoke") f.state.sourceDenied = true; else f.state.sourceV2 = true;
      return input;
    })).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it("does not fall back when a source V2 policy is deleted during completion", async () => {
    const f = fixture({ sourceV2: true });
    await expect(f.repo.readAuthorized(f.principal, f.readAt, async input => {
      f.state.deletedPolicy = true; return input;
    })).rejects.toMatchObject({ code: "EXECUTION_READ_POLICY_PENDING" });
    expect(f.projections.snapshot).not.toHaveBeenCalled();
  });
  it("fences source grant revocation after scoped composition", async () => {
    const f = fixture({ sourceV2: true });
    await expect(f.repo.readAuthorized(f.principal, f.readAt, async input => {
      f.grant.revoked_at_ms = Date.now() - 1; return input;
    })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.projections.snapshot).not.toHaveBeenCalled();
  });
  it("rechecks current Core session/membership after composition", async () => {
    const f = fixture();
    await expect(f.repo.readAuthorized(f.principal, f.readAt, async input => {
      f.state.coreCurrent = false; return input;
    })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });
  it("snapshots caller actor and Core workspace before async work", async () => {
    const f = fixture();
    const value = await f.repo.readAuthorized(f.principal, f.readAt, async input => {
      f.principal.user.userId = "MUTATED"; f.principal.workspaceId = "MUTATED";
      return input;
    });
    expect(value.workspaceId).toBe(CORE); expect(value.actor.userId).toBe(USER);
  });
});
