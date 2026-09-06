/**
 * Trade Replay on the source's own events — the product twin of the hi-fi
 * `TradeReplay` (BR-EX-50 grammar: candles + fill markers + bracket legs +
 * round trips + trade log). The model (`tradeReplayModel`) reads the rows the
 * Trading System publishes today; the chart (`ReplayCandleChart`, TradingView
 * Lightweight Charts™) draws venue public klines with the trades on them
 * (OR-4 / OR-5). Every number printed is the server's string.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { MARKET_CANDLE_INTERVALS, type MarketCandleInterval, type MarketCandlesPayload } from "../api/marketCandles";
import type { PanelStatus } from "../contracts";
import { ReplayCandleChart, type ReplayChartHandle } from "./ReplayCandleChart";
import { buildLog, legLevels, legRole, money, ms, num, pairRoundTrips } from "./tradeReplayModel";
import type { LogRow, ReplayFill, ReplayOrder } from "./tradeReplayModel";

export {
  buildLog, legLevels, legRole, money, ms, num, pairRoundTrips, qtyFmt, readReplayFills, readReplayOrders,
} from "./tradeReplayModel";
export type { Leg, LegRole, LogEvent, LogRow, ReplayFill, ReplayOrder, RoundTrip } from "./tradeReplayModel";

export interface TradeReplayEventsProps {
  orders: readonly ReplayOrder[];
  fills: readonly ReplayFill[];
  /** The Trading System's own candle state (E5/N28) — printed even when venue klines are drawn. */
  candles: { state: string | null; reason: string | null };
  asOf: string | null;
  /** Deployment / account chips; the first is selected. */
  accounts?: readonly string[];
  /** Venue public klines for the active symbol; absent = the container did not request them. */
  market?: MarketCandlesPayload | null;
  marketTransport?: PanelStatus;
  marketReason?: string | null;
  interval?: MarketCandleInterval;
  onIntervalChange?: (interval: MarketCandleInterval) => void;
  /** e.g. "inferred from the strategy id (DERIVED)" until BR-EX-80 publishes the timeframe */
  intervalNote?: string | null;
  /** Controlled symbol; when absent the panel keeps its own. */
  symbol?: string | null;
  onSymbolChange?: (symbol: string) => void;
  /** the container fetches another candle page when the reader reaches an end of the loaded ones */
  onRangeEdge?: (edge: "left" | "right") => void;
  /** more candles are on their way (edge paging) */
  paging?: "left" | "right" | null;
  /** deep link: scene object to open on (`fill:123`, `order:456` → its fill / reject / leg) */
  focusId?: string | null;
  /** what the retained projection page holds in total (all strategies), for an honest empty state */
  page?: { orders: number; fills: number; strategies: number } | null;
  subjectLabel?: string | null;
}

const HEIGHT = { compact: 420, tall: 620 } as const;

/** The scene object a log row stands for (the same ids the chart primitive uses). */
export function sceneIdOfRow(row: LogRow, orders: readonly ReplayOrder[]): string | null {
  if (row.event === "FILL") return `fill:${row.ref}`;
  if (row.event === "REJECT") return `reject:${row.ref}`;
  const o = orders.find((x) => x.orderId === row.ref);
  if (!o) return null;
  const role = legRole(o);
  if (role === "TP" || role === "SL") return row.event === "TRIGGER" ? `trigger:${row.ref}` : row.event === "CANCEL" ? `cancel:${row.ref}` : `leg:${row.ref}`;
  if ((o.type ?? "").toUpperCase().includes("LIMIT")) return `ladder:${row.ref}`;
  return null;
}

/** Next / previous fill from the current selection (or from the newest fill when nothing is selected). */
export function stepFill(fills: readonly ReplayFill[], selected: string | null, direction: -1 | 1): string | null {
  if (fills.length === 0) return null;
  const ids = fills.map((f) => `fill:${f.fillId}`);
  const at = selected ? ids.indexOf(selected) : -1;
  const next = at < 0 ? (direction < 0 ? ids.length - 1 : 0) : Math.max(0, Math.min(ids.length - 1, at + direction));
  return ids[next] ?? null;
}
const TALL_KEY = "exec.replay.tall";
const readTall = (): boolean => { try { return window.localStorage.getItem(TALL_KEY) === "1"; } catch { return false; } };
const writeTall = (tall: boolean): void => { try { window.localStorage.setItem(TALL_KEY, tall ? "1" : "0"); } catch { /* per-viewer convenience only */ } };

