/** Exact-resource authorization regression; synthetic TEST_ONLY source facts.
 * Real scopes + retained readers; shared fixture supplies synthetic TEST_ONLY
 * authority, publication and stored rows. No installed grant/source qualification. */
import { describe, expect, it } from "vitest";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";
import { accessDigest, canonicalSelector } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest } from "../src/execution-v2/access-current-relations";
import { tsMembershipAcceptance, type AccessResource, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { scopeAllowsFullAccountingPopulation, scopeReadPopulation, scopeResources } from "../src/execution-v2/read-scope";
import { projectionRowVisible } from "../src/execution-v2/read-projection";
import { managerRelationOperationByRoute } from "../src/execution/eds11r-manager-relation.registry";

type F = ReturnType<typeof productReadFixture>;
type Env = "paper" | "sandbox" | "live";
type Family = "ALPHA" | "PORTFOLIO";
const ENVS = ["paper", "sandbox", "live"] as const;
const FAMILIES = ["ALPHA", "PORTFOLIO"] as const;
const target = (family: Family): AccessResource => family === "ALPHA"
  ? { kind: "ALPHA", id: OWN.alpha_id } : { kind: "PORTFOLIO", id: PRIVATE.portfolio_id };
const action = (family: Family) => family === "ALPHA" ? "alpha.read" as const : "portfolio.read" as const;
const route = (family: Family) => family === "ALPHA" ? "orders" : "portfolios";
const profile = (f: F, env: Env) => (env === "paper" ? f.config.EXECUTION_EDGE_PAPER_PROFILE_ID :
  env === "sandbox" ? f.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : f.config.EXECUTION_EDGE_LIVE_PROFILE_ID)!;
const grant = (f: F) => f.context.grants.find(g => g.effect === "ALLOW" && g.action !== "access.grant")!;
const population = (family: Family) => family === "ALPHA" ? [OWN, PRIVATE] : [PRIVATE];

function fixture(family: Family, env: Env = "paper", linked = false) {
  const f = productReadFixture(), old = f.context.grants[0], resource = target(family);
  f.context.grants = [{ ...old, grant_id: `TEST_ONLY-explicit-${family}`, action: action(family),
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: resource.kind, ids: [resource.id] }, environments: [env] }];
  const relations = f.context.relationsFor(f.principal.user.userId);
  f.context.relationsFor = () => ({ ...relations, own_alpha_ids: [], member_portfolio_ids: [] });
  const original = f.access.readPublication.getMockImplementation()!;
  f.access.readPublication.mockImplementation(async request => ({ ...await original(request),
    // Shared fixture inference is non-null, whereas production schema permits
    // null. Preserve qualified strategy_lineage: raw deployments need it.
    ...(linked ? {} : { current_linkage: null as never }) }));
  f.snapshot.environment = env; f.snapshot.profileId = profile(f, env);
  f.snapshot.document.environment = env; f.snapshot.document.profile_id = profile(f, env);
  // The generated named Orders identity is INTEGER, not the screen's text IDs.
  f.snapshot.document.relations["manager.orders:orders"].items.forEach((item, i) => { item.fields.order_id = String(i + 1); });
  const operation = managerRelationOperationByRoute("portfolios")!;
  f.snapshot.document.relations[`${operation.sourceId}:portfolios`] = {
    source_id: operation.sourceId, relation: "portfolios", availability: "AVAILABLE", completeness: "COMPLETE",
    freshness: "FRESH", reason_code: null, as_of: new Date(f.context.now_ms).toISOString(), items: [
      { fields: { portfolio_id: PRIVATE.portfolio_id, name: "TEST_ONLY-shared-direct", secret: "NEVER_RETURN" } },
      { fields: { portfolio_id: OWN.portfolio_id, name: "TEST_ONLY-hidden-portfolio" } },
    ],
  };
  return f;
}
function scope(f: F, family: Family, env: Env = "paper", resource?: AccessResource, whole = false) {
  const operation = managerRelationOperationByRoute(route(family))!;
  return f.scopes.authorize(f.principal, { environment: env, profileId: profile(f, env) }, {
    action: action(family), ...(resource ? { resource } : {}), ...(whole ? { requireWholePopulation: true } : {}),
    dataset: { dataset_id: `relation:${operation.sourceId}:${operation.relation}`, source_revision: f.snapshot.payloadDigest,
      projection_generation: f.snapshot.projectionEpoch, catalogue_revision: f.snapshot.sourceCatalogueSha256, window: null },
  });
}
const read = (f: F, family: Family, env: Env = "paper", query = {}) =>
  f.maximum.relationPage(f.principal, route(family), { environment: env, limit: 20, ...query });

