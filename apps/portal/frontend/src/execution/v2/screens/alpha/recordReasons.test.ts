/**
 * The reason words for the scoped record and identity vocabularies: every code the readers admit has one sentence, a code they do
 * not admit has none (the cell then prints the plain word), and no sentence repeats a code or tells the reader what to do.
 */
import { describe, expect, it } from "vitest";

import { DEPLOYMENT_FINANCIAL_REASONS, IDENTITY_ABSENCE_REASONS } from "../../readers/alphaResourceScoped";
import { TIME_REASONS } from "../../readers/subjectRecordsScoped";
import { BASIS_TEXT, FINANCIAL_REASON_TEXT, IDENTITY_REASON_TEXT, TIME_REASON_TEXT, financialReasonText, identityReasonText, timeReasonText } from "./recordReasons";

describe("record reasons", () => {
  it("every admitted code has exactly one sentence, and the tables hold no code the readers do not admit", () => {
    expect(Object.keys(TIME_REASON_TEXT).sort()).toEqual([...TIME_REASONS].sort());
    expect(Object.keys(IDENTITY_REASON_TEXT).sort()).toEqual([...IDENTITY_ABSENCE_REASONS].sort());
    expect(Object.keys(FINANCIAL_REASON_TEXT).sort()).toEqual([...DEPLOYMENT_FINANCIAL_REASONS].sort());
    for (const code of TIME_REASONS) expect(timeReasonText(code)).toBe(TIME_REASON_TEXT[code]);
    for (const code of IDENTITY_ABSENCE_REASONS) expect(identityReasonText(code)).toBe(IDENTITY_REASON_TEXT[code]);
    for (const code of DEPLOYMENT_FINANCIAL_REASONS) expect(financialReasonText(code)).toBe(FINANCIAL_REASON_TEXT[code]);
  });

  it("an unknown, empty or inherited name has no sentence", () => {
    for (const code of ["NOT_A_CODE", "", "constructor", "__proto__", "toString"]) {
      expect(timeReasonText(code)).toBeNull();
      expect(identityReasonText(code)).toBeNull();
      expect(financialReasonText(code)).toBeNull();
    }
    expect(timeReasonText(null)).toBeNull();
    expect(timeReasonText(undefined)).toBeNull();
    expect(financialReasonText(null)).toBeNull();
  });

  it("no sentence carries a code, an instruction or a trailing full stop", () => {
    const all = [...Object.values(TIME_REASON_TEXT), ...Object.values(IDENTITY_REASON_TEXT), ...Object.values(FINANCIAL_REASON_TEXT), ...Object.values(BASIS_TEXT)];
    for (const text of all) {
      expect(text).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
      expect(text).not.toMatch(/\b(please|try|click|retry)\b/i);
      expect(text.endsWith(".")).toBe(false);
    }
  });
});
