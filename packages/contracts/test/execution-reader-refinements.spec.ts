import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

describe("FE-044/045/046 additive authorized reader contracts", () => {
  it("publishes literal q and retains legacy population versus loaded-match semantics", () => {
    const spec = read("openapi/execution-manager-lists.openapi.json");
    const q = spec.paths["/api/v1/execution/portfolios"].get.parameters.find((p: any) => p.name === "q");
    expect(q.schema).toMatchObject({ minLength: 1, maxLength: 160 });
    const schema = read("schemas/execution-portfolio-list.v1.schema.json");
    const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
    const validate = ajv.compile(schema), sample = read("fixtures/execution-portfolio-list.valid.json");
    expect(validate(sample)).toBe(true);
    expect(validate({ ...sample, total_portfolios: 250, matching_portfolios: 1, truncated: true,
      items: sample.items.slice(0, 1) })).toBe(true);
    expect(validate({ ...sample, matching_portfolios: 101 })).toBe(false);
  });
  it("keeps Inbox portfolio nullable and never publishes it as a portfolio-count filter", () => {
    const def = read("schemas/execution-governance-product.v1.schema.json").$defs.ApprovalInboxItem;
    expect(def.required).toContain("portfolio_id");
    const ajv = new Ajv2020({ strict: false }), validate = ajv.compile(def.properties.portfolio_id);
    for (const value of [null, "TEST_ONLY-pf"]) expect(validate(value)).toBe(true);
    for (const value of [1, "", "a\nb", {}]) expect(validate(value)).toBe(false);
    expect(read("fixtures/execution-governance.approval-inbox.valid.json").page.rows[0].portfolio_id).toBeNull();
  });
  it("loads the canonical local ledger page, with explicit chunk scope and no invented provenance", () => {
    const spec = read("openapi/execution-analytics.openapi.json"), sample = read("fixtures/execution-capital-ledger-page.synthetic.valid.json");
    const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
    const validate = ajv.compile({ ...spec, $ref: "#/components/schemas/LocalCapitalLedgerResponse" });
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(sample.value), JSON.stringify(validate.errors)).toBe(true);
    const data = sample.value.analytics.data;
    expect(data.totals_scope).toBe("AUTHORIZED_VALIDATED_SOURCE_CHUNK");
    expect(data.buckets[0].entries[0]).toMatchObject({ seq: null, command_id: null, receipt_ref: null });
    const bad = structuredClone(sample.value); delete bad.analytics.data.next_cursor;
    expect(validate(bad)).toBe(false);
  });
  it("publishes all four nullable Blotter scope axes and the exact supported filter tuple", () => {
    const spec = read("openapi/execution-paper-read.openapi.json");
    const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
    const validate = ajv.compile({ ...spec, $ref: "#/components/schemas/PaperData" });
    const fixture = read("fixtures/execution-full-blotter.partial.valid.json"), data = fixture.data;
    const canonical = read("schemas/execution-paper-read.v1.schema.json");
    const validateCanonical = ajv.compile(canonical);
    expect(validateCanonical(fixture), JSON.stringify(validateCanonical.errors)).toBe(true);
    expect(canonical.$defs.Query.properties.filters.required)
      .toEqual(spec.components.schemas.PaperData.properties.query.properties.filters.required);
    expect(canonical.$defs.Query.properties.filter_allowlist.const).toEqual(data.query.filter_allowlist);
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
    for (const axis of ["stage", "deployment_id", "account_id", "alpha_id"]) {
      expect(data.query.filters[axis]).toBeNull();
      const bad = structuredClone(data); delete bad.query.filters[axis]; expect(validate(bad)).toBe(false);
    }
    const bad = structuredClone(data); bad.query.filter_allowlist = ["status"];
    expect(validate(bad)).toBe(false);
  });
});
