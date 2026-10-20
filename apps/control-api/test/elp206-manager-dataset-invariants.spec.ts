/**
 * BE-P1 (UXM-07 conformance matrix MD-1..MD-8): producer invariants of the Manager dataset body that the published
 * JSON Schema cannot state. The runtime (Zod) refuses to emit a violating body; the schema carries the finite part.
 * Pure component tests over the canonical TEST_ONLY fixtures: no database, no source, no runtime authority.
 * MD-5 (negative zero) is the owner's option C (2026-10-20): canonical zero on emit, limited to the Manager dataset and series
 * responses; the producer refuses a body that still carries a signed zero (BE-CLAUDE-2026-10-20/BE-P1.md).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { managerDatasetResponse, managerMoneyFields } from "../src/execution-v2/manager-model.contract";
import { MANAGER_DATASET_MONEY_KEYS, MANAGER_NEGATIVE_ZERO_CODE, canonicalManagerZero, canonicalizeManagerDatasetZero,
  canonicalizeManagerSeriesZero } from "../src/execution-v2/manager-dataset-invariants";
import { managerP1Options } from "../src/execution-v2/manager-query-p1.contract";
import { managerQueryOptions } from "../src/execution-v2/manager-query-p1";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixtureValue = (name: string): Json => JSON.parse(readFileSync(resolve(contracts, "fixtures", name), "utf8")).value;
const clone = <T,>(value: T): T => structuredClone(value);

const partition = (currency: string, tag: string): Json => ({ economic_domain: "PAPER", currency,
  basis: "TEST_ONLY:net-ledger", native_profile_ref: `TEST_ONLY:paper-ledger-${tag}`, domain_proof_ref: "TEST_ONLY:not-economic-authority" });

/** The rows fixture grown to two rows: A = the fixture row (USDT, one partition); B = two currencies, so no headline. */
function rich(): Json {
  const body = fixtureValue("execution-manager-dataset.rows.synthetic.valid.json");
  const rowA = body.items[0], rowB = clone(rowA);
  rowB.row_key = '["TEST_ONLY:alpha-b","TEST_ONLY:av-b","TEST_ONLY:portfolio"]';
  rowB.alpha_id = "TEST_ONLY:alpha-b"; rowB.alpha_version_id = "TEST_ONLY:av-b";
  Object.assign(rowB.children[0], { alpha_id: "TEST_ONLY:alpha-b", alpha_version_id: "TEST_ONLY:av-b", deployment_id: "TEST_ONLY:deployment-b" });
  const usdt = clone(rowA.metrics.net_pnl), eur = { ...clone(rowA.metrics.net_pnl), currency: "EUR", value: "-12.5" };
  const absent = { ...clone(rowA.metrics.allocation), reason_code: "MULTI_CURRENCY_NO_SINGLE_TOTAL" };
  rowB.metrics.net_pnl = clone(absent); rowB.metrics.unrealized_pnl = clone(absent);
  rowB.economic_partitions = [{ partition: partition("USDT", "usdt"), metrics: { net_pnl: usdt } },
    { partition: partition("EUR", "eur"), metrics: { net_pnl: eur } }];
  body.items = [rowA, rowB];
  body.page = { limit: 100, returned_count: 2, authorized_filtered_count: 2, next_cursor: null, previous_cursor: null };
  body.groups = [{ key: [{ field: "portfolio_id", value: "TEST_ONLY:portfolio" }], unique_row_count: 2,
    totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY",
    economic_partitions: [{ partition: partition("USDT", "usdt"), metrics: { net_pnl: clone(usdt) } },
      { partition: partition("EUR", "eur"), metrics: { net_pnl: clone(eur) } }] }];
  body.capital_statements = [{ partition: partition("USDT", "usdt"), metrics: { balance_total: clone(usdt) } },
    { partition: partition("EUR", "eur"), metrics: { balance_total: clone(eur) } }];
  return body;
}
const messages = (body: unknown): string[] => {
  const parsed = managerDatasetResponse.safeParse(body);
  return parsed.success ? [] : parsed.error.issues.map(issue => issue.message);
};

