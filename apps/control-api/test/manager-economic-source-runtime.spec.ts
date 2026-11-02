/** Synthetic owning mapper ONLY. These tests exercise real dataset/series
 * callers; they do not assert PM/Edge source commissioning. */
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { accessDigest } from "../src/execution-v2/access-policy";
import { ManagerEconomicSourceRuntime, type ManagerEconomicSourceInstallation, type ManagerEconomicSourceRequest }
  from "../src/execution-v2/manager-economic-source-runtime";
import { managerModelDocument, type ManagerFact, type ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { managerPartitionTotals, managerTupleKey, queryManagerModel } from "../src/execution-v2/manager-model";
import { deriveSeriesObservations, deriveSeriesObservationsWithEconomicSource } from "../src/execution-v2/manager-series-observation";
import { materializeManagerSeries } from "../src/execution-v2/manager-series-materializer";
import { ManagerSeriesStore } from "../src/execution-v2/manager-series.store";
import { ManagerSeriesRuntime } from "../src/execution-v2/manager-series-runtime";
import { ExecutionManagerRuntime } from "../src/execution-v2/manager-runtime";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { loadPublicationCommissioning } from "../src/execution-v2/publication-adapter";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { KeysetCursorCodec } from "../src/query/cursor";
import { OWN, PEER, PRIVATE, productReadFixture } from "./elp2-product-read.fixture";
import type { Pool, PoolClient } from "pg";
import type { ManagerProjectionSource } from "../src/execution-v2/manager-consumer";

const T = 1_800_000_000_000, HASH = `sha256:${"a".repeat(64)}`, NS = "TEST_ONLY:owner-source";
const PARTITION = { economic_domain: "PAPER" as const, currency: "USDT", basis: "TEST_ONLY:net-ledger",
  native_profile_ref: "TEST_ONLY:source-profile", domain_proof_ref: "TEST_ONLY:domain" };
const assignments: Record<string, string> = { "TEST_ONLY:own": "TEST_ONLY:a", "TEST_ONLY:peer": "TEST_ONLY:a", "TEST_ONLY:private": "TEST_ONLY:b" };
const identity = (id: string) => ({ namespace: NS, source_id: id });
function document(workspace = "TEST_ONLY:workspace", at = T, revision = "TEST_ONLY:r1"): ManagerModelDocument {
  const tuples = [OWN, PEER, PRIVATE], ids = Object.keys(assignments);
  const facts: ManagerFact[] = tuples.map((tuple, n) => ({ fact_id: ids[n], revision: "TEST_ONLY:f1", source_receipt_ref: "TEST_ONLY:receipt",
    tuple, partition: PARTITION, economic_account_ref: `TEST_ONLY:economic-${assignments[ids[n]]}`,
    ownership_partition_ref: `TEST_ONLY:ownership-${assignments[ids[n]]}`, kind: "net_pnl",
    metric: { value: "14", unit: "MONEY", currency: PARTITION.currency, basis: PARTITION.basis, window: null, denominator: null,
      methodology_ref: "TEST_ONLY:source-method", availability: "AVAILABLE", reason_code: null,
      quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
      provenance_refs: ["TEST_ONLY:source"], calculation_revision: "TEST_ONLY:source-calc", policy_revision: "TEST_ONLY:source-policy" },
    effective_at_ms: at, recorded_at_ms: at, classification: "ECONOMIC", transfer_pair_ref: null, counterpart_portfolio_id: null }));
  return managerModelDocument.parse({ schema_version: "portal.execution.manager-model-input.v1", workspace_id: workspace, environment: "paper",
    profile_id: "PAPER_BINANCE_USDM", qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision,
    supersedes_revision: null, source_epoch: "TEST_ONLY:epoch", source_sequence: "1", projection_generation: "TEST_ONLY:g1",
    catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest(facts),
    as_of_ms: at, recorded_through_ms: at, facts_through_ms: at, observed_at_ms: at,
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, facts,
    members: tuples.map(tuple => ({ tuple, stage: "PAPER", name: "TEST_ONLY:Alpha", owner_user_id: "TEST_ONLY:owner", lifecycle: "ACTIVE",
      venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding",
      assignment_revision: "TEST_ONLY:assignment", owner_revision: "TEST_ONLY:owner", binding_revision: "TEST_ONLY:binding",
      valid_from_ms: 0, valid_to_ms: null })) });
}
function mapped(request: ManagerEconomicSourceRequest) {
  const cut = { effective_at_ms: request.facts[0].effective_at_ms, recorded_through_ms: request.document.recorded_through_ms };
  const rows = request.facts.map(f => ({ evidence: "PROVEN_SOURCE_ROW" as const, portal_fact_id: f.fact_id,
    physical_account_ref: "TEST_ONLY:physical-hint", source_identity: identity(assignments[f.fact_id]), leaves: [`TEST_ONLY:leaf-${assignments[f.fact_id]}`],
    metric: request.metric, amount: f.metric.value!, environment: request.document.environment, currency: f.partition.currency, basis: f.partition.basis,
    cut, window: f.metric.window, economic_revision: "TEST_ONLY:e1", cashflow_revision: "TEST_ONLY:c1",
    valuation: { valuation_cutoff_ms: cut.effective_at_ms, valuation_revision: "TEST_ONLY:v1" },
    ownership: { ownership_revision: "TEST_ONLY:o1", attribution_ref: `TEST_ONLY:attribution-${assignments[f.fact_id]}`,
      assignment_digest: HASH, owner_digest: HASH,
      economic_account_ref: { state: "PROVIDED" as const, ref: f.economic_account_ref },
      ownership_partition_ref: { state: "PROVIDED" as const, ref: f.ownership_partition_ref } },
    cost_layers: { included: ["TEST_ONLY:fees", "TEST_ONLY:funding"], missing: [] as string[] }, restatement: { relation: "ORIGINAL" as const, original_ref: null } }));
  return { binding_digest: request.binding_digest, rows, selection: { expectation: { metric: request.metric, environment: request.document.environment,
    currency: request.partition.currency, basis: request.partition.basis, cut, valuation_cutoff_ms: cut.effective_at_ms, window: request.facts[0].metric.window,
    revisions: { economic: "TEST_ONLY:e1", cashflow: "TEST_ONLY:c1", valuation: "TEST_ONLY:v1", ownership: "TEST_ONLY:o1" }, restatement_relation: "ORIGINAL" },
  trust_policy: { policy_ref: "TEST_ONLY:accepted-owner-policy", accepted_namespaces: [NS] },
  census: { census_ref: "TEST_ONLY:exact-population", expected_sources: [...new Set(rows.map(r => r.source_identity.source_id))].map(identity) } } };
}
function runtime(doc = document(), overrides: Partial<ManagerEconomicSourceInstallation> = {}) {
  return new ManagerEconomicSourceRuntime({ mapping_ref: "TEST_ONLY:accepted-mapping", source_locator: "TEST_ONLY:owning-source-receipt",
    scope: { workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id }, catalogue_digest: doc.catalogue_digest,
    trust_policy: { policy_ref: "TEST_ONLY:accepted-owner-policy", accepted_namespaces: [NS] }, isCurrent: () => true, resolve: mapped, ...overrides });
}
const tupleSet = (doc: ManagerModelDocument) => new Set(doc.members.map(m => managerTupleKey(m.tuple)));
const totals = (doc: ManagerModelDocument, r?: ManagerEconomicSourceRuntime) => managerPartitionTotals(doc.facts, ["net_pnl"], tupleSet(doc),
  r ? { document: doc, runtime: r } : undefined)[0].metrics.net_pnl;

describe("owning economic source: actual dataset and series path", () => {
  it("fences source-qualified NET_PNL without a mapping while preserving independently sourced fields", () => {
    const doc = document(), facts = doc.facts, tuples = tupleSet(doc);
    const strict = managerPartitionTotals(facts, ["net_pnl", "current_nav"], tuples, undefined, true)[0].metrics;
    expect(strict.net_pnl).toMatchObject({ value: null, availability: "UNAVAILABLE", reason_code: "ECONOMIC_SOURCE_MAPPING_NOT_PUBLISHED" });
    expect(strict.current_nav).toMatchObject({ value: null, reason_code: "SOURCE_FACTS_NOT_PUBLISHED" });
    const qualified = managerPartitionTotals(facts, ["net_pnl"], tuples, { document: doc, runtime: runtime(doc) }, true)[0].metrics.net_pnl;
    expect(qualified).toMatchObject({ value: "28", availability: "AVAILABLE" });
    expect(managerPartitionTotals([], ["net_pnl"], tuples, undefined, true)).toEqual([]);
  });
  it("changes neither legacy default nor proposal status; proof-aware shared source counts once in both real callers", () => {
    const doc = document(), r = runtime(doc), legacy = totals(doc), dataset = totals(doc, r);
    expect(legacy.value).toBe("42"); expect(dataset.value).toBe("28");
    const observed = deriveSeriesObservationsWithEconomicSource(doc, r).observations.find(o => o.subject_id === doc.workspace_id && o.metric === "NET_PNL");
    expect(observed).toMatchObject({ value: dataset.value, reason_code: null });
    expect(observed!.input_digest).not.toBe(deriveSeriesObservations(doc).observations.find(o => o.subject_id === doc.workspace_id && o.metric === "NET_PNL")!.input_digest);
    expect(r.reduce(doc, PARTITION, "NET_PNL", doc.facts, tupleSet(doc)).reduction).toMatchObject({ status: "PROPOSAL_NOT_A_PRODUCER_MAPPING", collapsed_duplicate_count: 1 });
  });

  it("binds numerically identical exact decimals without accepting a changed amount", () => {
    const doc = document();
    const equivalent = runtime(doc, { resolve: req => {
      const m = mapped(req);
      m.rows[0].amount = "14.000";
      return m;
    } });
    expect(totals(doc, equivalent)).toMatchObject({ value: "28", availability: "AVAILABLE" });
    expect(deriveSeriesObservationsWithEconomicSource(doc, equivalent).observations
      .find(o => o.subject_id === doc.workspace_id && o.metric === "NET_PNL"))
      .toMatchObject({ value: "28", reason_code: null });

    const changed = runtime(doc, { resolve: req => {
      const m = mapped(req);
      m.rows[0].amount = "14.000000000000000001";
      return m;
    } });
    expect(totals(doc, changed)).toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_FACTS_NOT_BOUND" });
    expect(deriveSeriesObservationsWithEconomicSource(doc, changed).observations
      .find(o => o.subject_id === doc.workspace_id && o.metric === "NET_PNL"))
      .toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_FACTS_NOT_BOUND" });
  });

  it.each([
    ["changed same-source content", (m: ReturnType<typeof mapped>) => { m.rows[1].cost_layers.included = ["TEST_ONLY:different-content"]; }, "REPORT_SOURCE_CONFLICT"],
    ["overlapping distinct sources", (m: ReturnType<typeof mapped>) => { m.rows[2].leaves = m.rows[0].leaves; }, "REPORT_SOURCE_OVERLAP"],
    ["missing expected census", (m: ReturnType<typeof mapped>) => { m.selection.census.expected_sources.push(identity("TEST_ONLY:missing")); }, "ECONOMIC_SOURCE_MISSING"],
    ["missing costs", (m: ReturnType<typeof mapped>) => { m.rows.forEach(row => { row.cost_layers.missing = ["TEST_ONLY:borrow"]; }); }, "ECONOMIC_COST_LAYERS_MISSING"],
    ["missing ownership", (m: ReturnType<typeof mapped>) => { Object.assign(m.rows[2], { ownership: null }); }, "ECONOMIC_OWNERSHIP_MISSING"],
    ["missing valuation", (m: ReturnType<typeof mapped>) => { Object.assign(m.rows[2], { valuation: null }); }, "ECONOMIC_VALUATION_MISSING"],
    ["foreign binding", (m: ReturnType<typeof mapped>) => { m.binding_digest = HASH; }, "ECONOMIC_SOURCE_BINDING_MISMATCH"],
    ["foreign window", (m: ReturnType<typeof mapped>) => { Object.assign(m.selection.expectation, { window: { from_ms: T - 1, to_ms: T } }); }, "ECONOMIC_SOURCE_BINDING_MISMATCH"],
    ["foreign recorded cut", (m: ReturnType<typeof mapped>) => { m.selection.expectation.cut.recorded_through_ms++; }, "ECONOMIC_SOURCE_BINDING_MISMATCH"],
    ["foreign expectation currency", (m: ReturnType<typeof mapped>) => { m.selection.expectation.currency = "USD"; }, "ECONOMIC_SOURCE_BINDING_MISMATCH"],
    ["foreign source-row currency", (m: ReturnType<typeof mapped>) => { m.rows[0].currency = "USD"; }, "ECONOMIC_COMPARABILITY_MISMATCH"],
    ["foreign valuation revision", (m: ReturnType<typeof mapped>) => { m.rows[2].valuation.valuation_revision = "TEST_ONLY:other-v"; }, "ECONOMIC_COMPARABILITY_MISMATCH"],
    ["foreign fact", (m: ReturnType<typeof mapped>) => { m.rows[0].portal_fact_id = "TEST_ONLY:foreign"; }, "ECONOMIC_SOURCE_FACTS_NOT_BOUND"],
    ["unmapped owner", (m: ReturnType<typeof mapped>) => { m.rows[0].ownership.economic_account_ref.ref = "TEST_ONLY:guessed-account"; }, "ECONOMIC_SOURCE_FACTS_NOT_BOUND"],
  ] as const)("%s is the same typed absence in dataset and series", (_label, change, reason) => {
    const doc = document(), r = runtime(doc, { resolve: req => { const m = mapped(req); change(m); return m; } });
    expect(totals(doc, r)).toMatchObject({ value: null, reason_code: reason });
    expect(deriveSeriesObservationsWithEconomicSource(doc, r).observations.find(o => o.subject_id === doc.workspace_id && o.metric === "NET_PNL"))
      .toMatchObject({ value: null, reason_code: reason });
  });

  it("refuses a missing owning mapping, qualification, hidden tuple and changed current-policy; no fallback to 42", () => {
    const doc = document();
    expect(totals(doc, runtime(doc, { resolve: () => null }))).toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_MAPPING_NOT_PUBLISHED" });
    expect(totals({ ...doc, qualification: "TEST_ONLY" }, runtime(doc))).toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_DOCUMENT_NOT_BOUND" });
    expect(runtime(doc).reduce(doc, PARTITION, "NET_PNL", doc.facts, new Set([managerTupleKey(OWN)])))
      .toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_FACTS_NOT_BOUND" });
    let current = true;
    const r = runtime(doc, { isCurrent: () => current, resolve: req => { current = false; return mapped(req); } });
    expect(totals(doc, r)).toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_MAPPING_NOT_CURRENT" });
  });

  it("detaches source inputs, checks full domain proof and refuses an escaped source exception", () => {
    const doc = document(), original = JSON.stringify(doc);
    const r = runtime(doc, { resolve: req => { expect(Object.isFrozen(req.facts[0].metric)).toBe(true); return mapped(req); } });
    expect(totals(doc, r).value).toBe("28"); expect(JSON.stringify(doc)).toBe(original);
    const foreign = structuredClone(doc); foreign.facts[0].partition.domain_proof_ref = "TEST_ONLY:foreign";
    expect(totals(foreign, r).value).toBeNull();
    expect(totals(doc, runtime(doc, { resolve: () => { throw new Error("secret transport failure"); } })))
      .toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_MAPPING_REFUSED" });
  });

  it("normal authorized query routes row/group/statement totals through one adapter and never passes hidden facts", async () => {
    const f = productReadFixture({ fields: [...BUSINESS_READ_FIELDS] }), doc = document(f.principal.workspaceId), seen: ManagerEconomicSourceRequest[] = [];
    const r = runtime(doc, { resolve: request => { seen.push(request); return mapped(request); } });
    const scope = await f.scopes.authorize(f.principal, { environment: "paper", profileId: doc.profile_id }, { action: "alpha.read",
      dataset: { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
        catalogue_revision: doc.catalogue_digest, window: null } });
    const codec = new KeysetCursorCodec({ activeKeyId: "test", keys: { test: "TEST_ONLY-manager-cursor-key-32bytes-not-prod" }, now: () => T / 1000 });
    const result = queryManagerModel(scope, doc, { environment: "paper", group_by: ["portfolio_id"] }, codec,
      "FLEET", undefined, undefined, undefined, undefined, r);
    expect(result.items.length).toBeGreaterThan(0); expect(seen.length).toBeGreaterThan(0);
    expect(seen.flatMap(s => s.facts).every(fact => fact.tuple.alpha_id === OWN.alpha_id)).toBe(true);
    expect(seen.every(s => s.binding_digest.startsWith("sha256:"))).toBe(true);
  });

  it("strict authorized Fleet rows and groups cannot expose legacy NET_PNL without the owning mapping", async () => {
    const f = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] }), doc = document(f.principal.workspaceId);
    const scope = await f.scopes.authorize(f.principal, { environment: "paper", profileId: doc.profile_id }, { action: "business.read_all",
      dataset: { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
        catalogue_revision: doc.catalogue_digest, window: null } });
    const codec = new KeysetCursorCodec({ activeKeyId: "test", keys: { test: "TEST_ONLY-manager-cursor-key-32bytes-not-prod" }, now: () => T / 1000 });
    const read = (r?: ManagerEconomicSourceRuntime) => queryManagerModel(scope, doc, { environment: "paper", group_by: ["portfolio_id"] }, codec,
      "FLEET", undefined, undefined, undefined, undefined, r, true);
    const blocked = read();
    expect(blocked.items.length).toBeGreaterThan(0);
    for (const row of blocked.items) expect(row.metrics.net_pnl).toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_MAPPING_NOT_PUBLISHED" });
    for (const group of blocked.groups) for (const partition of group.economic_partitions)
      expect(partition.metrics.net_pnl).toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_MAPPING_NOT_PUBLISHED" });
    const allowed = read(runtime(doc));
    expect(allowed.items.some(row => row.metrics.net_pnl.value !== null)).toBe(true);
    const base = { environment: "paper", limit: 1, group_by: ["portfolio_id"], group_limit: 1 };
    const first = queryManagerModel(scope, doc, base, codec, "FLEET");
    expect(first.page.next_cursor).toBeTruthy();
    expect(first.group_page?.next_cursor).toBeTruthy();
    expect(() => queryManagerModel(scope, doc, { ...base, after: first.page.next_cursor }, codec,
      "FLEET", undefined, undefined, undefined, undefined, undefined, true)).toThrow(/Query cursor does not match/);
    expect(() => queryManagerModel(scope, doc, { ...base, group_after: first.group_page!.next_cursor }, codec,
      "FLEET", undefined, undefined, undefined, undefined, undefined, true)).toThrow(/Query cursor does not match/);
  });

  it("actual Fleet service applies the proof fence when the optional runtime is absent", async () => {
    const f = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] }), doc = document(f.principal.workspaceId);
    const service = new ManagerModelService({} as Pool, f.scopes, f.config);
    const repository = (service as any).repository;
    const head = { revision: doc.revision, projection_generation: doc.projection_generation,
      catalogue_digest: doc.catalogue_digest, payload_digest: `sha256:${"b".repeat(64)}` };
    vi.spyOn(repository, "head").mockResolvedValue(head);
    vi.spyOn(repository, "document").mockResolvedValue(doc);
    const result = await service.read(f.principal, "FLEET", { environment: "paper", group_by: ["portfolio_id"] });
    expect(result.items.length).toBeGreaterThan(0);
    for (const row of result.items) expect(row.metrics.net_pnl).toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_MAPPING_NOT_PUBLISHED" });
    for (const group of result.groups) for (const partition of group.economic_partitions)
      expect(partition.metrics.net_pnl).toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_MAPPING_NOT_PUBLISHED" });
  });

  it("one request-local context resolves a binding once, freezes proof and rechecks revoke before cached reads", () => {
    const doc = document(), resolve = vi.fn(mapped), r = runtime(doc, { resolve }), read = r.forRead();
    const before = read.proofSnapshotDigest(), first = read.reduce(doc, PARTITION, "NET_PNL", doc.facts, tupleSet(doc));
    const proof = read.proofSnapshotDigest();
    expect(proof).not.toBe(before); expect(Object.isFrozen(first.reduction)).toBe(true);
    expect(read.reduce(doc, PARTITION, "NET_PNL", [...doc.facts].reverse(), tupleSet(doc))).toBe(first);
    expect(resolve).toHaveBeenCalledTimes(1); expect(read.proofSnapshotDigest()).toBe(proof);
    expect(r.proofSnapshotDigest()).toBeNull();
    r.forRead().reduce(doc, PARTITION, "NET_PNL", doc.facts, tupleSet(doc));
    expect(resolve).toHaveBeenCalledTimes(2);
    let current = true;
    const revocable = runtime(doc, { isCurrent: () => current }).forRead();
    expect(revocable.reduce(doc, PARTITION, "NET_PNL", doc.facts, tupleSet(doc)).value).toBe("28");
    current = false;
    expect(revocable.reduce(doc, PARTITION, "NET_PNL", doc.facts, tupleSet(doc)))
      .toMatchObject({ value: null, reason_code: "ECONOMIC_SOURCE_MAPPING_NOT_CURRENT" });
  });

  it.each(["all-proof", "aggregate-proof-only"] as const)("row and group cursors reject changed valid %s even when every value is unchanged", async mode => {
    const f = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] }), doc = document(f.principal.workspaceId);
    let epoch = 0;
    const r = runtime(doc, { resolve: request => {
      const value = mapped(request);
      if (mode === "all-proof" || request.facts.length > 1) {
        for (const row of value.rows) {
          row.source_identity.source_id += `:proof-${epoch}`;
          row.leaves = row.leaves.map(leaf => `${leaf}:proof-${epoch}`);
          row.economic_revision = `TEST_ONLY:e${epoch}`;
        }
        value.selection.expectation.revisions.economic = `TEST_ONLY:e${epoch}`;
        value.selection.census.census_ref = `TEST_ONLY:census-${epoch}`;
        value.selection.census.expected_sources = [...new Set(value.rows.map(row => row.source_identity.source_id))].map(identity);
      }
      return value;
    } });
    const scope = await f.scopes.authorize(f.principal, { environment: "paper", profileId: doc.profile_id }, { action: "business.read_all",
      dataset: { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
        catalogue_revision: doc.catalogue_digest, window: null } });
    const codec = new KeysetCursorCodec({ activeKeyId: "test", keys: { test: "TEST_ONLY-manager-cursor-key-32bytes-not-prod" }, now: () => T / 1000 });
    const base = { environment: "paper", limit: 1, group_by: ["portfolio_id"], group_limit: 1 };
    const read = (patch: Record<string, unknown> = {}) => queryManagerModel(scope, doc, { ...base, ...patch }, codec,
      "FLEET", undefined, undefined, undefined, undefined, r);
    const first = read();
    expect(first.page.next_cursor).toBeTruthy(); expect(first.group_page?.next_cursor).toBeTruthy();
    expect(() => read({ after: first.page.next_cursor })).not.toThrow();
    expect(() => read({ group_after: first.group_page!.next_cursor })).not.toThrow();
    epoch++;
    const fresh = read();
    expect(fresh.items.map(row => row.metrics.net_pnl.value)).toEqual(first.items.map(row => row.metrics.net_pnl.value));
    expect(fresh.groups.flatMap(group => group.economic_partitions.map(partition => partition.metrics.net_pnl.value)))
      .toEqual(first.groups.flatMap(group => group.economic_partitions.map(partition => partition.metrics.net_pnl.value)));
    expect(() => read({ after: first.page.next_cursor })).toThrow(/Query cursor does not match/);
    expect(() => read({ group_after: first.group_page!.next_cursor })).toThrow(/Query cursor does not match/);
  });

  it("never reuses legacy series points under a newly installed owning mapping", () => {
    const old = document("TEST_ONLY:workspace", T - 1000, "TEST_ONLY:r0"), doc = document(), r = runtime(doc), legacy = deriveSeriesObservations(old);
    const result = materializeManagerSeries(doc, { revisions: [legacy.marker], observations: legacy.observations },
      { windows: ["30D"], maximum_history_rows: 1000, maximum_total_points: 1000 }, r);
    expect(result.absences).toContainEqual({ reason_code: "ECONOMIC_SOURCE_HISTORY_MAPPING_CHANGED", metric: null, count: 1 });
    expect(result.publications.filter(p => p.binding.metric === "NET_PNL").every(p => p.series.points.every(point => point.value === "14" || point.value === "28"))).toBe(true);
    expect(result.current.marker.calculation_revision).toBe(r.calculation_revision);
  });

  it("economic to legacy rollback excludes economic observations instead of relabeling them", async () => {
    const old = document("TEST_ONLY:workspace", T - 1000, "TEST_ONLY:r0"), doc = document(), r = runtime(doc);
    const economic = deriveSeriesObservationsWithEconomicSource(old, r), original = JSON.stringify(economic);
    const result = materializeManagerSeries(doc, { revisions: [economic.marker], observations: economic.observations },
      { windows: ["30D"], maximum_history_rows: 1000, maximum_total_points: 1000 });
    expect(result.absences).toContainEqual({ reason_code: "ECONOMIC_SOURCE_HISTORY_MAPPING_CHANGED", metric: null, count: 1 });
    expect(result.publications.filter(p => p.binding.metric === "NET_PNL").length).toBeGreaterThan(0);
    expect(result.publications.every(p => p.series.points.every(point => point.ts_ms === T))).toBe(true);
    expect(result.publications.find(p => p.binding.subject_id === doc.workspace_id && p.binding.metric === "NET_PNL")?.series.points)
      .toEqual([{ ts_ms: T, value: "42" }]);
    expect(JSON.stringify(economic)).toBe(original);
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT observation_digest") ? [{ observation_digest: economic.observation_digest }] : [] }));
    expect(await new ManagerSeriesStore({} as Pool).recordRevision({ query } as unknown as PoolClient,
      { workspace_id: old.workspace_id, environment: old.environment, profile_id: old.profile_id }, deriveSeriesObservations(old)))
      .toBe("DIGEST_MISMATCH");
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT") || sql.includes("UPDATE"))).toBe(false);
  });

  it("mapping A to B excludes even equal-valued points and never overwrites mapping A receipts", async () => {
    const old = document("TEST_ONLY:workspace", T - 1000, "TEST_ONLY:r0"), doc = document();
    const a = runtime(doc, { mapping_ref: "TEST_ONLY:mapping-A" }), b = runtime(doc, { mapping_ref: "TEST_ONLY:mapping-B" });
    const previous = deriveSeriesObservationsWithEconomicSource(old, a), original = JSON.stringify(previous);
    const result = materializeManagerSeries(doc, { revisions: [previous.marker], observations: previous.observations },
      { windows: ["30D"], maximum_history_rows: 1000, maximum_total_points: 1000 }, b);
    expect(result.absences).toContainEqual({ reason_code: "ECONOMIC_SOURCE_HISTORY_MAPPING_CHANGED", metric: null, count: 1 });
    expect(result.publications.filter(p => p.binding.metric === "NET_PNL").length).toBeGreaterThan(0);
    expect(result.publications.every(p => p.series.points.every(point => point.ts_ms === T))).toBe(true);
    expect(result.current.marker.calculation_revision).toBe(b.calculation_revision);
    expect(JSON.stringify(previous)).toBe(original);
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT observation_digest") ? [{ observation_digest: previous.observation_digest }] : [] }));
    expect(await new ManagerSeriesStore({} as Pool, b).recordRevision({ query } as unknown as PoolClient,
      { workspace_id: old.workspace_id, environment: old.environment, profile_id: old.profile_id }, deriveSeriesObservationsWithEconomicSource(old, b)))
      .toBe("DIGEST_MISMATCH");
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT") || sql.includes("UPDATE"))).toBe(false);
  });

  it("DB history retains the stored calculator after runtime removal; undefined old markers remain legacy-only", async () => {
    const doc = document(), r = runtime(doc), economic = deriveSeriesObservationsWithEconomicSource(doc, r);
    const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("(SELECT") ? [{ ...economic.marker, calculation_revision: r.calculation_revision }] : [] }));
    const result = await new ManagerSeriesStore({ query } as unknown as Pool).history(
      { workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id },
      { floor_ms: T - 1, to_ms: T, exclude_revision: "TEST_ONLY:other", maximum_rows: 100 });
    expect(result.revisions[0].calculation_revision).toBe(r.calculation_revision);
    const old = document("TEST_ONLY:workspace", T - 1000, "TEST_ONLY:r0"), legacy = deriveSeriesObservations(old);
    expect(legacy.marker.calculation_revision).toBeUndefined();
    const materialized = materializeManagerSeries(doc, { revisions: [legacy.marker], observations: legacy.observations },
      { windows: ["30D"], maximum_history_rows: 1000, maximum_total_points: 1000 });
    expect(materialized.absences.some(a => a.reason_code === "ECONOMIC_SOURCE_HISTORY_MAPPING_CHANGED")).toBe(false);
    expect(materialized.publications.some(p => p.series.points.some(point => point.ts_ms === T - 1000))).toBe(true);
  });

  it("stores the mapping-pinned calculation revision without rewriting an existing revision", async () => {
    const doc = document(), r = runtime(doc), derived = deriveSeriesObservationsWithEconomicSource(doc, r),
      query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    const store = new ManagerSeriesStore({} as Pool, r);
    expect(await store.recordRevision({ query } as unknown as PoolClient, { workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id }, derived)).toBe("RECORDED");
    const insert = query.mock.calls.find(args => String(args[0]).includes("INSERT INTO execution_manager_series_revisions"));
    expect(insert?.[1]).toContain(r.calculation_revision);
    const existing = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT observation_digest") ? [{ observation_digest: "TEST_ONLY:old-digest" }] : [] }));
    expect(await store.recordRevision({ query: existing } as unknown as PoolClient,
      { workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id }, derived)).toBe("DIGEST_MISMATCH");
    expect(existing.mock.calls.some(([sql]) => sql.includes("INSERT") || sql.includes("UPDATE"))).toBe(false);
  });

  it("real runtime requires the same dataset/series mapper and rechecks it at the final source COMMIT fence", async () => {
    const doc = document(), r = runtime(doc), scope = { workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id };
    const now = Date.now(), artifact = { schema_version: "portal.execution.publication-commissioning.v1", scope,
      catalogue_digest: doc.catalogue_digest, adapter_id: "TEST_ONLY_NOT_SOURCE_AUTHORITY", family_ids: ["alpha_fleet_overview"], purposes: ["BUSINESS"],
      receipt_pins: { source_read: "TEST_ONLY:read", transport_trust: "TEST_ONLY:transport", privacy: "TEST_ONLY:privacy", field_policy: "TEST_ONLY:field" } };
    const bytes = JSON.stringify(artifact), commissioning = loadPublicationCommissioning(bytes,
      { artifact_sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, adapter_id: artifact.adapter_id,
        approval_ref: "TEST_ONLY_NOT_OWNER_APPROVAL", approved_at_ms: now - 1000, valid_until_ms: now + 60000 }, now);
    const pool = { options: { connectionTimeoutMillis: 1000, query_timeout: 1000 }, query: vi.fn() } as unknown as Pool;
    const series = new ManagerSeriesRuntime(pool, { windows: ["30D"], maximum_history_rows: 1000, maximum_total_points: 1000,
      maximum_backfill_revisions: 1 }, r);
    const source = { read: vi.fn(async () => null), recheck: vi.fn(async () => ({ assertCurrent: vi.fn() })), acknowledge: vi.fn(async () => undefined) };
    const partition = { scope, commissioning, source, publication: vi.fn(async () => null),
      bounds: { maximum_documents_per_tick: 1, maximum_document_bytes: 1048576, maximum_document_rows: 200,
        maximum_tick_ms: 5000, source_timeout_ms: 1000, transaction_timeout_ms: 1000, lease_ttl_ms: 2000 }, economicSource: r, series: { runtime: series } };
    const install = { trust: unqualifiedAccessTrust, partitions: [partition], cadence_ms: 1000, maximum_publication_reads: 1 };
    const core = new ExecutionManagerRuntime(pool, install);
    expect(core.economicSourceFor(scope)).toBe(r); expect(pool.query).not.toHaveBeenCalled();
    expect(() => new ExecutionManagerRuntime(pool, { ...install, partitions: [{ ...partition, economicSource: runtime(doc) }] }))
      .toThrow("MANAGER_ECONOMIC_SOURCE_SERIES_BINDING_INVALID");
    let current = true;
    const mutable = runtime(doc, { isCurrent: () => current });
    const owner = new ExecutionManagerRuntime(pool, { ...install, partitions: [{ ...partition, series: undefined, economicSource: mutable }] });
    const wrapped = (owner as unknown as { materializingSource(p: typeof partition): ManagerProjectionSource }).materializingSource({ ...partition, economicSource: mutable });
    const fence = await wrapped.recheck({ scope, document: doc, publication: {} as never, signal: new AbortController().signal });
    current = false;
    expect(() => fence.assertCurrent?.()).toThrow("MANAGER_ECONOMIC_SOURCE_MAPPING_CHANGED");
    expect(source.acknowledge).not.toHaveBeenCalled();
  });
});
