/**
 * Planning embedded in the Portal shell — U05.
 *
 * The feature body is imported from Planning's own source (§P0.10: no iframe,
 * no second implementation). What this module owns is the embedding contract:
 * canonical `/planning/*` routes, the legacy `#view=` adapter, the API/LOCAL
 * mode badge, and the cross-link drawer that ties a Planning view back to the
 * Portal feature it governs.
 *
 * Planning's own topbar and sidebar are NOT rendered here — the shell provides
 * them, which is what removes the nested shell the U05 exit gate targets.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { PlanningFeature } from "@/embedded/PlanningFeature";
import {
  PLANNING_ROOT,
  PLANNING_VIEWS,
  canonicalPlanningPathFromHash,
  parsePlanningPath,
  planningPath,
} from "@/embedded/planningRoutes";
import { detectApi, type ApiMode } from "@/lib/api";
import type { View } from "@/lib/router";

import { ModuleHeader } from "../../app/ModuleHeader";
import { useFeature, usePortalContext } from "../../app/context";
import { StateView } from "../../components/ui";
import { usePreferences } from "../../app/preferences";
import { useLinks } from "../../portal/hooks";
import { PlanningCrossLinks } from "./PlanningCrossLinks";

/** API vs LOCAL must always be visible: local state is not shared state. */
function ApiModeBadge({ mode }: { mode: ApiMode }) {
  if (mode === "detecting") {
    return <span className="mono text-[11px] text-ink-faint">detecting the API…</span>;
  }
  const isApi = mode !== "local";
  return (
    <span
      className="badge-state"
      style={{
        color: isApi ? "var(--state-available)" : "var(--state-degraded)",
        background: isApi ? "var(--state-available-bg)" : "var(--state-degraded-bg)",
      }}
      data-api-mode={mode}
      title={
        isApi
          ? "Reads and writes through the Planning API — shared state."
          : "Local-first: this state lives in this browser only, and is not shared server state."
      }
    >
      <span aria-hidden="true">{isApi ? "●" : "◐"}</span>
      {isApi ? "API" : "LOCAL"}
    </span>
  );
}

function PlanningSubnav({ active }: { active: View }) {
  return (
    <nav className="portal-subnav" aria-label="Planning">
      {PLANNING_VIEWS.map((entry) => (
        <Link
          key={entry.view}
          to={planningPath(entry.view)}
          className={`navtab ${entry.view === active ? "navtab-active" : ""}`}
          aria-current={entry.view === active ? "page" : undefined}
        >
          {entry.label}
        </Link>
      ))}
    </nav>
  );
}

export function PlanningModule() {
  const location = useLocation();
  const navigate = useNavigate();
  const preferences = usePreferences();
  const feature = useFeature("PLANNING");
  const { registry } = usePortalContext();
  const [apiMode, setApiMode] = useState<ApiMode>("detecting");
  const links = useLinks();

  /**
   * Resolves a Planning task to the Portal screen it governs.
   *
   * The sidecar maps feature → task ids, so this walks it backwards. A task no
   * entry claims returns `null` and the drawer renders no link — better than a
   * link to a screen that does not own it.
   */
  const portalScreenForTask = useCallback(
    (taskId: string) => {
      const entry = (links.data?.entries ?? []).find((item) =>
        item.planning_task_ids.includes(taskId),
      );
      if (!entry?.feature_id) return null;
      const target = registry?.features.find((item) => item.id === entry.feature_id);
      if (!target || target.maturity === "HIDDEN") return null;
      return { href: target.canonical_route, label: target.label };
    },
    [links.data, registry],
  );

  useEffect(() => {
    let cancelled = false;
    void detectApi().then((mode) => {
      if (!cancelled) setApiMode(mode);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A legacy `#view=` link is translated once, on arrival, so back/forward
  // afterwards operate on canonical history entries only.
  const hashTarget = canonicalPlanningPathFromHash(location.hash);
  const at = useMemo(() => parsePlanningPath(location.pathname), [location.pathname]);

  if (hashTarget) return <Navigate to={hashTarget} replace />;

  if (location.pathname === PLANNING_ROOT || location.pathname === `${PLANNING_ROOT}/`) {
    return <Navigate to={planningPath("docs")} replace />;
  }

  const current = PLANNING_VIEWS.find((entry) => entry.view === at.view);

  return (
    <>
      <ModuleHeader
        title={feature?.label ?? "Planning & Migration"}
        description={feature?.description}
        maturity={feature?.maturity ?? "AVAILABLE"}
        dataMode={feature?.data_mode ?? "REAL"}
        actions={
          <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
            In / Export
          </button>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ApiModeBadge mode={apiMode} />
          <span className="mono text-[11px] text-ink-faint">
            {current ? `Planning · ${current.label}` : "Planning"}
          </span>
        </div>
      </ModuleHeader>

      <PlanningSubnav active={at.view} />

      {registry ? (
        <PlanningCrossLinks
          registry={registry}
          links={links.data ?? null}
          isLoading={links.isLoading}
          isError={links.isError}
        />
      ) : null}

      <div className="planning-embed">
        <PlanningFeature
          // Portal→Planning is one direction; this is the other. Only the shell
          // reads the Feature Registry, so it resolves the task→screen hop and
          // Planning stays free of a registry dependency (§P0.23).
          portalScreenForTask={portalScreenForTask}
          view={at.view}
          page={at.page}
          // Planning's views take a light/dark flag; the Portal's Operations
          // theme is the dark one, so the two stay in step without Planning
          // owning a second theme switch.
          theme={preferences.theme === "operations" ? "dark" : "light"}
          apiMode={apiMode}
          onNavigate={(view, page) => navigate(planningPath(view, page ?? null))}
        />
      </div>
    </>
  );
}

/** Bootstrap fallback used when the Planning body itself fails to load. */
export function PlanningUnavailable({ message }: { message: string }) {
  return <StateView kind="failed" message={message} />;
}