/** `order:<id>` names whichever scene object that order left behind: its fill, its reject, its leg. */
export function resolveFocus(focus: string | null | undefined, orders: readonly ReplayOrder[], fills: readonly ReplayFill[]): string | null {
  if (!focus) return null;
  if (focus.startsWith("fill:") || focus.startsWith("reject:") || focus.startsWith("leg:") || focus.startsWith("ladder:")) return focus;
  const id = focus.startsWith("order:") ? focus.slice(6) : focus;
  const o = orders.find((x) => x.orderId === id);
  if (!o) return null;
  const fill = fills.find((f) => f.clientOrderId && f.clientOrderId === o.clientOrderId);
  if (fill) return `fill:${fill.fillId}`;
  if ((o.status ?? "").toUpperCase().includes("REJECT")) return `reject:${o.orderId}`;
  const role = legRole(o);
  if (role === "TP" || role === "SL") return `leg:${o.orderId}`;
  return (o.type ?? "").toUpperCase().includes("LIMIT") ? `ladder:${o.orderId}` : null;
}

export function TradeReplayEvents({ orders, fills, candles, asOf, accounts = [], market = null, marketTransport = "loading", marketReason = null, interval = "1h", onIntervalChange, intervalNote = null, symbol: controlledSymbol, onSymbolChange, onRangeEdge, paging = null, focusId = null, page = null, subjectLabel = null }: TradeReplayEventsProps) {
  const symbols = useMemo(() => Array.from(new Set([...fills.map((f) => f.symbol), ...orders.map((o) => o.symbol)].filter((s): s is string => !!s))).sort(), [fills, orders]);
  const [ownSymbol, setOwnSymbol] = useState<string | null>(null);
  const symbol = controlledSymbol !== undefined ? controlledSymbol : ownSymbol;
  const setSymbol = (s: string) => { setOwnSymbol(s); onSymbolChange?.(s); };
  const activeSymbol = symbol && symbols.includes(symbol) ? symbol : symbols[0] ?? null;
  const bars = market && market.state === "READY" && (market.symbol === null || market.symbol === activeSymbol) ? market.candles : [];
  const barMs = bars.length > 0 ? market?.intervalMs ?? null : null;
  const scopedFills = useMemo(() => fills.filter((f) => !activeSymbol || f.symbol === activeSymbol).sort((a, b) => a.tradeTime.localeCompare(b.tradeTime)), [fills, activeSymbol]);
  const scopedOrders = useMemo(() => orders.filter((o) => !activeSymbol || o.symbol === activeSymbol), [orders, activeSymbol]);
  const trips = useMemo(() => pairRoundTrips(scopedFills, scopedOrders), [scopedFills, scopedOrders]);
  const legs = useMemo(() => legLevels(scopedOrders), [scopedOrders]);
  const log = useMemo(() => buildLog(scopedOrders, scopedFills, trips), [scopedOrders, scopedFills, trips]);
  const rejects = scopedOrders.filter((o) => (o.status ?? "").toUpperCase().includes("REJECT")).length;

  const times = useMemo(() => {
    const ts = [...scopedFills.map((f) => ms(f.tradeTime)), ...scopedOrders.flatMap((o) => [ms(o.submittedAt), ms(o.updatedAt)])].filter((t): t is number => t !== null);
    if (ts.length === 0) return null;
    return { lo: Math.min(...ts), hi: Math.max(...ts) };
  }, [scopedFills, scopedOrders]);
  const barsLast = bars.length > 0 ? bars[bars.length - 1]!.closeT : null;
  // Opening view: the recent trades, never empty — from the sixth-last fill
  // to the last fill, padded; later order events (cancels, rejects) join only
  // when they fall within two days of the last fill, otherwise Fit shows them.
  const opening = useMemo(() => {
    if (!times) return null;
    const fillTimes = scopedFills.map((f) => ms(f.tradeTime)).filter((x): x is number => x !== null);
    if (fillTimes.length === 0) return { t0: times.lo - 3_600_000, t1: times.hi + 3_600_000 };
    const lastFill = fillTimes[fillTimes.length - 1]!;
    const firstShown = fillTimes[Math.max(0, fillTimes.length - 6)]!;
    const tail = times.hi - lastFill <= 2 * 86_400_000 ? times.hi : lastFill;
    const pad = Math.max(6 * 3_600_000, (tail - firstShown) * 0.08);
    return { t0: firstShown - pad, t1: Math.min(tail + pad, Math.max(tail + pad, barsLast ?? 0)) };
  }, [times, scopedFills, barsLast]);

  const chart = useRef<ReplayChartHandle>(null);
  const [tall, setTall] = useState(false);
  useEffect(() => { setTall(readTall()); }, []);
  const [hovered, setHovered] = useState<string | null>(null);
  const focusTarget = useMemo(() => resolveFocus(focusId, orders, fills), [focusId, orders, fills]);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (focusTarget) setSelected(focusTarget); }, [focusTarget]);
  const select = (id: string | null, scroll: boolean) => {
    setSelected(id);
    if (id) {
      chart.current?.focus(id);
      if (scroll) document.querySelector<HTMLElement>(`tr[data-scene-id="${id}"]`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    select(stepFill(scopedFills, selected, e.key === "ArrowLeft" ? -1 : 1), true);
  };

  if (!times || (scopedFills.length === 0 && scopedOrders.length === 0)) {
    return (
      <section className="exec-rp-panel" aria-label="Trade replay">
        <header className="exec-rp-head"><span className="exec-rp-title">Trade replay — trade logs on candles</span></header>
        <div className="exec-gate-unverified">
          No order or fill of {subjectLabel ?? "this subject"} is present in the retained projection page.
          {page ? ` The page holds ${page.orders} orders and ${page.fills} fills across ${page.strategies} strateg${page.strategies === 1 ? "y" : "ies"} (bounded current page, all profiles) — none of them belongs here.` : ""}
          {" "}Market candles are {candles.state?.toLowerCase() ?? "unavailable"} · {candles.reason ?? "source not published"}.
        </div>
        <p className="exec-rp-smoke">Counts on the Overview tab (orders, filled, rejected) are profile-wide analytics facts, not this alpha's — DR-22. A per-alpha order / fill read beyond the current page is a backend request (BR-EX-81).</p>
      </section>
    );
  }

  const last = scopedFills[scopedFills.length - 1] ?? null;
  const prev = scopedFills[scopedFills.length - 2] ?? null;
  const lastBar = bars[bars.length - 1] ?? null;
  const prevBar = bars[bars.length - 2] ?? null;
  const markPrice = lastBar ? lastBar.c : last?.price ?? null;
  const markLabel = lastBar ? "mark" : "last fill";
  const upTick = lastBar && prevBar ? (num(lastBar.c) ?? 0) >= (num(prevBar.c) ?? 0) : last && prev ? (num(last.price) ?? 0) >= (num(prev.price) ?? 0) : true;
  const candlesWord = candles.state?.toLowerCase() ?? "unavailable";
  const klinesWord = market && market.state !== "READY"
    ? `venue klines ${market.state.toLowerCase()}${market.reasonCode ? ` · ${market.reasonCode}` : ""}`
    : marketTransport !== "ok" && marketTransport !== "loading" ? `venue klines ${marketTransport}${marketReason ? ` · ${marketReason}` : ""}`
    : marketTransport === "loading" && !market ? "venue klines loading" : null;
  const notice = bars.length > 0 ? null : `${klinesWord ?? "venue klines not requested"} · source candles ${candlesWord} (${candles.reason ?? "not published"}) — no candles: the time axis is indexed by the events themselves`;
  const height = tall ? HEIGHT.tall : HEIGHT.compact;
  const brackets = scopedFills.filter((f) => !trips.some((tr) => tr.exit.fillId === f.fillId)).length;

  return (
    <>
      <section className="exec-rp-panel" aria-label="Trade replay">
        <header className="exec-rp-head">
          <span className="exec-rp-title">Trade replay — trade logs on candles</span>
          {accounts.length > 0 ? <span className="exec-rp-chip" title="Deployment account in scope">{accounts[0]}{accounts.length > 1 ? ` +${accounts.length - 1}` : ""}</span> : null}
          {symbols.length > 1 ? (
            <select className="exec-rp-chip" aria-label="Symbol" value={activeSymbol ?? ""} onChange={(e) => setSymbol(e.target.value)}>
              {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : activeSymbol ? <span className="exec-rp-chip">{activeSymbol}</span> : null}
          {market?.source.venue ? <span className="exec-rp-chip" title={market.source.endpoint ?? undefined}>{market.source.venue} {market.source.market ?? ""}</span> : null}
          <span className="exec-rp-spacer" />
          {onIntervalChange ? (
            <label className="exec-rp-interval">
              <select className="exec-rp-chip" aria-label="Candle interval" value={interval} onChange={(e) => onIntervalChange(e.target.value as MarketCandleInterval)}>
                {MARKET_CANDLE_INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
              {intervalNote ? <span className="exec-rp-win" title="The Trading System does not publish the strategy's timeframe (BR-EX-80)">{intervalNote}</span> : null}
            </label>
          ) : null}
          {markPrice ? (
            <span className="exec-rp-mark">{markLabel} <b data-tone={upTick ? "good" : "bad"}>{money(markPrice)}</b> <span data-tone={upTick ? "good" : "bad"}>{upTick ? "▲" : "▼"}</span></span>
          ) : null}
          <span className="exec-rp-ctl" role="group" aria-label="Replay window">
            <button type="button" className="exec-rp-chip" onClick={() => chart.current?.zoom(0.6)} aria-label="Zoom in">+</button>
            <button type="button" className="exec-rp-chip" onClick={() => chart.current?.zoom(1 / 0.6)} aria-label="Zoom out">−</button>
            <button type="button" className="exec-rp-chip" onClick={() => chart.current?.pan(-1)} aria-label="Pan left">◀</button>
            <button type="button" className="exec-rp-chip" onClick={() => chart.current?.pan(1)} aria-label="Pan right">▶</button>
            <button type="button" className="exec-rp-chip" onClick={() => chart.current?.fit()}>Fit</button>
            <button type="button" className="exec-rp-chip" onClick={() => { setTall(!tall); writeTall(!tall); }} aria-pressed={tall} aria-label={tall ? "Compact chart" : "Expand chart"}>{tall ? "Compact" : "Expand"}</button>
          </span>
          <span className="exec-rp-win">{paging ? `loading ${paging === "left" ? "earlier" : "later"} candles · ` : ""}{bars.length > 0 ? `${bars.length} bars · ${market?.interval ?? interval} · ` : ""}{scopedFills.length} fills · {legs.length} legs · {trips.length} round trips · {brackets} position box{brackets === 1 ? "" : "es"} · crosshair · drag · wheel zoom · drag the price axis · ← → step fills</span>
        </header>
        <div className="exec-rp-canvas" style={{ height }} data-tall={tall}>
          <ReplayCandleChart
            ref={chart}
            bars={bars}
            intervalMs={barMs}
            fills={scopedFills}
            orders={scopedOrders}
            trips={trips}
            legs={legs}
            markPrice={markPrice}
            viewKey={`${activeSymbol ?? ""}|${market?.interval ?? interval}|${bars.length > 0 ? "bars" : "events"}`}
            opening={opening}
            notice={notice}
            ariaLabel={`${bars.length} ${market?.interval ?? interval} candles, ${scopedFills.length} fills with markers, ${legs.length} bracket legs, ${trips.length} round trips`}
            onHover={setHovered}
            onSelect={(id) => select(id, true)}
            selectedId={selected}
            onKeyDown={onKey}
            onRangeEdge={onRangeEdge}
            focusId={focusTarget}
          />
        </div>
        <div className="exec-rp-legend">
          <span><b data-side="long">▲</b> long entry · <b data-side="long">▽</b> long exit (hollow; label = realized_pnl)</span>
          <span><b data-side="short">▼</b> short entry · <b data-side="short">△</b> short exit</span>
          <span><span data-tone="good">▒</span> entry→TP · <span data-tone="bad">▒</span> entry→SL position box, R:R at its edge (legs paired to the entry by time · DERIVED)</span>
          <span>─ ─ <span data-tone="good">TP</span> / <span data-tone="bad">SL</span> leg at trigger_price · ◇ triggered · ⊣ cancelled · ┈ resting limit level</span>
          <span data-tone="bad">× rejected ({rejects})</span>
          <span className="exec-rp-mute">╌ round trip · {bars.length > 0 ? "▮ venue candle up / down" : "no candles"} · hover a marker for its card · click ↔ log row · ← → step fills</span>
        </div>
        <footer className="exec-rp-foot">
          source: orders ⋈ fills (client_order_id) · legs = orders of type TAKE_PROFIT_* / STOP_* with trigger_price · marker time = fill trade_time (UTC) ·{" "}
          {market && market.state === "READY"
            ? `candles = ${market.source.venue ?? "venue"} ${market.source.market ?? ""} ${market.source.kind === "data_layer" ? "data_layer" : "public"} klines ${market.interval ?? interval}${market.source.instrument && market.source.instrument !== market.symbol ? ` (${market.source.instrument})` : ""} via Portal (${market.source.endpoint ?? "venue endpoint"}, fetched ${market.fetchedAtMs ? new Date(market.fetchedAtMs).toISOString().slice(11, 19) : "—"}Z, ${market.coverage.returnedCount ?? bars.length} bars${market.coverage.truncated ? ", truncated at the venue page limit" : ""}) — VENUE_PUBLIC_MARKET_DATA, not the Trading System kline shard`
            : `venue klines ${market ? market.state.toLowerCase() : marketTransport}${market?.reasonCode ? ` · ${market.reasonCode}` : marketReason ? ` · ${marketReason}` : ""}`}
          {" "}· source candles {candlesWord} ({candles.reason ?? "not published"}) — BR-EX-50 pending · as_of {asOf ?? "not stated"}
          <span className="exec-rp-attrib"> · charting: <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer noopener">TradingView Lightweight Charts™</a> © TradingView, Inc.</span>
        </footer>
      </section>
      <section className="exec-rp-panel" aria-label="Trade log">
        <header className="exec-rp-head"><span className="exec-rp-title">Trade log — events behind the markers</span><span className="exec-rp-spacer" /><span className="exec-rp-win">{log.length} events{activeSymbol ? ` · ${activeSymbol}` : ""} · row ↔ marker share order_id / fill id</span></header>
        <div className="exec-scroll-x">
          <table className="exec-rp-table">
            <thead><tr><th>time (UTC)</th><th>event</th><th>order · leg</th><th>type · side</th><th data-numeric="true">qty</th><th data-numeric="true">price / trigger</th><th data-numeric="true">fee</th><th>note</th></tr></thead>
            <tbody>
              {log.map((r) => {
                const sceneId = sceneIdOfRow(r, scopedOrders);
                return (
                <tr
                  key={`${r.ref}-${r.t}`}
                  data-scene-id={sceneId ?? undefined}
                  data-hover={sceneId !== null && hovered === sceneId ? "true" : undefined}
                  data-selected={sceneId !== null && selected === sceneId ? "true" : undefined}
                  onMouseEnter={sceneId ? () => chart.current?.highlight(sceneId) : undefined}
                  onMouseLeave={sceneId ? () => chart.current?.highlight(null) : undefined}
                  onClick={sceneId ? () => select(sceneId, false) : undefined}
                  tabIndex={sceneId ? 0 : undefined}
                  onKeyDown={sceneId ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(sceneId, false); } } : undefined}
                >
                  <td className="exec-rp-dim">{r.time}</td>
                  <td><span className="exec-rp-ev" data-tone={r.eventTone}>{r.event}</span></td>
                  <td><span className="exec-rp-mute">{r.event === "FILL" ? "fill " : "ord "}</span><span className="exec-num">{r.ref}</span>{r.tail}</td>
                  <td>{r.type} · <span data-tone={r.side === "BUY" ? "good" : r.side === "SELL" ? "bad" : undefined}>{r.side ?? "—"}</span></td>
                  <td data-numeric="true">{r.qty}</td>
                  <td data-numeric="true">{r.price}</td>
                  <td data-numeric="true" className={r.fee ? undefined : "exec-rp-mute"}>{r.fee ?? "—"}</td>
                  <td data-tone={r.noteTone ?? undefined}>{r.note}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
