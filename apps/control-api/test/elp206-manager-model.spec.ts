/** Pure ELP2-06 component proofs. Authority, topology, money and source receipts
 * are TEST_ONLY fixtures, not TS/Edge commissioning or product acceptance. */
import { describe, expect, it } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { scopeReadPopulation } from "../src/execution-v2/read-scope";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { managerModelDocument, managerModelQuery, managerMetric,
  type ManagerFact, type ManagerMember, type ManagerMetric, type ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { compareManagerDecimals, dedupeManagerFacts, managerPartitionKey, queryManagerModel } from "../src/execution-v2/manager-model";
import { prepareManagerProjection } from "../src/execution-v2/manager-model.store";
import { KeysetCursorCodec } from "../src/query/cursor";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";

const NOW = 1_800_000_000_000;
const partition = () => ({ economic_domain: "PAPER" as const, currency: "USDT", basis: "TEST_ONLY:net-ledger",
  native_profile_ref: "TEST_ONLY:paper-ledger", domain_proof_ref: "TEST_ONLY:domain-proof" });
function money(value: string, patch: Partial<ManagerMetric> = {}): ManagerMetric {
  return { value, unit: "MONEY", currency: "USDT", basis: partition().basis, window: null, denominator: null,
    methodology_ref: "TEST_ONLY:method", availability: "AVAILABLE", reason_code: null,
    quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
    provenance_refs: ["TEST_ONLY:source-fact"], calculation_revision: "TEST_ONLY:calc", policy_revision: "TEST_ONLY:policy", ...patch };
}
function member(tuple: ManagerMember["tuple"], name: string, patch: Partial<ManagerMember> = {}): ManagerMember {
  return { tuple: { ...tuple }, name, stage: "PAPER", owner_user_id: `TEST_ONLY:owner-${tuple.alpha_id}`,
    lifecycle: "ACTIVE", venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding",
    assignment_revision: "TEST_ONLY:assignment", owner_revision: "TEST_ONLY:owner", binding_revision: "TEST_ONLY:binding-rev",
    valid_from_ms: NOW - 1000, valid_to_ms: null, ...patch };
}
function fact(tuple: ManagerMember["tuple"], id: string, value: string, patch: Partial<ManagerFact> = {}): ManagerFact {
  return { fact_id: id, revision: "TEST_ONLY:fact-r1", source_receipt_ref: "TEST_ONLY:not-economic-proof", tuple: { ...tuple },
    partition: partition(), economic_account_ref: `TEST_ONLY:economic-${tuple.deployment_id}`,
    ownership_partition_ref: `TEST_ONLY:ownership-${tuple.deployment_id}`, kind: "net_pnl", metric: money(value),
    effective_at_ms: NOW - 100, recorded_at_ms: NOW - 50, classification: "ECONOMIC", transfer_pair_ref: null,
    counterpart_portfolio_id: null, ...patch };
}
const codec = () => new KeysetCursorCodec({ activeKeyId: "test", keys: { test: "TEST_ONLY-manager-cursor-key-32bytes-not-prod" }, now: () => NOW / 1000 });
async function fixture(options: { full?: boolean; fields?: string[]; environment?: "paper" | "live"; secondOwn?: boolean } = {}) {
  const f = productReadFixture({ full: options.full, fields: options.fields ?? [...BUSINESS_READ_FIELDS] });
  const second = { ...OWN, deployment_id: "TEST_ONLY:second-deployment", account_id: "TEST_ONLY:second-account" };
  if (options.secondOwn) {
    const readPublication = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      const value = await readPublication(request);
      return { ...value, tuples: [...value.tuples, second], resources: [...value.resources,
        { kind: "DEPLOYMENT" as const, id: second.deployment_id }, { kind: "ACCOUNT" as const, id: second.account_id }] };
    });
    const relationsFor = f.context.relationsFor;
    f.context.relationsFor = (...args) => { const value = relationsFor(...args); return { ...value,
      roots: { ...value.roots, root: [...value.roots.root, { kind: "DEPLOYMENT", id: second.deployment_id }, { kind: "ACCOUNT", id: second.account_id }] } }; };
  }
  const environment = options.environment ?? "paper", profile = environment === "live" ? "LIVE_BINANCE_USDM" : "PAPER_BINANCE_USDM";
  if (environment === "live") f.context.grants.forEach(grant => { grant.environments = ["live"]; });
  const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", workspace_id: f.principal.workspaceId,
    environment, profile_id: profile, qualification: "TEST_ONLY", family_id: "alpha_fleet_overview", revision: "TEST_ONLY:model-r1",
    supersedes_revision: null, source_epoch: "TEST_ONLY:epoch", source_sequence: "9007199254740993", projection_generation: "TEST_ONLY:g1",
    catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest([OWN, PEER, PRIVATE]),
    as_of_ms: NOW - 100, recorded_through_ms: NOW - 50, facts_through_ms: NOW - 100, observed_at_ms: NOW,
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [member(OWN, "Zulu own"), member(PEER, "Alpha peer"), member(PRIVATE, "Middle own")],
    facts: [fact(OWN, "own-pnl", "100.0000000000000001"), fact(PEER, "peer-pnl", "900001"), fact(PRIVATE, "private-pnl", "100.0000000000000002")] };
  if (environment === "live") {
    doc.members.forEach(m => { m.stage = "LIVE"; });
    doc.facts.forEach(value => { value.partition.economic_domain = "ACTUAL"; });
  }
  if (options.secondOwn) doc.members.push(member(second, "Zulu own"));
  const binding = { dataset_id: doc.family_id, source_revision: doc.revision,
    projection_generation: doc.projection_generation, catalogue_revision: doc.catalogue_digest, window: null };
  const scope = await f.scopes.authorize(f.principal, { environment, profileId: profile }, { action: options.full ? "business.read_all" : "alpha.read", dataset: binding });
  const c = codec();
  const read = (query: Record<string, unknown> = {}, surface: Parameters<typeof queryManagerModel>[4] = "FLEET", id?: string) =>
    queryManagerModel(scope, doc, { environment, ...query }, c, surface, id);
  const authority = await f.access.readPublication({ workspace_id: f.principal.workspaceId, environment, profile_id: profile, binding });
  const p: DatasetPublication = { schema_version: "portal.execution.dataset-publication.v1", family_id: doc.family_id,
    catalogue_digest: doc.catalogue_digest, state: "ACTIVE", purpose: "BUSINESS", environment, profile_id: profile,
    issued_at_ms: NOW - 1000, expires_at_ms: NOW + 1000, source_as_of_ms: doc.as_of_ms, observed_at_ms: NOW,
    history_capability: "CURRENT_ONLY", barrier: null,
    source_read: { qualification: "TEST_ONLY", receipt_ref: "TEST_ONLY:source" }, transport_trust: { qualification: "TEST_ONLY", receipt_ref: "TEST_ONLY:transport" },
    privacy: { qualification: "TEST_ONLY", receipt_ref: "TEST_ONLY:privacy" }, field_policy: { qualification: "TEST_ONLY", receipt_ref: "TEST_ONLY:field" },
    authority: authority as DatasetPublication["authority"] };
  return { f, doc, scope, read, publication: p, prepare: () => prepareManagerProjection(doc, p, { nowMs: NOW, allowTestOnly: true }) };
}

