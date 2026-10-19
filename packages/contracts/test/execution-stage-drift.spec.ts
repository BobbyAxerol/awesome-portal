import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { exactStageDrift } from "../../../apps/control-api/src/execution/stage-drift.contract";
import type { operations } from "../generated/execution-stage-drift";

type ExactWire = operations["executionAlphaStageDriftExactV2"]["responses"][200]["content"]["application/json"];
const read = (name: string) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
const fixture = read("fixtures/execution-alpha-stage-drift.v2.synthetic.json");
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(read("schemas/execution-alpha-stage-drift.v2.schema.json"));

describe("FE-054 exact opt-in daily stage read", () => {
  it.each(fixture.cases)("publishes $name without pretending to be product proof", ({ value }: { value: ExactWire }) => {
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    expect(exactStageDrift.safeParse(value).success).toBe(true);
    expect(value.qualification).toBe("RETAINED_OBSERVATIONS_NOT_FINANCIAL_CERTIFICATION");
    expect(value.research_binding.run_id).toBeNull();
  });
  it.each([0, 9007199254740992, "NaN", "Infinity", "1e3", "0\n", "01.2", "1".repeat(129)])("rejects non-exact or malformed money %j", bad => {
    const value = structuredClone(fixture.cases[0].value);
    value.stages.paper.series[0] = bad;
    expect(validate(value)).toBe(false);
    expect(exactStageDrift.safeParse(value).success).toBe(false);
  });
  it.each(["PENDING", "", "NO_EQUITY_FOR_DAY\n"])("rejects untyped reason %j", bad => {
    const value = structuredClone(fixture.cases[1].value);
    value.stages.paper.series_reason_codes[1] = bad;
    expect(validate(value)).toBe(false);
    expect(exactStageDrift.safeParse(value).success).toBe(false);
  });
  it.each([
    (v: any) => v.calendar.reverse(),
    (v: any) => v.calendar.push(v.calendar[0]),
    (v: any) => v.stages.paper.series.pop(),
    (v: any) => v.stages.paper.series_reason_codes.pop(),
    (v: any) => v.stages.paper.series_reason_codes[0] = "NO_EQUITY_FOR_DAY",
    (v: any) => v.stages.paper.series[0] = null,
    (v: any) => v.stages.paper.currency = null,
    (v: any) => v.stages.paper.deployed = false,
    (v: any) => v.stages.paper.reason_code = "NO_DEPLOYMENT_IN_STAGE",
  ])("enforces cross-array invariants beyond standard JSON Schema", mutate => {
    const value = structuredClone(fixture.cases[0].value);
    mutate(value);
    expect(exactStageDrift.safeParse(value).success).toBe(false);
  });
  it("does not silently replace or widen the V1 route", () => {
    const doc = read("openapi/execution-stage-drift.openapi.json");
    const get = doc.paths["/api/v1/execution/alphas/{alphaId}/stage-drift"].get;
    expect(get.parameters.find((p: any) => p.name === "numeric_format")).toMatchObject({ required: true, schema: { enum: ["DECIMAL_STRING"] } });
    expect(get.operationId).toBe("executionAlphaStageDriftExactV2");
    expect(get.responses).toHaveProperty("403");
    const value = structuredClone(fixture.cases[0].value);
    value.authority = "CERTIFIED_NAV";
    expect(validate(value)).toBe(false);
    expect(exactStageDrift.safeParse(value).success).toBe(false);
  });
});
