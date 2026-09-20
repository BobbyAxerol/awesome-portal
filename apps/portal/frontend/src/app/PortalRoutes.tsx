/**
 * Route table generated from the Feature Registry — U03.
 *
 * Every canonical route below is a registry entry. A feature with no
 * implemented module resolves to its preview, which is what makes the U03 exit
 * gate literally true: adding a commissioned feature is a registry change and
 * nothing else.
 *
 * Only bootstrap routes are hard-coded (FRONTEND_HANDOFF §2): registry error,
 * not-found, and the legacy compatibility redirects.
 */
import { Suspense, lazy, type ComponentType } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { ResultsSkeleton, StateView } from "../components/ui";
import { CommandCenter } from "../features/command-center/CommandCenter";
import { PortalMap } from "../features/portal-map/PortalMap";
import { FeaturePreview } from "../features/preview/FeaturePreview";
import { QUANTBT_ROOT, canonicalQuantBTPath } from "../features/quantbt/routes";
import type { PortalFeatureDefinition, PortalRegistryDocument } from "../portal/contracts";
import {
  EXECUTION_PREVIEW_ENABLED,
  EXECUTION_PREVIEW_FEATURE_DEFAULTS,
  hasExecutionPreview,
  EXECUTION_PREVIEW_EXTRA_ROUTES,
} from "../execution/previewRegistry";
import { screenDeliveryProfile, screenDeliveryPolicy } from "../execution/profile";

/**
 * Heavy modules are loaded when their route is entered, not before.
 *
 * The Command Center renders a ledger bar, two summary cards and a list — and it
 * was waiting on ECharts and the whole embedded Task Board to parse first, because
 * a static import puts them in the entry chunk. The landing screen paid for every
 * screen in the product.
 *
 * Only the two big ones are split: QuantBT (which owns the charts) and Planning
 * (which owns the board and mermaid). The Command Center, Portal Map and the
 * previews stay eager — they are small, and the shell needs them immediately.
 */
const QuantBTModule = lazy(() =>
  import("../features/quantbt/QuantBTModule").then((m) => ({ default: m.QuantBTModule })),
);
const PlanningModule = lazy(() =>
  import("../features/planning/PlanningModule").then((m) => ({ default: m.PlanningModule })),
);
const UsersAccess = lazy(() =>
  import("../features/admin/UsersAccess").then((m) => ({ default: m.UsersAccess })),
);
const ProfileAccess = lazy(() =>
  import("../features/admin/ProfileAccess").then((m) => ({ default: m.ProfileAccess })),
);
const ExecutionFixtures = lazy(() => import("../execution/Fixtures"));
const ResearchFixtures = lazy(() => import("../research/ResearchFixtures"));
const ExecutionPreviewRoute = lazy(() =>
  import("../execution/ExecutionPreviewRoute").then((m) => ({
    default: m.ExecutionPreviewRoute,
  })),
);

/**
 * Registry feature id -> implemented module.
 *
 * `wildcard` features own their sub-paths and declare their own inner routes.
 */
const MODULES: Record<string, { component: ComponentType; wildcard?: boolean }> = {
  COMMAND_CENTER: { component: CommandCenter },
  /*
   * A4-3/A4-4 · Profile & Access is now a real feature, so it is mapped here
   * rather than routed beside the registry.
   *
   * The comment below on ADMIN_USERS_ROUTE explains why it was NOT mapped
   * before: the registry called it COMMISSIONED, and rendering a working
   * screen behind a "not built yet" badge would make the badge lie. A4-3 built
   * it, so the registry now says AVAILABLE and the mapping is the honest one —
   * and, more importantly, it keeps ONE feature model (§3.2) instead of a
   * screen that exists in the router and not in the product's own map.
   */
  PROFILE_ACCESS: { component: ProfileAccess },
  PORTAL_MAP: { component: PortalMap },
  QUANTBT_RESEARCH: { component: QuantBTModule, wildcard: true },
  PLANNING: { component: PlanningModule, wildcard: true },
};

/**
 * Account administration route (`ADMIN_USERS_ROUTE`).
 *
 * This is deliberately *not* mapped onto a registry feature. Users & Access has
 * no registry entry at all: the registry is the product feature model for every
 * user, and owner account administration is not a product feature for every
 * user. (PROFILE_ACCESS is different — it IS a registry feature, and A4-3 built
 * it, so it is mapped in FEATURE_COMPONENTS above.)
 *
 * It is also not a second feature model: nothing here appears in nav, preview or
 * task links built from the registry. It is a session-scoped account action,
 * reached from the topbar next to the other session controls, and only when the
 * session says ADMIN. See FRONTEND_HANDOFF §8.4 for the registry entry this
 * would prefer to have.
 */
export const ADMIN_USERS_ROUTE = "/administration/users";

/**
 * A4-3/A4-4 · the owner's Governance policy surface.
 *
 * Reached from the top bar rather than the registry-driven sidebar, the same
 * way Users & Access is: the registry is the product feature model for every
 * user, and owner administration is not a product feature for every user. The
 * screen itself renders a typed denial for a guessed URL, so the link is a
 * courtesy and never the boundary.
 */
export const ADMIN_PROFILE_ACCESS_ROUTE = "/administration/profile-access";

