import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

const document = JSON.parse(readFileSync(new URL("../openapi/research-progress.openapi.json", import.meta.url), "utf8"));
const overall = document.components.schemas.ProgressSnapshot.properties.overall;
const validate = new Ajv({ strict: false }).compile({ $defs: document.components.schemas,
  ...JSON.parse(JSON.stringify(overall).replaceAll("#/components/schemas/", "#/$defs/")) });
const fixture = JSON.parse(readFileSync(new URL("../fixtures/research-progress.pinned-audit-overall.valid.json", import.meta.url), "utf8"));

describe("pinned-audit truthful zero optimizer count", () => {
  it("accepts the explicit zero-trial evaluation fixture without a fabricated study", () => {
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
  });
  it("retains legacy positive counts and refuses negative/fractional/bool counts", () => {
    expect(validate({ ...fixture, trials_declared: 3, trials_done: 2 })).toBe(true);
    for (const trials_declared of [-1, 0.5, true]) expect(validate({ ...fixture, trials_declared })).toBe(false);
  });
});
