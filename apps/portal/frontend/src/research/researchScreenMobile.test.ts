/**
 * Phone-width contract of the Research Loop screens (QA 2026-10-02).
 *
 * The 1440 px baselines are under review, so every rule that keeps a screen
 * inside a 390 / 360 px viewport must live in one `@media (max-width: 720px)`
 * block of researchScreen.css. The real proof (document scrollWidth equals the
 * viewport on S00-S14) is a browser measurement; this pins the CSS shape.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "researchScreen.css"), "utf8");
const marker = css.indexOf("Phone width (QA 2026-10-02)");

function mediaBlock(): string {
  const start = css.indexOf("@media (max-width: 720px) {", marker);
  expect(start).toBeGreaterThan(marker);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error("unbalanced media block");
}

describe("research screens at phone width", () => {
  it("keeps every phone rule inside one max-width: 720px query", () => {
    expect(marker).toBeGreaterThan(0);
    const block = mediaBlock();
    // Nothing but whitespace/comments between the marker comment and the block, and nothing after it.
    const after = css.slice(css.indexOf(block) + block.length).trim();
    expect(after).toBe("");
    const between = css.slice(css.indexOf("*/", marker) + 2, css.indexOf(block)).trim();
    expect(between).toBe("");
  });

  it("covers the measured culprits", () => {
    const block = mediaBlock();
    for (const needle of [
      "overflow-wrap: anywhere",
      "[data-card-group]",
      ".jm-card",
      "[data-phase]",
      "[data-stats]",
      "[data-fold-note]",
      ".ln-diff",
      "[data-parameters]",
    ]) {
      expect(block, needle).toContain(needle);
    }
  });

  it("uses no colour literals", () => {
    expect(mediaBlock()).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|color-mix/i);
  });
});
