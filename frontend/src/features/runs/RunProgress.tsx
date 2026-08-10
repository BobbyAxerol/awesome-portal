/** Run progress: stage stepper + live console + structured ledger (§9, §27.3 #7). */
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const consoleTail = useQuery({
    queryKey: ["console", runId],
    queryFn: () => api.console(runId, 5000),
    refetchInterval: 1000,
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
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
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

      <ConsoleTerminal lines={consoleTail.data?.lines ?? []} status={data.status} />

      <div className="mt-4">
        <StructuredLedger
          events={ledger.data?.stage_events ?? data.events}
          trials={ledger.data?.trial_events ?? []}
          candidates={ledger.data?.candidate_events ?? []}
          createdAt={data.created_at}
          status={data.status}
        />
      </div>
    </div>
  );
}

/** Live worker console tail — every Optuna trial line streams in real time. */
function ConsoleTerminal({ lines, status }: { lines: string[]; status: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [lines.length]);

  const height = expanded ? "max-h-[calc(100vh-320px)] min-h-[360px]" : "max-h-44";
  return (
    <div className="mt-6 overflow-hidden rounded-lg" style={{ background: "var(--ink-panel)" }}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="mono text-[11px] uppercase tracking-normal text-panel-fg/60">
          live console · worker stdout/stderr (per-trial)
        </span>
        <div className="flex items-center gap-2">
          <span className="mono text-[11px] text-panel-fg/60">{lines.length} lines · {status}</span>
          <button
            type="button"
            className="no-print rounded border border-white/15 p-1 text-panel-fg/60 hover:text-panel-fg"
            aria-label={expanded ? "Collapse console" : "Expand console"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>
      <div ref={terminalRef} className={`overflow-y-auto px-4 py-3 font-mono text-[12px] leading-6 ${height}`}>
        {lines.length ? (
          lines.map((line, index) => (
            <div
              key={index}
              className={`whitespace-pre-wrap break-words ${
                line.includes("Trial") || line.includes("trial")
                  ? "text-panel-fg"
                  : "text-panel-fg/60"
              }`}
            >
              {line}
            </div>
          ))
        ) : (
          <div className="text-panel-fg/40">Waiting for worker output…</div>
        )}
      </div>
    </div>
  );
}

function StructuredLedger({
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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [events.length, trials.length, candidates.length]);

  const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now();
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="label">Structured ledger — stage events, trials, candidates</span>
        <ChevronsUpDown size={12} className="text-ink-faint" />
      </button>
      {open ? (
        <div className="border-t border-line-soft bg-sunken/40 px-4 py-3 font-mono text-[12px] leading-6">
          <div ref={terminalRef} className="max-h-96 overflow-y-auto">
            {events.map((event, index) => {
              const elapsed = event.at - createdMs / 1000;
              return (
                <div key={index} className="flex gap-3">
                  <span className="shrink-0 text-ink-faint">+{elapsed >= 0 ? elapsed.toFixed(1) : "0.0"}s</span>
                  <span className="shrink-0 text-ink-faint">{fmtTimestamp(new Date(event.at * 1000).toISOString())}</span>
                  <span className="text-ink">{event.state.replaceAll("_", " ")}</span>
                </div>
              );
            })}
            {trials.map((trial, index) => (
              <div key={`trial-${String(trial.study_id ?? "global")}-${String(trial.trial_id)}-${index}`} className="grid grid-cols-[92px_90px_1fr] gap-3 border-t border-line-soft py-0.5">
                <span className="text-ink-faint">trial #{String(trial.trial_id ?? index)}</span>
                <span className="text-ink">obj {formatLedgerNumber(trial.objective)}</span>
                <span className="truncate text-ink-soft">
                  IS {formatLedgerNumber(trial.mean_is_sharpe)} · OOS {formatLedgerNumber(trial.mean_oos_sharpe)} · decay {formatLedgerNumber(trial.mean_decay)} · {JSON.stringify(rowParams(trial))}
                </span>
              </div>
            ))}
            {candidates.map((candidate, index) => (
              <div key={`candidate-${String(candidate.trial_id ?? candidate.source_trial_id)}-${index}`} className="grid grid-cols-[92px_1fr] gap-3 border-t border-line-soft py-0.5 text-ink-soft">
                <span>candidate</span>
                <span>trial #{String(candidate.trial_id ?? candidate.source_trial_id ?? "—")} · objective {formatLedgerNumber(candidate.objective)} · decay {formatLedgerNumber(candidate.mean_decay)}</span>
              </div>
            ))}
            {!trials.length && !["COMPLETED", "FAILED", "CANCELLED"].includes(status) ? (
              <div className="text-ink-faint">Optimization ledger pending…</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatLedgerNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "—";
}
