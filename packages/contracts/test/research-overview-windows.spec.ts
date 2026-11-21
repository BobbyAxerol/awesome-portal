import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, it, expect } from "vitest";
import { amendFull02CurrentSource } from "../tooling/generate-research-full02-current-source.mjs";

describe("generated Overview window read model", () => {
  it("publishes optional, named and closed window views reproducibly", () => {
    const original = readFileSync(join(__dirname, "../openapi/research-current-source.openapi.json"), "utf8");
    const document = JSON.parse(original);
    expect(amendFull02CurrentSource(original)).toBe(original);
    const rewrite = (v: any): any => Array.isArray(v) ? v.map(rewrite) : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, n]) => [k, k === "$ref" ? String(n).replace("#/components/schemas/", "#/$defs/") : rewrite(n)])) : v;
    const ajv = new Ajv2020({ strict: false, unicodeRegExp: false });
    ajv.addSchema({ $id: "overview-windows", $defs: rewrite(document.components.schemas) });
    const validate = ajv.getSchema("overview-windows#/$defs/WindowViews")!;
    const fixture = JSON.parse(readFileSync(join(__dirname, "../fixtures/research-current-source.window-views.valid.json"), "utf8"));
    expect(validate(fixture)).toBe(true);
    expect(validate({ ...fixture, holdout: { ...fixture.holdout, state: "AVAILABLE" } })).toBe(false);
    expect(validate({ ...fixture, raw_artifact_path: "/private" })).toBe(false);
    const account = { kind: "ACCOUNT_REPLAY", state: "AVAILABLE", reason_code: null,
      source_ref: "RETAINED_WINDOW_ACCOUNT_V1", metric_policy: "DISPLAY_POINTS_ARE_NOT_A_FULL_METRIC_POPULATION" };
    expect(validate({ ...fixture, is: account, holdout: account })).toBe(true);
    expect(document.components.schemas.Evidence.allOf[1].required).not.toContain("window_views");
    expect(readFileSync(join(__dirname, "../generated/research-current-source.d.ts"), "utf8")).toContain("WindowViews");
  });
});
