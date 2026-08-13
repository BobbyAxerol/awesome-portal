import { lazy, Suspense, useEffect, useState } from "react";
import { Topbar, Sidebar } from "@/components/PortalShell";
import { ToastProvider } from "@/components/ui";
import { parseHash, routeHash, subscribeHash, navigate, type Route, type View } from "@/lib/router";
import { getTheme, saveTheme } from "@/lib/storage";
import { detectApi, type ApiMode } from "@/lib/api";

// Each view carries a substantial raw-document or domain payload. Route-level
// loading keeps the first paint small while preserving every legacy hash route.
const DocsFeature = lazy(async () => import("@/features/docs/DocsFeature").then((module) => ({ default: module.DocsFeature })));
const RoadmapFeature = lazy(async () => import("@/features/roadmap/RoadmapFeature").then((module) => ({ default: module.RoadmapFeature })));
const TaskBoardFeature = lazy(async () => import("@/features/tasks/TaskBoardFeature").then((module) => ({ default: module.TaskBoardFeature })));
const ReportsFeature = lazy(async () => import("@/features/reports/ReportsFeature").then((module) => ({ default: module.ReportsFeature })));
const EvidenceFeature = lazy(async () => import("@/features/evidence/EvidenceFeature").then((module) => ({ default: module.EvidenceFeature })));
const PortalMockupFeature = lazy(async () => import("@/features/portal-mockup/PortalMockupFeature").then((module) => ({ default: module.PortalMockupFeature })));
const InterpretationFeature = lazy(async () => import("@/features/interpretation/InterpretationFeature").then((module) => ({ default: module.InterpretationFeature })));

function FeatureLoading() {
  return <div className="feature-loading" role="status">Loading workspace…</div>;
}

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
        return <Suspense fallback={<FeatureLoading />}><DocsFeature pageId={route.page} theme={theme} onNavigate={handleNavigate} /></Suspense>;
      case "roadmap":
        return <Suspense fallback={<FeatureLoading />}><RoadmapFeature apiMode={apiMode} /></Suspense>;
      case "board":
        return <Suspense fallback={<FeatureLoading />}><TaskBoardFeature apiMode={apiMode} /></Suspense>;
      case "reports":
        return <Suspense fallback={<FeatureLoading />}><ReportsFeature theme={theme} onOpenInterpretation={() => handleNavigate("interpretation")} /></Suspense>;
      case "interpretation":
        return <Suspense fallback={<FeatureLoading />}><InterpretationFeature onOpenReports={() => handleNavigate("reports")} /></Suspense>;
      case "evidence":
        return <Suspense fallback={<FeatureLoading />}><EvidenceFeature theme={theme} /></Suspense>;
      case "portal":
        return <Suspense fallback={<FeatureLoading />}><PortalMockupFeature theme={theme} /></Suspense>;
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
