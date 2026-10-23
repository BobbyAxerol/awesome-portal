import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const SCHEMA = "https://schemas.primusspark.com/portal/execution-manager-lists.v1.schema.json";

function validator(def: string) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(read("schemas/execution-manager-lists.v1.schema.json"));
  const validate = ajv.getSchema(`${SCHEMA}#/$defs/${def}`);
  expect(validate).toBeDefined();
  return validate!;
}

describe("FE-CAT-4 bindings-list figures and counts (additive)", () => {
  const sample = read("fixtures/execution-bindings-list.figures.synthetic.valid.json");

  it("keeps the canonical L0 fixture valid and figure-free", () => {
    const l0 = read("fixtures/execution-bindings-list.valid.json");
    expect(validator("BindingsResponse")(l0)).toBe(true);
    expect(JSON.stringify(l0)).not.toContain("figures");
    expect(l0).not.toHaveProperty("counts");
  });

  it("accepts the figures fixture: absent, typed-null, zero, mixed currency and an untouched legacy row", () => {
    const validate = validator("BindingsResponse");
    expect(validate(sample), JSON.stringify(validate.errors)).toBe(true);
    const [full, noEquity, mixed, legacy] = sample.page.rows;
    expect(full.figures.native_equity[0].value).toBe("412880.25");
    expect(noEquity.figures.native_equity).toBeNull();
    expect(noEquity.figures.sleeve_count.count).toBe(0); // a counted zero is not a null
    expect(mixed.figures.native_equity.map((entry: { currency: string }) => entry.currency)).toEqual(["USDC", "USDT"]);
    expect(legacy).not.toHaveProperty("figures"); // omitted: this producer has no owning source
  });

  it("validates the binding detail item with the same figures", () => {
    const validate = validator("BindingDetailResponse");
    const detail = read("fixtures/execution-binding-detail.valid.json");
    expect(validate({ ...detail, item: { ...detail.item, figures: sample.page.rows[0].figures } })).toBe(true);
  });

  it("rejects malformed figures and counts", () => {
    const validate = validator("BindingsResponse");
    const accepts = (change: (copy: any) => void) => {
      const copy = structuredClone(sample);
      change(copy);
      return validate(copy);
    };
    expect(accepts((c) => { c.page.rows[0].figures.native_equity[0].value = "412880.25e0"; })).toBe(false);
    expect(accepts((c) => { c.page.rows[0].figures.native_equity[0].value = 412880.25; })).toBe(false);
    expect(accepts((c) => { delete c.page.rows[0].figures.native_equity[0].currency; })).toBe(false);
    expect(accepts((c) => { delete c.page.rows[0].figures.native_equity[0].observed_at; })).toBe(false);
    expect(accepts((c) => { c.page.rows[0].figures.native_equity[0].coverage = "FULL"; })).toBe(false);
    expect(accepts((c) => { c.page.rows[0].figures.native_equity = []; })).toBe(false);
    expect(accepts((c) => { c.page.rows[0].figures.wallet_balance = []; })).toBe(false);
    expect(accepts((c) => { c.page.rows[0].figures.sleeve_count.count = -1; })).toBe(false);
    expect(accepts((c) => { c.page.rows[0].figures.sleeve_count.count = 1.5; })).toBe(false);
    expect(accepts((c) => { c.counts.all = -1; })).toBe(false);
    expect(accepts((c) => { c.counts.basis = "LOADED_ROWS"; })).toBe(false);
    expect(accepts((c) => { c.counts.by_environment.archived = 1; })).toBe(false);
    expect(accepts((c) => { delete c.counts.observed_at; })).toBe(false);
  });

  it("allows counts that are typed null (not computable) beside a counted zero", () => {
    const validate = validator("BindingsResponse");
    const copy = structuredClone(sample);
    copy.counts.all = null;
    copy.counts.by_environment.live = null;
    copy.counts.by_environment.sandbox = 0;
    expect(validate(copy), JSON.stringify(validate.errors)).toBe(true);
  });
});
