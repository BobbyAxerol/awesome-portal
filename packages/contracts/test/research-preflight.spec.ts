import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { components } from "../generated/research-preflight";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-preflight.openapi.json");
const generatedPath = join(ROOT, "generated", "research-preflight.d.ts");
const packagedRequestedSpecPath = join(ROOT, "schemas", "research-requested-spec.v1.schema.json");
const p02FrozenRequestedSpecPath = join(
  ROOT,
  "..",
  "..",
  "upgrade",
  "research_loop",
  "evidence",
  "P02",
  "requested-spec.v1.schema.json",
);

describe("P08 published Research preflight contract", () => {
  it("publishes a bounded public quota retry without private diagnostics", () => {
    const doc = JSON.parse(readFileSync(openApiPath, "utf8"));
    const validate = new Ajv2020({strict:false}).compile(JSON.parse(JSON.stringify({
      ...doc.components.schemas.Problem,$defs:doc.components.schemas,
    }).replaceAll("#/components/schemas/","#/$defs/")));
    const fixture: components["schemas"]["Problem"] = JSON.parse(readFileSync(join(ROOT,"fixtures/research-preflight.quota.valid.json"),"utf8"));
    expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
    expect(validate({...fixture,details:{...fixture.details,retry_after_seconds:0}})).toBe(false);
    expect(validate({...fixture,details:{...fixture.details,retry_after_seconds:3601}})).toBe(false);
  });
  it("preserves the frozen P02 schema with only exact native edition exceptions", () => {
    const packaged=JSON.parse(readFileSync(packagedRequestedSpecPath, "utf8"));
    packaged.allOf=packaged.allOf.filter((c:any)=>!c.if?.properties?.alpha_binding?.properties?.alpha_version_id)
      .map((c:any)=>{if(c.if?.not)delete c.if.not;return c;});
    expect(packaged).toEqual(
      JSON.parse(readFileSync(p02FrozenRequestedSpecPath, "utf8")),
    );
  });

  it("publishes exactly the two same-origin metadata operations and the W4 dataset catalog read", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { paths: Record<string, unknown> };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/research/preflights",
      "/api/v1/research/preflights/{preflight_token}",
      "/api/v1/research/datasets",
    ]);
    const generated = readFileSync(generatedPath, "utf8");
    expect(generated).toContain("researchPreflightCreateV1");
    expect(generated).toContain("researchPreflightGetV1");
    expect(generated).toContain("RESEARCH_PREFLIGHT_STALE");
    expect(generated).toContain("CLOSED_BARS_ONLY");
    expect(generated).toContain("may_create_run: boolean");
    const requestedSpec = generated.slice(
      generated.indexOf('"research-requested-spec.v1.schema": {'),
      generated.indexOf("    };\n    responses:", generated.indexOf('"research-requested-spec.v1.schema": {')),
    );
    expect(requestedSpec).not.toContain("$defs:");
    expect(requestedSpec).toContain("schema_version:");
    for (const typedPanelField of ["Topology", "ResourceEstimate", "DatasetBinding", "Quality", "Warmup"]) {
      expect(generated).toContain(typedPanelField);
    }
    expect(generated).not.toContain('effective_spec: components["schemas"]["Metadata"]');
  });

  it("does not turn immutable snapshot metadata into a raw market-data or worker API", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of ["source_path", "frame.parquet", "market_rows", "broker", "worker_claim", "command"]) {
      expect(document).not.toContain(forbidden);
    }
    expect(document).toContain("sealed-holdout values");
    expect(document).toContain("PREFLIGHT_ONLY");
    expect(document).toContain("may_create_run");
    expect(document).toContain("P10 may return true only");
    expect(document).not.toContain("private_dsn");
    expect(document).toContain("propertyNames");
  });
  it("W4 CG-P02-02/P08-02/03/05/06: publishes requested-spec v2, gates, admission reason, ceilings, gap scan and seal", () => {
    const v1 = JSON.parse(readFileSync(packagedRequestedSpecPath, "utf8"));
    const v2 = JSON.parse(readFileSync(join(ROOT, "schemas", "research-requested-spec.v2.schema.json"), "utf8"));
    // Additive: v2 is v1 plus exactly five walk_forward fields and its own version.
    expect(v2.properties.schema_version).toEqual({ const: "research.requested-spec.v2" });
    const added = Object.keys(v2.properties.walk_forward.properties).filter((key) => !(key in v1.properties.walk_forward.properties));
    expect(added.sort()).toEqual(["embargo_bars", "inner", "label_horizon_bars", "purge_bars", "train_window"]);
    expect({ ...v2.properties, schema_version: null, walk_forward: null }).toEqual({ ...v1.properties, schema_version: null, walk_forward: null });
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      '"research-requested-spec.v2.schema"', "PreflightGate", "RunAdmission", "GapScan", "HoldoutSeal",
      "RESEARCH_PREFLIGHT_SCHEDULE_NOT_ADMITTED", "field_paths", "OWNER_SCOPE_REQUIRED", "NOT_RECORDED",
    ]) expect(generated).toContain(needle);
    const fixture: components["schemas"]["ResearchPreflightV1"] = JSON.parse(
      readFileSync(join(ROOT, "fixtures", "research-preflight.response.valid.json"), "utf8"),
    );
    expect(fixture.gates?.every((gate) => gate.field_path.length >= 0 && gate.message.length > 0)).toBe(true);
    expect(fixture.snapshot.gap_scan?.windows.find((window) => window.window === "holdout")?.state).toBe("SEALED");
    expect(fixture.resource_estimate.ceilings?.sweep_dimension_ceiling).toBe(8);
  });

  it("pins one typed, sanitized public response from the P08 producer", () => {
    const fixture: components["schemas"]["ResearchPreflightV1"] = JSON.parse(
      readFileSync(join(ROOT, "fixtures", "research-preflight.response.valid.json"), "utf8"),
    );
    expect(fixture).toMatchObject({
      schema_version: "research.preflight.v1",
      preflight_token: "rpft_fixture",
      expires_at_utc_ms: 0,
      may_create_run: false,
      capability: { preflight_admission: "PREFLIGHT_ONLY" },
    });
    expect(fixture.snapshot).not.toHaveProperty("source_path");
    expect(fixture.snapshot).not.toHaveProperty("market_rows");
  });

  it("pins one dataset catalog that carries every symbol state Screen 02 must tell apart (D4)", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { components: { schemas: Record<string, object> } };
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(openApi.components.schemas.DatasetCatalog!);
    const catalog: components["schemas"]["DatasetCatalog"] = JSON.parse(
      readFileSync(join(ROOT, "fixtures", "research-preflight.dataset-catalog.valid.json"), "utf8"),
    );
    expect(validate(catalog), JSON.stringify(validate.errors)).toBe(true);
    // The fixture has teeth: a month that is not YYYY-MM is refused by the schema.
    const broken = structuredClone(catalog);
    broken.datasets[0]!.symbols.items[0]!.coverage!.first_month = "2020-1";
    expect(validate(broken)).toBe(false);

    const byId = new Map(catalog.datasets.map((dataset) => [dataset.dataset_id, dataset]));
    // Coverage published, and the same symbol name with different coverage on another dataset.
    const btc = (id: string) => byId.get(id)!.symbols.items.find((item) => item.symbol === "BTCUSDT")!.coverage;
    expect(btc("crypto-binance-1m")).toMatchObject({ first_month: "2020-01", last_month: "2026-09", months: 81 });
    expect(btc("fixture-bybit-1h")).toMatchObject({ first_month: "2022-05", last_month: "2025-11", months: 43 });
    // Partitions with holes: fewer months present than the first-to-last range spans.
    expect(byId.get("fixture-bybit-1h")!.symbols.items.find((item) => item.symbol === "ETHUSDT")!.coverage!.months).toBe(40);
    // A listed symbol whose coverage is not published, with a non-UTC source clock.
    expect(byId.get("fixture-single-symbol-1d")!.symbols.items).toEqual([{ symbol: "VN30F1M", contract_kind: null, coverage: null }]);
    expect(byId.get("fixture-single-symbol-1d")!.source_timezone).toBe("Asia/Ho_Chi_Minh");
    // Symbols not published, and an unavailable dataset, each with the server's reason.
    expect(byId.get("fixture-query-any-symbol")!.symbols).toMatchObject({ state: "NOT_PUBLISHED", total: null });
    expect(byId.get("fixture-unavailable-1h")).toMatchObject({ availability: "unavailable" });
    expect(byId.get("fixture-unavailable-1h")!.unavailable_reason).toEqual(expect.any(String));
    // The catalog states what coverage is not, in its own words.
    expect(catalog.coverage_rule).toContain("not the exact first or last bar");
  });
});

