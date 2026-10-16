/** Real policy/scope and product readers, synthetic authority + stored rows.
 * This suite proves ordering/redaction/fencing; it is not a TS qualification. */
import { vi } from "vitest";
import type { Pool } from "pg";
import type { PortalUser, AuthSession } from "../src/domain";
import type { AccessEvaluationContext, AccessRelations } from "../src/execution-v2/access-policy";
import { accessDigest } from "../src/execution-v2/access-policy";
import type { AccessResource, ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import type { ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { MaximumDataOperationService } from "../src/execution/maximum-data-operation.service";
import { retainedOperationPage } from "../src/execution/retained-operation-page";
import { managerRelationOperationByRoute } from "../src/execution/eds11r-manager-relation.registry";
import type { ExecutionProfileProjectionRepository, ProfileProjectionSnapshot } from "../src/execution/profile-projection.repository";
import { testConfig } from "./harness";

const NOW = 1_800_000_000_000, WS = "TEST_ONLY-product-workspace", OWNER = "TEST_ONLY-owner", USER = "TEST_ONLY-researcher";
export const OWN = { alpha_id: "own", alpha_version_id: "av-own", portfolio_id: "shared", deployment_id: "dep-own", account_id: "shared-account" };
export const PEER = { alpha_id: "peer", alpha_version_id: "av-peer", portfolio_id: "shared", deployment_id: "dep-peer", account_id: "shared-account" };
export const PRIVATE = { ...OWN, portfolio_id: "own-portfolio", deployment_id: "dep-private", account_id: "own-account" };
const tuples = [OWN, PEER, PRIVATE];
const lineages = (t: typeof OWN): AccessResource[] => [{ kind: "ALPHA", id: t.alpha_id },
  { kind: "ALPHA_VERSION", id: t.alpha_version_id }, { kind: "PORTFOLIO", id: t.portfolio_id },
  { kind: "DEPLOYMENT", id: t.deployment_id }, { kind: "ACCOUNT", id: t.account_id }];
const resources = [...new Map(tuples.flatMap(lineages).map(r => [JSON.stringify(r), r])).values()];
export const FIELDS = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id", "strategy_id", "environment",
  "order_id", "status", "venue", "side", "name", "display_name", "instrument_id", "created_at", "updated_at", "quantity", "balance_total", "currency", "equity"];

export function productReadFixture(options: { full?: boolean; legacy?: boolean; fields?: string[] } = {}) {
  const config = testConfig({ FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS,
    EXECUTION_READ_PROFILE: "retained_review_v1", AUTH_MODE: "dev",
    EXECUTION_DATABASE_URL: "postgres://portal:portal@127.0.0.1:5432/execution_test_only",
    EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM", EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM",
    EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM" });
  const user = { userId: USER, username: USER, displayName: USER, role: "USER", status: "ACTIVE", sessionVersion: 1,
    mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, createdAt: new Date(NOW), updatedAt: new Date(NOW),
    disabledAt: null, archivedAt: null, accountRevision: 1 } as PortalUser;
  const session: AuthSession = { sessionId: "TEST_ONLY-product-session", userId: USER, state: "ACTIVE", sessionVersion: 1,
    authenticationTime: new Date(NOW), idleExpiresAt: new Date(NOW + 60000), absoluteExpiresAt: new Date(NOW + 3600000) };
  const principal = { user, session, workspaceId: WS };
  const policy: ReviewedAccessPolicy = { workspace_id: WS, revision: "TEST_ONLY-policy-r1", artifact_digest: accessDigest(["product"]),
    approval_ref: "TEST_ONLY-NOT-OWNER-APPROVAL", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: OWNER,
    researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-fields-r1", fields: options.fields ?? FIELDS } };
  const membership = { revision: "TEST_ONLY-membership", receipt_id: "TEST_ONLY-receipt", mapping_revision: "TEST_ONLY-mapping" };
  const relations: AccessRelations = { qualified: true, revision: "TEST_ONLY-relations", own_alpha_ids: [OWN.alpha_id],
    member_portfolio_ids: [OWN.portfolio_id, PRIVATE.portfolio_id], roots: { root: resources }, membership };
  const grant = (action: ScopedAccessGrant["action"], selector: ScopedAccessGrant["selector"]): ScopedAccessGrant => ({
    grant_id: `TEST_ONLY-${action}`, subject_user_id: USER, workspace_id: WS, action, effect: "ALLOW", selector,
    environments: ["paper"], valid_from_ms: NOW - 1000, valid_until_ms: NOW + 3600000, delegable_actions: [],
    issued_by: OWNER, parent_grant_id: null, revision: "TEST_ONLY-grant-r1", policy_revision: policy.revision,
    revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: policy.researcher_fields.policy_ref,
    ts_receipt: { ...membership, membership_revision: membership.revision, effective_at_ms: NOW - 1000, expires_at_ms: NOW + 3600000 } });
  const context: AccessEvaluationContext = { principal_id: USER, workspace_id: WS, now_ms: NOW, actor_current: true,
    actor_role: "USER", allow_test_only: true, authority_fingerprint: "TEST_ONLY-db-r1", policy,
    active_principals: new Set([USER, OWNER]), relationsFor: () => relations,
    grants: options.full ? [grant("business.read_all", { kind: "ROOT_SCOPE", root_id: "root" })] : [
      grant("alpha.read", { kind: "OWN_ALPHA" }),
      grant("account.read", { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: [PRIVATE.account_id] }),
      grant("portfolio.read_restricted", { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: relations.member_portfolio_ids }),
    ] };
  const access = { readContext: vi.fn(async () => context), confirmReadContext: vi.fn(async () => context),
    readPublication: vi.fn(async (request: ExecutionReadPublicationRequest) => ({ ...request, qualification: "TEST_ONLY",
      publication_revision: "TEST_ONLY-publication", population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY-no-source-proof",
      resources, tuples, current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-links", provenance_ref: "TEST_ONLY-links",
        pairs: tuples.map(t => ({ alpha_id: t.alpha_id, portfolio_id: t.portfolio_id })) },
      strategy_lineage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-strategies", provenance_ref: "TEST_ONLY-strategies",
        pairs: [{ strategy_id: "strategy-own", alpha_id: OWN.alpha_id }, { strategy_id: "strategy-peer", alpha_id: PEER.alpha_id }] } })) };
  const pool = { query: vi.fn(async () => ({ rows: [{ role: "USER", session_version: 1, policy: options.legacy ? null : policy,
    policy_revision: policy.revision, policy_seen: !options.legacy, workspace_exists: true, member: true, owner: false, retained: [] }] })) };
  const scopes = new ExecutionReadScopes(pool as unknown as Pool, access as unknown as ExecutionAccessService, config);
  const relation = (name: string, fields: Record<string, string | null>[]) => ({ relation: name, availability: "AVAILABLE", completeness: "COMPLETE",
    reason_code: null, as_of: new Date(NOW).toISOString(), items: fields.map(value => ({ fields: value })) });
  const snapshot = { workspaceId: WS, environment: "paper", profileId: config.EXECUTION_EDGE_PAPER_PROFILE_ID,
    payloadDigest: `sha256:${"a".repeat(64)}`, projectionEpoch: "epoch-1", projectionSequence: 123,
    sourceCatalogueSha256: `sha256:${"b".repeat(64)}`, receivedAt: new Date(), lastSuccessfulRefreshAt: new Date(),
    document: { workspace_id: WS, environment: "paper", profile_id: config.EXECUTION_EDGE_PAPER_PROFILE_ID,
      source_contract_revision: "TEST_ONLY-contract", relations: {
      "manager.orders:orders": relation("orders", [
        { ...OWN, order_id: "order-own-1", status: "OPEN", side: "BUY", venue: "VENUE", quantity: "0", submitted_at: "2026-10-01T00:00:00.000Z", secret: "NEVER_RETURN" },
        { ...PEER, order_id: "order-peer", status: "PEER_ONLY_STATUS", side: "SELL", venue: "HIDDEN_VENUE", quantity: "999", submitted_at: "2026-10-03T00:00:00.000Z" },
        { ...PRIVATE, order_id: "order-own-2", status: "OPEN", side: "BUY", venue: "VENUE", quantity: "12345678901234567890.123456789", submitted_at: "2026-10-02T00:00:00.000Z" }]),
      "manager.accounts:account_balances": relation("account_balances", [
        { account_id: OWN.account_id, currency: "USDT", total: "1000000" }, { account_id: PRIVATE.account_id, currency: "USDT", total: "0" }]),
      "manager.deployments:strategy_deployments": relation("strategy_deployments", [
        { ...OWN, strategy_id: "strategy-own", mode: "paper", venue: "VENUE" },
        { ...PEER, strategy_id: "strategy-peer", mode: "paper", venue: "VENUE" }]),
    } } } as unknown as ProfileProjectionSnapshot;
  const repository = { snapshot: vi.fn(async () => snapshot), rawSnapshot: vi.fn(async () => snapshot), snapshotMetadata: vi.fn(async () => snapshot) };
  const named = { relationPage: vi.fn() };
  const product = new ExecutionProductReadSource(config, repository as unknown as ExecutionProfileProjectionRepository, named as never, scopes);
  const upstream = { relationForCataloguedOperation: vi.fn(), relationForNamedOperation: vi.fn() };
  const maximum = new MaximumDataOperationService(upstream as never, {} as never, config,
    repository as unknown as ExecutionProfileProjectionRepository, scopes);
  const orders = (query = {}) => product.relation(principal, "paper", "EXECUTION_FULL_BLOTTER_SCREEN", "manager.orders", "orders", { limit: 1, ...query }) as Promise<any>;
  return { config, principal, context, access, scopes, repository, snapshot, product, maximum, upstream, orders, named };
}