describe("ELP2-06 Manager exact query, field and economic scope (TEST_ONLY)", () => {
  it("does not add account valuation snapshots from different cutoffs",async()=>{
    const f=await fixture({full:true});
    f.doc.facts=f.doc.members.map((m,i)=>fact(m.tuple,"TEST_ONLY:nav-"+i,"100",{kind:"current_nav",effective_at_ms:NOW-100-i}));
    const result=f.read({},"FUND");
    expect(result.capital_statements[0].metrics.current_nav).toMatchObject({value:null,reason_code:"INCOMPARABLE_VALUATION_CUTOFF"});
  });
  it.each([
    ["9007199254740993.0000000000000001", "9007199254740993.0000000000000002", -1],
    ["-0.0000000000000002", "-0.0000000000000001", -1], ["1.000", "1", 0], ["-0", "0", 0], ["100", "99.9999999999999999", 1],
  ])("orders %s versus %s without Number coercion", (a, b, expected) => {
    expect(compareManagerDecimals(a as string, b as string)).toBe(expected);
  });
  it("sorts exact finance globally before page, with null last in both directions", async () => {
    const f = await fixture({ full: true });
    f.doc.facts.find(value => value.tuple.alpha_id === PEER.alpha_id)!.metric = money("0", {
      value: null, availability: "UNAVAILABLE", reason_code: "TEST_ONLY:not-published" });
    const ascending = f.read({ sort: [{ field: "net_pnl", direction: "asc" }], economic_partition: partition(), limit: 1 });
    expect(ascending.items[0].name).toBe("Zulu own"); expect(ascending.page.authorized_filtered_count).toBe(3);
    const descending = f.read({ sort: [{ field: "net_pnl", direction: "desc" }], economic_partition: partition() });
    expect(descending.items.map(row => row.name)).toEqual(["Middle own", "Zulu own", "Alpha peer"]);
    expect(descending.items.at(-1)!.metrics.net_pnl).toMatchObject({ value: null, reason_code: "SOURCE_FACTS_PARTIAL" });
  });
  it("filters and groups the full authorized query, not the visible page", async () => {
    const f = await fixture({ full: true });
    const result = f.read({ sort: [{ field: "net_pnl", direction: "asc" }], economic_partition: partition(),
      filters: [{ field: "net_pnl", op: "GTE", value: "100.0000000000000002" }], group_by: ["venue"], limit: 1 });
    expect(result.page).toMatchObject({ returned_count: 1, authorized_filtered_count: 2 });
    expect(result.items[0].name).toBe("Middle own");
    expect(result.groups).toHaveLength(1); expect(result.groups[0].unique_row_count).toBe(2);
    expect(result.groups[0].totals_scope).toBe("FULL_AUTHORIZED_FILTERED_QUERY");
    expect(result.groups[0].economic_partitions[0].metrics.net_pnl.value).toBe("900101.0000000000000002");
  });
  it("scopes exact correlated tuples before count, joins, sorting, grouping and totals", async () => {
    const f = await fixture(); const result = f.read({ group_by: ["portfolio_id"] });
    expect(result.page.authorized_filtered_count).toBe(2);
    expect(result.items.every(row => row.alpha_id === OWN.alpha_id)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/Alpha peer|900001|av-peer|dep-peer/);
    expect(result.groups.find(group => group.key[0].value === OWN.portfolio_id)!.unique_row_count).toBe(1);
  });
  it("does not disclose fields or allow sort/group/filter oracles on a reduced artifact", async () => {
    const f = await fixture({ fields: BUSINESS_READ_FIELDS.filter(field => !["owner_user_id", "health", "allocation", "binding_id"].includes(field)) });
    const result = f.read();
    expect(result.items.every(row => row.owner_user_id === null && row.health === null && !("allocation" in row.metrics) &&
      row.children.every(child => child.binding_ref === null))).toBe(true);
    for (const query of [{ sort: [{ field: "owner_user_id", direction: "asc" }] },
      { group_by: ["health"] }, { filters: [{ field: "allocation", op: "IS_NULL" }] }])
      expect(() => f.read(query)).toThrow();
  });
  it.each(["currency", "profile_id", "provenance_ref"])("fails closed before economic metadata leaks when %s is not permitted", async field => {
    const f = await fixture({ fields: BUSINESS_READ_FIELDS.filter(value => value !== field) });
    expect(() => f.read()).toThrow();
  });
  it("requires a common economic partition for money sort/filter, but allows typed-null queries", async () => {
    const f = await fixture({ full: true });
    expect(() => f.read({ sort: [{ field: "net_pnl", direction: "desc" }] })).toThrow();
    expect(() => f.read({ filters: [{ field: "allocation", op: "EQ", value: "0" }] })).toThrow();
    expect(f.read({ filters: [{ field: "allocation", op: "IS_NULL" }] }).page.authorized_filtered_count).toBe(3);
  });
  it("keeps unavailable values null, explicit source zero available and score policy pending", async () => {
    const f = await fixture(); f.doc.facts[0].metric = money("0");
    const row = f.read().items.find(value => value.portfolio_id === OWN.portfolio_id)!;
    expect(row.metrics.net_pnl).toMatchObject({ value: "0", availability: "AVAILABLE" });
    expect(row.metrics.allocation).toMatchObject({ value: null, availability: "UNAVAILABLE", reason_code: "SOURCE_FACTS_NOT_PUBLISHED" });
    expect(row.metrics.score).toMatchObject({ value: null, reason_code: "RUNTIME_SCORE_POLICY_NOT_APPROVED" });
    expect(f.read().scores).toMatchObject({ calculation_path: "PRECOMPUTED_ONLY", raw: { value: null, status: "policy_pending" } });
  });
  it("limits every detail surface to its authorized resource before aggregation", async () => {
    const f = await fixture();
    expect(f.read({}, "PORTFOLIO", OWN.portfolio_id).items).toHaveLength(1);
    expect(f.read({}, "ACCOUNT", PRIVATE.account_id).items).toHaveLength(1);
    expect(f.read({}, "DEPLOYMENT", OWN.deployment_id).items).toHaveLength(1);
    expect(f.read({}, "ALPHA", PEER.alpha_id).items).toHaveLength(0);
    expect(() => f.read({}, "FUND")).toThrow();
  });
  it("includes historical assignment only at the pinned effective cutoff", async () => {
    const f = await fixture(); f.doc.members[0].valid_to_ms = f.doc.as_of_ms;
    expect(f.read().items.map(row => row.portfolio_id)).toEqual([PRIVATE.portfolio_id]);
    f.doc.members[0].valid_to_ms = f.doc.as_of_ms + 1;
    expect(f.read().items).toHaveLength(2);
  });
  it("binds the query to workspace, profile, exact source revision, catalogue and generation", async () => {
    const f = await fixture();
    for (const patch of [{ workspace_id: "other" }, { environment: "live" }, { profile_id: "other" },
      { revision: "other" }, { catalogue_digest: `sha256:${"0".repeat(64)}` }, { projection_generation: "other" }]) {
      const input = { ...f.doc, ...patch };
      expect(() => queryManagerModel(f.scope, input, { environment: "paper" }, codec())).toThrow();
    }
    expect(() => f.read({ workspace_id: "other" })).toThrow();
  });
});

