/** Run progress: stepper + Live console + Stage log (§15.7 redesigned). */
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, isTerminal, rowParams, type RunDetail, type RunLedger } from "../../lib/api";
import { fmtDuration } from "../../lib/format";
import { StateView } from "../../components/ui";

/* Dark-panel palette (§15.7): readable on --ink-panel */
const C = {
  base: "#C9D4E3",
  faint: "#7A879A",
  accent: "#7FB3C4",
  gold: "#D4B36A",
  good: "#6FCF97",
  bad: "#E58A8A",
};

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

export function RunProgress({ runId, onViewResults }: { runId: string; onViewResults?: () => void }) {
  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: (query) => (query.state.data && isTerminal(query.state.data.status) ? false : 1200),
  });
  const ledger = useQuery({
    queryKey: ["ledger", runId],
    queryFn: () => api.ledger(runId),
    refetchInterval: (query) => (query.state.data && isTerminal(query.state.data.status) ? false : 1200),
  });
  const consoleTail = useQuery({
    queryKey: ["console", runId],
    queryFn: () => api.console(runId, 5000),
    refetchInterval: 1000,
    enabled: !detail.data || !isTerminal(detail.data.status),
  });
  const summary = useQuery({
    queryKey: ["summary", runId],
    queryFn: () => api.summary(runId),
    enabled: detail.data?.status === "COMPLETED",
  });

  const [tab, setTab] = useState<"live" | "stage">("live");
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (detail.data?.status === "COMPLETED") setTab("stage");
  }, [detail.data?.status]);

  if (detail.isLoading) return <StateView kind="loading" />;
  if (detail.isError) return <StateView kind="failed" message={detail.error.message} />;
  const data = detail.data;
  if (!data) return <StateView kind="loading" />;

  const failed = data.status === "FAILED";
  const cancelled = data.status === "CANCELLED";
  const completed = data.status === "COMPLETED";
  const terminalMessage = failed
    ? data.failure?.message ?? "Run failed"
    : cancelled
      ? "Run cancelled"
      : completed
        ? "Run hoàn thành — nhấn “Xem kết quả” để mở Overview."
        : "";

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h1 className="section-title">{failed ? "Run failed" : cancelled ? "Run cancelled" : completed ? "Run completed" : "Run progress"}</h1>
        <span className="mono text-[12px] text-ink-faint">
          stage {data.stage_index ?? "—"} / {data.stage_count ?? "—"} · {fmtDuration(data.created_at)}
        </span>
      </div>

      <div className="card p-4">
        <Stepper detail={data} />
        {terminalMessage ? (
          <div
            className={`mt-3 flex flex-wrap items-center gap-3 rounded-md border p-3 ${
              failed || cancelled ? "border-bad/40 bg-bad-bg" : "border-good/30 bg-good-bg"
            }`}
          >
            {failed || cancelled ? <X size={14} className="text-bad" /> : <Check size={14} className="text-good" />}
            <span className="mono min-w-0 flex-1 break-words text-[12px] text-ink">{terminalMessage}</span>
            {data.failure?.code ? <span className="chip">{data.failure.code}</span> : null}
            {completed && onViewResults ? (
              <button type="button" className="btn-primary" onClick={onViewResults}>
                <Eye size={13} />
                Xem kết quả
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="inline-flex rounded-md border border-line bg-raised p-0.5">
          <button
            type="button"
            className={`mono rounded px-3 py-1 text-[12px] transition-colors duration-200 ${
              tab === "live" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
            }`}
            onClick={() => setTab("live")}
          >
            Live console
          </button>
          <button
            type="button"
            className={`mono rounded px-3 py-1 text-[12px] transition-colors duration-200 ${
              tab === "stage" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
            }`}
            onClick={() => setTab("stage")}
          >
            Stage log
          </button>
        </div>
        <button
          type="button"
          className="btn-ghost no-print ml-auto"
          aria-label={expanded ? "Collapse log" : "Expand log"}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {tab === "live" ? (
        <LiveConsole lines={consoleTail.data?.lines ?? []} expanded={expanded} />
      ) : (
        <StageLog ledger={ledger.data} summary={summary.data} createdAt={data.created_at} status={data.status} expanded={expanded} />
      )}
    </div>
  );
}

function LiveConsole({ lines, expanded }: { lines: string[]; expanded: boolean }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [lines.length]);
  return (
    <div className="mt-3 overflow-hidden rounded-lg" style={{ background: "var(--ink-panel)" }}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="mono text-[11px] uppercase tracking-normal" style={{ color: C.faint }}>
          live console · worker stdout/stderr (mỗi trial Optuna)
        </span>
        <span className="mono text-[11px]" style={{ color: C.faint }}>
          {lines.length} lines
        </span>
      </div>
      <div
        ref={terminalRef}
        className={`overflow-y-auto px-4 py-3 font-mono text-[12px] leading-6 ${expanded ? "max-h-[calc(100vh-360px)] min-h-[420px]" : "max-h-44"}`}
      >
        {lines.length ? (
          lines.map((line, index) => {
            const hasTrial = /Trial|trial|Best is/.test(line);
            const isGood = /finished with value: (1[0-9]|[2-9]|[0-9])\.[0-9]/.test(line);
            const isBad = /finished with value: -/.test(line);
            return (
              <div
                key={index}
                className="whitespace-pre-wrap break-words"
                style={{ color: isGood ? C.good : isBad ? C.bad : hasTrial ? C.base : C.faint }}
              >
                {line}
              </div>
            );
          })
        ) : (
          <div style={{ color: C.faint }}>Waiting for worker output…</div>
        )}
      </div>
    </div>
  );
}

/** Structured per-stage log — trials -> candidates -> freeze -> segment eval. */
function StageLog({
  ledger,
  summary,
  createdAt,
  status,
  expanded,
}: {
  ledger: RunLedger | undefined;
  summary: { metrics?: { segments?: Record<string, Record<string, number | null>> } } | undefined;
  createdAt: string | null;
  status: string;
  expanded: boolean;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const trials = ledger?.trial_events ?? [];
  const candidates = ledger?.candidate_events ?? [];
  const events = ledger?.stage_events ?? [];
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [trials.length, candidates.length, events.length]);

  const studies = useMemo(() => {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const trial of trials) {
      const key = String(trial.study_id ?? trial.schedule_fold_id ?? "global");
      groups.set(key, [...(groups.get(key) ?? []), trial]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] === "global" ? -1 : Number(a[0]) - Number(b[0])));
  }, [trials]);

  const segments = summary?.metrics?.segments;
  const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now();

  return (
    <div className="mt-3 overflow-hidden rounded-lg" style={{ background: "var(--ink-panel)" }}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="mono text-[11px] uppercase tracking-normal" style={{ color: C.faint }}>
          stage log · structured · audit-grade
        </span>
        <span className="mono text-[11px]" style={{ color: C.faint }}>
          {studies.length} study{studies.length > 1 ? "s" : ""} · {trials.length} trials · {candidates.length} candidates · {status}
        </span>
      </div>
      <div
        ref={terminalRef}
        className={`overflow-y-auto px-4 py-3 font-mono text-[12px] leading-6 ${expanded ? "max-h-[calc(100vh-360px)] min-h-[420px]" : "max-h-44"}`}
      >
        {/* Stages timeline */}
        {events.map((event, index) => {
          const elapsed = event.at - createdMs / 1000;
          return (
            <div key={`evt-${index}`} className="flex gap-3">
              <span style={{ color: C.faint }}>+{elapsed >= 0 ? elapsed.toFixed(1) : "0.0"}s</span>
              <span style={{ color: C.accent }}>{event.state.replaceAll("_", " ")}</span>
            </div>
          );
        })}

        {/* Optimization — one block per study/fold */}
        {studies.map(([studyKey, studyTrials]) => (
          <div key={studyKey} className="mt-3 border-t border-white/10 pt-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="mono text-[11px] uppercase" style={{ color: C.accent }}>
                {studyKey === "global" ? "IS search · 1 study (global)" : `fold ${studyKey} · 1 study`}
              </span>
              <span style={{ color: C.faint }}>{studyTrials.length} trials</span>
            </div>
            {studyTrials.map((trial, index) => {
              const objective = typeof trial.objective === "number" ? trial.objective : null;
              const isSharp = typeof trial.mean_is_sharpe === "number" ? trial.mean_is_sharpe : null;
              const params = rowParams(trial);
              const paramText = Object.entries(params)
                .map(([key, value]) => `${key}=${value}`)
                .join(" ");
              return (
                <div key={`t-${studyKey}-${String(trial.trial_id)}-${index}`} className="grid grid-cols-[110px_120px_1fr] gap-3 py-0.5">
                  <span style={{ color: C.faint }}>trial #{String(trial.trial_id ?? index)}</span>
                  <span style={{ color: objective != null ? (objective >= 0 ? C.good : C.bad) : C.faint }}>
                    obj {objective != null ? objective.toFixed(4) : "—"}
                  </span>
                  <span className="truncate" style={{ color: C.base }}>
                    IS {isSharp != null ? isSharp.toFixed(2) : "—"}
                    <span style={{ color: C.faint }}> · {paramText}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        {/* Candidate replay on OOS */}
        {candidates.length ? (
          <div className="mt-3 border-t border-white/10 pt-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="mono text-[11px] uppercase" style={{ color: C.gold }}>
                OOS replay · candidates
              </span>
              <span style={{ color: C.faint }}>{candidates.length} candidates</span>
            </div>
            {candidates.map((candidate, index) => {
              const isSharp = typeof candidate.mean_is_sharpe === "number" ? candidate.mean_is_sharpe : null;
              const oosSharp = typeof candidate.mean_oos_sharpe === "number" ? candidate.mean_oos_sharpe : null;
              const decay = typeof candidate.mean_decay === "number" ? candidate.mean_decay : null;
              const decayBad = decay != null && decay < 0;
              return (
                <div key={`c-${String(candidate.trial_id ?? candidate.source_trial_id)}-${index}`} className="grid grid-cols-[110px_1fr] gap-3 py-0.5">
                  <span style={{ color: C.faint }}>candidate #{String(candidate.trial_id ?? candidate.source_trial_id ?? "—")}</span>
                  <span style={{ color: C.base }}>
                    IS <span style={{ color: C.accent }}>{isSharp != null ? isSharp.toFixed(2) : "—"}</span>{" "}
                    <span style={{ color: C.faint }}>→ OOS</span>{" "}
                    <span style={{ color: C.accent }}>{oosSharp != null ? oosSharp.toFixed(2) : "—"}</span>{" "}
                    <span style={{ color: C.faint }}>· decay</span>{" "}
                    <span style={{ color: decayBad ? C.bad : C.good }}>{decay != null ? decay.toFixed(3) : "—"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Frozen params */}
        {trials.length || candidates.length ? (
          <div className="mt-3 border-t border-white/10 pt-2">
            <span className="mono text-[11px] uppercase" style={{ color: C.gold }}>
              freeze · selected params
            </span>
          </div>
        ) : null}

        {/* Segment evaluation */}
        {segments ? (
          <div className="mt-3 border-t border-white/10 pt-2">
            <div className="mb-1">
              <span className="mono text-[11px] uppercase" style={{ color: C.accent }}>
                evaluation · IS / OOS / Holdout Live (fresh accounts)
              </span>
            </div>
            {Object.entries(segments).map(([segment, metrics]) => {
              const sharpe = typeof metrics.sharpe === "number" ? metrics.sharpe : null;
              const equity = typeof metrics.final_equity === "number" ? metrics.final_equity : null;
              const dd = typeof metrics.max_drawdown_pct === "number" ? metrics.max_drawdown_pct : null;
              const color = segment === "holdout_live" ? C.gold : C.accent;
              return (
                <div key={segment} className="grid grid-cols-[150px_1fr] gap-3 py-0.5">
                  <span style={{ color }}>{segment.replace("_", " ")}</span>
                  <span style={{ color: C.base }}>
                    final equity <span style={{ color: C.base }}>${equity != null ? equity.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}</span>
                    <span style={{ color: C.faint }}> · Sharpe</span>{" "}
                    <span style={{ color: sharpe != null && sharpe < 0 ? C.bad : C.good }}>{sharpe != null ? sharpe.toFixed(2) : "—"}</span>
                    <span style={{ color: C.faint }}> · MaxDD</span> <span style={{ color: C.bad }}>{dd != null ? `${dd.toFixed(2)}%` : "—"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {!trials.length && !candidates.length && !["COMPLETED", "FAILED", "CANCELLED"].includes(status) ? (
          <div style={{ color: C.faint }}>Structured records sẽ xuất hiện khi mỗi stage hoàn thành…</div>
        ) : null}
      </div>
    </div>
  );
}
