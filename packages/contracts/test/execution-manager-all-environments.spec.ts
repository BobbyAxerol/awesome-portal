import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { managerDatasetResponse, managerModelQuery } from "../../../apps/control-api/src/execution-v2/manager-model.contract";
import { applyManagerP1Ops } from "../tooling/execution-manager-p1-fixtures.mjs";

// FE-CAT-3: the Fleet ALL lens. `environment: ALL` is NAVIGATION across separately labelled environments, never consolidated money.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const api = load("openapi/execution-manager-models.openapi.json");
const schema = load("schemas/execution-manager-dataset.v1.schema.json");
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validate = ajv.compile(schema);
const checkQuery = ajv.compile(api.components.schemas.ManagerDatasetQuery);
const valid = load("fixtures/execution-manager-dataset.all-environments.synthetic.valid.json");
const negative = load("fixtures/execution-manager-dataset.all-environments.synthetic.negative.json");
const clone = <T,>(value: T): T => structuredClone(value);
const both = (body: unknown) => ({ schema: validate(body), runtime: managerDatasetResponse.safeParse(body).success });

describe("FE-CAT-3 the ALL dataset shape", () => {
  it("publishes a TEST_ONLY ALL example that Zod and JSON Schema both accept", () => {
    expect(valid.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(valid.value), JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.parse(valid.value)).toEqual(valid.value);
    expect(valid.value.environment).toBe("ALL");
    expect(valid.value.selected_window).toBeNull();
  });

  it("keeps Paper and Live apart: two rows of one alpha in one currency, each in its own economic domain, no total", () => {
    const [paper, live] = valid.value.items;
    expect([paper.environment, live.environment]).toEqual(["paper", "live"]);
    expect(paper.alpha_id).toBe(live.alpha_id);
    expect(paper.row_key).not.toBe(live.row_key);
    expect(paper.economic_partitions.map((p: any) => [p.partition.economic_domain, p.partition.currency])).toEqual([["PAPER", "USDT"]]);
    expect(live.economic_partitions.map((p: any) => [p.partition.economic_domain, p.partition.currency])).toEqual([["ACTUAL", "USDT"]]);
    expect(valid.value.economic_aggregation).toBe("PARTITIONED_ONLY");
    // one statement per partition, never one combined USDT figure
    expect(valid.value.capital_statements.map((s: any) => s.partition.economic_domain)).toEqual(["PAPER", "ACTUAL"]);
    const text = JSON.stringify(valid.value);
    expect(text).not.toContain("3500");
  });

  it("types a missing environment and never reads COMPLETE while one is missing", () => {
    const coverage = valid.value.environment_coverage;
    expect(coverage.map((c: any) => [c.environment, c.availability])).toEqual([["paper", "INCLUDED"], ["sandbox", "UNAVAILABLE"], ["live", "INCLUDED"]]);
    expect(coverage[1]).toEqual({ environment: "sandbox", availability: "UNAVAILABLE", reason_code: "PUBLICATION_NOT_QUALIFIED", snapshot_id: null,
      as_of_ms: null, recorded_through_ms: null, facts_through_ms: null, quality: null, authorized_filtered_count: null, returned_count: null });
    expect(valid.value.quality.completeness).toBe("PARTIAL");
    expect(valid.value.page.authorized_filtered_count).toBe(coverage[0].authorized_filtered_count + coverage[2].authorized_filtered_count);
  });

  it("judges every negative case as stated: the producer refuses each with its code, the schema exactly when it says so", () => {
    expect(negative.base).toBe("execution-manager-dataset.all-environments.synthetic.valid.json");
    expect(negative.cases.length).toBeGreaterThanOrEqual(12);
    for (const c of negative.cases) {
      const body = applyManagerP1Ops(valid.value, c.ops), runtime = managerDatasetResponse.safeParse(body);
      expect(runtime.success, c.id).toBe(false);
      expect(!runtime.success && runtime.error.issues.some(i => i.message === c.code || i.code === c.code), c.id).toBe(true);
      expect(validate(body), c.id).toBe(c.refused_by === "PRODUCER_ONLY");
    }
  });

  it("a single-environment body is never ALL-shaped, and an ALL body is never single-environment-shaped", () => {
    for (const name of ["synthetic", "rows.synthetic", "all-window.synthetic", "partitions.synthetic", "lifecycle.live.synthetic"]) {
      const sample = load(`fixtures/execution-manager-dataset.${name}.valid.json`);
      expect(sample.value.environment).not.toBe("ALL");
      expect(sample.value.environment_coverage).toBeUndefined();
      expect(sample.value.items.every((row: any) => row.environment === undefined)).toBe(true);
      expect(both(sample.value), name).toEqual({ schema: true, runtime: true });
      // the ALL keys on a single-environment body are refused by both validators
      const withCoverage = { ...clone(sample.value), environment_coverage: valid.value.environment_coverage };
      expect(both(withCoverage), name).toEqual({ schema: false, runtime: false });
      if (sample.value.items.length > 0) {
        const withRowEnvironment = clone(sample.value); withRowEnvironment.items[0].environment = sample.value.environment;
        expect(both(withRowEnvironment), name).toEqual({ schema: false, runtime: false });
      }
    }
    const asSingle = clone(valid.value); asSingle.environment = "paper";
    expect(both(asSingle)).toEqual({ schema: false, runtime: false });
  });

  it("an ALL row must name its environment; a row key and a partition domain cannot disagree with it", () => {
    const noEnvironment = clone(valid.value); delete noEnvironment.items[1].environment;
    expect(both(noEnvironment)).toEqual({ schema: false, runtime: false });
    const wrongKey = clone(valid.value); wrongKey.items[1].row_key = valid.value.items[0].row_key;
    expect(managerDatasetResponse.safeParse(wrongKey).success).toBe(false);
    const swapped = clone(valid.value); swapped.items[0].environment = "live";
    expect(managerDatasetResponse.safeParse(swapped).success).toBe(false);
  });
});

