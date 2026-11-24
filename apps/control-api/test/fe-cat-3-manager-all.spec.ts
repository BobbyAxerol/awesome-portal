/** FE-CAT-3: the Fleet ALL lens. Pure in-process proofs (no database): authorization precedes counting, no cross-environment sum,
 * one cursor over one snapshot, a missing environment is typed, and the strict refusals. Authority and money are TEST_ONLY fixtures. */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { accessDigest } from "../src/execution-v2/access-policy";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { managerDatasetResponse, managerModelQuery,
  type ManagerFact, type ManagerMember, type ManagerMetric, type ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { collectManagerRows, managerAllEnvironmentQuery, managerAllReasonOf, queryManagerModel, queryManagerModelAll,
  type ManagerAllRead, type ManagerEnvironmentName } from "../src/execution-v2/manager-model";
import { managerAllRowKey, MANAGER_ALL_ENVIRONMENTS } from "../src/execution-v2/manager-all-scope";
import { KeysetCursorCodec } from "../src/query/cursor";
import { managerScorePopulationDigest } from "../src/execution-v2/manager-score-publication";
import type { ExecutionManagerRuntime } from "../src/execution-v2/manager-runtime";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";

const NOW = 1_800_000_000_000;
const DOMAIN = { paper: "PAPER", sandbox: "SANDBOX", live: "ACTUAL" } as const;
const STAGE = { paper: "PAPER", sandbox: "SANDBOX", live: "LIVE" } as const;
const PROFILE = { paper: "PAPER_BINANCE_USDM", sandbox: "SANDBOX_BINANCE_USDM", live: "LIVE_BINANCE_USDM" } as const;
// The SAME currency and basis in every environment: the trap a naive "All" would sum.
const partition = (env: ManagerEnvironmentName) => ({ economic_domain: DOMAIN[env], currency: "USDT", basis: "TEST_ONLY:net-ledger",
  native_profile_ref: `TEST_ONLY:${env}-ledger`, domain_proof_ref: "TEST_ONLY:domain-proof" });
const money = (value: string, env: ManagerEnvironmentName, patch: Partial<ManagerMetric> = {}): ManagerMetric => ({ value, unit: "MONEY",
  currency: "USDT", basis: partition(env).basis, window: null, denominator: null, methodology_ref: "TEST_ONLY:method", availability: "AVAILABLE",
  reason_code: null, quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
  provenance_refs: ["TEST_ONLY:source-fact"], calculation_revision: "TEST_ONLY:calc", policy_revision: "TEST_ONLY:policy", ...patch });
const member = (tuple: ManagerMember["tuple"], name: string, env: ManagerEnvironmentName): ManagerMember => ({ tuple: { ...tuple }, name, stage: STAGE[env],
  owner_user_id: `TEST_ONLY:owner-${tuple.alpha_id}`, lifecycle: "ACTIVE", venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH",
  binding_ref: "TEST_ONLY:binding", assignment_revision: "TEST_ONLY:assignment", owner_revision: "TEST_ONLY:owner", binding_revision: "TEST_ONLY:binding-rev",
  valid_from_ms: NOW - 1000, valid_to_ms: null });
const fact = (tuple: ManagerMember["tuple"], id: string, value: string, env: ManagerEnvironmentName, kind: ManagerFact["kind"] = "net_pnl"): ManagerFact => ({
  fact_id: `${env}-${id}`, revision: "TEST_ONLY:fact-r1", source_receipt_ref: "TEST_ONLY:not-economic-proof", tuple: { ...tuple }, partition: partition(env),
  economic_account_ref: `TEST_ONLY:economic-${tuple.deployment_id}`, ownership_partition_ref: `TEST_ONLY:ownership-${env}-${tuple.deployment_id}`, kind,
  metric: money(value, env), effective_at_ms: NOW - 100, recorded_at_ms: NOW - 50, classification: "ECONOMIC", transfer_pair_ref: null, counterpart_portfolio_id: null });
const codec = () => new KeysetCursorCodec({ activeKeyId: "test", keys: { test: "TEST_ONLY-manager-cursor-key-32bytes-not-prod" }, now: () => NOW / 1000 });

interface WorldOptions { full?: boolean; empty?: boolean; revision?: string; quality?: ManagerModelDocument["source_quality"]; asOf?: number }
async function world(env: ManagerEnvironmentName, options: WorldOptions = {}) {
  const f = productReadFixture({ full: options.full, fields: [...BUSINESS_READ_FIELDS] });
  f.context.grants.forEach(grant => { grant.environments = [env]; });
  const tuples = [OWN, PEER, PRIVATE];
  const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", workspace_id: f.principal.workspaceId,
    environment: env, profile_id: PROFILE[env], qualification: "TEST_ONLY", family_id: "alpha_fleet_overview", revision: options.revision ?? `TEST_ONLY:${env}-r1`,
    supersedes_revision: null, source_epoch: "TEST_ONLY:epoch", source_sequence: "1", projection_generation: "TEST_ONLY:g1",
    catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest(tuples),
    as_of_ms: options.asOf ?? NOW - 100, recorded_through_ms: NOW - 50, facts_through_ms: options.asOf ?? NOW - 100, observed_at_ms: NOW,
    source_quality: options.quality ?? { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: options.empty ? [] : [member(OWN, "Zulu own", env), member(PEER, "Alpha peer", env), member(PRIVATE, "Middle own", env)],
    facts: options.empty ? [] : [fact(OWN, "own-pnl", "100.5", env), fact(PEER, "peer-pnl", "900001", env), fact(PRIVATE, "private-pnl", "7", env),
      fact(OWN, "own-nav", "1000", env, "current_nav"), fact(PEER, "peer-nav", "25", env, "current_nav"),
      fact(PRIVATE, "private-nav", "50", env, "current_nav")].map(value => ({ ...value, effective_at_ms: options.asOf ?? NOW - 100 })) };
  const binding = { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
    catalogue_revision: doc.catalogue_digest, window: null };
  const scope = await f.scopes.authorize(f.principal, { environment: env, profileId: PROFILE[env] }, { action: options.full ? "business.read_all" : "alpha.read", dataset: binding });
  return { env, f, doc, scope };
}
type World = Awaited<ReturnType<typeof world>>;

/** What the service does: collect every environment under its own scope; a missing one carries its typed reason. */
function reads(query: Record<string, unknown>, worlds: Partial<Record<ManagerEnvironmentName, World>>,
  unavailable: Partial<Record<ManagerEnvironmentName, Parameters<typeof managerAllReasonOf>[0]>> = {}, strictNetPnl = false): ManagerAllRead[] {
  const all = managerModelQuery.parse({ environment: "ALL", ...query });
  return MANAGER_ALL_ENVIRONMENTS.map((environment): ManagerAllRead => {
    const w = worlds[environment];
    if (!w) return { environment, unavailable: managerAllReasonOf(unavailable[environment] ?? new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404)) };
    return { environment, collected: collectManagerRows(w.scope, w.doc, managerAllEnvironmentQuery(all, environment),
      "FLEET", undefined, undefined, undefined, undefined, undefined, strictNetPnl) };
  });
}
const read = (query: Record<string, unknown>, worlds: Partial<Record<ManagerEnvironmentName, World>>, unavailable = {}) =>
  queryManagerModelAll(reads(query, worlds, unavailable), { environment: "ALL", ...query }, codec(), worlds.paper?.f.principal.workspaceId ?? worlds.live!.f.principal.workspaceId);

