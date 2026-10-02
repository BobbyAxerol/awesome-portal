/** QA 2026-10-02 S04 — U2: the strategy-vs-benchmark tooltip answers for both curves although their timestamps differ. */
import { describe, expect, it } from "vitest";

import { drawdownOption, strategyBenchmarkTooltip } from "./EvidenceCharts";

const strategy = [
  { at_utc_ms: Date.UTC(2026, 6, 1, 0), value: "100.00" },
  { at_utc_ms: Date.UTC(2026, 6, 2, 0), value: "101.50" },
];
const benchmark = [
  { at_utc_ms: Date.UTC(2026, 6, 1, 6), value: "100.20" },
  { at_utc_ms: Date.UTC(2026, 6, 2, 6), value: "99.10" },
];

describe("S04 U2 · strategy vs benchmark tooltip", () => {
  it("shows the benchmark row (nearest served point, with its own time) beside the strategy", () => {
    const html = strategyBenchmarkTooltip(strategy, benchmark, [
      { dataIndex: 1, seriesName: "Strategy", marker: "", axisValue: strategy[1].at_utc_ms },
    ]);
    expect(html).toContain("Strategy");
    expect(html).toContain("Benchmark (buy and hold)");
    expect(html).toContain("99.10");
    expect(html).toContain("2026-07-02 06:00Z");
  });

  it("with no benchmark published, shows only the strategy row", () => {
    const html = strategyBenchmarkTooltip(strategy, [], [{ dataIndex: 0, seriesName: "Strategy", axisValue: strategy[0].at_utc_ms }]);
    expect(html).toContain("Strategy");
    expect(html).not.toContain("Benchmark");
  });
});

describe("S04 U18 · a zero drawdown is 0.00%, never +0.00%", () => {
  const points = [
    { at_utc_ms: Date.UTC(2026, 6, 1), equity: "100", drawdown_fraction: "0" },
    { at_utc_ms: Date.UTC(2026, 6, 2), equity: "99", drawdown_fraction: "-0.01" },
  ];
  const tip = (index: number) =>
    ((drawdownOption(points) as unknown as { tooltip: { formatter: (p: unknown) => string } }).tooltip.formatter([{ dataIndex: index, seriesName: "OOS drawdown", marker: "" }]));
  it("zero", () => {
    expect(tip(0)).toContain("<b>0.00%</b>");
    expect(tip(0)).not.toContain("+0.00%");
  });
  it("a real drawdown keeps its minus", () => {
    expect(tip(1)).toContain("−1.00%");
  });
});
