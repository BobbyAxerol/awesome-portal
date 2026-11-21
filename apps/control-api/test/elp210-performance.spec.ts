/** ELP2-10 pure component regressions. Synthetic authority / mocked storage,
 * not measured TS/DL coexistence, source qualification or a production SLO. */
import type { Pool } from "pg";
import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { projectionRowVisible } from "../src/execution-v2/read-projection";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import { queryManagerModel } from "../src/execution-v2/manager-model";
import type { ManagerFact, ManagerMetric, ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { KeysetCursorCodec } from "../src/query/cursor";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";

const NOW = 1_800_000_000_000;
const anchors = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id"] as const;
const tuples = [OWN, PEER, PRIVATE];
type Tuple = typeof OWN;
const partition = () => ({ economic_domain: "PAPER" as const, currency: "USDT", basis: "TEST_ONLY:net-ledger",
  native_profile_ref: "TEST_ONLY:paper-ledger", domain_proof_ref: "TEST_ONLY:domain" });
const metric = (patch: Partial<ManagerMetric> = {}): ManagerMetric => ({ value: "100.000000000000000001",
  unit: "MONEY", currency: "USDT", basis: partition().basis, window: null, denominator: null,
  methodology_ref: "TEST_ONLY:method", availability: "AVAILABLE", reason_code: null,
  quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
  provenance_refs: ["TEST_ONLY:fact"], calculation_revision: "TEST_ONLY:calculation", policy_revision: "TEST_ONLY:policy", ...patch });
const fact = (kind: ManagerFact["kind"], patch: Partial<ManagerMetric> = {}): ManagerFact => ({
  fact_id: `TEST_ONLY:${kind}`, revision: "TEST_ONLY:fact-r1", source_receipt_ref: "TEST_ONLY:not-source-proof",
  tuple: { ...OWN }, partition: partition(), economic_account_ref: "TEST_ONLY:economic",
  ownership_partition_ref: "TEST_ONLY:ownership", kind, metric: metric(patch),
  effective_at_ms: NOW - 100, recorded_at_ms: NOW - 50, classification: "ECONOMIC",
  transfer_pair_ref: null, counterpart_portfolio_id: null,
});
function document(): ManagerModelDocument {
  return { schema_version: "portal.execution.manager-model-input.v1", workspace_id: "TEST_ONLY-product-workspace",
    environment: "paper", profile_id: "PAPER_BINANCE_USDM", qualification: "TEST_ONLY", family_id: "alpha_fleet_overview",
    revision: "TEST_ONLY:model-r1", supersedes_revision: null, source_epoch: "TEST_ONLY:epoch", source_sequence: "1",
    projection_generation: "TEST_ONLY:g1", catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest,
    source_set_digest: accessDigest(tuples), as_of_ms: NOW - 100, recorded_through_ms: NOW - 50,
    facts_through_ms: NOW - 100, observed_at_ms: NOW,
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [{ tuple: { ...OWN }, stage: "PAPER", name: "TEST_ONLY:own", owner_user_id: "TEST_ONLY:research-owner",
      lifecycle: "ACTIVE", venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding",
      assignment_revision: "TEST_ONLY:assignment", owner_revision: "TEST_ONLY:owner", binding_revision: "TEST_ONLY:binding",
      valid_from_ms: NOW - 1000, valid_to_ms: null }], facts: [fact("net_pnl")] };
}
async function scoped(full = false) {
  const fixture = productReadFixture({ full, fields: [...BUSINESS_READ_FIELDS] });
  const doc = document();
  const scope = await fixture.scopes.authorize(fixture.principal,
    { environment: "paper", profileId: doc.profile_id }, { action: full ? "business.read_all" : "alpha.read",
      dataset: { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
        catalogue_revision: doc.catalogue_digest, window: null } });
  return { fixture, scope, doc };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function repository(options?: { maximumFlights: number }) {
  const query = vi.fn();
  const pool = { query } as unknown as Pool;
  return { query, model: options === undefined ? new ManagerModelRepository(pool) : new ManagerModelRepository(pool, options) };
}
const key = ["TEST_ONLY-product-workspace", "paper", "PAPER_BINANCE_USDM", "TEST_ONLY:model-r1"] as const;
function rows(doc = document()) { return { rows: [{ payload: doc, payload_digest: accessDigest(doc) }] }; }

describe("ELP2-10 indexed tuple predicate preserves authorization semantics (TEST_ONLY)", () => {
  // Exhaust every nonempty projection of each published tuple. The oracle scans
  // the full population; the implementation can index only complete rows.
  const projections = tuples.flatMap((tuple, tupleIndex) => Array.from({ length: 31 }, (_, n) => {
    const mask = n + 1;
    const row = Object.fromEntries(anchors.filter((_, index) => (mask & (1 << index)) !== 0).map(a => [a, tuple[a]]));
    const matches = tuples.filter(t => Object.entries(row).every(([a, value]) => t[a as keyof Tuple] === value));
    return { label: `${tupleIndex}:${mask}`, row, expected: matches.length > 0 && matches.every(t => t.alpha_id === OWN.alpha_id) };
  }));
  it.each(projections)("agrees with all-matches population oracle for $label", async ({ row, expected }) => {
    const { scope } = await scoped();
    expect(projectionRowVisible(scope, row)).toBe(expected);
  });
  it.each(anchors)("rejects a complete correlated tuple with unknown %s", async axis => {
    const { scope } = await scoped();
    expect(projectionRowVisible(scope, { ...OWN, [axis]: "TEST_ONLY:unknown" })).toBe(false);
  });
  it.each([
    { row: { ...OWN, strategy_id: "strategy-own" }, expected: true, label: "consistent strategy" },
    { row: { ...OWN, strategy_id: "strategy-peer" }, expected: false, label: "contradictory complete strategy" },
    { row: { alpha_id: OWN.alpha_id, strategy_id: "strategy-peer" }, expected: false, label: "contradictory partial strategy" },
    { row: { strategy_id: "strategy-own" }, expected: true, label: "qualified strategy lineage" },
    { row: { strategy_id: "strategy-peer" }, expected: false, label: "hidden strategy" },
    { row: { strategy_id: OWN.alpha_id }, expected: false, label: "namespace equality is not lineage" },
    { row: { ...OWN, strategy_id: "TEST_ONLY:unknown" }, expected: false, label: "unknown strategy" },
    { row: { ...OWN, strategy_id: 1 }, expected: false, label: "nonstring strategy" },
    { row: { ...OWN, strategy_id: null }, expected: true, label: "null optional strategy" },
    { row: { ...OWN, strategy_id: undefined }, expected: true, label: "undefined optional strategy" },
    { row: {}, expected: false, label: "unanchored aggregate" },
    { row: null, expected: false, label: "null" },
    { row: [], expected: false, label: "array" },
    { row: "own", expected: false, label: "scalar" },
    { row: { alpha_id: OWN.alpha_id, deployment_id: null }, expected: true, label: "null partial anchor" },
    { row: { alpha_id: OWN.alpha_id, deployment_id: 1 }, expected: false, label: "nonstring partial anchor" },
  ])("preserves $label handling", async ({ row, expected }) => {
    const { scope } = await scoped();
    expect(projectionRowVisible(scope, row)).toBe(expected);
  });
  it.each([...anchors, "strategy_id"])("does not invoke an accessor at %s", async axis => {
    const { scope } = await scoped();
    const row = { ...OWN }, getter = vi.fn(() => OWN.alpha_id);
    Object.defineProperty(row, axis, { enumerable: true, get: getter });
    expect(projectionRowVisible(scope, row)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  it("ignores inherited anchors rather than treating prototype data as authority", async () => {
    const { scope } = await scoped();
    expect(projectionRowVisible(scope, Object.create(OWN))).toBe(false);
  });
  it("does not invoke unrelated properties or reject allowed non-enumerable data anchors", async () => {
    const { scope } = await scoped();
    const row = Object.defineProperties({}, Object.fromEntries(anchors.map(a => [a, { value: OWN[a], enumerable: false }])));
    const getter = vi.fn(() => { throw new Error("UNRELATED_GETTER"); });
    Object.defineProperty(row, "unrelated", { enumerable: true, get: getter });
    expect(projectionRowVisible(scope, row)).toBe(true);
    expect(getter).not.toHaveBeenCalled();
  });
  it("whole-business access still rejects unknown complete and unanchored rows", async () => {
    const { scope } = await scoped(true);
    expect(projectionRowVisible(scope, PEER)).toBe(true);
    expect(projectionRowVisible(scope, { portfolio_id: OWN.portfolio_id })).toBe(true);
    expect(projectionRowVisible(scope, { ...OWN, account_id: "TEST_ONLY:unknown" })).toBe(false);
    expect(projectionRowVisible(scope, { total: "100" })).toBe(false);
  });
  it("records a paired linear-oracle/indexed diagnostic without claiming a production latency budget", async () => {
    const population = Array.from({ length: 256 }, (_, n): Tuple => ({ alpha_id: `TEST_ONLY:a${n}`,
      alpha_version_id: `TEST_ONLY:v${n}`, portfolio_id: `TEST_ONLY:p${n}`,
      deployment_id: `TEST_ONLY:d${n}`, account_id: `TEST_ONLY:c${n}` }));
    const f = productReadFixture({ full: true });
    const resources = population.flatMap(tuple => [
      { kind: "ALPHA" as const, id: tuple.alpha_id }, { kind: "ALPHA_VERSION" as const, id: tuple.alpha_version_id },
      { kind: "PORTFOLIO" as const, id: tuple.portfolio_id }, { kind: "DEPLOYMENT" as const, id: tuple.deployment_id },
      { kind: "ACCOUNT" as const, id: tuple.account_id }]);
    const original = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => ({ ...await original(request), tuples: population, resources,
      current_linkage: { qualification: "TEST_ONLY", revision: "TEST_ONLY:paired-linkage", provenance_ref: "TEST_ONLY:not-source-proof",
        pairs: population.map(tuple => ({ alpha_id: tuple.alpha_id, portfolio_id: tuple.portfolio_id })) },
      strategy_lineage: { qualification: "TEST_ONLY", revision: "TEST_ONLY:paired-strategies", provenance_ref: "TEST_ONLY:not-source-proof", pairs: [] } }));
    const relation = f.context.relationsFor(f.principal.user.userId);
    f.context.relationsFor = () => ({ ...relation, roots: { root: resources } });
    const doc = document();
    const scope = await f.scopes.authorize(f.principal, { environment: "paper", profileId: doc.profile_id },
      { action: "business.read_all", dataset: { dataset_id: doc.family_id, source_revision: doc.revision,
        projection_generation: doc.projection_generation, catalogue_revision: doc.catalogue_digest, window: null } });
    const inputs = population.flatMap(tuple => [{ ...tuple }, { ...tuple, account_id: "TEST_ONLY:unknown" }]);
    const reference = (row: Tuple) => {
      let matched = false;
      for (const tuple of population) {
        if (!anchors.every(axis => tuple[axis] === row[axis])) continue;
        matched = true;
      }
      return matched;
    };
    // Exclude one-time scope compilation from steady read-side timing. Both
    // paths use identical rows and preserve their full result sequence.
    projectionRowVisible(scope, inputs[0]); reference(inputs[0]);
    const run = (predicate: (row: Tuple) => boolean) => {
      const results: boolean[] = [], start = performance.now();
      for (let repeat = 0; repeat < 4; repeat++) for (const row of inputs) results.push(predicate(row));
      return { results, elapsed_ms: performance.now() - start };
    };
    const linear = run(reference), indexed = run(row => projectionRowVisible(scope, row));
    expect(indexed.results).toEqual(linear.results);
    expect(indexed.results.filter(Boolean)).toHaveLength(1024);
    expect(accessDigest(indexed.results)).toBe(accessDigest(linear.results));
    console.info(JSON.stringify({ proof: "ELP2_10_TEST_ONLY_PAIRED_TUPLE_DIAGNOSTIC", population_rows: population.length,
      input_rows: inputs.length, repetitions: 4, authorized_results: 1024, result_digest: accessDigest(indexed.results),
      input_digest: accessDigest(inputs), reference_linear_ms: linear.elapsed_ms, indexed_ms: indexed.elapsed_ms,
      qualification: "PURE_COMPONENT_NOT_PRODUCTION_SLO_OR_TS_DL_COEXISTENCE" }));
  });
});

describe("ELP2-10 Manager document finite in-flight coalescing (mocked SQL)", () => {
  it("serves 20 simultaneous exact-key readers with one SQL and detached results", async () => {
    const { model, query } = repository();
    const pending = deferred<ReturnType<typeof rows>>(); query.mockReturnValue(pending.promise);
    const reads = Array.from({ length: 20 }, () => model.document(...key));
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([...key]);
    pending.resolve(rows());
    const values = await Promise.all(reads);
    expect(new Set(values).size).toBe(20);
    values[0]!.members[0].name = "TEST_ONLY:mutated-waiter";
    values[0]!.facts[0].metric.value = "0";
    expect(values[1]).toEqual(document());
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("caps all pending readers at 32 across exact-key followers and independent flights", async () => {
    const { model, query } = repository(); const pending = deferred<ReturnType<typeof rows>>();
    query.mockReturnValue(pending.promise);
    const reads = Array.from({ length: 32 }, (_, n) => model.document(key[0], key[1], key[2], `TEST_ONLY:r${n % 4}`));
    await expect(model.document(key[0], key[1], key[2], "TEST_ONLY:r0")).rejects.toThrow("MANAGER_READ_CAPACITY_EXCEEDED");
    expect(query).toHaveBeenCalledTimes(4);
    pending.resolve(rows());
    expect(await Promise.all(reads)).toHaveLength(32);
    // A settled batch releases readers as well as unique flight reservations.
    query.mockResolvedValue(rows()); expect(await model.document(...key)).toEqual(document());
    expect(query).toHaveBeenCalledTimes(5);
  });
  it("releases all pending-reader reservations after a shared query rejection", async () => {
    const { model, query } = repository(); const pending = deferred<ReturnType<typeof rows>>();
    query.mockReturnValueOnce(pending.promise);
    const observed = Promise.allSettled(Array.from({ length: 32 }, () => model.document(...key)));
    await expect(model.document(...key)).rejects.toThrow("MANAGER_READ_CAPACITY_EXCEEDED");
    expect(query).toHaveBeenCalledTimes(1);
    pending.reject(new Error("TEST_ONLY:FOLLOWER_FAILURE"));
    expect((await observed).every(result => result.status === "rejected")).toBe(true);
    query.mockResolvedValue(rows()); expect(await model.document(...key)).toEqual(document());
    expect(query).toHaveBeenCalledTimes(2);
  });
  it.each([0, 1, 2, 3])("does not coalesce a differing key axis %i", async axis => {
    const { model, query } = repository();
    const pending = deferred<ReturnType<typeof rows>>(); query.mockReturnValue(pending.promise);
    const different: [string, string, string, string] = [...key]; different[axis] = "TEST_ONLY:different";
    const a = model.document(...key), b = model.document(...different);
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map(call => call[1])).toEqual([[...key], different]);
    pending.resolve(rows()); await Promise.all([a, b]);
  });
  it("uses tuple-safe keys rather than delimiter-concatenation aliases", async () => {
    const { model, query } = repository();
    const pending = deferred<ReturnType<typeof rows>>(); query.mockReturnValue(pending.promise);
    const first = model.document("a|b", "c", "d", "e"), second = model.document("a", "b|c", "d", "e");
    await Promise.resolve(); expect(query).toHaveBeenCalledTimes(2);
    pending.resolve(rows()); await Promise.all([first, second]);
  });
  it("removes a successful flight: later reads hit SQL, with no settled TTL cache", async () => {
    const { model, query } = repository(); query.mockResolvedValue(rows());
    const first = await model.document(...key);
    first!.facts[0].metric.value = "0";
    expect(await model.document(...key)).toEqual(document());
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("coalesces missing rows but does not negative-cache after completion", async () => {
    const { model, query } = repository(); const pending = deferred<{ rows: [] }>();
    query.mockReturnValueOnce(pending.promise);
    const first = model.document(...key), second = model.document(...key);
    await Promise.resolve(); expect(query).toHaveBeenCalledTimes(1);
    pending.resolve({ rows: [] }); expect(await Promise.all([first, second])).toEqual([null, null]);
    query.mockResolvedValue(rows()); expect(await model.document(...key)).toEqual(document());
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("shares a query failure, releases its slot and permits an exact-key retry", async () => {
    const { model, query } = repository({ maximumFlights: 1 });
    const pending = deferred<ReturnType<typeof rows>>(); query.mockReturnValueOnce(pending.promise);
    const observed = Promise.allSettled([model.document(...key), model.document(...key)]);
    await Promise.resolve(); expect(query).toHaveBeenCalledTimes(1);
    pending.reject(new Error("TEST_ONLY:SQL_FAILURE"));
    const result = await observed;
    expect(result.map(value => value.status)).toEqual(["rejected", "rejected"]);
    for (const value of result) if (value.status === "rejected") expect(value.reason.message).toBe("TEST_ONLY:SQL_FAILURE");
    query.mockResolvedValue(rows()); expect(await model.document(...key)).toEqual(document());
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("reserves capacity before I/O starts, admits same-key waiters and recovers on settle", async () => {
    const { model, query } = repository({ maximumFlights: 1 });
    const pending = deferred<ReturnType<typeof rows>>(); query.mockReturnValueOnce(pending.promise);
    const first = model.document(...key), same = model.document(...key);
    await expect(model.document(key[0], key[1], key[2], "TEST_ONLY:r2")).rejects.toThrow("MANAGER_READ_CAPACITY_EXCEEDED");
    expect(query).toHaveBeenCalledTimes(1);
    pending.resolve(rows()); await Promise.all([first, same]);
    query.mockResolvedValue(rows()); await model.document(key[0], key[1], key[2], "TEST_ONLY:r2");
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("the default cap is four distinct flights, not four same-key waiters", async () => {
    const { model, query } = repository(); const pending = deferred<ReturnType<typeof rows>>();
    query.mockReturnValue(pending.promise);
    const reads = Array.from({ length: 4 }, (_, n) => model.document(key[0], key[1], key[2], `TEST_ONLY:r${n}`));
    reads.push(model.document(key[0], key[1], key[2], "TEST_ONLY:r0"));
    await expect(model.document(key[0], key[1], key[2], "TEST_ONLY:r4")).rejects.toThrow("MANAGER_READ_CAPACITY_EXCEEDED");
    expect(query).toHaveBeenCalledTimes(4);
    pending.resolve(rows()); await Promise.all(reads);
  });
  it.each([0, -1, 0.5, 17, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, undefined, null])(
    "rejects invalid maximumFlights %s", value => {
      expect(() => repository({ maximumFlights: value as number })).toThrow("MANAGER_READ_LIMIT_INVALID");
    });
  it.each([1, 4, 16])("accepts the bounded maximumFlights %i", maximumFlights => {
    expect(() => repository({ maximumFlights })).not.toThrow();
  });
  it("does not pin current head inside document coalescing", async () => {
    const { model, query } = repository(); query.mockResolvedValue({ rows: [{ revision: "TEST_ONLY:head" }] });
    await Promise.all([model.head(key[0], key[1], key[2]), model.head(key[0], key[1], key[2])]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("execution_manager_model_heads");
  });
  it("removes a rejected integrity flight", async () => {
    const { model, query } = repository({ maximumFlights: 1 });
    query.mockResolvedValueOnce({ rows: [{ payload: document(), payload_digest: `sha256:${"0".repeat(64)}` }] });
    await expect(model.document(...key)).rejects.toThrow("MANAGER_PROJECTION_DIGEST_MISMATCH");
    query.mockResolvedValue(rows()); expect(await model.document(...key)).toEqual(document());
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("bounds serialized payload before parse/digest and releases the rejected flight", async () => {
    const { model, query } = repository({ maximumFlights: 1 });
    query.mockResolvedValueOnce({ rows: [{ payload: { oversized: "x".repeat(8 * 1024 * 1024) }, payload_digest: "unused" }] });
    await expect(model.document(...key)).rejects.toThrow("MANAGER_PROJECTION_LIMIT");
    query.mockResolvedValue(rows()); expect(await model.document(...key)).toEqual(document());
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("does not preserve a malformed document in the flight map", async () => {
    const { model, query } = repository({ maximumFlights: 1 });
    query.mockResolvedValueOnce({ rows: [{ payload: { schema_version: "INVALID_TEST_ONLY" }, payload_digest: "unused" }] });
    await expect(model.document(...key)).rejects.toThrow();
    query.mockResolvedValue(rows()); expect(await model.document(...key)).toEqual(document());
  });
});

describe("ELP2-10 methodology availability is independent from capital/cost truth (TEST_ONLY)", () => {
  const codec = () => new KeysetCursorCodec({ activeKeyId: "test", keys: { test: "TEST_ONLY-elp210-manager-cursor-key-32bytes" }, now: () => NOW / 1000 });
  it("T10-01/09 never turns deposit, withdrawal or budget changes into trading profit", async () => {
    const { scope, doc } = await scoped();
    doc.facts = ([ ["opening_economic_capital", "1000"], ["added_funds", "500"], ["returned_capital", "200"],
      ["current_nav", "1300"], ["net_pnl", "0"], ["realized_pnl", "0"], ["actual_fees", "0"] ] as const)
      .map(([kind, value]) => fact(kind, { value }));
    doc.facts.push({ ...fact("current_budget", { value: "800" }), classification: "BUDGET" });
    const response = queryManagerModel(scope, doc, { environment: "paper" }, codec());
    expect(response.items[0].metrics.net_pnl).toMatchObject({ value: "0", availability: "AVAILABLE" });
    const statement = response.capital_statements[0].metrics;
    for (const [kind, value] of [["added_funds", "500"], ["returned_capital", "200"], ["current_nav", "1300"],
      ["current_budget", "800"], ["realized_pnl", "0"]]) expect(statement[kind]).toMatchObject({ value, availability: "AVAILABLE" });
    expect(response.funding_bucket_pnl).toEqual({ value: null, reason_code: "LOT_ATTRIBUTION_METHOD_NOT_APPROVED" });
    doc.facts = doc.facts.filter(f => !["net_pnl", "realized_pnl"].includes(f.kind));
    const unknown = queryManagerModel(scope, doc, { environment: "paper" }, codec());
    expect(unknown.items[0].metrics.net_pnl).toMatchObject({ value: null, reason_code: "SOURCE_FACTS_NOT_PUBLISHED" });
  });
  it.each(["net_pnl", "unrealized_pnl", "return_30d_pct"] as const)("withholds %s without a published methodology", async kind => {
    const { scope, doc } = await scoped();
    doc.facts = [fact(kind, { methodology_ref: null })];
    const response = queryManagerModel(scope, doc, { environment: "paper" }, codec());
    expect(response.items[0].metrics[kind]).toMatchObject({ value: null, availability: "UNAVAILABLE", reason_code: "METHODOLOGY_NOT_PUBLISHED" });
  });
  it.each(["realized_pnl", "unrealized_pnl"] as const)("withholds statement %s without methodology", async kind => {
    const { scope, doc } = await scoped(); doc.facts = [fact(kind, { methodology_ref: null })];
    const response = queryManagerModel(scope, doc, { environment: "paper" }, codec());
    expect(response.capital_statements[0].metrics[kind]).toMatchObject({ value: null, reason_code: "METHODOLOGY_NOT_PUBLISHED" });
  });
  it("retains independent exact capital and fees when performance methodology is missing", async () => {
    const { scope, doc } = await scoped();
    doc.facts = [fact("net_pnl", { methodology_ref: null }), fact("current_nav", { methodology_ref: null }),
      fact("opening_economic_capital", { methodology_ref: null }), fact("actual_fees", { methodology_ref: null, value: "0" })];
    const response = queryManagerModel(scope, doc, { environment: "paper" }, codec());
    expect(response.items[0].metrics.net_pnl).toMatchObject({ value: null, reason_code: "METHODOLOGY_NOT_PUBLISHED" });
    for (const kind of ["current_nav", "opening_economic_capital"])
      expect(response.capital_statements[0].metrics[kind]).toMatchObject({ value: "100.000000000000000001", availability: "AVAILABLE" });
    expect(response.capital_statements[0].metrics.actual_fees).toMatchObject({ value: "0", availability: "AVAILABLE", reason_code: null });
  });
  it("retains source-published performance when methodology is present", async () => {
    const { scope, doc } = await scoped();
    const response = queryManagerModel(scope, doc, { environment: "paper" }, codec());
    expect(response.items[0].metrics.net_pnl).toMatchObject({ value: "100.000000000000000001", availability: "AVAILABLE", methodology_ref: "TEST_ONLY:method" });
  });
});
