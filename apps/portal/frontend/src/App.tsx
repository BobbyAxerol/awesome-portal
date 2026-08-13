import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import { api, canOpenRunResults, isTerminal } from "./lib/api";
import { AuditView } from "./features/audit/AuditView";
import { ConfigWorkspace } from "./features/config/ConfigWorkspace";
import { ExecutionView } from "./features/execution/ExecutionView";
import { OptimizationView } from "./features/optimization/OptimizationView";
import { OverviewView } from "./features/overview/OverviewView";
import { ParametersView } from "./features/parameters/ParametersView";
import { RunLibrary } from "./features/runs/RunLibrary";
import { RunProgress } from "./features/runs/RunProgress";
import { StateView } from "./components/ui";
import { NavTabs, RunPassport, TopBar } from "./components/shell";

/** Redirect to the overview tab while PRESERVING ?run= (bugfix: dropping the
 *  search param made run selection and post-submit navigation fall back to
 *  the default run). */
function OverviewRedirect() {
  const location = useLocation();
  return <Navigate to={`/overview${location.search}`} replace />;
}

export function App() {
  const [params] = useSearchParams();
  const location = useLocation();
  const runId = params.get("run") ?? "";
  const creatingRun = params.get("new") === "1";
  const isLibrary = location.pathname.startsWith("/runs");
  const [finishedNow, setFinishedNow] = useState(false);
  const previousStatus = useRef<string | null>(null);
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.listRuns, refetchInterval: 4000 });
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    enabled: Boolean(runId),
    refetchInterval: (query) => (query.state.data && !isTerminal(query.state.data.status) ? 1500 : false),
  });

  // When a run being watched transitions to COMPLETED, stay on the progress
  // screen until the user explicitly presses "Xem kết quả" (§15.7 gate).
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

  return (
    <div className="min-h-screen">
      <TopBar
        runs={runs.data ?? []}
        activeRunId={currentRun?.run_id ?? null}
        runStatus={run.data?.status ?? null}
      />
      {isLibrary ? (
        <RunLibrary />
      ) : runPending ? (
        <StateView kind="loading" message="Đang tải run…" />
      ) : runId && run.isError ? (
        <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6">
          <StateView kind="failed" message={run.error.message} />
        </main>
      ) : currentRun ? (
        <>
          <RunPassport runId={currentRun.run_id} status={currentRun.status} />
          {canOpenRunResults(currentRun.status) && !finishedNow ? (
            <>
              <NavTabs />
              <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6">
                <Routes>
                  <Route path="/overview" element={<OverviewView runId={currentRun.run_id} />} />
                  <Route path="/optimization" element={<OptimizationView runId={currentRun.run_id} />} />
                  <Route path="/parameters" element={<ParametersView runId={currentRun.run_id} />} />
                  <Route path="/execution" element={<ExecutionView runId={currentRun.run_id} />} />
                  <Route path="/audit" element={<AuditView runId={currentRun.run_id} />} />
                  <Route path="*" element={<OverviewRedirect />} />
                </Routes>
              </main>
            </>
          ) : (
            <RunProgress
              runId={currentRun.run_id}
              onViewResults={() => {
                setFinishedNow(false);
                window.location.href = `/overview?run=${currentRun.run_id}`;
              }}
            />
          )}
        </>
      ) : (
        <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6">
          <ConfigWorkspace />
        </main>
      )}
    </div>
  );
}