describe("FE-CAT-3 the ALL query", () => {
  it("publishes ALL as a value of the one environment parameter on every Manager route, not as a new route", () => {
    const query = api.components.schemas.ManagerDatasetQuery;
    expect(query.properties.environment.enum).toEqual(["paper", "sandbox", "live", "ALL"]);
    const fleet = api.paths["/api/v1/execution/manager/fleet"].get;
    const environment = fleet.parameters.find((p: any) => p.name === "environment");
    expect(environment.schema.enum).toContain("ALL");
    expect(fleet.description).toContain("environment=ALL (Fleet only)");
    expect(fleet.description).toContain("never a total over environments or partitions");
    expect(Object.keys(api.paths).filter(path => path.includes("ALL"))).toEqual([]);
  });

  it("accepts ALL with filters, sort, group, stages and a pinned partition; refuses a window on both validators", () => {
    const partition = { economic_domain: "PAPER", currency: "USDT", basis: "TEST_ONLY:net-ledger", native_profile_ref: "TEST_ONLY:paper-ledger", domain_proof_ref: "TEST_ONLY:proof" };
    for (const ok of [{ environment: "ALL" }, { environment: "ALL", stage_filter: ["PAPER", "LIVE"], limit: 25 },
      { environment: "ALL", filters: [{ field: "health", op: "IN", values: ["HEALTHY", "DEGRADED"] }], group_by: ["current_stage", "portfolio_id"] },
      { environment: "ALL", sort: [{ field: "net_pnl", direction: "desc" }], economic_partition: partition }]) {
      expect(checkQuery(ok), JSON.stringify(checkQuery.errors)).toBe(true);
      expect(managerModelQuery.safeParse(ok).success).toBe(true);
    }
    for (const bad of [{ environment: "ALL", window: "30D" }, { environment: "ALL", window: { from_ms: 1, to_ms: 2 } }, { environment: "EVERYWHERE" },
      { environment: "ALL", sql: "x" }, { environment: "ALL", after: "a", before: "b" }]) {
      expect(managerModelQuery.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(checkQuery({ environment: "ALL", window: "30D" })).toBe(false);
    expect(checkQuery({ environment: "ALL", window: { from_ms: 1, to_ms: 2 } })).toBe(false);
    // an exact window stays valid for ONE environment
    expect(checkQuery({ environment: "paper", window: "30D" })).toBe(true);
    expect(managerModelQuery.safeParse({ environment: "paper", window: "30D" }).success).toBe(true);
  });
});