describe("FE-CAT-3 Fleet ALL lens: authorized rows across environments, no cross-environment sum", () => {
  it("rejects legacy ALL row and group cursors after enabling the NET_PNL proof fence", async () => {
    const paper = await world("paper"), live = await world("live", { full: true });
    const worlds = { paper, live }, q = { group_by: ["alpha_id"], group_limit: 1, limit: 1 };
    const first = read(q, worlds);
    expect(first.page.next_cursor).toBeTruthy();
    expect(first.group_page?.next_cursor).toBeTruthy();
    const strict = (query: Record<string, unknown>) => queryManagerModelAll(reads(query, worlds, {}, true),
      { environment: "ALL", ...query }, codec(), paper.f.principal.workspaceId);
    expect(() => strict({ ...q, after: first.page.next_cursor })).toThrow(/Query cursor does not match/);
    expect(() => strict({ ...q, group_after: first.group_page!.next_cursor })).toThrow(/Query cursor does not match/);
  });
  it("continues groups independently across ALL with exact snapshot-bound cursors and environment partitions", async () => {
    const paper = await world("paper"), live = await world("live", { full: true });
    const q = { group_by: ["alpha_id"], group_limit: 1, limit: 1 };
    const first = read(q, { paper, live });
    expect(read({ limit: 1 }, { paper, live })).not.toHaveProperty("group_page");
    const second = read({ ...q, group_after: first.group_page!.next_cursor }, { paper, live });
    expect(first.group_page).toMatchObject({ authorized_filtered_count: 2, returned_count: 1 });
    expect(second.items).toEqual(first.items);
    expect(second.snapshot_id).toBe(first.snapshot_id);
    expect(second.capital_statements).toEqual(first.capital_statements);
    expect(read({ ...q, group_before: second.group_page!.previous_cursor }, { paper, live }).groups).toEqual(first.groups);
    expect(() => read({ ...q, after: first.group_page!.next_cursor }, { paper, live })).toThrow();
    expect(() => read({ ...q, group_after: first.group_page!.next_cursor }, { paper })).toThrow();
    for (const g of [...first.groups, ...second.groups]) {
      expect(g.attribution?.alpha_id).toBe(g.key[0].value);
      expect(new Set(g.economic_partitions.map(p => p.partition.economic_domain)).size).toBe(g.economic_partitions.length);
    }
  });
  it("authorizes each environment BEFORE counting: a hidden row is in no row, no count, no group and no statement", async () => {
    const paper = await world("paper");            // own alpha only: PEER is hidden
    const live = await world("live", { full: true }); // whole population
    const result = read({ group_by: ["venue"] }, { paper, live });
    expect(result.items.filter(r => r.environment === "paper").map(r => r.alpha_id).sort()).toEqual([OWN.alpha_id, PRIVATE.alpha_id].sort());
    expect(result.items.filter(r => r.environment === "live")).toHaveLength(3);
    const coverage = Object.fromEntries(result.environment_coverage!.map(c => [c.environment, c]));
    expect(coverage.paper).toMatchObject({ availability: "INCLUDED", authorized_filtered_count: 2, returned_count: 2 }); // not 3
    expect(coverage.live).toMatchObject({ availability: "INCLUDED", authorized_filtered_count: 3, returned_count: 3 });
    expect(result.page).toMatchObject({ authorized_filtered_count: 5, returned_count: 5 });
    // the hidden peer's money is nowhere in the Paper partitions
    const paperGroup = result.groups[0].economic_partitions.find(p => p.partition.economic_domain === "PAPER")!;
    expect(paperGroup.metrics.net_pnl.value).toBe("107.5");
    for (const part of result.items.filter(r => r.environment === "paper").flatMap(r => r.economic_partitions)) expect(part.metrics.net_pnl.value).not.toContain("900");
    expect(result.items.some(r => r.environment === "paper" && r.alpha_id === PEER.alpha_id)).toBe(false);
  });

  it("adds no money across environments or currencies: the same USDT stays in separate, labelled partitions", async () => {
    const paper = await world("paper", { full: true }), live = await world("live", { full: true }), sandbox = await world("sandbox", { full: true });
    const result = read({ group_by: ["venue"] }, { paper, live, sandbox });
    expect(result.economic_aggregation).toBe("PARTITIONED_ONLY");
    // one group (one venue) holds THREE partitions, one per economic domain, each with ITS OWN total
    const parts = result.groups[0].economic_partitions;
    expect(parts.map(p => p.partition.economic_domain).sort()).toEqual(["ACTUAL", "PAPER", "SANDBOX"]);
    for (const p of parts) expect(p.metrics.net_pnl.value).toBe("900108.5");
    // no figure anywhere is the cross-environment sum (3 x 900108.5) or any pair sum
    const text = JSON.stringify(result);
    for (const sum of ["2700325.5", "1800217"]) expect(text).not.toContain(sum);
    // capital statements: the environments' statements side by side, one per partition
    expect(result.capital_statements.map(s => s.partition.economic_domain).sort()).toEqual(["ACTUAL", "PAPER", "SANDBOX"]);
    for (const s of result.capital_statements) expect(s.metrics.current_nav.value).toBe("1075");
    // every row carries only its own environment's partitions
    for (const row of result.items) {
      expect(row.economic_partitions.every(p => p.partition.economic_domain === DOMAIN[row.environment!])).toBe(true);
      expect(row.row_key).toBe(managerAllRowKey(row.environment!, row));
    }
  });

  it("types a missing environment: never silently absent, never COMPLETE, never zero rows pretending to be a zero", async () => {
    const paper = await world("paper", { full: true }), live = await world("live", { full: true });
    const result = read({}, { paper, live }, { sandbox: new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503) });
    const sandbox = result.environment_coverage!.find(c => c.environment === "sandbox")!;
    expect(sandbox).toEqual({ environment: "sandbox", availability: "UNAVAILABLE", reason_code: "PUBLICATION_NOT_QUALIFIED", snapshot_id: null,
      as_of_ms: null, recorded_through_ms: null, facts_through_ms: null, quality: null, authorized_filtered_count: null, returned_count: null });
    expect(result.environment_coverage!.map(c => c.environment)).toEqual(["paper", "sandbox", "live"]);
    expect(result.quality.completeness).toBe("PARTIAL");
    expect(result.quality.freshness).toBe("UNKNOWN");
    expect(result.quality.reasons).toContain("sandbox:ENVIRONMENT_UNAVAILABLE:PUBLICATION_NOT_QUALIFIED");
    expect(result.items.some(r => r.environment === "sandbox")).toBe(false);
    expect(result.page.authorized_filtered_count).toBe(6);
  });

  it("separates a true zero (an included environment with no rows) from an unavailable one", async () => {
    const paper = await world("paper", { full: true }), sandbox = await world("sandbox", { full: true, empty: true });
    const result = read({}, { paper, sandbox }, { live: new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503) });
    const byEnv = Object.fromEntries(result.environment_coverage!.map(c => [c.environment, c]));
    expect(byEnv.sandbox).toMatchObject({ availability: "INCLUDED", reason_code: null, authorized_filtered_count: 0, returned_count: 0 });
    expect(byEnv.sandbox.snapshot_id).toMatch(/^sha256:/);
    expect(byEnv.live).toMatchObject({ availability: "UNAVAILABLE", reason_code: "SOURCE_UNAVAILABLE", authorized_filtered_count: null });
  });

  it("states the conservative envelope: the oldest clock and the worst quality of the included environments", async () => {
    const paper = await world("paper", { full: true, asOf: NOW - 500, quality: { completeness: "PARTIAL", freshness: "STALE", reasons: ["lag"] } });
    const live = await world("live", { full: true });
    const result = read({}, { paper, live, sandbox: await world("sandbox", { full: true }) });
    expect(result.as_of_ms).toBe(NOW - 500);
    expect(result.quality).toMatchObject({ completeness: "PARTIAL", freshness: "STALE" });
    expect(result.quality.reasons).toEqual(["paper:lag"]);
    expect(result.environment_coverage!.find(c => c.environment === "paper")!.as_of_ms).toBe(NOW - 500);
    expect(result.environment_coverage!.find(c => c.environment === "live")!.as_of_ms).toBe(NOW - 100);
  });

  it("answers a viewer with no environment at all as the single-environment read does (404), and a source outage as 503", async () => {
    const q = { environment: "ALL" };
    expect(() => queryManagerModelAll(reads({}, {}), q, codec(), "TEST_ONLY-product-workspace")).toThrowError(expect.objectContaining({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 }));
    expect(() => queryManagerModelAll(reads({}, {}, { live: new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503) }), q, codec(), "TEST_ONLY-product-workspace"))
      .toThrowError(expect.objectContaining({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 }));
  });
});

