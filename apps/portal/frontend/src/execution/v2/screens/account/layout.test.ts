/**
 * Accounts layout guard (UXM-10 F-3). jsdom has no layout, so this pins the rule that fixed it; the browser proof is
 * the `access ·` test of e2e/execution-v2-coexistence.spec.ts (no page-level sideways scroll at 1024).
 *
 * The register table sits in `.exec-cards-wrap` (overflow-x: auto). A screen-reader-only span inside a cell is
 * `position: absolute`; with no positioned ancestor inside the scroller its containing block is the page, so it escaped
 * the scroller and widened the page by the table's overhang. The wrap must be the containing block on this screen.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../css/account.css"), "utf8");

describe("Accounts register table does not widen the page", () => {
  it("the scroller is the containing block of the absolutely positioned screen-reader text", () => {
    expect(css).toMatch(/\.exec-acct-v2 \.exec-cards-wrap\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.exec-acct-sr\s*\{[^}]*position:\s*absolute/);
  });
});

describe("The demoted body is one shared cue and keeps AA text contrast (UXM-10 F-5, DEBT-UXM07-039)", () => {
  const blocks = readFileSync(resolve(__dirname, "../../css/blocks.css"), "utf8");
  const rule = /(?:^|\})\s*\.exec-blk-demoted\s*\{([^}]*)\}/m.exec(blocks.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";

  it("steps the ink down one token and never uses opacity (opacity .85 put the faint label at 4.0:1)", () => {
    expect(rule).toMatch(/--ink:\s*var\(--ink-soft\)/);
    expect(rule).not.toMatch(/opacity/);
    expect(rule).not.toMatch(/--ink-faint/);
  });

  it("no screen overrides the demotion: Account 360 uses the same rule as Workbench, Replay and the Event feed", () => {
    expect(css).not.toMatch(/exec-blk-demoted/);
  });
});
