/** Mixed Portfolio collection regression; synthetic TEST_ONLY source facts.
 * Real issuer/evaluator/ScopedManagerReader; TEST_ONLY synthetic authority,
 * retained documents and mocked transaction transport. NOT PostgreSQL proof,
 * commissioned TS authority, capacity measurement or browser acceptance.
 */
import { describe, expect, it, vi } from "vitest";
import type { ExecutionProfileProjectionRepository, ProfileProjectionSnapshot } from "../src/execution/profile-projection.repository";
import { ScopedManagerReader, composeManagerItems } from "../src/manager-lists/scoped-manager.reader";
import { PortfolioListQuerySchema } from "../src/manager-lists/contracts";
import { scopedManagerResponseSchema } from "../src/manager-lists/scoped-manager.contract";
import { ExecutionReadScopeError, type PortfolioCollectionPurpose, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { accessDigest, canonicalSelector } from "../src/execution-v2/access-policy";
import { currentAccessRelations, currentResources, grantBindingDigest } from "../src/execution-v2/access-current-relations";
import { tsMembershipAcceptance, type AccessResource, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { querySigningKeys } from "../src/config";
import { KeysetCursorCodec } from "../src/query/cursor";
import { productReadFixture, OWN, PEER, PRIVATE, FIELDS } from "./elp2-product-read.fixture";

type Env = "paper" | "sandbox" | "live";
type Purpose = "portfolio.read" | "portfolio.read_restricted";
const ENVS = ["paper", "sandbox", "live"] as const;
const fields = [...new Set([...FIELDS, "stage", "state", "base_currency", "allocation", "balance_free", "balance_locked", "realized_pnl", "unrealized_pnl", "exposure"])];
const unavailable = { status: 404, code: "EXECUTION_READ_NOT_AVAILABLE" };
const changed = { status: 409, code: "EXECUTION_READ_ACCESS_CHANGED" };

function fixture(options: { direct?: string[]; linked?: boolean; legacy?: boolean; envs?: Env[] } = {}) {
  const f = productReadFixture({ fields, legacy: options.legacy });
  const originals = f.context.grants;
  const envs = options.envs ?? [...ENVS];
  f.context.grants = [];
  if (options.linked !== false) f.context.grants.push(...originals.filter(g => g.action === "alpha.read" || g.action === "portfolio.read_restricted")
    .map(g => ({ ...g, environments: envs })));
  if (options.direct?.length) f.context.grants.push({ ...originals[0], grant_id: "TEST_ONLY-direct", action: "portfolio.read",
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: options.direct }, environments: envs });
  const inherited = f.context.relationsFor(f.principal.user.userId);
  const relations = { ...inherited, ...(options.linked === false ? { own_alpha_ids: [], member_portfolio_ids: [] } : {}) };
  f.context.relationsFor = () => relations;
  const profile = (env: Env) => (env === "paper" ? f.config.EXECUTION_EDGE_PAPER_PROFILE_ID :
    env === "sandbox" ? f.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : f.config.EXECUTION_EDGE_LIVE_PROFILE_ID)!;
  const snapshots = new Map<Env, ProfileProjectionSnapshot>();
  for (const env of ENVS) {
    const snapshot = structuredClone(f.snapshot);
    snapshot.environment = env; snapshot.profileId = profile(env);
    snapshot.document.environment = env; snapshot.document.profile_id = profile(env);
    for (const relation of Object.values(snapshot.document.relations)) for (const row of relation.items)
      row.lineage = { workspace_id: f.principal.workspaceId, profile_id: profile(env), source_contract_revision: "TEST_ONLY" };
    const relation = (name: string, values: Record<string, string | null>[]) => ({ source_id: `TEST_ONLY.${name}`, relation: name,
      availability: "AVAILABLE" as const, completeness: "COMPLETE" as const, reason_code: null, as_of: null,
      freshness: "UNKNOWN" as const, items: values.map(value => ({ fields: value,
        lineage: { workspace_id: f.principal.workspaceId, profile_id: profile(env), source_contract_revision: "TEST_ONLY" } })) });
    snapshot.document.relations.portfolios = relation("portfolios", [
      { portfolio_id: OWN.portfolio_id, name: "A shared", state: "PAPER", venue: "TEST_ONLY-VENUE" },
      { portfolio_id: PRIVATE.portfolio_id, name: "B private", state: "PAPER", venue: "TEST_ONLY-VENUE" },
    ]);
    snapshot.document.relations.allocations = relation("portfolio_allocations", [
      { ...OWN, allocated_capital: "1.0000000000000001", currency: "USD" },
      { ...PEER, allocated_capital: "999", currency: "USD" },
      { ...PRIVATE, allocated_capital: "2", currency: "USD" },
    ]);
    snapshot.document.relations["manager.accounts:account_balances"] = relation("account_balances", [
      { account_id: OWN.account_id, total: "880002", currency: "USD", physical_balance: "NEVER_RETURN" },
      { account_id: PRIVATE.account_id, total: "0", currency: "USD" },
    ]);
    snapshots.set(env, snapshot);
  }
  // MOCK TRANSACTION I/O ONLY. Main must add actual-PG transaction/clock proof.
  const clients: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }[] = [];
  const pool = { connect: vi.fn(async () => {
    const client = { query: vi.fn(async (_sql: string) => ({ rows: [] })), release: vi.fn() }; clients.push(client); return client;
  }) };
  const repository = { pool,
    snapshotMetadata: vi.fn(async (_workspace: string, env: Env, _profile: string) => snapshots.get(env) ?? null),
    snapshot: vi.fn(async (_workspace: string, env: Env, _profile: string, _client?: unknown) => snapshots.get(env) ?? null) };
  const reader = new ScopedManagerReader(repository as unknown as ExecutionProfileProjectionRepository, f.scopes, f.config);
  const legacy = vi.fn(async () => ({ TEST_ONLY: "legacy-result" }));
  const dataset = (env: Env) => ({ dataset_id: "manager:PORTFOLIOS", source_revision: snapshots.get(env)?.payloadDigest ?? "SNAPSHOT_NOT_RECORDED",
    projection_generation: snapshots.get(env)?.projectionEpoch ?? "PROJECTION_NOT_RECORDED",
    catalogue_revision: snapshots.get(env)?.sourceCatalogueSha256 ?? null, window: null });
  const purpose = (action: Purpose, env: Env = "paper", principal: ReadScopePrincipal = f.principal) =>
    f.scopes.authorizePortfolioCollectionPurpose(principal, { environment: env, profileId: profile(env) }, action, dataset(env));
  const read = (query: Record<string, unknown> = {}) => reader.read(f.principal, "PORTFOLIOS",
    PortfolioListQuerySchema.parse({ environment: "paper", ...query }), legacy).then(value => scopedManagerResponseSchema.parse(value));
  return { ...f, relations, snapshots, profile, repository, clients, reader, legacy, purpose, dataset, read };
}
type F = ReturnType<typeof fixture>;
function grant(f: F, action: Purpose) { return f.context.grants.find(g => g.action === action && g.effect === "ALLOW")!; }
// Compare exact response scalars, not decimal substrings of unrelated UTC
// timestamps, opaque digests or request IDs. In particular "999" can occur
// legitimately in read_at_ms and does not mean a peer allocation escaped.
function scalars(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(scalars);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(scalars);
  return [value];
}