describe("ELP2-06 Manager fact identities, partitions and statements (TEST_ONLY)", () => {
  it("dedupes source identity, not equal amounts, and rejects conflicting reuse", () => {
    const a = fact(OWN, "one", "5"), b = fact(OWN, "two", "5");
    expect(dedupeManagerFacts([a, structuredClone(a), b])).toHaveLength(2);
    expect(() => dedupeManagerFacts([a, { ...a, metric: money("6") }])).toThrow();
  });
  it("sums equal-valued distinct flow receipts while shared NAV ownership counts once", async () => {
    const f = await fixture({ full: true });
    f.doc.members = f.doc.members.filter(m => m.tuple.portfolio_id !== PRIVATE.portfolio_id);
    f.doc.facts = [fact(OWN, "flow-one", "5", { kind: "added_funds" }), fact(OWN, "flow-two", "5", { kind: "added_funds" }),
      fact(PEER, "flow-none", "0", { kind: "added_funds" }),
      fact(OWN, "nav-one", "100", { kind: "current_nav", economic_account_ref: "shared-economic", ownership_partition_ref: "one-owner" }),
      fact(PEER, "nav-two", "100", { kind: "current_nav", economic_account_ref: "shared-economic", ownership_partition_ref: "one-owner" })];
    const statement = f.read({}, "FUND").capital_statements[0].metrics;
    expect(statement.added_funds.value).toBe("10"); expect(statement.current_nav.value).toBe("100");
    f.doc.facts[4].ownership_partition_ref = "different-authoritative-owner";
    expect(f.read({}, "FUND").capital_statements[0].metrics.current_nav.value).toBe("200");
  });
  it("does not join equal shared-account snapshots with contradictory source values", async () => {
    const f = await fixture({ full: true });
    f.doc.facts = [fact(OWN, "nav-one", "100", { kind: "current_nav", economic_account_ref: "shared", ownership_partition_ref: "owner" }),
      fact(PEER, "nav-two", "101", { kind: "current_nav", economic_account_ref: "shared", ownership_partition_ref: "owner" })];
    expect(() => f.read({}, "FUND")).toThrow();
  });
  it("does not treat physical custody as portfolio economic NAV", async () => {
    const f = await fixture({ full: true }); f.doc.facts = [fact(OWN, "custody", "999999", { kind: "current_nav", classification: "CUSTODY" })];
    const result = f.read({}, "FUND");
    expect(result.capital_statements).toEqual([]);
    expect(result.items.every(row => Object.values(row.metrics).every(metric => metric.value !== "999999"))).toBe(true);
  });
  it("never adds incompatible money, methodology, denominator or window bases", async () => {
    const f = await fixture({ full: true });
    const a = fact(OWN, "nav-one", "10", { kind: "current_nav" });
    for (const change of [{ currency: "USD" }, { methodology_ref: "TEST_ONLY:other" }, { denominator: "11" },
      { window: { from_ms: NOW - 500, to_ms: NOW - 100 } }]) {
      f.doc.facts = [a, fact(PRIVATE, "nav-two", "20", { kind: "current_nav", metric: money("20", change) })];
      expect(f.read({}, "FUND").capital_statements[0].metrics.current_nav).toMatchObject({ value: null, reason_code: "INCOMPARABLE_UNITS" });
    }
  });
  it("does not average/sum ratios or compute a score denominator from a table filter", async () => {
    const f = await fixture({ full: true });
    const ratio = money("0.1", { unit: "RATIO", currency: null, denominator: "100" });
    f.doc.facts = [fact(OWN, "return-one", "0.1", { kind: "return_30d_pct", metric: ratio }),
      fact(PRIVATE, "return-two", "0.1", { kind: "return_30d_pct", metric: ratio })];
    const result = f.read({ filters: [{ field: "name", op: "EQ", value: "Zulu own" }] });
    expect(result.items[0].metrics.return_30d_pct).toMatchObject({ value: "0.1", denominator: "100" });
    expect(result.scores.composition).toEqual({ value: null, status: "policy_pending" });
    f.doc.facts[1].tuple = { ...OWN };
    expect(f.read().items.find(row => row.portfolio_id === OWN.portfolio_id && row.alpha_id === OWN.alpha_id)!.metrics.return_30d_pct)
      .toMatchObject({ value: null, reason_code: "CONSOLIDATED_PATH_REQUIRED" });
  });
  it("retains the weakest source confidence and freshness rather than upgrading unknown evidence", async () => {
    const f = await fixture({ full: true });
    f.doc.facts = [fact(OWN, "one", "10"), fact(OWN, "two", "20", { metric: money("20", {
      source_confidence: "UNKNOWN", quality: { completeness: "COMPLETE", freshness: "STALE", reasons: ["TEST_ONLY:stale"] } }) })];
    const metric = f.read().items.find(row => row.portfolio_id === OWN.portfolio_id && row.alpha_id === OWN.alpha_id)!.metrics.net_pnl;
    expect(metric).toMatchObject({ value: "30", source_confidence: "UNKNOWN", quality: { completeness: "COMPLETE", freshness: "STALE" } });
    expect(metric.quality.reasons).toContain("TEST_ONLY:stale");
  });
  it("documents statements as selected-resource/stages before arbitrary table filters", async () => {
    const f = await fixture({ full: true });
    f.doc.members = f.doc.members.filter(m => m.tuple.portfolio_id !== PRIVATE.portfolio_id);
    f.doc.facts = [fact(OWN, "nav-one", "10", { kind: "current_nav" }), fact(PEER, "nav-two", "20", { kind: "current_nav" })];
    const result = f.read({ filters: [{ field: "name", op: "EQ", value: "Zulu own" }] }, "FUND");
    expect(result.items).toHaveLength(1);
    expect(result.capital_statements[0].metrics.current_nav.value).toBe("30");
    expect(result.statement_scope).toBe("AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS");
  });
  it("does not label a subtotal complete when an authorized member has no published facts", async () => {
    const f = await fixture({ full: true });
    f.doc.facts = [fact(OWN, "nav-one", "10", { kind: "current_nav" }), fact(PEER, "nav-two", "20", { kind: "current_nav" })];
    expect(f.read({}, "FUND").capital_statements[0].metrics.current_nav)
      .toMatchObject({ value: null, reason_code: "SOURCE_FACT_CENSUS_INCOMPLETE" });
  });
  it("checks metric coverage before deduping a shared ownership snapshot", async () => {
    const f = await fixture({ full: true });
    f.doc.members = f.doc.members.filter(m => m.tuple.portfolio_id !== PRIVATE.portfolio_id);
    f.doc.facts = [fact(OWN, "nav", "10", { kind: "current_nav", economic_account_ref: "shared", ownership_partition_ref: "owner" }),
      fact(PEER, "pnl", "2")];
    expect(f.read({}, "FUND").capital_statements[0].metrics.current_nav)
      .toMatchObject({ value: null, reason_code: "SOURCE_FACT_CENSUS_INCOMPLETE" });
    f.doc.facts.push(fact(PEER, "nav-peer", "10", { kind: "current_nav", economic_account_ref: "shared", ownership_partition_ref: "owner" }));
    expect(f.read({}, "FUND").capital_statements[0].metrics.current_nav.value).toBe("10");
  });
  it("requires coverage of every deployment in one alpha/version/portfolio row", async () => {
    const f = await fixture({ full: true, secondOwn: true });
    f.doc.members = [f.doc.members[0], f.doc.members.at(-1)!];
    f.doc.facts = [fact(OWN, "own-pnl", "10")];
    expect(f.read().items[0].children).toHaveLength(2);
    expect(f.read().items[0].metrics.net_pnl).toMatchObject({ value: null, reason_code: "SOURCE_FACT_CENSUS_INCOMPLETE" });
  });
  it("cancels verified reciprocal internal flows once at root, but preserves the portfolio statement", async () => {
    const f = await fixture({ full: true });
    f.doc.members = f.doc.members.filter(m => m.tuple.alpha_id !== PEER.alpha_id);
    f.doc.facts = [fact(OWN, "move-out", "-5", { kind: "added_funds", classification: "INTERNAL_TRANSFER", transfer_pair_ref: "move", counterpart_portfolio_id: PRIVATE.portfolio_id }),
      fact(PRIVATE, "move-in", "5", { kind: "added_funds", classification: "INTERNAL_TRANSFER", transfer_pair_ref: "move", counterpart_portfolio_id: OWN.portfolio_id })];
    expect(f.read({}, "FUND").capital_statements).toEqual([]);
    expect(f.read({}, "PORTFOLIO", OWN.portfolio_id).capital_statements[0].metrics.added_funds.value).toBe("-5");
    f.doc.facts.pop(); expect(() => f.read({}, "FUND")).toThrow();
  });
  it("partitions currencies and native profiles rather than silently combining money", async () => {
    const f = await fixture({ full: true });
    f.doc.facts = [fact(OWN, "one", "5"), fact(OWN, "two", "7", { partition: { ...partition(), native_profile_ref: "TEST_ONLY:other" } })];
    const row = f.read().items.find(value => value.portfolio_id === OWN.portfolio_id && value.alpha_id === OWN.alpha_id)!;
    expect(row.economic_partitions).toHaveLength(2);
    expect(row.metrics.net_pnl).toMatchObject({ value: null, reason_code: "MIXED_ECONOMIC_DOMAINS" });
    expect(f.read({ economic_partition: partition() }).items.find(value => value.portfolio_id === OWN.portfolio_id && value.alpha_id === OWN.alpha_id)!.metrics.net_pnl.value).toBe("5");
    expect(managerPartitionKey(partition())).not.toBe(managerPartitionKey({ ...partition(), currency: "USD" }));
  });
  it("does not cancel equal reciprocal amounts at different cuts or with partial economic proof", async () => {
    const f = await fixture({ full: true });
    const a = fact(OWN, "transfer-out", "-5", { kind: "returned_capital", classification: "INTERNAL_TRANSFER",
      transfer_pair_ref: "TEST_ONLY:pair", counterpart_portfolio_id: PRIVATE.portfolio_id });
    const b = fact(PRIVATE, "transfer-in", "5", { kind: "added_funds", classification: "INTERNAL_TRANSFER",
      transfer_pair_ref: "TEST_ONLY:pair", counterpart_portfolio_id: OWN.portfolio_id });
    f.doc.facts = [a, { ...b, effective_at_ms: b.effective_at_ms - 1 }];
    expect(() => f.read({}, "FUND")).toThrow();
    f.doc.facts = [a, { ...b, metric: money("5", { quality: { completeness: "PARTIAL", freshness: "FRESH", reasons: ["TEST_ONLY:missing-pair-proof"] } }) }];
    expect(() => f.read({}, "FUND")).toThrow();
    f.doc.facts = [a, { ...b, metric: money("5", { methodology_ref: "TEST_ONLY:other-method" }) }];
    expect(() => f.read({}, "FUND")).toThrow();
  });
  it("uses one alpha/version/portfolio row with Live+Canary membership, not a risk-stage ranking", async () => {
    const f = await fixture({ full: true, environment: "live" });
    f.doc.members = [f.doc.members[0], { ...structuredClone(f.doc.members[0]), stage: "CANARY" }];
    f.doc.facts = [fact(OWN, "nav", "10", { partition: { ...partition(), economic_domain: "ACTUAL" }, kind: "current_nav" })];
    const result = f.read({ group_by: ["stage_presence"] });
    expect(result.items).toHaveLength(1); expect(result.items[0].stage_presence).toEqual(["CANARY", "LIVE"]);
    expect(result.items[0].children).toHaveLength(2); expect(result.groups).toHaveLength(2);
    expect(result.groups.every(group => group.unique_row_count === 1)).toBe(true);
    expect(result.capital_statements[0].metrics.current_nav.value).toBe("10");
    expect(f.read({ stage_filter: ["CANARY"] }).items[0].stage_presence).toEqual(["CANARY"]);
  });
});

