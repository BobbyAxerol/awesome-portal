/**
 * Navigation derived from the Feature Registry — U03.
 *
 * Sidebar, command palette, breadcrumbs, route guards and legacy redirects are
 * all computed here from the registry document. Nothing in the shell may
 * hard-code a feature list; adding a commissioned feature must be a registry
 * change only (Unified Plan U03 exit gate).
 *
 * Pure functions: no React, no fetch, so the whole navigation contract is
 * unit-testable against the shipped `registry.public.json` fixture.
 */
import type {
  FeatureGroupDefinition,
  LifecycleStageDefinition,
  PortalEnvironment,
  PortalFeatureDefinition,
  PortalRegistryDocument,
  ScreenContract,
} from "./contracts";

/** Bootstrap routes the shell owns directly (FRONTEND_HANDOFF §2). */
export const BOOTSTRAP_ROUTES = {
  registryError: "/_portal/registry-error",
  notFound: "/_portal/not-found",
} as const;

export interface NavGroup {
  group: FeatureGroupDefinition;
  features: PortalFeatureDefinition[];
}

export interface NavOptions {
  /** Current runtime environment; features not scoped to it are dropped. */
  environment?: PortalEnvironment | null;
  /** User preference: hide COMMISSIONED/BLOCKED entries (v0.4 §P0.7). */
  showCommissioned?: boolean;
}

/** Maturities that actually have a runtime in some environment. */
const RUNTIME_MATURITIES = new Set(["AVAILABLE", "PROTOTYPE", "DEPRECATED"]);

/**
 * HIDDEN never leaves the backend in BAR-01, but the frontend filters it too
 * so a future contract change cannot leak an entry into the sidebar.
 *
 * Environment scoping applies only to features that HAVE a runtime.
 * `environments` says where a feature operates: PAPER_TRADING declares
 * `["paper"]`, so strict filtering would hide the entire Deployments group
 * from a research environment. A COMMISSIONED feature has no runtime in any
 * environment, and v0.4 §P0.7 requires its brief to stay visible so a manager
 * can see the whole Portal. Its preview is therefore environment-independent;
 * only the `showCommissioned` preference hides it.
 *
 * DISCREPANCY raised to codex: whether `environments` is meant as "where it
 * runs" or "where it is listed" is not stated in the registry schema. This
 * reading is the one that satisfies §P0.7; see the Backend request.
 */
function isNavigable(feature: PortalFeatureDefinition, options: NavOptions): boolean {
  if (feature.maturity === "HIDDEN") return false;
  if (options.showCommissioned === false) {
    if (feature.maturity === "COMMISSIONED" || feature.maturity === "BLOCKED") return false;
  }
  if (
    options.environment &&
    RUNTIME_MATURITIES.has(feature.maturity) &&
    !feature.environments.includes(options.environment)
  ) {
    return false;
  }
  return true;
}

function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

/** Sidebar model: groups in registry order, each holding its ordered features. */
export function sidebarGroups(
  registry: PortalRegistryDocument,
  options: NavOptions = {},
): NavGroup[] {
  return [...registry.feature_groups]
    .sort(byOrder)
    .map((group) => ({
      group,
      features: registry.features
        .filter((feature) => feature.group === group.id)
        .filter((feature) => feature.navigation.show_in_sidebar)
        .filter((feature) => isNavigable(feature, options))
        .sort((a, b) => a.navigation.order - b.navigation.order),
    }))
    .filter((entry) => entry.features.length > 0);
}

export interface PaletteEntry {
  id: string;
  label: string;
  /** Group label, shown as the palette section heading. */
  group: string;
  route: string;
  maturity: PortalFeatureDefinition["maturity"];
  /** `feature` entries open a module; `screen` entries deep-link inside one. */
  kind: "feature" | "screen";
  keywords: string;
}

/**
 * Command palette entries: every palette-enabled feature plus the screens the
 * registry declares a route for. Screens without a route are not addressable,
 * so they are not offered.
 */
