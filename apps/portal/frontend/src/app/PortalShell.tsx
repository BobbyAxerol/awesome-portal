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
import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { StateView } from "../components/ui";
import { PortalRequestError } from "../portal/client";
import { useRegistry, useSummary } from "../portal/hooks";
import { breadcrumbsFor, type NavOptions } from "../portal/navigation";
import { PortalPresentationProvider } from "./presentation";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
import { PortalContext } from "./context";
import { PortalRoutes } from "./PortalRoutes";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { usePreferences } from "./preferences";

export function PortalShell() {
  const location = useLocation();
  const preferences = usePreferences();
  const registry = useRegistry();
  // The shell needs the environment for the topbar badge and for filtering
  // features by environment; the Command Center re-reads the same query.
  const summary = useSummary();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteShortcut(openPalette);

  const environment = summary.data?.environment ?? null;

  const navOptions = useMemo<NavOptions>(
    () => ({ environment, showCommissioned: preferences.showCommissioned }),
    [environment, preferences.showCommissioned],
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
        <TopBar
          breadcrumbs={breadcrumbs}
          environment={environment}
          onOpenPalette={openPalette}
          onToggleMobileNav={() => setMobileNavOpen((open) => !open)}
        />

        <div className="portal-body">
          <div className="portal-rail">
            <Sidebar
              registry={registry.data}
              options={navOptions}
              collapsed={preferences.sidebarCollapsed}
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
                />
              </div>
            </div>
          ) : null}

          <main className="portal-content" id="portal-content">
            <PortalRoutes registry={registry.data} />
          </main>
        </div>

        <CommandPalette
          registry={registry.data}
          options={navOptions}
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
        />
      </div>
      </PortalPresentationProvider>
    </PortalContext.Provider>
  );
}