describe("FE-CAT-3 one cursor over one exact snapshot", () => {
  const names = (r: { items: Array<{ name: string | null; environment?: string }> }) => r.items.map(i => `${i.environment}:${i.name}`);
  it("pages the merged order with the unchanged keyset cursor: pages concatenate to the whole, previous returns", async () => {
    const paper = await world("paper", { full: true }), live = await world("live", { full: true });
    const worlds = { paper, live };
    const query = { sort: [{ field: "name", direction: "asc" }], limit: 2 };
    const whole = read({ ...query, limit: 200 }, worlds);
    const first = read(query, worlds);
    expect(first.page).toMatchObject({ limit: 2, returned_count: 2, authorized_filtered_count: 6, previous_cursor: null });
    const second = read({ ...query, after: first.page.next_cursor }, worlds);
    const third = read({ ...query, after: second.page.next_cursor }, worlds);
    expect(third.page.next_cursor).toBeNull();
    expect([...names(first), ...names(second), ...names(third)]).toEqual(names(whole));
    expect(first.snapshot_id).toBe(second.snapshot_id);
    const back = read({ ...query, before: second.page.previous_cursor }, worlds);
    expect(names(back)).toEqual(names(first));
    // per-environment counts are of the WHOLE filtered query on every page; returned_count is of this page
    expect(second.environment_coverage!.map(c => c.authorized_filtered_count)).toEqual([3, null, 3]);
    expect(second.environment_coverage!.reduce((n, c) => n + (c.returned_count ?? 0), 0)).toBe(second.page.returned_count);
  });

  it("refuses a cursor after ANY environment's snapshot, outcome or the question changed", async () => {
    const paper = await world("paper", { full: true }), live = await world("live", { full: true });
    const query = { limit: 2 };
    const cursor = read(query, { paper, live }).page.next_cursor!;
    const live2 = await world("live", { full: true, revision: "TEST_ONLY:live-r2" });
    expect(() => read({ ...query, after: cursor }, { paper, live: live2 })).toThrow();            // a source revision moved
    const sandbox = await world("sandbox", { full: true });
    expect(() => read({ ...query, after: cursor }, { paper, live, sandbox })).toThrow();          // an environment came back
    expect(() => read({ ...query, limit: 2, after: cursor, q: "zulu" }, { paper, live })).toThrow(); // another question
    // a single-environment cursor is not an ALL cursor
    const single = queryManagerModel(paper.scope, paper.doc, { environment: "paper", limit: 1 }, codec(), "FLEET");
    expect(() => read({ ...query, after: single.page.next_cursor }, { paper, live })).toThrow();
  });
});

