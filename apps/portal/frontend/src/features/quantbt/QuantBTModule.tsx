/**
 * QuantBT Backtest as a module of the Portal shell — U04.
 *
 * The feature body is unchanged; what moved is the shell around it. The
 * standalone `TopBar` became the module header's context and actions, and run
 * identity moved from `?run=` into the canonical path.
 *
 * Invariants preserved from the standalone app (v0.4 §P0.9):
 *  - no metric is recalculated here;
 *  - run selection resolves to the same run for canonical and legacy links;
 *  - the explicit "open results" gate after COMPLETED is unchanged;
 *  - progress/SSE behaviour and artifact/export routes are unchanged.
 */
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Copy, Download, FolderOpen, Map as MapIcon, Plus, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { ModuleHeader } from "../../app/ModuleHeader";
import { useFeature } from "../../app/context";
import { Badge, Chip, StateView } from "../../components/ui";
import { api, canOpenRunResults, isTerminal, type RunSummary } from "../../lib/api";
import { fmtShortHash } from "../../lib/format";
import { AuditView } from "../audit/AuditView";
import { ConfigWorkspace } from "../config/ConfigWorkspace";
import { AlphaVersionDetail } from "../imports/AlphaVersionDetail";
import { ImportInbox } from "../imports/ImportInbox";
import { ExecutionView } from "../execution/ExecutionView";
import { OptimizationView } from "../optimization/OptimizationView";
import { OverviewView } from "../overview/OverviewView";
import { ParametersView } from "../parameters/ParametersView";
import { RunLibrary } from "../runs/RunLibrary";
import { RunProgress } from "../runs/RunProgress";
import { QuantBTSubnav } from "./QuantBTSubnav";
import { RunPassport } from "./RunPassport";
import { QUANTBT_ROOT, isQuantBTTab, runPath, runTabPath } from "./routes";
import { EngineAtlasRoute, JourneyMapRoute } from "../../research/foundationRoutes";
import { AlphaImportRoute } from "../../research/AlphaImportRoute";
import { NewRunRoute } from "../../research/NewRunRoute";
import { RunProgressRoute } from "../../research/RunProgressRoute";
import { RunLibraryRoute } from "../../research/RunLibraryRoute";
import { EvidenceFlowRoute } from "../../research/EvidenceFlowRoute";
import { SplitRoute } from "../../research/SplitRoute";
import { SearchRoute } from "../../research/SearchRoute";
import { FreezeRoute } from "../../research/FreezeRoute";
import { PortalApiError } from "../../lib/api";

function RunStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const tone =
    status === "COMPLETED" ? "pass" : status === "FAILED" || status === "CANCELLED" ? "fail" : "pending";
  return <Badge tone={tone}>{status}</Badge>;
}

/**
 * The run the standalone app would have selected when none was named: the
 * first COMPLETED run in the library. Kept identical so a bookmark of
 * `/overview` still opens the run it always did.
 */
function defaultRun(runs: RunSummary[] | undefined): RunSummary | null {
  return runs?.find((item) => item.status === "COMPLETED") ?? null;
}

/* -------------------------------------------------------------------------
 * Run workspace — canonical /runs/:runId/*
 * ---------------------------------------------------------------------- */