/** Fully synthetic immutable original acceptance + exact current native legs.
 * No raw-ALLOW fake scope, installed trust material or production permission. */
function versioned(f: F) {
  const source = currentAccessRelations.parse({ schema_version: "pma.core-current-relations.v1",
    subject_user_id: f.principal.user.userId, workspace_id: f.principal.workspaceId,
    ts_user_id: "TEST_ONLY-ts-user", mapping_revision: "TEST_ONLY-mapping",
    resources: ENVS.map(environment => ({ environment, revision: "TEST_ONLY-current",
      own_alpha_ids: f.relations.own_alpha_ids, member_portfolio_ids: f.relations.member_portfolio_ids, roots: [] })), grants: [] });
  for (const g of f.context.grants.filter(value => value.effect === "ALLOW")) {
    const receipt = g.ts_receipt!;
    const accepted = tsMembershipAcceptance.parse({ source: "TEST_ONLY-PM", source_contract: "TEST_ONLY-contract", trust_profile: "TEST_ONLY-profile",
      receipt_id: receipt.receipt_id, proposal_id: g.grant_id, proposal_digest: accessDigest(g.grant_id), portal_user_id: g.subject_user_id,
      ts_user_id: source.ts_user_id, mapping_revision: receipt.mapping_revision, human_requester_user_id: g.issued_by,
      workspace_id: g.workspace_id, action: g.action, selector_digest: accessDigest(canonicalSelector(g.selector)), environments: g.environments,
      previous_membership_revision: null, membership_revision: receipt.membership_revision, effective_at_ms: receipt.effective_at_ms,
      expires_at_ms: receipt.expires_at_ms, outcome: "ACCEPTED", payload_digest: accessDigest([g.grant_id, "payload"]), provenance_ref: "TEST_ONLY-NOT-INSTALLED" });
    g.ts_acceptance_digest = accessDigest(accepted);
    source.grants.push({ grant_id: g.grant_id, binding_digest: grantBindingDigest(g), accepted,
      targets: g.environments.flatMap(env => (currentResources(g.selector, source, env) ?? []).map(resource => ({ resource, environment: env,
        revision: "TEST_ONLY-native", native_reference_digest: accessDigest([g.grant_id, env, resource]),
        valid_from_ms: f.context.now_ms - 100, valid_until_ms: f.context.now_ms + 5000 }))) });
  }
  f.context.relationsFor = () => ({ ...f.relations, current_authority: source }); return source;
}
function deny(f: F, resource: AccessResource) {
  const base = f.context.grants.find(g => g.effect === "ALLOW")!;
  f.context.grants.push({ ...base, grant_id: `TEST_ONLY-deny-${resource.kind}-${resource.id}`, effect: "DENY", action: "portfolio.read",
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: resource.kind, ids: [resource.id] }, requires_ts_acceptance: false,
    ts_receipt: null, ts_acceptance_digest: undefined });
}
async function outcomes(f: F, env: Env = "paper") { return [await f.purpose("portfolio.read", env), await f.purpose("portfolio.read_restricted", env)]; }
function expectedItems(f: F, flights: PortfolioCollectionPurpose[], env: Env = "paper") {
  const byId = new Map<string, unknown>();
  for (const flight of flights) if (flight.state === "AUTHORIZED")
    for (const item of composeManagerItems(flight.scope, f.snapshots.get(env)!, "PORTFOLIOS"))
      if (!byId.has(item.identity.portfolio_id!)) byId.set(item.identity.portfolio_id!, item);
  return [...byId.values()];
}

