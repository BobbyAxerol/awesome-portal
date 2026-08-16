/**
 * Immutable run passport strip (v0.4 §P0.17).
 *
 * Identity that must travel with every result view: run, status, protocol,
 * strategy, instrument and creation time. It restates what the run API
 * reports and computes nothing.
 */
import { useQuery } from "@tanstack/react-query";

import { Badge, Chip } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtShortHash, fmtTimestamp } from "../../lib/format";

function RunStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const tone =
    status === "COMPLETED" ? "pass" : status === "FAILED" || status === "CANCELLED" ? "fail" : "pending";
  return <Badge tone={tone}>{status}</Badge>;
}

export function RunPassport({ runId, status }: { runId: string; status: string }) {
  const detail = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: status && !["COMPLETED", "FAILED", "CANCELLED"].includes(status) ? 2000 : false,
  });
  const d = detail.data;
  return (
    <div className="portal-passport">
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
  );
}
