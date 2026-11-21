// @vitest-environment node
/**
 * QA10 N9a-05: in the preview the world clock moves by whole days (28 Oct instead of 17 Oct) and a screen's candle window is built in THAT frame
 * (fills +/- hours). The bars end at the as-of of the frame the request is in, cover the requested window up to it, and the count is the bars listed.
 */
import { describe, expect, it } from "vitest";
import { clampVenueCandles } from "../../../fixture-bff/review-manager";

const HOUR = 3_600_000;
const body = (from: number, to: number) => ({
  state: "READY", interval_ms: HOUR, coverage: { from_ms: from, to_ms: to, returned_count: 0 },
  candles: Array.from({ length: Math.floor((to - from) / HOUR) + 1 }, (_, i) => ({ t: from + i * HOUR, close_t: from + (i + 1) * HOUR - 1, o: "66000.00", h: "66100.00", l: "65900.00", c: "66050.00" })),
});

describe("venue bars end at the as-of of the request's frame", () => {
  const asOf = Date.UTC(2026, 9, 28, 12, 4); // a preview clock eleven days after the world's
  it("a window ending at the as-of keeps every bar up to the one holding it", () => {
    const from = Date.UTC(2026, 9, 27, 14), to = asOf;
    const out = clampVenueCandles({ status: 200, body: body(from, to) }, asOf).body as { candles: { t: number; c: string }[]; coverage: { returned_count: number } };
    expect(out.candles.at(-1)!.t).toBe(Date.UTC(2026, 9, 28, 12));
    expect(out.coverage.returned_count).toBe(out.candles.length);
    expect(out.candles.at(-1)!.c).toBe("66470.50");
  });
  it("a window that reaches past the as-of drops the later bars; one entirely after it is served ending at the as-of", () => {
    const past = clampVenueCandles({ status: 200, body: body(Date.UTC(2026, 9, 28, 7), Date.UTC(2026, 9, 28, 18)) }, asOf).body as { candles: { t: number }[] };
    expect(past.candles.every((c) => c.t <= asOf)).toBe(true);
    const ahead = clampVenueCandles({ status: 200, body: body(Date.UTC(2026, 9, 28, 14), Date.UTC(2026, 9, 29, 8)) }, asOf).body as { candles: { t: number }[]; coverage: { returned_count: number } };
    expect(ahead.candles.length).toBeGreaterThan(0);
    expect(ahead.coverage.returned_count).toBe(ahead.candles.length);
    expect(ahead.candles.at(-1)!.t).toBe(Date.UTC(2026, 9, 28, 12));
  });
});
