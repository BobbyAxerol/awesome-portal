/**
 * Reusable Planning feature body (v0.4 §P0.10).
 *
 * This is the part of the Planning app that is NOT shell: no topbar, no
 * sidebar, no hash router. The standalone entry wraps it with its own shell
 * during the compatibility window; the Portal shell embeds the same component
 * so there is exactly one implementation of these views.
 *
 * Routing is a prop, not a global: the host decides whether the view comes
 * from a hash or from a path.
 */
import { lazy, Suspense } from "react";

import { ToastProvider } from "@/components/ui";
import type { ApiMode } from "@/lib/api";
import type { View } from "@/lib/router";

// Each view carries a substantial raw-document or domain payload. Route-level
// loading keeps the first paint small while preserving every legacy route.
const DocsFeature = lazy(async () =>
  import("@/features/docs/DocsFeature").then((m) => ({ default: m.DocsFeature })),
);
const RoadmapFeature = lazy(async () =>
  import("@/features/roadmap/RoadmapFeature").then((m) => ({ default: m.RoadmapFeature })),
);
const TaskBoardFeature = lazy(async () =>
  import("@/features/tasks/TaskBoardFeature").then((m) => ({ default: m.TaskBoardFeature })),
);
const ReportsFeature = lazy(async () =>
  import("@/features/reports/ReportsFeature").then((m) => ({ default: m.ReportsFeature })),
);
const EvidenceFeature = lazy(async () =>
  import("@/features/evidence/EvidenceFeature").then((m) => ({ default: m.EvidenceFeature })),
);
const PortalMockupFeature = lazy(async () =>
  import("@/features/portal-mockup/PortalMockupFeature").then((m) => ({
    default: m.PortalMockupFeature,
  })),
);
const InterpretationFeature = lazy(async () =>
  import("@/features/interpretation/InterpretationFeature").then((m) => ({
    default: m.InterpretationFeature,
  })),
);

function FeatureLoading() {
  return (
    <div className="feature-loading" role="status">
      Loading workspace…
    </div>
  );
}

export interface PlanningFeatureProps {
  view: View;
  page: string | null;
  theme: "light" | "dark";
  apiMode: ApiMode;
  onNavigate: (view: View, page?: string) => void;
  /** Host-provided toast surface. The standalone shell provides its own. */
  withToastProvider?: boolean;
}

export function PlanningFeatureBody({
  view,
  page,
  theme,
  apiMode,
  onNavigate,
}: Omit<PlanningFeatureProps, "withToastProvider">) {
  switch (view) {
    case "docs":
      return (
        <Suspense fallback={<FeatureLoading />}>
          <DocsFeature pageId={page} theme={theme} onNavigate={onNavigate} />
        </Suspense>
      );
    case "roadmap":
      return (
        <Suspense fallback={<FeatureLoading />}>
          <RoadmapFeature apiMode={apiMode} />
        </Suspense>
      );
    case "board":
      return (
        <Suspense fallback={<FeatureLoading />}>
          <TaskBoardFeature apiMode={apiMode} />
        </Suspense>
      );
    case "reports":
      return (
        <Suspense fallback={<FeatureLoading />}>
          <ReportsFeature theme={theme} onOpenInterpretation={() => onNavigate("interpretation")} />
        </Suspense>
      );
    case "interpretation":
      return (
        <Suspense fallback={<FeatureLoading />}>
          <InterpretationFeature onOpenReports={() => onNavigate("reports")} />
        </Suspense>
      );
    case "evidence":
      return (
        <Suspense fallback={<FeatureLoading />}>
          <EvidenceFeature theme={theme} />
        </Suspense>
      );
    case "portal":
      return (
        <Suspense fallback={<FeatureLoading />}>
          <PortalMockupFeature theme={theme} />
        </Suspense>
      );
  }
}

/** Feature body with its own toast surface — the form an embedding host uses. */
export function PlanningFeature({ withToastProvider = true, ...props }: PlanningFeatureProps) {
  const body = <PlanningFeatureBody {...props} />;
  return withToastProvider ? <ToastProvider>{body}</ToastProvider> : body;
}
