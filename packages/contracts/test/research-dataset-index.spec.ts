import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import type { components } from "../generated/research-dataset-index";
const root = join(__dirname, "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const doc = read("openapi/research-dataset-index.openapi.json");
describe("B7 named metadata contracts", () => {
  it("keeps observed date coverage distinct from UTC completeness and session-close facts", () => {
    const validate=new Ajv2020({strict:true}).compile(doc.components.schemas.Coverage);
    const sample:components["schemas"]["Coverage"]=read("fixtures/research-dataset-coverage.observed-local-date.valid.json");
    expect(validate(sample),JSON.stringify(validate.errors)).toBe(true);
    for (const patch of [{expected_bar_count:6},{missing_ratio:"0.333333333333"},{gap_count:1},
      {last_closed_bar_end_utc_ms:sample.last_bar_utc_ms!+86400000},{source_timezone:"UTC"},
      {calendar_availability:{state:"AVAILABLE",reason_code:null}}]) expect(validate({...sample,...patch})).toBe(false);
  });
  it("binds additive observed metadata to the exact VN namespace without widening old responses", () => {
    const validate=new Ajv2020({strict:false}).compile(doc.components.schemas.BarMetadata);
    const sample:components["schemas"]["BarMetadata"]=read("fixtures/research-dataset-bar-metadata.observed-local-date.valid.json");
    expect(validate(sample),JSON.stringify(validate.errors)).toBe(true);
    const {clock_basis,...missing}=sample;
    expect(validate(missing)).toBe(false);
    expect(validate({...sample,dataset_id:"crypto-binance-1m"})).toBe(false);
    expect(validate({...sample,timeframe:"1h"})).toBe(false);
    expect(validate({...sample,verified_range:{...sample.verified_range,basis:"INDEXED_TARGET_BAR_RANGE_V1"}})).toBe(false);
  });
  it("rejects observed date coverage grafted onto another dataset or timezone", () => {
    const validate=new Ajv2020({strict:true}).compile(JSON.parse(JSON.stringify({...doc.components.schemas.DatasetCatalogV2,
      $defs:doc.components.schemas}).replaceAll("#/components/schemas/","#/$defs/")));
    const catalog=read("fixtures/research-dataset-catalog.v2.healthy.valid.json");
    catalog.datasets[0].symbols.items=catalog.datasets[0].symbols.items.slice(0,1);
    catalog.datasets[0].symbols.items[0].coverage_by_timeframe=[read("fixtures/research-dataset-coverage.observed-local-date.valid.json")];
    expect(validate(catalog)).toBe(false);
    catalog.datasets[0].dataset_id="vn-stock-daily";
    expect(validate(catalog)).toBe(false);
    catalog.datasets[0].source_timezone="Asia/Ho_Chi_Minh";
    expect(validate(catalog),JSON.stringify(validate.errors)).toBe(true);
  });
  it("keeps metadata alignment errors out of the unchanged preflight vocabulary", () => {
    const preflight = read("openapi/research-preflight.openapi.json");
    expect(preflight.components.schemas.Problem.properties.error.properties.code.enum).not.toContain("WINDOW_BOUND_NOT_ALIGNED");
    const validate = new Ajv2020({strict:false}).compile(JSON.parse(JSON.stringify({...doc.components.schemas.Problem,$defs:doc.components.schemas}).replaceAll("#/components/schemas/","#/$defs/")));
    expect(validate({error:{code:"WINDOW_BOUND_NOT_ALIGNED",message:"Align window bounds to the selected UTC bar interval."},request_id:"metadata-alignment",details:{gate:"window_alignment",field_paths:[["start_utc_ms"]]}}), JSON.stringify(validate.errors)).toBe(true);
  });
  it.each(["available","partial"])("validates generated declaration %s without prices or authorization", name => {
    const validate=new Ajv2020({strict:false}).compile(JSON.parse(JSON.stringify({...doc.components.schemas.DeclarationEstimate,$defs:doc.components.schemas}).replaceAll("#/components/schemas/","#/$defs/")));
    const fixture:components["schemas"]["DeclarationEstimate"]=read(`fixtures/research-declaration-estimate.v1.${name}.valid.json`);
    expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
    expect(validate({...fixture,preflight_token:"invented"})).toBe(false);
    expect(fixture.metadata.scope).toBe("INDEX_ESTIMATE_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION");
  });
  it.each(["healthy", "partial-quality", "multi-dataset", "symbol-absent"])("accepts canonical synthetic %s", name => {
    const validate = new Ajv2020({ strict: true }).compile(JSON.parse(JSON.stringify({ ...doc.components.schemas.DatasetCatalogV2, $defs: doc.components.schemas }).replaceAll("#/components/schemas/", "#/$defs/")));
    const fixture: components["schemas"]["DatasetCatalogV2"] = read(`fixtures/research-dataset-catalog.v2.${name}.valid.json`);
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...fixture, broker: {} })).toBe(false);
    expect(JSON.stringify(fixture)).not.toContain("source_path");
  });
  it("has four generated operations, preserves V1 and exposes no source query or job control", () => {
    expect(Object.keys(doc.paths)).toHaveLength(4);
    const generated = readFileSync(join(root, "generated/research-dataset-index.d.ts"), "utf8");
    for (const name of ["researchDatasetCatalogGetV2", "researchDatasetSymbolsGetV1", "researchDatasetBarMetadataGetV1", "researchDeclarationEstimatePostV1"])
      expect(generated).toContain(name);
    expect(read("openapi/research-preflight.openapi.json").components.schemas.DatasetCatalog.properties.schema_version.const).toBe("research.dataset-catalog.v1");
    expect(doc.info.description).toContain("GET does not build/scan HMD");
    expect(generated).not.toContain("source_path");
    expect(generated).toContain("INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION");
  });
});
