/**
 * Reader conformance for `boundary.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * L0  the canonical decimals and metric states Codex published, verbatim.
 * L1  every state of `{state, value, reason}` (cartesian, 280 states) maps to
 *     the documented UI state: a published zero stays a value, a partial value
 *     is never toned, an absence never becomes 0 and an unknown state word
 *     never becomes a success.
 * L2  a budget for reading many metrics and for the largest decimal.
 * L3  negative payloads are refused (`null`) without a throw and without
 *     leaking the offending text.
 *
 * The oracle below is written from the contract in boundary.ts's header and
 * from the decimal grammar, not by calling the reader.
 */
import { afterAll, describe, expect, it } from "vitest";

import { formatAsOf, readAsOf, readDecimal, readMetric, type Metric } from "./boundary";
import { loadCanonical, canonicalDigest, schemaEnum } from "./testkit/loadCanonical";
import { ABSENT, cartesian, coverage, describeCoverage, dimension, dimensionOf, pairwise, type Draft } from "./testkit/matrix";
import {
  decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, stringCases,
} from "./testkit/negative";
import { cloneRows, pad, timed } from "./testkit/scale";

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_10K_METRICS_MS = 1500;
const BUDGET_HUGE_DECIMAL_MS = 400;

const FLEET = "execution-alpha-fleet-list.v2";
const digestBefore = canonicalDigest(FLEET);
afterAll(() => {
  // L0 is never edited: the file the suite read is the file it leaves behind.
  expect(canonicalDigest(FLEET)).toBe(digestBefore);
});

const fleet = loadCanonical<Draft>(FLEET);
const row = fleet.page.rows[0];
const netPnl: string = row.deployments[0].net_pnl;
const allocation: string = row.deployments[0].allocation;
const published: Record<string, { state: string; reason_code: string | null }> = row.metrics_availability;
const gapReason = published.equity_series_30d!.reason_code!;
const MONEY = { unit: "money" } as const;

/** The metric shape the V2 screens hand to `readMetric`, built from canonical values. */
const baseMetric = { state: "AVAILABLE", value: netPnl, reason_code: null };

const STATES = ["AVAILABLE", "PARTIAL", "UNAVAILABLE", "DENIED", "NOT_APPLICABLE"] as const;
const VALUES = [ABSENT, null, netPnl, `-${netPnl}`, "0", "0.00", "-0.000000001", "12345678901234567890.123456789"] as const;
const BAD_CODE = "not a code!";

const reasonSpellings = dimensionOf("reason", [
  { label: "none", apply: (d: Draft) => { delete d.reason_code; } },
  { label: "wire:null", apply: (d: Draft) => { d.reason_code = null; } },
  { label: "wire:code", apply: (d: Draft) => { d.reason_code = gapReason; } },
  { label: "camel:code", apply: (d: Draft) => { delete d.reason_code; d.reasonCode = gapReason; } },
  { label: "both:same", apply: (d: Draft) => { d.reason_code = gapReason; d.reasonCode = gapReason; } },
  { label: "both:differ", apply: (d: Draft) => { d.reason_code = gapReason; d.reasonCode = "OTHER_CODE"; } },
  { label: "wire:bad", apply: (d: Draft) => { d.reason_code = BAD_CODE; } },
]);
const DIMS = [
  dimension("state", ["state"], STATES),
  dimension("value", ["value"], VALUES, (v) => (v === ABSENT ? "absent" : v === null ? "null" : String(v))),
  reasonSpellings,
];

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const NEGATIVE_ZERO = /^-0+(?:\.0+)?$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function expectedKind(d: Draft): "value" | "absent" | "null" {
  const hasValue = d.value !== null && d.value !== undefined;
  const conflict = d.reason_code !== undefined && d.reasonCode !== undefined && d.reason_code !== d.reasonCode;
  const code = conflict ? null : (d.reason_code ?? d.reasonCode);
  const codeOk = typeof code === "string" && CODE.test(code);
  if (d.state === "AVAILABLE" || d.state === "PARTIAL") {
    return hasValue && typeof d.value === "string" && DECIMAL.test(d.value) && !NEGATIVE_ZERO.test(d.value) ? "value" : "null";
  }
  return !hasValue && codeOk ? "absent" : "null";
}

