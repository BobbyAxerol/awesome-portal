/**
 * Manager dataset / metric readers against the canonical contract fixtures.
 *
 * The fixtures are read from `packages/contracts/fixtures` (through the testkit loader) so a contract change fails
 * here; every negative case is a mutation of one, never a second copy. Breadth (matrices, scale, schema agreement)
 * is in `managerDataset.conformance.test.ts`.
 */
import { afterAll, describe, expect, it } from "vitest";

import { setPath } from "../testkit/matrix";
import {
  ALL_HISTORY_WINDOW_NOT_PUBLISHED,
  MANAGER_DATASET_SCHEMA,
  MANAGER_METRIC_KEYS,
  MANAGER_STATEMENT_SCOPE,
  readManagerDataset,
  readManagerSelectedWindow,
  type ManagerDataset,
} from "./managerDataset";
import {
  absentMetric,
  clone,
  FIXTURE_ALL,
  FIXTURE_EMPTY,
  FIXTURE_METRIC,
  FIXTURE_ROWS,
  fixtureValue,
  moneyMetric,
  partition,
  removeSchemaCopy,
  richDataset,
  type Draft,
} from "./managerDataset.testbase";
import { figuresByPartition, managerMetricDecimal, readManagerMetric, readPartitionedMetricsList } from "./managerMetric";

afterAll(removeSchemaCopy);

function datasetOf(raw: unknown): ManagerDataset {
  const read = readManagerDataset(raw);
  if (read === null || read.kind !== "dataset") throw new Error("expected a dataset read");
  return read.dataset;
}

const edit = (change: (body: Draft) => void, base: () => Draft = richDataset): Draft => {
  const body = base();
  change(body);
  return body;
};

