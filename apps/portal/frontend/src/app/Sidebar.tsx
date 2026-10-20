/**
 * Primary navigation — rendered entirely from the Feature Registry.
 *
 * There is no hard-coded nav item here. Group order, feature order, labels,
 * routes, icons and maturity all come from `portal.registry.v1`, so a new
 * commissioned module appears by adding a registry entry (U03 exit gate).
 */
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { MaturityBadge } from "../components/semantic";
import { maturityPresentation, maturityStateName } from "../lib/portalState";
import {
  EXECUTION_PREVIEW_ENABLED,
  EXECUTION_PREVIEW_FEATURE_DEFAULTS,
} from "../execution/previewRegistry";
import type { PortalFeatureDefinition, PortalRegistryDocument } from "../portal/contracts";
import { sidebarGroups, type NavOptions } from "../portal/navigation";
import { EXECUTION_V2_SHELL, isV2Screen } from "../execution/v2/flags";
import { applyV2Nav } from "../execution/v2/shell/roleNav";
import { RAIL_CONTEXT_KEYS, withContext } from "../execution/v2/urlState";
import { iconFor } from "./icons";
import { usePresentationChrome } from "./presentation";
import { SELF_ENTRY_PATH } from "./selfNavView";

interface RailItem {
  feature: PortalFeatureDefinition;
  label: string;
  to: string;
  /** NavLink `end`: only the exact route is current. */
  end: boolean;
}
interface RailGroup {
  id: string;
  label: string;
  items: RailItem[];
}

/** The words of the self-only rail entry: the ones the self-view's own tab and its many links already use. */
export const SELF_ENTRY_LABEL = "My access";

/**
 * The self-only "My access" entry (BE-P7 `self_entry`) for a member who has no Profile & Access entry of their own.
 *
 * It exists in the rail only while the caller passes an offer, which the shell derives from a LIVE self-navigation projection (its
 * `self_entry.permission` is `ALLOWED`, and the context's too when the workspace came from it). No offer, an offer whose workspace the
 * address cannot carry, a registry without PROFILE_ACCESS, or an admin whose rail already lists Profile & Access (the self-view is
 * the first tab there) all leave the groups exactly as they were: fail closed, never a duplicate. The registry is not edited: the
 * group and the icon come from the PROFILE_ACCESS feature, the route is `SELF_ENTRY_PATH`. Listing only, never an authority.
 */
export function withSelfEntry(
  groups: RailGroup[],
  registry: PortalRegistryDocument,
  offer: { workspaceId: string } | null,
  search: string,
): RailGroup[] {
  if (offer === null) return groups;
  const profile = registry.features.find((feature) => feature.id === "PROFILE_ACCESS");
  if (profile === undefined) return groups;
  if (groups.some((group) => group.items.some((item) => item.feature.id === profile.id))) return groups;
  const id = offer.workspaceId;
  // The address carries the workspace (`workspace_id` is at most 128 characters, no control characters): one it cannot carry is not offered.
  if (id.length === 0 || id.length > 128 || /[\u0000-\u001f]/.test(id)) return groups;
  const item: RailItem = {
    feature: { ...profile, canonical_route: SELF_ENTRY_PATH },
    label: SELF_ENTRY_LABEL,
    to: withContext(`${SELF_ENTRY_PATH}?workspace_id=${encodeURIComponent(id)}`, search, RAIL_CONTEXT_KEYS),
    end: true,
  };
  const at = groups.findIndex((group) => group.id === profile.group);
  if (at >= 0) return groups.map((group, index) => (index === at ? { ...group, items: [...group.items, item] } : group));
  const def = registry.feature_groups.find((group) => group.id === profile.group);
  const created: RailGroup = { id: profile.group, label: def?.label ?? profile.group, items: [item] };
  if (def === undefined) return [...groups, created];
  // Where the registry orders the group: before the first group it orders later (the synthetic Execution group has no registry order).
  const orderOf = (groupId: string) => registry.feature_groups.find((group) => group.id === groupId)?.order;
  const next = groups.findIndex((group) => (orderOf(group.id) ?? Number.NEGATIVE_INFINITY) > def.order);
  return next < 0 ? [...groups, created] : [...groups.slice(0, next), created, ...groups.slice(next)];
}

/**
 * What the rail lists. Flag off: the registry's groups, untouched. Shell flag on (UXM-07 D1): the same
 * groups through the V2 overlay (V2 labels and order, capability-filtered, the old APPROVALS stub dropped
 * for its scoped replacement), and Execution links carry the shared context like the command bar does.
 */
