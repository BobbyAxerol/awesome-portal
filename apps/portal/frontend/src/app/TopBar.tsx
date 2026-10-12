/**
 * Portal topbar: brand, workspace, environment, breadcrumbs, search and the
 * shell preference controls.
 *
 * The environment badge reads the value the SUMMARY reports. When the summary
 * has not answered we render nothing rather than defaulting to a guess — the
 * frontend does not infer which environment it is talking to (v0.5 §12.1).
 */
import { Menu, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, Users } from "lucide-react";
import { useEffect, useId, useRef, useState, type Ref } from "react";
import { Link, useLocation } from "react-router-dom";

import { isOwnerAccess, useSession } from "../auth/session";
import { EnvironmentBadge } from "../components/semantic";
import { RetainedPill } from "../execution/RetainedBanner";
import type { PortalEnvironment } from "../portal/contracts";
import type { Breadcrumb } from "../portal/navigation";
import { useRunLabel } from "../research/runLabels";
import { useRunLabelRead } from "../research/useRunLabelRead";
import { workspaceNamedHref } from "../research/ResearchScopedLink";
import { researchRunCrumb, useRunUnknown } from "./researchRunCrumb";
import { ADMIN_USERS_ROUTE } from "./PortalRoutes";
import { usePreferences, type PreferencesContextValue } from "./preferences";
import { usePresentation } from "./presentation";

