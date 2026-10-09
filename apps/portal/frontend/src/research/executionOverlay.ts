/**
 * Screen 08 · what the chart draws for the engine journal, as a pure model — the canvas primitive only paints it.
 *
 * Visual grammar (one idea each, nothing decorative):
 *  - a FILL is one small triangle at its own price (▲ buy, ▼ sell) with a short label (`buy 0.031`);
 *  - an entry LIMIT ORDER is a thin line from the instant the source made it working to its fill (or a faded dash if it never traded);
 *  - an OCO BRACKET is a box from the parent's fill to the instant the source resolved it, tinted between the entry price and each leg:
 *    the side of the entry the leg sits on decides the tint (adverse = red wash, favourable = green wash) — by published prices only;
 *    the leg that filled has a solid edge, a leg the source cancelled or expired has a faded dashed edge; each edge carries its price.
 * Roles (stop-loss / take-profit) are never named from an ID: a leg is called by its order type ("stop", "limit") and, only when the
 * source named the exit reason, by that word. Relations come from explicit `parent_order_id` / `oco_group_id`, never from adjacency.
 */

import { ocoGroups, type OrderTrack, type TrackState } from "./executionTracks";

/** The index of the bar holding an instant: the last bar that starts at or before it. -1 when it precedes every bar. */
export function barIndexAt(bars: readonly { at_utc_ms: number }[], at: number): number {
  let low = 0;
  let high = bars.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (bars[mid]!.at_utc_ms <= at) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

export type Direction = "buy" | "sell" | "unknown";

export interface OverlayFill {
  atMs: number;
  price: number;
  priceText: string;
  direction: Direction;
  /** `buy 0.03095` — compact for the canvas; the exact decimal string is in the readout. */
  label: string;
  orderId: string | null;
}

export interface OverlayLeg {
  orderId: string;
  level: number;
  levelText: string;
  /** Where the leg sits relative to the bracket's entry price: by published prices only. */
  side: "adverse" | "favourable" | "unknown";
  /** "stop" | "limit" | the source's own order type. */
  word: string;
  state: TrackState;
  endMs: number | null;
}

export interface OverlayBracket {
  groupId: string;
  entryPrice: number | null;
  entryText: string | null;
  startMs: number;
  endMs: number | null;
  legs: OverlayLeg[];
}

export interface OverlayEntry {
  orderId: string;
  level: number;
  startMs: number;
  endMs: number | null;
  state: TrackState;
}

export interface OverlayLink {
  fromMs: number;
  fromPrice: number;
  toMs: number;
  toPrice: number;
}

export interface Overlay {
  fills: OverlayFill[];
  entries: OverlayEntry[];
  brackets: OverlayBracket[];
  links: OverlayLink[];
}

const WORDS: Record<string, string> = { stop_market: "stop", stop_limit: "stop limit", limit: "limit", market: "market" };

/** A quantity short enough for a label: four significant digits, trailing zeros trimmed. The exact string stays in the readout. */
export function compactQty(text: string | null): string | null {
  if (text === null) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  if (value === 0) return "0";
  return String(Number(value.toPrecision(4)));
}

export function directionOf(side: string | null): Direction {
  const word = (side ?? "").trim().toLowerCase();
  return word === "buy" ? "buy" : word === "sell" ? "sell" : "unknown";
}

export interface FillInput {
  at_utc_ms: number;
  price: string;
  qty: string | null;
  side: string | null;
  /** The engine's own exit reason when it named one. */
  exit_reason?: string | null;
  order_id?: string | null;
}

const LEG_WORDS: Record<string, string> = { take_profit: "TP", stop_loss: "SL", stop: "SL", trailing_stop: "TRAIL", trail: "TRAIL", time: "TIME", time_exit: "TIME" };

/** The exit-leg word of a fill: only when the source named the reason, and only a reason this screen has a word for. */
export function legLabel(exitReason: string | null | undefined): string {
  return exitReason === null || exitReason === undefined ? "" : (LEG_WORDS[exitReason] ?? "");
}

/** Everything the chart draws for the orders and fills of one bar page. `windowStartMs` / `windowEndMs` clip to what is on the page. */
export function buildOverlay(tracks: readonly OrderTrack[], fills: readonly FillInput[], windowStartMs: number, windowEndMs: number): Overlay {
  const visibleFills: OverlayFill[] = [];
  for (const fill of fills) {
    const price = Number(fill.price);
    if (!Number.isFinite(price) || fill.at_utc_ms < windowStartMs || fill.at_utc_ms >= windowEndMs) continue;
    const direction = directionOf(fill.side);
    const qty = compactQty(fill.qty);
    visibleFills.push({
      atMs: fill.at_utc_ms,
      price,
      priceText: fill.price,
      direction,
      label: `${direction === "unknown" ? "fill" : direction}${qty === null ? "" : ` ${qty}`}${legLabel(fill.exit_reason) === "" ? "" : ` · ${legLabel(fill.exit_reason)}`}`,
      orderId: fill.order_id ?? null,
    });
  }

  const byId = new Map(tracks.map((track) => [track.orderId, track]));
  const overlaps = (start: number | null, end: number | null) => start !== null && start < windowEndMs && (end === null || end >= windowStartMs);

  /* entry limit orders: a working line from the source's start to its end, for orders that are not an OCO leg */
  const legIds = new Set(tracks.filter((track) => track.ocoGroupId !== null).map((track) => track.orderId));
  const entries: OverlayEntry[] = [];
  for (const track of tracks) {
    const level = Number(track.level);
    if (legIds.has(track.orderId) || track.orderType !== "limit" || track.level === null || !Number.isFinite(level) || !overlaps(track.startMs, track.endMs)) continue;
    entries.push({ orderId: track.orderId, level, startMs: track.startMs!, endMs: track.endMs, state: track.state });
  }

  const brackets: OverlayBracket[] = [];
  for (const group of ocoGroups(tracks)) {
    const parent = group.parent;
    /* a bracket starts when the source activated its legs (their own start); the entry price is the parent's actual fill, else its level */
    const startMs = Math.min(...group.legs.map((leg) => leg.startMs ?? Number.POSITIVE_INFINITY));
    if (!Number.isFinite(startMs)) continue;
    const ends = group.legs.map((leg) => leg.endMs);
    const endMs = ends.some((end) => end === null) ? null : Math.max(...(ends as number[]));
    if (!overlaps(startMs, endMs)) continue;
    const entryText = parent?.fillPrice ?? parent?.level ?? null;
    const entryPrice = entryText === null ? null : Number(entryText);
    const parentFill = parent ? fills.find((fill) => fill.order_id === parent.orderId) : undefined;
    const long = directionOf(parentFill?.side ?? null) === "buy" ? true : directionOf(parentFill?.side ?? null) === "sell" ? false : null;
    const legs: OverlayLeg[] = [];
    for (const leg of group.legs) {
      const level = Number(leg.level);
      if (leg.level === null || !Number.isFinite(level)) continue;
      const side: OverlayLeg["side"] =
        entryPrice === null || long === null || !Number.isFinite(entryPrice) || level === entryPrice
          ? "unknown"
          : (long ? level < entryPrice : level > entryPrice)
            ? "adverse"
            : "favourable";
      legs.push({ orderId: leg.orderId, level, levelText: leg.level, side, word: leg.orderType === null ? "order" : (WORDS[leg.orderType] ?? leg.orderType.replace(/_/g, " ")), state: leg.state, endMs: leg.endMs });
    }
    if (legs.length > 0) brackets.push({ groupId: group.groupId, entryPrice: entryPrice !== null && Number.isFinite(entryPrice) ? entryPrice : null, entryText, startMs, endMs, legs });
  }

  /* a trade link joins an entry fill to a later fill only when that fill names the entry as its explicit parent */
  const links: OverlayLink[] = [];
  const fillByOrder = new Map(visibleFills.filter((fill) => fill.orderId !== null).map((fill) => [fill.orderId!, fill]));
  for (const track of tracks) {
    if (track.parentOrderId === null || track.state !== "filled") continue;
    const exit = fillByOrder.get(track.orderId);
    const entry = fillByOrder.get(track.parentOrderId);
    if (exit && entry && byId.has(track.parentOrderId)) links.push({ fromMs: entry.atMs, fromPrice: entry.price, toMs: exit.atMs, toPrice: exit.price });
  }

  return { fills: visibleFills, entries, brackets, links };
}

/** Bar index holding an instant, clamped into the page; used by the canvas to place x on the bar grid. */
export function barIndexClamped(bars: readonly { at_utc_ms: number }[], ms: number): number {
  return Math.max(0, Math.min(bars.length - 1, barIndexAt(bars, ms)));
}
