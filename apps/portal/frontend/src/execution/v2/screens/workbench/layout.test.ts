/**
 * Workbench pinned-bar guard (UXM-10 F-4). jsdom has no layout, so this pins the rule that fixed it; the browser proof is
 * the `access · workbench*` tests of e2e/execution-v2-coexistence.spec.ts (the focused "Overview" tab is not covered at 1024).
 *
 * The "On scroll" summary bar is `position: sticky; bottom: 0`, so it sits over the bottom of the viewport. A control focused
 * there (the first tab, at 1024px) was covered by it (WCAG 2.4.11). A scroll margin that clears the bar makes the browser scroll
 * the focused control into the free part of the screen; the bar is static under 661px, where the margin is not wanted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../css/workbench.css"), "utf8");

describe("Workbench keeps a focused control clear of the pinned summary bar", () => {
  it("the bar is pinned to the bottom edge", () => {
    expect(css).toMatch(/\.exec-wb-mini\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/);
  });

  it("controls inside the screen carry a bottom scroll margin of at least the bar's height, while the bar floats", () => {
    expect(css).toMatch(/@media \(min-width: 661px\)\s*\{\s*\.exec-wb-v2 :is\([^)]*\)\s*\{[^}]*scroll-margin-bottom:\s*5rem/);
    // The bar is static from 660px down (the same breakpoint), so the margin is not applied there.
    expect(css).toMatch(/@media \(max-width: 660px\)\s*\{[^}]*\.exec-wb-mini\s*\{[^}]*position:\s*static/);
  });
});