describe("fixtures", () => {
  it("reads the empty fleet dataset: authorized, pending scores, nothing in the table", () => {
    const dataset = datasetOf(fixtureValue(FIXTURE_EMPTY));
    expect(dataset.surface).toBe("FLEET");
    expect(dataset.environment).toBe("paper");
    expect(dataset.selectedWindow).toBeNull();
    expect(dataset.items).toEqual([]);
    expect(dataset.groups).toEqual([]);
    expect(dataset.capitalStatements).toEqual([]);
    expect(dataset.statementScope).toBe(MANAGER_STATEMENT_SCOPE);
    expect(dataset.page).toEqual({ limit: 100, returnedCount: 0, authorizedFilteredCount: 0, nextCursor: null, previousCursor: null });
    expect(dataset.hasMore).toBe(false);
    expect(dataset.quality).toEqual({ completeness: "PARTIAL", freshness: "STALE", reasons: ["TEST_ONLY_SOURCE_NOT_QUALIFIED"] });
    expect(dataset.scores.raw).toEqual({ kind: "absent", status: "policy_pending", reasonCode: null });
    expect(dataset.scores.regime).toEqual({ kind: "absent", status: "unavailable", reasonCode: null });
    expect(dataset.fundingBucketPnl).toEqual({ kind: "absent", reasonCode: "LOT_ATTRIBUTION_METHOD_NOT_APPROVED" });
    expect(dataset.queryOptions.metricKeys).toEqual([]);
    expect(dataset.queryOptions.unavailableFields.map((f) => f.field)).toEqual(["current_stage", "days_in_stage"]);
    expect(dataset.unreadDetails).toEqual({ scoreDetails: 0, compositionDetails: 0, regimeDetails: 0 });
  });

  it("reads the rows dataset: a published zero is a value, unavailable stays a typed absence", () => {
    const dataset = datasetOf(fixtureValue(FIXTURE_ROWS));
    const row = dataset.items[0]!;
    expect(row.rowKey).toBe('["TEST_ONLY:alpha","TEST_ONLY:av","TEST_ONLY:portfolio"]');
    expect(row.health).toBeNull();
    expect(row.stagePresence).toEqual(["PAPER"]);
    expect(row.children).toHaveLength(1);
    const pnl = row.metrics.net_pnl!;
    expect(pnl).toMatchObject({ kind: "value", exact: "0", zero: true, currency: "USDT", unit: "MONEY", availability: "AVAILABLE" });
    // The value is present but not clean: stale source cut, provisional confidence.
    expect(pnl.kind === "value" && pnl.caveats).toEqual(["NOT_FRESH", "NOT_VERIFIED"]);
    expect(row.metrics.unrealized_pnl).toMatchObject({ kind: "absent", availability: "UNAVAILABLE", reasonCode: "METHODOLOGY_NOT_PUBLISHED", copy: "Not available · METHODOLOGY_NOT_PUBLISHED" });
    expect(row.metrics.allocation).toMatchObject({ kind: "absent", unit: "NOT_PUBLISHED", currency: null, methodologyRef: null });
    // allocation is not in the partition: absent from the map, not zero.
    expect([...row.economicPartitions[0]!.metrics.keys()]).toEqual(["unrealized_pnl", "net_pnl"]);
    expect(figuresByPartition(row.economicPartitions, "allocation")).toEqual([{ partition: row.economicPartitions[0]!.partition, metric: null }]);
    expect(dataset.queryOptions.metricKeys).toEqual(["unrealized_pnl", "net_pnl", "allocation"]);
    expect(dataset.queryOptions.search).toEqual({ fields: ["name"], modes: ["PREFIX", "CONTAINS"] });
  });

  it("reads the ALL window dataset: ALL is a gap with no bounds, never a window", () => {
    const dataset = datasetOf(fixtureValue(FIXTURE_ALL));
    expect(dataset.selectedWindow).toEqual({ kind: "gap", requested: "ALL", reasonCode: ALL_HISTORY_WINDOW_NOT_PUBLISHED });
    expect(dataset.selectedWindow).not.toHaveProperty("resolved");
    expect(dataset.scores.raw).toEqual({ kind: "absent", status: "window_not_published", reasonCode: ALL_HISTORY_WINDOW_NOT_PUBLISHED });
    expect(dataset.scores.reasonCode).toBe(ALL_HISTORY_WINDOW_NOT_PUBLISHED);
    const all = dataset.queryOptions.window.presets.find((p) => p.value === "ALL")!;
    expect(all).toEqual({ value: "ALL", resolved: null, dataState: "NOT_PUBLISHED", reasonCode: ALL_HISTORY_WINDOW_NOT_PUBLISHED });
  });

  it("reads the derived-reasons metric: PARTIAL with no figure is an absence with its 33 reasons", () => {
    const metric = readManagerMetric(fixtureValue(FIXTURE_METRIC))!;
    expect(metric.kind).toBe("absent");
    expect(metric).toMatchObject({ availability: "PARTIAL", reasonCode: "STRESS_INPUTS_NOT_RETAINED_FOR_POLICY", unit: "SCORE", currency: null, methodologyRef: "qbts_prb_v1_1" });
    expect(metric.window).toEqual({ fromMs: 1000, toMs: 2000 });
    expect(metric.quality.reasons).toHaveLength(33);
    expect(metric.kind === "absent" && metric.copy).toBe("Partial, no figure published · STRESS_INPUTS_NOT_RETAINED_FOR_POLICY");
  });
});

