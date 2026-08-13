import { describe, expect, it } from "vitest";

import { buildHistogram, buildObjectiveHeatmap } from "./analytics";

describe("parameter analytics", () => {
  it("builds a count-preserving histogram", () => {
    const bins = buildHistogram([1, 1, 2, 3, 4, 4], 4);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(6);
    expect(bins[0].low).toBe(1);
    expect(bins.at(-1)?.high).toBe(4);
  });

  it("aggregates duplicate heatmap cells by mean objective", () => {
    const rows = [
      { params_json: JSON.stringify({ a: 1, b: 2 }), objective: 0.5 },
      { params_json: JSON.stringify({ a: 1, b: 2 }), objective: 1.5 },
      { params_json: JSON.stringify({ a: 2, b: 3 }), objective: -1 },
    ];
    const cells = buildObjectiveHeatmap(rows, "a", "b");
    expect(cells).toContainEqual({ x: 1, y: 2, objective: 1, count: 2 });
    expect(cells).toContainEqual({ x: 2, y: 3, objective: -1, count: 1 });
  });
});
