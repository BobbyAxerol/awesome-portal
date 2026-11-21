/**
 * VN market session calendar for the VN market Paper workbench (FE-070, BE-P2).
 *
 * The repository holds NO trading-calendar source of truth: the only calendar
 * capability (`venues.calendar`, adapter `portal.execution.data-layer-session-calendar.v1`,
 * `GET /v1/control/session-calendar` on the market-data layer) is SOURCE_DARK and
 * unwired. So the workbench publishes every member as a typed NOT_PUBLISHED
 * fact. `venueCalendarFromSource` is the already-typed mapping for the day that
 * payload is wired; it publishes only what the payload states and never adds
 * a window, an auction or a holiday of its own, nor infers an open/paused
 * state from clock arithmetic.
 */
import { available, Fact, missing } from "./stage-facts";

export const VENUE_CALENDAR_VERSION = "execution.venue-calendar.v1" as const;
export const VENUE_CALENDAR_NOT_ACTIVE = "N28_VENUE_CALENDAR_NOT_ACTIVE";

export interface VenueWindow { name: string; kind: "TRADING_SESSION" | "OPENING_AUCTION" | "CLOSING_AUCTION"; open: string; close: string }
export interface VenueBreak { name: "BREAK"; from: string; to: string; basis: "GAP_BETWEEN_PUBLISHED_WINDOWS" }
export interface VenueHoliday { date: string; name: string | null }

export interface VenueCalendar {
  schema_version: typeof VENUE_CALENDAR_VERSION;
  market: "VN_EQUITY";
  basis: "SOURCE_SESSION_CALENDAR_NOT_A_CLIENT_INFERENCE";
  timezone: Fact<string>;
  windows: Fact<VenueWindow[]>;
  breaks: Fact<VenueBreak[]>;
  holidays: Fact<VenueHoliday[]>;
  is_open: Fact<boolean>;
  as_of: Fact<string>;
}

const CLOCK = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const TIMEZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2}$/;
const DATE = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;
const validDate = (value: string): boolean => DATE.test(value) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const validName = (value: unknown, maximum: number): value is string => typeof value === "string" &&
  value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 128 || !TIMEZONE.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

export function unpublishedVenueCalendar(reason: string = VENUE_CALENDAR_NOT_ACTIVE): VenueCalendar {
  return {
    schema_version: VENUE_CALENDAR_VERSION, market: "VN_EQUITY", basis: "SOURCE_SESSION_CALENDAR_NOT_A_CLIENT_INFERENCE",
    timezone: missing(reason), windows: missing(reason), breaks: missing(reason), holidays: missing(reason),
    is_open: missing(reason), as_of: missing(reason),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function kindOf(name: string): VenueWindow["kind"] {
  // Only the exchange's own auction names are auctions; "morning" / "afternoon" are generic sessions.
  const upper = name.trim().toUpperCase();
  return upper === "ATO" ? "OPENING_AUCTION" : upper === "ATC" ? "CLOSING_AUCTION" : "TRADING_SESSION";
}

/**
 * Map one market block of the data-layer session-calendar payload
 * (`{timezone, date, is_open, sessions:[{name, open, close}], holidays?:[{date, name?}]}`).
 * Anything malformed stays NOT_PUBLISHED with its own reason; nothing is repaired.
 */
export function venueCalendarFromSource(block: unknown, asOf: string | null): VenueCalendar {
  if (!isRecord(block)) return unpublishedVenueCalendar("SOURCE_CALENDAR_PAYLOAD_INVALID");
  const timezone = validTimezone(block.timezone) ? available(block.timezone) : missing<string>("SOURCE_TIMEZONE_NOT_PUBLISHED");

  let windows: Fact<VenueWindow[]> = missing("SOURCE_SESSIONS_NOT_PUBLISHED");
  let breaks: Fact<VenueBreak[]> = missing("SOURCE_SESSIONS_NOT_PUBLISHED");
  if (Array.isArray(block.sessions) && block.sessions.length > 0 && block.sessions.length <= 12) {
    const parsed: VenueWindow[] = [];
    let valid = true;
    for (const item of block.sessions) {
      if (!isRecord(item) || !validName(item.name, 64) ||
          typeof item.open !== "string" || typeof item.close !== "string" ||
          !CLOCK.test(item.open) || !CLOCK.test(item.close) || item.open >= item.close) { valid = false; break; }
      parsed.push({ name: item.name, kind: kindOf(item.name), open: item.open, close: item.close });
    }
    // Windows must be strictly ordered and non-overlapping to be called a calendar.
    const ordered = valid && parsed.every((window, index) => index === 0 || parsed[index - 1].close <= window.open);
    if (valid && ordered) {
      windows = available(parsed);
      const gaps: VenueBreak[] = [];
      for (let index = 1; index < parsed.length; index += 1) {
        if (parsed[index - 1].close < parsed[index].open) {
          gaps.push({ name: "BREAK", from: parsed[index - 1].close, to: parsed[index].open, basis: "GAP_BETWEEN_PUBLISHED_WINDOWS" });
        }
      }
      breaks = available(gaps);
    } else {
      windows = missing("SOURCE_SESSIONS_NOT_ORDERED_OR_INVALID");
      breaks = missing("SOURCE_SESSIONS_NOT_ORDERED_OR_INVALID");
    }
  }

  let holidays: Fact<VenueHoliday[]> = missing("SOURCE_HOLIDAY_LIST_NOT_PUBLISHED");
  if (Array.isArray(block.holidays) && block.holidays.length <= 400) {
    const list: VenueHoliday[] = [];
    for (const item of block.holidays) {
      if (!isRecord(item) || typeof item.date !== "string" || !validDate(item.date)) { list.length = 0; break; }
      list.push({ date: item.date, name: validName(item.name, 128) ? item.name : null });
    }
    holidays = list.length === block.holidays.length ? available(list) : missing("SOURCE_HOLIDAY_LIST_INVALID");
  }

  const stamp = asOf !== null && Number.isFinite(Date.parse(asOf)) ? available(new Date(Date.parse(asOf)).toISOString()) : missing<string>("SOURCE_AS_OF_NOT_PUBLISHED");
  // is_open is the source's own statement, valid only beside an as_of; never recomputed from windows.
  const isOpen = typeof block.is_open === "boolean" && stamp.availability === "AVAILABLE" ? available(block.is_open) : missing<boolean>("SOURCE_IS_OPEN_NOT_PUBLISHED");
  return { schema_version: VENUE_CALENDAR_VERSION, market: "VN_EQUITY", basis: "SOURCE_SESSION_CALENDAR_NOT_A_CLIENT_INFERENCE", timezone, windows, breaks, holidays, is_open: isOpen, as_of: stamp };
}
