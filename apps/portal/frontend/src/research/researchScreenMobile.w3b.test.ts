/**
 * W3b: the phone rules for the hub, Progress and the four stage screens (CSS contract; the real
 * proof is the browser measurement in qa-2026-10-02/w3/W3B.md). Everything that changes layout
 * sits in the one 720px block; the only rules outside it hide the phone-only toggle and make a long
 * word in a causal fold row wrap, neither of which changes a layout that already fits.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "researchScreen.css"), "utf8");
const marker = css.indexOf("Phone width (QA 2026-10-02)");
const block = css.slice(css.indexOf("@media (max-width: 720px) {", marker));
const outside = css.slice(0, marker);

describe("W3b phone rules", () => {
  it("collapses the evidence cursor and releases its stickiness when open", () => {
    expect(block).toContain('[data-cursor-bar][data-collapsed="true"] > :not([data-cursor-toggle])');
    expect(block).toMatch(/\[data-stage-card\]:has\(\[data-cursor-bar\]\[data-collapsed="false"\]\)\s*\{\s*position: static !important/);
  });

  it("keeps Promotion out of the tab row and snaps the strip", () => {
    expect(block).toMatch(/\[data-promotion-soon\]\s*\{\s*display: none/);
    expect(block).toContain("scroll-snap-type: x proximity");
    expect(block).toContain("scroll-snap-align: start");
  });

  it("gives prev/next stage links a 44px target and every other control 24px", () => {
    expect(block).toMatch(/\[data-action="next-stage"\][\s\S]*?min-height: 44px/);
    expect(block).toContain('[data-next="run-report"]');
    expect(block).toMatch(/button, summary, select[\s\S]*?min-height: 24px/);
    expect(block).toMatch(/button\s*\{\s*min-width: 24px/);
    expect(block).toContain("inset: -6px -2px");
  });

  it("wraps claim chips and the console on Progress", () => {
    expect(block).toMatch(/\[data-claims\] > span\s*\{\s*white-space: normal/);
    expect(block).toMatch(/\[data-console-box\]\s*\{\s*white-space: pre-wrap/);
  });

  it("hides the cursor toggle above 720px, so a laptop bar is unchanged", () => {
    expect(outside).toMatch(/\[data-cursor-toggle\]\s*\{\s*display: none/);
    expect(block).toMatch(/\[data-cursor-toggle\]\s*\{\s*display: flex/);
  });

  it("scopes the hit-area rules to the six W3b screens", () => {
    expect(block).toContain('[data-screen="execute-replay"]');
    expect(block).not.toMatch(/\n {2}\.research-screen (a|button)\b[^\n]*\{/);
  });
});
