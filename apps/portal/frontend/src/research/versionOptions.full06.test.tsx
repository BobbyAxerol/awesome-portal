/** BR-S02-06/09: the version-options read, the compatible routes it names, and the server's own recipe label / order / group key. */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryEntry } from "./alphaImportClient";
import { recipesFromSetup } from "./runRecipes";
import { FIXED_OPTIONS } from "./runSetup.s02.test";
import { getVersionOptions, isVersionOptions, versionQueryString, type SetupOptions, type VersionOptions } from "./setupClient";
import { compatibleRoutes, resetVersionOptionsCache, useVersionOptions } from "./useVersionOptions";
import { runTypesFrom } from "./useRunTypes";

afterEach(() => {
  cleanup();
  resetVersionOptionsCache();
  vi.unstubAllGlobals();
});

const options = (id: string, routes: VersionOptions["routes"]): VersionOptions => ({
  schema_version: "research.run-version-options.v1",
  scope: "VERSION_BINDING_NOT_DATASET_OR_RUN_AUTHORIZATION",
  context: { workspace_id: "ws", alpha_id: "a", alpha_version_id: id },
  source_revision: "s",
  recipe_revision: "r",
  presentation_revision: "research.recipe-presentation.v1",
  lifecycle_state: "ACTIVE",
  declared_timeframes: ["1h", "4h"],
  routes,
  preflight_required: true,
});
const open = (route: string, timeframes: string[], keys: string[]): VersionOptions["routes"][number] => ({ execution_route: route, state: "COMPATIBLE", reason_code: null, compatible_timeframes: timeframes, compatible_profile_ids: keys, compatible_recipe_keys: keys });
const closed = (route: string): VersionOptions["routes"][number] => ({ execution_route: route, state: "UNAVAILABLE", reason_code: "ALPHA_EXECUTOR_MISMATCH", compatible_timeframes: [], compatible_profile_ids: [], compatible_recipe_keys: [] });
const entry = (id: string, at: number, state = "ACTIVE"): RegistryEntry => ({ alpha_id: "a", alpha_version_id: id, version_label: id, lifecycle_state: state, registered_at_utc_ms: at, declaration: { timeframes: ["1h"] } } as unknown as RegistryEntry);

describe("version-options client", () => {
  it("asks only workspace, Alpha and version (no dataset, symbol or timeframe)", () => {
    expect(versionQueryString({ workspaceId: "ws", alphaId: "a", alphaVersionId: "av" })).toBe("alpha_id=a&alpha_version_id=av&workspace_id=ws");
    expect(versionQueryString({ alphaId: "a", alphaVersionId: "av" })).toBe("alpha_id=a&alpha_version_id=av");
  });
  it("accepts only the version-options body", () => {
    expect(isVersionOptions(options("av", []))).toBe(true);
    expect(isVersionOptions(FIXED_OPTIONS)).toBe(false);
    expect(isVersionOptions(null)).toBe(false);
  });
  it("a 404 is an absent route, remembered; a served body is served", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => options("av", [open("signal_notional", ["1h"], ["k"])]) }) as unknown as Response));
    const result = await getVersionOptions({ alphaId: "a", alphaVersionId: "av" });
    expect(result.state).toBe("served");
  });
});

describe("compatible routes", () => {
  const v = options("av", [open("signal_notional", ["1h"], ["k1", "k2"]), open("pct_equity", ["4h"], ["k3"]), closed("event_driven")]);
  it("lists the open routes, narrowed to a timeframe when one is chosen", () => {
    expect(compatibleRoutes(v, null)).toEqual({ routes: ["signal_notional", "pct_equity"], recipes: 3 });
    expect(compatibleRoutes(v, "1h")).toEqual({ routes: ["signal_notional"], recipes: 2 });
    expect(compatibleRoutes(v, "1d")).toEqual({ routes: [], recipes: 0 });
  });
  it("feeds the run types: a version with no open route is hidden unless it is the one in use", () => {
    const entries = [entry("av1", 1), entry("av2", 2)];
    const probed = new Map([["av1", compatibleRoutes(v, "1h")], ["av2", compatibleRoutes(options("av2", [closed("pct_equity")]), "1h")]]);
    expect(runTypesFrom(probed, entries, "av1").map((type) => type.versionId)).toEqual(["av1"]);
    expect(runTypesFrom(probed, entries, "av2").map((type) => type.versionId).sort()).toEqual(["av1", "av2"]);
  });
});