describe("FE-CAT-3 strict refusals", () => {
  it("one scope can never answer ALL, and a collected read for another question or scope is refused", async () => {
    const paper = await world("paper", { full: true }), live = await world("live", { full: true });
    expect(() => queryManagerModel(paper.scope, paper.doc, { environment: "ALL" }, codec(), "FLEET")).toThrowError(expect.objectContaining({ status: 400 }));
    const base = reads({}, { paper, live });
    // a read collected for ANOTHER question (a filter the ALL query did not carry)
    const other = managerAllEnvironmentQuery(managerModelQuery.parse({ environment: "ALL", q: "zulu", q_mode: "CONTAINS" }), "paper");
    const swapped = base.map(r => r.environment === "paper" ? { environment: "paper" as const, collected: collectManagerRows(paper.scope, paper.doc, other) } : r);
    expect(() => queryManagerModelAll(swapped, { environment: "ALL" }, codec(), paper.f.principal.workspaceId)).toThrowError(expect.objectContaining({ status: 409 }));
    // the live collection placed under paper
    const crossed = base.map(r => r.environment === "paper" ? { environment: "paper" as const, collected: (base[2] as unknown as { collected: never }).collected } : r);
    expect(() => queryManagerModelAll(crossed, { environment: "ALL" }, codec(), paper.f.principal.workspaceId)).toThrowError(expect.objectContaining({ status: 409 }));
    // another workspace
    expect(() => queryManagerModelAll(base, { environment: "ALL" }, codec(), "another-workspace")).toThrowError(expect.objectContaining({ status: 409 }));
    // fewer or repeated outcomes
    expect(() => queryManagerModelAll(base.slice(0, 2), { environment: "ALL" }, codec(), paper.f.principal.workspaceId)).toThrow();
    expect(() => queryManagerModelAll([base[0], base[0], base[2]], { environment: "ALL" }, codec(), paper.f.principal.workspaceId)).toThrow();
  });

  it("ALL takes no window and no money order without a pinned partition; an exact window is for one environment", async () => {
    expect(managerModelQuery.safeParse({ environment: "ALL", window: "30D" }).success).toBe(false);
    expect(managerModelQuery.safeParse({ environment: "ALL", window: { from_ms: 1, to_ms: 2 } }).success).toBe(false);
    expect(managerModelQuery.safeParse({ environment: "paper", window: "30D" }).success).toBe(true);
    const paper = await world("paper", { full: true }), live = await world("live", { full: true });
    const worlds = { paper, live };
    expect(() => read({ sort: [{ field: "net_pnl", direction: "desc" }] }, worlds)).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() => read({ filters: [{ field: "net_pnl", op: "GTE", value: "1" }] }, worlds)).toThrowError(expect.objectContaining({ status: 400 }));
    // pinned to the Paper partition: Live rows hold no Paper figure and sort last, never merged into it
    const pinned = read({ sort: [{ field: "net_pnl", direction: "desc" }], economic_partition: partition("paper") }, worlds);
    expect(pinned.items.slice(0, 3).every(r => r.environment === "paper")).toBe(true);
    expect(pinned.items.slice(3).every(r => r.environment === "live" && r.metrics.net_pnl?.value === null)).toBe(true);
  });

  it("filters, sorts and groups are the per-environment ones, applied before the merge and the count", async () => {
    const paper = await world("paper", { full: true }), live = await world("live", { full: true });
    const result = read({ filters: [{ field: "name", op: "EQ", value: "Zulu own" }], group_by: ["health"] }, { paper, live });
    expect(result.page.authorized_filtered_count).toBe(2);
    expect(result.items.map(r => r.environment).sort()).toEqual(["live", "paper"]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].unique_row_count).toBe(2);
    // a stage that exists in one environment only narrows the other to a true zero
    const stage = read({ stage_filter: ["LIVE"] }, { paper, live });
    expect(stage.environment_coverage!.find(c => c.environment === "paper")).toMatchObject({ availability: "INCLUDED", authorized_filtered_count: 0 });
    expect(stage.items.every(r => r.environment === "live")).toBe(true);
  });

  it("the emitted body is the published ALL shape and is stable for equal input", async () => {
    const paper = await world("paper", { full: true }), live = await world("live", { full: true });
    const a = read({}, { paper, live }), b = read({}, { paper, live });
    expect(a).toEqual(b);
    expect(managerDatasetResponse.safeParse(a).success).toBe(true);
    expect(a.environment).toBe("ALL");
    expect(a.selected_window).toBeNull();
    expect(a.scores.reason_code).toBe("RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED");
    // the single-environment body stays free of the ALL keys
    const single = queryManagerModel(paper.scope, paper.doc, { environment: "paper" }, codec(), "FLEET");
    expect("environment_coverage" in single).toBe(false);
    expect(single.items.every(row => !("environment" in row))).toBe(true);
  });

  it("maps a failed environment read to a closed reason, never a message", () => {
    const code = (c: ConstructorParameters<typeof ExecutionReadScopeError>[0]) => managerAllReasonOf(new ExecutionReadScopeError(c, 503));
    expect(code("EXECUTION_READ_NOT_AVAILABLE")).toBe("NOT_AVAILABLE_TO_VIEWER");
    expect(code("EXECUTION_READ_POLICY_PENDING")).toBe("POLICY_PENDING");
    expect(code("EXECUTION_READ_FIELD_POLICY_PENDING")).toBe("POLICY_PENDING");
    expect(code("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED")).toBe("PUBLICATION_NOT_QUALIFIED");
    expect(code("EXECUTION_READ_ACCESS_CHANGED")).toBe("CHANGED_DURING_READ");
    expect(code("EXECUTION_READ_SCOPE_LIMIT")).toBe("SCOPE_LIMIT_EXCEEDED");
    expect(code("EXECUTION_READ_AUTHORITY_UNAVAILABLE")).toBe("SOURCE_UNAVAILABLE");
    expect(managerAllReasonOf(new Error("connection refused 10.0.0.1"))).toBe("SOURCE_UNAVAILABLE");
  });
});

