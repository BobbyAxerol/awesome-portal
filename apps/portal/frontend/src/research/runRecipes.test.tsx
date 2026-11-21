import { cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { emptyDraft } from "./NewRunRoute";
import { applyRecipe, recipeIsSelected, recipesFromSetup, recommendedRecipe, type Recipe } from "./runRecipes";
import type { SetupOptions, SetupProfile } from "./setupClient";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const FIXED_OPTIONS = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures/research-run-setup-options.fixed.valid.json"), "utf8")) as SetupOptions;
const FIXED = FIXED_OPTIONS.profiles[0]!;
const variant = (over: Partial<SetupProfile>): SetupProfile => ({ ...structuredClone(FIXED), ...over });
const V1_V2: SetupProfile["requested_spec_versions"] = ["research.requested-spec.v1", "research.requested-spec.v2"];

const WFO = variant({
  profile_id: "wfo.v1", protocol: "advanced", optimization_schedule: "global",
  requested_spec_versions: V1_V2, trial_count: { min: 2, max: 400 }, trial_default: 10,
  seed_policy: "LOCKED", random_seed: 42, fold_bounds: { min: 2, max: 16 },
  frequencies: ["weekly", "monthly"], window_modes: ["expanding", "rolling"], inner_validation: "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
});
const WFO_V2_TWIN = variant({ ...WFO, profile_id: "wfo.v2", requested_spec_versions: ["research.requested-spec.v2"] });
const CAUSAL = variant({
  profile_id: "causal.v1", protocol: "advanced", optimization_schedule: "per_fold_causal",
  requested_spec_versions: ["research.requested-spec.v2"], trial_count: { min: 1, max: 50 }, trial_default: 5,
  seed_policy: "REQUIRED", random_seed: null, frequencies: ["monthly"], window_modes: ["rolling"],
  inner_validation: "REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY",
  inner_constraints: { fold_bounds: { min: 2, max: 4 }, frequencies: ["weekly"], window_modes: ["expanding", "rolling"], train_window_pattern: "^[0-9]+D$" },
} as Partial<SetupProfile>);
const DISABLED = variant({ profile_id: "off.v1", state: "DISABLED", reason_code: "ALPHA_NOT_DELTA", protocol: "advanced", optimization_mode: "mode_9_x", optimization_schedule: "global" });

function opts(profiles: SetupProfile[], engine: boolean = true): SetupOptions {
  const o = { ...structuredClone(FIXED_OPTIONS), profiles } as SetupOptions;
  if (!engine) delete (o as { engine_options?: unknown }).engine_options;
  return o;
}
const ids = (rs: Recipe[]) => rs.map((r) => r.id);

afterEach(cleanup);

describe("recipesFromSetup", () => {
  it("canonical fixture: one quick-check recipe, catalogue pairs closed after it, capped", () => {
    const rs = recipesFromSetup(FIXED_OPTIONS);
    expect(rs[0]).toMatchObject({ id: "p04.fixed-qualification.v1", label: "Quick check · Three Window", summary: "1 trial · no seed", enabled: true, reasonCode: null });
    const closed = rs.filter((r) => !r.enabled);
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.length).toBeLessThanOrEqual(6);
    expect(closed.every((r) => r.reasonCode === "PROFILE_NOT_OPENED" && rs.indexOf(r) > 0)).toBe(true);
    expect(recommendedRecipe(rs)?.id).toBe("p04.fixed-qualification.v1");
  });
  it("null and older server (no engine_options): only profile recipes", () => {
    expect(recipesFromSetup(null)).toEqual([]);
    expect(ids(recipesFromSetup(opts([FIXED, WFO], false)))).toEqual(["p04.fixed-qualification.v1", "wfo.v1"]);
  });
  it("orders fixed, advanced, causal and collapses v1/v2 twins to the v1 one", () => {
    const rs = recipesFromSetup(opts([CAUSAL, WFO_V2_TWIN, WFO, FIXED], false));
    expect(ids(rs)).toEqual(["p04.fixed-qualification.v1", "wfo.v1", "causal.v1"]);
    expect(rs[1]).toMatchObject({ label: "Walk-forward search", summary: "2–400 trials · seed locked · expanding · weekly", v2Only: false });
    expect(rs[1]!.title).toContain("v2 twin");
    expect(rs[2]!.label).toBe("Causal inner selection");
    expect(rs[2]!.summary).toBe("1–50 trials · seed required · rolling · monthly");
  });
  it("uses v2 when only v2 is enabled", () => {
    const rs = recipesFromSetup(opts([WFO_V2_TWIN], false));
    expect(rs[0]).toMatchObject({ id: "wfo.v2", v2Only: true });
    expect(rs[0]!.title).toContain("requested-spec v2");
    expect(recipesFromSetup(opts([{ ...WFO, state: "DISABLED", reason_code: "X" }, WFO_V2_TWIN], false))[0]!.id).toBe("wfo.v2");
  });
  it("a disabled profile is a closed recipe carrying its own reason; mode names come from the atlas", () => {
    const rs = recipesFromSetup(opts([FIXED, DISABLED], false), { atlasModes: [{ mode_id: "mode_9_x", display_name: "Mode Nine" }] });
    expect(rs.find((r) => !r.enabled)).toMatchObject({ id: "closed:mode_9_x:global", label: "Mode Nine", reasonCode: "ALPHA_NOT_DELTA", enabled: false });
  });
  it("labels of several modes are told apart, never from a fixed list", () => {
    const other = variant({ profile_id: "m2.v1", optimization_mode: "mode_2_sbb", protocol: "advanced" });
    const rs = recipesFromSetup(opts([FIXED, other], false), { atlasModes: [{ mode_id: "mode_2_sbb", display_name: "SBB" }] });
    expect(rs.map((r) => r.label)).toEqual(["Quick check · Three Window · mode 1 decay", "Walk-forward search · SBB"]);
  });
  it("route filter offers only that route", () => {
    const other = variant({ profile_id: "r2.v1", execution_route: "pct_equity" });
    expect(ids(recipesFromSetup(opts([FIXED, other], false), { executionRoute: "signal_notional" }))).toEqual(["p04.fixed-qualification.v1"]);
  });
});