/** Original accepted fact + per-resource/environment current leg, with no
 * owner/member/root population. TEST_ONLY data is never installed in runtime. */
function versioned(f: F) {
  const g = grant(f), receipt = g.ts_receipt!;
  if (g.selector.kind !== "EXPLICIT_RESOURCE_SET") throw new Error("TEST_ONLY-explicit-required");
  const selector = g.selector;
  const accepted = tsMembershipAcceptance.parse({ source: "TEST_ONLY-PM", source_contract: "TEST_ONLY-contract",
    trust_profile: "TEST_ONLY-profile", receipt_id: receipt.receipt_id, proposal_id: "TEST_ONLY-proposal",
    proposal_digest: accessDigest("TEST_ONLY-proposal"), portal_user_id: g.subject_user_id, ts_user_id: "TEST_ONLY-ts-user",
    mapping_revision: receipt.mapping_revision, human_requester_user_id: g.issued_by, workspace_id: g.workspace_id,
    action: g.action, selector_digest: accessDigest(canonicalSelector(g.selector)), environments: g.environments,
    previous_membership_revision: null, membership_revision: receipt.membership_revision,
    effective_at_ms: receipt.effective_at_ms, expires_at_ms: receipt.expires_at_ms, outcome: "ACCEPTED",
    payload_digest: accessDigest("TEST_ONLY-payload"), provenance_ref: "TEST_ONLY-NOT-SOURCE-AUTHORITY" });
  g.ts_acceptance_digest = accessDigest(accepted);
  const current = currentAccessRelations.parse({ schema_version: "pma.core-current-relations.v1",
    subject_user_id: g.subject_user_id, workspace_id: g.workspace_id, ts_user_id: accepted.ts_user_id,
    mapping_revision: accepted.mapping_revision, resources: ENVS.map(environment => ({ environment,
      revision: "TEST_ONLY-empty-owner-cut", own_alpha_ids: [], member_portfolio_ids: [], roots: [] })),
    grants: [{ grant_id: g.grant_id, binding_digest: grantBindingDigest(g), accepted,
      targets: g.environments.flatMap(environment => selector.ids.map(id => ({ environment,
        resource: { kind: selector.resource_kind, id }, revision: "TEST_ONLY-current-leg",
        native_reference_digest: accessDigest(["TEST_ONLY-native", environment, id]),
        valid_from_ms: f.context.now_ms - 100, valid_until_ms: f.context.now_ms + 5000 }))) }],
  });
  const previous = f.context.relationsFor(g.subject_user_id);
  f.context.relationsFor = () => ({ ...previous, current_authority: current }); return current;
}
function deny(f: F, resource: AccessResource) {
  const { ts_acceptance_digest: _accepted, ...original } = grant(f);
  f.context.grants = [...f.context.grants, { ...original, grant_id: `TEST_ONLY-deny-${resource.kind}-${resource.id}`,
    action: resource.kind === "ACCOUNT" ? "account.read" : resource.kind === "PORTFOLIO" ? "portfolio.read" : "alpha.read",
    selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: resource.kind, ids: [resource.id] },
    effect: "DENY", requires_ts_acceptance: false, ts_receipt: null }];
}
const unavailable = { status: 404, code: "EXECUTION_READ_NOT_AVAILABLE" };
const unqualified = { status: 503, code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" };

describe("ELP2-04 exact explicit Alpha/Portfolio reads", () => {
  describe.each(FAMILIES)("%s", family => {
    it.each(ENVS)("serves only the exact accepted %s population without owner/member/link", async env => {
      const f = fixture(family, env); versioned(f);
      for (const minted of [await scope(f, family, env), await scope(f, family, env, target(family))]) {
        expect(minted).toMatchObject({ mode: "SCOPED_V2", wholePopulation: false, fieldPolicyRef: "TEST_ONLY-fields-r1" });
        expect(scopeReadPopulation(minted).allowedTuples).toEqual(population(family));
        expect(scopeResources(minted)).toEqual([target(family)]);
        expect(scopeAllowsFullAccountingPopulation(minted)).toBe(false);
        expect(scopeAllowsFullAccountingPopulation(minted, PRIVATE.portfolio_id)).toBe(false);
      }
      const result = await read(f, family, env);
      expect(result.records).toHaveLength(population(family).length);
      expect(result).toMatchObject({ environment: env, profile_id: profile(f, env), visibility: "SCOPED", coverage: "AUTHORIZED_ONLY",
        state: "PARTIAL", source_health: { as_of_ms: null, global_sequence: null, completeness: "PARTIAL", replay_eligible: false } });
      expect(JSON.stringify(result)).not.toMatch(/NEVER_RETURN|PEER_ONLY_STATUS|HIDDEN_VENUE|TEST_ONLY-hidden-portfolio/);
      expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
      expect(f.upstream.relationForNamedOperation).not.toHaveBeenCalled();
    });
    it("admits two exact shared resources without claiming whole/business accounting", async () => {
      const f = fixture(family), g = grant(f);
      g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: family,
        ids: family === "ALPHA" ? [OWN.alpha_id, PEER.alpha_id] : [OWN.portfolio_id, PRIVATE.portfolio_id] };
      versioned(f); const s = await scope(f, family);
      expect(scopeReadPopulation(s).allowedTuples).toEqual([OWN, PEER, PRIVATE]);
      expect(s.wholePopulation).toBe(false); expect(scopeAllowsFullAccountingPopulation(s)).toBe(false);
      await expect(scope(f, family, "paper", undefined, true)).rejects.toMatchObject(unavailable);
    });
    it.each(["missing", "revoked", "expired", "pending", "unaccepted", "wrong-env", "wrong-leg", "missing-leg", "leg-expired", "wrong-mapping", "wrong-accepted-selector", "wrong-binding", "inactive-actor", "inactive-issuer"] as const)(
      "does not accept %s original/current authority", async fault => {
        const f = fixture(family, "paper", true), g = grant(f), current = versioned(f), entry = current.grants[0];
        if (fault === "missing") f.context.grants = [];
        if (fault === "revoked") g.revoked_at_ms = f.context.now_ms;
        if (fault === "expired") g.valid_until_ms = f.context.now_ms;
        if (fault === "pending") f.context.policy!.state = "PENDING";
        if (fault === "unaccepted") { g.requires_ts_acceptance = false; g.ts_receipt = null; }
        if (fault === "wrong-env") entry.targets[0].environment = "live";
        if (fault === "wrong-leg") entry.targets[0].resource.id = "TEST_ONLY-unrelated";
        if (fault === "missing-leg") entry.targets = [];
        if (fault === "leg-expired") entry.targets[0].valid_until_ms = f.context.now_ms;
        if (fault === "wrong-mapping") current.mapping_revision = "TEST_ONLY-wrong-mapping";
        if (fault === "wrong-accepted-selector") entry.accepted.selector_digest = accessDigest("TEST_ONLY-wrong-selector");
        if (fault === "wrong-binding") entry.binding_digest = accessDigest("TEST_ONLY-other-meaning");
        if (fault === "inactive-actor") f.context.active_principals = new Set([f.context.policy!.protected_owner_user_id]);
        if (fault === "inactive-issuer") f.context.active_principals = new Set([f.principal.user.userId]);
        await expect(scope(f, family, "paper", target(family))).rejects.toMatchObject(fault === "pending"
          ? { code: "EXECUTION_READ_POLICY_PENDING" } : unavailable);
      });
    it.each(["ALPHA", "ALPHA_VERSION", "PORTFOLIO", "DEPLOYMENT", "ACCOUNT"] as const)(
      "a correlated %s DENY removes that tuple despite the original ALLOW", async kind => {
        const f = fixture(family, "paper", true); versioned(f);
        const tuple = family === "ALPHA" ? OWN : PRIVATE;
        const id = ({ ALPHA: tuple.alpha_id, ALPHA_VERSION: tuple.alpha_version_id, PORTFOLIO: tuple.portfolio_id,
          DEPLOYMENT: tuple.deployment_id, ACCOUNT: tuple.account_id })[kind];
        deny(f, { kind, id });
        if (kind === family) await expect(scope(f, family, "paper", target(family))).rejects.toMatchObject(unavailable);
        else {
          const s = await scope(f, family, "paper", target(family));
          expect(scopeReadPopulation(s).allowedTuples).not.toContainEqual(tuple);
          expect(projectionRowVisible(s, tuple)).toBe(false);
        }
      });
    it.each(["parent-revoked", "issuer-suspended", "ancestor-deny"] as const)("selected delegated grant rechecks %s against the complete graph", async fault => {
      // Deliberately reuse the accepted legacy receipt shape for ancestry;
      // per-resource versioned positive/negative coverage is independent above.
      const f = fixture(family, "paper", true), g = grant(f), issuer = "TEST_ONLY-delegator";
      const parent: ScopedAccessGrant = { ...g, grant_id: "TEST_ONLY-parent", subject_user_id: issuer,
        action: "access.grant", delegable_actions: [action(family)], requires_ts_acceptance: false, ts_receipt: null };
      const child = { ...g, issued_by: issuer, parent_grant_id: parent.grant_id };
      f.context.active_principals = new Set([...f.context.active_principals, issuer]);
      f.context.grants = [parent, child]; expect((await read(f, family)).records).toHaveLength(population(family).length);
      if (fault === "parent-revoked") parent.revoked_at_ms = f.context.now_ms;
      if (fault === "issuer-suspended") f.context.active_principals = new Set([...f.context.active_principals].filter(id => id !== issuer));
      if (fault === "ancestor-deny") f.context.grants = [...f.context.grants, { ...parent, grant_id: "TEST_ONLY-parent-deny", effect: "DENY", delegable_actions: [] }];
      await expect(read(f, family)).rejects.toMatchObject(unavailable);
    });
    it("a finite reviewed field policy remains mandatory, including source identity", async () => {
      const f = fixture(family); versioned(f);
      const identity = family === "ALPHA" ? "order_id" : "portfolio_id";
      f.context.policy!.researcher_fields.fields = [identity];
      const value = await read(f, family);
      for (const record of value.records) expect(Object.keys(record.values)).toEqual([identity]);
      f.context.policy!.researcher_fields.fields = ["name"];
      await expect(read(f, family)).rejects.toMatchObject({ status: 503, code: "EXECUTION_READ_FIELD_POLICY_PENDING" });
      f.context.policy!.researcher_fields.state = "PENDING";
      await expect(read(f, family)).rejects.toMatchObject({ status: 503, code: "EXECUTION_READ_FIELD_POLICY_PENDING" });
    });
    it.each(["workspace", "environment", "profile", "dataset", "epoch", "partial"] as const)("rejects an unqualified %s publication", async fault => {
      const f = fixture(family); versioned(f); const original = f.access.readPublication.getMockImplementation()!;
      f.access.readPublication.mockImplementation(async request => {
        const p = await original(request);
        if (fault === "workspace") return { ...p, workspace_id: "TEST_ONLY-other-workspace" };
        if (fault === "environment") return { ...p, environment: "live" as const };
        if (fault === "profile") return { ...p, profile_id: "TEST_ONLY-wrong-profile" };
        if (fault === "dataset") return { ...p, binding: { ...p.binding, dataset_id: "TEST_ONLY-other-dataset" } };
        if (fault === "epoch") return { ...p, binding: { ...p.binding, projection_generation: "TEST_ONLY-other-epoch" } };
        return { ...p, population_coverage: "PARTIAL" as never };
      });
      await expect(read(f, family)).rejects.toMatchObject(unqualified);
      expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
    });
    it("revocation during final source await prevents delivery, including a prior cursor", async () => {
      const f = fixture(family, "paper", true); versioned(f);
      const first = await read(f, family, "paper", { limit: 1 });
      let calls = 0;
      f.repository.snapshotMetadata.mockImplementation(async () => {
        if (++calls === 2) { grant(f).revoked_at_ms = f.context.now_ms; f.context.authority_fingerprint = "TEST_ONLY-revoked"; }
        return f.snapshot;
      });
      await expect(read(f, family)).rejects.toMatchObject(unavailable);
      if (first.page.next_cursor) await expect(read(f, family, "paper", { limit: 1, cursor: first.page.next_cursor })).rejects.toMatchObject(unavailable);
    });
    it("does not confer account, export or whole-population authority", async () => {
      const f = fixture(family); versioned(f);
      for (const request of [{ action: "account.read" as const, resource: { kind: "ACCOUNT" as const, id: PRIVATE.account_id } },
        { action: "report.export" as const, resource: target(family) }]) {
        await expect(f.scopes.authorize(f.principal, { environment: "paper", profileId: profile(f, "paper") }, request)).rejects.toMatchObject(unavailable);
      }
      await expect(scope(f, family, "paper", undefined, true)).rejects.toMatchObject(unavailable);
    });
  });
  it.each(["OWN_ALPHA", "ROOT_SCOPE", "PORTFOLIO_MEMBERSHIP", "WRONG_RESOURCE_KIND", "RESTRICTED", "DISCOVERY"] as const)(
    "does not silently route %s into the exact-explicit-read branch", async kind => {
      const family: Family = kind === "PORTFOLIO_MEMBERSHIP" || kind === "RESTRICTED" || kind === "DISCOVERY" ? "PORTFOLIO" : "ALPHA";
      const f = fixture(family, "paper", true), g = grant(f), old = f.context.relationsFor(f.principal.user.userId);
      if (kind === "OWN_ALPHA") { g.selector = { kind }; f.context.relationsFor = () => ({ ...old, own_alpha_ids: [OWN.alpha_id] }); }
      if (kind === "ROOT_SCOPE") g.selector = { kind, root_id: "root" };
      if (kind === "PORTFOLIO_MEMBERSHIP") { g.selector = { kind, portfolio_ids: [PRIVATE.portfolio_id] };
        f.context.relationsFor = () => ({ ...old, member_portfolio_ids: [PRIVATE.portfolio_id] }); }
      if (kind === "WRONG_RESOURCE_KIND") g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "DEPLOYMENT", ids: [OWN.deployment_id] };
      if (kind === "RESTRICTED" || kind === "DISCOVERY") g.action = kind === "RESTRICTED" ? "portfolio.read_restricted" : "portfolio.discover_linked";
      if (kind === "RESTRICTED" || kind === "DISCOVERY") {
        const operation = managerRelationOperationByRoute("portfolios")!;
        await expect(f.scopes.authorize(f.principal, { environment: "paper", profileId: profile(f, "paper") }, {
          action: g.action, dataset: { dataset_id: `relation:${operation.sourceId}:portfolios`, source_revision: f.snapshot.payloadDigest,
            projection_generation: f.snapshot.projectionEpoch, catalogue_revision: f.snapshot.sourceCatalogueSha256, window: null },
        })).rejects.toMatchObject(unavailable);
      } else await expect(read(f, family)).rejects.toMatchObject(unavailable);
    });
  it("another dynamic ALLOW cannot rescue an invalid selected original explicit grant", async () => {
    const f = fixture("ALPHA", "paper", true), g = grant(f), old = f.context.relationsFor(f.principal.user.userId);
    g.revoked_at_ms = f.context.now_ms;
    f.context.grants = [g, { ...g, grant_id: "TEST_ONLY-other-dynamic", revoked_at_ms: null, selector: { kind: "OWN_ALPHA" } }];
    f.context.relationsFor = () => ({ ...old, own_alpha_ids: [OWN.alpha_id] });
    await expect(read(f, "ALPHA")).rejects.toMatchObject(unavailable);
  });
  it("unions the newly explicit Alpha tuple with the existing linked-own slice, not a replacement", async () => {
    const f = fixture("ALPHA", "paper", true), original = productReadFixture(), g = grant(f);
    g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ALPHA", ids: [PEER.alpha_id] };
    const old = f.context.relationsFor(f.principal.user.userId);
    f.context.relationsFor = () => ({ ...old, own_alpha_ids: [OWN.alpha_id], member_portfolio_ids: [OWN.portfolio_id, PRIVATE.portfolio_id] });
    f.context.grants = [g, original.context.grants[0], original.context.grants[2]];
    const s = await scope(f, "ALPHA");
    expect(scopeReadPopulation(s).allowedTuples).toHaveLength(3);
    for (const tuple of [OWN, PEER, PRIVATE]) expect(scopeReadPopulation(s).allowedTuples).toContainEqual(tuple);
    expect(s.wholePopulation).toBe(false);
  });
  it("a malformed hidden Portfolio cannot create a scalar oracle; an authorized malformed row refuses", async () => {
    const f = fixture("PORTFOLIO"); versioned(f);
    const key = `${managerRelationOperationByRoute("portfolios")!.sourceId}:portfolios`;
    const relation = f.snapshot.document.relations[key], before = await read(f, "PORTFOLIO");
    // Numeric scalars survive generic redaction, but violate this TEXT DTO.
    relation.items[1].fields.name = 123;
    expect(await read(f, "PORTFOLIO")).toEqual(before);
    relation.items[0].fields.name = 123;
    await expect(read(f, "PORTFOLIO")).rejects.toMatchObject({ status: 503, code: "UDB_RETAINED_SCALAR_CONTRACT_REJECTED" });
  });
  it("actual Blotter filtering/paging never reveals peers or fabricated Cartesian tuples", async () => {
    const f = fixture("ALPHA"); versioned(f);
    const relation = f.snapshot.document.relations["manager.orders:orders"];
    relation.items.push({ fields: { ...OWN, deployment_id: PEER.deployment_id, order_id: "4", status: "SECRET-CROSS", side: "SELL", venue: "SECRET-CROSS" } });
    const first = await f.orders(); expect(first.source.data.projected_total_items).toBe(2);
    expect(first.source.data.window_aggregates.status).toEqual({ OPEN: 2 });
    expect(first.source.data.next_cursor).toBeTruthy();
    expect(JSON.stringify(first)).not.toMatch(/SECRET-CROSS|PEER_ONLY_STATUS|HIDDEN_VENUE|NEVER_RETURN/);
    expect(await f.orders({ status: "PEER_ONLY_STATUS" })).toEqual(await f.orders({ status: "TEST_ONLY-never-existed" }));
    await expect(f.orders({ limit: 2, cursor: first.source.data.next_cursor })).rejects.toMatchObject({ status: 400, code: "N31_PROJECTION_CURSOR_INVALID" });
  });
  it("raw strategy namespace stays source-mapped, and an unqualified mapping cannot be guessed", async () => {
    const f = fixture("ALPHA"); versioned(f); const s = await scope(f, "ALPHA");
    expect(projectionRowVisible(s, { strategy_id: "strategy-own", account_id: OWN.account_id })).toBe(true);
    expect(projectionRowVisible(s, { strategy_id: OWN.alpha_id, account_id: OWN.account_id })).toBe(false);
    const resolved = await f.product.resolveDeploymentScope(f.principal, "paper", "EXECUTION_PAPER_WORKBENCH_SCREEN", OWN.deployment_id);
    expect(resolved.state).toBe("FOUND"); expect(resolved.scope?.deploymentId).toBe(OWN.deployment_id);
    const original = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => ({ ...await original(request), strategy_lineage: null as never }));
    // The tuple still authorizes this deployment, but no visible mapped source
    // row remains. Preserve this existing typed EMPTY read, not a fake mapping.
    await expect(f.product.resolveDeploymentScope(f.principal, "paper", "EXECUTION_PAPER_WORKBENCH_SCREEN", OWN.deployment_id))
      .resolves.toMatchObject({ state: "EMPTY", reasonCode: "EDS03_DEPLOYMENT_NOT_FOUND" });
  });
  it("partial shared-account grain remains hidden without complete correlated read authority", async () => {
    const f = fixture("ALPHA"); versioned(f); const s = await scope(f, "ALPHA");
    expect(projectionRowVisible(s, { account_id: OWN.account_id, balance_total: "1000000" })).toBe(false);
    expect(projectionRowVisible(s, PRIVATE)).toBe(true);
  });
});

