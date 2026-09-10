import { describe, expect, it } from "vitest";

import { utcStamp } from "./time";

describe("utcStamp — second-resolution display, UTC anchor (owner 2026-09-08)", () => {
  it("renders a Z instant as datetime64[ms] with the UTC anchor named", () => {
    expect(utcStamp("2026-08-22T12:00:20Z")).toBe("2026-08-22 12:00:20 UTC");
  });

  it("keeps real milliseconds instead of padding over them", () => {
    expect(utcStamp("2026-08-23T11:55:00.417Z")).toBe("2026-08-23 11:55:00 UTC");
  });

  it("renders v2 UTC epoch milliseconds through the same formatter", () => {
    expect(utcStamp(Date.UTC(2026, 7, 22, 12, 0, 20, 417))).toBe("2026-08-22 12:00:20 UTC");
  });

  it("leaves an offset-less venue-local instant without a zone label", () => {
    // VN session clock publishes no zone; inventing one would be a lie.
    expect(utcStamp("2026-08-21T14:45:00")).toBe("2026-08-21 14:45:00");
  });

  it("passes through strings that are not ISO instants (already-short clocks)", () => {
    expect(utcStamp("10:42:10")).toBe("10:42:10");
    expect(utcStamp("2026-08-22")).toBe("2026-08-22");
  });

  it("says the time was not published, never a dash and never a fake time", () => {
    expect(utcStamp(null)).toBe("not published");
    expect(utcStamp(undefined)).toBe("not published");
  });
});