describe("the public preflight response is admitted by its own contract", () => {
  const load = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, key === "$ref" && typeof item === "string" ? item.replace("#/components/schemas/", "#/$defs/") : rewrite(item)]));
    return value;
  };
  const base = "https://schemas.primusspark.com/portal/openapi/research-preflight.openapi.json";
  const api = load("openapi/research-preflight.openapi.json");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const version of ["v1", "v2"]) ajv.addSchema(load(`schemas/research-requested-spec.${version}.schema.json`),
    new URL(`../schemas/research-requested-spec.${version}.schema.json`, base).href);
  ajv.addSchema({ $id: base, $defs: rewrite(api.components.schemas), components: rewrite(api.components) });
  const validate = ajv.getSchema(`${base}#/$defs/ResearchPreflightV1`)!;

  it("the pinned P08 response validates against ResearchPreflightV1 (it was rejected under /effective_spec/topology/sealed_holdout and /snapshot/warmup)", () => {
    const fixture = load("fixtures/research-preflight.response.valid.json");
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
  });

  it("a ranged window is one closed object: no schema composes a closed object with another closed branch, which no body can satisfy", () => {
    const schemas = api.components.schemas as Record<string, unknown>;
    const offenders: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${path}[${i}]`));
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (Array.isArray(record.allOf) && record.allOf.some((b) => (b as { $ref?: string }).$ref)
        && record.allOf.some((b) => (b as { additionalProperties?: boolean }).additionalProperties === false)) offenders.push(path);
      for (const [key, value] of Object.entries(record)) walk(value, `${path}/${key}`);
    };
    walk(schemas, "");
    expect(offenders).toEqual([]);
    // the sealed holdout and the warm-up carry the range fields themselves
    for (const name of ["SealedHoldout", "Warmup"]) {
      const schema = schemas[name] as { properties: Record<string, unknown>; additionalProperties: boolean };
      expect(schema.additionalProperties, name).toBe(false);
      for (const key of ["start_utc", "end_exclusive_utc", "start_utc_ms", "end_exclusive_utc_ms", "bars"]) expect(schema.properties, `${name}.${key}`).toHaveProperty(key);
    }
  });
});
