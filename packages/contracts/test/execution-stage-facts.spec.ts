import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const load = (path: string): any => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const FAMILY = "https://schemas.primusspark.com/portal/execution-stage-facts.v1.schema.json";

function registry(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of readdirSync(join(ROOT, "schemas"))) ajv.addSchema(load(`schemas/${name}`));
  return ajv;
}
const ajv = registry();
const validate = (id: string) => {
  const found = ajv.getSchema(id);
  expect(found, id).toBeDefined();
  return found!;
};
const ok = (id: string, value: unknown) => {
  const check = validate(id);
  expect(check(value), JSON.stringify(check.errors)).toBe(true);
};
const refuses = (id: string, value: unknown) => expect(validate(id)(value)).toBe(false);

describe("BE-P2 / FE-067 typed stage facts", () => {
  it("validates the dark and the explicitly synthetic populated fixtures", () => {
    const dark = load("fixtures/execution-stage-facts.unavailable.valid.json");
    const populated = load("fixtures/execution-stage-facts.source-backed.synthetic.valid.json");
    expect(dark.lane).toBe("CONTRACT_EXAMPLE_NOT_PRODUCT_RECEIPT");
    expect(populated.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(populated.runtime_qualified).toBe(false);
    ok(`${FAMILY}#/$defs/StageFacts`, dark.value);
    ok(`${FAMILY}#/$defs/StageFacts`, populated.value);
  });

  it("never lets a missing source read as zero, empty or healthy", () => {
    const dark = load("fixtures/execution-stage-facts.unavailable.valid.json").value;
    for (const fact of [dark.runtime.runtime_state, dark.runtime.since, dark.reconciliation.verdict, dark.reconciliation.open_finding_count, dark.reconciliation.unknown_order_count]) {
      expect(fact).toMatchObject({ availability: "NOT_PUBLISHED", value: null });
      expect(fact.reason_code).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
    expect(dark.sessions).toMatchObject({ availability: "NOT_PUBLISHED", rows: [], returned_count: 0, source_complete: null });
  });

  it("refuses the shapes that would invent a fact", () => {
    const id = `${FAMILY}#/$defs/StageFacts`;
    const base = load("fixtures/execution-stage-facts.source-backed.synthetic.valid.json").value;
    const mutate = (change: (copy: any) => void) => { const copy = structuredClone(base); change(copy); return copy; };
    refuses(id, mutate((c) => { c.runtime.runtime_state.value = "ACTIVE"; }));
    refuses(id, mutate((c) => { c.runtime.runtime_state.value = null; }));
    refuses(id, mutate((c) => { c.runtime.since = { availability: "NOT_PUBLISHED", value: null, reason_code: null }; }));
    refuses(id, mutate((c) => { c.runtime.since = { availability: "NOT_PUBLISHED", value: "2026-10-12T08:00:00Z", reason_code: "X_Y" }; }));
    refuses(id, mutate((c) => { c.reconciliation.verdict.value = "CLEAN"; }));
    refuses(id, mutate((c) => { c.reconciliation.open_finding_count.value = -1; }));
    refuses(id, mutate((c) => { c.sessions.availability = "NOT_PUBLISHED"; }));
    refuses(id, mutate((c) => { c.sessions.rows[0].started = "not a time"; }));
    refuses(id, mutate((c) => { c.sessions.rows[0].state = "has space"; }));
    refuses(id, mutate((c) => { c.sessions.rows.length = 0; c.sessions.rows.push(...Array(51).fill(base.sessions.rows[0])); }));
    refuses(id, mutate((c) => { c.injected = true; }));
    refuses(id, mutate((c) => { delete c.sessions; }));
  });

  it("is optional on the Sandbox, Canary and Live Full bodies, and valid when present", () => {
    const bodies: Array<[string, string]> = [
      ["fixtures/execution-sandbox-certification.unavailable.valid.json", "https://schemas.primusspark.com/portal/execution-sandbox-certification.v1.schema.json#/$defs/CertificationResponse"],
      ["fixtures/execution-canary-control-room.unavailable.valid.json", "https://schemas.primusspark.com/portal/execution-canary-control-room.v1.schema.json#/$defs/CanaryControlRoom"],
      ["fixtures/execution-live-full-operations.unavailable.valid.json", "https://schemas.primusspark.com/portal/execution-live-full-operations.v1.schema.json#/$defs/LiveFullOperations"],
    ];
    for (const [file, id] of bodies) {
      const body = load(file);
      expect(body.stage_facts.schema_version, file).toBe("execution.stage-facts.v1");
      ok(id, body);
      // Backward compatible: a producer that predates the member still validates.
      const old = structuredClone(body);
      delete old.stage_facts;
      ok(id, old);
      refuses(id, { ...body, stage_facts: { ...body.stage_facts, runtime: undefined } });
    }
  });

  it("carries the same definitions inline in the Paper standalone schema and OpenAPI", () => {
    const family = load("schemas/execution-stage-facts.v1.schema.json").$defs;
    const standalone = load("schemas/execution-paper-read.v1.schema.json");
    const api = load("openapi/execution-paper-read.openapi.json").components.schemas;
    const rewrite = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll("#/$defs/", "#/components/schemas/"));
    for (const name of Object.keys(family).filter((key) => key.startsWith("Stage"))) {
      expect(standalone.$defs[name], name).toEqual(family[name]);
      expect(api[name], name).toEqual(rewrite(family[name]));
    }
    expect(standalone.$defs.Data.properties.stage_facts).toEqual({ $ref: "#/$defs/StageFacts" });
    expect(api.PaperData.properties.stage_facts).toEqual({ $ref: "#/components/schemas/StageFacts" });
  });

  it("validates the Paper workbench fixtures with stage_facts against the standalone schema and the OpenAPI component", () => {
    const spec = load("openapi/execution-paper-read.openapi.json");
    const alone = new Ajv2020({ strict: false });
    addFormats(alone);
    const standalone = alone.compile(load("schemas/execution-paper-read.v1.schema.json"));
    const component = alone.compile({ ...spec, $ref: "#/components/schemas/PaperData" });
    for (const file of ["fixtures/execution-paper-workbench.partial.valid.json", "fixtures/execution-paper-workbench-vnm.partial.valid.json"]) {
      const fixture = load(file);
      expect(fixture.data.stage_facts.runtime.runtime_state.reason_code, file).toBe("SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED");
      expect(fixture.data.stage_facts.sessions.reason_code, file).toBe("PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN");
      expect(standalone(fixture), JSON.stringify(standalone.errors)).toBe(true);
      expect(component(fixture.data), JSON.stringify(component.errors)).toBe(true);
      const bad = structuredClone(fixture);
      bad.data.stage_facts.runtime.runtime_state.value = "RUNNING";
      expect(standalone(bad)).toBe(false);
      expect(component(bad.data)).toBe(false);
    }
  });
});