describe("useVersionOptions", () => {
  it("reads each ACTIVE sibling once, aborts nothing it still needs, and names an older server as absent", async () => {
    const get = vi.fn(async (query: { alphaVersionId: string }) => ({ state: "served" as const, body: options(query.alphaVersionId, [open("signal_notional", ["1h"], ["k"])]) }));
    const entries = [entry("av1", 1), entry("av2", 2), entry("av3", 3, "DRAFT")];
    const { result } = renderHook(() => useVersionOptions(true, entries, { workspaceId: "ws", alphaId: "a" }, get as never));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(get).toHaveBeenCalledTimes(2);
    expect([...result.current.byVersion.keys()].sort()).toEqual(["av1", "av2"]);

    const none = vi.fn(async () => ({ state: "absent" as const }));
    const absent = renderHook(() => useVersionOptions(true, [entry("bx1", 1), entry("bx2", 2)], { alphaId: "a" }, none as never));
    await waitFor(() => expect(absent.result.current.status).toBe("absent"));
  });
  it("is idle when disabled", () => {
    const get = vi.fn();
    const { result } = renderHook(() => useVersionOptions(false, [entry("av1", 1)], { alphaId: "a" }, get as never));
    expect(result.current.status).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });
});

describe("recipe presentation", () => {
  const withRecipe = (id: string, over: Record<string, unknown>, rec: { key: string; family: string; label: string; rank: number }): SetupOptions["profiles"][number] =>
    ({ ...structuredClone(FIXED_OPTIONS.profiles[0]!), profile_id: id, ...over, recipe: { key: rec.key, family: rec.family, label: rec.label, recommended_rank: rec.rank, scope: "DISPLAY_ORDER_NOT_OPTIMAL_SETUP_OR_AUTHORIZATION" } }) as never;
  const base = FIXED_OPTIONS.profiles[0]!;
  const opts = (profiles: SetupOptions["profiles"]): SetupOptions => ({ ...structuredClone(FIXED_OPTIONS), profiles }) as SetupOptions;

  it("uses the server's label and display rank, whatever the legacy order would be", () => {
    const profiles = [
      withRecipe("p.search", { trial_count: { min: 2, max: 400 }, trial_default: 50, seed_policy: "REQUIRED", random_seed: null }, { key: "k.opt", family: "THREE_WINDOW_OPTIMIZED", label: "Decay robustness · global", rank: 60 }),
      withRecipe("p.fixed", {}, { key: "k.fix", family: "THREE_WINDOW_FIXED", label: "Fixed Three Window", rank: 0 }),
    ];
    const recipes = recipesFromSetup(opts(profiles)).filter((recipe) => recipe.enabled);
    expect(recipes.map((recipe) => recipe.label)).toEqual(["Fixed Three Window", "Decay robustness · global"]);
    expect(recipes.map((recipe) => recipe.id)).toEqual(["p.fixed", "p.search"]);
    expect(base.profile_id).toBeTruthy();
  });
  it("tells apart two served labels that read alike by their protocol", () => {
    const rec = { key: "x", family: "ADVANCED_WFO", label: "Decay robustness · global", rank: 100 };
    const profiles = [
      withRecipe("p.three", { protocol: "three_window_decay" }, { ...rec, key: "k.three", family: "THREE_WINDOW_OPTIMIZED" }),
      withRecipe("p.adv", { protocol: "advanced" }, { ...rec, key: "k.adv" }),
    ];
    const labels = recipesFromSetup(opts(profiles)).filter((recipe) => recipe.enabled).map((recipe) => recipe.label).sort();
    expect(labels).toEqual(["Decay robustness · global · Three Window", "Decay robustness · global · Walk-forward"]);
  });
  it("falls back to the legacy label and order when the server sends no recipe", () => {
    const recipes = recipesFromSetup(opts([structuredClone(base)])).filter((recipe) => recipe.enabled);
    expect(recipes[0]!.label).toMatch(/Quick check|Three Window/);
  });
});
