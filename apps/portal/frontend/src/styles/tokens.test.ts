/**
 * U02 exit-gate tests for the token layer.
 *
 * 1. No raw color literal may exist outside the two declared token files.
 *    This is the "không có raw color mới ngoài documented token/visualization
 *    exception" gate from the Unified Plan U02 exit criteria.
 * 2. The canvas mirror in `tokens.ts` must equal what `tokens.css` declares,
 *    per theme. Without this the "documented exception" would be free to drift
 *    into a second palette.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { CANVAS_TOKENS, withAlpha, type ThemeName } from "./tokens";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Raw color literals are permitted only in these files. */
const TOKEN_FILES = new Set([
  "src/styles/tokens.css",
  "src/styles/tokens.ts",
  // This gate itself must spell out literals in order to assert against them.
  "src/styles/tokens.test.ts",
]);

const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|css)$/.test(entry) ? [full] : [];
  });
}

/* -------------------------------------------------------------------------
 * tokens.css parsing
 * ---------------------------------------------------------------------- */

function declarationsIn(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found in tokens.css: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const block = css.slice(open + 1, close);
  const declarations = new Map<string, string>();
  for (const line of block.split("\n")) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (match) declarations.set(match[1], match[2].trim());
  }
  return declarations;
}

/** Resolves a theme the way the cascade would: :root, then the theme block. */
function resolveTheme(css: string, theme: ThemeName): Map<string, string> {
  const root = declarationsIn(css, ":root {");
  if (theme === "research") return root;
  const overrides = declarationsIn(css, ':root[data-theme="operations"] {');
  return new Map([...root, ...overrides]);
}

/* -------------------------------------------------------------------------
 * Tests
 * ---------------------------------------------------------------------- */

describe("U02 token gate", () => {
  it("keeps every raw color literal inside the declared token files", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (TOKEN_FILES.has(rel)) continue;
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        // A `var(--token)` reference is not a literal, and `rgba(` only counts
        // when it is written out rather than produced by withAlpha().
        const stripped = line.replace(/var\(--[a-z0-9-]+\)/g, "");
        const matches = stripped.match(COLOR_PATTERN);
        if (matches) offenders.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the tailwind color map free of raw literals", () => {
    const config = readFileSync(join(ROOT, "tailwind.config.js"), "utf8");
    const colorBlock = config.slice(config.indexOf("colors:"), config.indexOf("fontFamily:"));
    expect(colorBlock.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });

  it("mirrors tokens.css values in the canvas token module, per theme", () => {
    const css = readFileSync(join(SRC, "styles/tokens.css"), "utf8");
    for (const theme of ["research", "operations"] as const) {
      const declared = resolveTheme(css, theme);
      for (const [name, value] of Object.entries(CANVAS_TOKENS[theme])) {
        expect(declared.has(name), `${theme}: ${name} missing from tokens.css`).toBe(true);
        expect(
          declared.get(name)?.toLowerCase(),
          `${theme}: ${name} drifted from tokens.css`,
        ).toBe(value.toLowerCase());
      }
    }
  });

  it("declares the same token names for both canvas themes", () => {
    expect(Object.keys(CANVAS_TOKENS.operations).sort()).toEqual(
      Object.keys(CANVAS_TOKENS.research).sort(),
    );
  });

  it("derives transparency from tokens instead of new literals", () => {
    expect(withAlpha("#0f4c5c", 0.08)).toBe("rgba(15, 76, 92, 0.08)");
    expect(withAlpha("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });
});
