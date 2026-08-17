/**
 * QuantBT Research as a module of the Portal shell — U04.
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
import { Copy, Download, FolderOpen, Plus, ShieldAlert } from "lucide-react";
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
    return <StateView kind="loading" message="Đang tải run…" />;
  }
  if (run.isError || !run.data) {
    return (
      <StateView
        kind="failed"
        code={runId}
        message={run.error instanceof Error ? run.error.message : "Không đọc được run này."}
        onRetry={() => void run.refetch()}
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
      Run detail trả về <span>run_id {bodyIdMismatch}</span> nhưng URL yêu cầu{" "}
      <span>{runId}</span>. Portal đọc artifact theo id trên URL; hai giá trị lệch nhau là
      dấu hiệu dữ liệu run không nhất quán.
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
  if (runs.isLoading) return <StateView kind="loading" message="Đang tìm run mặc định…" />;
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
    return match ? decodeURIComponent(match[1]) : null;
  }, [location.pathname]);

  const activeRun = useQuery({
    queryKey: ["run", activeRunId ?? ""],
    queryFn: () => api.getRun(activeRunId as string),
    enabled: Boolean(activeRunId),
  });

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
            {fmtShortHash(activeRunId)}
            {copied ? " ✓" : ""}
          </button>
          <a className="btn-ghost no-print" href={`/api/runs/${activeRunId}/export`}>
            <Download size={12} />
            Export
          </a>
        </>
      ) : null}
      <Link to={`${QUANTBT_ROOT}/imports`} className="btn-ghost no-print" aria-label="Alpha imports">
        <ShieldAlert size={12} />
        Imports
      </Link>
      <Link className="btn-primary no-print" to={`${QUANTBT_ROOT}/new`}>
        <Plus size={13} />
        New run
      </Link>
    </>
  );

  return (
    <>
      <ModuleHeader
        title={feature?.label ?? "QuantBT Research"}
        description={feature?.description}
        maturity={feature?.maturity ?? "AVAILABLE"}
        dataMode={feature?.data_mode ?? "REAL"}
        actions={actions}
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip>{strategies.data?.[0]?.strategy_id ?? "—"}</Chip>
          {activeRunId ? <Chip>current {fmtShortHash(activeRunId)}</Chip> : null}
          <RunStatusBadge status={activeRun.data?.status ?? null} />
        </div>
      </ModuleHeader>

      <Routes>
        <Route path="new" element={<ConfigWorkspace />} />
        {/* The quarantine inbox lives under QuantBT because it is about the
          * strategies this module's picker can (and cannot) run. ALPHA_POOL is
          * still COMMISSIONED in the registry, and rendering a working screen
          * there would contradict its own badge. */}
        <Route path="imports" element={<ImportInbox />} />
        <Route path="alphas/:alphaId/:version" element={<AlphaVersionDetail />} />
        <Route path="runs" element={<RunLibrary />} />
        <Route path="runs/:runId/*" element={<RunWorkspace />} />
        <Route path=":tab" element={<LegacyTabRedirect />} />
        <Route index element={<ResolveDefaultRun />} />
        <Route path="*" element={<Navigate to={QUANTBT_ROOT} replace />} />
      </Routes>
    </>
  );
}

export { runPath, runTabPath };
