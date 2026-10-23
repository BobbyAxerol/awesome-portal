/**
 * Portfolio 360 Performance card (hi-fi "Net PnL | Return | NAV" chart, WP-F1).
 *
 * - The tabs ask the series port for the same portfolio, window and environment (`execution-manager-series.v1`): Net PnL is the
 *   hi-fi default once the port serves the portfolio, NAV is the base line; Return stays off until served. Nothing is computed here.
 * - Capital movements are pins on the plot, from the published capital ledger of the selected environment only: one pin per entry that
 *   moved allocated capital, in the series' own currency (a ledger bucket in another currency is not drawn on this chart). The ledger is an
 *   allocation ledger, so the pin is an allocation flow, not "added funds" (said in the caption).
 * - The drawdown strip is a typed absence: the port publishes NAV, Net PnL and Return only, and a drawdown is never worked out from the line.
 * - Export is not available yet (D20): said once, with the one sentence, not a dead button.
 */
import { useState } from "react";

import type { CapitalLedger } from "../../../../analytics";
import { readDecimal } from "../../../boundary";
import { GapWhy, SectionPanel } from "../../../blocks";
import type { DrawdownInput, FlowPin } from "../../../charts";
import { MeasureSeg } from "../../overview/MeasureSeg";
import type { FundMeasure } from "../../overview/MeasureSeg";
import { ManagerSeriesPanel } from "../../series/ManagerSeriesPanel";
import type { SeriesReadState } from "../../series/useManagerSeries";
import { EXPORT_REASON, PF_FE, npText } from "../fe";
import type { TabCtx } from "./ctx";
import { ledgerRows } from "./model";
import { readUtcEpochMs } from "../../../../screenDataContract";

const DRAWDOWN_ABSENT: DrawdownInput = {
  kind: "absent",
  copy: "Not published (FE-013, FE-025)",
  reason: "The series port publishes NAV, Net PnL and Return only; a drawdown series is requested (WP-F1 request to the contracts lane)",
};

/** The currency of the drawn series, or `null` when none is drawn (a ratio has none; no read has no pin to place). */
function seriesCurrency(read: SeriesReadState): string | null {
  const series = read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;
  const entry = series?.series[0];
  return entry !== undefined && entry.state === "AVAILABLE" ? entry.currency : null;
}

const hasDigit = (exact: string): boolean => /[1-9]/.test(exact);

/**
 * One pin per ledger entry that moved allocated capital (direction INCREASE or DECREASE, a readable instant, a non-zero amount) in
 * `currency`, signed by its direction. Amounts stay the server's exact strings; none is added to another.
 */
export function flowPins(ledger: CapitalLedger | null, currency: string | null): readonly FlowPin[] {
  if (ledger === null || currency === null) return [];
  const pins: FlowPin[] = [];
  for (const row of ledgerRows(ledger)) {
    if (row.currency !== currency || row.entry.direction === "UNCHANGED" || row.entry.occurredAt === null) continue;
    const at = Date.parse(row.entry.occurredAt);
    const t = Number.isNaN(at) ? null : readUtcEpochMs(at);
    const amount = readDecimal(row.entry.amount, { unit: "money" });
    if (t === null || amount === null || !hasDigit(row.entry.amount)) continue;
    pins.push({ id: row.key, t, value: row.entry.direction === "DECREASE" ? `-${row.entry.amount}` : row.entry.amount });
  }
  return pins;
}

export function PerformanceCard({ ctx }: { ctx: TabCtx }) {
  const [measure, setMeasure] = useState<FundMeasure | null>(null);
  const { reads } = ctx;
  const metric: FundMeasure = reads.served ? (measure ?? "NET_PNL") : "NAV";
  const read = metric === "NAV" ? reads.nav : metric === "NET_PNL" ? reads.pnl : reads.ret;
  const ledgerRead = reads.ledgers[reads.selected];
  const ledger = ledgerRead.phase === "ready" ? ledgerRead.value.ledger : ledgerRead.phase === "loading" || ledgerRead.phase === "error" ? ledgerRead.last?.ledger ?? null : null;
  const pins = metric === "RETURN" ? [] : flowPins(ledger, seriesCurrency(read));
  const label = metric === "NAV" ? "Portfolio NAV" : metric === "NET_PNL" ? "Portfolio Net PnL" : "Portfolio Return";
  return (
    <SectionPanel
      title="Performance"
      lead={<MeasureSeg serves={reads.served} selected={metric} onSelect={setMeasure} />}
      aside={
        <span className="exec-pf-perf-aside">
          {ctx.window === "ALL" ? "All history" : `Last ${ctx.window}`}
          <span className="exec-pf-perf-export">
            <GapWhy className="exec-blk-np-word" gap="D20" text="Export: not available yet" name="Export: not available yet, reason" rows={[EXPORT_REASON]} next={null} />
          </span>
        </span>
      }
    >
      <ManagerSeriesPanel label={label} read={read} gapCopy={npText(PF_FE.nav)} height={240} tools drawdown={DRAWDOWN_ABSENT} flows={pins} />
      <p className="exec-pf-note" data-testid="perf-flows-note">
        {metric === "RETURN"
          ? "Capital pins are not drawn on a ratio."
          : pins.length > 0
            ? `${pins.length} allocation ${pins.length === 1 ? "flow" : "flows"} from the published capital ledger (${reads.selected}), in the chart's own currency. The ledger records allocations to accounts, not funding.`
            : "No allocation flow in this window and currency from the published capital ledger."}
      </p>
    </SectionPanel>
  );
}
