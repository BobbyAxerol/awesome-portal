/**
 * Trade Replay for one alpha in one book: the V2 frame (`ReplayPanel`) around
 * the V1 replay panel, fed by the orders and fills the subject BFF holds.
 *
 * The fills log is what the panel opens with. Candles are drawn only when the
 * venue source reports READY bars for the symbol on show; otherwise the banner
 * "Candles not qualified" says so with the source's own reason, and the log and
 * markers stay. The Trading System's own candles (market context) are read
 * beside the venue ones and never merged; their state is named in the panel's
 * footer. `focus=order:<id>` (or `fill:<id>`) opens the replay at that order.
 */
import { useMemo, useState } from "react";

import type { MarketCandleInterval } from "../../../../api/marketCandles";
import type { ExecutionApi } from "../../../../api/ports";
import type { AlphaFleetItem } from "../../../../api/profileRead";
import type { TradeReplayEventsProps } from "../../../../components/TradeReplayEvents";
import { ReplayPanel, type ReplayChip } from "../../../blocks";
import { ENV_LABEL, type ExecEnv } from "../../../urlState";
import { focusTarget } from "../model";
import { useReplayCandles, type SubjectBook } from "../useAlphaReads";
import { candleVerdict, candleWindow, preferredInterval, replayRange, replayState, symbolsOf, venueOf } from "./model";

export interface ReplayViewProps {
  api: ExecutionApi;
  alphaId: string;
  alphaLabel: string;
  env: ExecEnv;
  item: AlphaFleetItem | null;
  book: SubjectBook;
  /** `order:<id>` or `fill:<id>`. */
  focus: string | null;
  canSeeAccounts: boolean;
  /** Where the Orders & Fills tab lives, for the banner's way back. */
  ordersHref: string;
}

export function ReplayView({ api, alphaId, alphaLabel, env, item, book, focus, canSeeAccounts, ordersHref }: ReplayViewProps) {
  const target = focusTarget(focus);
  const symbols = useMemo(() => symbolsOf(book.orders, book.fills), [book.orders, book.fills]);
  const focusSymbol = useMemo(() => {
    if (target === null) return null;
    if (target.kind === "order") return book.orders.find((o) => o.orderId === target.id)?.symbol ?? null;
    return book.fills.find((f) => f.fillId === target.id)?.symbol ?? null;
  }, [target, book.orders, book.fills]);
  const [picked, setPicked] = useState<string | null>(null);
  const symbol = picked !== null && symbols.includes(picked) ? picked : focusSymbol ?? symbols[0] ?? null;

  const choice = preferredInterval(book, alphaId);
  const [chosen, setChosen] = useState<MarketCandleInterval | null>(null);
  const wanted = chosen ?? choice.interval;
  const range = useMemo(() => replayRange(book.orders, book.fills, symbol), [book.orders, book.fills, symbol]);
  const venue = venueOf(item, env);
  const window = range === null ? null : candleWindow(range, wanted);
  const query = symbol !== null && venue !== null && window !== null
    ? { env, symbol, venue, interval: window.interval, fromMs: window.fromMs, toMs: window.toMs, limit: window.limit }
    : null;
  const candles = useReplayCandles(api, query);
  const verdict = candleVerdict(symbol, query === null && symbol !== null ? { phase: "error", status: "unavailable", reason: venue === null ? "The Portal reads no public klines for this alpha's venue" : "No timed trade to place candles around" } : candles.venue, candles.context);

  const state = replayState(book);
  const chips: ReplayChip[] = [
    ...(symbol === null ? [] : [{ label: "Symbol", value: symbol }]),
    { label: "Interval", value: window?.interval ?? wanted },
    { label: "Book", value: ENV_LABEL[env] },
    { label: "Account", value: canSeeAccounts ? (book.orders[0]?.accountId ?? book.fills[0]?.accountId ?? "Not available") : "Not available" },
  ];

  const venuePayload = candles.venue.phase === "ready" ? candles.venue.value : null;
  const replay: TradeReplayEventsProps = {
    orders: book.orders,
    fills: book.fills,
    candles: verdict.context,
    asOf: book.asOfMs === null ? null : new Date(book.asOfMs).toISOString(),
    accounts: canSeeAccounts ? [...new Set([...book.orders.map((o) => o.accountId), ...book.fills.map((f) => f.accountId)].filter((a): a is string => a !== null))] : [],
    market: venuePayload,
    marketTransport: candles.venue.phase === "error" ? candles.venue.status : candles.venue.phase === "ready" ? "ok" : "loading",
    marketReason: candles.venue.phase === "error" ? candles.venue.reason : null,
    interval: window?.interval ?? wanted,
    onIntervalChange: setChosen,
    intervalNote: choice.note,
    symbol,
    onSymbolChange: setPicked,
    focusId: focus,
    source: { label: "Subject BFF retained window", detail: "orders and fills of this alpha in this book, not an event replay", page: null },
    subjectLabel: alphaLabel,
  };

  const missing =
    target !== null && state.status === "ok" && !(target.kind === "order" ? book.orders.some((o) => o.orderId === target.id) : book.fills.some((f) => f.fillId === target.id));

  return (
    <div className="exec-alp2-replay">
      {target !== null && state.status === "ok" ? (
        <div className="exec-blk-banner" role="status">
          {missing ? (
            <>
              {target.kind === "order" ? "Order" : "Fill"} <span className="exec-blk-id">{target.id}</span> is not in the retained window of this book.
            </>
          ) : (
            <>
              Opened at {target.kind} <span className="exec-blk-id">{target.id}</span>. The matching rows and markers are highlighted.
            </>
          )}{" "}
          <a className="exec-blk-link" href={ordersHref}>Back to Orders &amp; Fills</a>
        </div>
      ) : null}
      <ReplayPanel
        subject={alphaLabel}
        status={state.status}
        reason={state.reason}
        chips={chips}
        candlesQualified={verdict.qualified}
        candlesReason={verdict.reason}
        replay={replay}
      />
    </div>
  );
}
