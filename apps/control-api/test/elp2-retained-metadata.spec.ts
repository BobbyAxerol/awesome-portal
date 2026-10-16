/** TEST_ONLY authority adapters, real scope minting. These tests prove local
 * composition/privacy, not live source qualification or a deployed receipt. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AuthSession, PortalUser } from "../src/domain";
import { testConfig } from "./harness";
import { ExecutionReadScopes, ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { accessDigest, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import type { ReviewedAccessPolicy, ScopedAccessGrant, AccessResource } from "../src/execution-v2/access.contract";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { retainedContextV2Schema } from "../src/execution-v2/retained-context.contract";
import { ExecutionProfileProjectionRepository, type ProfileProjectionSnapshot, type ProjectionScalar } from "../src/execution/profile-projection.repository";
import { ExecutionRetainedReviewController } from "../src/execution/retained-review.controller";
import { PortalDerivationsService } from "../src/execution/portal-derivations.service";
import { OperationalCompositionService } from "../src/execution/operational-composition.service";
import { profileProjectionCatalog } from "../src/execution/profile-projection.catalog";
import type { WorkspacesRepository } from "../src/repos/workspaces";
import type { OwnerAccessService } from "../src/auth/owner-access.service";

const NOW = 1_800_000_000_000, WORKSPACE = "TEST_ONLY-metadata-workspace", USER = "TEST_ONLY-user", OWNER = "TEST_ONLY-owner";
const own = { alpha_id: "own-alpha", alpha_version_id: "own-version", portfolio_id: "shared-portfolio",
  deployment_id: "own-deployment", account_id: "shared-account", strategy_id: "str-own" };
const peer = { ...own, alpha_id: "peer-alpha", alpha_version_id: "peer-version", deployment_id: "peer-deployment", strategy_id: "str-peer" };
const tuples = [own, peer].map(({ strategy_id: _strategy, ...tuple }) => tuple);
const resources: AccessResource[] = [...new Map(tuples.flatMap(t => [
  { kind: "ALPHA" as const, id: t.alpha_id }, { kind: "ALPHA_VERSION" as const, id: t.alpha_version_id },
  { kind: "DEPLOYMENT" as const, id: t.deployment_id }, { kind: "PORTFOLIO" as const, id: t.portfolio_id },
  { kind: "ACCOUNT" as const, id: t.account_id },
]).map(r => [JSON.stringify(r), r])).values()];
const user = { userId: USER, username: USER, displayName: USER, role: "USER", status: "ACTIVE", mustChangePassword: false,
  sessionVersion: 1, failedLoginCount: 0, lockedUntil: null, createdAt: new Date(NOW), updatedAt: new Date(NOW),
  disabledAt: null, archivedAt: null, accountRevision: 1 } as PortalUser;
const session = { sessionId: "TEST_ONLY-session", userId: USER, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date(NOW), idleExpiresAt: new Date(NOW + 60_000), absoluteExpiresAt: new Date(NOW + 3_600_000) } as AuthSession;
const principal = { user, session, workspaceId: WORKSPACE };
const request = { portalUser: user, portalSession: session, portalWorkspaceId: WORKSPACE };

function fixture(options: { legacy?: boolean; noPublication?: boolean } = {}) {
  const policy: ReviewedAccessPolicy = { workspace_id: WORKSPACE, revision: "TEST_ONLY-policy", artifact_digest: accessDigest(["TEST_ONLY"]),
    approval_ref: "TEST_ONLY-not-approval", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: OWNER,
    researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-fields", fields: [...BUSINESS_READ_FIELDS] } };
  const membership = { revision: "TEST_ONLY-membership", receipt_id: "TEST_ONLY-receipt", mapping_revision: "TEST_ONLY-mapping" };
  const grant: ScopedAccessGrant = { grant_id: "TEST_ONLY-grant", subject_user_id: USER, workspace_id: WORKSPACE,
    action: "alpha.read", effect: "ALLOW", selector: { kind: "OWN_ALPHA" }, environments: ["paper", "sandbox", "live"],
    valid_from_ms: NOW - 60_000, valid_until_ms: NOW + 3_600_000, delegable_actions: [], issued_by: OWNER,
    parent_grant_id: null, revision: "TEST_ONLY-grant", policy_revision: policy.revision, revoked_at_ms: null,
    requires_ts_acceptance: true, ts_receipt: { ...membership, membership_revision: membership.revision,
      effective_at_ms: NOW - 60_000, expires_at_ms: NOW + 3_600_000 }, field_policy_ref: policy.researcher_fields.policy_ref };
  const context: AccessEvaluationContext = { principal_id: USER, workspace_id: WORKSPACE, now_ms: NOW, actor_current: true,
    actor_role: "USER", allow_test_only: true, authority_fingerprint: "TEST_ONLY-authority", policy,
    grants: [grant, { ...grant, grant_id: "TEST_ONLY-portfolio-grant", action: "portfolio.read_restricted",
      selector: { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [own.portfolio_id] } }],
    active_principals: new Set([USER, OWNER]), relationsFor: () => ({ qualified: true, revision: "TEST_ONLY-relations",
      own_alpha_ids: [own.alpha_id], member_portfolio_ids: [own.portfolio_id], roots: {}, membership }) };
  const access = { readContext: async () => context, confirmReadContext: async () => context,
    readPublication: async (r: ExecutionReadPublicationRequest) => options.noPublication ? null : ({
      workspace_id: WORKSPACE, environment: r.environment, profile_id: r.profile_id, binding: r.binding,
      qualification: "TEST_ONLY", publication_revision: "TEST_ONLY-publication", population_coverage: "COMPLETE_FOR_DATASET_WINDOW",
      provenance_ref: "TEST_ONLY-not-source-proof", resources, tuples,
      strategy_lineage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-strategies", provenance_ref: "TEST_ONLY-not-source-proof",
        pairs: [own, peer].map(t => ({ strategy_id: t.strategy_id, alpha_id: t.alpha_id })) },
      current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-links", provenance_ref: "TEST_ONLY-not-source-proof",
        pairs: tuples.map(t => ({ alpha_id: t.alpha_id, portfolio_id: t.portfolio_id })) },
    }) } as unknown as ExecutionAccessService;
  const authorityPool = { query: vi.fn(async () => ({ rows: [{ role: "USER", session_version: 1,
    policy: options.legacy ? null : policy, policy_seen: !options.legacy, policy_revision: policy.revision,
    workspace_exists: true, member: true, owner: false, retained: [] }] })) } as unknown as Pool;
  const config = { ...testConfig(), FEATURE_EXECUTION_LOCAL_PROJECTION: "true" as const, EXECUTION_READ_PROFILE: "retained_review_v1" as const,
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WORKSPACE, EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_TEST",
    EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_TEST", EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_TEST" };
  const scopes = new ExecutionReadScopes(authorityPool, access, config);
  const snapshot: ProfileProjectionSnapshot = { document: { schema_version: "portal.execution.profile-projection.v1",
    workspace_id: WORKSPACE, environment: "paper", profile_id: "PAPER_TEST", source_contract_revision: "TEST_ONLY-contract", relations: {} },
    sourceEpoch: "TEST_ONLY-source", sourceCursor: "TEST_ONLY-cursor", sourceAsOf: new Date(NOW), receivedAt: new Date(NOW),
    lastSuccessfulRefreshAt: new Date(NOW), completeness: "COMPLETE", projectionEpoch: "TEST_ONLY-epoch", projectionSequence: 7,
    payloadDigest: "TEST_ONLY-global-digest", sourceCatalogueSha256: null };
  function setRelation(key: string, rows: Record<string, ProjectionScalar>[]) {
    snapshot.document.relations[key] = { source_id: key.split(":")[0]!, relation: key.split(":")[1]!, availability: "AVAILABLE",
      reason_code: null, as_of: new Date(NOW).toISOString(), freshness: "FRESH", completeness: "COMPLETE",
      items: rows.map(fields => ({ fields: { mode: "paper", venue: "TEST_ONLY-venue", ...fields },
        lineage: { workspace_id: WORKSPACE, profile_id: "PAPER_TEST", source_contract_revision: "TEST_ONLY-contract" } })) };
  }
  setRelation("manager.strategies:strategies", [own, peer]);
  setRelation("manager.deployments:strategy_deployments", [own, peer]);
  setRelation("manager.orders:orders", [{ ...own, order_id: "own-order", status: "FILLED" }, { ...peer, order_id: "SECRET-peer", status: "NEW" }]);
  const forProfile = (_workspace: string, environment: "paper" | "sandbox" | "live", profile: string) => ({ ...snapshot,
    document: { ...snapshot.document, environment, profile_id: profile } });
  const repository = { snapshot: vi.fn(async (workspace: string, environment: "paper" | "sandbox" | "live", profile: string) => forProfile(workspace, environment, profile)),
    rawSnapshot: vi.fn(async (workspace: string, environment: "paper" | "sandbox" | "live", profile: string) => forProfile(workspace, environment, profile)),
    snapshotMetadata: vi.fn(async (workspace: string, environment: "paper" | "sandbox" | "live", profile: string) => forProfile(workspace, environment, profile)) };
  const repo = repository as unknown as ExecutionProfileProjectionRepository;
  const dataPool = { query: vi.fn(async () => ({ rows: [] })) };
  const workspaces = { canReadExecution: vi.fn(async () => true) } as unknown as WorkspacesRepository;
  const owner = { effectiveAccess: vi.fn(async () => ({ isOwner: false })) };
  const controller = new ExecutionRetainedReviewController(config, dataPool as unknown as Pool, workspaces,
    owner as unknown as OwnerAccessService, scopes, repo);
  return { controller, derivations: new PortalDerivationsService(config, repo, scopes), scopes, repository, repo, setRelation,
    config, grant, owner, snapshot, dataPool, workspaces };
}

describe("ELP2 retained metadata and named derivation authority", () => {
  it("does not reveal profile clocks on a scoped stale-ceiling refusal", async () => {
    const f = fixture();
    Object.assign(f.config, { EXECUTION_READ_PROFILE: "current_source", EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 1 });
    f.snapshot.sourceAsOf = new Date(0);
    f.snapshot.lastSuccessfulRefreshAt = new Date(0);
    const result = await f.derivations.sourceHealth(principal, "paper");
    expect(result.profiles).toEqual([expect.objectContaining({ state: "UNAVAILABLE", freshness: "UNKNOWN",
      reason_code: "N31_PROJECTION_STALE_CEILING_EXCEEDED", as_of: null, as_of_ms: null })]);
    expect(JSON.stringify(result)).not.toContain("1970-01-01");
  });
  it("publishes scoped current counts and typed absent history without global metadata SQL", async () => {
    const f = fixture();
    const result = retainedContextV2Schema.parse(await f.controller.context(request, {}));
    const binding = profileProjectionCatalog("paper").find(b => b.relation === "orders")!;
    const panel = result.profiles[0]!.panels.find(p => p.panel_id === binding.key)!;
    expect(panel).toMatchObject({ current_row_count: 1, history_row_count: null,
      reason_code: "EXECUTION_READ_HISTORY_METADATA_NOT_PUBLISHED", oldest_available_ms: null, newest_available_ms: null });
    expect(f.dataPool.query).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("TEST_ONLY-global-digest");
    expect(result).toMatchObject({ stream_enabled: false, mutation_enabled: false, upstream_enabled: false });
  });
  it("keeps context usable with explicit missing-publication metadata, never fabricated zero", async () => {
    const f = fixture({ noPublication: true });
    const result = retainedContextV2Schema.parse(await f.controller.context(request, {}));
    expect(result.profiles.flatMap(p => p.panels).every(p => p.current_row_count === null && p.history_row_count === null)).toBe(true);
    expect(result.profiles.every(p => p.metadata_state === "NOT_PUBLISHED")).toBe(true);
    expect(f.dataPool.query).not.toHaveBeenCalled();
  });
  it("retains legacy v1 metadata reads and shape", async () => {
    const f = fixture({ legacy: true });
    expect(await f.controller.context(request, {})).toMatchObject({ schema_version: "portal.execution.retained-review.v1" });
    expect(f.dataPool.query).toHaveBeenCalledTimes(9);
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("fences grant revocation during the owner metadata await", async () => {
    const f = fixture();
    f.owner.effectiveAccess.mockImplementation(async () => { f.grant.revoked_at_ms = NOW - 1; return { isOwner: false }; });
    await expect(f.controller.context(request, {})).rejects.toBeInstanceOf(ExecutionReadScopeError);
  });
  it("filters before Alpha activity populations", async () => {
    const f = fixture();
    const response = await f.derivations.alphaActivity(principal, own.alpha_id, "paper");
    expect(response.data).toMatchObject({ order_population: "1", deployment_population: "1" });
    expect(JSON.stringify(response)).not.toContain("SECRET-peer");
  });
  it("accepts an owned Alpha deployment through exact source tuple, not an invented direct grant", async () => {
    const f = fixture();
    const result = await f.derivations.deploymentQuality(principal, own.deployment_id, "paper");
    expect(result.data).toMatchObject({ deployment_id: own.deployment_id, order_population: "1" });
    await expect(f.derivations.deploymentQuality(principal, peer.deployment_id, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });
  it("joins child legs only through an unambiguous permitted parent", async () => {
    const f = fixture();
    const groups = "manager.conditional-orders:conditional_order_groups", legs = "manager.conditional-orders:conditional_order_group_legs";
    f.setRelation(groups, [{ ...own, group_id: "own-group" }, { ...peer, group_id: "peer-group" }]);
    f.setRelation(legs, [{ group_id: "own-group", leg_id: "own-leg", sequence: 1 }, { group_id: "peer-group", leg_id: "SECRET-leg", sequence: 1 }]);
    const response = await f.derivations.conditionalLegs(principal, "own-group", "paper");
    expect((response.data as { legs: unknown[] }).legs).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain("SECRET-leg");
    f.setRelation(groups, [{ ...own, group_id: "own-group" }, { ...peer, group_id: "own-group" }]);
    expect((await f.derivations.conditionalLegs(principal, "own-group", "paper")).data).toMatchObject({ legs: [] });
  });
  it("fences raw source cutover before delivery", async () => {
    const f = fixture();
    f.repository.snapshotMetadata.mockResolvedValueOnce(f.snapshot).mockResolvedValue({ ...f.snapshot, payloadDigest: "changed" });
    await expect(f.derivations.alphaActivity(principal, own.alpha_id, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it("scopes operational journal rows and revisions before composition", async () => {
    const f = fixture();
    f.setRelation("manager.command-journal:command_journal", [
      { ...own, state: "COMPLETED", created_at: new Date(NOW).toISOString() },
      { ...peer, state: "SECRET-peer-command", created_at: new Date(NOW).toISOString() },
    ]);
    const service = new OperationalCompositionService(f.config, f.derivations, f.repo,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, f.workspaces, f.scopes);
    const result = await (service as unknown as { redactedCommandJournal(p: typeof principal): Promise<Record<string, unknown>> }).redactedCommandJournal(principal);
    expect(result.rows).toHaveLength(3); // one authorized row in each synthetic profile
    expect(JSON.stringify(result)).not.toContain("SECRET-peer-command");
    expect(JSON.stringify(result)).not.toContain("TEST_ONLY-global-digest");
  });
});
