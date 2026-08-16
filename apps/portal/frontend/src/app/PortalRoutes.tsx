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
import { FeaturePreview } from "../features/preview/FeaturePreview";
import { QuantBTModule } from "../features/quantbt/QuantBTModule";
import { canonicalQuantBTPath } from "../features/quantbt/routes";
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
};

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
        const element = module ? <module.component /> : <FeaturePreview feature={feature} />;
        const path =
          feature.canonical_route === "/"
            ? "/"
            : `${feature.canonical_route}${module?.wildcard ? "/*" : ""}`;
        return <Route key={feature.id} path={path} element={element} />;
      })}

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
