/** Run progress: stage stepper + LedgerTerminal over the SSE/status stream (§9, §27.3 #7). */
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, type RunDetail } from "../../lib/api";
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
    refetchInterval: 1200,
  });
  const [terminalMessage, setTerminalMessage] = useState("");
  useEffect(() => {
    if (detail.data?.status === "COMPLETED") setTerminalMessage("Run hoàn thành — đang mở Overview.");
    if (detail.data?.status === "FAILED") {
      setTerminalMessage(detail.data.failure?.message ?? "Run thất bại");
    }
    if (detail.data?.status === "CANCELLED") setTerminalMessage("Run đã bị huỷ");
  }, [detail.data?.status, detail.data?.failure]);

  if (detail.isLoading) return <StateView kind="loading" />;
  if (detail.isError) return <StateView kind="failed" message={detail.error.message} />;
  const data = detail.data;
  if (!data) return <StateView kind="loading" />;

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="mb-2 flex items-baseline gap-3">
        <h1 className="section-title">Run progress</h1>
        <span className="mono text-[12px] text-ink-faint">
          stage {data.stage_index ?? "—"} / {data.stage_count ?? "—"} · {fmtDuration(data.created_at)}
        </span>
      </div>
      <div className="card p-4">
        <Stepper detail={data} />
        {terminalMessage ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft p-3">
            {data.status === "FAILED" || data.status === "CANCELLED" ? (
              <X size={14} className="text-bad" />
            ) : (
              <Check size={14} className="text-good" />
            )}
            <span className="mono text-[12px] text-ink">{terminalMessage}</span>
            {data.failure?.code ? <span className="chip">{data.failure.code}</span> : null}
          </div>
        ) : null}
      </div>

      <LedgerTerminal events={data.events} createdAt={data.created_at} status={data.status} />
    </div>
  );
}

function LedgerTerminal({
  events,
  createdAt,
  status,
}: {
  events: Array<{ state: string; at: number }>;
  createdAt: string | null;
  status: string;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [events.length]);

  const createdMs = createdAt ? new Date(createdAt).getTime() : Date.now();
  return (
    <div className="mt-6 overflow-hidden rounded-lg" style={{ background: "var(--ink-panel)" }}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="mono text-[11px] uppercase tracking-normal text-panel-fg/60">
          structured log · stage-accurate
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
      </div>
    </div>
  );
}
