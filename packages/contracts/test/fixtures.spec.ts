import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const ROOT = join(__dirname, "..");

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildValidator(schemas: string[]): Ajv {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const file of schemas) {
    ajv.addSchema(loadJson(file));
  }
  return ajv;
}

const schemaDir = join(ROOT, "schemas");
const fixtureDir = join(ROOT, "fixtures");
const ajv = buildValidator(
  readdirSync(schemaDir).map((name) => join(schemaDir, name)),
);

const schemaIds: Record<string, string> = {
  "problem.valid.json":
    "https://schemas.primusspark.com/portal/problem.v1.schema.json",
  "command.valid.json":
    "https://schemas.primusspark.com/portal/command-envelope.v1.schema.json",
  "event.valid.json":
    "https://schemas.primusspark.com/portal/event-envelope.v1.schema.json",
};

describe("canonical contracts (cross-language fixture compilation)", () => {
  for (const [fixture, schemaId] of Object.entries(schemaIds)) {
    it(`validates ${fixture} against ${schemaId.split("/").pop()}`, () => {
      const validate = ajv.getSchema(schemaId);
      expect(validate).toBeDefined();
      const document = loadJson(join(fixtureDir, fixture));
      const valid = validate!(document);
      if (!valid) {
        throw new Error(JSON.stringify(validate!.errors, null, 2));
      }
    });
  }

  it("rejects unknown fields in every canonical schema", () => {
    const problem = loadJson(join(fixtureDir, "problem.valid.json")) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/problem.v1.schema.json",
    );
    const mutated = { ...problem, injected: true };
    expect(validate!(mutated)).toBe(false);

    const command = loadJson(join(fixtureDir, "command.valid.json")) as Record<string, unknown>;
    const commandValidate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/command-envelope.v1.schema.json",
    );
    expect(commandValidate!({ ...command, injected: true })).toBe(false);
    expect(commandValidate!({ ...command, expected_aggregate_version: 0 })).toBe(false);
    expect(commandValidate!({ ...command, idempotency_key: "bad key!" })).toBe(false);
  });

  it("rejects malformed event envelopes", () => {
    const event = loadJson(join(fixtureDir, "event.valid.json")) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/event-envelope.v1.schema.json",
    );
    expect(validate!({ ...event, aggregate_version: 0 })).toBe(false);
    expect(validate!({ ...event, event_type: "quant.run.progressed" })).toBe(false);
    expect(
      validate!({ ...event, occurred_at: "2026-08-15T12:00:00" }),
    ).toBe(false);
  });

  it("generated portal types reference both handoff endpoints", () => {
    const generated = readFileSync(join(ROOT, "generated", "portal-api.d.ts"), "utf8");
    expect(generated).toContain('"/api/v1/portal/registry"');
    expect(generated).toContain('"/api/v1/portal/summary"');
    expect(generated).toContain('"/api/v1/portal/links"');
    expect(generated).toContain("PortalSummaryV1");
    expect(generated).toContain("PortalRegistryDocument");
  });
});
