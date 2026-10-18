/**
 * UXM-07 S0 · the gates execution.css has, applied to `v2/css/*.css`.
 *
 * `tokens.test.ts` and `typeRoles.test.ts` read only execution.css, so V2
 * stylesheets would otherwise ship with no contrast, colour or type-role check.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS_DIR = resolve(__dirname, "css");
const TOKENS = readFileSync(resolve(__dirname, "../../styles/tokens.css"), "utf8");

const files = readdirSync(CSS_DIR).filter((name) => name.endsWith(".css")).sort();
const sheets = files.map((name) => ({ name, source: readFileSync(join(CSS_DIR, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));

/** Declarations of the carbon block only: `--name: #hex;`. */
function carbonBody(): string {
  const start = TOKENS.indexOf('[data-theme="operations-carbon"]');
  return TOKENS.slice(start, TOKENS.indexOf("\n}", start));
}
function carbonTokens(): Map<string, string> {
  const body = carbonBody();
  const map = new Map<string, string>();
  for (const m of body.matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/gm)) map.set(m[1], m[2].toLowerCase());
  return map;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Selectors whose uppercase is a reviewed design choice (flag chips, group labels). */
const UPPERCASE_ALLOWED = [/^\.exec-flag\b/, /^\.exec-ctxbar-label\b/, /^\.exec-cmdbar-group\b/, /^\.exec-nav-group-label\b/];

function rules(source: string): { selector: string; body: string }[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

describe("v2 stylesheets", () => {
  it("finds the V2 stylesheets", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(sheets)("$name · no font-family/font-size, no raw colour, no color-mix", ({ source }) => {
    expect(source).not.toMatch(/font-family\s*:/);
    expect(source).not.toMatch(/font-size\s*:/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|color-mix\(/);
  });

  it.each(sheets)("$name · every class is .exec-* and none reuses the CommandPlanDrawer names", ({ source }) => {
    const classes = [...source.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c));
    expect(classes.filter((c) => !c.startsWith("exec-"))).toEqual([]);
    expect(classes.filter((c) => c.startsWith("exec-drawer"))).toEqual([]);
  });

  it.each(sheets)("$name · every var(--x) is a carbon token or a type/layout role", ({ source }) => {
    const declared = new Set([...carbonBody().matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
    const unknown = [...new Set([...source.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))]
      .filter((name) => !declared.has(name) && !name.startsWith("--exec-") && !name.startsWith("--space-") && !name.startsWith("--radius-")
        && !name.startsWith("--font-") && name !== "--focus-ring" && name !== "--scrim" && name !== "--f-pending-hatch");
    expect(unknown).toEqual([]);
  });

  it.each(sheets)("$name · uppercase only on the reviewed selectors", ({ source }) => {
    const offenders = rules(source)
      .filter((r) => /text-transform\s*:\s*uppercase/.test(r.body))
      .map((r) => r.selector)
      .filter((sel) => !sel.split(",").every((part) => UPPERCASE_ALLOWED.some((re) => re.test(part.trim()))));
    expect(offenders).toEqual([]);
  });

  it.each(sheets)("$name · each declared text/background pair is at least 4.5:1", ({ source }) => {
    const known = carbonTokens();
    const failures: string[] = [];
    for (const { selector, body } of rules(source)) {
      const fg = body.match(/(?:^|[;\s])color\s*:\s*var\((--[\w-]+)\)/)?.[1];
      const bg = body.match(/background(?:-color)?\s*:\s*var\((--[\w-]+)\)/)?.[1];
      if (!fg || !bg) continue;
      const f = known.get(fg);
      const b = known.get(bg);
      if (!f || !b) continue; // role or non-hex token: no pair to measure
      const ratio = contrast(f, b);
      if (ratio < 4.5) failures.push(`${selector} · ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it("no V2 class name is also a V1 class (a shared name would restyle V1 charts and tables when the flag is on)", () => {
    const SRC = resolve(__dirname, "../..");
    const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
    const v2 = new Set<string>();
    for (const { source } of sheets) for (const m of source.matchAll(/\.(exec-[A-Za-z0-9_-]+)/g)) v2.add(m[1]);
    const v1 = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (path.includes(`${join("execution", "v2")}`) || name === "node_modules") continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.css$/.test(name)) for (const m of strip(readFileSync(path, "utf8")).matchAll(/\.(exec-[A-Za-z0-9_-]+)/g)) v1.add(m[1]);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) for (const m of readFileSync(path, "utf8").matchAll(/\b(exec-[A-Za-z0-9_-]+)/g)) v1.add(m[1]);
      }
    };
    walk(SRC);
    // exec-surface is the one shared frame on purpose (ExecutionSurface paints the Carbon scope).
    const shared = [...v2].filter((name) => v1.has(name) && name !== "exec-surface").sort();
    expect(shared).toEqual([]);
  });
});
