/** TEST_ONLY authority adapters, real scope minting. These tests prove local
 * composition/privacy, not live source qualification or a deployed receipt. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AuthSession, PortalUser } from "../src/domain";
import { testConfig } from "./harness";
import { ExecutionReadScopes, ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { accessDigest, canonicalSelector, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest } from "../src/execution-v2/access-current-relations";
import { tsMembershipAcceptance, type ReviewedAccessPolicy, type ScopedAccessGrant, type AccessResource } from "../src/execution-v2/access.contract";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { retainedContextV2Schema } from "../src/execution-v2/retained-context.contract";
import { ExecutionProfileProjectionRepository, type ProfileProjectionSnapshot, type ProjectionScalar } from "../src/execution/profile-projection.repository";
import { ExecutionRetainedReviewController } from "../src/execution/retained-review.controller";
import { PortalDerivationsService } from "../src/execution/portal-derivations.service";
import { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { ProfileReadService } from "../src/profile-read/profile-read.service";
import { ResourceReadService } from "../src/resource-read/resource-read.service";
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
  const context: AccessEvaluationContext & { grants: ScopedAccessGrant[] } = { principal_id: USER, workspace_id: WORKSPACE, now_ms: NOW, actor_current: true,
    actor_role: "USER", actor_lease_until_ms: NOW + 3_600_000, allow_test_only: true, authority_fingerprint: "TEST_ONLY-authority", policy,
    grants: [grant, { ...grant, grant_id: "TEST_ONLY-portfolio-grant", action: "portfolio.read_restricted",
      selector: { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [own.portfolio_id] } }],
    active_principals: new Set([USER, OWNER]), relationsFor: () => ({ qualified: true, revision: "TEST_ONLY-relations",
      own_alpha_ids: [own.alpha_id], member_portfolio_ids: [own.portfolio_id], roots: {}, membership }) };
  const access = { hasNativeCurrentRelations: () => false,
    readContext: vi.fn(async () => context), confirmReadContext: vi.fn(async (_actor: unknown, _workspace: unknown, expected: AccessEvaluationContext) => expected),
    readPublication: vi.fn(async (r: ExecutionReadPublicationRequest) => options.noPublication ? null : ({
      workspace_id: WORKSPACE, environment: r.environment, profile_id: r.profile_id, binding: r.binding,
      qualification: "TEST_ONLY", publication_revision: "TEST_ONLY-publication", population_coverage: "COMPLETE_FOR_DATASET_WINDOW",
      provenance_ref: "TEST_ONLY-not-source-proof", resources, tuples,
      strategy_lineage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-strategies", provenance_ref: "TEST_ONLY-not-source-proof",
        pairs: [own, peer].map(t => ({ strategy_id: t.strategy_id, alpha_id: t.alpha_id })) },
      current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-links", provenance_ref: "TEST_ONLY-not-source-proof",
        pairs: tuples.map(t => ({ alpha_id: t.alpha_id, portfolio_id: t.portfolio_id })) },
    })) };
  const authorityPool = { query: vi.fn(async () => ({ rows: [{ role: "USER", session_version: 1,
    policy: options.legacy ? null : policy, policy_seen: !options.legacy, policy_revision: policy.revision,
    workspace_exists: true, member: true, owner: false, retained: [] }] })) } as unknown as Pool;
  const config = { ...testConfig(), FEATURE_EXECUTION_LOCAL_PROJECTION: "true" as const, EXECUTION_READ_PROFILE: "retained_review_v1" as const,
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WORKSPACE, EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_TEST",
    EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_TEST", EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_TEST" };
  const scopes = new ExecutionReadScopes(authorityPool, access as unknown as ExecutionAccessService, config);
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
    config, grant, context, access, owner, snapshot, dataPool, workspaces };
}

/** Synthetic versioned source legs, not a native source or installed grant. */
function versionedSource(f: ReturnType<typeof fixture>) {
  const g = f.grant, receipt = g.ts_receipt!;
  const proofs = f.context.grants.map(grant => {
    const accepted = tsMembershipAcceptance.parse({ source: "TEST_ONLY-source", source_contract: "TEST_ONLY-contract",
      trust_profile: "TEST_ONLY-profile", receipt_id: receipt.receipt_id, proposal_id: `TEST_ONLY-${grant.grant_id}-proposal`,
      proposal_digest: accessDigest(["TEST_ONLY-proposal", grant.grant_id]), portal_user_id: USER, ts_user_id: "TEST_ONLY-ts-user",
      mapping_revision: receipt.mapping_revision, human_requester_user_id: OWNER, workspace_id: WORKSPACE,
      action: grant.action, selector_digest: accessDigest(canonicalSelector(grant.selector)), environments: grant.environments,
      previous_membership_revision: null, membership_revision: receipt.membership_revision,
      effective_at_ms: receipt.effective_at_ms, expires_at_ms: receipt.expires_at_ms, outcome: "ACCEPTED",
      payload_digest: accessDigest(["TEST_ONLY-payload", grant.grant_id]), provenance_ref: "TEST_ONLY-not-source-proof" });
    grant.ts_acceptance_digest = accessDigest(accepted);
    const resource = grant.action === "alpha.read" ? { kind: "ALPHA" as const, id: own.alpha_id }
      : { kind: "PORTFOLIO" as const, id: own.portfolio_id };
    return { grant_id: grant.grant_id, binding_digest: grantBindingDigest(grant), accepted,
      targets: grant.environments.map(environment => ({ environment, resource, revision: "TEST_ONLY-leg",
        native_reference_digest: accessDigest(["TEST_ONLY", grant.grant_id, environment]),
        valid_from_ms: NOW - 100, valid_until_ms: NOW + 100_000 })) };
  });
  const current = currentAccessRelations.parse({ schema_version: "pma.core-current-relations.v1", subject_user_id: USER,
    workspace_id: WORKSPACE, ts_user_id: "TEST_ONLY-ts-user", mapping_revision: receipt.mapping_revision,
    resources: g.environments.map(environment => ({ environment, revision: "TEST_ONLY-cut",
      own_alpha_ids: [own.alpha_id], member_portfolio_ids: [own.portfolio_id], roots: [] })),
    grants: proofs,
  });
  const previous = f.context.relationsFor(USER);
  f.access.readContext.mockImplementation(async () => {
    const observed = structuredClone(current);
    return { ...f.context, relationsFor: () => ({ ...previous, membership: null, current_authority: observed }) };
  });
  return current;
}

