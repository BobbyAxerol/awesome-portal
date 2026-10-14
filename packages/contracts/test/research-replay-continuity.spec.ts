import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { amendReplayContinuity } from "../tooling/generate-research-replay-continuity.mjs";
const root = resolve(__dirname, "..");
const original = readFileSync(resolve(root, "openapi/research-current-source.openapi.json"), "utf8");
const doc = JSON.parse(original), defs = JSON.parse(JSON.stringify(doc.components.schemas).replaceAll("#/components/schemas/", "#/$defs/"));
const ajv = new Ajv2020({ strict: false, allErrors: true, unicodeRegExp: false });
const valid = (name: string, value: unknown) => ajv.compile({ $defs: defs, $ref: `#/$defs/${name}` })(value);
const fixture = (name: string) => JSON.parse(readFileSync(resolve(root, `fixtures/research-replay-continuity.${name}.synthetic.valid.json`), "utf8"));

describe("§58 generated Replay contract", () => {
  it("publishes Mode5 and multi-fold canonical fixtures, explicitly synthetic not runtime qualification", () => {
    const multi = fixture("multifold");
    expect(valid("ReplaySplitShape", fixture("mode5"))).toBe(true);
    expect(valid("ReplaySplitShape", multi.split_shape)).toBe(true);
    expect(valid("ReplayBoundaryFact", multi.boundaries[0])).toBe(true);
    expect(valid("ReplayWindowCursor", multi.window_cursor)).toBe(true);
    expect(valid("ReplayPage", multi.page)).toBe(true);
  });
  it("rejects Mode5 held-out claims, extra fields, missing identities and invalid cursor values", () => {
    const full = fixture("mode5"), multi = fixture("multifold");
    for (const bad of [{ ...full, oos_applicable: true }, { ...full, independent_holdout: true },
      { ...full, windows: [] }, { ...full, injected: true }]) expect(valid("ReplaySplitShape", bad)).toBe(false);
    const boundary = structuredClone(multi.boundaries[0]); delete boundary.previous_selection.study_id;
    expect(valid("ReplayBoundaryFact", boundary)).toBe(false);
    const missing = structuredClone(multi.boundaries[0]); missing.selection.study_id = null;
    expect(valid("ReplayBoundaryFact", missing)).toBe(false);
    missing.selection.study_reason_code = "RETAINED_STUDY_ID_NOT_PUBLISHED";
    expect(valid("ReplayBoundaryFact", missing)).toBe(true);
    expect(valid("ReplayWindowCursor", { ...multi.window_cursor, state: "NOT_PUBLISHED" })).toBe(false);
    expect(valid("ReplayWindowCursor", { ...multi.window_cursor, next_window_cursor: "raw-offset:168" })).toBe(false);
  });
  it("raises only the named observation Replay cap, leaves journal/Search/other readers untouched", () => {
    const multi = fixture("multifold");
    expect(valid("ReplayPage", { ...multi.page, limit: 401 })).toBe(false);
    expect(valid("ReplayPage", { ...multi.page, max_bars: 200 })).toBe(false);
    expect(doc.components.parameters.Limit.schema.maximum).toBe(200);
    expect(doc.components.parameters.ReplayLimit.schema.maximum).toBe(400);
    const p = doc.paths["/api/v1/quantbt/runs/{runId}/current-source/replay"].get.parameters;
    expect(p).toContainEqual({ $ref: "#/components/parameters/ReplayLimit" });
    expect(doc.paths["/api/v1/quantbt/runs/{runId}/current-source/search"].get.parameters)
      .toContainEqual({ $ref: "#/components/parameters/Limit" });
  });
  it("generation is idempotent, preserves unrelated components and exposes named generated types", () => {
    expect(amendReplayContinuity(original)).toBe(original);
    const amended = JSON.parse(amendReplayContinuity(original));
    for (const [name, value] of Object.entries(doc.components.schemas))
      if (!["Replay", "ReplayExecution", "ReplayPage", "ReplaySplitShape", "ReplayBoundaryFact", "ReplayWindowCursor"].includes(name))
        expect(amended.components.schemas[name]).toEqual(value);
    const generated = readFileSync(resolve(root, "generated/research-current-source.d.ts"), "utf8");
    for (const name of ["ReplaySplitShape", "ReplayBoundaryFact", "ReplayWindowCursor", "ReplayPage"])
      expect(generated).toContain(`${name}:`);
  });
});
