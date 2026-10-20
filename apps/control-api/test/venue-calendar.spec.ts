import { describe, expect, it } from "vitest";
import { unpublishedVenueCalendar, venueCalendarFromSource } from "../src/execution/venue-calendar";
import { assertPublishedSchema, rejectsPublishedSchema } from "./stage-contract-validator";

const FAMILY = "execution-stage-facts.v1.schema.json";
const block = {
  timezone: "Asia/Ho_Chi_Minh", date: "2026-08-31", is_open: false,
  sessions: [{ name: "morning", open: "09:00", close: "11:30" }, { name: "afternoon", open: "13:00", close: "14:30" }],
};

describe("FE-070 VN market calendar", () => {
  it("is a typed absence in every member while no calendar source is wired", () => {
    const calendar = unpublishedVenueCalendar();
    for (const member of [calendar.timezone, calendar.windows, calendar.breaks, calendar.holidays, calendar.is_open, calendar.as_of]) {
      expect(member).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "N28_VENUE_CALENDAR_NOT_ACTIVE" });
    }
    assertPublishedSchema(FAMILY, "VenueCalendar", calendar);
  });

  it("publishes exactly what the source payload states, and derives the break only from the published windows", () => {
    const calendar = venueCalendarFromSource(block, "2026-08-31T01:00:00Z");
    expect(calendar.timezone.value).toBe("Asia/Ho_Chi_Minh");
    expect(calendar.windows.value).toEqual([
      { name: "morning", kind: "TRADING_SESSION", open: "09:00", close: "11:30" },
      { name: "afternoon", kind: "TRADING_SESSION", open: "13:00", close: "14:30" },
    ]);
    expect(calendar.breaks.value).toEqual([{ name: "BREAK", from: "11:30", to: "13:00", basis: "GAP_BETWEEN_PUBLISHED_WINDOWS" }]);
    expect(calendar.is_open).toEqual({ availability: "AVAILABLE", value: false, reason_code: null });
    // No auction and no holiday is added that the payload did not name.
    expect(calendar.windows.value!.some((window) => window.kind !== "TRADING_SESSION")).toBe(false);
    expect(calendar.holidays).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_HOLIDAY_LIST_NOT_PUBLISHED" });
    assertPublishedSchema(FAMILY, "VenueCalendar", calendar);
  });

  it("names ATO and ATC only when the source names them, and keeps its holidays", () => {
    const calendar = venueCalendarFromSource({
      ...block,
      sessions: [{ name: "ATO", open: "09:00", close: "09:15" }, { name: "continuous", open: "09:15", close: "14:30" }, { name: "ATC", open: "14:30", close: "14:45" }],
      holidays: [{ date: "2099-01-01", name: "TEST_ONLY" }, { date: "2099-01-02" }],
    }, "2026-08-31T01:00:00Z");
    expect(calendar.windows.value!.map((window) => window.kind)).toEqual(["OPENING_AUCTION", "TRADING_SESSION", "CLOSING_AUCTION"]);
    expect(calendar.breaks.value).toEqual([]);
    expect(calendar.holidays.value).toEqual([{ date: "2099-01-01", name: "TEST_ONLY" }, { date: "2099-01-02", name: null }]);
    assertPublishedSchema(FAMILY, "VenueCalendar", calendar);
  });

  it("never states is_open without an as_of, and never recomputes it", () => {
    const calendar = venueCalendarFromSource({ ...block, is_open: true }, null);
    expect(calendar.is_open).toEqual({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_IS_OPEN_NOT_PUBLISHED" });
    expect(calendar.as_of.reason_code).toBe("SOURCE_AS_OF_NOT_PUBLISHED");
    expect(venueCalendarFromSource({ ...block, is_open: "yes" }, "2026-08-31T01:00:00Z").is_open.availability).toBe("NOT_PUBLISHED");
  });

  it("refuses unordered, overlapping or malformed windows instead of repairing them", () => {
    for (const sessions of [
      [{ name: "b", open: "13:00", close: "14:30" }, { name: "a", open: "09:00", close: "11:30" }],
      [{ name: "a", open: "09:00", close: "12:00" }, { name: "b", open: "11:30", close: "14:30" }],
      [{ name: "a", open: "9:00", close: "11:30" }],
      [{ name: "a", open: "11:30", close: "09:00" }],
      [{ name: "", open: "09:00", close: "11:30" }],
    ]) {
      const calendar = venueCalendarFromSource({ ...block, sessions }, "2026-08-31T01:00:00Z");
      expect(calendar.windows.availability).toBe("NOT_PUBLISHED");
      expect(calendar.breaks.availability).toBe("NOT_PUBLISHED");
    }
    expect(venueCalendarFromSource({ ...block, sessions: [] }, null).windows.reason_code).toBe("SOURCE_SESSIONS_NOT_PUBLISHED");
    expect(venueCalendarFromSource({ ...block, timezone: "not a zone" }, null).timezone.reason_code).toBe("SOURCE_TIMEZONE_NOT_PUBLISHED");
    expect(venueCalendarFromSource({ ...block, holidays: [{ date: "2099-13-40" }] }, null).holidays.reason_code).toBe("SOURCE_HOLIDAY_LIST_INVALID");
    expect(venueCalendarFromSource(null, null).windows.reason_code).toBe("SOURCE_CALENDAR_PAYLOAD_INVALID");
  });

  it("is rejected by the schema when a member claims a value without being available", () => {
    const calendar = unpublishedVenueCalendar();
    expect(rejectsPublishedSchema(FAMILY, "VenueCalendar", { ...calendar, is_open: { availability: "NOT_PUBLISHED", value: false, reason_code: "X_Y" } })).toBe(true);
    expect(rejectsPublishedSchema(FAMILY, "VenueCalendar", { ...calendar, market: "CRYPTO" })).toBe(true);
  });
});
