/**
 * QuantBT Research as a module of the Portal shell.
 *
 * This is the P0.9 refactor: the feature body is unchanged, but the shell now
 * owns the topbar, so what used to live in the QuantBT `TopBar` becomes the
 * module header's context and actions.
 *
 * Invariants preserved from the standalone app (v0.4 §P0.9):
 *  - no metric is recalculated here;
 *  - run selection semantics are untouched (`?run=` still selects);
 *  - progress/SSE behaviour and the explicit "open results" gate are unchanged;
 *  - artifact and export routes are unchanged.
 */
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, FolderOpen, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import { ModuleHeader } from "../../app/ModuleHeader";
import { useFeature } from "../../app/context";
import { Badge, Chip, StateView } from "../../components/ui";
import { api, canOpenRunResults, isTerminal } from "../../lib/api";
import { fmtShortHash } from "../../lib/format";
import { AuditView } from "../audit/AuditView";
import { ConfigWorkspace } from "../config/ConfigWorkspace";
import { ExecutionView } from "../execution/ExecutionView";
import { OptimizationView } from "../optimization/OptimizationView";
import { OverviewView } from "../overview/OverviewView";
import { ParametersView } from "../parameters/ParametersView";
import { RunLibrary } from "../runs/RunLibrary";
import { RunProgress } from "../runs/RunProgress";
import { QuantBTSubnav } from "./QuantBTSubnav";
import { RunPassport } from "./RunPassport";
import { QUANTBT_ROOT } from "./routes";

function RunStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const tone =
    status === "COMPLETED" ? "pass" : status === "FAILED" || status === "CANCELLED" ? "fail" : "pending";
  return <Badge tone={tone}>{status}</Badge>;
}

/** Redirect that PRESERVES `?run=` — dropping it reset run selection. */
function OverviewRedirect() {
  const location = useLocation();
  return <Navigate to={`${QUANTBT_ROOT}/overview${location.search}`} replace />;
}

export function QuantBTModule() {
  const [params] = useSearchParams();
  const location = useLocation();
  const feature = useFeature("QUANTBT_RESEARCH");
  const runId = params.get("run") ?? "";
  const creatingRun = params.get("new") === "1";
  const isLibrary = location.pathname.startsWith(`${QUANTBT_ROOT}/runs`);
  const [finishedNow, setFinishedNow] = useState(false);
  const previousStatus = useRef<string | null>(null);

  const runs = useQuery({ queryKey: ["runs"], queryFn: api.listRuns, refetchInterval: 4000 });
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    enabled: Boolean(runId),
    refetchInterval: (query) => (query.state.data && !isTerminal(query.state.data.status) ? 1500 : false),
  });
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });

  // When a watched run reaches COMPLETED, stay on progress until the user
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

  const currentRun = useMemo(() => {
    if (creatingRun) return undefined;
    if (runId) return run.data ?? null;
    return runs.data?.find((item) => item.status === "COMPLETED") ?? null;
  }, [creatingRun, runId, run.data, runs.data]);

  const runPending = Boolean(runId) && run.isLoading && !run.data;
  const activeRunId = currentRun?.run_id ?? null;
  const [copied, setCopied] = useState(false);

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
          <RunStatusBadge status={run.data?.status ?? null} />
        </div>
      </ModuleHeader>

      {isLibrary ? (
        <RunLibrary />
      ) : runPending ? (
        <StateView kind="loading" message="Đang tải run…" />
      ) : runId && run.isError ? (
        <StateView kind="failed" message={run.error.message} />
      ) : currentRun ? (
        <>
          <RunPassport runId={currentRun.run_id} status={currentRun.status} />
          {canOpenRunResults(currentRun.status) && !finishedNow ? (
            <>
              <QuantBTSubnav />
              <Routes>
                <Route path="overview" element={<OverviewView runId={currentRun.run_id} />} />
                <Route path="optimization" element={<OptimizationView runId={currentRun.run_id} />} />
                <Route path="parameters" element={<ParametersView runId={currentRun.run_id} />} />
                <Route path="execution" element={<ExecutionView runId={currentRun.run_id} />} />
                <Route path="audit" element={<AuditView runId={currentRun.run_id} />} />
                <Route path="*" element={<OverviewRedirect />} />
              </Routes>
            </>
          ) : (
            <RunProgress
              runId={currentRun.run_id}
              onViewResults={() => {
                setFinishedNow(false);
                window.location.href = `${QUANTBT_ROOT}/overview?run=${currentRun.run_id}`;
              }}
            />
          )}
        </>
      ) : (
        <ConfigWorkspace />
      )}
    </>
  );
}
