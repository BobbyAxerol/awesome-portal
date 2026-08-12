import { useEffect, useState } from "react";
import { Topbar, Sidebar } from "@/components/PortalShell";
import { DocsView } from "@/components/DocsView";
import { LegacyView } from "@/components/LegacyView";
import { ToastProvider } from "@/components/ui";
import { parseHash, routeHash, subscribeHash, navigate, type Route, type View } from "@/lib/router";
import { getTheme, saveTheme } from "@/lib/storage";
import { detectApi, type ApiMode } from "@/lib/api";

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());
  const [apiMode, setApiMode] = useState<ApiMode>("detecting");

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
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    if (next === "dark") window.dispatchEvent(new Event("themechange"));
  };

  const props = {
    view: route.view,
    page: route.page,
    theme,
    apiMode,
    onNavigate: handleNavigate,
    onToggleTheme: toggleTheme,
  };

  return (
    <ToastProvider>
      <div className="app">
        <Topbar {...props} />
        <div className="workspace">
          <Sidebar {...props} />
          <main className="content">
            {route.view === "docs" ? (
              <DocsView pageId={route.page} theme={theme} onNavigate={(v, p) => handleNavigate(v as View, p)} />
            ) : (
              <LegacyView view={route.view} theme={theme} />
            )}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

export { routeHash };