describe("envelope", () => {
  it("another schema_version is unsupported_shape and is never read", () => {
    const body = { ...fixtureValue(FIXTURE_EMPTY), schema_version: "portal.execution.manager-dataset.v2", brand_new: 1 };
    expect(readManagerDataset(body)).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.manager-dataset.v2" });
    expect(readManagerDataset({ ...body, schema_version: undefined })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    expect(readManagerDataset({ ...body, schema_version: 3 })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });

  it("never throws: not an object, hostile getters", () => {
    for (const root of [null, undefined, 0, "x", [], () => 1, new Map()]) expect(() => readManagerDataset(root)).not.toThrow();
    expect(readManagerDataset(null)).toBeNull();
    const hostile = fixtureValue(FIXTURE_EMPTY);
    Object.defineProperty(hostile, "page", { get() { throw new Error("boom"); }, enumerable: true });
    expect(readManagerDataset(hostile)).toBeNull();
  });

  it("is closed: an unnamed key anywhere voids the read", () => {
    for (const path of [[], ["page"], ["quality"], ["lineage"], ["scores"], ["scores", "raw"], ["query_options"], ["query_options", "search"], ["query_options", "window"], ["query_policy"], ["funding_bucket_pnl"], ["items", 0], ["items", 0, "children", 0], ["items", 0, "metrics", "net_pnl"], ["items", 0, "metrics", "net_pnl", "quality"], ["items", 0, "economic_partitions", 0], ["items", 0, "economic_partitions", 0, "partition"]] as const) {
      const body = fixtureValue(FIXTURE_ROWS);
      setPath(body, [...path, "surprise"], "x");
      expect(readManagerDataset(body), path.join(".")).toBeNull();
    }
  });

  it("every required key is required", () => {
    for (const key of ["selected_window", "query_options", "page", "items", "groups", "capital_statements", "statement_scope", "scores", "lineage", "facts_through_ms", "snapshot_id"]) {
      const body = fixtureValue(FIXTURE_ROWS);
      delete body[key];
      expect(readManagerDataset(body), key).toBeNull();
    }
  });

  it("snapshot_id and the lineage refs are sha256 digests, as the schema pins them", () => {
    for (const [path, bad] of [[["snapshot_id"], "snapshot-1"], [["snapshot_id"], `sha256:${"A".repeat(64)}`], [["lineage", "revision"], "sha256:abc"], [["lineage", "source_set_ref"], ""], [["lineage", "supersedes_revision"], "rev-0"]] as const) {
      const body = fixtureValue(FIXTURE_ROWS);
      setPath(body, [...path], bad);
      expect(readManagerDataset(body), `${path.join(".")} <- ${bad}`).toBeNull();
    }
    const body = fixtureValue(FIXTURE_ROWS);
    body.lineage.supersedes_revision = `sha256:${"b".repeat(64)}`;
    expect(datasetOf(body).lineage.supersedesRevision).toBe(`sha256:${"b".repeat(64)}`);
  });

  it("the constants are constants", () => {
    for (const [key, value] of [["record_authority", "TRADING_SYSTEM"], ["source_authority", "PORTAL_PROJECTION"], ["coverage", "ALL"], ["economic_aggregation", "SUMMED"], ["statement_scope", "ALL_FILTERED"]] as const) {
      const body = fixtureValue(FIXTURE_ROWS);
      body[key] = value;
      expect(readManagerDataset(body), key).toBeNull();
    }
    const policy = fixtureValue(FIXTURE_ROWS);
    policy.query_policy.maximum_response_bytes = 2_097_152;
    expect(readManagerDataset(policy)).toBeNull();
  });

  it("counts the details arrays it does not read", () => {
    const body = fixtureValue(FIXTURE_ROWS);
    body.score_details = [{ slot: "RAW", result: "not read" }];
    body.regime_details = [{ slot: "REGIME" }, { slot: "REGIME" }];
    expect(datasetOf(body).unreadDetails).toEqual({ scoreDetails: 1, compositionDetails: 0, regimeDetails: 2 });
    body.composition_details = [{ slot: "RAW" }];
    expect(readManagerDataset(body)).toBeNull();
  });
});

describe("metric", () => {
  const base = (): Draft => fixtureValue(FIXTURE_ROWS).items[0].metrics.net_pnl;
  const read = (change: (m: Draft) => void) => { const m = base(); change(m); return readManagerMetric(m); };

  it("keeps the exact string; the number is never parsed", () => {
    const metric = read((m) => { m.value = "123456789012345678901234567890.123456789"; m.availability = "AVAILABLE"; });
    expect(metric).toMatchObject({ kind: "value", exact: "123456789012345678901234567890.123456789", zero: false });
  });

  it("refuses a JS number, an exponent, a leading zero, a negative zero, NaN-like and padded text", () => {
    for (const value of [1.5, 0, 1e21, "1e5", "1E5", "01", "00.5", ".5", "5.", "+5", "-0", "-0.00", "NaN", "Infinity", "1,000", " 1", "1 ", "", "9".repeat(129)]) {
      expect(read((m) => { m.value = value; }), JSON.stringify(value)).toBeNull();
    }
  });

  it("accepts the widest legal decimal and a negative value", () => {
    expect(read((m) => { m.value = "-0.000001"; })).toMatchObject({ exact: "-0.000001", zero: false });
    expect(read((m) => { m.value = "9".repeat(128); })).toMatchObject({ kind: "value" });
    expect(read((m) => { m.value = "0.00"; })).toMatchObject({ zero: true });
  });

  it("only AVAILABLE has a value; everything else has none and names why", () => {
    for (const availability of ["PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]) {
      expect(read((m) => { m.availability = availability; m.reason_code = "WHY"; m.value = "5"; }), `${availability} with a value`).toBeNull();
      expect(read((m) => { m.availability = availability; m.reason_code = null; m.value = null; }), `${availability} with no reason`).toBeNull();
      expect(read((m) => { m.availability = availability; m.reason_code = "WHY"; m.value = null; })).toMatchObject({ kind: "absent", availability, reasonCode: "WHY" });
    }
    expect(read((m) => { m.value = null; })).toBeNull();
    expect(read((m) => { m.availability = "OK"; })).toBeNull();
    expect(read((m) => { m.availability = "available"; })).toBeNull();
  });

  it("MONEY needs a currency; a unit other than MONEY may go without", () => {
    expect(read((m) => { m.currency = null; })).toBeNull();
    expect(read((m) => { m.unit = "SCORE"; m.currency = null; })).toMatchObject({ kind: "value", unit: "SCORE", currency: null });
  });

  it("carries denominator and methodology as published and flags a missing methodology", () => {
    const metric = read((m) => { m.denominator = "10.50"; m.methodology_ref = null; });
    expect(metric).toMatchObject({ denominator: "10.50", methodologyRef: null });
    expect(metric!.kind === "value" && metric!.caveats).toContain("NO_METHODOLOGY");
    expect(read((m) => { m.denominator = 10.5; })).toBeNull();
    expect(read((m) => { m.denominator = "1e3"; })).toBeNull();
  });

  it("bounds: provenance_refs 1..32, reasons <= 64, windows are ordered", () => {
    expect(read((m) => { m.provenance_refs = []; })).toBeNull();
    expect(read((m) => { m.provenance_refs = Array.from({ length: 33 }, (_, i) => `r${i}`); })).toBeNull();
    expect(read((m) => { m.provenance_refs = Array.from({ length: 32 }, (_, i) => `r${i}`); })).not.toBeNull();
    expect(read((m) => { m.quality.reasons = Array.from({ length: 65 }, (_, i) => `r${i}`); })).toBeNull();
    expect(read((m) => { m.quality.reasons = Array.from({ length: 64 }, (_, i) => `r${i}`); })).not.toBeNull();
    expect(read((m) => { m.window = { from_ms: 5, to_ms: 4 }; })).toBeNull();
    expect(read((m) => { m.window = { from_ms: 4, to_ms: 5 }; })).toMatchObject({ window: { fromMs: 4, toMs: 5 } });
    expect(read((m) => { m.window = { from_ms: -1, to_ms: 5 }; })).toBeNull();
    expect(read((m) => { m.window = { from_ms: 1.5, to_ms: 5 }; })).toBeNull();
  });

  it("refuses unsafe text", () => {
    for (const text of ["", "   ", "a\u0007b", "‮evil", "a​b", "x".repeat(257)]) {
      expect(read((m) => { m.basis = text; }), JSON.stringify(text)).toBeNull();
    }
  });

  it("managerMetricDecimal hands the exact original to the shared formatter", () => {
    const metric = read((m) => { m.value = "1234.56789"; })!;
    if (metric.kind !== "value") throw new Error("value expected");
    expect(managerMetricDecimal(metric, "money")).toMatchObject({ full: "1234.56789", unit: "money" });
  });
});

describe("selected_window", () => {
  const preset = (requested: unknown, resolved: unknown, reason: unknown = null) => ({ requested, resolved, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: reason });

  it("null is no window; a preset or custom request needs a resolved window; ALL has none", () => {
    expect(readManagerSelectedWindow(null)).toBeNull();
    expect(readManagerSelectedWindow(preset("30D", { from_ms: 10, to_ms: 20 }))).toEqual({ kind: "window", requested: "30D", resolved: { fromMs: 10, toMs: 20 } });
    expect(readManagerSelectedWindow(preset({ from_ms: 1, to_ms: 2 }, { from_ms: 1, to_ms: 2 }))).toEqual({ kind: "window", requested: { fromMs: 1, toMs: 2 }, resolved: { fromMs: 1, toMs: 2 } });
    expect(readManagerSelectedWindow(preset("ALL", null, ALL_HISTORY_WINDOW_NOT_PUBLISHED))).toEqual({ kind: "gap", requested: "ALL", reasonCode: ALL_HISTORY_WINDOW_NOT_PUBLISHED });
  });

  it("ALL with a window, a missing reason or the wrong reason is refused; so is a preset with none", () => {
    for (const bad of [
      preset("ALL", { from_ms: 0, to_ms: 9 }, ALL_HISTORY_WINDOW_NOT_PUBLISHED),
      preset("ALL", null, null),
      preset("ALL", null, "EXACT_METRIC_WINDOW_NOT_PUBLISHED"),
      preset("30D", null),
      preset("30D", { from_ms: 10, to_ms: 20 }, ALL_HISTORY_WINDOW_NOT_PUBLISHED),
      preset("1Y", { from_ms: 10, to_ms: 20 }),
      preset("all", null, ALL_HISTORY_WINDOW_NOT_PUBLISHED),
      { ...preset("30D", { from_ms: 10, to_ms: 20 }), selection_basis: "READ_TIME_CALCULATION" },
      { ...preset("30D", { from_ms: 10, to_ms: 20 }), extra: 1 },
      "ALL",
      [],
    ]) expect(readManagerSelectedWindow(bad), JSON.stringify(bad)).toBeUndefined();
  });

  it("a dataset with an ALL window and a numeric window score cannot be assembled: ALL reads as a gap on the dataset", () => {
    const body = fixtureValue(FIXTURE_ALL);
    body.selected_window = null;
    // window_not_published slots need a selected window.
    expect(readManagerDataset(body)).toBeNull();
  });
});

describe("partitions: no cross-currency total", () => {
  it("keeps two currencies as two entries in published order, with no total anywhere", () => {
    const dataset = datasetOf(richDataset());
    const statements = dataset.capitalStatements;
    expect(statements.map((s) => s.partition.currency)).toEqual(["USDT", "EUR"]);
    expect(figuresByPartition(statements, "balance_total").map((f) => f.metric && f.metric.kind === "value" && f.metric.exact)).toEqual(["1000.50", "900"]);
    expect(Object.keys(dataset)).not.toContain("total");
    // No key anywhere is a total or a sum (`totalsScope` is the group's scope label).
    const keys = new Set<string>();
    const walk = (node: unknown): void => {
      if (node instanceof Map) node.forEach((child, key) => { keys.add(String(key)); walk(child); });
      else if (Array.isArray(node)) node.forEach(walk);
      else if (typeof node === "object" && node !== null) for (const [key, child] of Object.entries(node)) { keys.add(key); walk(child); }
    };
    walk(dataset);
    expect([...keys].filter((key) => /^(total|sum|grand)|Total$|Sum$/i.test(key) && key !== "totalsScope" && !(MANAGER_METRIC_KEYS as readonly string[]).includes(key))).toEqual([]);
  });

  it("a row with two currencies publishes no single headline", () => {
    const dataset = datasetOf(richDataset());
    expect(dataset.items[1]!.metrics.net_pnl).toMatchObject({ kind: "absent", reasonCode: "MULTI_CURRENCY_NO_SINGLE_TOTAL" });
  });

  it("refuses a headline in one currency above a partition in another", () => {
    const body = richDataset();
    body.items[1].metrics.net_pnl = moneyMetric({ value: "87.75" });
    expect(readManagerDataset(body)).toBeNull();
    // Same currency in every partition that publishes the key: one headline is honest.
    body.items[1].economic_partitions[1].partition.currency = "USDT";
    body.items[1].economic_partitions[1].metrics.net_pnl.currency = "USDT";
    body.items[1].economic_partitions[1].partition.native_profile_ref = "TEST_ONLY:other";
    expect(readManagerDataset(body)).not.toBeNull();
  });

  it("refuses a metric whose currency is not its partition's", () => {
    const body = richDataset();
    body.capital_statements[0].metrics.balance_total = moneyMetric({ currency: "EUR" });
    expect(readManagerDataset(body)).toBeNull();
  });

  it("refuses the same partition twice (a sum would count it twice)", () => {
    const body = richDataset();
    body.capital_statements.push(clone(body.capital_statements[0]));
    expect(readManagerDataset(body)).toBeNull();
    const rowBody = richDataset();
    rowBody.items[1].economic_partitions.push(clone(rowBody.items[1].economic_partitions[0]));
    expect(readManagerDataset(rowBody)).toBeNull();
  });

  it("a metric key that is not a lower-case token cannot reach the map", () => {
    for (const key of ["__proto__", "_x", "1x", "Net_Pnl", "net pnl", "", "a".repeat(65)]) {
      const entry = [{ partition: partition("PAPER", "USDT"), metrics: Object.defineProperty({}, key, { value: moneyMetric(), enumerable: true }) }];
      expect(readPartitionedMetricsList(entry), JSON.stringify(key)).toBeNull();
    }
    expect(readPartitionedMetricsList([{ partition: partition("PAPER", "USDT"), metrics: {} }])).toHaveLength(1);
    // A well-formed token that happens to be an Object.prototype name is data in a Map, not a property of anything.
    const metrics = Object.defineProperty({}, "constructor", { value: moneyMetric(), enumerable: true });
    const read = readPartitionedMetricsList([{ partition: partition("PAPER", "USDT"), metrics }])!;
    expect([...read[0]!.metrics.keys()]).toEqual(["constructor"]);
  });

  it("an unknown economic domain is refused", () => {
    const body = richDataset();
    body.capital_statements[0].partition.economic_domain = "LIVE";
    expect(readManagerDataset(body)).toBeNull();
  });
});

describe("query_options", () => {
  it("metric keys are the closed enum and equal the keys every row carries", () => {
    expect([...MANAGER_METRIC_KEYS]).toEqual(["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value", "return_30d_pct", "score"]);
    expect(refuse((b) => { b.query_options.metric_keys.push("revenue"); })).toBe(true);
    expect(refuse((b) => { b.query_options.metric_keys = ["net_pnl", "net_pnl", "allocation"]; })).toBe(true);
    // A row that carries a key the options do not name, or lacks one they do.
    expect(refuse((b) => { delete b.items[0].metrics.allocation; })).toBe(true);
    expect(refuse((b) => { b.items[0].metrics.score = b.items[0].metrics.allocation; })).toBe(true);
    expect(refuse((b) => { b.items[0].metrics.revenue = b.items[0].metrics.allocation; })).toBe(true);
  });

  it("sort, metric, group, partition and window lists agree the way the schema writes it", () => {
    // metric_keys without the matching sort field
    expect(refuse((b) => { b.query_options.sort_fields = b.query_options.sort_fields.filter((f: string) => f !== "net_pnl"); })).toBe(true);
    // partition requirement without the metric
    expect(refuse((b) => { b.query_options.economic_partition_required_for = ["net_pnl"]; })).toBe(true);
    // independent window metric without the metric
    expect(refuse((b) => { b.query_options.window.independent_metrics = ["allocation"]; })).toBe(true);
    // group field without the sort field
    expect(refuse((b) => { b.query_options.group_fields = ["portfolio_id"]; })).toBe(true);
    // search field without sortable name
    expect(refuse((b) => { b.query_options.sort_fields = b.query_options.sort_fields.filter((f: string) => f !== "name"); })).toBe(true);
    expect(refuse((b) => { b.query_options.search.modes = ["PREFIX"]; })).toBe(true);
  });

  it("the four presets come in order, and an unpublished preset carries no bounds", () => {
    expect(refuse((b) => { b.query_options.window.presets.reverse(); })).toBe(true);
    expect(refuse((b) => { b.query_options.window.presets.pop(); })).toBe(true);
    expect(refuse((b) => { b.query_options.window.presets[0].resolved = { from_ms: 1, to_ms: 2 }; })).toBe(true);
    expect(refuse((b) => { b.query_options.window.presets[0].reason_code = null; })).toBe(true);
    expect(refuse((b) => { b.query_options.window.presets[3].reason_code = "EXACT_METRIC_WINDOW_NOT_PUBLISHED"; })).toBe(true);
    const published = richDataset();
    Object.assign(published.query_options.window.presets[0], { resolved: { from_ms: 1, to_ms: 2 }, data_state: "METRIC_SPECIFIC", reason_code: null });
    expect(datasetOf(published).queryOptions.window.presets[0]).toEqual({ value: "7D", resolved: { fromMs: 1, toMs: 2 }, dataState: "METRIC_SPECIFIC", reasonCode: null });
  });

  it("temporal mode and the constants of the options are exact", () => {
    expect(refuse((b) => { b.query_options.temporal_mode = "AS_OF"; })).toBe(true);
    expect(refuse((b) => { b.query_options.search.maximum_text_length = 161; })).toBe(true);
    expect(refuse((b) => { b.query_options.stage_environment[2].stages = ["LIVE"]; })).toBe(true);
    expect(refuse((b) => { b.query_options.unavailable_fields.reverse(); })).toBe(true);
    expect(refuse((b) => { b.query_options.window.interpretation = "READ_TIME_CALCULATION"; })).toBe(true);
  });
});

function refuse(change: (body: Draft) => void): boolean {
  return readManagerDataset(edit(change)) === null;
}

describe("page and cursor envelope", () => {
  it("returned_count is the number of rows; the page never claims more than the query has", () => {
    expect(refuse((b) => { b.page.returned_count = 1; })).toBe(true);
    expect(refuse((b) => { b.page.authorized_filtered_count = 1; })).toBe(true);
    expect(refuse((b) => { b.page.limit = 1; })).toBe(true);
    expect(refuse((b) => { b.page.limit = 0; })).toBe(true);
    expect(refuse((b) => { b.page.limit = 201; })).toBe(true);
    expect(refuse((b) => { b.page.authorized_filtered_count = 10_001; })).toBe(true);
    expect(refuse((b) => { b.page.limit = 2.5; })).toBe(true);
  });

  it("a page with no cursor either way is the whole result; with a cursor there is more", () => {
    // Both null and fewer rows than the filtered count would be a page the reader cannot honestly label "N of M".
    expect(refuse((b) => { b.page.authorized_filtered_count = 9; })).toBe(true);
    const more = edit((b) => { b.page.authorized_filtered_count = 9; b.page.next_cursor = "c3Y"; });
    expect(datasetOf(more).hasMore).toBe(true);
    expect(datasetOf(more).page).toMatchObject({ authorizedFilteredCount: 9, nextCursor: "c3Y", previousCursor: null });
    const middle = edit((b) => { b.page.authorized_filtered_count = 9; b.page.previous_cursor = "cHJldg"; });
    expect(datasetOf(middle).hasMore).toBe(false);
  });

  it("cursors are bounded opaque text: not empty, not 4097 characters, not a number", () => {
    for (const cursor of ["", "   ", "a".repeat(4097), 5, {}, "a\nb"]) {
      expect(refuse((b) => { b.page.authorized_filtered_count = 9; b.page.next_cursor = cursor; }), JSON.stringify(cursor).slice(0, 30)).toBe(true);
    }
    expect(refuse((b) => { b.page.authorized_filtered_count = 9; b.page.next_cursor = "a".repeat(4096); })).toBe(false);
  });

  it("row keys are unique", () => {
    expect(refuse((b) => { b.items[1].row_key = b.items[0].row_key; })).toBe(true);
  });
});

describe("rows, children and groups", () => {
  it("the environment pins the stages", () => {
    expect(refuse((b) => { b.items[0].stage_presence = ["LIVE"]; })).toBe(true);
    expect(refuse((b) => { b.items[0].children[0].stage = "CANARY"; })).toBe(true);
    expect(refuse((b) => { b.items[0].stage_presence = ["PAPER", "PAPER"]; })).toBe(true);
    const live = edit((b) => { b.environment = "live"; b.items[0].stage_presence = ["CANARY", "LIVE"]; b.items[0].children[0].stage = "CANARY"; b.items[1].stage_presence = ["LIVE"]; b.items[1].children[0].stage = "LIVE"; });
    expect(datasetOf(live).items[0]!.stagePresence).toEqual(["CANARY", "LIVE"]);
  });

  it("groups group by a field the options can group by, once, and cannot outnumber the query", () => {
    const dataset = datasetOf(richDataset());
    expect(dataset.groups).toHaveLength(1);
    expect(dataset.groups[0]!.key).toEqual([{ field: "portfolio_id", value: "TEST_ONLY:portfolio" }]);
    expect(dataset.groups[0]!.uniqueRowCount).toBe(2);
    expect(refuse((b) => { b.groups[0].key[0].field = "name"; })).toBe(true);
    expect(refuse((b) => { b.groups[0].unique_row_count = 3; })).toBe(true);
    expect(refuse((b) => { b.groups.push(clone(b.groups[0])); })).toBe(true);
    expect(refuse((b) => { b.groups[0].totals_scope = "PAGE"; })).toBe(true);
    expect(refuse((b) => { b.groups[0].key.push({ field: "portfolio_id", value: null }); })).toBe(true);
    expect(refuse((b) => { b.groups[0].key = [{ field: "venue", value: null }, { field: "health", value: null }, { field: "lifecycle", value: null }]; })).toBe(true);
    expect(datasetOf(edit((b) => { b.groups[0].key = [{ field: "venue", value: null }]; })).groups[0]!.key[0]!.value).toBeNull();
  });

  it("the funding bucket is the constant absence", () => {
    expect(refuse((b) => { b.funding_bucket_pnl.value = "12"; })).toBe(true);
    expect(refuse((b) => { b.funding_bucket_pnl.reason_code = "OK"; })).toBe(true);
  });
});

describe("scores", () => {
  it("a score slot has a value only when available or provisional, as an exact string", () => {
    const body = richDataset();
    body.scores.raw = { value: "0.00", status: "provisional" };
    body.scores.direct_nav = { value: "71.5", status: "available" };
    const dataset = datasetOf(body);
    expect(dataset.scores.raw).toEqual({ kind: "value", status: "provisional", exact: "0.00", zero: true, provisional: true });
    expect(dataset.scores.directNav).toMatchObject({ kind: "value", exact: "71.5", provisional: false });
    for (const bad of [{ value: 71.5, status: "available" }, { value: null, status: "available" }, { value: "7", status: "stale" }, { value: "7", status: "policy_pending" }, { value: "1e2", status: "available" }, { value: "-0", status: "available" }, { value: "7", status: "available", reason_code: null }, { value: null, status: "stale", reason_code: "X" }, { value: null, status: "no_allocation" }, { value: null, status: "ok" }]) {
      expect(refuse((b) => { b.scores.raw = bad; }), JSON.stringify(bad)).toBe(true);
    }
  });

  it("window_not_published needs a selected window and the matching reason", () => {
    const wnp = (reason: string) => ({ value: null, status: "window_not_published", reason_code: reason });
    const all = (b: Draft, reason: string) => { for (const slot of ["raw", "composition", "direct_nav"]) b.scores[slot] = wnp(reason); b.scores.reason_code = reason; };
    expect(refuse((b) => all(b, "EXACT_METRIC_WINDOW_NOT_PUBLISHED"))).toBe(true); // no selected window
    const ok = edit((b) => {
      b.selected_window = { requested: "30D", resolved: { from_ms: 1, to_ms: 2 }, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: null };
      all(b, "EXACT_METRIC_WINDOW_NOT_PUBLISHED");
    });
    expect(datasetOf(ok).scores.raw).toEqual({ kind: "absent", status: "window_not_published", reasonCode: "EXACT_METRIC_WINDOW_NOT_PUBLISHED" });
    // One slot without its window leaves scores.reason_code a non-window reason (the schema says it is a window reason only when all three are).
    const one = clone(ok);
    one.scores.composition = { value: null, status: "policy_pending" };
    one.scores.direct_nav = { value: null, status: "policy_pending" };
    expect(readManagerDataset(one)).toBeNull();
    one.scores.reason_code = "RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED";
    expect(datasetOf(one).scores.raw).toMatchObject({ status: "window_not_published" });
    // ALL would need the ALL reason; the 30D request has the exact one.
    const wrong = clone(ok);
    wrong.scores.raw.reason_code = ALL_HISTORY_WINDOW_NOT_PUBLISHED;
    expect(readManagerDataset(wrong)).toBeNull();
    // scores.reason_code must be a window reason iff a slot is window_not_published.
    const reasonOff = clone(ok);
    reasonOff.scores.reason_code = "QUALIFIED_PRECOMPUTED_SCORE";
    expect(readManagerDataset(reasonOff)).toBeNull();
    expect(refuse((b) => { b.scores.reason_code = "EXACT_METRIC_WINDOW_NOT_PUBLISHED"; })).toBe(true);
  });

  it("the regime slot never carries a value", () => {
    expect(refuse((b) => { b.scores.regime.value = "1"; })).toBe(true);
    expect(refuse((b) => { b.scores.regime.status = "supported_strongly"; })).toBe(true);
    expect(datasetOf(edit((b) => { b.scores.regime = { value: null, status: "stale", reason_code: "REGIME_IS_PER_ALPHA_OR_DEPLOYMENT_ONLY" }; })).scores.regime)
      .toEqual({ kind: "absent", status: "stale", reasonCode: "REGIME_IS_PER_ALPHA_OR_DEPLOYMENT_ONLY" });
  });
});

describe("the canonical id", () => {
  it("names the schema it reads", () => {
    expect(MANAGER_DATASET_SCHEMA).toBe(fixtureValue(FIXTURE_EMPTY).schema_version);
  });
  it("absent metrics are shaped differently from values", () => {
    const rich = datasetOf(richDataset());
    const absent = rich.items[0]!.metrics.allocation!;
    expect(absent.kind).toBe("absent");
    expect("exact" in absent).toBe(false);
    expect(absentMetric()).toBeTruthy();
  });
});