describe("ELP2-06 Manager snapshot-bound keysets (TEST_ONLY)", () => {
  it("round-trips forward/back with identical snapshot, full counts and groups", async () => {
    const f = await fixture({ full: true }); const q = { limit: 1, group_by: ["venue"] };
    const first = f.read(q), second = f.read({ ...q, after: first.page.next_cursor! });
    const third = f.read({ ...q, after: second.page.next_cursor! });
    const back = f.read({ ...q, before: third.page.previous_cursor! });
    expect([first.items[0].name, second.items[0].name, third.items[0].name]).toEqual(["Alpha peer", "Middle own", "Zulu own"]);
    expect(back.items).toEqual(second.items); expect(first.snapshot_id).toBe(third.snapshot_id);
    expect(first.groups).toEqual(third.groups); expect(third.page.next_cursor).toBeNull();
    expect(f.read({ ...q, before: back.page.previous_cursor! }).items).toEqual(first.items);
  });
  it("rejects tampering and cursor reuse for a different limit/filter/order/resource/scope", async () => {
    const f = await fixture({ full: true }); const token = f.read({ limit: 1 }).page.next_cursor!;
    expect(() => f.read({ limit: 1, after: token.slice(0, -1) + (token.endsWith("A") ? "B" : "A") })).toThrow();
    for (const q of [{ limit: 2 }, { limit: 1, filters: [{ field: "name", op: "EQ", value: "Zulu own" }] },
      { limit: 1, sort: [{ field: "name", direction: "desc" }] }]) expect(() => f.read({ ...q, after: token })).toThrow();
    expect(() => f.read({ limit: 1, after: token }, "PORTFOLIO", OWN.portfolio_id)).toThrow();
    const own = await fixture(); expect(() => own.read({ limit: 1, after: token })).toThrow();
  });
  it("rejects both directions at once and a cursor after source revision change", async () => {
    const f = await fixture({ full: true }); const token = f.read({ limit: 1 }).page.next_cursor!;
    expect(managerModelQuery.safeParse({ environment: "paper", after: token, before: token }).success).toBe(false);
    f.doc.revision = "TEST_ONLY:model-r2"; expect(() => f.read({ limit: 1, after: token })).toThrow();
  });
});

