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
      </nav>

      <button type="button" className="portal-search-btn" onClick={onOpenPalette}>
        <Search size={13} aria-hidden="true" />
        <span>Search</span>
        <kbd className="mono">⌘K</kbd>
      </button>

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