/** Canonical selected-original checks are bounded by qualified publication IDs. */
describe("ELP2-04 selected-original and publication-ID bounds", () => {
  describe.each(FAMILIES)("%s", family => {
    it.each(["revoked", "missing-current-leg"] as const)(
      "an invalid first %s original cannot suppress a later independent explicit original", async fault => {
        const policy = await import("../src/execution-v2/access-policy");
        const f = fixture(family), first = grant(f), source = versioned(f), originalProof = source.grants[0];
        const later: ScopedAccessGrant = { ...first, grant_id: "TEST_ONLY-independent-later",
          ts_receipt: { ...first.ts_receipt!, receipt_id: "TEST_ONLY-independent-later-receipt" } };
        const accepted = tsMembershipAcceptance.parse({ ...originalProof.accepted,
          receipt_id: later.ts_receipt!.receipt_id, proposal_id: "TEST_ONLY-independent-later-proposal",
          proposal_digest: accessDigest("TEST_ONLY-independent-later-proposal"),
          provenance_ref: "TEST_ONLY-independent-later-NOT-SOURCE-AUTHORITY" });
        later.ts_acceptance_digest = accessDigest(accepted);
        source.grants.push({ ...originalProof, grant_id: later.grant_id, accepted,
          binding_digest: grantBindingDigest(later), targets: structuredClone(originalProof.targets) });
        f.context.grants = [first, later];
        if (fault === "revoked") first.revoked_at_ms = f.context.now_ms;
        if (fault === "missing-current-leg") originalProof.targets = [];
        expect(policy.currentExplicitReadAllows(f.context, action(family), target(family), "paper")).toBe(true);
        expect(scopeReadPopulation(await scope(f, family)).allowedTuples).toEqual(population(family));
        // Independent ALLOW is not a bypass of a genuinely current DENY.
        const { ts_acceptance_digest: _digest, ...base } = later;
        f.context.grants = [...f.context.grants, { ...base, grant_id: "TEST_ONLY-final-current-deny",
          effect: "DENY", requires_ts_acceptance: false, ts_receipt: null }];
        expect(policy.currentExplicitReadAllows(f.context, action(family), target(family), "paper")).toBe(false);
        await expect(scope(f, family, "paper", target(family))).rejects.toMatchObject(unavailable);
      });
    it("checks the canonical helper once per actual visible family ID, not once per candidate/selector/tuple", async () => {
      const { vi } = await import("vitest"), policy = await import("../src/execution-v2/access-policy");
      const f = fixture(family), g = grant(f);
      const selected = family === "ALPHA" ? OWN.alpha_id : OWN.portfolio_id;
      g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: family, ids: [selected] };
      const source = versioned(f), originalProof = source.grants[0];
      const absentIds = Array.from({ length: 199 }, (_, i) => `TEST_ONLY-absent-${i}`);
      // Construct the final synthetic original acceptance for its whole finite
      // selector. Only selected retains a current native leg now. Never install
      // this fixture or pretend its other historical targets are currently valid.
      g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: family, ids: [selected, ...absentIds] };
      originalProof.accepted = tsMembershipAcceptance.parse({ ...originalProof.accepted,
        selector_digest: accessDigest(canonicalSelector(g.selector)),
        proposal_digest: accessDigest("TEST_ONLY-full-original-selector") });
      g.ts_acceptance_digest = accessDigest(originalProof.accepted);
      originalProof.binding_digest = grantBindingDigest(g);
      const stale = Array.from({ length: 8 }, (_, i): ScopedAccessGrant => ({ ...g,
        grant_id: `TEST_ONLY-stale-original-${i}`, revoked_at_ms: f.context.now_ms }));
      f.context.grants = [...stale, g];
      const spy = vi.spyOn(policy, "currentExplicitReadAllows");
      try {
        // authorize() mints once; do not count deliver() remints as a cache miss
        // in this mint, and never cache selected proof across current fences.
        const s = await scope(f, family);
        expect(scopeReadPopulation(s).allowedTuples).toEqual(family === "ALPHA" ? [OWN, PRIVATE] : [OWN, PEER]);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(f.context, action(family), { kind: family, id: selected }, "paper");
        expect(spy.mock.calls[0][0].grants).toHaveLength(9); // full graph retained.
        expect(spy.mock.calls.some(call => absentIds.includes(call[2].id))).toBe(false);
        await scope(f, family);
        expect(spy).toHaveBeenCalledTimes(2); // a new mint must re-evaluate.
      } finally { spy.mockRestore(); }
      // These are synthetic helper-call bounds, not measured latency, memory,
      // full evaluator scans, production capacity or source qualification.
    });
  });
});
