/** Run Library — pool của mọi run với metadata đầy đủ (§27.3.1 mở rộng).
 *  Nhận diện run qua: status, protocol, symbol/timeframe, thời điểm chạy.
 *  Hỗ trợ copy run_id và paste run_id để gọi ra trực tiếp. */
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, FolderOpen, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type RunSummary } from "../../lib/api";
import { fmtDuration, fmtShortHash, fmtTimestamp } from "../../lib/format";
import { Badge, StateView } from "../../components/ui";

function CopyId({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost no-print !px-1.5 !py-0.5"
      aria-label={`Copy run id ${runId}`}
      onClick={() => {
        void navigator.clipboard.writeText(runId).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <Copy size={11} />
      {fmtShortHash(runId, 10)}
      {copied ? " ✓" : ""}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "COMPLETED" ? "pass" : status === "FAILED" || status === "CANCELLED" ? "fail" : "pending";
  return <Badge tone={tone}>{status}</Badge>;
}

export function RunLibrary() {
  const navigate = useNavigate();
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.listRuns, refetchInterval: 4000 });
  const [pasteId, setPasteId] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [lookupId, setLookupId] = useState("");

  const openRun = (runId: string) => {
    setLookupId(runId);
    setPasteError("");
    api
      .getRun(runId)
      .then(() => navigate(`/?run=${runId}`))
      .catch((error: Error) => setPasteError(error.message));
  };

  if (runs.isLoading) return <StateView kind="loading" />;
  if (runs.isError) return <StateView kind="failed" message={runs.error.message} onRetry={() => runs.refetch()} />;

  const rows = runs.data ?? [];

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title">Run Library</h1>
          <p className="dek">Tất cả run trong pool — mỗi run nhận diện qua status, protocol, symbol/timeframe và thời điểm chạy.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="space-y-1">
            <span className="label block">Paste run id để mở</span>
            <input
              className="input w-64"
              placeholder="vd: 9a4d3a8cce68476d hoặc real_backend_fix_20260810"
              value={pasteId}
              onChange={(event) => {
                setPasteId(event.target.value.trim());
                setPasteError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && pasteId) openRun(pasteId);
              }}
            />
          </label>
          <button type="button" className="btn-primary" disabled={!pasteId || Boolean(lookupId)} onClick={() => openRun(pasteId)}>
            <Search size={13} />
            Open
          </button>
        </div>
      </div>
      {pasteError ? (
        <div className="mb-4 rounded-md border border-bad/40 bg-bad-bg p-3">
          <span className="mono text-[12px] font-semibold text-bad">Không mở được run: {pasteError}</span>
        </div>
      ) : null}

      {rows.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12px]">
            <thead>
              <tr>
                <th className="mono pb-2 pl-4 pt-3 text-left text-[11px] uppercase text-ink-faint">run id</th>
                <th className="mono pb-2 pt-3 text-left text-[11px] uppercase text-ink-faint">status</th>
                <th className="mono pb-2 pt-3 text-left text-[11px] uppercase text-ink-faint">protocol</th>
                <th className="mono pb-2 pt-3 text-left text-[11px] uppercase text-ink-faint">strategy</th>
                <th className="mono pb-2 pt-3 text-left text-[11px] uppercase text-ink-faint">symbol / tf</th>
                <th className="mono pb-2 pt-3 text-right text-[11px] uppercase text-ink-faint">started</th>
                <th className="mono pb-2 pt-3 text-right text-[11px] uppercase text-ink-faint">completed</th>
                <th className="mono pb-2 pt-3 text-right text-[11px] uppercase text-ink-faint">duration</th>
                <th className="pb-2 pr-4 pt-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((run: RunSummary) => (
                <tr
                  key={run.run_id}
                  className="cursor-pointer border-t border-line-soft hover:bg-sunken"
                  onClick={() => openRun(run.run_id)}
                >
                  <td className="py-1.5 pl-4" onClick={(event) => event.stopPropagation()}>
                    <CopyId runId={run.run_id} />
                  </td>
                  <td><StatusBadge status={run.status} /></td>
                  <td className="mono text-ink-soft">{run.protocol ?? "—"}</td>
                  <td className="mono text-ink-soft">{run.strategy_id ?? "—"}</td>
                  <td className="mono text-ink-soft">
                    {run.symbol ?? "—"} / {run.timeframe ?? "—"}
                  </td>
                  <td className="num text-ink-soft">{fmtTimestamp(run.created_at)}</td>
                  <td className="num text-ink-soft">{fmtTimestamp(run.completed_at)}</td>
                  <td className="num text-ink-soft">{fmtDuration(run.created_at, run.completed_at)}</td>
                  <td className="pr-4 text-right">
                    <button
                      type="button"
                      className="btn-ghost no-print !px-1.5 !py-0.5"
                      aria-label={`Open run ${run.run_id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openRun(run.run_id);
                      }}
                    >
                      <ExternalLink size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card flex items-center justify-center gap-3 py-16">
          <FolderOpen size={16} className="text-ink-faint" />
          <span className="mono text-[12px] text-ink-faint">Chưa có run nào — bấm New run để bắt đầu.</span>
        </div>
      )}
    </div>
  );
}