describe("ELP2-04 mixed Portfolio list / TEST_ONLY authority", () => {
  it.each(ENVS)("honors exact direct-only %s read without invented owner, member or link", async env => {
    const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }); versioned(f);
    const original = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => ({ ...await original(request), current_linkage: null as never }));
    const flights = await outcomes(f, env);
    expect(flights.map(value => value.state)).toEqual(["AUTHORIZED", "NO_CURRENT_ENTITLEMENT"]);
    const result = await f.read({ environment: env });
    expect(result.items).toEqual(expectedItems(f, flights, env));
    expect(result.items.map(value => value.identity.portfolio_id)).toEqual([PRIVATE.portfolio_id]);
    expect(result.profile_dispositions).toHaveLength(1); expect(result.read_scope.totals_scope).toBe("VISIBLE_ROWS_ONLY");
    for (const hidden of ["880002", "999", "NEVER_RETURN", "TEST_ONLY-native", "TEST_ONLY-direct"])
      expect(scalars(result)).not.toContain(hidden);
    expect(f.repository.snapshot).toHaveBeenCalledTimes(1); expect(f.legacy).not.toHaveBeenCalled();
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled(); expect(f.upstream.relationForNamedOperation).not.toHaveBeenCalled();
    expect(f.clients[0].query.mock.calls.map(call => call[0])).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout='5000ms'", "COMMIT"]);
    expect(f.clients[0].release).toHaveBeenCalledTimes(1);
  });
  it("keeps linked-only population and hides shared physical-account totals", async () => {
    const f = fixture(); versioned(f); const flights = await outcomes(f), result = await f.read();
    expect(flights.map(value => value.state)).toEqual(["NO_CURRENT_ENTITLEMENT", "AUTHORIZED"]);
    expect(result.items).toEqual(expectedItems(f, flights));
    const shared = result.items.find(item => item.identity.portfolio_id === OWN.portfolio_id)!;
    expect(shared.instances).toEqual([expect.objectContaining({ deployment_id: OWN.deployment_id })]);
    for (const hidden of ["880002", "999", "NEVER_RETURN", "dep-peer"]) expect(scalars(shared)).not.toContain(hidden);
    expect(shared.is_full_resource).toBe(false);
  });
  it("selects one whole ordinary item over restricted duplicate; does not union or re-sum", async () => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f); const flights = await outcomes(f);
    expect(flights.every(value => value.state === "AUTHORIZED")).toBe(true);
    const direct = flights[0]; if (direct.state !== "AUTHORIZED") throw new Error("TEST_ONLY expected direct scope");
    const ordinary = composeManagerItems(direct.scope, f.snapshots.get("paper")!, "PORTFOLIOS")[0];
    const result = await f.read(), shared = result.items.filter(item => item.identity.portfolio_id === OWN.portfolio_id);
    expect(shared).toEqual([ordinary]); expect(shared[0].instances).toHaveLength(2);
    expect(shared[0].financial_totals).toEqual(ordinary.financial_totals);
    expect(result.page.visible_count).toBe(2); expect(f.repository.snapshot).toHaveBeenCalledTimes(1);
  });
  it("mixed direct-private plus linked-shared cannot complete shared financial grain by combining scopes", async () => {
    const f = fixture({ direct: [PRIVATE.portfolio_id] }); versioned(f);
    const result = await f.read(); expect(result.items).toHaveLength(2);
    const shared = result.items.find(item => item.identity.portfolio_id === OWN.portfolio_id);
    for (const hidden of ["880002", "999", "dep-peer"]) expect(scalars(shared)).not.toContain(hidden);
    expect(result.items.find(item => item.identity.portfolio_id === PRIVATE.portfolio_id)!.financial_totals)
      .toContainEqual(expect.objectContaining({ currency: "USD", balance_total: "0", allocation: "2" }));
  });
  it.each(["pending-fields", "missing-link", "missing-identity-field"] as const)("does not downgrade eligible %s to absent sibling", async fault => {
    const f = fixture({ direct: [PRIVATE.portfolio_id] }); versioned(f);
    if (fault === "pending-fields") f.context.policy!.researcher_fields.state = "PENDING";
    if (fault === "missing-identity-field") f.context.policy!.researcher_fields.fields = ["name"];
    if (fault === "missing-link") { const impl = f.access.readPublication.getMockImplementation()!;
      f.access.readPublication.mockImplementation(async request => ({ ...await impl(request), current_linkage: null as never })); }
    await expect(f.read()).rejects.toMatchObject({ status: 503 }); expect(f.legacy).not.toHaveBeenCalled();
  });
  it("current business-all DENY outranks the restricted pending-fields classifier", async () => {
    const f = fixture(); versioned(f); f.context.policy!.researcher_fields.state = "PENDING";
    f.context.grants.push({ ...f.context.grants[0], grant_id: "TEST_ONLY-business-all-deny", action: "business.read_all", effect: "DENY",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [OWN.portfolio_id, PRIVATE.portfolio_id] },
      requires_ts_acceptance: false, ts_receipt: null, ts_acceptance_digest: undefined });
    // Business DENY semantics win before eligible→positive field evaluation.
    await expect(f.purpose("portfolio.read_restricted")).resolves.toMatchObject({ state: "NO_CURRENT_ENTITLEMENT" });
    expect(f.repository.snapshot).not.toHaveBeenCalled();
  });
  it.each(["present-null", "present-undefined", "wrong-subject", "unqualified", "partial-publication", "bad-tuple", "duplicate-resource"] as const)(
    "does not issue a qualified negative from %s authority/publication", async fault => {
      const f = fixture({ linked: false }); const source = versioned(f);
      if (fault === "present-null" || fault === "present-undefined")
        f.context.relationsFor = () => ({ ...f.relations, current_authority: (fault === "present-null" ? null : undefined) as never });
      if (fault === "wrong-subject") source.subject_user_id = "TEST_ONLY-other-subject";
      if (fault === "unqualified") f.context.relationsFor = () => ({ ...f.relations, qualified: false, current_authority: source });
      const impl = f.access.readPublication.getMockImplementation()!;
      f.access.readPublication.mockImplementation(async request => {
        const publication = structuredClone(await impl(request));
        if (fault === "partial-publication") publication.population_coverage = "PARTIAL" as never;
        if (fault === "bad-tuple") publication.resources = publication.resources.filter(value => value.kind !== "PORTFOLIO");
        if (fault === "duplicate-resource") publication.resources.push(publication.resources[0]);
        return publication;
      });
      await expect(f.purpose("portfolio.read")).rejects.toMatchObject({ status: 503 });
      expect(f.repository.snapshot).not.toHaveBeenCalled();
    });
  it("finite missing direct native leg denies only that purpose; linked sibling remains independent", async () => {
    const f = fixture({ direct: [OWN.portfolio_id] }), source = versioned(f);
    source.grants.find(value => value.grant_id === "TEST_ONLY-direct")!.targets = [];
    expect((await outcomes(f)).map(value => value.state)).toEqual(["NO_CURRENT_ENTITLEMENT", "AUTHORIZED"]);
    const result = await f.read();
    for (const hidden of ["880002", "999", "dep-peer"]) expect(scalars(result)).not.toContain(hidden);
  });
  it.each(["parent-revoked", "issuer-inactive", "ancestor-deny"] as const)("original delegated purpose retains %s semantics", async fault => {
    // Actual current evaluator/ancestry; legacy accepted receipt transport is
    // deliberate here. Versioned original/native-leg cases are separate above.
    const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }), child = grant(f, "portfolio.read");
    const issuer = "TEST_ONLY-delegator";
    const parent: ScopedAccessGrant = { ...child, grant_id: "TEST_ONLY-parent", subject_user_id: issuer,
      action: "access.grant", delegable_actions: ["portfolio.read"], requires_ts_acceptance: false, ts_receipt: null };
    child.issued_by = issuer; child.parent_grant_id = parent.grant_id;
    f.context.active_principals = new Set([...f.context.active_principals, issuer]); f.context.grants.unshift(parent);
    expect((await f.read()).items.map(item => item.identity.portfolio_id)).toEqual([PRIVATE.portfolio_id]);
    if (fault === "parent-revoked") parent.revoked_at_ms = f.context.now_ms;
    if (fault === "issuer-inactive") f.context.active_principals.delete(issuer);
    if (fault === "ancestor-deny") f.context.grants.push({ ...parent, grant_id: "TEST_ONLY-parent-deny", effect: "DENY", delegable_actions: [] });
    await expect(f.read()).rejects.toMatchObject(unavailable); expect(f.legacy).not.toHaveBeenCalled();
  });
  it.each(["ALPHA", "ALPHA_VERSION", "DEPLOYMENT", "ACCOUNT"] as const)("retains all-lineage %s DENY in mixed results", async kind => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f);
    const id = { ALPHA: PEER.alpha_id, ALPHA_VERSION: PEER.alpha_version_id, DEPLOYMENT: PEER.deployment_id, ACCOUNT: PEER.account_id }[kind];
    if (kind === "ACCOUNT") expect(await f.purpose("portfolio.read")).toMatchObject({ state: "AUTHORIZED" });
    deny(f, { kind, id });
    if (kind === "ACCOUNT") {
      // OWN and PEER share this exact account: both ordinary-purpose tuples
      // are denied. A positive Portfolio shell with no permitted tuple is a
      // real404, not qualified optional absence or a restricted fallback.
      await expect(f.purpose("portfolio.read")).rejects.toMatchObject(unavailable);
      await expect(f.read()).rejects.toMatchObject(unavailable);
      expect(f.repository.snapshot).not.toHaveBeenCalled(); expect(f.legacy).not.toHaveBeenCalled();
      expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
      expect(f.upstream.relationForNamedOperation).not.toHaveBeenCalled();
      return;
    }
    const result = await f.read();
    expect(result.items.flatMap(item => item.instances)).not.toContainEqual(expect.objectContaining({ deployment_id: PEER.deployment_id }));
    for (const hidden of ["880002", "999"]) expect(scalars(result)).not.toContain(hidden);
  });
  it("shared ACCOUNT DENY removes both shared tuples while an independently granted private Portfolio survives", async () => {
    const f = fixture({ direct: [OWN.portfolio_id, PRIVATE.portfolio_id] }); versioned(f);
    deny(f, { kind: "ACCOUNT", id: PEER.account_id });
    const result = await f.read();
    expect(result.items.map(item => item.identity.portfolio_id)).toEqual([PRIVATE.portfolio_id]);
    expect(result.items[0].instances).toEqual([expect.objectContaining({ deployment_id: PRIVATE.deployment_id })]);
    expect(result.items[0].financial_totals).toEqual([{ currency: "USD", allocation: "2", balance_total: "0" }]);
    for (const hidden of [OWN.account_id, OWN.deployment_id, PEER.deployment_id, "880002", "999"])
      expect(scalars(result)).not.toContain(hidden);
    expect(f.repository.snapshot).toHaveBeenCalledTimes(1); expect(f.legacy).not.toHaveBeenCalled();
  });
  it.each(["empty", "non-portfolio-only"] as const)("%s complete population is negative-only, not a scope or successful collection", async population => {
    const f = fixture({ linked: false }); versioned(f); const impl = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => ({ ...await impl(request),
      resources: population === "empty" ? [] : [{ kind: "ALPHA" as const, id: "TEST_ONLY-no-portfolio" }], tuples: [], current_linkage: null as never,
      strategy_lineage: { qualification: "TEST_ONLY", revision: "TEST_ONLY-empty", provenance_ref: "TEST_ONLY", pairs: [] } }));
    const flights = await outcomes(f), callback = vi.fn(async () => "NEVER_RETURN");
    expect(flights.map(value => value.state)).toEqual(["NO_CURRENT_ENTITLEMENT", "NO_CURRENT_ENTITLEMENT"]);
    await expect(f.scopes.deliverPortfolioCollectionPurposes(flights, callback)).rejects.toMatchObject(unavailable);
    expect(callback).not.toHaveBeenCalled();
    await expect(f.scopes.deliver(flights[0] as never, callback)).rejects.toBeDefined();
    await expect(f.read()).rejects.toMatchObject(unavailable); expect(f.repository.snapshot).not.toHaveBeenCalled();
  });
  it.each(["clone", "forged", "wrong-issuer"] as const)("refuses %s negative token before callback", async fault => {
    const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }); versioned(f);
    const flight = await f.purpose("portfolio.read_restricted"), callback = vi.fn(async () => "NEVER_RETURN");
    const token = fault === "clone" ? structuredClone(flight) : fault === "forged" ?
      { state: "NO_CURRENT_ENTITLEMENT", fingerprint: flight.fingerprint } : flight;
    const issuer = fault === "wrong-issuer" ? fixture().scopes : f.scopes;
    await expect(issuer.deliverPortfolioCollectionPurposes([token as PortfolioCollectionPurpose], callback)).rejects.toBeDefined();
    expect(callback).not.toHaveBeenCalled();
  });
  it("copies principal, binding and dataset before await; frozen negative metadata cannot retarget", async () => {
    const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }); versioned(f);
    const principal = structuredClone(f.principal), binding = { environment: "paper" as const, profileId: f.profile("paper") }, dataset = f.dataset("paper");
    const impl = f.access.readContext.getMockImplementation()!; let changedInput = false;
    f.access.readContext.mockImplementation(async () => { if (!changedInput) { changedInput = true; principal.workspaceId = "TEST_ONLY-retarget";
      binding.profileId = "TEST_ONLY-retarget"; dataset.source_revision = "TEST_ONLY-retarget"; } return impl(); });
    const flight = await f.scopes.authorizePortfolioCollectionPurpose(principal, binding, "portfolio.read_restricted", dataset);
    expect(Object.isFrozen(flight)).toBe(true);
    expect(Reflect.set(flight, "fingerprint", "TEST_ONLY-retarget")).toBe(false);
    const positive = await f.purpose("portfolio.read");
    await expect(f.scopes.deliverPortfolioCollectionPurposes([positive, flight], async () => "TEST_ONLY-no-data")).resolves.toBe("TEST_ONLY-no-data");
    expect(f.access.readPublication.mock.calls.every(([request]) => request.workspace_id === f.principal.workspaceId && request.profile_id === f.profile("paper"))).toBe(true);
  });
  it.each(["wrong-action", "wrong-dataset", "bad-profile", "windowed"] as const)("runtime rejects %s optional-purpose input", async fault => {
    const f = fixture(); versioned(f); const dataset = f.dataset("paper");
    if (fault === "wrong-dataset") dataset.dataset_id = "manager:ALPHA_FLEET";
    if (fault === "windowed") dataset.window = { start_ms: 0, end_ms: 1 } as never;
    await expect(f.scopes.authorizePortfolioCollectionPurpose(f.principal,
      { environment: "paper", profileId: fault === "bad-profile" ? "" : f.profile("paper") },
      (fault === "wrong-action" ? "account.read" : "portfolio.read") as Purpose, dataset)).rejects.toBeDefined();
    expect(f.repository.snapshot).not.toHaveBeenCalled();
  });
  it("negative→eligible is409 before newly eligible positive field/linkage failures", async () => {
    const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }); versioned(f); const flights = await outcomes(f);
    await expect(f.scopes.deliverPortfolioCollectionPurposes(flights, async () => {
      f.context.grants.push({ ...grant(f, "portfolio.read"), grant_id: "TEST_ONLY-new-restricted", action: "portfolio.read_restricted" });
      versioned(f); f.context.policy!.researcher_fields.state = "PENDING";
      return "NEVER_RETURN";
    })).rejects.toMatchObject(changed);
  });
  it("revoking a shadowed restricted positive still rejects the combined flight", async () => {
    const f = fixture({ direct: [OWN.portfolio_id, PRIVATE.portfolio_id] }); versioned(f); const flights = await outcomes(f);
    await expect(f.scopes.deliverPortfolioCollectionPurposes(flights, async () => {
      grant(f, "portfolio.read_restricted").revoked_at_ms = f.context.now_ms; return "NEVER_RETURN";
    })).rejects.toMatchObject(changed);
  });
  it.each(["grant-start", "grant-expiry", "receipt-expiry", "target-expiry", "deny-start", "deny-expiry"] as const)(
    "rejects clock-only %s crossing during a later profile's final adapter wait", async transition => {
      const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }), t = f.context.now_ms, direct = grant(f, "portfolio.read");
      // Stable later-profile positives keep the composition non-vacuous. Only
      // paper authority crosses its interval while live's final adapter waits;
      // a live reissue alone must NOT stand in for the final all-outcome clock.
      f.context.grants.push({ ...structuredClone(direct), grant_id: "TEST_ONLY-stable-others", environments: ["sandbox", "live"] });
      direct.environments = ["paper"];
      if (transition === "grant-start") { direct.valid_from_ms = t + 500; direct.ts_receipt = { ...direct.ts_receipt!, effective_at_ms: t + 500 }; }
      if (transition === "grant-expiry") { direct.valid_until_ms = t + 500; direct.ts_receipt = { ...direct.ts_receipt!, expires_at_ms: t + 500 }; }
      if (transition === "receipt-expiry") direct.ts_receipt = { ...direct.ts_receipt!, expires_at_ms: t + 500 };
      if (transition.startsWith("deny-")) { deny(f, { kind: "PORTFOLIO", id: PRIVATE.portfolio_id }); const d = f.context.grants.at(-1)!;
        d.environments = ["paper"];
        if (transition === "deny-start") d.valid_from_ms = t + 500; else d.valid_until_ms = t + 500; }
      const source = versioned(f);
      if (transition === "target-expiry") source.grants.find(entry => entry.grant_id === direct.grant_id)!.targets
        .filter(target => target.environment === "paper").forEach(target => { target.valid_until_ms = t + 500; });
      let clock = t, bodyFinished = false, crossed = false;
      f.access.readContext.mockImplementation(async () => ({ ...f.context, now_ms: clock }));
      f.access.confirmReadContext.mockImplementation(async () => ({ ...f.context, now_ms: clock }));
      const flights = [...await outcomes(f, "paper"), ...await outcomes(f, "sandbox"), ...await outcomes(f, "live")];
      const impl = f.access.readPublication.getMockImplementation()!;
      f.access.readPublication.mockImplementation(async request => { const publication = await impl(request);
        if (bodyFinished && request.environment === "live" && !crossed) { await Promise.resolve(); clock = t + 501; crossed = true; }
        return publication; });
      await expect(f.scopes.deliverPortfolioCollectionPurposes(flights, async () => { bodyFinished = true; return "NEVER_RETURN"; })).rejects.toMatchObject(changed);
      expect(crossed).toBe(true);
    });
  it.each(["source-503", "scope-409"] as const)("all profiles preserves %s semantics", async fault => {
    const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }); versioned(f);
    const impl = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => { if (request.environment === "paper")
      throw new ExecutionReadScopeError(fault === "source-503" ? "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" : "EXECUTION_READ_ACCESS_CHANGED", fault === "source-503" ? 503 : 409);
      return impl(request); });
    if (fault === "scope-409") await expect(f.read({ environment: "all" })).rejects.toMatchObject(changed);
    else {
      const result = await f.read({ environment: "all" }); expect(result.items.map(item => item.environment).sort()).toEqual(["live", "sandbox"]);
      expect(result.profile_dispositions).toHaveLength(3);
      expect(result.profile_dispositions.find(value => value.environment === "paper")).toMatchObject({ state: "UNAVAILABLE" });
      expect(f.repository.snapshot.mock.calls.map(call => call[1]).sort()).toEqual(["live", "sandbox"]);
    }
    expect(f.legacy).not.toHaveBeenCalled();
  });
  it("all drops a whole profile if scoped body decoding fails503, not a healthy sibling purpose", async () => {
    const f = fixture({ direct: [PRIVATE.portfolio_id] }); versioned(f);
    const privateRow = f.snapshots.get("paper")!.document.relations.allocations.items.find(row => row.fields.portfolio_id === PRIVATE.portfolio_id)!;
    privateRow.fields.allocated_capital = "INVALID_AUTHORIZED_DECIMAL";
    // A snapshot/compose503 must drop the whole profile, never a sibling prefix.
    const result = await f.read({ environment: "all" });
    expect(result.items).toHaveLength(4); expect(result.items.some(item => item.environment === "paper")).toBe(false);
    expect(result.profile_dispositions.find(value => value.environment === "paper")).toMatchObject({ state: "UNAVAILABLE" });
    expect(f.repository.snapshot).toHaveBeenCalledTimes(3);
  });
  it("all-unavailable stays503; all-proven-denied404; neither calls legacy or raw data", async () => {
    const denied = fixture({ linked: false }); versioned(denied);
    await expect(denied.read({ environment: "all" })).rejects.toMatchObject(unavailable);
    const missing = fixture({ linked: false }); versioned(missing);
    missing.access.readPublication.mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503));
    await expect(missing.read({ environment: "all" })).rejects.toMatchObject({ status: 503 });
    for (const f of [denied, missing]) { expect(f.repository.snapshot).not.toHaveBeenCalled(); expect(f.legacy).not.toHaveBeenCalled(); }
  });
  it("authorized missing snapshot is one unavailable profile, never successful sibling-purpose bytes", async () => {
    const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }); versioned(f); f.snapshots.delete("paper");
    const result = await f.read({ environment: "all" });
    expect(result.profile_dispositions).toHaveLength(3);
    expect(result.profile_dispositions.find(value => value.environment === "paper"))
      .toMatchObject({ state: "UNAVAILABLE", reason_code: "SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED" });
    expect(result.items.map(item => item.environment).sort()).toEqual(["live", "sandbox"]);
    expect(f.repository.snapshot.mock.calls.map(call => call[1]).sort()).toEqual(["live", "sandbox"]);
  });
  it.each(["source", "epoch", "catalogue"] as const)("final %s metadata change rejects prepared bytes", async component => {
    const f = fixture({ direct: [PRIVATE.portfolio_id], linked: false }); versioned(f); let called = 0;
    f.repository.snapshotMetadata.mockImplementation(async (_workspace, env) => {
      const snapshot = f.snapshots.get(env)!; if (++called === 1) return structuredClone(snapshot);
      return { ...snapshot, ...(component === "source" ? { payloadDigest: `sha256:${"c".repeat(64)}` } :
        component === "epoch" ? { projectionEpoch: "TEST_ONLY-new-epoch" } : { sourceCatalogueSha256: `sha256:${"c".repeat(64)}` }) };
    });
    await expect(f.read()).rejects.toMatchObject(changed);
  });
  it("pages both ways over deduplicated winners, one snapshot/profile, no repeat identity", async () => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f);
    const first = await f.read({ limit: 1 }), second = await f.read({ limit: 1, after: first.page.next_cursor });
    expect(first.page.visible_count).toBe(2); expect(second.page.visible_count).toBe(2);
    expect(first.items[0].identity.portfolio_id).not.toBe(second.items[0].identity.portfolio_id);
    const back = await f.read({ limit: 1, before: second.page.previous_cursor }); expect(back.items).toEqual(first.items);
    expect(f.repository.snapshot).toHaveBeenCalledTimes(3);
    expect(first.page.maximum_response_bytes).toBe(1048576); expect(first.page.returned_count).toBe(1);
  });
  it.each(["grant", "source", "negative", "limit", "workspace", "tamper", "old-domain", "retired-key"] as const)(
    "rejects %s cursor semantic/integrity changes", async fault => {
      const f = fixture({ direct: [OWN.portfolio_id, PRIVATE.portfolio_id], linked: false }); versioned(f);
      const first = await f.read({ limit: 1 }); let token = first.page.next_cursor!;
      if (fault === "grant") grant(f, "portfolio.read").revision = "TEST_ONLY-new-grant-revision";
      if (fault === "source") f.snapshots.get("paper")!.payloadDigest = `sha256:${"c".repeat(64)}`;
      if (fault === "negative") { const donor = fixture(); f.context.grants.push(...donor.context.grants); versioned(f); }
      if (fault === "workspace") f.principal.workspaceId = "TEST_ONLY-other-workspace";
      if (fault === "tamper") token = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
      if (fault === "old-domain") token = new KeysetCursorCodec({ activeKeyId: f.config.QUERY_CURSOR_ACTIVE_KEY_ID, keys: querySigningKeys(f.config) })
        .encode({ resource_id: "manager-scoped:PORTFOLIOS", workspace_id: f.principal.workspaceId, direction: "after",
          query_fingerprint: accessDigest("TEST_ONLY-prior-single-purpose-domain"), boundary: [JSON.stringify(["paper", null, null, OWN.portfolio_id, null])] });
      if (fault === "retired-key") f.config.QUERY_CURSOR_KEYS_JSON = JSON.stringify({ "TEST_ONLY-new": "k".repeat(32) }), f.config.QUERY_CURSOR_ACTIVE_KEY_ID = "TEST_ONLY-new";
      await expect(f.read({ limit: fault === "limit" ? 2 : 1, after: token })).rejects.toBeDefined();
    });
  it("rotation retaining the old signing key preserves a current-authority cursor", async () => {
    const f = fixture({ direct: [OWN.portfolio_id, PRIVATE.portfolio_id], linked: false }); versioned(f);
    const first = await f.read({ limit: 1 }), keys = querySigningKeys(f.config);
    f.config.QUERY_CURSOR_KEYS_JSON = JSON.stringify({ ...keys, "TEST_ONLY-next": "n".repeat(32) });
    f.config.QUERY_CURSOR_ACTIVE_KEY_ID = "TEST_ONLY-next";
    const second = await f.read({ limit: 1, after: first.page.next_cursor });
    expect(second.items[0].identity.portfolio_id).not.toBe(first.items[0].identity.portfolio_id);
  });
  it("public Portfolio query stays finite; internal winner queries never read denied fields", async () => {
    expect(PortfolioListQuerySchema.safeParse({ search: "x" }).success).toBe(false);
    expect(PortfolioListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f);
    // Internal reader supports a shared Query union. This is NOT a new route API.
    await expect(f.reader.read(f.principal, "PORTFOLIOS", { environment: "paper", owner: "HIDDEN" } as never, f.legacy)).rejects.toMatchObject({ status: 400 });
    f.context.policy!.researcher_fields.fields = fields.filter(value => value !== "venue");
    await expect(f.reader.read(f.principal, "PORTFOLIOS", { environment: "paper", venue: "TEST_ONLY-VENUE" } as never, f.legacy)).rejects.toMatchObject({ status: 400 });
  });
  it("legacy callback remains unchanged; pagination rejected and no V2 fallback", async () => {
    const f = fixture({ legacy: true });
    await expect(f.reader.read(f.principal, "PORTFOLIOS", { environment: "paper" }, f.legacy)).resolves.toEqual({ TEST_ONLY: "legacy-result" });
    expect(f.legacy).toHaveBeenCalledTimes(1); expect(f.repository.snapshot).not.toHaveBeenCalled();
    for (const query of [{ limit: 1 }, { after: "TEST_ONLY" }, { before: "TEST_ONLY" }])
      await expect(f.reader.read(f.principal, "PORTFOLIOS", { environment: "paper", ...query }, f.legacy)).rejects.toMatchObject({ status: 400 });
    expect(f.legacy).toHaveBeenCalledTimes(1);
  });
});