describe("ELP2 retained metadata and named derivation authority", () => {
  it.each([
    ["manager.accounts", "accounts"],
    ["manager.accounts", "account_balances"],
    ["manager.accounts", "margin_balances"],
    ["manager.accounts", "account_sync_effective"],
    ["manager.reconciliation", "reconciliation_findings"],
  ] as const)("requires account authority for the deployment-scoped %s:%s relation", async (sourceId, relation) => {
    const f = fixture();
    f.setRelation(`${sourceId}:${relation}`, [{ ...own, mode: "sandbox", free: "42" }]);
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    const deploymentScope = { deploymentId: own.deployment_id, strategyId: own.strategy_id, accountId: own.account_id,
      mode: "sandbox" as const, venue: "TEST_ONLY-venue", portfolioId: own.portfolio_id,
      externalAccountRef: null, tupleUnique: true };
    const read = () => source.relation(principal, "sandbox", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      sourceId, relation, { limit: 20, deploymentScope });
    // An own-Alpha grant is not authority for the linked account's records.
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-other-account", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: ["TEST_ONLY-other"] } });
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    const accountGrant: ScopedAccessGrant = { ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } };
    f.context.grants.push(accountGrant);
    const allowed = await read() as { source: { data: { items: unknown[] } } };
    expect(allowed.source.data.items).toHaveLength(1);
    accountGrant.revoked_at_ms = NOW - 1;
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });

  it.each([
    ["manager.accounts", "broker_account_sync_effective"],
    ["manager.venue-accounts", "venue_accounts"],
  ] as const)("does not infer scoped physical binding access for %s:%s from Alpha or account grants", async (sourceId, relation) => {
    const f = fixture();
    f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } });
    f.setRelation(`${sourceId}:${relation}`, [{ ...own, mode: "sandbox", binding_id: "TEST_ONLY-binding", status: "SYNCED" }]);
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    const read = () => source.relation(principal, "sandbox", "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
      sourceId, relation, { limit: 20 });
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    // A nominal grant alone is not proof of the required exact, qualified
    // venue/mode/external-account to binding resolution.
    f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-binding-grant", action: "binding.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "BINDING", ids: ["TEST_ONLY-binding"] } });
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it.each([
    ["manager.positions", "positions_v2"],
    ["manager.sessions", "execution_sessions"],
    ["manager.orders", "orders"],
    ["manager.fills", "fills"],
  ] as const)("requires both Alpha and exact Account authority for the deployment-scoped %s:%s relation", async (sourceId, relation) => {
    const f = fixture();
    f.setRelation(`${sourceId}:${relation}`, [{ ...own, mode: "live", status: "TEST_ONLY-own" },
      { ...peer, mode: "live", status: "TEST_ONLY-peer" }]);
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    const deploymentScope = { deploymentId: own.deployment_id, strategyId: own.strategy_id, accountId: own.account_id,
      mode: "live" as const, venue: "TEST_ONLY-venue", portfolioId: own.portfolio_id,
      externalAccountRef: null, tupleUnique: true };
    const read = () => source.relation(principal, "live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      sourceId, relation, { limit: 20, deploymentScope });
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-other-account", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: ["TEST_ONLY-other"] } });
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    const accountGrant: ScopedAccessGrant = { ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } };
    f.context.grants.push(accountGrant);
    f.grant.revoked_at_ms = NOW - 1;
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    f.grant.revoked_at_ms = null;
    const allowed = await read() as { source: { data: { items: Array<{ fields: { deployment_id?: { value?: unknown } } }> } } };
    expect(allowed.source.data.items).toHaveLength(1);
    expect(allowed.source.data.items[0]?.fields.deployment_id?.value).toBe(own.deployment_id);
    accountGrant.revoked_at_ms = NOW - 1;
    await expect(read()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });

  it.each(["normal", "invalid-cursor"] as const)("rechecks both deployment and Account authority on %s when the Account grant is revoked during the source read", async variant => {
    const f = fixture();
    const accountGrant: ScopedAccessGrant = { ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } };
    f.context.grants.push(accountGrant);
    f.setRelation("manager.positions:positions_v2", [{ ...own, mode: "live" }]);
    const metadata = f.repository.snapshotMetadata.getMockImplementation()!;
    let observations = 0;
    f.repository.snapshotMetadata.mockImplementation(async (...args) => {
      const current = await metadata(...args);
      if (++observations === 2) accountGrant.revoked_at_ms = NOW - 1;
      return current;
    });
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    const deploymentScope = { deploymentId: own.deployment_id, strategyId: own.strategy_id, accountId: own.account_id,
      mode: "live" as const, venue: "TEST_ONLY-venue", portfolioId: own.portfolio_id,
      externalAccountRef: null, tupleUnique: true };
    await expect(source.relation(principal, "live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "manager.positions", "positions_v2", { limit: 20, deploymentScope, ...(variant === "invalid-cursor" ? { cursor: "invalid" } : {}) }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(observations).toBe(2);
  });

  it("binds a deployment cursor to the separately granted Account authority", async () => {
    const f = fixture();
    const accountGrant: ScopedAccessGrant = { ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } };
    f.context.grants.push(accountGrant);
    f.setRelation("manager.positions:positions_v2", [{ ...own, mode: "live", position_id: "TEST_ONLY-one" },
      { ...own, mode: "live", position_id: "TEST_ONLY-two" }]);
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    const deploymentScope = { deploymentId: own.deployment_id, strategyId: own.strategy_id, accountId: own.account_id,
      mode: "live" as const, venue: "TEST_ONLY-venue", portfolioId: own.portfolio_id,
      externalAccountRef: null, tupleUnique: true };
    const first = await source.relation(principal, "live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "manager.positions", "positions_v2", { limit: 1, deploymentScope }) as { source: { data: { next_cursor: string | null } } };
    expect(first.source.data.next_cursor).toEqual(expect.any(String));
    accountGrant.revision = "TEST_ONLY-new-account-grant-revision";
    await expect(source.relation(principal, "live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "manager.positions", "positions_v2", { limit: 1, deploymentScope, cursor: first.source.data.next_cursor! }))
      .rejects.toMatchObject({ code: "N31_PROJECTION_CURSOR_INVALID", status: 400 });
  });

  it("retains every Alpha and Account obligation for a complete deployment-scoped Live profile", async () => {
    const f = fixture();
    Object.assign(f.config, { EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM" });
    f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } });
    const fields = { ...own, mode: "live", venue: "TEST_ONLY-venue" };
    f.setRelation("manager.deployments:strategy_deployments", [fields]);
    f.setRelation("manager.positions:positions_v2", [{ ...fields, position_id: "TEST_ONLY-position" }]);
    f.setRelation("manager.sessions:execution_sessions", [{ ...fields, execution_session_id: "TEST_ONLY-session-row" }]);
    f.setRelation("manager.orders:orders", [{ ...fields, order_id: "TEST_ONLY-order" }]);
    f.setRelation("manager.fills:fills", [{ ...fields, fill_id: "TEST_ONLY-fill" }]);
    f.setRelation("manager.accounts:accounts", [fields]);
    f.setRelation("manager.accounts:account_balances", [{ ...fields, currency: "USDT", free: "42" }]);
    f.setRelation("manager.accounts:margin_balances", [{ ...fields, currency: "USDT", maintenance: "3" }]);
    f.setRelation("manager.accounts:account_sync_effective", [{ ...fields, sync_id: "TEST_ONLY-sync" }]);
    f.setRelation("manager.reconciliation:reconciliation_findings", [{ ...fields, finding_id: "TEST_ONLY-finding" }]);
    const finish = vi.spyOn(f.scopes, "deliverScopedTogether");
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    const view = await new ProfileReadService(source).snapshot(principal, "live",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", own.deployment_id);
    expect(view.data).toMatchObject({ positions: [expect.anything()], orders: [expect.anything()], fills: [expect.anything()] });
    // One exact deployment + ten available/withheld source scopes + four
    // separate execution Account obligations; physical broker stays dark.
    expect(finish.mock.calls.some(([scopes]) => scopes.length === 15)).toBe(true);
  });

  it.each([
    ["manager.accounts", "account_balances"],
    ["manager.accounts", "broker_account_sync_effective"],
    ["manager.venue-accounts", "venue_accounts"],
  ] as const)("does not change the pre-existing legacy retained relation %s:%s", async (sourceId, relation) => {
    const f = fixture({ legacy: true });
    f.setRelation(`${sourceId}:${relation}`, [{ ...own, mode: "sandbox", status: "SYNCED" }]);
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    const result = await source.relation(principal, "sandbox", "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
      sourceId, relation, { limit: 20 }) as { source: { data: { items: unknown[] } } };
    expect(result.source.data.items).toHaveLength(1);
  });

  it("keeps deployment facts visible but fences account facts by a separately revocable grant", async () => {
    function screen(revoke: boolean, accountAccess: boolean) {
      const f = fixture();
      Object.assign(f.config, { EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM" });
      const accountGrant: ScopedAccessGrant = { ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
        selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } };
      if (accountAccess) f.context.grants.push(accountGrant);
      const fields = { ...own, mode: "sandbox", venue: "TEST_ONLY-venue" };
      f.setRelation("manager.deployments:strategy_deployments", [fields]);
      f.setRelation("manager.accounts:accounts", [fields]);
      f.setRelation("manager.accounts:account_balances", [{ ...fields, currency: "USDT", free: "42" }]);
      f.setRelation("manager.accounts:margin_balances", [{ ...fields, currency: "USDT", maintenance: "3" }]);
      f.setRelation("manager.accounts:account_sync_effective", [{ ...fields, sync_id: "TEST_ONLY-sync" }]);
      f.setRelation("manager.positions:positions_v2", [{ ...fields, position_id: "TEST_ONLY-position" }]);
      f.setRelation("manager.sessions:execution_sessions", [{ ...fields, execution_session_id: "TEST_ONLY-session-row" }]);
      f.setRelation("manager.reconciliation:reconciliation_findings", [{ ...fields, finding_id: "TEST_ONLY-finding" }]);
      const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
      const relation = source.relation.bind(source);
      let completed = 0;
      vi.spyOn(source, "relation").mockImplementation(async (...args) => {
        try { return await relation(...args); }
        finally { if (++completed === 9 && revoke) accountGrant.revoked_at_ms = NOW - 1; }
      });
      return new ProfileReadService(source);
    }
    const alphaOnly = await screen(false, false).snapshot(principal, "sandbox",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", own.deployment_id);
    expect(alphaOnly.data).toMatchObject({ deployments: [expect.anything()], accounts: [], account_balances: [] });
    expect(alphaOnly.capabilities).toContainEqual(expect.objectContaining({ capability_id: "source.account_balances", state: "UNAVAILABLE" }));

    const authorized = await screen(false, true).snapshot(principal, "sandbox",
      "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", own.deployment_id);
    expect(authorized.data).toMatchObject({ deployments: [expect.anything()],
      account_balances: expect.arrayContaining([expect.objectContaining({ free: "42" })]) });
    expect(authorized.capabilities).toContainEqual(expect.objectContaining({ capability_id: "source.broker_sync",
      state: "UNAVAILABLE", reason_code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" }));
    await expect(screen(true, true).snapshot(principal, "sandbox", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", own.deployment_id))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("does not return an earlier Resource profile after its source authority is revoked during a later profile fence", async () => {
    const positive = fixture(); versionedSource(positive);
    const allowed = await new ResourceReadService(positive.config, positive.repo, positive.scopes)
      .read(principal, "ALPHA", own.alpha_id);
    expect(allowed).toMatchObject({ schema_version: "execution.alpha-resource.v2", visibility: "SCOPED" });

    const f = fixture(), source = versionedSource(f);
    const reader = new ResourceReadService(f.config, f.repo, f.scopes);
    const authorize = f.scopes.authorize.bind(f.scopes);
    let changed = false;
    vi.spyOn(f.scopes, "authorize").mockImplementation(async (...args) => {
      const result = await authorize(...args);
      if (!changed && args[1].environment === "sandbox" && f.repository.rawSnapshot.mock.calls.length === 3) {
        // Mutate the already-read Paper source leg only after the subsequent
        // Sandbox authorization has itself completed. A later Live success
        // must not release Paper data under its earlier authority.
        changed = true;
        source.grants[0]!.targets = source.grants[0]!.targets.filter(target => target.environment !== "paper");
      }
      return result;
    });
    await expect(reader.read(principal, "ALPHA", own.alpha_id))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(changed).toBe(true);
  });

  it("limits the retained Resource final fence to the original actor, purpose, resource and one scope per environment", async () => {
    const f = fixture();
    f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } });
    f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-binding-grant", action: "binding.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "BINDING", ids: ["TEST_ONLY-binding"] } });
    const publication = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      const value = await publication(request);
      return value && { ...value, resources: [...value.resources, { kind: "BINDING" as const, id: "TEST_ONLY-binding" }],
        binding_lineage: { qualification: "TEST_ONLY" as const, revision: "TEST_ONLY-binding-lineage",
          provenance_ref: "TEST_ONLY-not-source-proof", bindings: [{ binding_id: "TEST_ONLY-binding", account_id: own.account_id }] } };
    });
    const binding = { environment: "paper" as const, profileId: "PAPER_TEST" };
    const dataset = (dataset_id: string) => ({ dataset_id, source_revision: "TEST_ONLY-global-digest",
      projection_generation: "TEST_ONLY-epoch", catalogue_revision: null, window: null });
    const alpha = await f.scopes.authorize(principal, binding,
      { action: "alpha.read", dataset: dataset("relation:resource360:alpha") });
    const account = await f.scopes.authorize(principal, binding, { action: "account.read",
      resource: { kind: "ACCOUNT", id: own.account_id }, dataset: dataset("relation:resource360:account") });
    const portfolio = await f.scopes.authorize(principal, binding, { action: "portfolio.read_restricted",
      resource: { kind: "PORTFOLIO", id: own.portfolio_id }, dataset: dataset("relation:resource360:portfolio") });
    const venueBinding = await f.scopes.authorize(principal, binding, { action: "binding.read",
      resource: { kind: "BINDING", id: "TEST_ONLY-binding" }, dataset: dataset("relation:resource360:binding") });
    const wrongPurpose = await f.scopes.authorize(principal, binding,
      { action: "alpha.read", dataset: dataset("relation:manager.orders:orders") });
    const wrongAction = await f.scopes.authorize(principal, binding,
      { action: "alpha.read", dataset: dataset("relation:resource360:account") });
    const otherActor = await f.scopes.authorize({ ...principal, session: { ...session, sessionId: "TEST_ONLY-other" } },
      { environment: "sandbox", profileId: "SANDBOX_TEST" },
      { action: "alpha.read", dataset: dataset("relation:resource360:alpha") });
    const read = vi.fn(async () => "TEST_ONLY-result");
    expect(await f.scopes.deliverRetainedResource([alpha], "ALPHA", own.alpha_id, read)).toBe("TEST_ONLY-result");
    expect(await f.scopes.deliverRetainedResource([account], "ACCOUNT", own.account_id, read)).toBe("TEST_ONLY-result");
    expect(await f.scopes.deliverRetainedResource([portfolio], "PORTFOLIO", own.portfolio_id, read)).toBe("TEST_ONLY-result");
    expect(await f.scopes.deliverRetainedResource([venueBinding], "BINDING", "TEST_ONLY-binding", read)).toBe("TEST_ONLY-result");
    read.mockClear();
    for (const scopes of [[wrongPurpose], [alpha, alpha], [alpha, otherActor], [alpha, account]])
      await expect(f.scopes.deliverRetainedResource(scopes, "ALPHA", own.alpha_id, read))
        .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    for (const [scopes, id] of [[[account], "TEST_ONLY-other-account"], [[wrongAction], own.account_id]] as const)
      await expect(f.scopes.deliverRetainedResource(scopes, "ACCOUNT", id, read))
        .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    await expect(f.scopes.deliverRetainedResource([venueBinding], "BINDING", "TEST_ONLY-other-binding", read))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(read).not.toHaveBeenCalled();
  });

  it("does not return a Resource body when the caller session changes during final confirmation", async () => {
    const f = fixture();
    const caller = { ...principal, session: { ...session } };
    const confirm = f.access.confirmReadContext.getMockImplementation()!;
    f.access.confirmReadContext.mockImplementation(async (...args) => {
      const result = await confirm(...args);
      caller.session.sessionId = "TEST_ONLY-changed-session";
      return result;
    });
    await expect(new ResourceReadService(f.config, f.repo, f.scopes).read(caller, "ALPHA", own.alpha_id, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(f.access.confirmReadContext).toHaveBeenCalled();
  });

  it("does not return earlier Profile rows when authority is revoked after all individual reads finish", async () => {
    async function screen(change: "none" | "revoke" | "head" | "actor" | "authority" | "field") {
      const f = fixture();
      const caller = { ...principal, session: { ...session } };
      Object.assign(f.config, { EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM" });
      f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
        selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } });
      const fields = { ...own, mode: "sandbox", venue: "TEST_ONLY-venue" };
      f.setRelation("manager.deployments:strategy_deployments", [fields]);
      f.setRelation("manager.positions:positions_v2", [{ ...fields, position_id: "TEST_ONLY-position" }]);
      f.setRelation("manager.sessions:execution_sessions", [{ ...fields, execution_session_id: "TEST_ONLY-session-row" }]);
      f.setRelation("manager.reconciliation:reconciliation_findings", [{ ...fields, finding_id: "TEST_ONLY-finding" }]);
      const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
      const relation = source.relation.bind(source);
      let completed = 0;
      vi.spyOn(source, "relation").mockImplementation(async (...args) => {
        const result = await relation(...args);
        if (++completed === 4 && change === "revoke") f.grant.revoked_at_ms = NOW - 1;
        if (completed === 4 && change === "head") f.snapshot.payloadDigest = "TEST_ONLY-new-head";
        if (completed === 4 && change === "actor") caller.session.sessionId = "TEST_ONLY-other-session";
        if (completed === 4 && change === "authority") f.access.readContext.mockRejectedValueOnce(new Error("TEST_ONLY-private outage"));
        if (completed === 4 && change === "field")
          f.context.policy!.researcher_fields.fields = f.context.policy!.researcher_fields.fields.filter(field => field !== "position_id");
        return result;
      });
      return { f, caller, service: new ProfileReadService(source), get completed() { return completed; } };
    }
    const positive = await screen("none");
    const shown = await positive.service.snapshot(positive.caller, "sandbox", "SANDBOX_TRADING_SCREEN");
    expect(shown.data).toMatchObject({ deployments: [expect.anything()] });
    expect(positive.completed).toBe(4);

    const revoked = await screen("revoke");
    await expect(revoked.service.snapshot(revoked.caller, "sandbox", "SANDBOX_TRADING_SCREEN"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(revoked.completed).toBe(4);
    const changed = await screen("head");
    await expect(changed.service.snapshot(changed.caller, "sandbox", "SANDBOX_TRADING_SCREEN"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(changed.completed).toBe(4);
    const actor = await screen("actor");
    await expect(actor.service.snapshot(actor.caller, "sandbox", "SANDBOX_TRADING_SCREEN"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(actor.completed).toBe(4);
    const outage = await screen("authority");
    await expect(outage.service.snapshot(outage.caller, "sandbox", "SANDBOX_TRADING_SCREEN"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(outage.completed).toBe(4);
    const field = await screen("field");
    await expect(field.service.snapshot(field.caller, "sandbox", "SANDBOX_TRADING_SCREEN"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(field.completed).toBe(4);
  });
  it("fences a retained deployment-resolution absence even when no detail relation is read", async () => {
    function screen(revoke: boolean) {
      const f = fixture();
      Object.assign(f.config, { EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM" });
      f.setRelation("manager.deployments:strategy_deployments", []);
      const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
      const resolve = source.resolveDeploymentScope.bind(source);
      vi.spyOn(source, "resolveDeploymentScope").mockImplementation(async (...args) => {
        const result = await resolve(...args);
        if (revoke) f.grant.revoked_at_ms = NOW - 1;
        return result;
      });
      return new ProfileReadService(source);
    }
    const positive = await screen(false).snapshot(principal, "sandbox", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", own.deployment_id);
    expect(positive.resource_resolution?.state).toBe("EMPTY");
    await expect(screen(true).snapshot(principal, "sandbox", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", own.deployment_id))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("fences every contributing account-profile environment without turning one grant into another", async () => {
    function screen(revoke: boolean) {
      const f = fixture();
      Object.assign(f.config, { EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
        EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM", EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM" });
      f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-account-grant", action: "account.read",
        selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } });
      const fields = { ...own, venue: "TEST_ONLY-venue" };
      f.setRelation("manager.accounts:accounts", [{ ...fields, external_account_ref: "TEST_ONLY-broker" }]);
      f.setRelation("manager.accounts:account_balances", [{ ...fields, currency: "USDT", free: "10" }]);
      f.setRelation("manager.accounts:margin_balances", [{ ...fields, currency: "USDT", maintenance: "2" }]);
      f.setRelation("manager.accounts:account_sync_effective", [{ ...fields, sync_id: "TEST_ONLY-sync" }]);
      f.setRelation("manager.accounts:broker_account_sync_effective", [{ ...fields, external_account_ref: "TEST_ONLY-broker" }]);
      f.setRelation("manager.venue-accounts:venue_accounts", [{ ...fields, venue_account_id: "TEST_ONLY-venue-account" }]);
      f.setRelation("manager.deployments:strategy_deployments", [fields]);
      f.setRelation("manager.positions:positions_v2", [{ ...fields, position_id: "TEST_ONLY-position" }]);
      f.setRelation("manager.reconciliation:reconciliation_findings", [{ ...fields, finding_id: "TEST_ONLY-finding" }]);
      const raw = f.repository.rawSnapshot.getMockImplementation()!;
      f.repository.rawSnapshot.mockImplementation(async (workspace, environment, profile) => {
        const value = structuredClone(await raw(workspace, environment, profile));
        for (const relation of Object.values(value.document.relations)) for (const row of relation.items) {
          row.fields.mode = environment;
          row.lineage.profile_id = profile;
        }
        return value;
      });
      const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
      const finish = vi.spyOn(f.scopes, "deliverRetainedProfileAccounts");
      const relation = source.relation.bind(source);
      let completed = 0;
      vi.spyOn(source, "relation").mockImplementation(async (...args) => {
        try { return await relation(...args); }
        finally { if (++completed === 27 && revoke) f.grant.revoked_at_ms = NOW - 1; }
      });
      return { service: new ProfileReadService(source), finish, get completed() { return completed; } };
    }
    const positive = screen(false);
    const shown = await positive.service.accountBroker(principal, own.account_id);
    expect(shown.candidate_environments).toEqual(["live", "sandbox", "paper"]);
    expect(positive.completed).toBe(27);
    expect(positive.finish).toHaveBeenCalledTimes(1);
    // Physical bindings are dark; two child relations each retain independent
    // Alpha and Account obligations in all three environments (9 per env).
    expect(positive.finish.mock.calls[0]![0]).toHaveLength(27);
    // The public scoped population remains PARTIAL. A private proof over the
    // complete same-snapshot account census can nevertheless resolve this
    // exact authorized account, without claiming broker-reference uniqueness.
    const explicit = await screen(false).service.accountBroker(principal, own.account_id, "paper");
    expect(explicit.selected_environment).toBe("paper");
    expect(explicit.data).toMatchObject({ accounts: [expect.anything()], account_balances: [expect.anything()],
      positions: [expect.anything()], differences: [] });
    const revoked = screen(true);
    await expect(revoked.service.accountBroker(principal, own.account_id))
      // Account authority remains, but the combined alpha/account proof has
      // changed; the existing non-disclosing composition refusal is 409.
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(revoked.completed).toBe(27);
  });
  it("resolves an authorized Account 360 beyond the first page on one complete retained snapshot", async () => {
    const f = fixture();
    f.config.EXECUTION_EDGE_PAPER_PROFILE_ID = "PAPER_BINANCE_USDM";
    const raw = f.repository.rawSnapshot.getMockImplementation()!;
    f.repository.rawSnapshot.mockImplementation(async (workspace, environment, profile) => {
      const value = structuredClone(await raw(workspace, environment, profile));
      for (const relation of Object.values(value.document.relations)) for (const row of relation.items)
        row.lineage.profile_id = profile;
      return value;
    });
    f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-exact-account-grant", action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } });
    const others = Array.from({ length: 240 }, (_, i) => ({ ...own, deployment_id: `TEST_ONLY-deployment-${i}`,
      account_id: `TEST_ONLY-other-${i}`, mode: "paper", venue: "TEST_ONLY-venue" }));
    for (const ids of [others.slice(0, 200), others.slice(200)]) f.context.grants.push({ ...f.grant,
      grant_id: `TEST_ONLY-extra-accounts-${ids.length}`, action: "account.read",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: ids.map(item => item.account_id) } });
    const published = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      const value = await published(request);
      if (!value) return null;
      return { ...value, tuples: [...value.tuples, ...others.map(({ alpha_id, alpha_version_id, portfolio_id, deployment_id, account_id }) =>
        ({ alpha_id, alpha_version_id, portfolio_id, deployment_id, account_id }))],
      resources: [...value.resources, ...others.flatMap(item => [
        { kind: "ACCOUNT" as const, id: item.account_id }, { kind: "DEPLOYMENT" as const, id: item.deployment_id },
      ])] };
    });
    f.setRelation("manager.accounts:accounts", [...others, { ...own, mode: "paper", venue: "TEST_ONLY-venue", external_account_ref: "TEST_ONLY-ref" }]);
    f.setRelation("manager.accounts:account_balances", [...others.map(row => ({ ...row, currency: "USDT", free: "999" })),
      { ...own, currency: "USDT", free: "42" }]);
    f.setRelation("manager.accounts:margin_balances", [{ ...own, currency: "USDT", maintenance: "2" }]);
    f.setRelation("manager.accounts:account_sync_effective", [{ ...own, sync_id: "TEST_ONLY-sync" }]);
    f.setRelation("manager.deployments:strategy_deployments", [own, peer]);
    f.setRelation("manager.positions:positions_v2", [{ ...own, position_id: "TEST_ONLY-owned-position" },
      { ...peer, position_id: "TEST_ONLY-peer-position" }]);
    f.setRelation("manager.reconciliation:reconciliation_findings", [{ ...own, finding_id: "TEST_ONLY-finding" }]);
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    const firstPage = await source.relation(principal, "paper", "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
      "manager.accounts", "accounts", { limit: 200 }) as { source: { data: { items: unknown[]; next_cursor: string | null } } };
    expect(firstPage.source.data.items).toHaveLength(200);
    expect(firstPage.source.data.next_cursor).toEqual(expect.any(String));
    expect(JSON.stringify(firstPage.source.data.items)).not.toContain(own.account_id);
    // The exact target is a private composition parameter, not an HTTP or
    // caller-mintable bypass of the dataset and terminal authority fences.
    await expect(source.relation(principal, "paper", "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
      "manager.accounts", "accounts", { limit: 200, accountTarget: own.account_id }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    const result = await new ProfileReadService(source).accountBroker(principal, own.account_id, "paper");
    expect(result.selected_environment, JSON.stringify(result)).toBe("paper");
    expect(result.data).toMatchObject({ accounts: [expect.objectContaining({ account_id: own.account_id })],
      account_balances: [expect.objectContaining({ account_id: own.account_id, free: "42" })],
      positions: [expect.objectContaining({ position_id: "TEST_ONLY-owned-position" })] });
    expect(JSON.stringify(result)).not.toContain("TEST_ONLY-peer-position");
    expect(result.data.differences).toEqual([]); // Physical broker binding is still dark.
  });
  it.each(["partial", "truncated", "lineage-rejected", "unknown-account", "duplicate", "hidden-duplicate"] as const)(
    "keeps an Account 360 identity and children hidden for a %s census", async condition => {
      const f = fixture();
      f.config.EXECUTION_EDGE_PAPER_PROFILE_ID = "PAPER_BINANCE_USDM";
      f.context.grants.push({ ...f.grant, grant_id: "TEST_ONLY-account", action: "account.read",
        selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } });
      const raw = f.repository.rawSnapshot.getMockImplementation()!;
      f.repository.rawSnapshot.mockImplementation(async (workspace, environment, profile) => {
        const value = structuredClone(await raw(workspace, environment, profile));
        for (const relation of Object.values(value.document.relations)) for (const row of relation.items)
          row.lineage.profile_id = profile;
        return value;
      });
      const rows: Record<string, ProjectionScalar>[] = [{ ...own, external_account_ref: "TEST_ONLY-ref" }];
      if (condition === "duplicate") rows.push({ ...own, external_account_ref: "TEST_ONLY-other-ref" });
      if (condition === "hidden-duplicate") rows.push({ ...own, alpha_id: "TEST_ONLY-hidden-alpha",
        alpha_version_id: "TEST_ONLY-hidden-version", deployment_id: "TEST_ONLY-hidden-deployment", strategy_id: "TEST_ONLY-hidden-strategy" });
      if (condition === "unknown-account") rows.push({ ...own, account_id: null });
      f.setRelation("manager.accounts:accounts", rows);
      f.setRelation("manager.accounts:account_balances", [{ ...own, currency: "USDT", free: "42" }]);
      f.setRelation("manager.positions:positions_v2", [{ ...own, position_id: "TEST_ONLY-private-position" }]);
      const accounts = f.snapshot.document.relations["manager.accounts:accounts"]!;
      if (condition === "partial") accounts.completeness = "PARTIAL";
      if (condition === "truncated") accounts.window = { days: 30, max_rows: 2, basis: "MERGED_SNAPSHOT_LADDER", truncated: true };
      if (condition === "lineage-rejected") accounts.lineage_rejects = { missing_parent: 1 };
      const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
      const result = await new ProfileReadService(source).accountBroker(principal, own.account_id, "paper");
      expect(result.selected_environment).toBeNull();
      expect(result.unavailable_branches).toContainEqual(expect.objectContaining({ capability_id: "account.identity",
        reason_code: condition === "duplicate" ? "PHASE2_ACCOUNT_IDENTITY_DUPLICATE" : "PHASE2_ACCOUNT_IDENTITY_UNRESOLVED" }));
      expect(result.data).toMatchObject({ accounts: [], account_balances: [], positions: [] });
      expect(JSON.stringify(result)).not.toContain("TEST_ONLY-private-position");
    },
  );
  it.each(["account-revoked", "snapshot-changed"] as const)(
    "fences a resolved retained Account 360 if %s before final delivery", async change => {
      const f = fixture();
      f.config.EXECUTION_EDGE_PAPER_PROFILE_ID = "PAPER_BINANCE_USDM";
      const grant: ScopedAccessGrant = { ...f.grant, grant_id: "TEST_ONLY-account", action: "account.read",
        selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [own.account_id] } };
      f.context.grants.push(grant);
      const raw = f.repository.rawSnapshot.getMockImplementation()!;
      f.repository.rawSnapshot.mockImplementation(async (workspace, environment, profile) => {
        const value = structuredClone(await raw(workspace, environment, profile));
        for (const relation of Object.values(value.document.relations)) for (const row of relation.items)
          row.lineage.profile_id = profile;
        return value;
      });
      f.setRelation("manager.accounts:accounts", [{ ...own }]);
      f.setRelation("manager.accounts:account_balances", [{ ...own, currency: "USDT", free: "42" }]);
      f.setRelation("manager.positions:positions_v2", [{ ...own, position_id: "TEST_ONLY-position" }]);
      const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
      const read = source.relation.bind(source);
      let completed = 0;
      vi.spyOn(source, "relation").mockImplementation(async (...args) => {
        try { return await read(...args); }
        finally {
          if (++completed === 9) {
            if (change === "account-revoked") grant.revoked_at_ms = NOW - 1;
            else f.snapshot.payloadDigest = "TEST_ONLY-changed-head";
          }
        }
      });
      await expect(new ProfileReadService(source).accountBroker(principal, own.account_id, "paper"))
        .rejects.toMatchObject(change === "account-revoked"
          ? { code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 }
          : { code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
      expect(completed).toBe(9);
    },
  );
  it("does not use the cross-profile Account fence for a different purpose, actor, head, or duplicate", async () => {
    const f = fixture();
    const binding = { environment: "paper" as const, profileId: "PAPER_TEST" };
    const dataset = (dataset_id: string, source_revision = "TEST_ONLY-global-digest") => ({ dataset_id, source_revision,
      projection_generation: "TEST_ONLY-epoch", catalogue_revision: null, window: null });
    const allowed = await f.scopes.authorize(principal, binding,
      { action: "alpha.read", dataset: dataset("relation:manager.positions:positions_v2") });
    const wrongPurpose = await f.scopes.authorize(principal, binding,
      { action: "alpha.read", dataset: dataset("relation:manager.orders:orders") });
    const wrongAction = await f.scopes.authorize(principal, binding,
      { action: "alpha.read", dataset: dataset("relation:manager.accounts:accounts") });
    const wrongHead = await f.scopes.authorize(principal, binding,
      { action: "alpha.read", dataset: dataset("relation:manager.deployments:strategy_deployments", "TEST_ONLY-other") });
    const wrongActor = await f.scopes.authorize({ ...principal, session: { ...session, sessionId: "TEST_ONLY-other" } }, binding,
      { action: "alpha.read", dataset: dataset("relation:manager.deployments:strategy_deployments") });
    const read = vi.fn(async () => "never");
    for (const scopes of [[allowed, wrongPurpose], [allowed, wrongAction], [allowed, wrongHead], [allowed, wrongActor], [allowed, allowed]])
      await expect(f.scopes.deliverRetainedProfileAccounts(scopes, read)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(read).not.toHaveBeenCalled();
  });
  it("does not reuse a completed Profile collector as a read capability", async () => {
    const f = fixture();
    Object.assign(f.config, { EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM" });
    f.setRelation("manager.deployments:strategy_deployments", [{ ...own, mode: "sandbox" }]);
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    let old: Parameters<typeof source.relation>[6];
    const invoke = (composition: typeof old) => source.relation(principal, "sandbox", "SANDBOX_TRADING_SCREEN",
      "manager.deployments", "strategy_deployments", { limit: 1 }, composition);
    await source.composeProfile(principal, "SANDBOX_TRADING_SCREEN", ["sandbox"], async (composition) => {
      old = composition;
      await invoke(composition);
    });
    await expect(invoke(old)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
  });
  it("bounds the Profile collector before a 17th same-profile relation can read source data", async () => {
    const f = fixture();
    Object.assign(f.config, { EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM" });
    f.setRelation("manager.deployments:strategy_deployments", [{ ...own, mode: "sandbox" }]);
    const source = new ExecutionProductReadSource(f.config, f.repo, {} as never, f.scopes);
    await expect(source.composeProfile(principal, "SANDBOX_TRADING_SCREEN", ["sandbox"], async (composition) => {
      for (let i = 0; i < 17; i++) await source.relation(principal, "sandbox", "SANDBOX_TRADING_SCREEN",
        "manager.deployments", "strategy_deployments", { limit: 1 }, composition);
      return "must not return";
    })).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_LIMIT", status: 503 });
    expect(f.repository.rawSnapshot).toHaveBeenCalledTimes(16);
  });
  it("does not return earlier Paper health when its native leg is revoked during a later profile fence", async () => {
    const positive = fixture(); versionedSource(positive);
    expect((await positive.derivations.sourceHealth(principal)).profiles).toHaveLength(3);
    const f = fixture(), source = versionedSource(f);
    const original = f.repository.snapshotMetadata.getMockImplementation()!;
    let sandboxReads = 0;
    f.repository.snapshotMetadata.mockImplementation(async (workspace, environment, profile) => {
      if (environment === "sandbox" && ++sandboxReads === 2)
        source.grants[0]!.targets = source.grants[0]!.targets.filter(target => target.environment !== "paper");
      return original(workspace, environment, profile);
    });
    await expect(f.derivations.sourceHealth(principal)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(sandboxReads).toBeGreaterThan(1);
  });
  it("does not disclose a missing profile without a qualified dataset publication", async () => {
    const f = fixture(); versionedSource(f);
    const metadata = f.repository.snapshotMetadata.getMockImplementation()!;
    f.repository.snapshotMetadata.mockImplementation(async (workspace, environment, profile) =>
      environment === "paper" ? null as never : metadata(workspace, environment, profile));
    await expect(f.derivations.sourceHealth(principal)).rejects.toMatchObject({
      code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503,
    });
    expect(f.repository.rawSnapshot.mock.calls.some(([, environment]) => environment === "paper")).toBe(false);
  });
  it("limits cross-profile source-health composition to the intended purposes and exact actor", async () => {
    const f = fixture();
    const bind = { environment: "paper" as const, profileId: "PAPER_TEST" };
    const dataset = (dataset_id: string, source_revision = "TEST_ONLY-global-digest") => ({ dataset_id, source_revision,
      projection_generation: "TEST_ONLY-epoch", catalogue_revision: null, window: null });
    const retained = await f.scopes.authorize(principal, bind, { action: "alpha.read", dataset: dataset("relation:manager.strategies:strategies") });
    const wrongPurpose = await f.scopes.authorize(principal, bind, { action: "alpha.read", dataset: dataset("alpha_fleet_overview") });
    const otherHead = await f.scopes.authorize(principal, bind, { action: "alpha.read", dataset: dataset("relation:manager.orders:orders", "TEST_ONLY-other-head") });
    const otherActor = await f.scopes.authorize({ ...principal, session: { ...session, sessionId: "TEST_ONLY-other-session" } }, bind,
      { action: "alpha.read", dataset: dataset("relation:manager.orders:orders") });
    const read = vi.fn(async () => "never");
    await expect(f.scopes.deliverRetainedSourceHealth([wrongPurpose], read)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    await expect(f.scopes.deliverRetainedSourceHealth([retained, otherHead], read)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    await expect(f.scopes.deliverRetainedSourceHealth([retained, otherActor], read)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(read).not.toHaveBeenCalled();
  });
  it("admits the full 36-scope source-health bound and refuses overflow", async () => {
    const f = fixture();
    const datasets = ["relation:manager.strategies:strategies", "relation:manager.strategies:strategies",
      "relation:manager.deployments:strategy_deployments", "relation:manager.accounts:accounts",
      "relation:manager.accounts:account_balances", "relation:manager.portfolios:portfolios",
      "relation:manager.portfolios:portfolio_allocations", "relation:manager.sessions:execution_sessions",
      "relation:manager.orders:orders", "relation:manager.fills:fills",
      "relation:manager.conditional-orders:conditional_order_groups",
      "relation:manager.conditional-orders:conditional_order_group_legs"];
    const scopes = [];
    for (const [environment, profileId] of [["paper", "PAPER_TEST"], ["sandbox", "SANDBOX_TEST"], ["live", "LIVE_TEST"]] as const) {
      for (const dataset_id of datasets) scopes.push(await f.scopes.authorize(principal, { environment, profileId },
        { action: "alpha.read", dataset: { dataset_id, source_revision: "TEST_ONLY-global-digest",
          projection_generation: "TEST_ONLY-epoch", catalogue_revision: null, window: null } }));
    }
    const read = vi.fn(async () => "TEST_ONLY-safe");
    expect(await f.scopes.deliverRetainedSourceHealth(scopes, read)).toBe("TEST_ONLY-safe");
    expect(read).toHaveBeenCalledTimes(1);
    await expect(f.scopes.deliverRetainedSourceHealth([...scopes, scopes[0]!], read))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("does not report a stable missing profile when its scoped metadata head disappears before the raw read", async () => {
    const f = fixture();
    f.repository.rawSnapshot.mockResolvedValueOnce(null as never);
    await expect(f.derivations.sourceHealth(principal, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
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
  it("prefers a final revoke to a stale-source refusal on a scoped derived detail", async () => {
    const f = fixture();
    Object.assign(f.config, { EXECUTION_READ_PROFILE: "current_source", EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 1 });
    f.snapshot.lastSuccessfulRefreshAt = new Date(0);
    const orders = f.snapshot.document.relations["manager.orders:orders"]!, rows = orders.items;
    Object.defineProperty(orders, "items", { get: () => { f.grant.revoked_at_ms = NOW - 1; return rows; } });
    await expect(f.derivations.alphaActivity(principal, own.alpha_id, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });
  it("still returns the existing stale-source refusal if current authority remains valid", async () => {
    const f = fixture();
    Object.assign(f.config, { EXECUTION_READ_PROFILE: "current_source", EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 1 });
    f.snapshot.lastSuccessfulRefreshAt = new Date(0);
    await expect(f.derivations.alphaActivity(principal, own.alpha_id, "paper"))
      .rejects.toMatchObject({ code: "N31_PROJECTION_STALE_CEILING_EXCEEDED", status: 503 });
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
  it("keeps same-profile Portfolio scopes together while retaining their separate purpose", async () => {
    const f = fixture();
    f.context.grants[1]!.action = "portfolio.read";
    f.setRelation("manager.portfolios:portfolios", [{ ...own, name: "TEST_ONLY-portfolio", base_currency: "USDT" }]);
    f.setRelation("manager.portfolios:portfolio_allocations", [{ ...own, currency: "USDT", allocated_capital: "3", max_capital: "8" }]);
    f.setRelation("manager.accounts:account_balances", [{ ...own, currency: "USDT", total: "5", free: "4", locked: "1" }]);
    const response = await f.derivations.portfolioCapital(principal, own.portfolio_id, "paper");
    expect(response).toMatchObject({ state: "PARTIAL", data: { portfolio_id: own.portfolio_id,
      allocation_by_currency: [{ currency: "USDT", allocated_capital: "3", max_capital: "8" }] } });
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
  it("does not derive a shared-account group or its leg from the child's narrower Alpha tuple", async () => {
    const f = fixture();
    const groups = "manager.conditional-orders:conditional_order_groups", legs = "manager.conditional-orders:conditional_order_group_legs";
    f.setRelation(groups, [{ group_id: "shared-group", account_id: own.account_id }]);
    f.setRelation(legs, [{ ...own, group_id: "shared-group", leg_id: "SECRET-leg", sequence: 1 }]);
    const response = await f.derivations.conditionalLegs(principal, "shared-group", "paper");
    expect(response.data).toMatchObject({ group: null, legs: [] });
    expect(JSON.stringify(response)).not.toContain("SECRET-leg");
  });
  it.each(["live", "LIVE"])("does not derive a %s group and leg from a PAPER retained snapshot", async mode => {
    const f = fixture();
    const groups = "manager.conditional-orders:conditional_order_groups", legs = "manager.conditional-orders:conditional_order_group_legs";
    f.setRelation(groups, [{ ...own, group_id: "foreign-group", mode }]);
    f.setRelation(legs, [{ ...own, group_id: "foreign-group", leg_id: "SECRET-leg", sequence: 1, mode }]);
    const response = await f.derivations.conditionalLegs(principal, "foreign-group", "paper");
    expect(response.data).toMatchObject({ group: null, legs: [] });
    expect(JSON.stringify(response)).not.toContain("SECRET-leg");
  });
  it("derives an authorized uppercase PAPER source group without rewriting its leg", async () => {
    const f = fixture();
    const groups = "manager.conditional-orders:conditional_order_groups", legs = "manager.conditional-orders:conditional_order_group_legs";
    f.setRelation(groups, [{ ...own, group_id: "own-group", mode: "PAPER" }]);
    f.setRelation(legs, [{ ...own, group_id: "own-group", leg_id: "own-leg", sequence: 1, mode: "paper" }]);
    const response = await f.derivations.conditionalLegs(principal, "own-group", "paper");
    expect((response.data as { legs: unknown[] }).legs).toHaveLength(1);
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
