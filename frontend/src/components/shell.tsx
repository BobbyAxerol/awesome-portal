/** Shell: TopBar, NavTabs and RunPassport (§27.3.1). */
import { useQuery } from "@tanstack/react-query";
import { Copy, FolderOpen, Plus, Download } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { api, type RunSummary } from "../lib/api";
import { fmtShortHash, fmtTimestamp } from "../lib/format";
import { Badge, Chip } from "./ui";

const NAV_ITEMS = [
  { path: "/overview", label: "Overview" },
  { path: "/optimization", label: "Optimization" },
  { path: "/parameters", label: "Parameters" },
  { path: "/execution", label: "Execution" },
  { path: "/audit", label: "Audit" },
];

function RunStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const tone =
    status === "COMPLETED" ? "pass" : status === "FAILED" || status === "CANCELLED" ? "fail" : "pending";
  return <Badge tone={tone}>{status}</Badge>;
}

export function TopBar({
  runs,
  activeRunId,
  runStatus,
}: {
  runs: RunSummary[];
  activeRunId: string | null;
  runStatus: string | null;
}) {
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const strategy = strategies.data?.[0];
  const [copied, setCopied] = useState(false);

  const copyHash = () => {
    if (!activeRunId) return;
    void navigator.clipboard.writeText(activeRunId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex min-h-12 max-w-[1440px] flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <span className="font-display text-[17px] font-medium text-ink">QuantBT Portal</span>
        <span className="mono text-[10px] uppercase text-ink-faint">backtest</span>
        <div className="mx-2 h-4 w-px bg-line" />
        <Chip>{strategy?.strategy_id ?? "—"}</Chip>
        <Link to="/runs" className="btn-ghost no-print" aria-label="Run library">
          <FolderOpen size={12} />
          Runs
          {runs.length ? <span className="text-ink-faint">({runs.length})</span> : null}
        </Link>
        {activeRunId ? (
          <>
            <Chip>current {fmtShortHash(activeRunId)}</Chip>
            <RunStatusBadge status={runStatus} />
            <button type="button" className="btn-ghost no-print" onClick={copyHash} aria-label="Copy run id">
              <Copy size={12} />
              {fmtShortHash(activeRunId)}
              {copied ? " ✓" : ""}
            </button>
            <a className="btn-ghost no-print" href={`/api/runs/${activeRunId}/export`}>
              <Download size={12} />
              Export
            </a>
          </>
        ) : (
          <RunStatusBadge status={runStatus} />
        )}
        <Link className="btn-primary no-print ml-auto" to="/?new=1">
          <Plus size={13} />
          New run
        </Link>
      </div>
    </header>
  );
}

export function NavTabs() {
  const location = useLocation();
  return (
    <nav className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-4 sm:px-6">
        {NAV_ITEMS.map((item) => (
          <Link key={item.path} to={`${item.path}`} className={`navtab ${location.pathname === item.path ? "navtab-active" : ""}`}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function RunPassport({ runId, status }: { runId: string; status: string }) {
  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: status && !["COMPLETED", "FAILED", "CANCELLED"].includes(status) ? 2000 : false,
  });
  const d = detail.data;
  return (
    <div className="border-b border-line-soft bg-sunken/60">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-1.5">
        <span className="mono text-[11px] text-ink-faint">
          run <span className="text-ink">{fmtShortHash(runId)}</span>
        </span>
        <RunStatusBadge status={status} />
        {d?.protocol ? <Chip>{d.protocol}</Chip> : null}
        {d?.strategy_id ? <Chip>{d.strategy_id}</Chip> : null}
        {d?.symbol ? <Chip>{d.symbol}</Chip> : null}
        {d?.timeframe ? <Chip>{d.timeframe}</Chip> : null}
        <span className="mono ml-auto text-[11px] text-ink-faint">
          created {fmtTimestamp(d?.created_at ?? null)}
        </span>
      </div>
    </div>
  );
}
