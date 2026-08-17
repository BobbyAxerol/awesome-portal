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
import type { ComponentType } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { StateView } from "../components/ui";
import { CommandCenter } from "../features/command-center/CommandCenter";
import { PortalMap } from "../features/portal-map/PortalMap";
import { PlanningModule } from "../features/planning/PlanningModule";
import { UsersAccess } from "../features/admin/UsersAccess";
import { FeaturePreview } from "../features/preview/FeaturePreview";
import { QuantBTModule } from "../features/quantbt/QuantBTModule";
import { QUANTBT_ROOT, canonicalQuantBTPath } from "../features/quantbt/routes";
import type { PortalFeatureDefinition, PortalRegistryDocument } from "../portal/contracts";

/**
 * Registry feature id -> implemented module.
 *
 * `wildcard` features own their sub-paths and declare their own inner routes.
 */
const MODULES: Record<string, { component: ComponentType; wildcard?: boolean }> = {
  COMMAND_CENTER: { component: CommandCenter },
  PORTAL_MAP: { component: PortalMap },
  QUANTBT_RESEARCH: { component: QuantBTModule, wildcard: true },
  PLANNING: { component: PlanningModule, wildcard: true },
};

/**
 * Account administration route (`ADMIN_USERS_ROUTE`).
 *
 * This is deliberately *not* mapped onto PROFILE_ACCESS. That feature is
 * COMMISSIONED in the registry, and rendering a working screen behind a
 * commissioned badge would make the badge lie — the same reason Alpha 360° lives
 * under QuantBT instead of on the ALPHA_POOL route.
 *
 * It is also not a second feature model: nothing here appears in nav, preview or
 * task links built from the registry. It is a session-scoped account action,
 * reached from the topbar next to the other session controls, and only when the
 * session says ADMIN. See FRONTEND_HANDOFF §8.4 for the registry entry this
 * would prefer to have.
 */
export const ADMIN_USERS_ROUTE = "/administration/users";

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
      message="Route này không thuộc feature nào trong registry hiện tại."
    />
  );
}

export function PortalRoutes({ registry }: { registry: PortalRegistryDocument }) {
  return (
    <Routes>
      {registry.features.map((feature) => {
        const module = MODULES[feature.id];
        const element =
          feature.canonical_route === "/"
            ? <RootRoute />
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
  );
}
