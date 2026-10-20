/**
 * ReplayPanel: the V2 frame around Trade Replay (hi-fi modules/trade-replay.js).
 *
 * The frame owns what V2 changed: the chips naming what is being replayed, the
 * "candles not qualified" banner, the panel states, and a plain log table for
 * the case where there is no chart. The chart and the V1 event log are the V1
 * components, loaded lazily so lightweight-charts stays out of every entry
 * chunk (see `replayLazy.ts`).
 *
 * Candles fail closed: they are drawn only when `candlesQualified` is set. When
 * it is not, the venue candles are withheld from the V1 panel, the banner says
 * so, and fills and the log stay.
 */
import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";

import type { PanelStatus } from "../../contracts";
import { PanelState } from "../../components/states";
import type { TradeReplayEventsProps } from "../../components/TradeReplayEvents";
import { formatExact } from "../../formatExact";
import type { UtcEpochMs } from "../../screenDataContract";
import { utcStamp } from "../../time";
import { CardsTable, type CardsColumn } from "../cardsTable";
import { Flag } from "../Flag";
import { SectionPanel } from "./SectionPanel";
import { PanelGate } from "./StateBoundary";
import { LazyTradeReplayEvents } from "./replayLazy";
import "../css/blocks.css";

export interface ReplayChip {
  /** What the chip names ("Symbol", "Interval", "Account"). */
  label: string;
  /** Its value ("BTCUSDT", "1h"). */
  value: string;
}

export interface ReplayLogRow {
  /** Stable id of the log row. */
  id: string;
  /** When, UTC epoch ms. */
  at: UtcEpochMs;
  /** What happened ("Fill", "Order rejected"). */
  event: string;
  /** Order id the row belongs to. */
  order: string;
  /** Side and type in words ("Limit, Buy"). */
  kind: string;
  /** Exact decimal quantity string. */
  qty?: string | null;
  /** Exact decimal price string. */
  price?: string | null;
  /** Exact decimal fee string; `null` prints `Not available`. */
  fee?: string | null;
  /** Outcome in a few words. */
  result: string;
}

export interface ReplayPanelProps {
  /** What is replayed ("BTC-Trend v3 on Binance-02"). Names the panel and the log. */
  subject: string;
  /** Panel state. Default `ok`. */
  status?: PanelStatus;
  /** Why the state is what it is. */
  reason?: string;
  /** Chips under the head (symbol, interval, account, source). */
  chips?: readonly ReplayChip[];
  /**
   * The market-data source is qualified for candles. Default `false`: candles
   * are withheld until the caller says otherwise.
   */
  candlesQualified?: boolean;
  /** Extra words for the banner when the source published a reason. */
  candlesReason?: string;
  /**
   * Props of the V1 `TradeReplayEvents` panel. When present the frame renders
   * it lazily and ignores `logRows`.
   */
  replay?: TradeReplayEventsProps;
  /** Plain log, when no V1 panel is mounted. */
  logRows?: readonly ReplayLogRow[];
  /** Decimal places for quantity (the instrument step). */
  qtyDp?: number;
  /** Decimal places for price. */
  priceDp?: number;
}

/** A failed chunk load is a state the reader can see, not a blank panel. */
class ReplayLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The state below is the whole report; nothing is retried silently.
  }
  render() {
    if (this.state.failed) {
      return <PanelState status="unavailable" reason="The replay view could not be loaded. Reload the page to try again." />;
    }
    return this.props.children;
  }
}

function logColumns(qtyDp: number | undefined, priceDp: number | undefined): CardsColumn<ReplayLogRow>[] {
  const dec = (value: string | null | undefined, unit: "qty" | "money", dp?: number) =>
    value === null || value === undefined ? "Not available" : formatExact(value, unit, dp === undefined ? undefined : { dp }).display;
  return [
    { key: "at", label: "Time (UTC)", render: (r) => utcStamp(r.at) },
    { key: "event", label: "Event", render: (r) => r.event },
    { key: "order", label: "Order", render: (r) => <span className="exec-blk-id">{r.order}</span> },
    { key: "kind", label: "Type", render: (r) => r.kind },
    { key: "qty", label: "Quantity", numeric: true, render: (r) => dec(r.qty, "qty", qtyDp) },
    { key: "price", label: "Price", numeric: true, render: (r) => dec(r.price, "money", priceDp) },
    { key: "fee", label: "Fee", numeric: true, render: (r) => dec(r.fee, "money") },
    { key: "result", label: "Result", render: (r) => r.result },
  ];
}

/** The replay frame. */
export function ReplayPanel({
  subject,
  status = "ok",
  reason,
  chips,
  candlesQualified = false,
  candlesReason,
  replay,
  logRows,
  qtyDp,
  priceDp,
}: ReplayPanelProps) {
  const body = replay ? (
    <ReplayLoadBoundary>
      <Suspense fallback={<PanelState status="loading" />}>
        <LazyTradeReplayEvents {...replay} market={candlesQualified ? replay.market : null} />
      </Suspense>
    </ReplayLoadBoundary>
  ) : (
    <CardsTable
      columns={logColumns(qtyDp, priceDp)}
      rows={logRows ?? []}
      rowKey={(r) => r.id}
      label={`Trade log for ${subject}`}
      empty={<PanelState status="empty" reason={`No orders or fills recorded for ${subject}.`} />}
    />
  );
  const showsBody = status === "ok" || status === "partial" || status === "stale";
  return (
    <SectionPanel title="Trade Replay" aside={subject}>
      <div className="exec-blk-replay">
        {chips && chips.length > 0 ? (
          <ul className="exec-blk-chips" aria-label="Replay scope">
            {chips.map((c) => (
              <li key={c.label} className="exec-blk-chip">
                <span className="exec-blk-chip-label">{c.label}</span> {c.value}
              </li>
            ))}
          </ul>
        ) : null}
        {showsBody && !candlesQualified ? (
          <div className="exec-blk-banner" role="note">
            <Flag kind="na" label="Candles not qualified" size="sm" />{" "}
            <span>
              No candles are drawn until the market-data source is qualified. Fills and the trade log stay.
              {candlesReason ? ` ${candlesReason}` : ""}
            </span>
          </div>
        ) : null}
        <PanelGate status={status} reason={reason}>
          {body}
        </PanelGate>
      </div>
    </SectionPanel>
  );
}
