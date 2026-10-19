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
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { MarketCandleInterval } from "../../../../api/marketCandles";
import type { ExecutionApi } from "../../../../api/ports";
import type { AlphaFleetItem } from "../../../../api/profileRead";
import type { TradeReplayEventsProps } from "../../../../components/TradeReplayEvents";
import { ReplayPanel, type ReplayChip } from "../../../blocks";
import { ENV_LABEL, type ExecEnv } from "../../../urlState";
import { focusTarget } from "../model";
import { useReplayCandles, type SubjectBook } from "../useAlphaReads";
import { MAX_LOADED_RECORDS, auditBook, auditSentences, candleVerdict, candleWindow, canLoadMore, countUntimed, preferredInterval, replayRange, replayState, symbolsOf, venueOf, type RelationAudit } from "./model";

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
  /** The list the reader came from (the Blotter with `from=blotter`); absent means the Orders & Fills tab. */
  back?: { label: string; to: string };
}

export function ReplayView({ api, alphaId, alphaLabel, env, item, book, focus, canSeeAccounts, ordersHref, back }: ReplayViewProps) {
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

  // Building the log to count untimed records is the costly part; it moves only when the records do.
  const untimed = useMemo(() => countUntimed(book.orders, book.fills), [book.orders, book.fills]);
  const audit = useMemo(
    () => auditBook(book, untimed),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `book` is a new object every render; these are the parts the audit reads.
    [book.orders, book.fills, book.ordersState, book.fillsState, book.ordersMore.hasMore, book.ordersMore.loadingMore, book.ordersMore.moreError, book.fillsMore.hasMore, book.fillsMore.loadingMore, book.fillsMore.moreError, untimed],
  );
  // Nothing read is not "nothing there" when records arrived and failed, or the source said it did not answer.
  const base = replayState(book);
  const state = base.status === "empty" && (audit.orders.lost > 0 || audit.fills.lost > 0 || audit.orders.badState !== null || audit.fills.badState !== null)
    ? { status: "unavailable" as const, reason: auditSentences(audit).join(" ") }
    : base;
  // Symbol and Interval are the chart bar's own selects; naming them again here said everything twice.
  const chips: ReplayChip[] = [
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
    plain: true,
  };

  // The log and chart hold what was loaded and read. Say how far that is from what the Portal holds, in exact counts.
  const shown = state.status === "ok" || state.status === "partial";
  const shortfalls = shown ? auditSentences(audit) : [];
  const pagers = ([["orders", audit.orders, book.ordersMore], ["fills", audit.fills, book.fillsMore]] as const).filter(([, rel]) => canLoadMore(rel));
  // When every record of page 1 was unreadable the panel is Unavailable and already carries the sentences, but the way to the next page must stay.
  const pagerOnly = !shown && state.status === "unavailable" && pagers.length > 0;

  // The button that was pressed unmounts with the last page; focus would fall to the body. It goes to a stable status element instead.
  const noticeRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const pressed = useRef<"orders" | "fills" | null>(null);
  const [paged, setPaged] = useState(false);
  const stillOffered = pressed.current !== null && pagers.some(([relation]) => relation === pressed.current);
  useEffect(() => {
    if (pressed.current === null || stillOffered) return;
    const active = document.activeElement;
    if (active === null || active === document.body) (noticeRef.current ?? doneRef.current)?.focus({ preventScroll: true });
    pressed.current = null;
  });

  const missing =
    target !== null && shown && !(target.kind === "order" ? book.orders.some((o) => o.orderId === target.id) : book.fills.some((f) => f.fillId === target.id));
  const wordsFor = (relation: "orders" | "fills", rel: RelationAudit, readState: typeof book.ordersState): string => {
    if (readState.phase === "error") return `cannot be looked up: the ${relation} could not be read (${readState.reason}).`;
    const loaded = `is not among the ${rel.read.toLocaleString("en-US")} loaded ${relation}`;
    if (rel.capped) return `${loaded}; the Portal holds more, and loading stops at ${MAX_LOADED_RECORDS.toLocaleString("en-US")} ${relation}. Narrow the replay window to look further.`;
    if (rel.moreError !== null) return `${loaded}; the next page of ${relation} could not be read (${rel.moreError}). Try again below.`;
    if (rel.hasMore) return `${loaded}; the Portal holds more. Load more ${relation} below to look further.`;
    return "is not in the retained window of this book.";
  };

  return (
    <div className="exec-alp2-replay">
      {target !== null && shown ? (
        <div className="exec-blk-banner" role="status">
          {missing ? (
            <>
              {target.kind === "order" ? "Order" : "Fill"} <span className="exec-blk-id">{target.id}</span>{" "}
              {target.kind === "order" ? wordsFor("orders", audit.orders, book.ordersState) : wordsFor("fills", audit.fills, book.fillsState)}
            </>
          ) : (
            <>
              Opened at {target.kind} <span className="exec-blk-id">{target.id}</span>. The matching rows and markers are highlighted.
            </>
          )}{" "}
          <Link className="exec-blk-link" to={back?.to ?? ordersHref}>Back to {back?.label ?? "Orders & Fills"}</Link>
        </div>
      ) : null}
      {shortfalls.length > 0 || pagerOnly ? (
        <div ref={noticeRef} tabIndex={-1} className="exec-blk-banner" role="status" aria-label="What this replay holds" data-testid="replay-shortfall">
          {shortfalls.map((line) => <p key={line}>{line}</p>)}
          {pagers.map(([relation, rel, more]) => (
            <button key={relation} type="button" className="exec-blk-btn" aria-busy={rel.loadingMore ? "true" : undefined} onClick={() => { if (!rel.loadingMore) { pressed.current = relation; setPaged(true); more.loadMore(); } }}>
              {rel.loadingMore ? `Loading more ${relation}` : rel.moreError ? `Try again: ${relation}` : `Load more ${relation}`}
            </button>
          ))}
        </div>
      ) : paged && shown ? (
        <p ref={doneRef} tabIndex={-1} className="exec-blk-banner" role="status" data-testid="replay-loaded">
          Every page the Portal holds is loaded: {audit.orders.read.toLocaleString("en-US")} orders and {audit.fills.read.toLocaleString("en-US")} fills.
        </p>
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
