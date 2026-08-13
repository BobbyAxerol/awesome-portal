import { describe, expect, it } from "vitest";

import { fmtDelta, fmtMoney, fmtPct, fmtRatio, fmtShortHash, fmtTimestamp } from "./format";

describe("format", () => {
  it("formats percents with sign", () => {
    expect(fmtPct(12.4, true)).toBe("+12.40%");
    expect(fmtPct(-3.1)).toBe("-3.10%");
    expect(fmtPct(null)).toBe("—");
  });

  it("formats deltas", () => {
    expect(fmtDelta(1.5)).toBe("+1.50%");
    expect(fmtDelta(-0.25)).toBe("-0.25%");
  });

  it("formats money with thousands separators", () => {
    expect(fmtMoney(1234567.8)).toBe("1,234,568");
    expect(fmtMoney(987.654)).toBe("987.65");
  });

  it("formats ratios", () => {
    expect(fmtRatio(1.23456)).toBe("1.23");
    expect(fmtRatio(Number.NaN)).toBe("—");
  });

  it("truncates hashes", () => {
    expect(fmtShortHash("0123456789abcdef", 8)).toBe("01234567");
    expect(fmtShortHash(null)).toBe("—");
  });

  it("formats UTC timestamps", () => {
    expect(fmtTimestamp("2024-01-01T00:00:00Z")).toBe("2024-01-01 00:00 UTC");
    expect(fmtTimestamp(null)).toBe("—");
  });
});