describe("BE-P1 Manager dataset producer invariants (MD-1..MD-8)", () => {
  it("accepts every canonical dataset fixture and the rich two-currency page", () => {
    for (const name of ["execution-manager-dataset.synthetic.valid.json", "execution-manager-dataset.rows.synthetic.valid.json",
      "execution-manager-dataset.all-window.synthetic.valid.json"]) expect(messages(fixtureValue(name)), name).toEqual([]);
    expect(messages(rich())).toEqual([]);
  });
  it("keeps the money-key list of the invariant module equal to the contract's", () => {
    expect([...MANAGER_DATASET_MONEY_KEYS]).toEqual([...managerMoneyFields]);
  });

  describe("MD-1 page counts", () => {
    it.each([
      ["returned_count below the rows", (b: Json) => { b.page.returned_count = 1; }, "MANAGER_PAGE_RETURNED_COUNT_MISMATCH"],
      ["returned_count above the rows", (b: Json) => { b.page.returned_count = 3; b.page.authorized_filtered_count = 3; b.page.next_cursor = "n"; }, "MANAGER_PAGE_RETURNED_COUNT_MISMATCH"],
      ["more rows than the limit", (b: Json) => { b.page.limit = 1; }, "MANAGER_PAGE_RETURNED_OVER_LIMIT"],
      ["more rows than the filtered query holds", (b: Json) => { b.page.authorized_filtered_count = 1; b.page.next_cursor = "n"; }, "MANAGER_PAGE_RETURNED_OVER_FILTERED"],
      ["no cursor either way but fewer rows than the filtered query", (b: Json) => { b.page.authorized_filtered_count = 5; }, "MANAGER_PAGE_CURSOR_MISSING"],
    ])("refuses %s", (_name, change, code) => {
      const body = rich(); change(body);
      expect(messages(body)).toContain(code);
    });
    it("accepts a middle page (cursors both ways), a last page (previous only) and an empty past-the-end page", () => {
      const middle = rich(); middle.page = { limit: 2, returned_count: 2, authorized_filtered_count: 9, next_cursor: "n", previous_cursor: "p" };
      expect(messages(middle)).toEqual([]);
      const last = rich(); last.page = { limit: 2, returned_count: 2, authorized_filtered_count: 4, next_cursor: null, previous_cursor: "p" };
      expect(messages(last)).toEqual([]);
      const pastEnd = fixtureValue("execution-manager-dataset.synthetic.valid.json");
      pastEnd.page = { limit: 2, returned_count: 0, authorized_filtered_count: 4, next_cursor: null, previous_cursor: null };
      expect(messages(pastEnd)).toEqual([]);
    });
  });

  describe("MD-2 / MD-3 partitions", () => {
    it.each([
      ["capital_statements", (b: Json) => b.capital_statements],
      ["a row's economic_partitions", (b: Json) => b.items[1].economic_partitions],
      ["a group's economic_partitions", (b: Json) => b.groups[0].economic_partitions],
    ])("refuses a EUR figure inside a USDT partition and a repeated partition in %s", (_name, list) => {
      const currency = rich(); const first = list(currency)[0];
      first.metrics[Object.keys(first.metrics)[0]].currency = "EUR";
      expect(messages(currency)).toContain("MANAGER_PARTITION_CURRENCY_MISMATCH");
      const repeated = rich(); const entries = list(repeated); entries.push(clone(entries[0]));
      expect(messages(repeated)).toContain("MANAGER_PARTITION_DUPLICATE");
    });
    it("identifies a partition by domain, currency, basis and native profile, not by its proof or its metrics", () => {
      const body = rich();
      const twin = clone(body.capital_statements[0]);
      twin.partition.domain_proof_ref = "TEST_ONLY:other-proof"; twin.metrics.balance_total.value = "1";
      body.capital_statements.push(twin);
      expect(messages(body)).toContain("MANAGER_PARTITION_DUPLICATE");
      const other = rich(); const sibling = clone(other.capital_statements[0]);
      sibling.partition.native_profile_ref = "TEST_ONLY:paper-ledger-second";
      other.capital_statements.push(sibling);
      expect(messages(other)).toEqual([]);
    });
    it("lets a dimensionless metric (no currency) sit in any partition", () => {
      const body = rich();
      body.capital_statements[0].metrics.balance_total = { ...clone(body.capital_statements[0].metrics.balance_total), unit: "RATIO", currency: null };
      expect(messages(body)).toEqual([]);
    });
  });

  describe("MD-4 a preset the source does not publish carries no window", () => {
    const fixtureOptions = () => fixtureValue("execution-manager-dataset.rows.synthetic.valid.json").query_options;
    it("refuses NOT_PUBLISHED with bounds and accepts METRIC_SPECIFIC with bounds", () => {
      const options = fixtureOptions();
      expect(managerP1Options.safeParse(options).success).toBe(true);
      const bounded = clone(options); bounded.window.presets[0].resolved = { from_ms: 1, to_ms: 2 };
      expect(managerP1Options.safeParse(bounded).success).toBe(false);
      const published = clone(options);
      published.window.presets[1] = { ...published.window.presets[1], resolved: { from_ms: 1, to_ms: 31 * 86_400_000 }, data_state: "METRIC_SPECIFIC", reason_code: null };
      expect(managerP1Options.safeParse(published).success).toBe(true);
    });
    it("the producer helper emits null bounds for an unpublished preset even when as_of is long after the epoch", () => {
      const options = fixtureOptions();
      const asOf = 1_800_000_000_000;
      const emitted = managerQueryOptions({ asOf, canSearchName: options.search.fields.includes("name"), sortFields: options.sort_fields,
        groupFields: options.group_fields, metricKeys: options.metric_keys, facts: [] });
      expect(emitted.window.presets.map(p => [p.value, p.data_state, p.resolved])).toEqual([
        ["7D", "NOT_PUBLISHED", null], ["30D", "NOT_PUBLISHED", null], ["90D", "NOT_PUBLISHED", null], ["ALL", "NOT_PUBLISHED", null]]);
    });
  });

  describe("MD-6 / MD-7 rows and groups", () => {
    it("refuses a repeated row_key even when the rows differ", () => {
      const body = rich(); body.items[1].row_key = body.items[0].row_key;
      expect(messages(body)).toContain("MANAGER_ROW_KEY_DUPLICATE");
    });
    it("refuses a repeated group, a field twice in one key, a field the options do not offer and a count above the filtered count", () => {
      const twice = rich(); twice.groups.push(clone(twice.groups[0]));
      expect(messages(twice)).toContain("MANAGER_GROUP_DUPLICATE");
      const field = rich(); field.groups[0].key.push({ field: "portfolio_id", value: "TEST_ONLY:other" });
      expect(messages(field)).toContain("MANAGER_GROUP_KEY_FIELD_DUPLICATE");
      const offered = rich(); offered.query_options.group_fields = ["alpha_id"]; offered.query_options.sort_fields = offered.query_options.sort_fields.filter((k: string) => k !== "portfolio_id");
      expect(messages(offered)).toContain("MANAGER_GROUP_FIELD_NOT_OFFERED");
      const over = rich(); over.groups[0].unique_row_count = 10;
      expect(messages(over)).toContain("MANAGER_GROUP_COUNT_OVER_FILTERED");
    });
    it("a group key field is one of the eight groupable fields (enum), not any text", () => {
      const body = rich(); body.groups[0].key[0].field = "name";
      expect(managerDatasetResponse.safeParse(body).success).toBe(false);
    });
    it("accepts stage groups that overlap by membership (a row may sit in two groups)", () => {
      const body = rich();
      body.groups = ["PAPER", "SANDBOX"].map(stage => ({ ...clone(body.groups[0]), key: [{ field: "stage_presence", value: stage }], unique_row_count: 2 }));
      expect(messages(body)).toEqual([]);
    });
  });

  describe("MD-8 a row headline is one partition's figure, never a cross-partition total", () => {
    it("refuses a USDT headline above a EUR partition that publishes the same key", () => {
      const body = rich(); body.items[1].metrics.net_pnl = clone(body.items[0].metrics.net_pnl);
      body.items[1].metrics.net_pnl.value = "1";
      expect(messages(body)).toContain("MANAGER_HEADLINE_NOT_A_PARTITION_FIGURE");
    });
    it("refuses a headline that names a currency on a row with no partition at all", () => {
      const body = rich(); body.items[1].economic_partitions = [];
      body.items[1].metrics.net_pnl = clone(body.items[0].metrics.net_pnl);
      expect(messages(body)).toContain("MANAGER_HEADLINE_NOT_A_PARTITION_FIGURE");
    });
    it("accepts the pinned-partition shape: the headline is the pinned partition's figure while other currencies are listed", () => {
      const body = rich(); const pinned = body.items[1].economic_partitions[1].metrics.net_pnl;
      body.items[1].metrics.net_pnl = clone(pinned);
      expect(messages(body)).toEqual([]);
    });
    it("accepts a headline with no currency (absence has no currency to mix)", () => {
      const body = rich();
      expect(body.items[1].metrics.net_pnl.currency).toBeNull();
      expect(messages(body)).toEqual([]);
    });
  });
});

