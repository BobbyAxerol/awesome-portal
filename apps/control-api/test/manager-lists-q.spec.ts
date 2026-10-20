/** FE-044 public Portfolio producer, real issuer/evaluator/reader and signed
 * cursors. Authority and retained rows below are explicit TEST_ONLY fixtures;
 * transaction transport is mocked. Not PG/source/browser qualification. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { ProfileProjectionSnapshot, ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { accessDigest, canonicalSelector } from "../src/execution-v2/access-policy";
import { currentAccessRelations, currentResources, grantBindingDigest } from "../src/execution-v2/access-current-relations";
import { tsMembershipAcceptance } from "../src/execution-v2/access.contract";
import { PortfolioListQuerySchema, type PortfolioListQuery } from "../src/manager-lists/contracts";
import type { ManagerListsRepository, PortfolioProjectionRecord, ProjectionSnapshot } from "../src/manager-lists/manager-lists.repository";
import { ManagerListsService } from "../src/manager-lists/manager-lists.service";
import { scopedManagerResponseSchema } from "../src/manager-lists/scoped-manager.contract";
import { productReadFixture, OWN, PRIVATE, FIELDS } from "./elp2-product-read.fixture";

const ENVS = ["paper", "sandbox", "live"] as const;
type Env = typeof ENVS[number];

function producer(options: { legacy?: boolean; names?: [string | null, string | null] } = {}) {
  const f = productReadFixture({ legacy: options.legacy,
    fields: [...new Set([...FIELDS, "stage", "state", "base_currency"])] });
  const names = options.names ?? ["Alpha shared", "Alpha private"];
  const profile = (environment: Env) => (environment === "paper" ? f.config.EXECUTION_EDGE_PAPER_PROFILE_ID :
    environment === "sandbox" ? f.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : f.config.EXECUTION_EDGE_LIVE_PROFILE_ID)!;
  const snapshots = new Map<Env, ProfileProjectionSnapshot>();
  for (const environment of ENVS) {
    const snapshot = structuredClone(f.snapshot);
    snapshot.environment = environment; snapshot.profileId = profile(environment);
    snapshot.document.environment = environment; snapshot.document.profile_id = profile(environment);
    for (const relation of Object.values(snapshot.document.relations)) for (const row of relation.items)
      row.lineage = { workspace_id: f.principal.workspaceId, profile_id: profile(environment), source_contract_revision: "TEST_ONLY" };
    snapshot.document.relations.portfolios = {
      source_id: "TEST_ONLY-portfolios", relation: "portfolios", availability: "AVAILABLE", completeness: "COMPLETE",
      reason_code: null, as_of: null, freshness: "UNKNOWN", items: [
        { portfolio_id: OWN.portfolio_id, name: names[0], state: "ACTIVE" },
        { portfolio_id: PRIVATE.portfolio_id, name: names[1], state: "ACTIVE" },
        // No resource/grant/publication for this row. It must not affect the
        // matches, visible count, page or cursors, even when its name matches.
        { portfolio_id: "TEST_ONLY-hidden", name: "Alpha SECRET_NEVER_RETURN", state: "ACTIVE" },
      ].map(fields => ({ fields, lineage: { workspace_id: f.principal.workspaceId,
        profile_id: profile(environment), source_contract_revision: "TEST_ONLY" } })),
    };
    snapshots.set(environment, snapshot);
  }

  // Same immutable original + current native acceptance grammar used by the
  // collection-purpose regression. Never cast an ALLOW into a branded scope.
  const relations = f.context.relationsFor(f.principal.user.userId);
  const native = currentAccessRelations.parse({ schema_version: "pma.core-current-relations.v1",
    subject_user_id: f.principal.user.userId, workspace_id: f.principal.workspaceId,
    ts_user_id: "TEST_ONLY-ts-user", mapping_revision: "TEST_ONLY-mapping", grants: [],
    resources: ENVS.map(environment => ({ environment, revision: "TEST_ONLY-current",
      own_alpha_ids: relations.own_alpha_ids, member_portfolio_ids: relations.member_portfolio_ids, roots: [] })) });
  for (const grant of f.context.grants) {
    const receipt = grant.ts_receipt!;
    const accepted = tsMembershipAcceptance.parse({ source: "TEST_ONLY-PM", source_contract: "TEST_ONLY-contract",
      trust_profile: "TEST_ONLY-profile", receipt_id: receipt.receipt_id, proposal_id: grant.grant_id,
      proposal_digest: accessDigest(grant.grant_id), portal_user_id: grant.subject_user_id, ts_user_id: native.ts_user_id,
      mapping_revision: receipt.mapping_revision, human_requester_user_id: grant.issued_by, workspace_id: grant.workspace_id,
      action: grant.action, selector_digest: accessDigest(canonicalSelector(grant.selector)), environments: grant.environments,
      previous_membership_revision: null, membership_revision: receipt.membership_revision, effective_at_ms: receipt.effective_at_ms,
      expires_at_ms: receipt.expires_at_ms, outcome: "ACCEPTED", payload_digest: accessDigest([grant.grant_id, "payload"]),
      provenance_ref: "TEST_ONLY-NOT-INSTALLED" });
    grant.ts_acceptance_digest = accessDigest(accepted);
    native.grants.push({ grant_id: grant.grant_id, binding_digest: grantBindingDigest(grant), accepted,
      targets: grant.environments.flatMap(environment => (currentResources(grant.selector, native, environment) ?? []).map(resource => ({
        resource, environment, revision: "TEST_ONLY-native", native_reference_digest: accessDigest([grant.grant_id, environment, resource]),
        valid_from_ms: f.context.now_ms - 100, valid_until_ms: f.context.now_ms + 5000,
      }))) });
  }
  f.context.relationsFor = () => ({ ...relations, current_authority: native });
  const clients: Array<{ query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> = [];
  const profiles = {
    pool: { connect: vi.fn(async () => {
      const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() }; clients.push(client); return client;
    }) },
    snapshotMetadata: vi.fn(async (_workspace: string, environment: Env) => snapshots.get(environment) ?? null),
    snapshot: vi.fn(async (_workspace: string, environment: Env) => snapshots.get(environment) ?? null),
  };
  // Legacy has profile-wide authorization, not a restricted slice. Its source
  // snapshot population stays independent of each browser's q.
  const legacyRows: PortfolioProjectionRecord[] = [OWN.portfolio_id, PRIVATE.portfolio_id].map((portfolioId, index) => ({
    portfolioId, name: names[index] ?? portfolioId, owner: null, state: "ACTIVE", baseCurrency: "USDT",
    environments: ["paper"], allocationCount: 0, deploymentCount: 0, allocatedByCurrency: [], updatedAt: new Date(0),
  }));
  const projection: ProjectionSnapshot = { sourceAsOf: null, sourceCompleteness: "PARTIAL", rowCount: legacyRows.length,
    refreshedAt: new Date(), summary: { total_portfolios: legacyRows.length, truncated: false, branches: {} } };
  const managerRepository = {
    pool: {} as Pool,
    snapshot: vi.fn(async () => projection),
    portfolioRows: vi.fn(async () => legacyRows),
  };
  const service = new ManagerListsService(managerRepository as unknown as ManagerListsRepository, f.product, f.config,
    f.scopes, profiles as unknown as ExecutionProfileProjectionRepository);
  const read = (query: Record<string, unknown> = {}) => service.portfolios(f.principal,
    PortfolioListQuerySchema.parse({ environment: "paper", ...query }));
  const scoped = (query: Record<string, unknown> = {}) => read(query).then(body => scopedManagerResponseSchema.parse(body));
  return { ...f, profiles, clients, managerRepository, legacyRows, projection, snapshots, service, read, scoped };
}

describe("FE-044 Portfolio name q public contract", () => {
  it("reuses the bounded Manager search grammar without trimming or normalization", () => {
    for (const q of ["a", "a".repeat(160), "Alpha %_", "  Alpha  ", "Hồ sơ", "e\u0301"])
      expect(PortfolioListQuerySchema.parse({ q }).q).toBe(q);
    expect(PortfolioListQuerySchema.parse({}).q).toBeUndefined();
  });
  it.each(["", "  ", "a".repeat(161), "Alpha\n", "A\u0000B", "A\u007fB", "\ud800", ["Alpha"], 1, null])(
    "rejects an invalid q %#", q => { expect(PortfolioListQuerySchema.safeParse({ q }).success).toBe(false); },
  );
  it("preserves unknown-key and cursor-direction validation", () => {
    expect(PortfolioListQuerySchema.safeParse({ q: "Alpha", search: "private" }).success).toBe(false);
    expect(PortfolioListQuerySchema.safeParse({ q: "Alpha", after: "a", before: "b" }).success).toBe(false);
  });
});

describe("FE-044 scoped producer search ordering, authority and cursors", () => {
  it("filters authorized names case-insensitively before counts and pagination", async () => {
    const f = producer({ names: ["A does not match", "Z target"] });
    const result = await f.scoped({ q: "TARGET", limit: 1 });
    expect(result.items.map(item => item.identity.portfolio_id)).toEqual([PRIVATE.portfolio_id]);
    expect(result.page).toMatchObject({ visible_count: 1, returned_count: 1, has_more: false, next_cursor: null, previous_cursor: null });
    expect(f.managerRepository.portfolioRows).not.toHaveBeenCalled();
    expect(f.upstream.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("does not match hidden names or publish hidden counts", async () => {
    const f = producer();
    const result = await f.scoped({ q: "SECRET" });
    expect(result.items).toEqual([]); expect(result.page.visible_count).toBe(0);
    expect(JSON.stringify(result)).not.toContain("SECRET_NEVER_RETURN");
    expect((await f.scoped({ q: "Alpha" })).page.visible_count).toBe(2);
  });
  it("searches name only, not opaque portfolio IDs", async () => {
    const result = await producer({ names: ["First", "Second"] }).scoped({ q: OWN.portfolio_id });
    expect(result.items).toEqual([]); expect(result.page.visible_count).toBe(0);
  });
  it("uses literal wildcard characters and preserves meaningful spaces", async () => {
    const f = producer({ names: ["Alpha %_", "Alpha other"] });
    expect((await f.scoped({ q: "%_" })).items.map(item => item.identity.portfolio_id)).toEqual([OWN.portfolio_id]);
    expect((await f.scoped({ q: " Alpha" })).items).toEqual([]);
    expect((await f.scoped({ q: "Alpha " })).page.visible_count).toBe(2);
  });
  it("does not normalize composed and decomposed Unicode into one name", async () => {
    const f = producer({ names: ["Café", "Cafe\u0301"] });
    expect((await f.scoped({ q: "é" })).items.map(item => item.identity.portfolio_id)).toEqual([OWN.portfolio_id]);
    expect((await f.scoped({ q: "e\u0301" })).items.map(item => item.identity.portfolio_id)).toEqual([PRIVATE.portfolio_id]);
  });
  it("does not turn a missing name into an opaque-ID search match", async () => {
    const f = producer({ names: [null, "Other"] });
    expect((await f.scoped({ q: OWN.portfolio_id })).items).toEqual([]);
    expect((await f.scoped()).page.visible_count).toBe(2);
  });
  it("reuses signed bidirectional pagination over the complete matching set", async () => {
    const f = producer(), first = await f.scoped({ q: "Alpha", limit: 1 });
    expect(first.page).toMatchObject({ visible_count: 2, returned_count: 1, has_more: true });
    const second = await f.scoped({ q: "Alpha", limit: 1, after: first.page.next_cursor });
    expect(second.page).toMatchObject({ visible_count: 2, returned_count: 1, has_more: false });
    expect(second.items[0].identity.portfolio_id).not.toBe(first.items[0].identity.portfolio_id);
    const back = await f.scoped({ q: "Alpha", limit: 1, before: second.page.previous_cursor });
    expect(back.items).toEqual(first.items);
  });
  it("rejects a cursor when q is changed, removed, case-changed or crossed to another environment", async () => {
    const f = producer(), first = await f.scoped({ q: "Alpha", limit: 1 });
    for (const query of [{ q: "other" }, {}, { q: "alpha" }, { q: "Alpha", environment: "all" }])
      await expect(f.scoped({ ...query, limit: 1, after: first.page.next_cursor })).rejects.toMatchObject({ code: "CURSOR_CONTEXT_MISMATCH" });
  });
  it("refuses a name query when that field is not authorized, even if nothing would match", async () => {
    const f = producer(); f.context.policy!.researcher_fields.fields = FIELDS.filter(field => field !== "name");
    await expect(f.scoped({ q: "no match" })).rejects.toMatchObject({ status: 400, code: "EXECUTION_READ_NOT_AVAILABLE" });
  });
  it("does not return a searched response if grants are revoked during the retained read", async () => {
    const f = producer();
    f.profiles.snapshot.mockImplementationOnce(async () => { f.context.grants = []; return f.snapshots.get("paper")!; });
    await expect(f.scoped({ q: "Alpha" })).rejects.toMatchObject({ status: 409, code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it("captures the query before asynchronous authority/source work", async () => {
    const f = producer(), query: PortfolioListQuery = { environment: "paper", q: "private" };
    const pending = f.service.portfolios(f.principal, query); query.q = "shared";
    const result = scopedManagerResponseSchema.parse(await pending);
    expect(result.items.map(item => item.identity.portfolio_id)).toEqual([PRIVATE.portfolio_id]);
  });
});

describe("FE-044 legacy profile-wide compatibility search", () => {
  it("filters only after profile authority and never overwrites the unfiltered projection/cache", async () => {
    const f = producer({ legacy: true });
    for (const [q, expected] of [["PRIVATE", PRIVATE.portfolio_id], ["shared", OWN.portfolio_id]] as const) {
      const result = await f.read({ q }) as { items: Array<{ portfolio_id: string }>; total_portfolios: number; matching_portfolios: number };
      expect(result.items.map(item => item.portfolio_id)).toEqual([expected]);
      // This pre-existing field is the unfiltered source-population census,
      // never a fabricated matching count beyond the retained capped rows.
      expect(result.total_portfolios).toBe(2);
      expect(result.matching_portfolios).toBe(1);
    }
    const all = await f.read() as { items: unknown[] }; expect(all.items).toHaveLength(2);
    expect(all).not.toHaveProperty("matching_portfolios");
    expect(f.legacyRows).toHaveLength(2);
    expect(f.profiles.snapshot).not.toHaveBeenCalled();
    expect(f.upstream.relationForNamedOperation).not.toHaveBeenCalled();
  });
  it("does not leak the projection on legacy identity mismatch", async () => {
    const f = producer({ legacy: true });
    f.principal.user.role = "ADMIN";
    await expect(f.read({ q: "private" })).rejects.toMatchObject({ status: 409, code: "EXECUTION_READ_ACCESS_CHANGED" });
    expect(f.managerRepository.portfolioRows).not.toHaveBeenCalled();
  });
  it("discloses source truncation without treating retained matching count as a global census", async () => {
    const f = producer({ legacy: true });
    f.projection.summary = { total_portfolios: 250, truncated: true, branches: {} };
    const body = await f.read({ q: "private" });
    expect(body).toMatchObject({ total_portfolios: 250, matching_portfolios: 1, truncated: true });
  });
  it("preserves explicit legacy pagination refusal instead of inventing new paging", async () => {
    const f = producer({ legacy: true });
    for (const query of [{ limit: 1 }, { after: "opaque" }, { before: "opaque" }])
      await expect(f.read({ q: "Alpha", ...query })).rejects.toMatchObject({ status: 400, code: "EXECUTION_READ_NOT_AVAILABLE" });
    expect(f.managerRepository.portfolioRows).not.toHaveBeenCalled();
  });
});
