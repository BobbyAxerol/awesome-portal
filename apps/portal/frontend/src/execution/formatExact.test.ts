import { describe, expect, it } from "vitest";
import { formatExact, formatExactMoney } from "./formatExact";

describe("formatExact display authority (P4-B / F8)", () => {
  it("keeps the exact original untouched in full and groups thousands for display", () => {
    const result = formatExact("22220000", "money");
    expect(result).toEqual({ display: "22,220,000.00", full: "22220000" });
  });

  it("rounds money to the class scale half-up without floats", () => {
    expect(formatExact("20123.19605", "money", { dp: 2 }).display).toBe("20,123.20");
    expect(formatExact("-0.005", "money", { dp: 2 }).display).toBe("-0.01");
    expect(formatExact("0.004", "money", { dp: 2 }).display).toBe("0.00");
  });

  it("trims trailing zeros only down to the class floor", () => {
    expect(formatExact("30000.500000", "money").display).toBe("30,000.50");
    expect(formatExact("1.5000", "qty").display).toBe("1.5");
    expect(formatExact("7", "qty").display).toBe("7");
    expect(formatExact("0.1230", "pct").display).toBe("0.123");
    expect(formatExact("0.1", "pct").display).toBe("0.10");
  });

  it("never abbreviates and returns non-decimals verbatim", () => {
    // Grouped, never k/M. Four decimals is the money class's display cap
    // (owner, 2026-09-08); the exact original stays in `full`.
    const big = formatExact("123456789.987654321", "money");
    expect(big.display).toBe("123,456,789.9877");
    expect(big.full).toBe("123456789.987654321");
    expect(formatExact("not published", "money")).toEqual({ display: "not published", full: "not published" });
  });

  it("keeps a small value's own scale rather than rounding it away to zero", () => {
    // A fee of 0.00001234 is a real figure. Four places would print 0.0000,
    // which is the null-renders-as-zero failure this surface bans.
    expect(formatExact("0.00001234", "money").display).toBe("0.00001234");
    expect(formatExact("0.0595", "money").display).toBe("0.0595");
    // A value that really is zero still reads as zero.
    expect(formatExact("0", "money").display).toBe("0.00");
    // The rescue reaches eight places and no further: below that the display
    // cannot hold the figure at all, and the exact original in `full` is the
    // only place it survives. Saying so here so the limit is known, not found.
    expect(formatExact("0.000000001", "money")).toEqual({ display: "0.00", full: "0.000000001" });
  });

  it("carries the currency beside the display while full keeps the exact pair", () => {
    expect(formatExactMoney("30000", "USDT")).toEqual({ display: "30,000.00 USDT", full: "30000 USDT" });
  });

  it("keeps a negative zero honest", () => {
    expect(formatExact("-0.000", "qty").display).toBe("0");
  });
});