function RunWorkspace() {
  const { runId = "" } = useParams();
  const [finishedNow, setFinishedNow] = useState(false);
  const previousStatus = useRef<string | null>(null);
  const navigate = useNavigate();

  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    enabled: Boolean(runId),
    refetchInterval: (query) => (query.state.data && !isTerminal(query.state.data.status) ? 1500 : false),
  });

  // A run that completes while being watched stays on progress until the user
  // explicitly opens results (§15.7 gate).
  useEffect(() => {
    const status = run.data?.status ?? null;
    if (
      previousStatus.current &&
      previousStatus.current !== "COMPLETED" &&
      previousStatus.current !== "FAILED" &&
      previousStatus.current !== "CANCELLED" &&
      status === "COMPLETED"
    ) {
      setFinishedNow(true);
    }
    previousStatus.current = status;
  }, [run.data?.status]);

  if (run.isLoading && !run.data) {
    return <StateView kind="loading" message="Loading run…" />;
  }
  if (run.isError || !run.data) {
    /*
     * PHASE 5 (round 2): a run that does not exist is not a failure.
     *
     * Every 404 here rendered "✕ Something went wrong" with a Retry button —
     * the one screen of the ten that answered a missing record worse than the
     * execution screens do. Nothing went wrong, the id names nothing, and
     * retrying the same id will keep naming nothing. `absent` and `failed` are
     * different states and the reader acts differently on each.
     */
    const absent = run.error instanceof PortalApiError && run.error.status === 404;
    return (
      <StateView
        kind={absent ? "empty" : "failed"}
        code={runId}
        message={absent
          ? "No run carries this id. A run appears here once QuantBT has accepted one; this id matches none in this workspace."
          : run.error instanceof Error ? run.error.message : "This run could not be read."}
        {...(absent ? {} : { onRetry: () => void run.refetch() })}
      />
    );
  }

  const current = run.data;

  /*
   * The route decides which run this is; the response only describes it.
   *
   * Every child read used `current.run_id` from the body, so one inconsistent
   * field would silently redirect the console, ledger and every result tab to a
   * different run's artifacts. The id the user navigated to is the identity.
   *
   * A disagreement is not normalised away either — it is a real inconsistency in
   * whatever served the run, and hiding it is how a screen ends up mixing two
   * runs without saying so.
   */
  const bodyIdMismatch = current.run_id && current.run_id !== runId ? current.run_id : null;
  const mismatchNotice = bodyIdMismatch ? (
    <div className="run-id-mismatch mono no-print" role="alert">
      Run detail returned <span>run_id {bodyIdMismatch}</span> but the URL asked for{" "}
      <span>{runId}</span>. The Portal reads artifacts by the id in the URL, so two different
      values mean this run's data is inconsistent.
    </div>
  ) : null;

  if (!canOpenRunResults(current.status) || finishedNow) {
    return (
      <>
        {mismatchNotice}
        <RunPassport runId={runId} status={current.status} />
        <RunProgress
          runId={runId}
          onViewResults={() => {
            setFinishedNow(false);
            navigate(runTabPath(runId, "overview"));
          }}
        />
      </>
    );
  }

  return (
    <>
      {mismatchNotice}
      <RunPassport runId={runId} status={current.status} />
      <QuantBTSubnav runId={runId} />
      <Routes>
        <Route path="overview" element={<OverviewView runId={runId} />} />
        <Route path="optimization" element={<OptimizationView runId={runId} />} />
        <Route path="parameters" element={<ParametersView runId={runId} />} />
        <Route path="execution" element={<ExecutionView runId={runId} />} />
        <Route path="audit" element={<AuditView runId={runId} />} />
        <Route path="*" element={<Navigate to={runTabPath(runId, "overview")} replace />} />
      </Routes>
    </>
  );
}

/* -------------------------------------------------------------------------
 * Default-run resolution for the module root and bare legacy tabs
 * ---------------------------------------------------------------------- */

/**
 * Resolves `/research/quantbt` and `/research/quantbt/<tab>` (no run named)
 * onto a canonical run URL, reproducing the standalone default-run behaviour.
 * With no completed run at all, the module opens New Run — the only action
 * available in that state.
 */
function ResolveDefaultRun({ tab }: { tab?: string }) {
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.listRuns });
  if (runs.isLoading) return <StateView kind="loading" message="Resolving the default run…" />;
  const target = defaultRun(runs.data);
  if (!target) return <Navigate to={`${QUANTBT_ROOT}/new`} replace />;
  const safeTab = tab && isQuantBTTab(tab) ? tab : "overview";
  return <Navigate to={runTabPath(target.run_id, safeTab)} replace />;
}

/** `/research/quantbt/<tab>?run=…` — the in-module legacy form. */
function LegacyTabRedirect() {
  const { tab = "" } = useParams();
  const [params] = useSearchParams();
  const runId = params.get("run");
  if (!isQuantBTTab(tab)) return <Navigate to={QUANTBT_ROOT} replace />;
  if (runId) return <Navigate to={runTabPath(runId, tab)} replace />;
  return <ResolveDefaultRun tab={tab} />;
}

