/**
 * Structural gates for the shared charts: what must be true of the source, not
 * of one render. Same style as v2Hygiene and absentValues, scoped to this folder.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = __dirname;
const CSS = readFileSync(resolve(DIR, "../css/charts.css"), "utf8");
const sources = readdirSync(DIR)
  .filter((n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) && n !== "chartKit.ts" && n !== "flowLayoutProbe.ts")
  .map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") }));
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const barrel = readFileSync(join(DIR, "index.ts"), "utf8");

describe("chart sources", () => {
  it("reads the sources it polices", () => {
    expect(sources.length).toBeGreaterThanOrEqual(15);
  });

  it("imports no chart library (the entry bundle gate forbids echarts and uPlot outside lazy chunks)", () => {
    const offenders = sources.filter((s) => /from\s+"(echarts|uplot|d3[\w-]*|recharts|chart\.js|victory|visx)[^"]*"/i.test(s.text)).map((s) => s.name);
    expect(offenders).toEqual([]);
  });

  it("has no raw colour literal in TypeScript: colour is a token in charts.css", () => {
    const offenders = sources.filter((s) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(strip(s.text))).map((s) => s.name);
    expect(offenders).toEqual([]);
  });

  it("never lets a dash, N/A or a zero stand in for an absent value", () => {
    const offenders: string[] = [];
    for (const s of sources) {
      strip(s.text).split("\n").forEach((line, i) => {
        if (/\?\?\s*"(—|–|-|N\/A|n\/a|0|0\.00)"/.test(line) || /\?\s*"(—|–|N\/A|n\/a)"/.test(line) || /"[—–]"|>\s*[—–]\s*</.test(line)) offenders.push(`${s.name}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("makes numbers only for geometry: labels come from showDecimal, not toFixed on data", () => {
    const offenders = sources
      .filter((s) => s.name !== "scale.ts" && s.name !== "downsample.ts" && s.name !== "flowLayout.ts" && s.name !== "plotParts.tsx")
      .filter((s) => /\.toFixed\(|Intl\.NumberFormat/.test(strip(s.text)) && !/\.toFixed\(5\)/.test(strip(s.text)))
      .map((s) => s.name);
    expect(offenders).toEqual([]);
  });

  it("gives every drawn component an image role, or a group role where its marks are controls", () => {
    const roles: Record<string, RegExp> = {
      "EquityPanel.tsx": /role="img"/,
      "CompareOverlay.tsx": /role="img"/,
      "CapitalFlow.tsx": /role="img"/,
      "DivBars.tsx": /role="img"/,
      "Spark.tsx": /role="img"/,
      "ChartStateView.tsx": /role="img"/,
      "EventRibbon.tsx": /role="group"/,
    };
    for (const [file, re] of Object.entries(roles)) {
      expect(sources.find((s) => s.name === file)!.text, file).toMatch(re);
    }
  });

  it("gives the two time charts a keyboard readout", () => {
    for (const file of ["EquityPanel.tsx", "CompareOverlay.tsx"]) {
      const text = sources.find((s) => s.name === file)!.text;
      expect(text, file).toMatch(/tabIndex=\{0\}/);
      expect(text, file).toMatch(/onKeyDown/);
      expect(text, file).toMatch(/aria-live="polite"/);
    }
  });
});

describe("charts.css", () => {
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

  it("animates nothing, so prefers-reduced-motion needs no override", () => {
    expect(code).not.toMatch(/\banimation\b|@keyframes|\btransition\b/);
  });

  it("uses the type roles only: no font-family, no font-size, no uppercase", () => {
    expect(code).not.toMatch(/font-family\s*:|font-size\s*:|text-transform\s*:\s*uppercase/);
    expect([...code.matchAll(/\bfont\s*:\s*([^;]+);/g)].every((m) => /^var\(--exec-font-[a-z]+\)$/.test(m[1].trim()))).toBe(true);
  });

  it("styles every class the components emit (a class with no rule is a dead cue)", () => {
    const emitted = new Set<string>();
    for (const s of sources) for (const m of strip(s.text).matchAll(/className="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c.startsWith("exec-") && emitted.add(c));
    const styled = new Set([...code.matchAll(/\.(exec-[\w-]+)/g)].map((m) => m[1]));
    // exec-flag* belongs to Flag; tested there.
    const missing = [...emitted].filter((c) => !styled.has(c) && !c.startsWith("exec-flag"));
    expect(missing).toEqual([]);
  });

  it("backs colour with a second cue for each series role", () => {
    for (const cue of ["stroke-dasharray", "repeating-linear-gradient", "border-top-style"]) expect(code).toContain(cue);
  });
});

describe("barrel", () => {
  it("exports every component and documents each one", () => {
    for (const name of ["EquityPanel", "Spark", "DivBars", "CompareOverlay", "CapitalFlow", "EventRibbon", "EventKindChips"]) {
      expect(barrel, name).toMatch(new RegExp(`export \\{[^}]*\\b${name}\\b`));
      expect(barrel, name).toMatch(new RegExp(`\\{@link ${name}\\}`));
    }
  });

  it("documents every property of every public props/data type exported from it", () => {
    const names = new Set([...barrel.matchAll(/\btype\s+(\w+)/g)].map((m) => m[1]));
    const undocumented: string[] = [];
    for (const s of sources) {
      const lines = s.text.split("\n");
      let current: string | null = null;
      lines.forEach((line, i) => {
        const open = /^export interface (\w+)/.exec(line);
        if (open) current = open[1];
        else if (line.startsWith("}")) current = null;
        else if (current && names.has(current) && /^ {2}(readonly )?\w+\??:/.test(line)) {
          const prev = lines[i - 1].trim();
          if (!prev.endsWith("*/") && !prev.startsWith("/**")) undocumented.push(`${s.name}: ${current}.${line.trim().split(":")[0]}`);
        }
      });
    }
    expect(undocumented).toEqual([]);
  });
});
