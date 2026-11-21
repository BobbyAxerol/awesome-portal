import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const fixtures = JSON.parse(readFileSync(join(ROOT, "fixtures/research-methodology-claims.valid.json"), "utf8")) as Record<string, unknown>;

describe("CG-FG-S03-02/S04-01 generated methodology claims", () => {
  it("keeps Progress at four and Evidence at seven typed, bounded facts", () => {
    for (const name of ["research-progress", "research-evidence"]) {
      const document = JSON.parse(readFileSync(join(ROOT, `openapi/${name}.openapi.json`), "utf8"));
      const generated = readFileSync(join(ROOT, `generated/${name}.d.ts`), "utf8");
      const response = document.components.schemas[name === "research-progress" ? "ProgressRead" : "EvidenceHub"];
      const count = name === "research-progress" ? 4 : 7;
      expect(response.properties.claims).toMatchObject({ type: "array", minItems: count, maxItems: count });
      expect(generated).toContain("MethodologyClaim");
      const validate = new Ajv2020({ allErrors: true, strict: false }).compile(document.components.schemas.MethodologyClaim);
      for (const item of [...(fixtures.forecast as unknown[]), ...(fixtures.issued as unknown[]), ...(fixtures.evidence as unknown[])]) {
        expect(validate(item), JSON.stringify(validate.errors)).toBe(true);
      }
      expect(validate({ ...(fixtures.issued as Record<string, unknown>[])[0], state: "ISSUED", text: null })).toBe(false);
    }
  });
});
