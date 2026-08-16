/* ============================================================================
 * Canvas token mirror — the ONE documented "visualization exception" to the
 * U02 rule that raw colors live only in `tokens.css`.
 *
 * ECharts and the SVG/canvas figures cannot resolve CSS custom properties, so
 * they need literal values. Rather than let literals scatter across chart and
 * figure modules, every canvas renderer imports from here.
 *
 * `tokens.test.ts` parses `tokens.css` and fails if any value below drifts
 * from its CSS declaration, so this mirror can never silently fork.
 * ========================================================================== */

export type ThemeName = "research" | "operations";

/** CSS custom-property name -> literal value, per theme. */
export const CANVAS_TOKENS = {
  research: {
    "--paper-raised": "#ffffff",
    "--paper-sunken": "#f4f2ec",
    "--ink": "#1c2532",
    "--ink-soft": "#4e5a6e",
    "--ink-faint": "#939db0",
    "--line": "#e3e0d7",
    "--line-soft": "#efede4",
    "--accent": "#0f4c5c",
    "--accent-2": "#9a6a1f",
    "--good": "#1e7b4f",
    "--bad": "#b43a3a",
    "--role-is": "#7a8699",
    "--role-oos": "#0f4c5c",
    "--role-holdout": "#9a6a1f",
    "--role-stitched": "#0f4c5c",
    "--state-available": "#1e7b4f",
    "--state-degraded": "#9a6a1f",
    "--state-unavailable": "#6f7a8c",
    "--state-denied": "#b43a3a",
    "--viz-train": "#a8c6ce",
    "--viz-pending": "#e3e0d7",
    "--viz-price": "#5d7b93",
    "--viz-marker-long-border": "#0f5c3a",
    "--viz-marker-short-border": "#7c2626",
    "--viz-cell-border": "#ffffff",
    "--viz-legend-inactive": "#c9c5ba",
    "--console-bg": "#161e2a",
    "--console-fg": "#c9d4e3",
    "--console-faint": "#7a879a",
    "--console-accent": "#7fb3c4",
    "--console-gold": "#d4b36a",
    "--console-good": "#6fcf97",
    "--console-bad": "#e58a8a",
    "--console-rule": "rgba(212, 179, 106, 0.35)",
  },
  operations: {
    "--paper-raised": "#161e2a",
    "--paper-sunken": "#0c121a",
    "--ink": "#e3e9f1",
    "--ink-soft": "#aab6c5",
    "--ink-faint": "#738095",
    "--line": "#2b3747",
    "--line-soft": "#212c3a",
    "--accent": "#7fb3c4",
    "--accent-2": "#d4a75e",
    "--good": "#4fb07c",
    "--bad": "#dd6f6f",
    "--role-is": "#8e99ab",
    "--role-oos": "#7fb3c4",
    "--role-holdout": "#d4a75e",
    "--role-stitched": "#7fb3c4",
    "--state-available": "#4fb07c",
    "--state-degraded": "#d4a75e",
    "--state-unavailable": "#8b97a8",
    "--state-denied": "#dd6f6f",
    // Visualization + console tokens are theme-independent: they are declared
    // once on :root and deliberately not overridden by the operations theme.
    "--viz-train": "#a8c6ce",
    "--viz-pending": "#e3e0d7",
    "--viz-price": "#5d7b93",
    "--viz-marker-long-border": "#0f5c3a",
    "--viz-marker-short-border": "#7c2626",
    "--viz-cell-border": "#ffffff",
    "--viz-legend-inactive": "#c9c5ba",
    "--console-bg": "#161e2a",
    "--console-fg": "#c9d4e3",
    "--console-faint": "#7a879a",
    "--console-accent": "#7fb3c4",
    "--console-gold": "#d4b36a",
    "--console-good": "#6fcf97",
    "--console-bad": "#e58a8a",
    "--console-rule": "rgba(212, 179, 106, 0.35)",
  },
} as const satisfies Record<ThemeName, Record<string, string>>;

export type CanvasTokenName = keyof (typeof CANVAS_TOKENS)["research"];

/** Resolve the canvas palette for a theme. Charts must call this, not literals. */
export function canvasTokens(theme: ThemeName = "research") {
  const t = CANVAS_TOKENS[theme];
  return {
    paperRaised: t["--paper-raised"],
    paperSunken: t["--paper-sunken"],
    ink: t["--ink"],
    inkSoft: t["--ink-soft"],
    inkFaint: t["--ink-faint"],
    line: t["--line"],
    lineSoft: t["--line-soft"],
    accent: t["--accent"],
    accent2: t["--accent-2"],
    good: t["--good"],
    bad: t["--bad"],
  };
}

/**
 * Window-role colors. These are semantic (IS / OOS / Holdout) and must stay
 * identical everywhere they appear — chart, legend, gantt and badge — so a
 * reader never has to re-learn which segment a color means (v0.5 §12.3).
 */
export function roleColorsFor(theme: ThemeName = "research") {
  const t = CANVAS_TOKENS[theme];
  return {
    is: t["--role-is"],
    oos: t["--role-oos"],
    holdout_live: t["--role-holdout"],
    stitched: t["--role-stitched"],
  };
}

/** Runtime availability colors for canvas-drawn status marks. */
export function stateColorsFor(theme: ThemeName = "research") {
  const t = CANVAS_TOKENS[theme];
  return {
    available: t["--state-available"],
    degraded: t["--state-degraded"],
    unavailable: t["--state-unavailable"],
    denied: t["--state-denied"],
  };
}

/**
 * Figure tokens for SVG/canvas marks that are not series colors: window fills,
 * pending bars, price line and marker borders.
 */
export function vizTokensFor(theme: ThemeName = "research") {
  const t = CANVAS_TOKENS[theme];
  return {
    train: t["--viz-train"],
    pending: t["--viz-pending"],
    price: t["--viz-price"],
    markerLongBorder: t["--viz-marker-long-border"],
    markerShortBorder: t["--viz-marker-short-border"],
    cellBorder: t["--viz-cell-border"],
    legendInactive: t["--viz-legend-inactive"],
  };
}

/**
 * Run console palette. The console keeps a dark terminal surface in both
 * themes, so this intentionally takes no theme argument.
 */
export const consoleTokens = {
  bg: CANVAS_TOKENS.research["--console-bg"],
  fg: CANVAS_TOKENS.research["--console-fg"],
  faint: CANVAS_TOKENS.research["--console-faint"],
  accent: CANVAS_TOKENS.research["--console-accent"],
  gold: CANVAS_TOKENS.research["--console-gold"],
  good: CANVAS_TOKENS.research["--console-good"],
  bad: CANVAS_TOKENS.research["--console-bad"],
  rule: CANVAS_TOKENS.research["--console-rule"],
} as const;

/**
 * Applies an alpha channel to one of the hex tokens above. Alpha is a
 * transparency decision, not a new color, so this stays inside the token
 * module rather than letting callers hand-write `rgba(...)` literals.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Reads the theme currently applied to <html>; falls back to research. */
export function activeTheme(): ThemeName {
  if (typeof document === "undefined") return "research";
  return document.documentElement.getAttribute("data-theme") === "operations"
    ? "operations"
    : "research";
}
