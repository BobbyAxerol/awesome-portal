/**
 * WP-B2-O: THE ORDER BOOK CLOCK AND STATE RULES OF THE WORLD (step B of the UXM-07 campaign).
 *
 * ONE order book: the blotter double's rows are the book; the Live page, the Canary room, the Paper/Sandbox tabs, Alpha 360 (orders, fills, replay,
 * timeline) and the account lists are READ from it by order id. Nothing else invents an order. This module owns the two things every reader used to
 * restate on its own and therefore got different:
 *
 *   1. the CLOCK of an order: submit < risk grant < venue acknowledgement < fills <= the page's as-of, and the as-of of every order-bearing body IS the world
 *      clock (WORLD_NOW_MS). Every instant is a whole second, so no reader can round a fill ahead of its own submit. A body whose latest content instant is
 *      the world clock is moved by the preview's whole-day rebase exactly like every other body, so one order has ONE time on every screen.
 *   2. the STATE of an order: a working (accepted / submitted / partly filled) order is always among the newest rows of the book (so a scoped blotter,
 *      which narrows the page it loaded, finds it) and every Canary deployment holds exactly one working order, its newest.
 *
 * Pure functions of (row index, status, deployment stage); no constants restate a price, a symbol, a quantity or an account (those stay the world's).
 */
import { WORLD_NOW_MS } from "./bffWorld";

/** The as-of AND the read time of every order-bearing body: the world's one clock (equal, so a rebase that anchors on the read time keeps the as-of exact). */
export const ORDER_BOOK_AS_OF_MS = WORLD_NOW_MS;
export const ORDER_BOOK_AS_OF_ISO = new Date(ORDER_BOOK_AS_OF_MS).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** Orders are one every seven minutes, newest first. */
export const ORDER_SPACING_MS = 7 * MINUTE;
/** The newest order was submitted this long before the as-of: room for its slowest hop (three fills) and then some. */
const NEWEST_LEAD_MS = 30 * SECOND;
/** Hop offsets from the submit, whole seconds. */
export const HOP = { riskGrant: SECOND, venueAck: 2 * SECOND, firstFill: 4 * SECOND, fillStep: 4 * SECOND, venueReject: 2 * SECOND, riskReject: SECOND, cancel: 10 * SECOND } as const;

/** The rows a first page of the blotter holds. A working order is never older than this many rows (see `worldStatus`). */
export const FIRST_PAGE_ROWS = 50;
export const WORKING_STATES: readonly string[] = ["ACCEPTED", "SUBMITTED", "PARTIALLY_FILLED"];

/**
 * The status of row `index` of a book that holds `deployments` deployments in rotation, given the status the generator pattern drew.
 *  - a Canary deployment's newest row is its working order (a trial holds one open order, partly filled);
 *  - a working order older than the first page becomes a finished one (partly filled -> filled, accepted / submitted -> canceled).
 */
export function worldStatus(index: number, deployments: number, stage: string | null, drawn: string): string {
  if (mustRest(index, deployments, stage)) return "PARTIALLY_FILLED";
  if (index >= FIRST_PAGE_ROWS && WORKING_STATES.includes(drawn)) return drawn === "PARTIALLY_FILLED" ? "FILLED" : "CANCELED";
  return drawn;
}
/** An order that must rest on the book is a priced limit: never a market order (no price to rest at) and never a stop that has not triggered. */
export const mustRest = (index: number, deployments: number, stage: string | null): boolean => index < Math.min(deployments, FIRST_PAGE_ROWS) && stage === "CANARY";

export interface OrderClock {
  submittedMs: number;
  riskGrantMs: number | null;
  venueAckMs: number | null;
  /** the instant a rejection or a cancel was recorded */
  endedMs: number | null;
  fillMs: number[];
  /** the order's own last change: its last fill, else its rejection / cancel, else its last hop */
  updatedMs: number;
}
export const orderSubmittedMs = (index: number): number => ORDER_BOOK_AS_OF_MS - NEWEST_LEAD_MS - index * ORDER_SPACING_MS - (index % 5) * SECOND;

/** `riskRejected`: refused by the risk gate before any grant (no grant, no venue hop). `pieces`: the number of fills (0 for an order that traded nothing). */
export function orderClock(index: number, status: string, pieces: number, riskRejected: boolean): OrderClock {
  const submittedMs = orderSubmittedMs(index);
  const grant = submittedMs + HOP.riskGrant;
  const ack = submittedMs + HOP.venueAck;
  if (status === "REJECTED") {
    const endedMs = submittedMs + (riskRejected ? HOP.riskReject : HOP.venueReject);
    return { submittedMs, riskGrantMs: riskRejected ? null : grant, venueAckMs: null, endedMs, fillMs: [], updatedMs: endedMs };
  }
  if (status === "SUBMITTED") return { submittedMs, riskGrantMs: grant, venueAckMs: null, endedMs: null, fillMs: [], updatedMs: grant };
  if (status === "CANCELED") return { submittedMs, riskGrantMs: grant, venueAckMs: ack, endedMs: submittedMs + HOP.cancel, fillMs: [], updatedMs: submittedMs + HOP.cancel };
  const fillMs = Array.from({ length: status === "FILLED" || status === "PARTIALLY_FILLED" ? pieces : 0 }, (_, p) => submittedMs + HOP.firstFill + p * HOP.fillStep);
  return { submittedMs, riskGrantMs: grant, venueAckMs: ack, endedMs: null, fillMs, updatedMs: fillMs.length > 0 ? fillMs[fillMs.length - 1]! : ack };
}

/** The hop instants an order's path shows, in order (submitted, risk grant, venue acknowledgement, first fill), each null when the order never reached it. */
export function orderPath(clock: OrderClock): (number | null)[] {
  return [clock.submittedMs, clock.riskGrantMs, clock.venueAckMs, clock.fillMs[0] ?? null];
}