describe("applyRecipe", () => {
  const base = emptyDraft();
  const by = (profiles: SetupProfile[], id: string, ctx = {}) => recipesFromSetup(opts(profiles, false), ctx).find((r) => r.id === id)!;

  it("fixed: protocol/mode/schedule, pinned trial, seed cleared, nothing else", () => {
    const patch = applyRecipe(by([FIXED], FIXED.profile_id), { ...base, randomSeed: "7" });
    expect(patch).toEqual({ protocol: "three_window_decay", optimizationMode: "mode_1_decay", optimizationSchedule: "global", optunaTrials: "1", randomSeed: "" });
  });
  it("advanced: locked seed, trial default, the finest admitted frequency (a short recent span needs 2+ folds), never windows", () => {
    const draft = { ...base, walkForward: { ...base.walkForward, declaredV2: true, frequency: "", windowMode: "" } };
    const patch = applyRecipe(by([WFO], "wfo.v1", { frequencyDefault: "monthly", windowModeDefault: "daily" }), draft);
    expect(patch).toMatchObject({ protocol: "advanced", optunaTrials: "10", randomSeed: "42" });
    expect(patch.walkForward).toMatchObject({ frequency: "weekly", windowMode: "expanding" });
    expect(patch.walkForward!.declaredV2).toBeUndefined();
    expect(Object.keys(patch)).not.toEqual(expect.arrayContaining(["windows", "datasetId", "symbol", "parameters"]));
  });
  it("several trial ranges for one combination: ONE recipe, the widest; a one-trial fixed check stays its own", () => {
    const narrow = variant({ ...WFO, profile_id: "wfo.narrow", trial_count: { min: 3, max: 3 }, trial_default: 3 });
    const wide = variant({ ...WFO, profile_id: "wfo.wide", trial_count: { min: 2, max: 400 }, trial_default: 10 });
    const rs = recipesFromSetup(opts([narrow, wide, FIXED], false));
    expect(ids(rs)).toEqual(["p04.fixed-qualification.v1", "wfo.wide"]);
    expect(rs[1]!.summary).toContain("2–400 trials");
  });
  it("v2-only profile declares v2", () => {
    expect(applyRecipe(by([WFO_V2_TWIN], "wfo.v2"), base).walkForward!.declaredV2).toBe(true);
  });
  it("a v2-only recipe fills the EMPTY temporal guards with the served defaults and keeps typed ones; a v1 recipe sets none", () => {
    const guarded = variant({
      ...WFO, profile_id: "wfo.v2g", requested_spec_versions: ["research.requested-spec.v2"],
      temporal_guards: { policy: "V1_ABSENT_V2_EXPLICIT", defaults: { label_horizon_bars: 3, purge_bars: 2, embargo_bars: 1 }, max_bars: 10000, zero_semantics: "ZERO_APPLIES_NO_TEMPORAL_GUARD" },
    } as Partial<SetupProfile>);
    const empty = applyRecipe(by([guarded], "wfo.v2g"), base).walkForward!;
    expect([empty.labelHorizonBars, empty.purgeBars, empty.embargoBars]).toEqual(["3", "2", "1"]);
    const typed = applyRecipe(by([guarded], "wfo.v2g"), { ...base, walkForward: { ...base.walkForward, purgeBars: "7" } }).walkForward!;
    expect([typed.labelHorizonBars, typed.purgeBars, typed.embargoBars]).toEqual(["3", "7", "1"]);
    const v1 = applyRecipe(by([WFO], "wfo.v1"), base).walkForward!;
    expect([v1.labelHorizonBars, v1.purgeBars, v1.embargoBars]).toEqual([undefined, undefined, undefined]);
  });
  it("required seed is left to the user; causal sets only published inner defaults", () => {
    const draft = { ...base, randomSeed: "9", walkForward: { ...base.walkForward, inner: { splitFrequency: "", windowMode: "rolling", trainWindow: "90D", minFolds: "3" } } };
    const patch = applyRecipe(by([CAUSAL], "causal.v1"), draft);
    expect(patch).not.toHaveProperty("randomSeed");
    expect(patch.optimizationSchedule).toBe("per_fold_causal");
    expect(patch.walkForward!.inner).toEqual({ splitFrequency: "weekly", windowMode: "rolling", trainWindow: "90D", minFolds: "3" });
    expect(applyRecipe(by([CAUSAL], "causal.v1"), base).walkForward!.inner).toEqual({ splitFrequency: "weekly", windowMode: "expanding", trainWindow: "", minFolds: "" });
  });
  it("a closed recipe changes nothing; patch() equals applyRecipe", () => {
    const rs = recipesFromSetup(FIXED_OPTIONS);
    expect(applyRecipe(rs.find((r) => !r.enabled)!, base)).toEqual({});
    expect(rs[0]!.patch(base)).toEqual(applyRecipe(rs[0]!, base));
  });
  it("recipeIsSelected follows protocol, mode, schedule (and v2 for v2-only)", () => {
    const r = by([WFO_V2_TWIN], "wfo.v2");
    expect(recipeIsSelected(r, base)).toBe(false);
    const picked = { ...base, ...applyRecipe(r, base) };
    expect(recipeIsSelected(r, picked)).toBe(true);
    expect(recipeIsSelected(r, { ...picked, walkForward: { ...picked.walkForward, declaredV2: undefined } })).toBe(false);
    expect(recipeIsSelected(recipesFromSetup(FIXED_OPTIONS).find((x) => !x.enabled)!, picked)).toBe(false);
  });
});