const WORD: Record<string, string> = { UNAVAILABLE: "Not available", DENIED: "Not permitted", NOT_APPLICABLE: "Not applicable" };

describe("L0 · canonical values through the boundary", () => {
  it("reads the published decimals exactly and keeps the original string", () => {
    for (const text of [netPnl, allocation, row.deployments[0].balance_total, row.deployments[0].balance_locked, "0"]) {
      const read = readDecimal(text, MONEY);
      expect(read, text).not.toBeNull();
      expect(read!.full).toBe(text);
    }
  });

  it("maps the published metric states to their documented words", () => {
    const available = readMetric({ state: "AVAILABLE", value: netPnl, reason_code: null }, MONEY);
    expect(available).toMatchObject({ kind: "value", partial: false, publishedZero: false });
    const unavailable = readMetric({ ...published.equity_series_30d }, MONEY);
    expect(unavailable).toEqual({ kind: "absent", state: "UNAVAILABLE", reasonCode: gapReason, copy: `Not available · ${gapReason}` });
  });

  it("reads the published instant", () => {
    const at = readAsOf(Date.parse(fleet.source_as_of));
    expect(at).toBe(Date.parse("2026-09-01T15:00:00Z"));
    expect(formatAsOf(at!)).toBe("1 Sep 15:00Z");
  });
});

describe("L1 · state matrix (state x value x reason spelling)", () => {
  const states = cartesian(baseMetric, DIMS);
  const pairs = pairwise(baseMetric, DIMS);
  const cover = coverage(DIMS, states);
  const pairCover = coverage(DIMS, pairs);

  it("prints the matrix size and proves the pairwise subset covers every pair", () => {
    console.info(describeCoverage("boundary.readMetric cartesian", cover));
    console.info(describeCoverage("boundary.readMetric pairwise", pairCover));
    expect(states).toHaveLength(5 * 8 * 7);
    expect(cover.pairsCovered).toBe(cover.pairsPossible);
    expect(pairCover.pairsCovered).toBe(pairCover.pairsPossible);
    expect(pairs.length).toBeLessThan(states.length);
    expect(new Set(states.map((s) => s.name)).size).toBe(states.length);
  });

  it("states derive from the canonical metric and never edit it", () => {
    expect(baseMetric).toEqual({ state: "AVAILABLE", value: netPnl, reason_code: null });
    expect(states[0]!.value).not.toBe(states[1]!.value);
  });

  const published = new Set(states.map((s) => expectedKind(s.value)));
  it("exercises all three outcomes", () => {
    expect([...published].sort()).toEqual(["absent", "null", "value"]);
  });

  describe.each(states.map((s) => [s.name, s.value] as const))("%s", (_name, input) => {
    const d = input as Draft;
    const answer: Metric | null = readMetric(input, MONEY);
    const want = expectedKind(d);

    it("answers the documented kind and never throws", () => {
      expect(() => readMetric(input, MONEY)).not.toThrow();
      expect(answer === null ? "null" : answer.kind).toBe(want);
    });

    it("keeps the UI state honest", () => {
      if (answer === null) return;
      if (answer.kind === "value") {
        expect(answer.partial).toBe(d.state === "PARTIAL");
        expect(answer.decimal.full).toBe(d.value);
        expect(answer.publishedZero).toBe(/^-?0+(\.0+)?$/.test(d.value));
        // Never partial -> green or red: a partial value is neutral, always.
        if (answer.partial) expect(answer.tone).toBe("neutral");
        // A number that prints as zero is never toned.
        if (!/[1-9]/.test(answer.decimal.display)) expect(answer.tone).toBe("neutral");
        else if (!answer.partial) expect(answer.tone).toBe(answer.decimal.display.startsWith("-") ? "negative" : "positive");
        expect(answer.decimal.display).not.toMatch(/\d\s?[kKmMbB]\b/);
        // A reason is carried only where the source gave a partial one.
        if (!answer.partial) expect(answer.reasonCode).toBeNull();
      } else {
        // Never absent -> 0: an absence has no decimal, and its copy is the state word plus the code.
        expect(answer).not.toHaveProperty("decimal");
        expect(answer.state).toBe(d.state);
        expect(answer.copy.startsWith(WORD[d.state]!)).toBe(true);
        expect(answer.copy).toContain(answer.reasonCode);
        expect(answer.copy).not.toMatch(/^\s*-?\d/);
      }
    });
  });

  it("the five state words are the only ones that read at all (never unknown -> success)", () => {
    for (const word of ["READY", "OK", "SUCCESS", "COMPLETE", "FRESH", "available", "AVAILABLE ", "Partial", "EMPTY", "UNKNOWN", ""]) {
      expect(readMetric({ state: word, value: netPnl, reason_code: gapReason }, MONEY), word).toBeNull();
      expect(readMetric({ state: word, value: null, reason_code: gapReason }, MONEY), word).toBeNull();
    }
  });

  it("a published exact zero stays a value and a tiny negative that prints 0 is neutral", () => {
    const zero = readMetric({ state: "AVAILABLE", value: "0.00", reason_code: null }, MONEY);
    expect(zero).toMatchObject({ kind: "value", publishedZero: true, tone: "neutral" });
    const tiny = readMetric({ state: "AVAILABLE", value: "-0.000000001", reason_code: null }, MONEY);
    expect(tiny).toMatchObject({ kind: "value", publishedZero: false });
    if (tiny?.kind === "value" && !/[1-9]/.test(tiny.decimal.display)) expect(tiny.tone).toBe("neutral");
  });
});

