/** Run progress v2 (v0.1.1): tqdm-grade progress with a designed UI —
 *  overall progress strip + ETA, fold Gantt, live console with fold
 *  separators, and a per-fold structured stage log with replay. */
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, Maximize2, Minimize2, Pause, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useRunEvents, runPollInterval } from "./useRunEvents";
import { api, isTerminal, rowParams, type RunDetail, type RunFoldPlan, type RunLedger } from "../../lib/api";
import { CancelRunButton } from "./CancelRunButton";
import { FoldGantt } from "../../components/FoldGantt";
import { annotateConsoleLines, estimateEtaSeconds, parseConsoleStats } from "../../lib/consoleStats";
import { fmtDuration, fmtTimestamp } from "../../lib/format";
import { StateView } from "../../components/ui";
import { activeTheme, canvasTokens, consoleTokens, vizTokensFor } from "../../styles/tokens";

/* Dark-panel palette (§15.7): the console keeps its terminal surface in both
 * themes, so it reads the theme-independent console tokens. */
const C = {
  base: consoleTokens.fg,
  faint: consoleTokens.faint,
  accent: consoleTokens.accent,
  gold: consoleTokens.gold,
  good: consoleTokens.good,
  bad: consoleTokens.bad,
};

/* Themed accents for the progress strip / Gantt */
const theme = activeTheme();
const L = {
  good: canvasTokens(theme).good,
  accent: canvasTokens(theme).accent,
  pending: vizTokensFor(theme).pending,
  train: vizTokensFor(theme).train,
  textFaint: canvasTokens(theme).inkFaint,
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
  // SSE, when it is available, is what makes a state change appear immediately.
  // Polling stays underneath at a slow floor: a stream that opens and then goes
  // quiet must not look like a run that stopped progressing.
  const { streaming } = useRunEvents(runId);
  const live = (fast: number) => (query: { state: { data?: { status: string } } }) =>
    query.state.data && isTerminal(query.state.data.status)
      ? false
      : runPollInterval(streaming, fast);

  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: live(1200),
  });
  const ledger = useQuery({
    queryKey: ["ledger", runId],
    queryFn: () => api.ledger(runId),
    refetchInterval: live(1200),
  });
  const consoleTail = useQuery({
    queryKey: ["console", runId],
    queryFn: () => api.console(runId, 5000),
    refetchInterval: runPollInterval(streaming, 1000),
    enabled: !detail.data || !isTerminal(detail.data.status),
  });
  const foldPlan = useQuery({
    queryKey: ["fold-plan", runId],
    queryFn: () => api.foldPlan(runId),
    retry: 5,
    refetchInterval: (query) => (query.state.data ? false : 2000),
  });
  const progress = useQuery({
    queryKey: ["progress", runId],
    queryFn: () => api.progress(runId),
    refetchInterval: runPollInterval(streaming, 1000),
    enabled: !detail.data || !isTerminal(detail.data.status),
  });
  const config = useQuery({
    queryKey: ["config", runId],
    queryFn: () => api.runConfig(runId),
    retry: 3,
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

  const protocol = data.protocol ?? "";
  const lines = consoleTail.data?.lines ?? [];
  const stats = useMemo(
    () =>
      progress.data
        ? { studyStarts: progress.data.studyStarts, trialsDone: progress.data.trialsDone, bestByStudy: progress.data.bestByStudy }
        : parseConsoleStats(lines),
    [progress.data, lines],
  );
  const calibration = (config.data?.calibration ?? {}) as Record<string, unknown>;
  const trialsPerStudy = Number(calibration.optuna_trials ?? 0);
  const folds = foldPlan.data?.folds ?? [];
  const advancedFolds = protocol === "advanced_walk_forward" ? folds.filter((f) => f.train_start) : [];
  const totalStudies = advancedFolds.length || 1;
  const currentStudy = Math.min(stats.studyStarts, totalStudies);

  let completedTrials = stats.trialsDone;
  let total = trialsPerStudy;
  if (protocol === "advanced_walk_forward" && advancedFolds.length > 1) {
    total = advancedFolds.length * trialsPerStudy;
  }
  const elapsedSeconds = data.created_at ? Math.max(0, (Date.now() - new Date(data.created_at).getTime()) / 1000) : 0;
  const etaSeconds = estimateEtaSeconds(completedTrials, total, elapsedSeconds);
  const etaText =
    etaSeconds == null ? "…" : etaSeconds >= 3600 ? `${Math.round(etaSeconds / 3600)}h ${Math.round((etaSeconds % 3600) / 60)}m` : etaSeconds >= 60 ? `${Math.floor(etaSeconds / 60)}m ${Math.round(etaSeconds % 60)}s` : `${Math.round(etaSeconds)}s`;

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <h1 className="section-title">{failed ? "Run failed" : cancelled ? "Run cancelled" : completed ? "Run completed" : "Run progress"}</h1>
        <CancelRunButton runId={runId} status={data.status} />
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

      {/* v0.1.1 — overall progress + ETA (tqdm-grade, custom design) */}
      <ProgressStrip
        stats={stats}
        currentStudy={currentStudy}
        totalStudies={totalStudies}
        completed={completedTrials}
        total={total}
        elapsedSeconds={elapsedSeconds}
        etaText={etaText}
        protocol={protocol}
      />

      {/* v0.1.1 — fold Gantt with live status */}
      {foldPlan.data && foldPlan.data.folds.length ? (
        <FoldGantt
          plan={foldPlan.data}
          studyStarts={stats.studyStarts}
          bestByStudy={stats.bestByStudy}
          running={!completed}
        />
      ) : null}

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
        <LiveConsole lines={lines} expanded={expanded} />
      ) : (
        <StageLog
          ledger={ledger.data}
          summary={summary.data}
          foldPlan={foldPlan.data}
          createdAt={data.created_at}
          status={data.status}
          expanded={expanded}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Progress */

function ProgressStrip({
  stats,
  currentStudy,
  totalStudies,
  completed,
  total,
  elapsedSeconds,
  etaText,
  protocol,
}: {
  stats: { studyStarts: number };
  currentStudy: number;
  totalStudies: number;
  completed: number;
  total: number;
  elapsedSeconds: number;
  etaText: string;
  protocol: string;
}) {
  const perFold = protocol === "advanced_walk_forward" && totalStudies > 1;
  const fraction = total > 0 ? Math.min(1, completed / total) : 0;
  const elapsed = elapsedSeconds >= 3600 ? `${Math.floor(elapsedSeconds / 3600)}h ${Math.floor((elapsedSeconds % 3600) / 60)}m` : elapsedSeconds >= 60 ? `${Math.floor(elapsedSeconds / 60)}m ${Math.round(elapsedSeconds % 60)}s` : `${Math.round(elapsedSeconds)}s`;

  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          {perFold ? (
            <span className="mono text-[20px] font-semibold text-ink">
              Fold {currentStudy}/{totalStudies}
            </span>
          ) : (
            <span className="mono text-[20px] font-semibold text-ink">Tuning parameters</span>
          )}
          <span className="mono text-[12px] text-ink-soft">
            {completed}/{total} trials · elapsed {elapsed}
          </span>
        </div>
        <span className="mono text-[12px] text-ink-faint">
          ETA <span className="font-semibold text-accent">{etaText}</span>{" "}
          <span className="text-ink-faint/70">(ước tính)</span>
        </span>
      </div>

      {perFold ? (
        <div className="mt-3 flex gap-1">
          {Array.from({ length: totalStudies }).map((_, index) => {
            const done = index < currentStudy - 1;
            const running = index === currentStudy - 1 && stats.studyStarts > 0 && currentStudy <= totalStudies;
            return (
              <div
                key={index}
                title={`Fold ${index + 1}`}
                className={`h-2.5 flex-1 rounded-full transition-colors duration-300 ${
                  done ? "" : running ? "animate-pulse" : ""
                }`}
                style={{
                  background: done ? L.good : running ? L.accent : L.pending,
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${fraction * 100}%`, background: L.accent }}
          />
        </div>
      )}
      <div className="mono mt-1.5 text-[10px] text-ink-faint">
        {perFold ? `${totalStudies} folds · ${total} trials total (mỗi fold ${Math.round(total / totalStudies)})` : `${total} trials · 1 study`}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Console */

function LiveConsole({ lines, expanded }: { lines: string[]; expanded: boolean }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const annotated = annotateConsoleLines(lines);
    // QuantBT emits each trial through both print and logging streams; collapse
    // consecutive rows carrying the SAME trial id+value (display-only).
    const out: typeof annotated = [];
    let lastTrialKey: string | null = null;
    for (const row of annotated) {
      if (row.kind === "line") {
        const match = row.text.match(/Trial\s+(\d+)\s+finished with value:\s*([\d.eE+-]+)/);
        const key = match ? `${match[1]}:${match[2]}` : null;
        if (key !== null && key === lastTrialKey) continue;
        lastTrialKey = key;
      }
      out.push(row);
    }
    return out;
  }, [lines]);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [lines.length]);

  return (
    <div className="mt-3 overflow-hidden rounded-lg" style={{ background: "var(--ink-panel)" }}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="mono text-[11px] uppercase tracking-normal" style={{ color: C.faint }}>
          live console · per-trial output
        </span>
        <span className="mono text-[11px]" style={{ color: C.faint }}>
          {lines.length} lines
        </span>
      </div>
      <div
        ref={terminalRef}
        className={`overflow-y-auto px-4 py-3 font-mono text-[12px] leading-6 ${expanded ? "max-h-[calc(100vh-380px)] min-h-[420px]" : "max-h-44"}`}
      >
        {rows.length ? (
          rows.map((row, index) => {
            if (row.kind === "separator") {
              return (
                <div key={`sep-${index}`} className="my-1 flex items-center gap-2">
                  <span className="h-px flex-1" style={{ background: consoleTokens.rule }} />
                  <span className="mono text-[10px] uppercase tracking-normal" style={{ color: C.gold }}>
                    ── {row.text} ──
                  </span>
                  <span className="h-px flex-1" style={{ background: consoleTokens.rule }} />
                </div>
              );
            }
            const isGood = /finished with value: (1[0-9]|[2-9]|[0-9])\.[0-9]/.test(row.text);
            const isBad = /finished with value: -/.test(row.text);
            const isTrial = /Trial|Best is/.test(row.text);
            return (
              <div
                key={index}
                className="whitespace-pre-wrap break-words"
                style={{ color: isGood ? C.good : isBad ? C.bad : isTrial ? C.base : C.faint }}
              >
                {row.text}
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

/* ------------------------------------------------------------ Stage log */

/** Structured per-stage log with fold-aware blocks + replay (v0.1.1). */
function StageLog({
  ledger,
  summary,
  foldPlan,
  createdAt,
  status,
  expanded,
}: {
  ledger: RunLedger | undefined;
  summary: { metrics?: { segments?: Record<string, Record<string, number | null>> } } | undefined;
  foldPlan: RunFoldPlan | undefined;
  createdAt: string | null;
  status: string;
  expanded: boolean;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const trials = ledger?.trial_events ?? [];
  const candidates = ledger?.candidate_events ?? [];
  const events = ledger?.stage_events ?? [];
  const [replay, setReplay] = useState({ visible: 0, playing: true, speed: 10 });
  const total = trials.length + candidates.length;
  const replaying = trials.length > 0 || candidates.length > 0;

  useEffect(() => {
    if (!replay.playing || total === 0) return;
    const timer = window.setInterval(() => {
      setReplay((current) => {
        const next = Math.min(current.visible + current.speed, total);
        if (next >= total) window.clearInterval(timer);
        return { ...current, visible: next };
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [replay.playing, replay.speed, total]);

  const visibleTrials = trials.slice(0, replay.visible);
  const visibleCandidates = replay.visible >= trials.length ? candidates.slice(0, replay.visible - trials.length) : [];

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [replay.visible, events.length]);

  const foldById = new Map<number, { train_start?: string; test_start?: string; test_end?: string }>();
  for (const fold of foldPlan?.folds ?? []) {
    if (fold.train_start) foldById.set(fold.fold_id, fold);
  }

  const studies = useMemo(() => {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const trial of visibleTrials) {
      const key = String(trial.study_id ?? trial.schedule_fold_id ?? "global");
      groups.set(key, [...(groups.get(key) ?? []), trial]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] === "global" ? -1 : Number(a[0]) - Number(b[0])));
  }, [visibleTrials]);

  const segments = summary?.metrics?.segments;
  const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now();
  const done = replay.visible >= total;

  return (
    <div className="mt-3 overflow-hidden rounded-lg" style={{ background: "var(--ink-panel)" }}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="mono text-[11px] uppercase tracking-normal" style={{ color: C.faint }}>
          stage log · structured · audit-grade
        </span>
        <div className="flex items-center gap-3">
          {replaying ? (
            <span className="mono text-[11px]" style={{ color: done ? C.good : C.gold }}>
              {done ? "replayed" : `replaying ${Math.min(replay.visible, total)}/${total}`}
            </span>
          ) : null}
          <span className="mono text-[11px]" style={{ color: C.faint }}>
            {studies.length} study{studies.length > 1 ? "s" : ""} · {trials.length} trials · {candidates.length} candidates · {status}
          </span>
        </div>
      </div>
      {replaying ? (
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-1.5">
          <button
            type="button"
            className="mono rounded border border-white/15 px-2 py-0.5 text-[11px] text-panel-fg hover:bg-white/10"
            onClick={() => setReplay((current) => ({ ...current, playing: !current.playing }))}
          >
            {replay.playing && !done ? <Pause size={11} className="inline" /> : done ? <Play size={11} className="inline" /> : <Play size={11} className="inline" />} {replay.playing && !done ? "Pause" : done ? "Replay" : "Play"}
          </button>
          {[10, 40, 10000].map((speed) => (
            <button
              key={speed}
              type="button"
              className={`mono rounded border px-2 py-0.5 text-[11px] ${
                replay.speed === speed ? "border-accent-2 bg-white/10 text-panel-fg" : "border-white/15 text-panel-fg/60 hover:bg-white/5"
              }`}
              onClick={() => setReplay((current) => ({ ...current, speed, playing: !done }))}
            >
              {speed === 10000 ? "instant" : `${speed}/tick`}
            </button>
          ))}
          {replay.playing && !done ? (
            <div className="ml-auto h-1 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full" style={{ width: `${(replay.visible / Math.max(1, total)) * 100}%`, background: C.accent }} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div ref={terminalRef} className={`overflow-y-auto px-4 py-3 font-mono text-[12px] leading-6 ${expanded ? "max-h-[calc(100vh-380px)] min-h-[420px]" : "max-h-44"}`}>
        {events.map((event, index) => {
          const elapsed = event.at - createdMs / 1000;
          return (
            <div key={`evt-${index}`} className="flex gap-3">
              <span style={{ color: C.faint }}>+{elapsed >= 0 ? elapsed.toFixed(1) : "0.0"}s</span>
              <span style={{ color: C.accent }}>{event.state.replaceAll("_", " ")}</span>
            </div>
          );
        })}

        {studies.map(([studyKey, studyTrials]) => {
          const foldId = studyKey === "global" ? null : Number(studyKey);
          const foldMeta = foldId != null ? foldById.get(foldId) : null;
          const dates =
            foldMeta && foldMeta.train_start
              ? ` · train ${fmtTimestamp(foldMeta.train_start).slice(5, 10)}→${fmtTimestamp(foldMeta.test_start ?? "").slice(5, 10)} · test ${fmtTimestamp(foldMeta.test_start ?? "").slice(5, 10)}→${fmtTimestamp(foldMeta.test_end ?? "").slice(5, 10)}`
              : "";
          return (
            <div key={studyKey} className="mt-3 border-t border-white/10 pt-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="mono text-[11px] uppercase" style={{ color: C.accent }}>
                  {foldId != null ? `fold ${foldId} · 1 study` : "IS search · 1 study (global)"}
                </span>
                <span style={{ color: C.faint }}>{studyTrials.length} trials</span>
                <span style={{ color: C.faint }}>{dates}</span>
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
          );
        })}

        {visibleCandidates.length ? (
          <div className="mt-3 border-t border-white/10 pt-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="mono text-[11px] uppercase" style={{ color: C.gold }}>
                OOS replay · candidates
              </span>
              <span style={{ color: C.faint }}>{visibleCandidates.length}/{candidates.length} candidates</span>
            </div>
            {visibleCandidates.map((candidate, index) => {
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

        {done && total > 0 ? (
          <div className="mt-3 border-t border-white/10 pt-2">
            <span className="mono text-[11px] uppercase" style={{ color: C.gold }}>
              freeze · selected params
            </span>
          </div>
        ) : null}

        {segments && done ? (
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
