import { lazy, Suspense, useEffect, useState } from "react";
import { Topbar, Sidebar } from "@/components/PortalShell";
import { ToastProvider } from "@/components/ui";
import { DocsFeature } from "@/features/docs/DocsFeature";
import { EvidenceFeature } from "@/features/evidence/EvidenceFeature";
import { PortalMockupFeature } from "@/features/portal-mockup/PortalMockupFeature";
import { ReportsFeature } from "@/features/reports/ReportsFeature";
import { RoadmapFeature } from "@/features/roadmap/RoadmapFeature";
import { TaskBoardFeature } from "@/features/tasks/TaskBoardFeature";
import { parseHash, routeHash, subscribeHash, navigate, type Route, type View } from "@/lib/router";
import { getTheme, saveTheme } from "@/lib/storage";
import { detectApi, type ApiMode } from "@/lib/api";

const InterpretationFeature = lazy(async () => import("@/features/interpretation/InterpretationFeature").then((module) => ({ default: module.InterpretationFeature })));

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

  const renderView = () => {
    switch (route.view) {
      case "docs":
        return <DocsFeature pageId={route.page} theme={theme} onNavigate={handleNavigate} />;
      case "roadmap":
        return <RoadmapFeature apiMode={apiMode} />;
      case "board":
        return <TaskBoardFeature apiMode={apiMode} />;
      case "reports":
        return <ReportsFeature theme={theme} onOpenInterpretation={() => handleNavigate("interpretation")} />;
      case "interpretation":
        return <Suspense fallback={<div className="feature-loading" role="status">Loading interpretation…</div>}><InterpretationFeature onOpenReports={() => handleNavigate("reports")} /></Suspense>;
      case "evidence":
        return <EvidenceFeature theme={theme} />;
      case "portal":
        return <PortalMockupFeature theme={theme} />;
    }
  };

  return (
    <ToastProvider>
      <div className="app">
        <Topbar {...props} />
        <div className="workspace">
          <Sidebar {...props} />
          {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
          <main className="content">
            {renderView()}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

export { routeHash };
