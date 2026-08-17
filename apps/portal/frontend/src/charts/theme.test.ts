/**
 * Chart theme axis tests.
 *
 * The defect these lock: a time axis with no formatter let ECharts choose its
 * own granularity, and on a sub-year series it chose the year level — five
 * ticks all reading "2024". The fix must not leak a date formatter onto the
 * value axes several views use for trial ids.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { baseOption } from "./theme";

type Axis = { type?: string; axisLabel?: { formatter?: (value: number) => string } };

const xAxisOf = (option: ReturnType<typeof baseOption>) => option.xAxis as Axis;

describe("time axis labels", () => {
  it("formats a default time axis as an unambiguous UTC date", () => {
    const formatter = xAxisOf(baseOption()).axisLabel?.formatter;
    expect(formatter).toBeTypeOf("function");
    expect(formatter?.(Date.UTC(2024, 2, 15, 9, 30))).toBe("2024-03-15");
  });

  it("keeps the formatter when a view re-declares the axis as time", () => {
    // `...extra` used to replace the whole axis, dropping the theme's styling
    // and its formatter — which is how ExecutionView lost both.
    const axis = xAxisOf(baseOption({ xAxis: { type: "time" } }));
    expect(axis.axisLabel?.formatter).toBeTypeOf("function");
  });

  it("never puts a date formatter on a value axis", () => {
    // Optimization and Parameters plot trial ids on the x axis.
    const axis = xAxisOf(baseOption({ xAxis: { type: "value" } }));
    expect(axis.type).toBe("value");
    expect(axis.axisLabel?.formatter).toBeUndefined();
  });

  it("respects a formatter the caller supplied", () => {
    const own = (value: number) => `#${value}`;
    const axis = xAxisOf(baseOption({ xAxis: { type: "time", axisLabel: { formatter: own } } }));
    expect(axis.axisLabel?.formatter).toBe(own);
  });

  it("returns an empty label rather than 'Invalid Date'", () => {
    expect(xAxisOf(baseOption()).axisLabel?.formatter?.(Number.NaN)).toBe("");
  });

  it("preserves the caller's other option keys", () => {
    const option = baseOption({ legend: { show: false } });
    expect((option.legend as { show?: boolean }).show).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * Canvas cannot resolve CSS variables
 * ---------------------------------------------------------------------- */

describe("no CSS variables inside ECharts options", () => {
  /**
   * The charts render with the canvas renderer (`charts/EChart.tsx`), which
   * hands colours straight to the 2D context. A `var(--good)` string is not a
   * colour there: ECharts silently falls back to its own default palette, so
   * the mark renders in the wrong colour and nothing fails. That is exactly
   * what `styles/tokens.ts` (`canvasTokens`) exists to prevent, and it is what
   * the visual baseline caught on the Execution markers and the Overview axes.
   *
   * The scan keys off option-only property names, which never appear in a DOM
   * style object, so a legitimate `style={{ color: "var(--good)" }}` elsewhere
   * in the same file is not flagged.
   */
  const OPTION_KEYS = /\b(itemStyle|lineStyle|areaStyle|axisLabel|splitLine|axisLine|visualMap)\b/;

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });
  }

  it("passes tokens as resolved values, never as var() strings", () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      if (file.endsWith("theme.test.ts")) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.includes("var(--") && OPTION_KEYS.test(line)) {
            offenders.push(`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
