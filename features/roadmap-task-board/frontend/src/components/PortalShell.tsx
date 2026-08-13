import { type ReactNode } from "react";
import type { View } from "@/lib/router";
import { DOC_NAV } from "@/content/doc-nav";

export interface ShellProps {
  view: View;
  page: string | null;
  theme: "light" | "dark";
  apiMode: "local" | "api" | "detecting";
  onNavigate: (view: View, page?: string) => void;
  onToggleTheme: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onPrint?: () => void;
  children?: ReactNode;
}

/** Top-level navigation — Portal không nổi bật ở đây (xem docs/MIGRATION_TRACKER_PURPOSE.md). */
export const TOP_TABS: { id: View; label: string }[] = [
  { id: "docs", label: "Docs" },
  { id: "roadmap", label: "Roadmap" },
  { id: "board", label: "Board" },
  { id: "reports", label: "Reports" },
  { id: "evidence", label: "Evidence" },
];

/** Portal chỉ truy cập từ sidebar, nhóm Settings. */
export const SETTINGS_TABS: { id: View; label: string }[] = [{ id: "portal", label: "Portal" }];

export function Topbar({ view, theme, apiMode, onNavigate, onToggleTheme, sidebarOpen = false, onToggleSidebar, onPrint }: ShellProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 15.5 10.5 12l2.5 2.5 4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="brand-name">Quant Ecosystem</span>
        <span className="brand-tag">Roadmap &amp; Task Board</span>
      </div>
      <nav className="top-tabs" aria-label="Views">
        {TOP_TABS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`navtab ${view === v.id ? "navtab-active" : ""}`}
            onClick={() => onNavigate(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="topbar-actions">
        <button type="button" className="icon-btn menu-btn" aria-label={sidebarOpen ? "Close navigation" : "Open navigation"} aria-expanded={sidebarOpen} onClick={onToggleSidebar}>☰</button>
        <button type="button" className="icon-btn" aria-label="Print current view" onClick={onPrint}>⎙</button>
        <span className={`sync-badge ${apiMode === "api" ? "on" : ""}`} title={apiMode === "api" ? "API connected" : apiMode === "detecting" ? "Detecting backend…" : "Local storage"}>
          {apiMode === "detecting" ? "…" : apiMode === "api" ? "API" : "LOCAL"}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}

export function Sidebar({ view, page, onNavigate, sidebarOpen = false }: ShellProps) {
  return (
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} aria-label="Navigation">
      {view === "docs" ? (
        <>
          <p className="mono-label">Documents</p>
          <nav>
            {DOC_NAV.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`nav-item ${page === p.id ? "active" : ""}`}
                onClick={() => onNavigate("docs", p.id)}
              >
                <span className="nav-icon" aria-hidden="true" />
                <span className="nav-text">{p.title}</span>
              </button>
            ))}
          </nav>
        </>
      ) : (
        <nav>
          <p className="mono-label">Quản lý Task</p>
          {TOP_TABS.filter((v) => v.id !== "docs").map((v) => (
            <button
              key={v.id}
              type="button"
              className={`nav-item ${view === v.id ? "active" : ""}`}
              onClick={() => onNavigate(v.id)}
            >
              <span className="nav-icon" aria-hidden="true" />
              <span className="nav-text">{v.label}</span>
            </button>
          ))}
          {(view === "reports" || view === "interpretation") && (
            <>
              <p className="mono-label">Report workflow</p>
              <button type="button" className={`nav-item ${view === "reports" ? "active" : ""}`} onClick={() => onNavigate("reports")}>
                <span className="nav-icon" aria-hidden="true" />
                <span className="nav-text">Reports source</span>
              </button>
              <button type="button" className={`nav-item ${view === "interpretation" ? "active" : ""}`} onClick={() => onNavigate("interpretation")}>
                <span className="nav-icon" aria-hidden="true" />
                <span className="nav-text">Interpretation</span>
              </button>
            </>
          )}
          <p className="mono-label">Settings</p>
          {SETTINGS_TABS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`nav-item ${view === v.id ? "active" : ""}`}
              onClick={() => onNavigate(v.id)}
            >
              <span className="nav-icon" aria-hidden="true" />
              <span className="nav-text">{v.label}</span>
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
