/** BR-S02-14: the Atlas names the routes a qualified recipe opens; a blocked route is one with no enabled recipe. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { constraintsFrom } from "./NewRunRoute";

const dir = join(__dirname, "..", "..", "..", "..", "..", "packages/contracts/fixtures");
const read = <T,>(name: string): T => JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
const ATLAS = read<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json").atlas;
const REGISTRY = read<RegistryListResponse>("research-alpha-import.registry.valid.json");

describe("Atlas recipes_enabled", () => {
  const closed = ATLAS.routes.find((route) => route.axes.admission !== "P04_BASELINE_ONLY");
  it("the fixture has a route the pinned catalogue does not admit", () => {
    expect(closed).toBeDefined();
  });
  it("a route stays blocked when the Atlas names no enabled recipe, and opens when it names one", () => {
    const withRecipes = (recipes: string[] | undefined): AtlasDocument => ({ ...ATLAS, routes: ATLAS.routes.map((route) => (route.route_id === closed!.route_id ? { ...route, recipes_enabled: recipes } : route)) });
    const entries = REGISTRY.entries;
    const id = entries[0]!.alpha_version_id;
    expect(constraintsFrom(withRecipes([]), entries, id).blockedRoutes[closed!.route_id]).toBe(closed!.reason);
    expect(constraintsFrom(withRecipes(["p10.delta-intrabar-bracket-fixed-1h.v3"]), entries, id).blockedRoutes[closed!.route_id]).toBeUndefined();
  });
  it("an Atlas that does not publish the field falls back to the routes the setup opened", () => {
    const entries = REGISTRY.entries;
    const id = entries[0]!.alpha_version_id;
    const old: AtlasDocument = { ...ATLAS, routes: ATLAS.routes.map((route) => ({ ...route, recipes_enabled: undefined })) };
    expect(constraintsFrom(old, entries, id).blockedRoutes[closed!.route_id]).toBe(closed!.reason);
    expect(constraintsFrom(old, entries, id, { catalog: null, datasetId: "", openedRoutes: new Set([closed!.route_id]) }).blockedRoutes[closed!.route_id]).toBeUndefined();
  });
});
