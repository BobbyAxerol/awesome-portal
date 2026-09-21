/*
 * Planning is an embedded feature, not a second Tailwind application.
 *
 * Its feature stylesheet is imported directly, but the small set of Portal
 * `@layer components` primitives below is shared by its TSX.  Scanning the
 * complete sibling Planning tree changed Tailwind's generated utility order
 * across the whole Portal and invalidated unrelated visual baselines.  Keep
 * the Portal scan boundary local; retain only the explicit, reviewed shared
 * primitive contract through purge.  Add a name here only when the Planning
 * UI primitive actually needs a Portal-owned `@layer` rule.
 */
const EMBEDDED_PLANNING_PORTAL_PRIMITIVES = [
  "card",
  "chip",
  "chip-accent",
  "chip-good",
  "chip-bad",
  "badge-pass",
  "badge-fail",
  "badge-pending",
  "btn-primary",
  "btn-ghost",
  "input",
  "navtab",
  "navtab-active",
  "state-loading",
  "state-empty",
  "state-failed",
  "mono-label",
  "section-title",
  "definition-list",
  "collapsible",
  "table-wrap",
  "chart-figure",
  "dek",
  "modal-backdrop",
  "modal-panel",
  "modal-head",
  "icon-btn",
  "modal-body",
  "toast-stack",
  "toast",
  "toast-info",
  "toast-good",
  "toast-bad",
  "sr-only",
  // This is the embedded route-level Suspense fallback. It must survive
  // Tailwind purge before a lazy Planning view mounts; do not replace this
  // explicit declaration with a sibling-tree scan.
  "feature-loading",
];

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  safelist: EMBEDDED_PLANNING_PORTAL_PRIMITIVES,
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        raised: "var(--paper-raised)",
        sunken: "var(--paper-sunken)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        line: "var(--line)",
        "line-soft": "var(--line-soft)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-700": "var(--accent-strong)",
        "accent-2": "var(--accent-2)",
        "accent-2-soft": "var(--accent-2-soft)",
        good: "var(--good)",
        "good-bg": "var(--good-bg)",
        bad: "var(--bad)",
        "bad-bg": "var(--bad-bg)",
        panel: "var(--ink-panel)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        "panel-fg": "var(--ink-panel-fg)",
      },
      fontFamily: {
        display: ["Newsreader", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        e1: "0 1px 2px rgba(28,37,50,.05)",
        e2: "0 4px 12px rgba(28,37,50,.08)",
        e3: "0 10px 28px rgba(28,37,50,.12)",
      },
    },
  },
  plugins: [],
};
