import { describe, expect, it } from "vitest";

import { formatBytes, formatDuration, formatFractionAxis, formatMetric, formatUtc, shortDigest } from "./researchFormat";

describe("RF-06 FE-X-13 — display formatting never invents a number", () => {
  it("formats by unit and keeps absence as null", () => {
    expect(formatMetric("19965.998848845535", "currency")).toBe("19,966.00");
    expect(formatMetric("-0.001544941240185635450293621818514223089782795749", "fraction")).toBe("−0.15%");
    expect(formatMetric("0.284", "fraction")).toBe("+28.40%");
    expect(formatMetric("45", "count")).toBe("45");
    expect(formatMetric("2508", "bars")).toBe("2,508");
    expect(formatMetric(null, "currency")).toBeNull();
    expect(formatMetric("not a number", "fraction")).toBeNull();
  });

  it("formats axes, durations, times, digests and sizes", () => {
    expect(formatFractionAxis(-0.00545)).toBe("-0.55%");
    expect(formatDuration(8)).toBe("8s");
    expect(formatDuration(192)).toBe("3m 12s");
    expect(formatDuration(3840)).toBe("1h 04m");
    expect(formatUtc(Date.UTC(2026, 8, 24, 5, 3, 52, 137))).toBe("2026-09-24 05:03 UTC");
    expect(formatUtc("garbage")).toBeNull();
    expect(shortDigest("sha256:3cbc794c16012ee0aa")).toBe("3cbc794c");
    expect(formatBytes(6279)).toBe("6.1 KB");
    expect(formatBytes(402)).toBe("402 B");
  });
});
