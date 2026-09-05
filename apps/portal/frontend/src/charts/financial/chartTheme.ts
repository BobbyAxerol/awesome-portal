/**
 * Financial chart theme — the one place uPlot learns its colours (§27.7 rule 9;
 * U02: no raw colour literal outside a token file).
 *
 * Tokens are read from the chart's own element at init, so a chart inside an
 * `.exec-surface` inherits the Execution Carbon values and a chart on a
 * Research page inherits that theme's — the rule `chartTokens()` already
 * follows for ECharts, extended to the `--exec-chart-*` custom properties the
 * execution theme declares. Read per instance, never at module load: the
 * `data-theme` attribute is applied by React after this module is imported.
 */
import { activeTheme, canvasTokens, withAlpha, type ThemeName } from "../../styles/tokens";

export interface FinancialChartTheme {
  /** primary series */
  line: string;
  /** comparison / benchmark series */
  line2: string;
  /** approved research band */
  band: string;
  /** declared source gap */
  gap: string;
  grid: string;
  axis: string;
  ink: string;
  inkSoft: string;
  surface: string;
  good: string;
  bad: string;
  warn: string;
  accent: string;
  fontMono: string;
}

function read(style: CSSStyleDeclaration | null, name: string): string | null {
  const value = style?.getPropertyValue(name).trim();
  return value ? value : null;
}

export function readFinancialChartTheme(el?: Element | null, theme: ThemeName = activeTheme()): FinancialChartTheme {
  const t = canvasTokens(theme);
  const style =
    typeof getComputedStyle === "function" && typeof document !== "undefined"
      ? getComputedStyle(el ?? document.documentElement)
      : null;
  return {
    line: read(style, "--exec-chart-line") ?? t.good,
    line2: read(style, "--exec-chart-line-2") ?? t.accent,
    band: read(style, "--exec-chart-band") ?? t.accent2,
    gap: read(style, "--exec-chart-gap") ?? t.bad,
    grid: read(style, "--exec-chart-grid") ?? t.lineSoft,
    axis: read(style, "--exec-chart-axis") ?? t.inkFaint,
    ink: read(style, "--ink") ?? t.ink,
    inkSoft: read(style, "--ink-soft") ?? t.inkSoft,
    surface: read(style, "--paper-raised") ?? t.paperRaised,
    good: read(style, "--good") ?? t.good,
    bad: read(style, "--bad") ?? t.bad,
    warn: read(style, "--warn") ?? t.accent2,
    accent: read(style, "--accent") ?? t.accent,
    fontMono: read(style, "--font-mono") ?? "ui-monospace, monospace",
  };
}

/** `withAlpha` for the hex tokens the theme files declare; any other notation is returned unchanged. */
export function alpha(color: string, a: number): string {
  return color.startsWith("#") ? withAlpha(color, a) : color;
}
