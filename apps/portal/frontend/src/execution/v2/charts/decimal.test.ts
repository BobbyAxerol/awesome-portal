import { describe, expect, it } from "vitest";

import { compareDecimal, isNegativeDecimal, readChartDecimal, showDecimal, subtractDecimal } from "./decimal";

describe("compareDecimal", () => {
  it("orders values a float cannot tell apart", () => {
    expect(Number("100.000000000000001")).toBe(Number("100.000000000000002"));
    expect(compareDecimal("100.000000000000001", "100.000000000000002")).toBe(-1);
    expect(compareDecimal("100.000000000000002", "100.000000000000001")).toBe(1);
    expect(compareDecimal("12345678901234567890.12", "12345678901234567890.12")).toBe(0);
  });
  it("aligns scales and signs", () => {
    expect(compareDecimal("1.5", "1.50")).toBe(0);
    expect(compareDecimal("-1.5", "-1.49")).toBe(-1);
    expect(compareDecimal("-0.01", "0")).toBe(-1);
    expect(compareDecimal("2", "10")).toBe(-1);
  });
});

describe("subtractDecimal", () => {
  it("is exact where floats are not", () => {
    expect(0.3 - 0.1).not.toBe(0.2);
    expect(subtractDecimal("0.3", "0.1")).toBe("0.2");
    expect(subtractDecimal("100.35", "100.10")).toBe("0.25");
  });
  it("keeps sign, scale and large magnitudes", () => {
    expect(subtractDecimal("990.25", "1000.00")).toBe("-9.75");
    expect(subtractDecimal("5", "5")).toBe("0");
    expect(subtractDecimal("1.50", "1.5")).toBe("0.00");
    expect(subtractDecimal("12345678901234567890.12", "12345678901234567890.10")).toBe("0.02");
    expect(subtractDecimal("0.5", "-0.25")).toBe("0.75");
  });
});

describe("showDecimal", () => {
  it("renders through formatExact: money 2 dp floor, grouping, no abbreviation", () => {
    expect(showDecimal("1020.75")).toBe("1,020.75");
    expect(showDecimal("1000000")).toBe("1,000,000.00");
    expect(showDecimal("123456789.1234567891")).toBe("123,456,789.1235");
  });
  it("signs only a non-zero positive, and never signs a value that prints as zero", () => {
    expect(showDecimal("12.5", { signed: true })).toBe("+12.50");
    expect(showDecimal("-12.5", { signed: true })).toBe("-12.50");
    expect(showDecimal("0.00", { signed: true })).toBe("0.00");
  });
  it("appends the percent sign for pct and a currency when given", () => {
    expect(showDecimal("-12.3456", { unit: "pct" })).toBe("-12.3456%");
    expect(showDecimal("4332.5", { currency: "USDT" })).toBe("4,332.50 USDT");
  });
  it("returns an unreadable input verbatim rather than inventing a number", () => {
    expect(showDecimal("1e5")).toBe("1e5");
  });
});

describe("readChartDecimal", () => {
  it("refuses numbers, exponents, leading zeros and negative zero", () => {
    expect(readChartDecimal("12.50")).toBe("12.50");
    expect(readChartDecimal(12.5)).toBeNull();
    expect(readChartDecimal("1e5")).toBeNull();
    expect(readChartDecimal("007")).toBeNull();
    expect(readChartDecimal("-0.00")).toBeNull();
    expect(readChartDecimal(null)).toBeNull();
    expect(readChartDecimal("NaN")).toBeNull();
  });
  it("knows what is negative", () => {
    expect(isNegativeDecimal("-0.01")).toBe(true);
    expect(isNegativeDecimal("-0.00")).toBe(false);
    expect(isNegativeDecimal("3")).toBe(false);
  });
});
