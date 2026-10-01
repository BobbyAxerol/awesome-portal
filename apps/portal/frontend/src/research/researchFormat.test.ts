import { describe, expect, it } from "vitest";

import { claimToken, formatBytes, formatDuration, formatFractionAxis, formatMetric, formatUtc, groupDecimalString, shortDigest, shortId } from "./researchFormat";

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
    expect(formatFractionAxis(-0.00545)).toBe("−0.55%");
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

describe("E1 display rules (HiFi audit 2026-09-26)", () => {
  it("shortens a prefixed server id to prefix + 8, leaves labels alone, shortens bare digests", () => {
    expect(shortId("rrun_91f4b6acfda7c4eda62c34b407a52e13")).toBe("rrun_91f4b6ac");
    expect(shortId("ratt_0123")).toBe("ratt_0123");
    expect(shortId("R-WFO-118")).toBe("R-WFO-118");
    expect(shortId("sha256:3cbc794c16012ee0aa")).toBe("3cbc794c");
    expect(shortId(null)).toBeNull();
  });

  it("groups an exact decimal string digit for digit, never through a float", () => {
    expect(groupDecimalString("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(groupDecimalString("-1234567.000100")).toBe("-1,234,567.000100");
    expect(groupDecimalString("n/a")).toBe("n/a");
  });

  it("prints a claim as the server token in capitals and a boolean as YES / NO", () => {
    expect(claimToken("not_causal_multi_fold_global_calibration")).toBe("NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION");
    expect(claimToken(true)).toBe("YES");
    expect(claimToken(false)).toBe("NO");
  });
});
