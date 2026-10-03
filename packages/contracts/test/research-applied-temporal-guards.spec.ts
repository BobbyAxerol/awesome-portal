import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const doc = JSON.parse(readFileSync(new URL("../openapi/research-current-source.openapi.json", import.meta.url), "utf8"));
const defs = JSON.parse(JSON.stringify(doc.components.schemas).replaceAll("#/components/schemas/", "#/$defs/"));
const check = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true, unicodeRegExp: false })
  .compile({ $defs: defs, $ref: "#/$defs/AppliedTemporalGuardProof" });
const proof = JSON.parse(readFileSync(new URL("../fixtures/research-current-source.applied-guard-proof.valid.json", import.meta.url), "utf8"));
describe("BR-F3-02 published applied guards", () => {
  it("publishes additive optional named guards and their generated type", () => {
    const guards = doc.components.schemas.Split.allOf.find((value: any) => value.properties).properties.guards;
    expect(guards.required).not.toContain("purge_applied");
    expect(guards.properties.embargo_respected).toEqual({ $ref: "#/components/schemas/AppliedTemporalGuardProof" });
    expect(readFileSync(new URL("../generated/research-current-source.d.ts", import.meta.url), "utf8"))
      .toContain("AppliedTemporalGuardProof:");
  });
  it("accepts exact/clipped source proof and typed historical absence", () => {
    expect(check(proof)).toBe(true);
    expect(check({ ...proof, verdict: "NOT_CHECKABLE", reason_code: "S05_APPLIED_GUARD_WINDOW_NOT_RETAINED",
      folds: proof.folds.map((fold: any) => ({ ...fold, verdict: "NOT_CHECKABLE", reason_code: "S05_APPLIED_GUARD_WINDOW_NOT_RETAINED", observed_bars: null, clipping: null })) })).toBe(true);
  });
  it("rejects false PASS, missing proof, unknown clipping/basis and private source fields", () => {
    for (const value of [{ ...proof, reason_code: "S05_MISSING" }, { ...proof, folds: [] },
      { ...proof, basis: "TRAIN_TEST_DISJOINT" }, { ...proof, source_locator: "/private/path" },
      { ...proof, folds: [{ ...proof.folds[0], clipping: "GUESS" }, proof.folds[1]] },
      { ...proof, folds: [{ ...proof.folds[0], observed_bars: null }, proof.folds[1]] }]) expect(check(value)).toBe(false);
  });
});
