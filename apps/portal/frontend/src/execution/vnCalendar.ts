/**
 * Venue calendar — the session clock a VN deployment lives on.
 *
 * `IMPLEMENTATION_PHASES` §13 closes phase 13 on one sentence: *"freshness
 * clock provably pauses outside 09:00–14:45 ICT"*. So the clock is a pure
 * function rather than a branch inside a render path — it is the thing that
 * must be provable, and a rule buried in JSX can only be checked by counting
 * elements.
 *
 * The distinction it exists to protect: a VN deployment at 20:00 ICT is not
 * stale. Its data is exactly as fresh as the market allows, and marking it
 * STALE would send an operator looking for a fault in a system that is working
 * correctly. `PAUSED` is a fifth freshness state for precisely this, and it is
 * the state the analytics reader used to fold into `UNKNOWN`.
 */
import type { FreshnessState } from "./contracts";

/** Minutes from midnight, in the venue's own timezone. No UTC conversion. */
export interface SessionWindow {
  /** `09:00` → 540. */
  openMinute: number;
  /** `14:45` → 885. */
  closeMinute: number;
}

export interface VenueCalendar {
  /** `Asia/Ho_Chi_Minh`. Shown, never used to convert — the server sends local. */
  timezone: string;
  label: string;
  window: SessionWindow;
  /** Days the venue trades. 1 = Monday, as `Date.getUTCDay()` numbers them. */
  tradingDays: readonly number[];
  /** `2026-09-02` — dates the venue is shut regardless of weekday. */
  holidays?: readonly string[];
  /** Named phases inside the window (ATO/ATC auctions, lunch break) — venue facts, drawn on the timeline. */
  phases?: readonly { label: string; kind: "auction" | "continuous" | "break"; openMinute: number; closeMinute: number }[];
}

export type SessionPhase =
  /** Inside the continuous session. */
  | "OPEN"
  /** Shut by the calendar: after close, before open, a weekend or a holiday. */
  | "CLOSED_BY_CALENDAR";

export interface SessionState {
  phase: SessionPhase;
  /** ISO-8601 local time the venue next opens. `null` when already open. */
  reopensAt: string | null;
  /** Whole minutes until it reopens. `null` when already open. */
  reopensInMinutes: number | null;
  /**
   * What freshness means right now.
   *
   * `PAUSED` outside the session, never `STALE`. The clock has stopped because
   * the market has, and those are different facts with different remedies.
   */
  freshness: Extract<FreshnessState, "OK" | "PAUSED">;
}

function minuteOfDay(local: string): number {
  const [, hh = "0", mm = "0"] = /T(\d{2}):(\d{2})/.exec(local) ?? [];
  return Number(hh) * 60 + Number(mm);
}

function dateOf(local: string): string {
  return local.slice(0, 10);
}

function weekday(localDate: string): number {
  // Parsed as UTC deliberately: the string is already the venue's local date,
  // so shifting it by a zone offset would move a Monday into a Sunday for
  // exactly the venues this function exists to serve.
  return new Date(`${localDate}T00:00:00Z`).getUTCDay();
}

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function trades(calendar: VenueCalendar, localDate: string): boolean {
  if (calendar.holidays?.includes(localDate)) return false;
  return calendar.tradingDays.includes(weekday(localDate));
}

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * Where the venue is right now.
 *
 * `nowLocal` is the venue's own local time as an ISO-8601 string without a
 * zone suffix — the server sends it that way, and converting here would put
 * the answer at the mercy of the browser's clock settings on a screen whose
 * whole point is what the *venue* is doing.
 */
export function sessionState(nowLocal: string, calendar: VenueCalendar): SessionState {
  const today = dateOf(nowLocal);
  const minute = minuteOfDay(nowLocal);
  const { openMinute, closeMinute } = calendar.window;

  if (trades(calendar, today) && minute >= openMinute && minute < closeMinute) {
    return { phase: "OPEN", reopensAt: null, reopensInMinutes: null, freshness: "OK" };
  }

  // Before today's open counts as today; anything else searches forward. Ten
  // days is enough for any run of weekend plus holidays a venue publishes, and
  // failing to find one is reported rather than guessed at.
  let day = trades(calendar, today) && minute < openMinute ? today : addDays(today, 1);
  for (let i = 0; i < 10 && !trades(calendar, day); i += 1) day = addDays(day, 1);
  if (!trades(calendar, day)) {
    return {
      phase: "CLOSED_BY_CALENDAR",
      reopensAt: null,
      reopensInMinutes: null,
      freshness: "PAUSED",
    };
  }

  const reopensAt = `${day}T${hhmm(openMinute)}:00`;
  const dayGap =
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return {
    phase: "CLOSED_BY_CALENDAR",
    reopensAt,
    reopensInMinutes: Math.round(dayGap * 1440 + openMinute - minute),
    freshness: "PAUSED",
  };
}

/** `12h 40m`, as the wireframe prints it. */
export function formatUntil(minutes: number | null): string | null {
  if (minutes === null || minutes < 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Does a closure consume the observation window?
 *
 * No — and this is the rule the gate turns on. §13: *"gate counts TRADING
 * days — calendar closures don't consume the window."* A deployment that sat
 * through Tết has not observed those days, and counting them would promote an
 * alpha on a fortnight of closed markets.
 */
export function tradingDaysBetween(
  fromLocalDate: string,
  toLocalDate: string,
  calendar: VenueCalendar,
): number {
  let count = 0;
  let day = fromLocalDate;
  // Bounded so a bad input cannot spin; a year of sessions is far past any
  // observation window this gate uses.
  for (let i = 0; i < 400 && day <= toLocalDate; i += 1) {
    if (trades(calendar, day)) count += 1;
    day = addDays(day, 1);
  }
  return count;
}

/** The VN market, as the wireframe names it. */
export const VN_MARKET: VenueCalendar = {
  timezone: "Asia/Ho_Chi_Minh",
  label: "VN MARKET",
  window: { openMinute: 9 * 60, closeMinute: 14 * 60 + 45 },
  tradingDays: [1, 2, 3, 4, 5],
  // HOSE session structure: ATO auction, continuous, lunch break, continuous, ATC auction.
  phases: [
    { label: "ATO", kind: "auction", openMinute: 9 * 60, closeMinute: 9 * 60 + 15 },
    { label: "continuous", kind: "continuous", openMinute: 9 * 60 + 15, closeMinute: 11 * 60 + 30 },
    { label: "break", kind: "break", openMinute: 11 * 60 + 30, closeMinute: 13 * 60 },
    { label: "continuous", kind: "continuous", openMinute: 13 * 60, closeMinute: 14 * 60 + 30 },
    { label: "ATC", kind: "auction", openMinute: 14 * 60 + 30, closeMinute: 14 * 60 + 45 },
  ],
};
