/**
 * Design-system gate (v1.1 plan §3.1, U02 exit gate).
 *
 * "No one-off styles" only holds if it is checked. This walks the source and
 * fails on a colour literal written anywhere except the token file, and on a
 * workstream ramp that drifts between the two theme blocks.
 *
 * Excluded on purpose:
 *  - `src/content/**` — byte-preserved fragments of the golden document; their
 *    inline styles are part of the source document, not our styling.
 *  - `print.css` — a print sheet forces true white paper and true black ink.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");
const TOKENS = join(SRC, "styles", "tokens.css");

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const EXCLUDED = (file: string) => {
  const rel = relative(SRC, file);
  return (
    rel.startsWith("content/") ||
    rel === join("styles", "tokens.css") ||
    rel === join("styles", "print.css")
  );
};

describe("no raw colour outside the token file", () => {
  it("every component references a documented token", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (EXCLUDED(file)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (COLOR_LITERAL.test(line)) {
            offenders.push(`${relative(SRC, file)}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("workstream ramp", () => {
  const tokens = readFileSync(TOKENS, "utf8");

  /** Reads the `--ws-*` values declared inside one selector block. */
  function rampIn(selector: string): string[] {
    const start = tokens.indexOf(selector);
    expect(start, selector).toBeGreaterThan(-1);
    const block = tokens.slice(start, tokens.indexOf("}", start));
    return Array.from({ length: 8 }, (_, index) => {
      const match = new RegExp(`--ws-${index + 1}:\\s*(#[0-9a-f]{6})`, "i").exec(block);
      return match ? match[1].toLowerCase() : "";
    });
  }

  it("declares all eight identity hues in the light theme", () => {
    expect(rampIn(":root {").every(Boolean)).toBe(true);
  });

  it("re-steps the same eight slots for dark, rather than reusing light values", () => {
    const light = rampIn(":root {");
    const dark = rampIn(':root[data-theme="dark"]');
    expect(dark.every(Boolean)).toBe(true);
    // Dark is selected, not flipped: no slot may keep its light value.
    expect(dark.filter((hue, index) => hue === light[index])).toEqual([]);
  });

  it("keeps the system-preference branch in step with the explicit dark theme", () => {
    // This branch previously omitted tokens, so an unset theme rendered light
    // values on a dark surface.
    expect(rampIn(":root:not([data-theme])")).toEqual(rampIn(':root[data-theme="dark"]'));
  });
});
