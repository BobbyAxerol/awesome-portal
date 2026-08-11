import { describe, expect, it } from "vitest";

import {
  annotateConsoleLines,
  estimateEtaSeconds,
  parseConsoleStats,
} from "./consoleStats";

const LINES = [
  "[I 2026-01-01 10:00:00] A new study created in memory with name: no-name-1",
  "[I 2026-01-01 10:00:01] Trial 0 finished with value: 1.2 and parameters: {'x': 1}. Best is trial 0 with value: 1.2.",
  "[I 2026-01-01 10:00:02] Trial 1 finished with value: 2.4 and parameters: {'x': 2}. Best is trial 1 with value: 2.4.",
  "[I 2026-01-01 10:00:03] Trial 2 pruned. duplicate parameter set",
  "[I 2026-01-01 10:00:04] A new study created in memory with name: no-name-2",
  "[I 2026-01-01 10:00:05] Trial 0 finished with value: 3.1 and parameters: {'x': 3}. Best is trial 0 with value: 3.1.",
];

describe("parseConsoleStats", () => {
  it("counts studies and trials, tracks best per study", () => {
    const stats = parseConsoleStats(LINES);
    expect(stats.studyStarts).toBe(2);
    expect(stats.trialsDone).toBe(3);
    expect(stats.bestByStudy).toEqual([1, 0]);
  });

  it("treats pruned duplicates as non-trials", () => {
    const stats = parseConsoleStats(LINES);
    expect(stats.trialsDone).toBe(3);
  });

  it("handles empty input", () => {
    expect(parseConsoleStats([])).toEqual({ studyStarts: 0, trialsDone: 0, bestByStudy: [] });
  });

  it("keeps current study best live", () => {
    const stats = parseConsoleStats([
      "[I] A new study created in memory with name: no-name-1",
      "[I] Trial 0 finished with value: 1.0",
      "[I] Trial 1 finished with value: 2.0. Best is trial 1 with value: 2.0.",
    ]);
    expect(stats.bestByStudy).toEqual([1]);
  });
});

describe("estimateEtaSeconds", () => {
  it("returns null below 5% progress", () => {
    expect(estimateEtaSeconds(1, 100, 10)).toBeNull();
  });

  it("extrapolates remaining time", () => {
    const eta = estimateEtaSeconds(50, 100, 100);
    expect(eta).toBeCloseTo(100);
  });

  it("returns 0 when complete", () => {
    expect(estimateEtaSeconds(100, 100, 100)).toBe(0);
  });

  it("handles degenerate inputs", () => {
    expect(estimateEtaSeconds(0, 100, 10)).toBeNull();
    expect(estimateEtaSeconds(10, 0, 10)).toBeNull();
  });
});

describe("annotateConsoleLines", () => {
  it("inserts fold separators at study boundaries", () => {
    const rows = annotateConsoleLines(LINES);
    const separators = rows.filter((row) => row.kind === "separator");
    expect(separators).toHaveLength(2);
    expect(separators[0].fold).toBe(1);
    expect(separators[1].fold).toBe(2);
  });

  it("keeps raw lines untouched", () => {
    const rows = annotateConsoleLines(LINES);
    const lines = rows.filter((row) => row.kind === "line");
    expect(lines).toHaveLength(4);
  });
});
