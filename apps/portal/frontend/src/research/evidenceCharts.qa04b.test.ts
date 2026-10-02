/** QA 2026-10-02 wave 2 — S04 U5 (fold labels) and U6 (readable chart ink in Operations Dark). */
import { afterEach, describe, expect, it } from "vitest";

import { equityOption, shortFoldLabel, strategyBenchmarkOption } from "./EvidenceCharts";
import { canvasTokens } from "../styles/tokens";

afterEach(() => document.documentElement.removeAttribute("data-theme"));

type Opt = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const T = (day: number) => Date.UTC(2026, 6, day);
const EQUITY = [1, 2, 3, 4].map((d) => ({ at_utc_ms: T(d), equity: String(100 + d), drawdown_fraction: "0" }));
const BOUNDARIES = [1, 2, 3, 4].map((d) => ({ at_utc_ms: T(d), label: `fold_0${d}` }));

describe("S04 U5 · fold boundary labels do not collide", () => {
  it("shortens fold_0N to FN and keeps other labels", () => {
    expect(shortFoldLabel("fold_01")).toBe("F1");
    expect(shortFoldLabel("fold_12")).toBe("F12");
    expect(shortFoldLabel("window A")).toBe("window A");
  });

  it("the markLine prints the short label and lifts every other one a row", () => {
    const option = equityOption(EQUITY as never, BOUNDARIES) as Opt;
    const oos = (option.series as Opt[]).find((s) => s.markLine) as Opt;
    expect(oos.markLine.label.formatter({ name: "fold_03" })).toBe("F3");
    const data = oos.markLine.data as Opt[];
    expect(data[0].label).toBeUndefined();
    expect(data[1].label.offset).toEqual([0, -11]);
    expect(data[2].label).toBeUndefined();
    expect(data[3].label.offset).toEqual([0, -11]);
    expect(data[1].name).toBe("fold_02");
  });
});

describe("S04 U6 · chart text uses the soft ink in both themes", () => {
  const strategy = [{ at_utc_ms: T(1), value: "100" }, { at_utc_ms: T(2), value: "101" }];
  const benchmark = [{ at_utc_ms: T(1), value: "100" }, { at_utc_ms: T(2), value: "105" }];
  for (const [attr, theme] of [[null, "research"], ["operations", "operations"]] as const) {
    it(`${theme}: axis labels, legend and text are inkSoft; the strategy line is heavier`, () => {
      if (attr) document.documentElement.setAttribute("data-theme", attr);
      const soft = canvasTokens(theme).inkSoft;
      const option = strategyBenchmarkOption(strategy, benchmark) as Opt;
      expect(option.xAxis.axisLabel.color).toBe(soft);
      expect(option.yAxis.axisLabel.color).toBe(soft);
      expect(option.legend.textStyle.color).toBe(soft);
      expect(option.textStyle.color).toBe(soft);
      expect(option.series[0].lineStyle.width).toBeGreaterThanOrEqual(2.5);
      expect(option.series[1].lineStyle.color).toBe(soft);
    });
  }
});
