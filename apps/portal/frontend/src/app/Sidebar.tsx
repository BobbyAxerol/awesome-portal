/**
 * Primary navigation — rendered entirely from the Feature Registry.
 *
 * There is no hard-coded nav item here. Group order, feature order, labels,
 * routes, icons and maturity all come from `portal.registry.v1`, so a new
 * commissioned module appears by adding a registry entry (U03 exit gate).
 */
import { NavLink } from "react-router-dom";

import { MaturityBadge } from "../components/semantic";
import { maturityPresentation } from "../lib/portalState";
import {
  EXECUTION_PREVIEW_ENABLED,
  EXECUTION_PREVIEW_FEATURE_DEFAULTS,
} from "../execution/previewRegistry";
import type { PortalRegistryDocument } from "../portal/contracts";
import { sidebarGroups, type NavOptions } from "../portal/navigation";
import { iconFor } from "./icons";
import { usePresentationChrome } from "./presentation";

export function Sidebar({
  registry,
  options,
  collapsed,
  onNavigate,
}: {
  registry: PortalRegistryDocument;
  options: NavOptions;
  collapsed: boolean;
  /** Called after a nav click so the mobile drawer can close itself. */
  onNavigate?: () => void;
}) {
  const groups = sidebarGroups(registry, options);
  const badge = usePresentationChrome()?.chrome.navBadge ?? null;

  return (
    <nav className="portal-sidebar" aria-label="Primary navigation" data-collapsed={collapsed}>
      {groups.map(({ group, features }) => (
        <div key={group.id} className="portal-navgroup">
          {collapsed ? (
            <div className="portal-navgroup-rule" aria-hidden="true" />
          ) : (
            <div className="portal-navgroup-label">{group.label}</div>
          )}
          <ul>
            {features.map((feature) => {
              const presentation = maturityPresentation(feature.maturity);
              const Icon = iconFor(feature.navigation.icon_key);
              // A route the user can open RIGHT NOW as a fixture preview must
              // not say "SOON" beside itself (handoff §4.3): one truthful
              // state. Only the execution features the preview actually
              // mounts; unrelated future routes keep their maturity badge.
              const previewMounted =
                EXECUTION_PREVIEW_ENABLED &&
                (feature.id in EXECUTION_PREVIEW_FEATURE_DEFAULTS ||
                  feature.id.startsWith("EXECUTION_"));
              return (
                <li key={feature.id}>
                  <NavLink
                    to={feature.canonical_route}
                    end={feature.canonical_route === "/"}
                    className={({ isActive }) => `portal-navitem${isActive ? " portal-navitem-active" : ""}`}
                    style={{ opacity: previewMounted ? 1 : presentation.opacity }}
                    title={collapsed ? `${feature.label} — ${feature.description}` : feature.description}
                    data-maturity={feature.maturity}
                    onClick={onNavigate}
                  >
                    <Icon size={15} aria-hidden="true" className="shrink-0" />
                    {collapsed ? (
                      <span className="sr-only">{feature.label}</span>
                    ) : (
                      <>
                        <span className="portal-navitem-label">{feature.label}</span>
                        {badge && badge.route === feature.canonical_route && badge.count > 0 ? (
                          <span className="portal-navbadge" data-tone={badge.tone}>{badge.count}</span>
                        ) : null}
                        {previewMounted ? (
                          <span className="badge-maturity badge-maturity-preview">PREVIEW</span>
                        ) : (
                          <MaturityBadge maturity={feature.maturity} />
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
