import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { operationalHealthFixture } from "../tooling/execution-operational-current-reader.mjs";

const root = resolve(__dirname, "..");
const load = (name: string) => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const base = "https://schemas.primusspark.com/portal/";
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
for (const name of readdirSync(resolve(root, "schemas"))) {
  const schema = load("schemas/" + name);
  ajv.addSchema(schema);
  ajv.addSchema({ ...schema, $id: base + "schemas/" + name });
}
ajv.addSchema(load("openapi/execution-trusted-commands.openapi.json"), base + "openapi/execution-trusted-commands.openapi.json");
ajv.addSchema(load("openapi/execution-operations.openapi.json"), base + "openapi/execution-operations.openapi.json");
const validate = (name: string) => ajv.compile({ $ref: base + "openapi/execution-operations.openapi.json#/components/schemas/" + name });

describe("FE-CAT-2 optional additive queue health and row axes", () => {
  const health = load("fixtures/execution-operational-queue-health.synthetic.valid.json");
  const queue = health.queue;
  const edit = (change: (queue: any) => void) => { const next = structuredClone(queue); change(next); return next; };

  it("the named fixture is the generator's bytes and validates; the L0 and links/counts fixtures stay valid without the fields", () => {
    expect(JSON.parse(JSON.stringify(operationalHealthFixture()))).toEqual(health);
    expect(health.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    const check = validate("OperationalQueueV2");
    expect(check(queue), JSON.stringify(check.errors)).toBe(true);
    for (const name of ["execution-operational-current.synthetic.valid.json", "execution-operational-queue-links-counts.synthetic.valid.json"]) {
      const old = load("fixtures/" + name).queue;
      expect(check(old)).toBe(true);
      expect(JSON.stringify(old)).not.toContain("delivery_state");
      expect(JSON.stringify(old)).not.toContain('"health"');
    }
  });

  it("carries a counted zero, a typed null and a number, each with its own observation time and coverage", () => {
    const { pending_receipt_count: pending, display_lag_count: lag, open_exception_count: exceptions } = queue.page.health;
    expect(pending).toEqual({ count: 1, observed_at: "2026-08-22T12:00:00Z", coverage: "COMPLETE" });
    expect(lag.count).toBe(0);
    expect(lag.coverage).toBe("COMPLETE");
    expect(exceptions).toEqual({ count: null, observed_at: null, coverage: "UNKNOWN" });
  });

  it("an omitted key is valid (no owning source) and is not the same as null", () => {
    const check = validate("OperationalQueueV2");
    const omitted = edit(q => { delete q.page.health.open_exception_count; });
    expect(check(omitted)).toBe(true);
    expect("open_exception_count" in omitted.page.health).toBe(false);
    expect(check(edit(q => { q.page.health = { basis: q.page.health.basis }; }))).toBe(true);
  });

  it("rejects malformed health, unknown keys and axes outside the closed vocabularies", () => {
    const check = validate("OperationalQueueV2");
    expect(check(edit(q => { q.page.health.pending_receipt_count.count = 1.5; }))).toBe(false);
    expect(check(edit(q => { q.page.health.pending_receipt_count.count = "1"; }))).toBe(false);
    expect(check(edit(q => { q.page.health.pending_receipt_count.coverage = "FULL"; }))).toBe(false);
    expect(check(edit(q => { delete q.page.health.pending_receipt_count.observed_at; }))).toBe(false);
    expect(check(edit(q => { q.page.health.basis = "LOADED_ROWS"; }))).toBe(false);
    expect(check(edit(q => { q.page.health.global_pending = 3; }))).toBe(false);
    expect(check(edit(q => { q.page.rows[0].delivery_state = "SHIPPED"; }))).toBe(false);
    expect(check(edit(q => { q.page.rows[0].display_state = "FRESH"; }))).toBe(false);
    expect(check(edit(q => { q.page.rows[0].display_state = null; q.page.rows[0].delivery_state = null; }))).toBe(true);
  });

  it("the workflow detail keeps the unextended item and rejects the axes", () => {
    const detail = load("fixtures/execution-operational-current.synthetic.valid.json").workflow;
    expect(validate("OperationalWorkflowV2")({ ...detail, operation: { ...detail.operation, delivery_state: "NOT_APPLICABLE" } })).toBe(false);
  });
});
