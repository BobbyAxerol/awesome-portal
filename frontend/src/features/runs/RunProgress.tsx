/** Run progress: stage stepper + LedgerTerminal over the SSE/status stream (§9, §27.3 #7). */
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { api, isTerminal, type RunDetail } from "../../lib/api";
import { rowParams } from "../../lib/api";
import { fmtDuration, fmtTimestamp } from "../../lib/format";
import { StateView } from "../../components/ui";

const STAGE_ORDER = [
  "QUEUED",
  "VALIDATING_DATA",
  "WARMING_KERNEL",
  "OPTIMIZING_IS",
  "RANKING_IS_CANDIDATES",
  "REPLAYING_CANDIDATES_ON_OOS",
  "SELECTING_PARAMS",
  "FREEZING_PARAMS",
  "BACKTESTING_IS",
  "BACKTESTING_OOS",
  "BACKTESTING_HOLDOUT_LIVE",
  "BUILDING_ARTIFACTS",
  "COMPLETED",
];

function Stepper({ detail }: { detail: RunDetail }) {
  const seen = new Set(detail.events.map((event) => event.state));
  const terminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(detail.status);
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {STAGE_ORDER.filter((stage) => stage !== "QUEUED" && stage !== "COMPLETED").map((stage) => {
        const reached = seen.has(stage);
        const active = detail.status === stage;
        return (
          <li key={stage} className="flex items-center gap-1">
            <span
              className={`mono inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : reached
                    ? "border-good/40 bg-good-bg text-good"
                    : terminal
                      ? "border-line text-ink-faint"
                      : "border-line text-ink-faint"
              }`}
            >
              {reached && !active ? <Check size={10} /> : null}
              {stage.replaceAll("_", " ")}
            </span>
            {stage !== "BUILDING_ARTIFACTS" ? <span className="mono text-ink-faint">→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function RunProgress({ runId }: { runId: string }) {
  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: (query) => (query.state.data && isTerminal(query.state.data.status) ? false : 1200),
  });
  const ledger = useQuery({
    queryKey: ["ledger", runId],
    queryFn: () => api.ledger(runId),
    refetchInterval: (query) => (query.state.data && ["COMPLETED", "FAILED", "CANCELLED"].includes(query.state.data.status) ? false : 1200),
  });
  if (detail.isLoading) return <StateView kind="loading" />;
  if (detail.isError) return <StateView kind="failed" message={detail.error.message} />;
  const data = detail.data;
  if (!data) return <StateView kind="loading" />;
  const failed = data.status === "FAILED";
  const cancelled = data.status === "CANCELLED";
  const terminalMessage = failed
    ? data.failure?.message ?? "Run failed"
    : cancelled
      ? "Run cancelled"
      : data.status === "COMPLETED"
        ? "Run completed"
        : "";

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="mb-2 flex items-baseline gap-3">
        <h1 className="section-title">{failed ? "Run failed" : cancelled ? "Run cancelled" : "Run progress"}</h1>
        <span className="mono text-[12px] text-ink-faint">
          stage {data.stage_index ?? "—"} / {data.stage_count ?? "—"} · {fmtDuration(data.created_at)}
        </span>
      </div>
      <div className="card p-4">
        <Stepper detail={data} />
        {terminalMessage ? (
          <div
            className={`mt-3 flex items-start gap-2 rounded-md border p-3 ${
              failed || cancelled ? "border-bad/40 bg-bad-bg" : "border-good/30 bg-good-bg"
            }`}
          >
            {failed || cancelled ? (
              <X size={14} className="text-bad" />
            ) : (
              <Check size={14} className="text-good" />
            )}
            <span className="mono min-w-0 break-words text-[12px] text-ink">{terminalMessage}</span>
            {data.failure?.code ? <span className="chip">{data.failure.code}</span> : null}
          </div>
        ) : null}
      </div>

      <LedgerTerminal
        events={ledger.data?.stage_events ?? data.events}
        trials={ledger.data?.trial_events ?? []}
        candidates={ledger.data?.candidate_events ?? []}
        createdAt={data.created_at}
        status={data.status}
      />
    </div>
  );
}

function LedgerTerminal({
  events,
  trials,
  candidates,
  createdAt,
  status,
}: {
  events: Array<{ state: string; at: number }>;
  trials: Record<string, unknown>[];
  candidates: Record<string, unknown>[];
  createdAt: string | null;
  status: string;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [events.length, trials.length, candidates.length]);

  const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now();
  return (
    <div className="mt-6 overflow-hidden rounded-lg" style={{ background: "var(--ink-panel)" }}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="mono text-[11px] uppercase tracking-normal text-panel-fg/60">
          execution ledger · stages and optimization records
        </span>
        <span className="mono text-[11px] text-panel-fg/60">{status}</span>
      </div>
      <div ref={terminalRef} className="max-h-72 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-6">
        {events.map((event, index) => {
          const elapsed = event.at - createdMs / 1000;
          return (
            <div key={index} className="flex gap-3">
              <span className="shrink-0 text-panel-fg/40">+{elapsed >= 0 ? elapsed.toFixed(1) : "0.0"}s</span>
              <span className="shrink-0 text-panel-fg/60">{fmtTimestamp(new Date(event.at * 1000).toISOString())}</span>
              <span className="text-panel-fg">{event.state.replaceAll("_", " ")}</span>
            </div>
          );
        })}
        {trials.map((trial, index) => (
          <div key={`trial-${String(trial.study_id ?? "global")}-${String(trial.trial_id)}-${index}`} className="grid grid-cols-[92px_90px_1fr] gap-3 border-t border-white/5 py-0.5">
            <span className="text-panel-fg/50">trial #{String(trial.trial_id ?? index)}</span>
            <span className="text-panel-fg">obj {formatLedgerNumber(trial.objective)}</span>
            <span className="truncate text-panel-fg/70">
              IS {formatLedgerNumber(trial.mean_is_sharpe)} · OOS {formatLedgerNumber(trial.mean_oos_sharpe)} · decay {formatLedgerNumber(trial.mean_decay)} · {JSON.stringify(rowParams(trial))}
            </span>
          </div>
        ))}
        {candidates.map((candidate, index) => (
          <div key={`candidate-${String(candidate.trial_id ?? candidate.source_trial_id)}-${index}`} className="grid grid-cols-[92px_1fr] gap-3 border-t border-white/5 py-0.5 text-panel-fg/70">
            <span>candidate</span>
            <span>trial #{String(candidate.trial_id ?? candidate.source_trial_id ?? "—")} · objective {formatLedgerNumber(candidate.objective)} · decay {formatLedgerNumber(candidate.mean_decay)}</span>
          </div>
        ))}
        {!trials.length && !["COMPLETED", "FAILED", "CANCELLED"].includes(status) ? <div className="text-panel-fg/40">Optimization ledger pending…</div> : null}
      </div>
    </div>
  );
}

function formatLedgerNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "—";
}
