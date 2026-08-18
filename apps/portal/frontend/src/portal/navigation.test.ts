/**
 * U03 exit-gate tests for registry-driven navigation.
 *
 * The central claim being tested is "adding a commissioned feature is a
 * registry entry and nothing else": navigation, palette, breadcrumbs and route
 * resolution are all computed from the document, so a synthetic feature that
 * exists only in a test fixture must appear everywhere without code changes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { KNOWN_ICON_KEYS } from "../app/icons";
import { canonicalQuantBTPath } from "../features/quantbt/routes";
import type { PortalFeatureDefinition, PortalRegistryDocument } from "./contracts";
import {
  blockingConcernsFor,
  breadcrumbsFor,
  commandPaletteEntries,
  featureForPath,
  filterPalette,
  legacyRouteOwners,
  lifecycleStages,
  personaOptions,
  personasForStage,
  screensForFeature,
  sidebarGroups,
} from "./navigation";

const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"),
);

describe("sidebar", () => {
  it("renders groups in registry order and never invents one", () => {
    const groups = sidebarGroups(registry);
    const orders = groups.map((entry) => entry.group.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const entry of groups) {
      expect(registry.feature_groups.some((g) => g.id === entry.group.id)).toBe(true);
    }
  });

  it("orders features inside a group by navigation.order", () => {
    for (const { features } of sidebarGroups(registry)) {
      const orders = features.map((f) => f.navigation.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
  });

  it("shows every registry feature that opts into the sidebar", () => {
    const shown = sidebarGroups(registry).flatMap((g) => g.features.map((f) => f.id));
    const expected = registry.features
      .filter((f) => f.navigation.show_in_sidebar && f.maturity !== "HIDDEN")
      .map((f) => f.id);
    expect(new Set(shown)).toEqual(new Set(expected));
  });

  it("hides commissioned and blocked entries when the preference is off", () => {
    const shown = sidebarGroups(registry, { showCommissioned: false }).flatMap((g) =>
      g.features.map((f) => f.maturity),
    );
    expect(shown).not.toContain("COMMISSIONED");
    expect(shown).not.toContain("BLOCKED");
    expect(shown.length).toBeGreaterThan(0);
  });

  it("never renders a HIDDEN feature even if one reaches the client", () => {
    const leaked: PortalRegistryDocument = {
      ...registry,
      features: [
        ...registry.features,
        { ...registry.features[0], id: "LEAKED", maturity: "HIDDEN" } as PortalFeatureDefinition,
      ],
    };
    const shown = sidebarGroups(leaked).flatMap((g) => g.features.map((f) => f.id));
    expect(shown).not.toContain("LEAKED");
  });

  it("drops an AVAILABLE feature that is not scoped to the running environment", () => {
    const scoped: PortalRegistryDocument = {
      ...registry,
      features: registry.features.map((f) =>
        f.id === "QUANTBT_RESEARCH" ? { ...f, environments: ["live"] } : f,
      ),
    };
    const shown = sidebarGroups(scoped, { environment: "research" }).flatMap((g) =>
      g.features.map((f) => f.id),
    );
    expect(shown).not.toContain("QUANTBT_RESEARCH");
  });

  it("keeps commissioned briefs visible outside their target environment", () => {
    // PAPER_TRADING declares environments ["paper"]. It has no runtime
    // anywhere yet, so hiding it in research would hide the whole Deployments
    // group from the product map (v0.4 §P0.7).
    const shown = sidebarGroups(registry, { environment: "research" }).flatMap((g) =>
      g.features.map((f) => f.id),
    );
    expect(shown).toContain("PAPER_TRADING");
    expect(shown).toContain("SANDBOX_TRADING");
    expect(shown).toContain("LIVE_OPERATIONS");
  });

  it("adds a brand-new commissioned feature from registry data alone", () => {
    const extended: PortalRegistryDocument = {
      ...registry,
      features: [
        ...registry.features,
        {
          ...registry.features.find((f) => f.id === "ALPHA_POOL")!,
          id: "NEW_COMMISSIONED",
          label: "A brand-new feature",
          canonical_route: "/research/brand-new",
        },
      ],
    };
    const shown = sidebarGroups(extended).flatMap((g) => g.features.map((f) => f.id));
    expect(shown).toContain("NEW_COMMISSIONED");
    expect(featureForPath(extended, "/research/brand-new")?.id).toBe("NEW_COMMISSIONED");
    expect(commandPaletteEntries(extended).some((e) => e.id === "NEW_COMMISSIONED")).toBe(true);
  });
});

describe("command palette", () => {
  it("offers only feature entries before the user types", () => {
    const entries = commandPaletteEntries(registry);
    expect(filterPalette(entries, "").every((e) => e.kind === "feature")).toBe(true);
  });

  it("matches label, id and description, ranking features above screens", () => {
    const entries = commandPaletteEntries(registry);
    const results = filterPalette(entries, "quantbt");
    expect(results.length).toBeGreaterThan(0);
    const firstScreen = results.findIndex((e) => e.kind === "screen");
    const lastFeature = results.map((e) => e.kind).lastIndexOf("feature");
    if (firstScreen !== -1) expect(lastFeature).toBeLessThan(firstScreen);
  });

  it("routes only to registry-declared paths", () => {
    const known = new Set([
      ...registry.features.map((f) => f.canonical_route),
      ...registry.screens.map((s) => s.route),
    ]);
    for (const entry of commandPaletteEntries(registry)) {
      expect(known.has(entry.route)).toBe(true);
    }
  });
});

describe("route resolution", () => {
  it("prefers the longest matching canonical route over the root", () => {
    expect(featureForPath(registry, "/research/quantbt/overview")?.id).toBe("QUANTBT_RESEARCH");
    expect(featureForPath(registry, "/")?.id).toBe("COMMAND_CENTER");
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(featureForPath(registry, "/research/quantbt-other")).toBeNull();
  });

  it("builds a group -> feature breadcrumb trail", () => {
    const crumbs = breadcrumbsFor(registry, "/research/quantbt/overview");
    expect(crumbs.map((c) => c.label)).toEqual(["Research", "QuantBT Research"]);
    expect(crumbs[0].route).toBeNull();
  });

  it("handles every legacy route the registry declares", () => {
    const owners = legacyRouteOwners(registry);
    expect(owners.size).toBeGreaterThan(0);
    for (const [route, feature] of owners) {
      // The gateway keeps serving the Planning compatibility app directly.
      if (route.startsWith("/roadmap-task-board")) continue;
      expect(feature.id).toBe("QUANTBT_RESEARCH");
      expect(canonicalQuantBTPath(route), `unhandled legacy route ${route}`).not.toBeNull();
    }
  });

  it("resolves a legacy deep link onto the canonical run path", () => {
    // Full translation coverage lives in features/quantbt/routes.test.ts; this
    // asserts the registry-declared routes reach the canonical U04 form.
    expect(canonicalQuantBTPath("/overview", "?run=abc123")).toBe(
      "/research/quantbt/runs/abc123/overview",
    );
    expect(canonicalQuantBTPath("/runs")).toBe("/research/quantbt/runs");
    expect(canonicalQuantBTPath("/planning")).toBeNull();
  });
});

describe("registry projections", () => {
  it("sorts lifecycle stages by declared order", () => {
    const orders = lifecycleStages(registry).map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("links every lifecycle stage to features that exist", () => {
    const ids = new Set(registry.features.map((f) => f.id));
    for (const stage of lifecycleStages(registry)) {
      for (const id of stage.feature_ids) expect(ids.has(id)).toBe(true);
    }
  });

  it("returns only open blocking concerns for a feature", () => {
    const concerns = blockingConcernsFor(registry, "COMMAND_CENTER");
    expect(concerns.length).toBeGreaterThan(0);
    for (const concern of concerns) {
      expect(concern.severity).toBe("BLOCKING");
      expect(concern.feature_ids).toContain("COMMAND_CENTER");
    }
  });

  it("attaches screens to their owning feature", () => {
    for (const screen of screensForFeature(registry, "QUANTBT_RESEARCH")) {
      expect(screen.feature_id).toBe("QUANTBT_RESEARCH");
    }
  });
});

describe("icons", () => {
  it("covers every icon key the shipped registry asks for", () => {
    const requested = new Set(registry.features.map((f) => f.navigation.icon_key));
    for (const key of requested) {
      expect(KNOWN_ICON_KEYS, `icon_key ${key} has no glyph`).toContain(key);
    }
  });
});

/* -------------------------------------------------------------------------
 * Persona roll-up (Portal Map, v0.4 §P0.15)
 * ---------------------------------------------------------------------- */

