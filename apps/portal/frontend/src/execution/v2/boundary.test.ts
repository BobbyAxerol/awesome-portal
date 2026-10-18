import { describe, expect, it } from "vitest";
import { formatAsOf, readAsOf, readDecimal, readMetric, type Metric } from "./boundary";

const money = { unit: "money" } as const;

function mustValue(metric: Metric | null) {
  if (metric === null || metric.kind !== "value") throw new Error("expected a value metric");
  return metric;
}

function mustAbsent(metric: Metric | null) {
  if (metric === null || metric.kind !== "absent") throw new Error("expected an absent metric");
  return metric;
}

describe("readDecimal", () => {
  it.each([
    ["0", "0.00"],
    ["0.00", "0.00"],
    ["12", "12.00"],
    ["-12.5", "-12.50"],
    ["1234567.891", "1,234,567.891"],
    ["0.5", "0.50"],
  ])("reads the exact string %s and displays %s", (input, display) => {
    const read = readDecimal(input, money);
    if (read === null) throw new Error(`rejected ${input}`);
    expect(read.display).toBe(display);
    expect(read.full).toBe(input);
  });

  it("keeps a 29-digit value exact and never abbreviates", () => {
    const text = "12345678901234567890.123456789";
    const read = readDecimal(text, money);
    if (read === null) throw new Error("rejected a long exact decimal");
    expect(read.full).toBe(text);
    expect(read.display).toBe("12,345,678,901,234,567,890.1235");
    expect(read.display).not.toMatch(/[kKmMbB]/);
  });

  it.each([
    ["a JS number", 12.5],
    ["zero as a number", 0],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["null", null],
    ["undefined", undefined],
    ["an array", ["1"]],
    ["an object", { value: "1" }],
    ["a boolean", true],
    ["a bigint", 10n],
    ["empty text", ""],
    ["spaces", " 1"],
    ["trailing spaces", "1 "],
    ["an exponent", "1e3"],
    ["an upper exponent", "1E3"],
    ["a negative zero", "-0"],
    ["a negative zero with scale", "-0.00"],
    ["a leading zero", "01"],
    ["a leading zero with scale", "00.5"],
    ["a plus sign", "+1"],
    ["a bare fraction", ".5"],
    ["a bare point", "1."],
    ["a thousands comma", "1,000"],
    ["a word", "not published"],
    ["hex", "0x10"],
    ["a dash", "-"],
    ["a placeholder dash", "—"],
  ])("rejects %s", (_name, input) => {
    expect(readDecimal(input, money)).toBeNull();
  });

  it("flags zero by the exact string, not by the display", () => {
    const zero = readDecimal("0.00", money);
    if (zero === null) throw new Error("rejected a published zero");
    expect(zero.zero).toBe(true);
    expect(zero.tone).toBe("neutral");
    const tiny = readDecimal("0.0000000001", { unit: "pct" });
    if (tiny === null) throw new Error("rejected a tiny pct");
    // Displays as 0.00 but the source did not publish zero.
    expect(tiny.zero).toBe(false);
    expect(tiny.tone).toBe("neutral");
  });

  it("tones by the sign of what is printed", () => {
    expect(readDecimal("5.25", money)?.tone).toBe("positive");
    expect(readDecimal("-5.25", money)?.tone).toBe("negative");
  });

  it("applies the unit class and the instrument precision", () => {
    expect(readDecimal("0.1230", { unit: "pct" })?.display).toBe("0.123");
    expect(readDecimal("1.50000000", { unit: "qty", dp: 3 })?.display).toBe("1.5");
    expect(readDecimal("42", { unit: "count" })?.display).toBe("42");
  });

  it("never throws on hostile input", () => {
    const hostile: unknown[] = [Symbol("x"), () => 1, new Date(0), Object.create(null), { toString: () => "1" }];
    for (const input of hostile) expect(() => readDecimal(input, money)).not.toThrow();
    expect(hostile.map((input) => readDecimal(input, money))).toEqual(hostile.map(() => null));
  });
});

