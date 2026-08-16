import { useEffect, useState } from "react";
import { Topbar, Sidebar } from "@/components/PortalShell";
import { ToastProvider } from "@/components/ui";
import { PlanningFeatureBody } from "@/embedded/PlanningFeature";
import { parseHash, routeHash, subscribeHash, navigate, type Route, type View } from "@/lib/router";
import { getTheme, saveTheme } from "@/lib/storage";
import { detectApi, type ApiMode } from "@/lib/api";

/**
 * Standalone Planning entry — the compatibility surface at
 * `/roadmap-task-board/`.
 *
 * The views themselves live in `embedded/PlanningFeature`, shared with the
 * Portal shell embedding, so the two never drift. What stays here is only the
 * standalone shell: hash routing, its own topbar/sidebar and theme toggle.
 */
export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());
  const [apiMode, setApiMode] = useState<ApiMode>("detecting");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    return subscribeHash((r) => setRoute(r));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void detectApi().then((mode) => {
      if (!cancelled) setApiMode(mode);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavigate = (view: View, page?: string) => {
    navigate({ view, page: page ?? null });
    setRoute({ view, page: page ?? null });
    setSidebarOpen(false);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    window.dispatchEvent(new Event("themechange"));
  };

  const props = {
    view: route.view,
    page: route.page,
    theme,
    apiMode,
    onNavigate: handleNavigate,
    onToggleTheme: toggleTheme,
    sidebarOpen,
    onToggleSidebar: () => setSidebarOpen((open) => !open),
    onPrint: () => window.print(),
  };

  return (
    <ToastProvider>
      <div className="app">
        <Topbar {...props} />
        <div className="workspace">
          <Sidebar {...props} />
          {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
          <main className="content">
            <PlanningFeatureBody
              view={route.view}
              page={route.page}
              theme={theme}
              apiMode={apiMode}
              onNavigate={handleNavigate}
            />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

export { routeHash };
