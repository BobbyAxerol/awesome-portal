/**
 * Portal topbar: brand, workspace, environment, breadcrumbs, search and the
 * shell preference controls.
 *
 * The environment badge reads the value the SUMMARY reports. When the summary
 * has not answered we render nothing rather than defaulting to a guess — the
 * frontend does not infer which environment it is talking to (v0.5 §12.1).
 */
import { Menu, PanelLeftClose, PanelLeftOpen, Search, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { isOwnerAccess, useSession } from "../auth/session";
import { EnvironmentBadge } from "../components/semantic";
import type { PortalEnvironment } from "../portal/contracts";
import type { Breadcrumb } from "../portal/navigation";
import { useRunLabel } from "../research/runLabels";
import { useRunLabelRead } from "../research/useRunLabelRead";
import { researchRunCrumb } from "./researchRunCrumb";
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
  const { access } = useSession();
  const location = useLocation();
  /*
   * D1 / audit X1 and X-1: a run-scoped Research address extends the trail to
   * `… / R-WFO-118 / Stage 1 · Split`. Subscribing to the run's label here is
   * what repaints the crumb when the read lands after the first frame, and
   * deriving the crumb in one place is what keeps the shell and the screens
   * from writing the same run two different ways.
   */
  const runCrumb = researchRunCrumb(location.pathname);
  useRunLabel(runCrumb?.runId);
  /* G3: Stages 1–4 make no read that carries the label, so the shell asks the Run Library for it. */
  useRunLabelRead(runCrumb?.needsLabelRead ? runCrumb.runId : null);
  const crumbTail = entityLabel ?? runCrumb?.screen ?? null;

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
          <span
            key={`${crumb.label}-${index}`}
            className={runCrumb && index > 0 ? "portal-crumb portal-crumb--run-context" : "portal-crumb"}
          >
            {index > 0 ? <span aria-hidden="true" className="portal-crumb-sep">/</span> : null}
            {crumb.route ? <Link to={crumb.route}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          </span>
        ))}
        {/* §4.3 product locator tail: `Deployments / Paper / Carry v3.2`. The
            entity name comes from the screen that resolved it (via the
            presentation context) — the shell cannot know fixture display
            names, and would otherwise print ids or nothing. */}
        {runCrumb ? (
          <span className="portal-crumb">
            <span aria-hidden="true" className="portal-crumb-sep">/</span>
            <Link to={runCrumb.route} title={runCrumb.runId} className="mono">{runCrumb.label}</Link>
          </span>
        ) : null}
        {crumbTail ? (
          <span className={runCrumb ? "portal-crumb portal-crumb--run-screen" : "portal-crumb"}>
            <span aria-hidden="true" className="portal-crumb-sep">/</span>
            <span>{crumbTail}</span>
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
          in the registry-driven nav. Shown only once the server has answered
          that this caller is the Portal owner — never from the role in the
          session, which every administrator shares. While the answer is
          loading, or if it could not be read, the link stays absent: the cost
          of a missing icon is one navigation, the cost of an offered one is a
          click into a refusal. The gateway is still the boundary and the
          screen itself renders a typed denial for a bookmarked URL. */}
      {isOwnerAccess(access) ? (
        /*
         * Users & Access only. Profile & Access is a registry feature, so it
         * appears in the sidebar — capability-gated there — and a second
         * affordance up here was both duplicated and, at laptop width, enough
         * to push this bar onto two lines. Found by looking at the recorded
         * screen, not by a test.
         */
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