/**
 * Execution Loop component fixtures (`EXECUTION_FIXTURES_ROUTE`).
 *
 * The Phase 0 exit gate — every shared Execution component in every state on
 * the Carbon surface. Like the admin route above it is deliberately not a
 * registry feature, and for a stronger reason: it is not a product screen at
 * all. It renders no live data, appears in no navigation, and exists so the
 * component contracts can be reviewed before any of the seventeen screens are
 * built on them.
 *
 * The seventeen real screens do NOT follow this pattern. They are registry
 * features and stay blocked on registry revision 3, because nav rendering from
 * the registry is a hard rule and this route is not nav.
 */
export const EXECUTION_FIXTURES_ROUTE = "/execution/_fixtures";

/**
 * Research Loop component fixtures (`RESEARCH_FIXTURES_ROUTE`).
 *
 * The same idea on the paper surface: every Research panel in every state, so
 * the P03–P06 composition can be reviewed before the screens that consume it
 * are routed. It is not a registry feature, renders no live data, and appears
 * in no navigation. The page labels itself a fixture lane in its own copy so
 * it cannot be read as product data.
 */
export const RESEARCH_FIXTURES_ROUTE = "/research/_fixtures";

/**
 * `/?new=1` was the standalone QuantBT entry point for a new run. `/` now
 * belongs to the Command Center, so the shim keeps the old bookmark working
 * without giving QuantBT a claim on the root route.
 */
function RootRoute() {
  const location = useLocation();
  if (new URLSearchParams(location.search).get("new") === "1") {
    return <Navigate to={`${QUANTBT_ROOT}/new`} replace />;
  }
  return <CommandCenter />;
}

/** Redirects a declared legacy path onto its canonical route, keeping search. */
function LegacyRedirect({ feature }: { feature: PortalFeatureDefinition }) {
  const location = useLocation();
  const quantbt = canonicalQuantBTPath(location.pathname, location.search);
  const target = quantbt ?? `${feature.canonical_route}${location.search}`;
  return <Navigate to={target} replace />;
}

function NotFound() {
  return (
    <StateView
      kind="empty"
      message="No feature in the current registry claims this route."
    />
  );
}

export function PortalRoutes({ registry }: { registry: PortalRegistryDocument }) {
  const previewScreens = EXECUTION_PREVIEW_ENABLED
    ? registry.screens.filter((screen) => hasExecutionPreview(screen.screen_id))
    : [];
  const previewByExactRoute = new Map(previewScreens.map((screen) => [screen.route, screen]));

  return (
    // The fallback reserves a screen-shaped footprint, so entering a split route
    // does not collapse the layout for the frame it takes to arrive.
    <Suspense fallback={<ResultsSkeleton message="Loading module…" />}>
      <Routes>
        {previewScreens
          .filter((screen) => {
            const owner = registry.features.find((feature) => feature.id === screen.feature_id);
            return owner?.canonical_route !== screen.route;
          })
          .map((screen) => (
            <Route
              key={`execution-preview:${screen.screen_id}`}
              path={screen.route}
              element={<ExecutionPreviewRoute screenId={screen.screen_id} profile={screenDeliveryProfile(screen)} policy={screenDeliveryPolicy(screen)} />}
            />
          ))}
        {EXECUTION_PREVIEW_ENABLED
          ? EXECUTION_PREVIEW_EXTRA_ROUTES.map((extra) => (
              <Route
                key={`execution-preview-extra:${extra.screenId}`}
                path={extra.path}
                element={<ExecutionPreviewRoute screenId={extra.screenId} profile={null} />}
              />
            ))
          : null}
        {registry.features.map((feature) => {
          const module = MODULES[feature.id];
          const previewScreen = previewByExactRoute.get(feature.canonical_route);
          const previewScreenId =
            previewScreen?.screen_id ?? EXECUTION_PREVIEW_FEATURE_DEFAULTS[feature.id];
          const element =
            feature.canonical_route === "/"
              ? <RootRoute />
              : EXECUTION_PREVIEW_ENABLED && previewScreenId
                ? <ExecutionPreviewRoute screenId={previewScreenId} profile={screenDeliveryProfile(registry.screens.find((s) => s.screen_id === previewScreenId) ?? null)} />
                : module
                  ? <module.component />
                  : <FeaturePreview feature={feature} />;
          const path =
            feature.canonical_route === "/"
              ? "/"
              : `${feature.canonical_route}${module?.wildcard ? "/*" : ""}`;
          return <Route key={feature.id} path={path} element={element} />;
        })}

        {/* Account administration: session-scoped, not a registry feature. The
            screen itself renders `denied` for a non-ADMIN, so a guessed URL does
            not leak the table. */}
        <Route path={ADMIN_USERS_ROUTE} element={<UsersAccess />} />

        {/* Execution Loop Phase 0 fixtures: components, not a screen. */}
        <Route path={EXECUTION_FIXTURES_ROUTE} element={<ExecutionFixtures />} />

        {/* Research Loop composition fixtures: components, not a screen. */}
        <Route path={RESEARCH_FIXTURES_ROUTE} element={<ResearchFixtures />} />

        {/* Legacy compatibility. The set of paths comes from the registry; the
            owning module decides how each one translates. */}
        {registry.features.flatMap((feature) =>
          feature.legacy_routes
            // `/roadmap-task-board/` is served by the gateway as its own app and
            // must keep working untouched during the compatibility window.
            .filter((route) => !route.startsWith("/roadmap-task-board"))
            .map((route) => (
              <Route
                key={`legacy:${route}`}
                path={route}
                element={<LegacyRedirect feature={feature} />}
              />
            )),
        )}

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