export function TopBar({
  breadcrumbs,
  environment,
  onOpenPalette,
  onToggleMobileNav,
  navToggleRef,
}: {
  breadcrumbs: Breadcrumb[];
  environment: PortalEnvironment | null;
  onOpenPalette: () => void;
  onToggleMobileNav: () => void;
  navToggleRef?: Ref<HTMLButtonElement>;
}) {
  const preferences = usePreferences();
  const { mode: presentationMode, entityLabel, chrome } = usePresentation();
  const { access } = useSession();
  const location = useLocation();
  const workspaceId = new URLSearchParams(location.search).get("workspace_id") || undefined;
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
  useRunLabelRead(runCrumb?.needsLabelRead ? runCrumb.runId : null, workspaceId);
  const runUnknown = useRunUnknown(runCrumb?.runId);
  const crumbTail = entityLabel ?? runCrumb?.screen ?? null;

  return (
    <header className="portal-topbar">
      <button
        type="button"
        className="portal-icon-btn lg:hidden"
        ref={navToggleRef}
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

      <span className="portal-workspace mono portal-wide-only" title="The prototype has a single workspace">
        Default Workspace
      </span>

      {environment ? <EnvironmentBadge environment={environment} /> : null}
      <RetainedPill />

      <nav aria-label="Breadcrumb" className={runCrumb ? "portal-breadcrumbs portal-breadcrumbs--run" : "portal-breadcrumbs"}>
        {breadcrumbs.map((crumb, index) => (
          <span
            key={`${crumb.label}-${index}`}
            className={[
              "portal-crumb",
              runCrumb && index > 0 ? "portal-crumb--run-context" : "",
              !runCrumb && !crumbTail && index === breadcrumbs.length - 1 ? "portal-crumb--current" : "",
            ].filter(Boolean).join(" ")}
          >
            {index > 0 ? <span aria-hidden="true" className="portal-crumb-sep">/</span> : null}
            {crumb.route ? <Link to={workspaceNamedHref(crumb.route, workspaceId)}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          </span>
        ))}
        {/* §4.3 product locator tail: `Deployments / Paper / Carry v3.2`. The
            entity name comes from the screen that resolved it (via the
            presentation context) — the shell cannot know fixture display
            names, and would otherwise print ids or nothing. */}
        {runCrumb ? (
          <span className="portal-crumb portal-crumb--current">
            <span aria-hidden="true" className="portal-crumb-sep">/</span>
            {runUnknown ? (
              <span title={runCrumb.runId} className="mono" data-run-unknown="">{runCrumb.label}</span>
            ) : (
              <Link to={workspaceNamedHref(runCrumb.route, workspaceId)} title={runCrumb.runId} className="mono">{runCrumb.label}</Link>
            )}
          </span>
        ) : null}
        {crumbTail ? (
          <span className={runCrumb ? "portal-crumb portal-crumb--run-screen" : "portal-crumb portal-crumb--current"}>
            <span aria-hidden="true" className="portal-crumb-sep">/</span>
            <span className={runCrumb ? "portal-crumb-tail" : undefined} title={runCrumb ? crumbTail : undefined}>{crumbTail}</span>
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
        <span className="portal-search-label">Search</span>
        <kbd className="mono">⌘K</kbd>
      </button>

      <ThemeControl preferences={preferences} presentationMode={presentationMode} />

      <DensityControl preferences={preferences} />

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
        <Link className="portal-icon-btn portal-admin-link" to={ADMIN_USERS_ROUTE} title="Users & Access" aria-label="Users & Access">
          <Users size={15} />
        </Link>
      ) : null}

      <PlannedModulesControl preferences={preferences} />

      <DisplayMenu
        preferences={preferences}
        presentationMode={presentationMode}
        showUsersLink={isOwnerAccess(access)}
      />
    </header>
  );
}

type PresentationModeName = ReturnType<typeof usePresentation>["mode"];

/*
 * (<=720px the bar keeps ONE crumb, marked `portal-crumb--current`; the rest of
 * the trail is reachable from the navigation drawer.)
 *
 * The three shell preferences are written once and mounted twice: inline in
 * the bar at >=721px, and inside the Display menu at <=720px (W3A). Only one
 * of the two is ever visible — the other is `display: none`, so it is also out
 * of the accessibility tree.
 */
function ThemeControl({
  preferences,
  presentationMode,
}: {
  preferences: PreferencesContextValue;
  presentationMode: PresentationModeName;
}) {
  /* The appearance control shows the EFFECTIVE workspace appearance
     (EL-V2-01 §4.1). On an Execution route the workspace is Carbon by the
     owner override, not by preference, so the control says so and is disabled
     — a selector still claiming "Research Light" around a Carbon canvas was
     the owner-rejected state this replaces. The stored preference is
     untouched and resumes on the next Research route. */
  if (presentationMode === "execution-carbon") {
    return (
      <label
        className="portal-pref mono"
        title="Execution routes always use the Carbon workspace. Your theme preference still applies to Research and Planning."
      >
        <span className="sr-only">Theme</span>
        <select value="execution-carbon" disabled aria-label="Theme (Execution Carbon, route-set)">
          <option value="execution-carbon">Execution Carbon</option>
        </select>
      </label>
    );
  }
  if (presentationMode === "governance-light") {
    return (
      <label
        className="portal-pref mono"
        title="Governance routes always use the light review room (owner, 2026-08-30). Your theme preference still applies to Research and Planning."
      >
        <span className="sr-only">Theme</span>
        <select value="governance-light" disabled aria-label="Theme (Governance Light, route-set)">
          <option value="governance-light">Governance Light</option>
        </select>
      </label>
    );
  }
  return (
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
  );
}

function DensityControl({ preferences }: { preferences: PreferencesContextValue }) {
  return (
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
  );
}

function PlannedModulesControl({ preferences }: { preferences: PreferencesContextValue }) {
  return (
    <label className="portal-pref-check mono" title="Show or hide modules that are not built yet">
      <input
        type="checkbox"
        checked={preferences.showCommissioned}
        onChange={(event) => preferences.set("showCommissioned", event.target.checked)}
      />
      Planned modules
    </label>
  );
}

/**
 * Display menu (<=720px). One disclosure button that holds what the laptop bar
 * shows inline: workspace, Theme, Density, Planned modules and, for the owner,
 * Users & Access. Enter/Space open it (native button), Esc closes it and
 * returns focus to the button, Tab walks the controls in order, and focus
 * leaving the menu closes it. The panel is mounted only while open, so the
 * controls are never duplicated in the accessibility tree.
 */
function DisplayMenu({
  preferences,
  presentationMode,
  showUsersLink,
}: {
  preferences: PreferencesContextValue;
  presentationMode: PresentationModeName;
  showUsersLink: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="portal-display"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && rootRef.current && !rootRef.current.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="portal-display-btn"
        aria-label="Display"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Display: theme, density, workspace"
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div id={panelId} className="portal-display-panel" role="group" aria-label="Display">
          <div className="portal-display-row">
            <span className="portal-display-key mono">Workspace</span>
            <span className="portal-workspace mono" title="The prototype has a single workspace">
              Default Workspace
            </span>
          </div>
          <ThemeControl preferences={preferences} presentationMode={presentationMode} />
          <DensityControl preferences={preferences} />
          <PlannedModulesControl preferences={preferences} />
          {showUsersLink ? (
            <Link className="portal-display-link" to={ADMIN_USERS_ROUTE} onClick={() => setOpen(false)}>
              <Users size={15} aria-hidden="true" /> Users &amp; Access
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
