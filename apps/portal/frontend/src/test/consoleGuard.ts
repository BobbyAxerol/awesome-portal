/**
 * N29-FE-01 §5 — zero React/DOM warnings under test.
 *
 * Every `console.error`/`console.warn` during a test fails that test unless
 * it matches the narrow allowlist below. React writes real defects through
 * exactly these channels (act() violations, duplicate keys, invalid DOM
 * nesting, controlled/uncontrolled flips); letting them scroll by is how a
 * broken screen stays green.
 */
import { afterEach, beforeEach, vi } from "vitest";

/** Each entry documents WHY it is allowed. Keep this list short and named. */
const ALLOWLIST: readonly { pattern: RegExp; why: string }[] = [
  {
    // jsdom implements neither layout nor navigation; anchors clicked by
    // user-event tests hit its "not implemented" stub. Not a product defect.
    pattern: /Not implemented: (navigation|window\.scrollTo)/,
    why: "jsdom stub, exercised deliberately by link-click tests",
  },
  {
    // jsdom has no layout: every mounted chart container measures 0×0. The
    // e2e console gate runs in real Chromium and stays strict about this.
    pattern: /\[ECharts\] Can't get DOM width or height/,
    why: "jsdom has no layout engine; charts measure a 0×0 container",
  },
  {
    // Follows directly from the 0×0 fallback path above: without rAF-driven
    // layout ECharts initializes synchronously and warns about its own timing.
    pattern: /\[ECharts\] `setOption` should not be called during main process/,
    why: "ECharts timing warning on the jsdom 0×0 fallback path",
  },
];

let offences: string[] = [];
let realError: typeof console.error;
let realWarn: typeof console.warn;

function record(kind: "error" | "warn", args: unknown[]) {
  const text = args
    .map((a) => (typeof a === "string" ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a)))
    .join(" ");
  if (ALLOWLIST.some((entry) => entry.pattern.test(text))) return;
  offences.push(`console.${kind}: ${text}`);
}

beforeEach(() => {
  offences = [];
  realError = console.error;
  realWarn = console.warn;
  console.error = (...args: unknown[]) => {
    record("error", args);
    realError.apply(console, args as never[]);
  };
  console.warn = (...args: unknown[]) => {
    record("warn", args);
    realWarn.apply(console, args as never[]);
  };
});

afterEach(() => {
  console.error = realError;
  console.warn = realWarn;
  vi.restoreAllMocks();
  if (offences.length > 0) {
    const report = offences.slice(0, 5).join("\n");
    offences = [];
    throw new Error(`Unexpected console output during test (N29-FE-01 §5):\n${report}`);
  }
});