export function railGroups(
  registry: PortalRegistryDocument,
  options: NavOptions,
  v2Shell: boolean,
  search: string,
): RailGroup[] {
  const base = sidebarGroups(registry, options);
  if (!v2Shell) {
    return base.map(({ group, features }) => ({
      id: group.id,
      label: group.label,
      items: features.map((feature) => ({ feature, label: feature.label, to: feature.canonical_route, end: feature.canonical_route === "/" })),
    }));
  }
  return applyV2Nav(base, new Set(options.capabilities ?? [])).map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item) => ({
      feature: item.feature,
      label: item.label,
      to: item.carriesContext ? withContext(item.route, search, RAIL_CONTEXT_KEYS) : item.route,
      // Overview (`/execution`) is the parent path of Operations (`/execution/operations`): without `end` both
      // would read as current on an Operations page. Exact match for it only; the flag-off rail is untouched.
      end: item.route === "/" || item.featureId === "EXECUTION_COMMAND_CENTER",
    })),
  }));
}

export function Sidebar({
  registry,
  options,
  collapsed,
  onNavigate,
  v2Shell = EXECUTION_V2_SHELL,
  notice,
  selfEntry = null,
  selfEntryMounted = isV2Screen("profile"),
}: {
  registry: PortalRegistryDocument;
  options: NavOptions;
  collapsed: boolean;
  /** Called after a nav click so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /** The V2 shell flag; a prop only so tests can drive both states without reloading the module graph. */
  v2Shell?: boolean;
  /**
   * W3 (FE-057/058): the V2 "Navigation unavailable" line, drawn first inside the rail's own `<nav>` landmark when the
   * self-navigation read expired or failed. Absent flag off, so the flag-off DOM is untouched. It only EXPLAINS a shut rail;
   * which entries are listed is still decided by `options.capabilities` alone.
   */
  notice?: (rail: { collapsed: boolean }) => ReactNode;
  /**
   * BE-P7: the self-only "My access" entry on offer (workspace it opens for), from a LIVE self-navigation projection. Ignored flag
   * off, and unless the `profile` flag mounts the page it opens (`selfEntryMounted`; a prop only so a test can drive both states).
   */
  selfEntry?: { workspaceId: string } | null;
  selfEntryMounted?: boolean;
}) {
  const { search } = useLocation();
  const base = railGroups(registry, options, v2Shell, search);
  const groups = v2Shell && selfEntryMounted ? withSelfEntry(base, registry, selfEntry, search) : base;
  const badge = usePresentationChrome()?.chrome.navBadge ?? null;

  return (
    <nav className="portal-sidebar" aria-label="Primary navigation" data-collapsed={collapsed}>
      {v2Shell && notice ? notice({ collapsed }) : null}
      {groups.map((group) => (
        <div key={group.id} className="portal-navgroup">
          {collapsed ? (
            <div className="portal-navgroup-rule" aria-hidden="true" />
          ) : (
            <div className="portal-navgroup-label">{group.label}</div>
          )}
          <ul>
            {group.items.map(({ feature, label, to, end }) => {
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
              /* W3A: SOON / PROTOTYPE are no longer drawn as chips in the rail
                 (Bobby, 2026-10-02). The dimmed row stays, and the state moves to
                 the link's accessible name so it is still announced. */
              const stateName = previewMounted ? null : maturityStateName(feature.maturity);
              return (
                <li key={feature.id}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) => `portal-navitem${isActive ? " portal-navitem-active" : ""}`}
                    style={{ opacity: previewMounted ? 1 : presentation.opacity }}
                    title={collapsed ? `${label} — ${feature.description}` : feature.description}
                    data-maturity={feature.maturity}
                    aria-label={
                      collapsed || stateName === null ? undefined : `${label}, ${stateName}`
                    }
                    onClick={onNavigate}
                  >
                    <Icon size={15} aria-hidden="true" className="shrink-0" />
                    {collapsed ? (
                      <span className="sr-only">{label}</span>
                    ) : (
                      <>
                        <span className="portal-navitem-label">{label}</span>
                        {badge && badge.route === feature.canonical_route && badge.count > 0 ? (
                          <span className="portal-navbadge" data-tone={badge.tone}>{badge.count}</span>
                        ) : null}
                        {previewMounted ? (
                          <span className="badge-maturity badge-maturity-preview">PREVIEW</span>
                        ) : stateName === null ? (
                          <MaturityBadge maturity={feature.maturity} />
                        ) : null}
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