describe("ELP2-06 Manager qualified preparation contract (TEST_ONLY)", () => {
  it("requires explicit test-only admission and detaches the prepared immutable document", async () => {
    const f = await fixture(); const prepared = f.prepare();
    expect(prepared.document.facts).toHaveLength(3);
    f.doc.facts[0].metric.value = "999"; const oneCopy = prepared.document; oneCopy.facts[0].metric.value = "888";
    expect(prepared.document.facts[0].metric.value).toBe("100.0000000000000001");
    expect(() => prepareManagerProjection(f.doc, f.publication, { nowMs: NOW })).toThrow();
    expect(scopeReadPopulation(f.scope).binding!.source_revision).toBe("TEST_ONLY:model-r1");
  });
  it.each(["domain", "currency", "basis", "stage", "unpublished-member", "unpublished-fact", "budget-capital"])("rejects %s mismatch before persistence", async kind => {
    const f = await fixture();
    if (kind === "domain") f.doc.facts[0].partition.economic_domain = "ACTUAL";
    if (kind === "currency") f.doc.facts[0].metric.currency = "USD";
    if (kind === "basis") f.doc.facts[0].metric.basis = "other";
    if (kind === "stage") f.doc.members[0].stage = "LIVE";
    if (kind === "unpublished-member") f.doc.members[0].tuple.deployment_id = "not-published";
    if (kind === "unpublished-fact") f.doc.facts[0].tuple.deployment_id = "not-published";
    if (kind === "budget-capital") { f.doc.facts[0].kind = "allocation"; f.doc.facts[0].classification = "BUDGET"; }
    expect(() => f.prepare()).toThrow();
  });
  it("allows a dimensionless published ratio with null currency in a money partition", async () => {
    const f = await fixture(); f.doc.facts[0].kind = "return_30d_pct";
    f.doc.facts[0].metric = money("0.1", { unit: "RATIO", currency: null, denominator: "100" });
    expect(f.prepare().document.facts[0].metric.currency).toBeNull();
  });
  it("rejects duplicate membership, dedupes exact same source fact and refuses conflicting fact identity", async () => {
    const f = await fixture(); f.doc.members.push(structuredClone(f.doc.members[0])); expect(() => f.prepare()).toThrow();
    f.doc.members.pop(); f.doc.facts.push(structuredClone(f.doc.facts[0])); expect(f.prepare().document.facts).toHaveLength(3);
    f.doc.facts.at(-1)!.metric.value = "10"; expect(() => f.prepare()).toThrow();
  });
  it("accepts successive nonoverlapping assignments but rejects overlapping historical intervals", async () => {
    const f = await fixture();
    const previous = { ...structuredClone(f.doc.members[0]), valid_from_ms: NOW - 2000, valid_to_ms: NOW - 1000 };
    f.doc.members.push(previous);
    expect(f.prepare().document.members).toHaveLength(4);
    expect(f.read().items.find(row => row.portfolio_id === OWN.portfolio_id)!.children).toHaveLength(1);
    previous.valid_to_ms = NOW - 999; expect(() => f.prepare()).toThrow();
  });
  it("rejects publication binding, source-set digest and future effective/observed cutoff changes", async () => {
    const f = await fixture();
    f.doc.source_set_digest = `sha256:${"f".repeat(64)}`; expect(() => f.prepare()).toThrow();
    f.doc.source_set_digest = accessDigest(f.publication.authority.tuples);
    f.doc.facts[0].effective_at_ms = NOW; expect(() => f.prepare()).toThrow(); f.doc.facts[0].effective_at_ms = NOW - 100;
    f.doc.observed_at_ms = NOW + 1; expect(() => f.prepare()).toThrow(); f.doc.observed_at_ms = NOW;
    f.doc.revision = "TEST_ONLY:wrong"; expect(() => f.prepare()).toThrow();
  });
  it("rejects contradictory metric availability and invalid query grammar instead of inventing zero", () => {
    expect(managerMetric.safeParse(money("0", { availability: "UNAVAILABLE", reason_code: "missing" })).success).toBe(false);
    expect(managerMetric.safeParse(money("0", { value: null })).success).toBe(false);
    for (const value of ["NaN", "Infinity", "1e6", "01", "+1"]) expect(managerMetric.safeParse(money(value)).success).toBe(false);
    for (const query of [{ filters: [{ field: "net_pnl", op: "EQ", value: "1e6" }] },
      { filters: [{ field: "name", op: "IS_NULL", value: "no" }] }, { group_by: ["health", "health"] },
      { sort: [{ field: "name", direction: "asc" }, { field: "name", direction: "desc" }] }, { limit: 201 }, { unknown: true }])
      expect(managerModelQuery.safeParse({ environment: "paper", ...query }).success).toBe(false);
    expect(managerModelDocument.safeParse({ arbitrary_source_column: "not-accepted" }).success).toBe(false);
  });
});
