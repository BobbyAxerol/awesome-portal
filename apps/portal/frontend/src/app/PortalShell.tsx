/**
 * PortalShell — the single mother shell (U03).
 *
 * It owns the topbar, the primary rail and the command palette; feature
 * modules render into the content slot and must not re-declare their own
 * topbar or sidebar (v0.4 §P0.9, §P0.10).
 *
 * The shell cannot render until the registry resolves, because navigation IS
 * the registry. A registry failure is therefore a terminal bootstrap state
 * with its request id, not an empty sidebar.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { StateView } from "../components/ui";
import { PortalRequestError } from "../portal/client";
import { useRegistry, useSummary } from "../portal/hooks";
import { breadcrumbsFor, type NavOptions } from "../portal/navigation";
import { useSession } from "../auth/session";
import { PortalPresentationProvider } from "./presentation";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
import { opensV2CommandBar, V2_SHELL_ON } from "./commandRouting";
import { PortalContext } from "./context";
import { PortalRoutes } from "./PortalRoutes";
import { NO_SELF_NAV, type SelfNavShellView } from "./selfNavView";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { usePreferences } from "./preferences";
import { installPrintLightTheme } from "./printTheme";

// V2 command bar (concept C1). Lazy on the RAW env string, like the other V2 mounts, so a build
// without the manifest emits no V2 chunk and never evaluates this module. Whether it is used on
// a given route is `opensV2CommandBar` (shell flag + Execution route); otherwise V1's palette.
const V2CommandBar = import.meta.env.VITE_EXECUTION_V2_SCREENS
  ? lazy(() => import("../execution/v2/shell/ExecCommandBar").then((m) => ({ default: m.ExecCommandBar })))
  : null;

// Self-navigation (W3, FE-057/058): the controller that reads the actor's own navigation projection and tells the rail what it
// lists. Same raw-env guard as above; it renders nothing, and with the shell flag off it is never mounted.
const V2SelfNavigation = import.meta.env.VITE_EXECUTION_V2_SCREENS
  ? lazy(() => import("../execution/v2/shell/SelfNavigation"))
  : null;

export function PortalShell() {
  const location = useLocation();
  const preferences = usePreferences();
  const registry = useRegistry();
  // The shell needs the environment for the topbar badge and for filtering
  // features by environment; the Command Center re-reads the same query.
  const summary = useSummary();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  /* D1: Esc closes the navigation drawer and hands focus back to its toggle. */
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileNavOpen(false);
      navToggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);
  /* T-D1/T-D2: print is the light palette whatever the theme. */
  useEffect(() => installPrintLightTheme(), []);
  const [v2BarOpen, setV2BarOpen] = useState(false);
  // One shortcut, one overlay: on an Execution route with the shell flag on, Cmd/Ctrl+K (and the
  // topbar search button) open the V2 bar; everywhere else, and always with the flag off, the V1 palette.
  const v2Route = V2CommandBar !== null && opensV2CommandBar(registry.data ?? null, location.pathname);
  const openPalette = useCallback(() => (v2Route ? setV2BarOpen(true) : setPaletteOpen(true)), [v2Route]);
  // Leaving the routes the V2 bar owns closes it, so it cannot reappear on the next Execution visit.
  useEffect(() => {
    if (!v2Route) setV2BarOpen(false);
  }, [v2Route]);
  useCommandPaletteShortcut(openPalette);

  const environment = summary.data?.environment ?? null;
  const { access } = useSession();
  // What the V2 self-navigation controller says the rail lists / why it is shut. Flag off nobody sets it: `NO_SELF_NAV`.
  const [selfNav, setSelfNav] = useState<SelfNavShellView>(NO_SELF_NAV);

  /*
   * A4-4 · navigation is owner-aware, from the server's answer.
   *
   * The capability set comes from `/api/admin/access/self` through the session
   * context — never from the role in the principal, which every administrator
   * shares. While it is loading, or if it could not be read, the list is
   * empty: a protected entry is hidden rather than optimistically shown,
   * because the screen behind it would refuse anyway and an entry that always
   * refuses is worse than no entry.
   */
  const sessionCapabilities = access.kind === "ready" ? access.access.capabilities : [];
  // A live self-navigation projection can only ADD listing tokens to what the session holds (selfNavGate); nothing is removed,
  // nothing is sent back. With no tokens (flag off, nothing read, expired, failed) this is the session list itself, as before.
  const capabilities = useMemo(
    () => (selfNav.tokens.size === 0 ? sessionCapabilities : [...new Set([...sessionCapabilities, ...selfNav.tokens])]),
    [sessionCapabilities, selfNav.tokens],
  );
  const navOptions = useMemo<NavOptions>(
    () => ({ environment, showCommissioned: preferences.showCommissioned, capabilities }),
    [environment, preferences.showCommissioned, capabilities],
  );

  const contextValue = useMemo(
    () => ({ registry: registry.data ?? null, environment }),
    [registry.data, environment],
  );

  if (registry.isLoading) {
    return <StateView kind="loading" message="Loading the Feature Registry…" />;
  }

  if (registry.isError || !registry.data) {
    const error = registry.error;
    const requestId = error instanceof PortalRequestError ? error.requestId : null;
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <StateView
          kind="failed"
          code={requestId ? `request_id ${requestId}` : undefined}
          message={
            "The Feature Registry could not be loaded, so the shell cannot build navigation. " +
            "The Portal builds no stand-in nav, because a guessed one would misstate capability. " +
            (error instanceof Error ? error.message : "")
          }
          onRetry={() => void registry.refetch()}
        />
      </main>
    );
  }

  const breadcrumbs = breadcrumbsFor(registry.data, location.pathname);

  return (
    <PortalContext.Provider value={contextValue}>
      {/* Presentation wraps every piece of chrome the workspace mode covers —
          topbar, rail, drawer, canvas, palette — so an Execution route flips
          them together or not at all (EL-V2-01 §4.1). */}
      <PortalPresentationProvider registry={registry.data}>
      <div className="portal-shell" data-sidebar-collapsed={preferences.sidebarCollapsed}>
        <a
          className="portal-skip-link"
          href="#portal-content"
          onClick={(event) => {
            // Move focus to the content region without touching the router's URL.
            const target = document.getElementById("portal-content");
            if (target) {
              event.preventDefault();
              target.focus();
              target.scrollIntoView?.({ block: "start" });
            }
          }}
        >
          Skip to main content
        </a>
        <TopBar
          breadcrumbs={breadcrumbs}
          environment={environment}
          onOpenPalette={openPalette}
          onToggleMobileNav={() => setMobileNavOpen((open) => !open)}
          navToggleRef={navToggleRef}
        />

        <div className="portal-body">
          <div className="portal-rail">
            <Sidebar
              registry={registry.data}
              options={navOptions}
              collapsed={preferences.sidebarCollapsed}
              notice={selfNav.notice ?? undefined}
              selfEntry={selfNav.selfEntry}
            />
          </div>

          {mobileNavOpen ? (
            <div
              className="portal-drawer-backdrop lg:hidden"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setMobileNavOpen(false);
              }}
            >
              <div className="portal-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
                <Sidebar
                  registry={registry.data}
                  options={navOptions}
                  collapsed={false}
                  onNavigate={() => setMobileNavOpen(false)}
                  notice={selfNav.notice ?? undefined}
                  selfEntry={selfNav.selfEntry}
                />
              </div>
            </div>
          ) : null}

          <main className="portal-content" id="portal-content" tabIndex={-1}>
            <PortalRoutes registry={registry.data} />
          </main>
        </div>

        <CommandPalette
          registry={registry.data}
          options={navOptions}
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
        />
        {V2SelfNavigation && V2_SHELL_ON ? (
          <Suspense fallback={null}>
            <V2SelfNavigation onView={setSelfNav} />
          </Suspense>
        ) : null}
        {V2CommandBar && v2Route ? (
          <Suspense fallback={null}>
            <V2CommandBar
              registry={registry.data}
              options={navOptions}
              open={v2BarOpen}
              onClose={() => setV2BarOpen(false)}
            />
          </Suspense>
        ) : null}
      </div>
      </PortalPresentationProvider>
    </PortalContext.Provider>
  );
}