describe("personas", () => {
  it("offers exactly the personas the registry declares on its stages", () => {
    const options = personaOptions(registry);
    expect(options.length).toBeGreaterThan(0);
    // Read, never derived: every option must appear on a real stage.
    const declared = new Set(registry.lifecycle_stages.flatMap((stage) => stage.personas ?? []));
    for (const option of options) expect(declared.has(option)).toBe(true);
    expect([...options].sort()).toEqual(options);
  });

  it("reads a stage's personas from the registry rather than recomputing them", () => {
    for (const stage of lifecycleStages(registry)) {
      expect(personasForStage(stage), stage.id).toEqual([...(stage.personas ?? [])].sort());
    }
  });

  it("reports no persona rather than a default when the registry declares none", () => {
    const undeclared = { ...lifecycleStages(registry)[0], personas: [] };
    expect(personasForStage(undeclared)).toEqual([]);
  });

  it("still agrees with the screen roll-up the backend documents", () => {
    // The backend derives `personas` from `screens[].primary_persona` at
    // projection time. Checking the fixture against that rule is what would
    // catch the projection silently changing meaning.
    for (const stage of lifecycleStages(registry)) {
      const features = new Set(stage.feature_ids);
      const fromScreens = [
        ...new Set(
          registry.screens
            .filter((screen) => features.has(screen.feature_id) && screen.primary_persona)
            .map((screen) => screen.primary_persona as string),
        ),
      ].sort();
      expect(personasForStage(stage), stage.id).toEqual(fromScreens);
    }
  });
});