describe("L1 · readAsOf and the decimal unit axis", () => {
  it("accepts every safe epoch inside the date range and nothing beyond it", () => {
    for (const ms of [0, 1, -1, Date.parse(fleet.source_as_of), 8_640_000_000_000_000, -8_640_000_000_000_000]) {
      expect(readAsOf(ms), String(ms)).toBe(ms);
      expect(() => formatAsOf(readAsOf(ms)!)).not.toThrow();
    }
    for (const ms of [8_640_000_000_000_001, -8_640_000_000_000_001, 2 ** 53, 2 ** 53 - 1]) expect(readAsOf(ms), String(ms)).toBeNull();
  });

  it("reads every canonical decimal under every unit without a throw", () => {
    const decimals = [netPnl, allocation, "0", "0.00", "1", "-1", "0.5"];
    for (const unit of ["money", "qty", "pct", "ratio", "count"] as const) {
      for (const text of decimals) {
        const read = readDecimal(text, { unit });
        expect(read, `${unit} ${text}`).not.toBeNull();
        expect(read!.full).toBe(text);
      }
    }
  });

  it("the PARTIAL and DENIED words come from the schema vocabulary the screens share", () => {
    // MetricState in the fleet schema publishes AVAILABLE, EMPTY, UNAVAILABLE; EMPTY is not a reader state here.
    expect(schemaEnum("execution-alpha-fleet-list.v2", "/$defs/MetricState/properties/state")).toEqual(["AVAILABLE", "EMPTY", "UNAVAILABLE"]);
  });
});

describe("L2 · scale", () => {
  it("reads 10,000 metrics inside the stated budget", () => {
    const metrics = cloneRows(baseMetric, 10_000, (m, i) => {
      m.value = `${i}.${pad(i, 5)}`;
      m.state = STATES[i % STATES.length]!;
      if (m.state !== "AVAILABLE" && m.state !== "PARTIAL") { delete (m as Draft).value; (m as Draft).reason_code = gapReason; }
    });
    const { value: answers, ms } = timed(() => metrics.map((m) => readMetric(m, MONEY)));
    console.info(`boundary.readMetric 10,000 metrics: ${ms.toFixed(0)} ms (budget ${BUDGET_10K_METRICS_MS} ms)`);
    expect(answers.every((a) => a !== null)).toBe(true);
    expect(ms).toBeLessThan(BUDGET_10K_METRICS_MS);
  });

  it("a 5,000 digit decimal is answered inside the budget", () => {
    const { value, ms } = timed(() => readDecimal("9".repeat(5_000), MONEY));
    console.info(`boundary.readDecimal 5,000 digits: ${ms.toFixed(0)} ms, ${value === null ? "refused" : "read"}`);
    expect(ms).toBeLessThan(BUDGET_HUGE_DECIMAL_MS);
  });

  /*
   * DEFECT (formatExact.ts `group`, reached from boundary.readDecimal): the
   * thousands-grouping regex is quadratic. The published Decimal pattern has no
   * maxLength, so a 70,000 digit string is schema-valid and froze the reader
   * for 6.2 s (10k digits 130 ms, 40k digits 2.3 s). Either the reader refuses
   * a decimal longer than a stated bound or `group` goes linear. This test
   * documents the defect: it turns red when the defect is fixed, and then the
   * `.fails` must be removed.
   */
  it.fails("DEFECT: a 30,000 digit decimal is answered inside the budget", () => {
    const { ms } = timed(() => readDecimal("9".repeat(30_000), MONEY));
    expect(ms).toBeLessThan(500);
  });
});

