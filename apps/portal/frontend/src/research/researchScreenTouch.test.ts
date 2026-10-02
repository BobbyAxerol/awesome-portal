/**
 * Touch-target contract of the Research Loop screens (QA 2026-10-02, W3C).
 *
 * Hit areas live in one `@media (max-width: 720px)` block of
 * researchScreenTouch.css so the laptop layout cannot move. The real proof
 * (every control at least 24 px, primary calls 44 px, measured in a browser at
 * 390 and 360) is a Playwright measurement; this pins the CSS shape.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "researchScreenTouch.css"), "utf8");
const module = readFileSync(join(here, "..", "features", "quantbt", "QuantBTModule.tsx"), "utf8");

function body(): string {
  const start = css.indexOf("@media (max-width: 720px) {");
  expect(start).toBeGreaterThan(0);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) {
      expect(css.slice(i + 1).trim()).toBe("");
      return css.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced media block");
}

describe("research screens touch targets at phone width", () => {
  it("keeps every rule inside one max-width: 720px query", () => {
    const block = body();
    expect(css.slice(0, css.indexOf("@media")).replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe("");
    expect(block).not.toMatch(/@media[\s\S]*@media/);
  });

  it("gives every control a 24 px floor and the primary calls 44 px", () => {
    const block = body();
    expect(block).toContain("min-height: 24px");
    expect(block).toContain("width: max(100%, 24px)");
    expect(block).toContain("height: max(100%, 24px)");
    expect(block).toContain("min-height: 44px");
    for (const needle of [".btn-primary", ".rc-sealbtn", ".ai-btn", 'a[data-action="release-candidate"]', ".rc-strip .cell"]) {
      expect(block, needle).toContain(needle);
    }
  });

  it("uses no colour literals and is imported with researchScreen.css", () => {
    expect(body()).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|color-mix/i);
    expect(module).toContain('import "../../research/researchScreenTouch.css";');
  });
});
