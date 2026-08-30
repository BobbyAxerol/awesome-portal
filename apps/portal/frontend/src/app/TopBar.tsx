/**
 * Portal topbar: brand, workspace, environment, breadcrumbs, search and the
 * shell preference controls.
 *
 * The environment badge reads the value the SUMMARY reports. When the summary
 * has not answered we render nothing rather than defaulting to a guess — the
 * frontend does not infer which environment it is talking to (v0.5 §12.1).
 */
import { Menu, PanelLeftClose, PanelLeftOpen, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { useSession } from "../auth/session";
import { EnvironmentBadge } from "../components/semantic";
import type { PortalEnvironment } from "../portal/contracts";
import type { Breadcrumb } from "../portal/navigation";
import { ADMIN_USERS_ROUTE } from "./PortalRoutes";
import { usePreferences } from "./preferences";
import { usePresentation } from "./presentation";

export function TopBar({
  breadcrumbs,
  environment,
  onOpenPalette,
  onToggleMobileNav,
}: {
  breadcrumbs: Breadcrumb[];
  environment: PortalEnvironment | null;
  onOpenPalette: () => void;
  onToggleMobileNav: () => void;
}) {
  const preferences = usePreferences();
  const { mode: presentationMode, entityLabel, chrome } = usePresentation();
  const { isAdmin } = useSession();

  return (
    <header className="portal-topbar">
      <button
        type="button"
        className="portal-icon-btn lg:hidden"
        aria-label="Open navigation"
        onClick={onToggleMobileNav}
      >
        <Menu size={16} />
      </button>

      <button
        type="button"
        className="portal-icon-btn hidden lg:inline-flex"
        aria-label={preferences.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-pressed={preferences.sidebarCollapsed}
        onClick={() => preferences.set("sidebarCollapsed", !preferences.sidebarCollapsed)}
      >
        {preferences.sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>

      <Link to="/" className="portal-brand">
        Quant Ecosystem Portal
      </Link>

      <span className="portal-workspace mono" title="The prototype has a single workspace">
        Default Workspace
      </span>

      {environment ? <EnvironmentBadge environment={environment} /> : null}

      <nav aria-label="Breadcrumb" className="portal-breadcrumbs">
        {breadcrumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="portal-crumb">
            {index > 0 ? <span aria-hidden="true" className="portal-crumb-sep">/</span> : null}
            {crumb.route ? <Link to={crumb.route}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          </span>
        ))}
        {/* §4.3 product locator tail: `Deployments / Paper / Carry v3.2`. The
            entity name comes from the screen that resolved it (via the
            presentation context) — the shell cannot know fixture display
            names, and would otherwise print ids or nothing. */}
        {entityLabel ? (
          <span className="portal-crumb">
            <span aria-hidden="true" className="portal-crumb-sep">/</span>
            <span>{entityLabel}</span>
          </span>
        ) : null}
      </nav>

      {chrome.alerts && chrome.alerts.critical > 0 ? (
        <a className="portal-alerts-chip" href={chrome.alerts.href} onClick={chrome.alerts.onToggle ? (e) => { e.preventDefault(); chrome.alerts?.onToggle?.(); } : undefined} aria-label={`Alerts · ${chrome.alerts.critical} critical`}>
          ⚑ Alerts · {chrome.alerts.critical} critical
        </a>
      ) : null}
      {chrome.price ? (
        <span className="portal-price-chip mono" aria-label={`${chrome.price.symbol} ${chrome.price.value}`}>
          {chrome.price.symbol} <b data-tone={chrome.price.up ? "good" : "bad"}>{chrome.price.value}</b> <span data-tone={chrome.price.up ? "good" : "bad"}>{chrome.price.up ? "▲" : "▼"}</span>
        </span>
      ) : null}
      <button type="button" className="portal-search-btn" onClick={onOpenPalette}>
        <Search size={13} aria-hidden="true" />
        <span>Search</span>
        <kbd className="mono">⌘K</kbd>
      </button>

      {/* The appearance control shows the EFFECTIVE workspace appearance
          (EL-V2-01 §4.1). On an Execution route the workspace is Carbon by
          the owner override, not by preference, so the control says so and is
          disabled — a selector still claiming "Research Light" around a Carbon
          canvas was the owner-rejected state this replaces. The stored
          preference is untouched and resumes on the next Research route. */}
      {presentationMode === "execution-carbon" ? (
        <label
          className="portal-pref mono"
          title="Execution routes always use the Carbon workspace. Your theme preference still applies to Research and Planning."
        >
          <span className="sr-only">Theme</span>
          <select value="execution-carbon" disabled aria-label="Theme (Execution Carbon, route-set)">
            <option value="execution-carbon">Execution Carbon</option>
          </select>
        </label>
      ) : presentationMode === "governance-light" ? (
        <label
          className="portal-pref mono"
          title="Governance routes always use the light review room (owner, 2026-08-30). Your theme preference still applies to Research and Planning."
        >
          <span className="sr-only">Theme</span>
          <select value="governance-light" disabled aria-label="Theme (Governance Light, route-set)">
            <option value="governance-light">Governance Light</option>
          </select>
        </label>
      ) : (
        <label className="portal-pref mono">
          <span className="sr-only">Theme</span>
          <select
            value={preferences.theme}
            onChange={(event) =>
              preferences.set("theme", event.target.value === "operations" ? "operations" : "research")
            }
            aria-label="Theme"
          >
            <option value="research">Research Light</option>
            <option value="operations">Operations Dark</option>
          </select>
        </label>
      )}

      <label className="portal-pref mono">
        <span className="sr-only">Density</span>
        <select
          value={preferences.density}
          onChange={(event) =>
            preferences.set("density", event.target.value as typeof preferences.density)
          }
          aria-label="Density"
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
          <option value="operational">Operational</option>
        </select>
      </label>

      {/* Account administration, next to the other session controls rather than
          in the registry-driven nav. Hidden for a non-ADMIN as a courtesy — the
          gateway is the boundary and the screen itself says `denied`. */}
      {isAdmin ? (
        <Link className="portal-icon-btn" to={ADMIN_USERS_ROUTE} title="Users & Access" aria-label="Users & Access">
          <Users size={15} />
        </Link>
      ) : null}

      <label className="portal-pref-check mono" title="Show or hide modules that are not built yet">
        <input
          type="checkbox"
          checked={preferences.showCommissioned}
          onChange={(event) => preferences.set("showCommissioned", event.target.checked)}
        />
        Planned modules
      </label>
    </header>
  );
}
