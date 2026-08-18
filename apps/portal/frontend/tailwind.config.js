/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
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
