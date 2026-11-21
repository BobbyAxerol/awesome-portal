import { readFileSync } from "node:fs";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;

describe("D-AN-01 retained all-time analytics v2", () => {
  it("validates the pinned-QuantBT fixture and preserves exact provenance", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(read("schemas/research-retained-analytics.v2.schema.json"));
    const fixture = read("fixtures/research-retained-analytics-v2.fixed.valid.json");
    if (!validate(fixture)) throw new Error(JSON.stringify(validate.errors));
    const bytes = Buffer.byteLength(JSON.stringify(fixture), "utf8");
    expect(bytes).toBeLessThanOrEqual(16_384);
    expect(fixture.schema_version).toBe("research.retained-analytics.v2");
    expect(fixture).not.toHaveProperty("rolling_sharpe_63");
    const metrics = fixture.metrics as Record<string, Record<string, unknown>>;
    expect(metrics.sharpe.origin).toBe("ENGINE_DIRECT");
    expect(metrics.volatility_fraction.origin).toBe("PORTAL_DERIVED");
    expect(metrics.volatility_fraction.input_digest).toBe(fixture.input_digest);
    expect(JSON.stringify(fixture)).not.toContain("/private/");
    expect(validate({ ...fixture, rolling_sharpe_63: {} })).toBe(false);
    expect(validate({ ...fixture, input_digest: "bad" })).toBe(false);
  });

  it("publishes additive typed v2 on Evidence and current-source without removing v1", () => {
    for (const name of ["research-evidence", "research-current-source"]) {
      const openapi = read(`openapi/${name}.openapi.json`);
      const schemas = (openapi.components as { schemas: Record<string, unknown> }).schemas;
      expect(schemas.RetainedAnalytics).toBeDefined();
      expect(schemas.RetainedAnalyticsV2).toBeDefined();
      const generated = readFileSync(join(root, `generated/${name}.d.ts`), "utf8");
      expect(generated).toContain("summary_analytics_v2?");
      expect(generated).toContain("RetainedAnalyticsV2");
    }
  });
});