/* -------------------------------------------------------------------------
 * Module
 * ---------------------------------------------------------------------- */

/** Path segments under `runs/` that name a screen rather than a run. */
const RESERVED_RUN_SEGMENTS = new Set(["new", "legacy"]);

export function QuantBTModule() {
  const feature = useFeature("QUANTBT_RESEARCH");
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  const runs = useQuery({ queryKey: ["runs"], queryFn: api.listRuns, refetchInterval: 4000 });
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });

  // The active run is whatever the canonical path names. Reading it from the
  // URL keeps the header, passport and export action in agreement by
  // construction, instead of tracking a second copy of the selection.
  const activeRunId = useMemo(() => {
    const match = /\/runs\/([^/]+)/.exec(location.pathname);
    if (!match) return null;
    const segment = decodeURIComponent(match[1]);
    /* `runs/new` is Screen 02, not a run. Without this the module read "new"
       as a run id and fetched `/api/runs/new` on every visit — a request for a
       run that cannot exist, and two console errors on a screen that had not
       created anything yet. */
    if (RESERVED_RUN_SEGMENTS.has(segment)) return null;
    /* Screen 03 reads a P11 run through its own contract. The legacy passport
       fetch would ask `/api/runs/{id}` for a run that legacy store never had,
       which is the same defect one level down. */
    if (/\/runs\/[^/]+\/(progress|evidence|split|search|freeze)(\/|$)/.test(location.pathname)) return null;
    return segment;
  }, [location.pathname]);

  const activeRun = useQuery({
    queryKey: ["run", activeRunId ?? ""],
    queryFn: () => api.getRun(activeRunId as string),
    enabled: Boolean(activeRunId),
  });

  // On a run route the passport strip below carries run, status, protocol,
  // strategy, instrument and created-at. Repeating three of those in the module
  // header printed the same identity twice, 40px apart.
  const onRunRoute = activeRunId !== null;
  // New Run and the import inbox are their own tasks with their own headings; the
  // active-run context strip above them was a fourth band of chrome before the
  // first control, describing something the reader is not looking at.
  const onTaskRoute = /\/(new|imports|alphas)(\/|$)/.test(location.pathname);
  // P09's two reference screens carry their own title and subtitle, so the
  // module caption repeats an identity the reader already has 40px above.
  // Kept separate from `onTaskRoute` on purpose: widening that regex would
  // also have dropped the caption from New Run and the import inbox, which are
  // outside this phase and inside the visual baseline.
  const onReferenceRoute =
    /\/(journey|atlas|alpha-import|runs\/new|runs\/[^/]+\/(progress|evidence|split|search|freeze))(\/|$)/.test(location.pathname) ||
    /\/runs$/.test(location.pathname);

  const actions = (
    <>
      <Link to={`${QUANTBT_ROOT}/runs`} className="btn-ghost no-print" aria-label="Run library">
        <FolderOpen size={12} />
        Runs
        {runs.data?.length ? <span className="text-ink-faint">({runs.data.length})</span> : null}
      </Link>
      {activeRunId ? (
        <>
          <button
            type="button"
            className="btn-ghost no-print"
            onClick={() => {
              void navigator.clipboard?.writeText(activeRunId).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
            aria-label="Copy run id"
          >
            <Copy size={12} />
            {/* The verb has to be visible: the old label was the run id alone,
              * which named a thing instead of saying what the button does. */}
            {copied ? "Copied ✓" : "Copy id"}
            <span className="mono text-ink-faint">{fmtShortHash(activeRunId)}</span>
          </button>
          <a className="btn-ghost no-print" href={`/api/runs/${activeRunId}/export`}>
            <Download size={12} />
            Export
          </a>
        </>
      ) : null}
      {onReferenceRoute ? (
        // Only on the Research Loop screens, so the legacy headers in the
        // visual baseline are unchanged.
        <>
          <Link to={`${QUANTBT_ROOT}/journey`} className="btn-ghost no-print">
            <MapIcon size={12} />
            Journey
          </Link>
          <Link to={`${QUANTBT_ROOT}/atlas`} className="btn-ghost no-print">
            <BookOpen size={12} />
            Engine Atlas
          </Link>
        </>
      ) : null}
      {/* Research Loop entry points (RF-02 preview): Imports opens S14 and New
        * run opens S02. The previous screens stay at /imports and /new. */}
      <Link to={`${QUANTBT_ROOT}/alpha-import`} className="btn-ghost no-print" aria-label="Alpha imports">
        <ShieldAlert size={12} />
        Imports
      </Link>
      <Link className="btn-primary no-print" to={`${QUANTBT_ROOT}/runs/new`}>
        <Plus size={13} />
        New run
      </Link>
    </>
  );

  return (
    <>
      <ModuleHeader
        title={feature?.label ?? "QuantBT Backtest"}
        // The module description is orientation for someone arriving, not a
        // caption to reprint on every sub-route.
        description={onRunRoute || onReferenceRoute ? undefined : feature?.description}
        maturity={feature?.maturity ?? "AVAILABLE"}
        dataMode={feature?.data_mode ?? "REAL"}
        actions={actions}
      >
        {onRunRoute || onTaskRoute || onReferenceRoute ? null : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip>{strategies.data?.[0]?.strategy_id ?? "—"}</Chip>
            {activeRunId ? <Chip>current {fmtShortHash(activeRunId)}</Chip> : null}
            <RunStatusBadge status={activeRun.data?.status ?? null} />
          </div>
        )}
      </ModuleHeader>

      <Routes>
        <Route path="new" element={<ConfigWorkspace />} />
        {/* The quarantine inbox lives under QuantBT because it is about the
          * strategies this module's picker can (and cannot) run. ALPHA_POOL is
          * still COMMISSIONED in the registry, and rendering a working screen
          * there would contradict its own badge. */}
        {/* P09 · S00 and S12. Both render inside this module's shell and add
          * none of their own: the journey map is shell-free by construction and
          * the Atlas is a reference surface, not a stage. */}
        <Route path="journey" element={<JourneyMapRoute />} />
        <Route path="atlas" element={<EngineAtlasRoute />} />
        {/* P10 · Screen 02. A static segment, so it wins over `runs/:runId/*`
          * without depending on declaration order. */}
        <Route path="runs/new" element={<NewRunRoute />} />
        {/* P11 · Screen 03. A sibling of the legacy workspace, not a child of
          * it: a P11 run id is not a legacy run, and routing it through
          * `RunWorkspace` would fetch one that does not exist. */}
        <Route path="runs/:runId/progress" element={<RunProgressRoute />} />
        {/* P13 · Screen 04, beside the legacy workspace rather than over it. */}
        <Route path="runs/:runId/evidence" element={<EvidenceFlowRoute />} />
        {/* P14 · Screen 05, the first deep dive out of the hub. */}
        <Route path="runs/:runId/split" element={<SplitRoute />} />
        {/* P15 · Screen 06. */}
        <Route path="runs/:runId/search" element={<SearchRoute />} />
        {/* P16 · Screen 07. */}
        <Route path="runs/:runId/freeze" element={<FreezeRoute />} />
        {/* Screen 14's canonical route, resolved as `FD-P09-02`: under QuantBT
          * rather than under the still-COMMISSIONED ALPHA_POOL feature.
          * Legacy `imports` below is untouched. */}
        <Route path="alpha-import" element={<AlphaImportRoute />} />
        <Route path="imports" element={<ImportInbox />} />
        <Route path="alphas/:alphaId/:version" element={<AlphaVersionDetail />} />
        {/* P12 · Screen 01 on the canonical route spec 01 names. The screen it
          * replaces is not deleted — it stays reachable at `runs/legacy`, so
          * the swap is one line to reverse. */}
        <Route path="runs" element={<RunLibraryRoute />} />
        <Route path="runs/legacy" element={<RunLibrary />} />
        <Route path="runs/:runId/*" element={<RunWorkspace />} />
        <Route path=":tab" element={<LegacyTabRedirect />} />
        {/* The module opens on S01; the latest legacy run is one click away in it. */}
        <Route index element={<Navigate to={`${QUANTBT_ROOT}/runs`} replace />} />
        <Route path="*" element={<Navigate to={QUANTBT_ROOT} replace />} />
      </Routes>
    </>
  );
}

export { runPath, runTabPath };