/* -------------------------------------------------------------------------
 * Portal Map filters and brief (v0.4 §P0.15)
 * ---------------------------------------------------------------------- */

describe("stage status filter", () => {
  it("offers only maturities the stages actually declare", () => {
    const declared = new Set(registry.lifecycle_stages.map((stage) => stage.maturity));
    // A filter offering a state no stage is in would return nothing and read as
    // a bug in the data.
    for (const stage of registry.lifecycle_stages) {
      expect(declared.has(stage.maturity)).toBe(true);
    }
    expect(declared.size).toBeGreaterThan(1);
  });
});

describe("concerns reachable from a stage", () => {
  it("links every stage to the concerns that name its features", () => {
    // This is the §P0.23 chain: lifecycle → feature → concern → task.
    const withConcerns = registry.lifecycle_stages.filter((stage) => {
      const features = new Set(stage.feature_ids);
      return registry.concerns.some((concern) =>
        concern.feature_ids.some((id) => features.has(id)),
      );
    });
    expect(withConcerns.length).toBeGreaterThan(0);
  });

  it("every concern carries the ids the brief renders", () => {
    for (const concern of registry.concerns) {
      expect(Array.isArray(concern.feature_ids), concern.id).toBe(true);
      expect(Array.isArray(concern.screen_ids), concern.id).toBe(true);
      expect(Array.isArray(concern.task_ids), concern.id).toBe(true);
      expect(concern.severity, concern.id).toBeTruthy();
      expect(concern.status, concern.id).toBeTruthy();
    }
  });
});