describe("readMetric", () => {
  it("reads AVAILABLE as a plain toned value", () => {
    const metric = mustValue(readMetric({ state: "AVAILABLE", value: "-1250.5", reason_code: null }, money));
    expect(metric.partial).toBe(false);
    expect(metric.decimal.display).toBe("-1,250.50");
    expect(metric.tone).toBe("negative");
    expect(metric.publishedZero).toBe(false);
  });

  it("keeps a published 0.00 as a value and says so", () => {
    const metric = mustValue(readMetric({ state: "AVAILABLE", value: "0.00" }, money));
    expect(metric.publishedZero).toBe(true);
    expect(metric.decimal.display).toBe("0.00");
    expect(metric.tone).toBe("neutral");
  });

  it.each(["12.5", "-12.5", "0.00"])("never gives a PARTIAL %s a sign tone", (value) => {
    const metric = mustValue(readMetric({ state: "PARTIAL", value, reason_code: "FEES_MISSING" }, money));
    expect(metric.partial).toBe(true);
    expect(metric.tone).toBe("neutral");
    expect(metric.reasonCode).toBe("FEES_MISSING");
  });

  it.each(["UNAVAILABLE", "DENIED", "NOT_APPLICABLE"] as const)("reads %s as an absence built from its reason_code", (state) => {
    const metric = mustAbsent(readMetric({ state, value: null, reason_code: "SOURCE_NOT_QUALIFIED" }, money));
    expect(metric.state).toBe(state);
    expect(metric.reasonCode).toBe("SOURCE_NOT_QUALIFIED");
    expect(metric.copy).toContain("SOURCE_NOT_QUALIFIED");
  });

  it("derives different copy from different codes and states, with nothing invented", () => {
    const a = mustAbsent(readMetric({ state: "UNAVAILABLE", reason_code: "CODE_A" }, money));
    const b = mustAbsent(readMetric({ state: "UNAVAILABLE", reason_code: "CODE_B" }, money));
    const denied = mustAbsent(readMetric({ state: "DENIED", reason_code: "CODE_A" }, money));
    expect(a.copy).toBe("Not available · CODE_A");
    expect(b.copy).toBe("Not available · CODE_B");
    expect(denied.copy).toBe("Not permitted · CODE_A");
    expect(mustAbsent(readMetric({ state: "NOT_APPLICABLE", reason_code: "X1" }, money)).copy).toBe("Not applicable · X1");
  });

  it("accepts the camelCase MetricState spelling and refuses disagreeing spellings", () => {
    expect(mustAbsent(readMetric({ state: "UNAVAILABLE", reasonCode: "CODE_A" }, money)).reasonCode).toBe("CODE_A");
    expect(readMetric({ state: "UNAVAILABLE", reason_code: "CODE_A", reasonCode: "CODE_B" }, money)).toBeNull();
  });

  it.each([
    ["AVAILABLE without a value", { state: "AVAILABLE", value: null }],
    ["AVAILABLE with the key missing", { state: "AVAILABLE" }],
    ["PARTIAL without a value", { state: "PARTIAL", reason_code: "FEES_MISSING" }],
    ["AVAILABLE with a numeric value", { state: "AVAILABLE", value: 12.5 }],
    ["AVAILABLE with a numeric zero", { state: "AVAILABLE", value: 0 }],
    ["AVAILABLE with an exponent", { state: "AVAILABLE", value: "1e3" }],
    ["AVAILABLE with a negative zero", { state: "AVAILABLE", value: "-0" }],
    ["AVAILABLE with a leading zero", { state: "AVAILABLE", value: "01" }],
    ["AVAILABLE with empty text", { state: "AVAILABLE", value: "" }],
    ["UNAVAILABLE carrying a value", { state: "UNAVAILABLE", value: "1.00", reason_code: "X1" }],
    ["UNAVAILABLE carrying a published zero", { state: "UNAVAILABLE", value: "0.00", reason_code: "X1" }],
    ["UNAVAILABLE carrying a numeric zero", { state: "UNAVAILABLE", value: 0, reason_code: "X1" }],
    ["DENIED carrying a value", { state: "DENIED", value: "1.00", reason_code: "X1" }],
    ["NOT_APPLICABLE carrying a value", { state: "NOT_APPLICABLE", value: "1.00", reason_code: "X1" }],
    ["UNAVAILABLE without a reason", { state: "UNAVAILABLE", value: null }],
    ["DENIED with a null reason", { state: "DENIED", value: null, reason_code: null }],
    ["NOT_APPLICABLE with an empty reason", { state: "NOT_APPLICABLE", reason_code: "" }],
    ["a reason with spaces", { state: "UNAVAILABLE", reason_code: "source not ready" }],
    ["a numeric reason", { state: "UNAVAILABLE", reason_code: 404 }],
    ["an unknown state", { state: "READY", value: "1.00" }],
    ["a lower-case state", { state: "available", value: "1.00" }],
    ["a missing state", { value: "1.00" }],
    ["a numeric state", { state: 1, value: "1.00" }],
    ["an array", ["AVAILABLE", "1.00"]],
    ["a string", "AVAILABLE"],
    ["a number", 0],
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
  ])("rejects %s", (_name, input) => {
    expect(readMetric(input, money)).toBeNull();
  });

  it("never throws on hostile input", () => {
    const hostile: unknown[] = [Symbol("x"), () => 1, new Date(0), Object.create(null), 10n, new Proxy({}, {})];
    for (const input of hostile) expect(() => readMetric(input, money)).not.toThrow();
  });

  it("property: no input shape turns an absence into a numeric 0 or a value", () => {
    const states = ["UNAVAILABLE", "DENIED", "NOT_APPLICABLE"];
    const values: unknown[] = [undefined, null, 0, -0, "0", "0.00", "-0", "", "1.00", Number.NaN, [], {}, false];
    const reasons: unknown[] = [undefined, null, 0, "", "SOURCE_GAP", "bad code", ["SOURCE_GAP"]];
    let absences = 0;
    for (const state of states) {
      for (const value of values) {
        for (const reason of reasons) {
          const result = readMetric({ state, value, reason_code: reason }, money);
          if (result === null) continue;
          if (result.kind !== "absent") throw new Error(`${state}/${String(value)} became a value`);
          absences += 1;
          // The absent shape has no decimal at all, and no number anywhere in it.
          expect(Object.keys(result).sort()).toEqual(["copy", "kind", "reasonCode", "state"]);
          expect(Object.values(result).filter((field) => typeof field === "number")).toEqual([]);
          expect(result.copy).not.toMatch(/\b0(\.0+)?\b/);
        }
      }
    }
    // Only the value-less, reason-bearing rows survive: 3 states x (undefined, null) x one valid reason.
    expect(absences).toBe(6);
  });

  it("property: PARTIAL never carries a sign tone for any decimal", () => {
    const decimals = ["-1", "1", "-0.01", "0.01", "0", "0.00", "-12345678901234567890.123456789"];
    for (const value of decimals) {
      const metric = mustValue(readMetric({ state: "PARTIAL", value }, money));
      expect(metric.tone).toBe("neutral");
    }
  });
});

describe("readAsOf and formatAsOf", () => {
  it("reads safe integer epoch milliseconds only", () => {
    const at = Date.UTC(2026, 9, 17, 9, 14, 59);
    expect(readAsOf(at)).toBe(at);
    expect(readAsOf(0)).toBe(0);
    for (const input of ["1760692499000", 1.5, Number.NaN, null, undefined, [], {}, "2026-10-17T09:14:00Z", 8_640_000_000_000_001]) {
      expect(readAsOf(input)).toBeNull();
    }
  });

  it("formats UTC in the house style", () => {
    const at = readAsOf(Date.UTC(2026, 9, 17, 9, 14, 59));
    if (at === null) throw new Error("unreadable instant");
    expect(formatAsOf(at)).toBe("17 Oct 09:14Z");
    const early = readAsOf(Date.UTC(2026, 0, 5, 0, 3));
    if (early === null) throw new Error("unreadable instant");
    expect(formatAsOf(early)).toBe("5 Jan 00:03Z");
  });
});
