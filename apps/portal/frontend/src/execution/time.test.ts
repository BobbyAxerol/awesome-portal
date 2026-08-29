import { describe, expect, it } from "vitest";

import { utcStamp } from "./time";

describe("utcStamp — datetime64[ms] display, UTC anchor (owner 2026-08-30)", () => {
  it("renders a Z instant as datetime64[ms] with the UTC anchor named", () => {
    expect(utcStamp("2026-08-22T12:00:20Z")).toBe("2026-08-22 12:00:20.000 UTC");
  });

  it("keeps real milliseconds instead of padding over them", () => {
    expect(utcStamp("2026-08-23T11:55:00.417Z")).toBe("2026-08-23 11:55:00.417 UTC");
  });

  it("leaves an offset-less venue-local instant without a zone label", () => {
    // VN session clock publishes no zone; inventing one would be a lie.
    expect(utcStamp("2026-08-21T14:45:00")).toBe("2026-08-21 14:45:00.000");
  });

  it("passes through strings that are not ISO instants (already-short clocks)", () => {
    expect(utcStamp("10:42:10")).toBe("10:42:10");
    expect(utcStamp("2026-08-22")).toBe("2026-08-22");
  });

  it("renders missing as em dash, never a fake time", () => {
    expect(utcStamp(null)).toBe("—");
    expect(utcStamp(undefined)).toBe("—");
  });
});