describe("L3 · negative", () => {
  const dec = decimalCases(baseMetric, ["value"]).filter((c) => c.category !== "huge-string");
  const states = enumCases(baseMetric, ["state"], STATES);
  const missing = requiredCases(baseMetric, [["state"], ["value"]]);
  const reasonOnAbsent = [
    ...stringCases({ state: "UNAVAILABLE", reason_code: gapReason }, ["reason_code"]).filter((c) => c.category !== "huge-string" || c.name.includes("70000")),
  ];

  it("reports the case counts", () => {
    console.info(`boundary L3: ${dec.length} decimal, ${states.length} enum, ${missing.length} required, ${reasonOnAbsent.length} reason, ${rootCases().length} root cases`);
    expect(dec.length + states.length + missing.length + reasonOnAbsent.length).toBeGreaterThan(80);
  });

  it.each(dec.map((c) => [c.name, c] as const))("decimal · %s is refused", (_name, c) => {
    const answer = readMetric(c.value, MONEY);
    expect(answer).toBeNull();
    expect(leaked(answer, c.probe)).toBe(false);
  });

  it.each(dec.map((c) => [c.name, c] as const))("decimal · %s is refused by readDecimal too", (_name, c) => {
    const injected = (c.value as Draft).value;
    expect(() => readDecimal(injected, MONEY)).not.toThrow();
    expect(readDecimal(injected, MONEY)).toBeNull();
  });

  it.each(states.filter((c) => c.category !== "huge-string").map((c) => [c.name, c] as const))("state · %s reads as nothing", (_name, c) => {
    expect(readMetric(c.value, MONEY)).toBeNull();
  });

  it("a 70,000 char state word reads as nothing", () => {
    const huge = states.find((c) => c.category === "huge-string")!;
    expect(readMetric(huge.value, MONEY)).toBeNull();
  });

  it.each(missing.map((c) => [c.name, c] as const))("required · %s reads as nothing", (_name, c) => {
    expect(readMetric(c.value, MONEY)).toBeNull();
  });

  it.each(reasonOnAbsent.map((c) => [c.name, c] as const))("reason on an absence · %s reads as nothing", (_name, c) => {
    const answer = readMetric(c.value, MONEY);
    expect(answer).toBeNull();
  });

  it("an absence that also carries a value is refused, whatever the state", () => {
    for (const state of ["UNAVAILABLE", "DENIED", "NOT_APPLICABLE"]) {
      expect(readMetric({ state, value: "0", reason_code: gapReason }, MONEY), state).toBeNull();
      expect(readMetric({ state, value: netPnl, reason_code: gapReason }, MONEY), state).toBeNull();
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readMetric(c.value, MONEY)).not.toThrow();
    expect(readMetric(c.value, MONEY)).toBeNull();
    // 0 and 1 are valid epoch milliseconds, so only the other roots must read as no instant.
    if (typeof c.value !== "number") expect(readAsOf(c.value)).toBeNull();
    expect(readDecimal(c.value, MONEY)).toBeNull();
  });

  it.each(pollutionCases(baseMetric, [[]]).map((c) => [c.name, c] as const))("%s neither throws, leaks nor pollutes", (_name, c) => {
    const answer = readMetric(c.value, MONEY);
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
  });

  it.each(integerCases({ asOf: 1 }, ["asOf"]).map((c) => [c.name, c] as const))("asOf · %s", (_name, c) => {
    const injected = (c.value as Draft).asOf;
    expect(() => readAsOf(injected)).not.toThrow();
    const at = readAsOf(injected);
    // Only a safe integer inside the date range may be an instant.
    if (at !== null) {
      expect(Number.isSafeInteger(injected)).toBe(true);
      expect(Math.abs(injected)).toBeLessThanOrEqual(8_640_000_000_000_000);
    }
  });
});