describe("MD-5 canonical zero on emit (owner decision C, 2026-10-20)", () => {
  /** A body that carries a signed zero in every position the producer builds. */
  function signed(zero: string): Json {
    const body = rich();
    for (const metric of [body.items[0].metrics.net_pnl, body.items[0].economic_partitions[0].metrics.net_pnl,
      body.groups[0].economic_partitions[0].metrics.net_pnl, body.capital_statements[0].metrics.balance_total]) { metric.value = zero; metric.denominator = zero; }
    body.scores.raw = { value: zero, status: "available" }; body.scores.composition = { value: zero, status: "provisional" };
    body.scores.direct_nav = { value: zero, status: "available" };
    return body;
  }
  it.each([["-0", "0"], ["-0.0", "0.0"], ["-0.00", "0.00"], ["-0.000000000000000000", "0.000000000000000000"]])("rewrites %s as %s everywhere, keeping the scale", (zero, emitted) => {
    const body = signed(zero), out = canonicalizeManagerDatasetZero(body);
    const metrics = [out.items[0].metrics.net_pnl, out.items[0].economic_partitions[0].metrics.net_pnl,
      out.groups[0].economic_partitions[0].metrics.net_pnl, out.capital_statements[0].metrics.balance_total];
    for (const metric of metrics) expect([metric.value, metric.denominator]).toEqual([emitted, emitted]);
    expect([out.scores.raw.value, out.scores.composition.value, out.scores.direct_nav.value]).toEqual([emitted, emitted, emitted]);
    expect(JSON.stringify(out)).not.toMatch(/"-0(?:\.0+)?"/);
    expect(messages(out)).toEqual([]);
    // The input is not edited (a metric object may be a stored source fact), and a second pass changes nothing.
    expect(body.items[0].metrics.net_pnl.value).toBe(zero);
    expect(canonicalizeManagerDatasetZero(out)).toEqual(out);
  });
  it("touches nothing else: not a non-zero, not a positive zero, not a null, not any other field", () => {
    const body = rich(); body.items[0].metrics.net_pnl.denominator = "-0.10"; body.items[0].metrics.net_pnl.value = "-10.00";
    body.items[1].economic_partitions[1].metrics.net_pnl.value = "-0.000001";
    const out = canonicalizeManagerDatasetZero(body);
    expect(out).toEqual(body);
    expect(out.items[0].metrics.net_pnl.value).toBe("-10.00");
    for (const value of ["0", "0.00", "-0.5", "-1", "100", "-100.00", "-0.0001", "-10"]) expect(canonicalManagerZero(value), value).toBe(value);
    expect(canonicalManagerZero(null)).toBeNull();
    // An unchanged metric is the same object (no copy), so a body with no signed zero costs nothing.
    expect(out.items[0].metrics.net_pnl).toBe(body.items[0].metrics.net_pnl);
  });
  const places: Array<[string, (b: Json, zero: string) => void]> = [
    // The headline is one partition's figure (MD-8), so the two always move together.
    ["row headline and partition value", (b, z) => { b.items[0].metrics.net_pnl.value = z; b.items[0].economic_partitions[0].metrics.net_pnl.value = z; }],
    ["row headline and partition denominator", (b, z) => { b.items[0].metrics.net_pnl.denominator = z; b.items[0].economic_partitions[0].metrics.net_pnl.denominator = z; }],
    ["group partition value", (b, z) => { b.groups[0].economic_partitions[0].metrics.net_pnl.value = z; }],
    ["capital statement value", (b, z) => { b.capital_statements[0].metrics.balance_total.value = z; }],
    ["raw score summary", (b, z) => { b.scores.raw = { value: z, status: "available" }; }],
    ["composition score summary", (b, z) => { b.scores.composition = { value: z, status: "provisional" }; }],
    ["direct NAV score summary", (b, z) => { b.scores.direct_nav = { value: z, status: "available" }; }],
  ];
  it.each(["-0", "-0.0", "-0.00", "-0.000000000000000000"])("the response parse refuses a body that still carries %s, in every position, with its stated code", zero => {
    expect(MANAGER_NEGATIVE_ZERO_CODE).toBe("MANAGER_DECIMAL_NEGATIVE_ZERO");
    expect(messages(signed(zero))).toContain(MANAGER_NEGATIVE_ZERO_CODE);
    for (const [name, set] of places) {
      const one = rich(); set(one, zero);
      expect(messages(one), name).toContain(MANAGER_NEGATIVE_ZERO_CODE);
    }
  });
  it("accepts a positive zero, a scaled positive zero and a signed non-zero in every position", () => {
    for (const value of ["0", "0.00", "-0.01", "-12.5", "-100"]) {
      for (const [name, set] of places) { const one = rich(); set(one, value); expect(messages(one), `${name} ${value}`).toEqual([]); }
    }
  });
  it("applies to a series point and nothing else of the series", () => {
    const entry = (...values: string[]) => ({ subject: { subject_type: "FUND", subject_id: "w" }, state: "AVAILABLE",
      points: values.map((value, i) => ({ ts_ms: i, value })), other: { value: "-0" } });
    const body = { series: [entry("-0", "-0.00", "0", "-0.5"), entry("-1")], note: "-0" };
    const out = canonicalizeManagerSeriesZero(body);
    expect(out.series[0].points.map(p => p.value)).toEqual(["0", "0.00", "0", "-0.5"]);
    expect(out.series[0].points.map(p => p.ts_ms)).toEqual([0, 1, 2, 3]);
    expect(out.series[1].points).toEqual(body.series[1].points);
    expect(out.series[0].other).toEqual({ value: "-0" }); expect(out.note).toBe("-0");
    expect(body.series[0].points[0].value).toBe("-0");
    expect(canonicalizeManagerSeriesZero(out)).toEqual(out);
  });
});