export function commandPaletteEntries(
  registry: PortalRegistryDocument,
  options: NavOptions = {},
): PaletteEntry[] {
  const groupLabel = new Map(registry.feature_groups.map((g) => [g.id, g.label]));
  const features = registry.features
    .filter((feature) => feature.navigation.show_in_command_palette)
    .filter((feature) => isNavigable(feature, options));

  const featureEntries: PaletteEntry[] = features.map((feature) => ({
    id: feature.id,
    label: feature.label,
    group: groupLabel.get(feature.group) ?? feature.group,
    route: feature.canonical_route,
    maturity: feature.maturity,
    kind: "feature",
    keywords: `${feature.label} ${feature.id} ${feature.description}`.toLowerCase(),
  }));

  const visible = new Set(features.map((f) => f.id));
  const screenEntries: PaletteEntry[] = registry.screens
    .filter((screen) => screen.route !== "" && visible.has(screen.feature_id))
    .filter((screen) => screen.maturity !== "HIDDEN")
    .map((screen) => ({
      id: screen.screen_id,
      label: screen.primary_decision || screen.screen_id,
      group: groupLabel.get(
        registry.features.find((f) => f.id === screen.feature_id)?.group ?? "command",
      ) ?? "",
      route: screen.route,
      maturity: screen.maturity,
      kind: "screen" as const,
      keywords: `${screen.screen_id} ${screen.primary_decision}`.toLowerCase(),
    }));

  return [...featureEntries, ...screenEntries];
}

/** Substring match over label/id/description. Ranking keeps features first. */
export function filterPalette(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries.filter((entry) => entry.kind === "feature");
  return entries
    .filter((entry) => entry.keywords.includes(needle))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "feature" ? -1 : 1));
}

/* -------------------------------------------------------------------------
 * Route resolution
 * ---------------------------------------------------------------------- */

/**
 * Finds the feature owning a pathname, preferring the longest canonical route
 * so `/research/quantbt` wins over `/` for `/research/quantbt/runs`.
 */
export function featureForPath(
  registry: PortalRegistryDocument,
  pathname: string,
): PortalFeatureDefinition | null {
  let best: PortalFeatureDefinition | null = null;
  for (const feature of registry.features) {
    const route = feature.canonical_route;
    const matches = route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`);
    if (!matches) continue;
    if (!best || route.length > best.canonical_route.length) best = feature;
  }
  return best;
}

/** Every legacy route the registry declares, mapped to its owning feature. */
export function legacyRouteOwners(
  registry: PortalRegistryDocument,
): Map<string, PortalFeatureDefinition> {
  const owners = new Map<string, PortalFeatureDefinition>();
  for (const feature of registry.features) {
    for (const route of feature.legacy_routes) owners.set(route, feature);
  }
  return owners;
}

export interface Breadcrumb {
  label: string;
  route: string | null;
}

/** Group -> feature trail. The group is a label, not a navigable route. */
export function breadcrumbsFor(
  registry: PortalRegistryDocument,
  pathname: string,
): Breadcrumb[] {
  const feature = featureForPath(registry, pathname);
  if (!feature) return [];
  const group = registry.feature_groups.find((g) => g.id === feature.group);
  const trail: Breadcrumb[] = [];
  if (group) trail.push({ label: group.label, route: null });
  trail.push({ label: feature.label, route: feature.canonical_route });
  return trail;
}

/* -------------------------------------------------------------------------
 * Screens, lifecycle and concerns
 * ---------------------------------------------------------------------- */

export function screensForFeature(
  registry: PortalRegistryDocument,
  featureId: string,
): ScreenContract[] {
  return registry.screens.filter((screen) => screen.feature_id === featureId);
}

export function lifecycleStages(registry: PortalRegistryDocument): LifecycleStageDefinition[] {
  return [...registry.lifecycle_stages].sort(byOrder);
}

/* -------------------------------------------------------------------------
 * Persona
 *
 * `lifecycle_stages[].personas` is now a declared field: the backend rolls
 * `primary_persona` up across each stage's feature screens at projection time
 * (contract note on `LifecycleStageDefinition`, delivered 2026-08-17). v1.1
 * computed the same roll-up in the frontend as a stopgap; that second model is
 * gone — the registry is the authority, and the UI only reads it.
 *
 * The field is schema-optional and defaults to `[]`, which stays meaningful: a
 * stage whose features have no screens yet declares no persona, and the map
 * must not pretend otherwise.
 * ---------------------------------------------------------------------- */

/** Personas the registry declares for a stage. Empty means "none declared". */
export function personasForStage(stage: LifecycleStageDefinition): string[] {
  return [...(stage.personas ?? [])].sort();
}

/** Every persona any stage declares, in a stable order. */
export function personaOptions(registry: PortalRegistryDocument): string[] {
  const seen = new Set<string>();
  for (const stage of registry.lifecycle_stages) {
    for (const persona of stage.personas ?? []) seen.add(persona);
  }
  return [...seen].sort();
}

/** Blocking, still-open concerns attached to a feature. */
export function blockingConcernsFor(registry: PortalRegistryDocument, featureId: string) {
  const unresolved = new Set(["OPEN", "PARTIAL", "BLOCKED"]);
  return registry.concerns.filter(
    (concern) =>
      concern.severity === "BLOCKING" &&
      unresolved.has(concern.status) &&
      concern.feature_ids.includes(featureId),
  );
}