describe("FE-CAT-3 service fan-out (mocked repository, no database)", () => {
  function service(runtime?: ExecutionManagerRuntime) {
    const f = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] });
    f.context.actor_lease_until_ms = f.context.now_ms + 60_000;
    f.context.grants.forEach(grant => { grant.environments = ["paper", "sandbox", "live"]; });
    const model = new ManagerModelService({} as Pool, f.scopes, f.config, runtime);
    const repository = (model as any).repository;
    const head = (env: ManagerEnvironmentName) => ({ revision: `TEST_ONLY:${env}-r1`, source_epoch: "TEST_ONLY:epoch", source_sequence: "1",
      projection_generation: "TEST_ONLY:g1", payload_digest: "sha256:" + "0".repeat(64), catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest });
    const doc = (env: ManagerEnvironmentName) => ({ schema_version: "portal.execution.manager-model-input.v1", workspace_id: f.principal.workspaceId, environment: env,
      profile_id: PROFILE[env], qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision: `TEST_ONLY:${env}-r1`, supersedes_revision: null,
      source_epoch: "TEST_ONLY:epoch", source_sequence: "1", projection_generation: "TEST_ONLY:g1", catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest,
      source_set_digest: "sha256:" + "0".repeat(64), as_of_ms: 1000, recorded_through_ms: 1100, facts_through_ms: 1000, observed_at_ms: 1200,
      source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, members: [{ ...member(OWN, `${env} alpha`, env), valid_from_ms: 0 }], facts: [] });
    const headSpy = vi.spyOn(repository, "head").mockImplementation((async (_w: string, env: ManagerEnvironmentName) => env === "live" ? null : head(env)) as never);
    const docSpy = vi.spyOn(repository, "document").mockImplementation((async (_w: string, env: ManagerEnvironmentName) => doc(env)) as never);
    return { ...f, model, headSpy, docSpy, head, doc };
  }

  it("reads each environment under its own profile and scope; a head-less environment is typed, not a failure of the whole read", async () => {
    const s = service();
    const result = await s.model.read(s.principal, "FLEET", { environment: "ALL" });
    // Every environment uses its own profile; contributing heads are checked
    // again after fan-out, before the final composed authority confirmation.
    expect([...new Set(s.headSpy.mock.calls.map(call => `${call[1]}|${call[2]}`))]).toEqual(["paper|" + PROFILE.paper, "sandbox|" + PROFILE.sandbox, "live|" + PROFILE.live]);
    expect(result.environment).toBe("ALL");
    expect(result.items.map(row => row.environment)).toEqual(["paper", "sandbox"]);
    expect(result.environment_coverage!.map(c => [c.environment, c.availability, c.reason_code])).toEqual([
      ["paper", "INCLUDED", null], ["sandbox", "INCLUDED", null], ["live", "UNAVAILABLE", "PUBLICATION_NOT_QUALIFIED"]]);
    expect(result.quality.completeness).toBe("PARTIAL");
  });

  it("keeps ALL v1 at exactly three configured defaults with four installed profiles",async()=>{
    const extra="TEST_ONLY:paper-second",profilesFor=vi.fn((_workspace:string,environment:string)=>
      environment==="paper"?[extra,PROFILE.paper]:[PROFILE[environment as ManagerEnvironmentName]]);
    const runtime={profilesFor,economicSourceFor:()=>undefined,recalculationFor:()=>undefined} as unknown as ExecutionManagerRuntime;
    const s=service(runtime),result=await s.model.read(s.principal,"FLEET",{environment:"ALL"});
    expect(result.environment_coverage).toHaveLength(3);expect(result.environment_coverage!.map(value=>value.environment)).toEqual(["paper","sandbox","live"]);
    expect([...new Set(s.headSpy.mock.calls.map(call=>`${call[1]}|${call[2]}`))]).toEqual([
      `paper|${PROFILE.paper}`,`sandbox|${PROFILE.sandbox}`,`live|${PROFILE.live}`]);
    expect("profile_id" in result).toBe(false);expect(s.headSpy.mock.calls.some(call=>call[2]===extra)).toBe(false);
    await expect(s.model.read(s.principal,"FLEET",{environment:"ALL",profile_id:extra})).rejects.toMatchObject({status:400});
  });

  it("selects either installed Paper exactly and rejects a cursor borrowed from the other profile",async()=>{
    const extra="TEST_ONLY:paper-second",runtime={profilesFor:(_workspace:string,environment:string)=>environment==="paper"?[extra,PROFILE.paper]:[],
      economicSourceFor:()=>undefined,recalculationFor:()=>undefined} as unknown as ExecutionManagerRuntime;
    const s=service(runtime);
    s.docSpy.mockImplementation((async(_workspace:string,environment:ManagerEnvironmentName,profile:string)=>({...s.doc(environment),profile_id:profile,
      members:[{...member(OWN,"First",environment),valid_from_ms:0},{...member(PEER,"Second",environment),valid_from_ms:0}]})) as never);
    const first=await s.model.read(s.principal,"FLEET",{environment:"paper",limit:1});
    expect(first.profile_id).toBe(PROFILE.paper);expect(first.page.next_cursor).toBeTruthy();
    const second=await s.model.read(s.principal,"FLEET",{environment:"paper",profile_id:extra,limit:1});
    expect(second.profile_id).toBe(extra);expect(s.docSpy.mock.calls.at(-1)?.slice(0,3)).toEqual([s.principal.workspaceId,"paper",extra]);
    await expect(s.model.read(s.principal,"FLEET",{environment:"paper",profile_id:extra,limit:1,after:first.page.next_cursor})).rejects.toMatchObject({status:400});
    s.headSpy.mockClear();
    await expect(s.model.read(s.principal,"FLEET",{environment:"paper",profile_id:"TEST_ONLY:not-installed"})).rejects.toMatchObject({status:404});
    expect(s.headSpy).not.toHaveBeenCalled();
  });

  it("does not pick an installed Paper when the pinned default is absent",async()=>{
    const runtime={profilesFor:()=>["TEST_ONLY:paper-a","TEST_ONLY:paper-b"]} as unknown as ExecutionManagerRuntime;
    const s=service(runtime);s.config.EXECUTION_EDGE_PAPER_PROFILE_ID="";
    await expect(s.model.read(s.principal,"FLEET",{environment:"paper"})).rejects.toMatchObject({status:503});
    expect(s.headSpy).not.toHaveBeenCalled();
  });

  it("a profile that is not configured is typed NOT_CONFIGURED without touching the repository", async () => {
    const s = service();
    (s.config as { EXECUTION_EDGE_SANDBOX_PROFILE_ID?: string }).EXECUTION_EDGE_SANDBOX_PROFILE_ID = "";
    const result = await s.model.read(s.principal, "FLEET", { environment: "ALL" });
    expect(result.environment_coverage!.find(c => c.environment === "sandbox")).toMatchObject({ availability: "UNAVAILABLE", reason_code: "NOT_CONFIGURED" });
    expect([...new Set(s.headSpy.mock.calls.map(call => call[1]))]).toEqual(["paper", "live"]);
  });

  it("refuses ALL on any surface but the Fleet, with a window, or for another workspace, before any environment is read", async () => {
    const s = service();
    await expect(s.model.read(s.principal, "PORTFOLIO", { environment: "ALL" }, "p1")).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 400 });
    await expect(s.model.read(s.principal, "FUND", { environment: "ALL" })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 400 });
    await expect(s.model.read(s.principal, "FLEET", { environment: "ALL", window: "30D" })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 400 });
    await expect(s.model.read(s.principal, "FLEET", { environment: "ALL", sort: [{ field: "net_pnl", direction: "asc" }] })).rejects.toMatchObject({ status: 400 });
    await expect(s.model.read(s.principal, "FLEET", { environment: "ALL", workspace_id: "other" })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(s.headSpy).not.toHaveBeenCalled();
    expect(s.docSpy).not.toHaveBeenCalled();
  });

  it("a TEST_ONLY document is never served: every environment is typed and the read fails as the single read does", async () => {
    const s = service();
    s.docSpy.mockImplementation((async () => ({ qualification: "TEST_ONLY" })) as never);
    s.headSpy.mockImplementation((async (_w: string, env: ManagerEnvironmentName) => ({ revision: `TEST_ONLY:${env}-r1`, source_epoch: "e", source_sequence: "1",
      projection_generation: "TEST_ONLY:g1", payload_digest: "sha256:" + "0".repeat(64), catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest })) as never);
    await expect(s.model.read(s.principal, "FLEET", { environment: "ALL" })).rejects.toMatchObject({ status: 503 });
    expect(s.docSpy).toHaveBeenCalledTimes(3);
  });

  it("does not release earlier Paper rows after a grant is revoked during a later environment read", async () => {
    const s = service();
    s.docSpy.mockImplementation((async (_w: string, environment: ManagerEnvironmentName) => {
      if (environment === "sandbox") s.context.grants[0].revoked_at_ms = s.context.now_ms;
      return s.doc(environment);
    }) as never);
    await expect(s.model.read(s.principal, "FLEET", { environment: "ALL" })).rejects.toMatchObject({ status: 404 });
    expect(s.docSpy.mock.calls[0][1]).toBe("paper");
  });

  it.each(["revision", "payload_digest", "projection_generation"] as const)(
    "refuses an earlier contributing head whose %s changed during later I/O", async field => {
      const s = service();
      let changed = false;
      s.headSpy.mockImplementation((async (_w: string, environment: ManagerEnvironmentName) => {
        if (environment === "live") { changed = true; return null; }
        const value = s.head(environment);
        return environment === "paper" && changed ? { ...value, [field]: "TEST_ONLY:changed" } : value;
      }) as never);
      await expect(s.model.read(s.principal, "FLEET", { environment: "ALL" })).rejects.toMatchObject({
        code: "EXECUTION_READ_ACCESS_CHANGED", status: 409,
      });
    });

  it("retains the earlier recalculation dependency until the whole read is ready", async () => {
    let changed = false;
    const runtime = { economicSourceFor: () => undefined, recalculationFor: () => ({
      snapshot: async (document: ManagerModelDocument) => ({ document, key: "TEST_ONLY:calculation" }),
      unchanged: async (document: ManagerModelDocument) => document.environment !== "paper" || !changed,
    }) } as unknown as ExecutionManagerRuntime;
    const s = service(runtime);
    s.headSpy.mockImplementation((async (_w: string, environment: ManagerEnvironmentName) => {
      if (environment === "live") { changed = true; return null; }
      return s.head(environment);
    }) as never);
    await expect(s.model.read(s.principal, "FLEET", { environment: "ALL" })).rejects.toMatchObject({
      code: "EXECUTION_READ_ACCESS_CHANGED", status: 409,
    });
  });

  it("rechecks an earlier numeric Score after later awaits and the final Core confirmation", async () => {
    let active = true;
    const accepts = vi.fn(() => active);
    const runtime = { scoreFence: { accepts }, recalculationFor: () => undefined, economicSourceFor: () => undefined } as unknown as ExecutionManagerRuntime;
    const s = service(runtime);
    s.docSpy.mockImplementation((async (_w: string, environment: ManagerEnvironmentName) => {
      const document = s.doc(environment) as ManagerModelDocument;
      if (environment !== "paper") return document;
      const score = JSON.parse(readFileSync(resolve(
        process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"),
        "fixtures/execution-manager-score.synthetic.valid.json"), "utf8")).value;
      score.provenance.scope = { workspace_id: document.workspace_id, environment, profile_id: document.profile_id,
        catalogue_digest: document.catalogue_digest };
      score.provenance.source_revision = document.revision;
      score.provenance.source_set_digest = document.source_set_digest;
      score.provenance.binding.subject_id = OWN.alpha_id;
      score.provenance.binding.tuple_population_digest = managerScorePopulationDigest(document.members);
      score.provenance.binding.partition_digest = accessDigest(partition("paper"));
      document.precomputed_scores = [score];
      document.facts = [{ ...fact(OWN, "nav", "1000", "paper", "current_nav"), effective_at_ms: 1000, recorded_at_ms: 1000 }];
      return document;
    }) as never);
    // The first response proves this test really admitted the numeric Score,
    // rather than testing an empty publication list.
    const ready = await s.model.read(s.principal, "FLEET", { environment: "ALL" });
    expect(ready.items.find(row => row.environment === "paper")!.metrics.score?.value).toBe("73.3");
    const confirmations = s.access.confirmReadContext.mock.calls.length;
    s.access.confirmReadContext.mockClear();
    s.access.confirmReadContext.mockImplementation(async () => {
      if (s.access.confirmReadContext.mock.calls.length === confirmations) active = false;
      return s.context;
    });
    await expect(s.model.read(s.principal, "FLEET", { environment: "ALL" })).rejects.toMatchObject({
      code: "EXECUTION_READ_ACCESS_CHANGED", status: 409,
    });
    expect(accepts).toHaveBeenCalled();
  });

  it("performs one final current-Core confirmation and refuses a session that expires there", async () => {
    const s = service();
    await s.model.read(s.principal, "FLEET", { environment: "ALL" });
    const confirmations = s.access.confirmReadContext.mock.calls.length;
    s.access.confirmReadContext.mockClear();
    s.access.confirmReadContext.mockImplementation(async () => s.access.confirmReadContext.mock.calls.length === confirmations ?
      { ...s.context, actor_lease_until_ms: s.context.now_ms } : s.context);
    await expect(s.model.read(s.principal, "FLEET", { environment: "ALL" })).rejects.toMatchObject({
      code: "EXECUTION_READ_NOT_AVAILABLE", status: 404,
    });
    expect(s.access.confirmReadContext).toHaveBeenCalledTimes(confirmations);
  });

  it("keeps generic composition same-binding and limits the ALL exception to distinct Fleet environment scopes", async () => {
    const s = service();
    const scope = (environment: ManagerEnvironmentName, action: "alpha.read" | "business.read_all" = "alpha.read") =>
      s.scopes.authorize(s.principal, { environment, profileId: PROFILE[environment] }, { action, dataset: {
        dataset_id: "alpha_fleet_overview", source_revision: `TEST_ONLY:${environment}-r1`, projection_generation: "TEST_ONLY:g1",
        catalogue_revision: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, window: null,
      } });
    const paper = await scope("paper"), sandbox = await scope("sandbox"), read = vi.fn(async () => "never");
    await expect(s.scopes.deliverScopedTogether([paper, sandbox], read)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    await expect(s.scopes.deliverFleetEnvironments([paper, paper], read)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    await expect(s.scopes.deliverFleetEnvironments([await scope("paper", "business.read_all")], read))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    const foreign = await world("live", { full: true });
    await expect(s.scopes.deliverFleetEnvironments([foreign.scope], read)).rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(read).not.toHaveBeenCalled();
  });
});
