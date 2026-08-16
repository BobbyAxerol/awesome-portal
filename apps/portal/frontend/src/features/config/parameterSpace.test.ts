/**
 * Parameter-space validation tests.
 *
 * The rule under test is that the editor refuses to leave the space the
 * strategy publishes — enforced here rather than discovered at preflight.
 */
import { describe, expect, it } from "vitest";

import type { ParameterSpec } from "../../lib/api";
import {
  checkResourceCeiling,
  gridPoints,
  isIntegerRange,
  readDeclaredSpace,
  seedSearchSpace,
  validateSearchSpace,
  validateSpec,
} from "./parameterSpace";

const declared = { window: { low: 20, high: 60, step: 2 } };

describe("declared space", () => {
  it("reads a well-formed contract entry", () => {
    expect(readDeclaredSpace({ window: { low: 20, high: 60, step: 2 } })).toEqual(declared);
  });

  it("skips entries without a numeric triple rather than guessing zero", () => {
    expect(readDeclaredSpace({ a: { low: 1 }, b: null, c: "x", d: { low: 1, high: 2, step: "s" } })).toEqual({});
  });

  it("classifies integer and float ranges", () => {
    expect(isIntegerRange({ low: 20, high: 60, step: 2 })).toBe(true);
    expect(isIntegerRange({ low: 0, high: 1, step: 0.1 })).toBe(false);
  });

  it("seeds an editor space that exactly matches the contract", () => {
    expect(seedSearchSpace(declared)).toEqual({
      window: { kind: "int_range", low: 20, high: 60, step: 2 },
    });
  });
});

describe("range validation", () => {
  const spec = (over: Partial<Extract<ParameterSpec, { kind: "int_range" }>> = {}): ParameterSpec => ({
    kind: "int_range",
    low: 20,
    high: 60,
    step: 2,
    ...over,
  });

  it("accepts the declared range unchanged", () => {
    expect(validateSpec("window", spec(), declared.window)).toEqual([]);
  });

  it("accepts a narrower range", () => {
    expect(validateSpec("window", spec({ low: 30, high: 50 }), declared.window)).toEqual([]);
  });

  it("rejects a low below the declared bound", () => {
    const issues = validateSpec("window", spec({ low: 10 }), declared.window);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("low"))).toBe(true);
  });

  it("rejects a high above the declared bound", () => {
    const issues = validateSpec("window", spec({ high: 100 }), declared.window);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("high"))).toBe(true);
  });

  it("rejects an inverted range and a non-positive step", () => {
    expect(validateSpec("window", spec({ low: 50, high: 30 }), declared.window).some((i) => i.severity === "error")).toBe(true);
    expect(validateSpec("window", spec({ step: 0 }), declared.window).some((i) => i.severity === "error")).toBe(true);
  });

  it("requires an integer step for int_range", () => {
    const issues = validateSpec("window", { kind: "int_range", low: 20, high: 60, step: 1.5 }, declared.window);
    expect(issues.some((i) => i.message.includes("step nguyên"))).toBe(true);
  });

  it("warns — not blocks — on a finer step than the declared grid", () => {
    const issues = validateSpec("window", spec({ step: 1 }), declared.window);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("does not fail a float bound on representation noise", () => {
    const float = { low: 0.1, high: 0.3, step: 0.1 };
    const issues = validateSpec("x", { kind: "float_range", low: 0.1 + 0.2 - 0.2, high: 0.3, step: 0.1 }, float);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("bounds a fixed value by the declared range", () => {
    expect(validateSpec("window", { kind: "fixed", value: 40 }, declared.window)).toEqual([]);
    expect(
      validateSpec("window", { kind: "fixed", value: 400 }, declared.window).some((i) => i.severity === "error"),
    ).toBe(true);
  });

  it("requires a value for fixed and at least one entry for categorical", () => {
    expect(validateSpec("x", { kind: "fixed", value: null }, declared.window).some((i) => i.severity === "error")).toBe(true);
    expect(validateSpec("x", { kind: "categorical", values: [] }, declared.window).some((i) => i.severity === "error")).toBe(true);
  });

  it("warns when a parameter is not in the published space", () => {
    const issues = validateSpec("unknown", spec(), undefined);
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("parameter space"))).toBe(true);
    expect(issues.some((i) => i.severity === "error")).toBe(false);
  });
});

describe("grid size", () => {
  it("counts inclusive grid points", () => {
    expect(gridPoints({ kind: "int_range", low: 20, high: 60, step: 2 })).toBe(21);
    expect(gridPoints({ kind: "fixed", value: 3 })).toBe(1);
    expect(gridPoints({ kind: "categorical", values: ["a", "b"] })).toBe(2);
  });

  it("never returns zero for a degenerate range", () => {
    expect(gridPoints({ kind: "int_range", low: 5, high: 1, step: 1 })).toBe(1);
    expect(gridPoints({ kind: "float_range", low: 0, high: 1, step: 0 })).toBe(1);
  });

  it("multiplies the space and counts what is actually searched", () => {
    const result = validateSearchSpace(
      {
        window: { kind: "int_range", low: 20, high: 24, step: 2 },
        rsi: { kind: "fixed", value: 14 },
      },
      { window: declared.window, rsi: { low: 1, high: 30, step: 1 } },
    );
    expect(result.combinations).toBe(3);
    expect(result.searchedCount).toBe(1);
  });
});

describe("resource ceiling", () => {
  it("stays silent when the manifest publishes no ceiling", () => {
    expect(checkResourceCeiling(500, null)).toBeNull();
  });

  it("passes at the ceiling and fails above it", () => {
    expect(checkResourceCeiling(128, 128)).toBeNull();
    expect(checkResourceCeiling(129, 128)).toContain("128");
  });
});
