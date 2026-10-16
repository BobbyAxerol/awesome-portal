/** Pure adapter tests with real scope minting and synthetic TEST_ONLY trust.
 * PostgreSQL predicate/load qualification remains in the dedicated ELP2 cell. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AuthSession, PortalUser } from "../src/domain";
import type { ReviewedAccessPolicy, ScopedAccessGrant, AccessResource } from "../src/execution-v2/access.contract";
import { accessDigest, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeReadPopulation } from "../src/execution-v2/read-scope";
import { projectionRowVisible } from "../src/execution-v2/read-projection";
import { LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
import { ExecutionProfileProjectionRepository, type ProfileProjectionSnapshot, type ProjectionRelation } from "../src/execution/profile-projection.repository";
import { testConfig } from "./harness";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const NOW = 1_800_000_000_000, WORKSPACE = "TEST_ONLY-analytics-workspace", PROFILE = "TEST_ONLY-paper";
const USER = "TEST_ONLY-analytics-user", OWNER = "TEST_ONLY-owner";
const own = { alpha_id: "own-alpha", alpha_version_id: "own-version", deployment_id: "own-deployment",
  portfolio_id: "shared-portfolio", account_id: "shared-account" };
const peer = { ...own, alpha_id: "peer-alpha", alpha_version_id: "peer-version", deployment_id: "peer-deployment" };
const tuples = [own, peer];
const resources: AccessResource[] = [...new Map(tuples.flatMap(t => [
  { kind: "ALPHA" as const, id: t.alpha_id }, { kind: "ALPHA_VERSION" as const, id: t.alpha_version_id },
  { kind: "DEPLOYMENT" as const, id: t.deployment_id }, { kind: "PORTFOLIO" as const, id: t.portfolio_id },
  { kind: "ACCOUNT" as const, id: t.account_id },
]).map(r => [JSON.stringify(r), r])).values()];
const fields = ["alpha_id", "alpha_version_id", "deployment_id", "portfolio_id", "account_id", "strategy_id",
  "order_id", "status", "created_at", "equity", "timestamp_ms", "display_name"];
const principal = {
  user: { userId: USER, username: USER, displayName: USER, role: "USER", status: "ACTIVE",
    mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
    createdAt: new Date(NOW), updatedAt: new Date(NOW), disabledAt: null, accountRevision: 1, archivedAt: null } as PortalUser,
  session: { sessionId: "TEST_ONLY-session", userId: USER, state: "ACTIVE", sessionVersion: 1,
    authenticationTime: new Date(NOW), idleExpiresAt: new Date(NOW + 60_000), absoluteExpiresAt: new Date(NOW + 3_600_000) } as AuthSession,
  workspaceId: WORKSPACE,
};

function fixture(options: { legacy?: boolean; omitEquity?: boolean } = {}) {
  const policy: ReviewedAccessPolicy = { workspace_id: WORKSPACE, revision: "TEST_ONLY-policy-r1",
    artifact_digest: accessDigest(["TEST_ONLY"]), approval_ref: "TEST_ONLY-not-owner-approval", state: "REVIEWED",
    qualification: "TEST_ONLY", protected_owner_user_id: OWNER,
    researcher_fields: { state: "QUALIFIED", policy_ref: "TEST_ONLY-fields", fields: fields.filter(f => !options.omitEquity || f !== "equity") } };
  const membership = { revision: "TEST_ONLY-membership", receipt_id: "TEST_ONLY-receipt", mapping_revision: "TEST_ONLY-mapping" };
  const grant: ScopedAccessGrant = { grant_id: "TEST_ONLY-grant", subject_user_id: USER, workspace_id: WORKSPACE,
    action: "alpha.read", effect: "ALLOW", selector: { kind: "OWN_ALPHA" }, environments: ["paper"],
    valid_from_ms: NOW - 60_000, valid_until_ms: NOW + 3_600_000, delegable_actions: [], issued_by: OWNER,
    parent_grant_id: null, revision: "TEST_ONLY-grant-r1", policy_revision: policy.revision, revoked_at_ms: null,
    requires_ts_acceptance: true, ts_receipt: { ...membership, membership_revision: membership.revision,
      effective_at_ms: NOW - 60_000, expires_at_ms: NOW + 3_600_000 }, field_policy_ref: policy.researcher_fields.policy_ref };
  const context: AccessEvaluationContext = { principal_id: USER, workspace_id: WORKSPACE, now_ms: NOW,
    actor_current: true, actor_role: "USER", allow_test_only: true, authority_fingerprint: "TEST_ONLY-stable-authority",
    policy, grants: [grant, { ...grant, grant_id: "TEST_ONLY-portfolio-grant", action: "portfolio.read_restricted",
      selector: { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: [own.portfolio_id] } }],
    active_principals: new Set([USER, OWNER]), relationsFor: () => ({
      qualified: true, revision: "TEST_ONLY-relations", own_alpha_ids: [own.alpha_id], member_portfolio_ids: [own.portfolio_id],
      roots: {}, membership,
    }) };
  const publication = vi.fn(async (request: ExecutionReadPublicationRequest) => ({
    workspace_id: WORKSPACE, environment: request.environment, profile_id: request.profile_id,
    qualification: "TEST_ONLY", publication_revision: "TEST_ONLY-publication", binding: structuredClone(request.binding),
    population_coverage: "COMPLETE_FOR_DATASET_WINDOW", provenance_ref: "TEST_ONLY-not-source-proof",
    resources, tuples, strategy_lineage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-lineage",
      provenance_ref: "TEST_ONLY-not-source-proof", pairs: [
        { strategy_id: "str-own", alpha_id: own.alpha_id }, { strategy_id: "str-peer", alpha_id: peer.alpha_id },
      ] }, current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-links", provenance_ref: "TEST_ONLY-not-source-proof",
      pairs: tuples.map(t => ({ alpha_id: t.alpha_id, portfolio_id: t.portfolio_id })) },
  }));
  const access = { readContext: async () => context, confirmReadContext: async () => context,
    readPublication: publication } as unknown as ExecutionAccessService;
  const pool = { query: vi.fn(async () => ({ rows: [{ role: "USER", session_version: 1,
    policy: options.legacy ? null : policy, policy_seen: !options.legacy, policy_revision: policy.revision,
    workspace_exists: true, member: true, owner: false, retained: [] }] })) } as unknown as Pool;
  const config = { ...testConfig(), EXECUTION_READ_PROFILE: "retained_review_v1" as const,
    FEATURE_EXECUTION_LOCAL_PROJECTION: "true" as const, EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WORKSPACE,
    EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE };
  const scopes = new ExecutionReadScopes(pool, access, config);
  const relation = (name: string, rows: Record<string, string>[]): ProjectionRelation => ({ source_id: name.split(":")[0],
    relation: name.split(":")[1], availability: "AVAILABLE", reason_code: null, as_of: null,
    freshness: "STALE", completeness: "PARTIAL", items: rows.map(row => ({ fields: row,
      lineage: { workspace_id: WORKSPACE, profile_id: PROFILE, source_contract_revision: "TEST_ONLY-contract" } })) });
  const snapshot: ProfileProjectionSnapshot = { document: { schema_version: "portal.execution.profile-projection.v1",
    workspace_id: WORKSPACE, profile_id: PROFILE, environment: "paper", source_contract_revision: "TEST_ONLY-contract",
    relations: {
      "manager.strategies:strategies": relation("manager.strategies:strategies", [
        { alpha_id: own.alpha_id, strategy_id: "str-own" }, { alpha_id: peer.alpha_id, strategy_id: "str-peer" }]),
      "manager.deployments:strategy_deployments": relation("manager.deployments:strategy_deployments", [
        { ...own, strategy_id: "str-own" }, { ...peer, strategy_id: "str-peer" }]),
      "manager.orders:orders": relation("manager.orders:orders", [
        { ...own, strategy_id: "str-own", order_id: "own-order-1", status: "FILLED", created_at: new Date(NOW).toISOString() },
        { ...own, strategy_id: "str-own", order_id: "own-order-2", status: "NEW", created_at: new Date(NOW - 1000).toISOString() },
        { ...peer, strategy_id: "str-peer", order_id: "peer-secret-order", status: "FILLED", created_at: new Date(NOW).toISOString() }]),
    } }, sourceEpoch: "TEST_ONLY-source", sourceCursor: "TEST_ONLY-cursor", sourceAsOf: new Date(NOW),
    receivedAt: new Date(NOW), lastSuccessfulRefreshAt: new Date(NOW), completeness: "PARTIAL",
    projectionEpoch: "TEST_ONLY-epoch", projectionSequence: 1, payloadDigest: "TEST_ONLY-persisted-digest", sourceCatalogueSha256: null };
  const repository = {
    snapshot: vi.fn(async () => ({ ...snapshot, payloadDigest: "TEST_ONLY-augmented-digest" })),
    rawSnapshot: vi.fn(async () => snapshot), snapshotMetadata: vi.fn(async () => snapshot),
    timeSeriesHistoryDownsampled: vi.fn(async () => ({ rows: [], sourceRows: 0 })),
    timeSeriesDailyCloses: vi.fn(async (...args: unknown[]) => {
      const query = args[4] as { scope?: Parameters<typeof projectionRowVisible>[0] };
      const rows = [ { ...own, strategy_id: "str-own", value: "10", day: "2026-01-01" },
        { ...own, strategy_id: "str-own", value: "11", day: "2026-01-02" },
        { ...peer, strategy_id: "str-peer", value: "99999", day: "2026-01-01" },
        { ...peer, strategy_id: "str-peer", value: "99999", day: "2026-01-02" } ];
      return rows.filter(r => !query.scope || projectionRowVisible(query.scope, r))
        .map(r => ({ strategyId: r.strategy_id, accountId: r.account_id, day: r.day, value: r.value }));
    }),
  };
  return { service: new LocalQueryAnalyticsService(config, repository as unknown as ExecutionProfileProjectionRepository, scopes),
    scopes, repository, publication, snapshot, context, grant };
}

describe("ELP2 scoped analytics and history boundaries", () => {
  it("publishes additive scoped metadata with no fallback to profile observation times", async () => {
    const f = fixture();
    // No time-bearing economic rows: profile-global times must not stand in
    // for absent authorized record clocks.
    f.snapshot.document.relations["manager.orders:orders"].items = [];
    const value = await f.service.query(principal, "alpha", own.alpha_id);
    expect(value).toMatchObject({ schema_version: "execution.query-analytics-envelope.v2", source_read_at: null,
      scoped_metadata: { global_observation_clocks: "NOT_PUBLISHED", as_of_basis: "NOT_PUBLISHED" }, analytics: { as_of: null } });
    const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(process.cwd(), "../../packages/contracts");
    const schema = JSON.parse(readFileSync(resolve(contractsRoot, "schemas/execution-query-analytics.v2.schema.json"), "utf8"));
    const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true }); addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...value, source_read_at: new Date(NOW).toISOString() })).toBe(false);
    expect(validate({ ...value, analytics: { ...(value.analytics as object), as_of: new Date(NOW).toISOString() } })).toBe(false);
    const fixtures = JSON.parse(readFileSync(resolve(contractsRoot, "fixtures/execution-query-analytics.scoped.v2.json"), "utf8"));
    for (const fixture of fixtures.cases) expect(validate(fixture.value), JSON.stringify(validate.errors)).toBe(true);
  });
  it("publishes only the scoped authorized record timestamp and preserves legacy clocks", async () => {
    const f = fixture();
    f.context.policy!.researcher_fields.fields.push("quantity", "notional", "realized_pnl");
    const value = await f.service.query(principal, "alpha", own.alpha_id);
    expect(value).toMatchObject({ source_read_at: null, scoped_metadata: { as_of_basis: "AUTHORIZED_RECORD_TIMESTAMP" },
      analytics: { as_of: new Date(NOW).toISOString() } });
    const legacy = fixture({ legacy: true });
    const old = await legacy.service.query(principal, "alpha", own.alpha_id);
    expect(old).toMatchObject({ schema_version: "execution.query-analytics-envelope.v1", source_read_at: new Date(NOW).toISOString() });
    expect(old).not.toHaveProperty("scoped_metadata");
  });
  it("omits global clocks from observed timeline and mark-context panels", async () => {
    const f = fixture();
    const value = await f.service.observedTimeline(principal, { environment: "paper", subjectKind: "alpha", subjectId: own.alpha_id });
    expect(value.projection).toMatchObject({ received_at_ms: null, last_successful_refresh_at_ms: null });
    for (const key of ["observed_timeline", "mark_context"])
      expect(value[key]).toMatchObject({ clocks: { received_at_ms: null, ingested_at_ms: null, processed_at_ms: null } });
  });
  it("mints history scope from raw persisted pins and aggregates only permitted rows", async () => {
    const f = fixture();
    const result = await f.service.equitySparklines(principal, "paper");
    expect(result.series).toEqual({ "str-own": [10, 11] });
    expect(f.repository.snapshot).not.toHaveBeenCalled();
    expect(f.repository.rawSnapshot).toHaveBeenCalledWith(WORKSPACE, "paper", PROFILE);
    const scope = (f.repository.timeSeriesDailyCloses.mock.calls[0][4] as { scope: Parameters<typeof scopeReadPopulation>[0] }).scope;
    expect(scopeReadPopulation(scope)?.binding).toMatchObject({ dataset_id: "history:manager.performance:account_equity_snapshots",
      source_revision: f.snapshot.payloadDigest, projection_generation: f.snapshot.projectionEpoch, window: null });
    expect(f.repository.snapshotMetadata).toHaveBeenCalled();
  });
  it("keeps unreviewed compatibility on its existing augmented reader", async () => {
    const f = fixture({ legacy: true });
    await f.service.equitySparklines(principal, "paper");
    expect(f.repository.snapshot).toHaveBeenCalledOnce();
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("rejects wrong workspace and principal stripping before reading data", async () => {
    const f = fixture();
    await expect(f.service.equitySparklines({ ...principal, workspaceId: "other" }, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    await expect(f.service.equitySparklines({ workspaceId: WORKSPACE }, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(f.repository.rawSnapshot).not.toHaveBeenCalled();
  });
  it("refuses an unqualified financial field instead of deriving zero", async () => {
    const f = fixture({ omitEquity: true });
    await expect(f.service.equitySparklines(principal, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_FIELD_POLICY_PENDING" });
    expect(f.repository.timeSeriesDailyCloses).not.toHaveBeenCalled();
  });
  it("does not convert scoped history refusal into snapshot fallback", async () => {
    const f = fixture();
    f.repository.timeSeriesHistoryDownsampled.mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409));
    await expect(f.service.query(principal, "alpha", own.alpha_id))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it("rejects an epoch changed during aggregation at the delivery fence", async () => {
    const f = fixture();
    f.repository.snapshotMetadata.mockResolvedValue({ ...f.snapshot, projectionEpoch: "TEST_ONLY-new-epoch" });
    await expect(f.service.equitySparklines(principal, "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it("rechecks current grants after the history await", async () => {
    const f = fixture();
    f.repository.timeSeriesDailyCloses.mockImplementation(async () => {
      f.grant.revoked_at_ms = NOW - 1;
      return [];
    });
    await expect(f.service.equitySparklines(principal, "paper")).rejects.toBeInstanceOf(ExecutionReadScopeError);
  });
  it("does not report withheld financial sums as exact zero", async () => {
    const f = fixture();
    await expect(f.service.query(principal, "alpha", own.alpha_id))
      .rejects.toMatchObject({ code: "EXECUTION_READ_FIELD_POLICY_PENDING" });
  });
  it("drops peer facts before timeline composition and rejects a cursor after policy revision", async () => {
    const f = fixture();
    const request = { environment: "paper" as const, subjectKind: "alpha" as const, subjectId: own.alpha_id, limit: 1 };
    const result = await f.service.observedTimeline(principal, request);
    expect(JSON.stringify(result)).not.toContain("peer-secret-order");
    const cursor = (result.page as { next_cursor: string }).next_cursor;
    expect(cursor).toBeTypeOf("string");
    f.grant.revision = "TEST_ONLY-new-grant";
    await expect(f.service.observedTimeline(principal, { ...request, after: cursor }))
      .rejects.toMatchObject({ code: "EDS10_OBSERVED_TIMELINE_CURSOR_STALE" });
  });
});
