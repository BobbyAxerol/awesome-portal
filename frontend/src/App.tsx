import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";

import { api, isTerminal } from "./lib/api";
import { AuditView } from "./features/audit/AuditView";
import { ConfigWorkspace } from "./features/config/ConfigWorkspace";
import { ExecutionView } from "./features/execution/ExecutionView";
import { OptimizationView } from "./features/optimization/OptimizationView";
import { OverviewView } from "./features/overview/OverviewView";
import { ParametersView } from "./features/parameters/ParametersView";
import { RunProgress } from "./features/runs/RunProgress";
import { NavTabs, RunPassport, TopBar } from "./components/shell";

export function App() {
  const [params] = useSearchParams();
  const runId = params.get("run") ?? "";
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.listRuns, refetchInterval: 4000 });
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    enabled: Boolean(runId),
    refetchInterval: (query) => (query.state.data && !isTerminal(query.state.data.status) ? 1500 : false),
  });

  const currentRun = useMemo(() => {
    if (runId && run.data) return run.data;
    return runs.data?.find((item) => item.status === "COMPLETED");
  }, [runId, run.data, runs.data]);

  return (
    <div className="min-h-screen">
      <TopBar
        runs={runs.data ?? []}
        activeRunId={currentRun?.run_id ?? null}
        runStatus={run.data?.status ?? null}
      />
      {currentRun ? (
        <>
          <RunPassport runId={currentRun.run_id} status={currentRun.status} />
          {!isTerminal(currentRun.status) ? (
            <RunProgress runId={currentRun.run_id} />
          ) : (
            <>
              <NavTabs />
              <main className="mx-auto max-w-[1440px] px-6 py-6">
                <Routes>
                  <Route path="/overview" element={<OverviewView runId={currentRun.run_id} />} />
                  <Route path="/optimization" element={<OptimizationView runId={currentRun.run_id} />} />
                  <Route path="/parameters" element={<ParametersView runId={currentRun.run_id} />} />
                  <Route path="/execution" element={<ExecutionView runId={currentRun.run_id} />} />
                  <Route path="/audit" element={<AuditView runId={currentRun.run_id} />} />
                  <Route path="*" element={<Navigate to="/overview" replace />} />
                </Routes>
              </main>
            </>
          )}
        </>
      ) : (
        <main className="mx-auto max-w-[1440px] px-6 py-6">
          <ConfigWorkspace />
        </main>
      )}
    </div>
  );
}