/** Omitted-profile regressions use real authorization/composition and synthetic I/O. */
describe("ELP2-04 omitted Portfolio profile retains original obligations", () => {
  it.each(["null-snapshot", "scoped-snapshot-503"] as const)("%s omits one whole profile with rollback, not sibling bytes", async fault => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f);
    f.repository.snapshot.mockImplementation(async (_workspace, env) => {
      if (env !== "paper") return f.snapshots.get(env)!;
      if (fault === "null-snapshot") return null;
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    });
    const result = await f.read({ environment: "all" });
    expect(result.items).toHaveLength(4); expect(result.items.some(item => item.environment === "paper")).toBe(false);
    expect(result.profile_dispositions.filter(value => value.environment === "paper"))
      .toEqual([{ environment: "paper", state: "UNAVAILABLE", reason_code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE" }]);
    expect(f.repository.snapshot).toHaveBeenCalledTimes(3);
    expect(f.clients[0].query.mock.calls.map(call => call[0])).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout='5000ms'", "ROLLBACK"]);
    expect(f.clients[0].release).toHaveBeenCalledTimes(1); expect(f.legacy).not.toHaveBeenCalled();
  });
  it("second-purpose body503 discards the already prepared ordinary-item prefix", async () => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f);
    const snapshot = f.snapshots.get("paper")!;
    const privateRow = snapshot.document.relations.allocations.items.find(row => row.fields.portfolio_id === PRIVATE.portfolio_id)!;
    privateRow.fields.allocated_capital = "INVALID_RESTRICTED_ONLY_DECIMAL";
    // Direct scope covers shared only and genuinely composes first. Its item
    // must not escape when the restricted sibling later reaches bad private.
    const direct = await f.purpose("portfolio.read");
    if (direct.state !== "AUTHORIZED") throw new Error("TEST_ONLY expected original positive");
    expect(composeManagerItems(direct.scope, snapshot, "PORTFOLIOS")).toHaveLength(1);
    const result = await f.read({ environment: "all" });
    expect(result.page.visible_count).toBe(4); expect(result.items.map(item => item.environment).sort())
      .toEqual(["live", "live", "sandbox", "sandbox"]);
    expect(result.profile_dispositions.filter(value => value.environment === "paper"))
      .toEqual([{ environment: "paper", state: "UNAVAILABLE", reason_code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE" }]);
    expect(f.repository.snapshot).toHaveBeenCalledTimes(3);
  });
  it("second acquisition503 leaves the first real positive fenced, but the profile is never composed", async () => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f);
    const authorize = f.scopes.authorizePortfolioCollectionPurpose.bind(f.scopes);
    let acquiring: Purpose | null = null, failed = false;
    // This spy delegates every issuance to the real issuer. Only synthetic
    // provider failure is injected, never a mock passing scope/outcome.
    vi.spyOn(f.scopes, "authorizePortfolioCollectionPurpose").mockImplementation(async (principal, binding, action, dataset) => {
      acquiring = action; return authorize(principal, binding, action, dataset);
    });
    const publication = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      if (request.environment === "paper" && acquiring === "portfolio.read_restricted" && !failed) {
        failed = true; throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
      }
      return publication(request);
    });
    const result = await f.read({ environment: "all" });
    expect(failed).toBe(true); expect(result.items.some(item => item.environment === "paper")).toBe(false);
    expect(result.profile_dispositions.find(value => value.environment === "paper"))
      .toMatchObject({ state: "UNAVAILABLE", reason_code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(f.repository.snapshot.mock.calls.map(call => call[1]).sort()).toEqual(["live", "sandbox"]);
    expect(f.legacy).not.toHaveBeenCalled();
  });
  it.each(["snapshot", "second-acquisition"] as const)("revoking an omitted %s profile's original native leg during another read rejects409", async failure => {
    const f = fixture({ direct: [OWN.portfolio_id] }), source = versioned(f);
    const original = source.grants.find(entry => entry.grant_id === "TEST_ONLY-direct")!;
    const authorize = f.scopes.authorizePortfolioCollectionPurpose.bind(f.scopes);
    let acquiring: Purpose | null = null, failed = false, revoked = false;
    vi.spyOn(f.scopes, "authorizePortfolioCollectionPurpose").mockImplementation(async (principal, binding, action, dataset) => {
      acquiring = action; return authorize(principal, binding, action, dataset);
    });
    const publication = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      if (failure === "second-acquisition" && request.environment === "paper" && acquiring === "portfolio.read_restricted" && !failed) {
        failed = true; throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
      }
      return publication(request);
    });
    f.repository.snapshot.mockImplementation(async (_workspace, env) => {
      if (failure === "snapshot" && env === "paper") { failed = true; return null; }
      if (env === "sandbox" && !revoked) {
        // Revoke ONLY paper's original current native leg. No grant/DB/global
        // source revision or sandbox/live proof changes can rescue detection.
        original.targets = original.targets.filter(target => target.environment !== "paper"); revoked = true;
      }
      return f.snapshots.get(env)!;
    });
    await expect(f.read({ environment: "all" })).rejects.toMatchObject(changed);
    expect(failed && revoked).toBe(true); expect(f.legacy).not.toHaveBeenCalled();
    expect(f.repository.snapshot.mock.calls.map(call => call[1]).sort())
      .toEqual(failure === "snapshot" ? ["live", "paper", "sandbox"] : ["live", "sandbox"]);
  });
  it.each([false, true])("final source renewal503 aborts prepared bytes, including omitted profile=%s", async omitPaper => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f); let bodyRead = false, renewed = false;
    f.repository.snapshot.mockImplementation(async (_workspace, env) => {
      bodyRead = true; return omitPaper && env === "paper" ? null : f.snapshots.get(env)!;
    });
    const publication = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      if (bodyRead && request.environment === "paper") {
        renewed = true; throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
      }
      return publication(request);
    });
    await expect(f.read({ environment: "all" })).rejects.toMatchObject({ status: 503, code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(renewed).toBe(true); expect(f.repository.snapshot).toHaveBeenCalledTimes(3);
    expect(f.legacy).not.toHaveBeenCalled();
  });
  it("all body reads failing503 remains unavailable503, never denied404 or an empty success", async () => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f);
    f.repository.snapshot.mockResolvedValue(null);
    await expect(f.read({ environment: "all" })).rejects.toMatchObject({ status: 503, code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE" });
    expect(f.repository.snapshot).toHaveBeenCalledTimes(3); expect(f.clients).toHaveLength(3);
    for (const client of f.clients) {
      expect(client.query.mock.calls.map(call => call[0])).toEqual([
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout='5000ms'", "ROLLBACK"]);
      expect(client.release).toHaveBeenCalledTimes(1);
    }
    expect(f.legacy).not.toHaveBeenCalled();
  });
  it("a body revision409 is never caught as profile source503 omission", async () => {
    const f = fixture({ direct: [OWN.portfolio_id] }); versioned(f);
    f.repository.snapshot.mockImplementation(async (_workspace, env) => ({ ...f.snapshots.get(env)!, projectionEpoch: "TEST_ONLY-body-race" }));
    await expect(f.read({ environment: "all" })).rejects.toMatchObject(changed);
    expect(f.repository.snapshot).toHaveBeenCalledTimes(1); expect(f.legacy).not.toHaveBeenCalled();
  });
});
