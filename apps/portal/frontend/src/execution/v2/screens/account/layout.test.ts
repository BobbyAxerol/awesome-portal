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

describe("Account 360 demoted body keeps AA text contrast (UXM-10 F-5)", () => {
  it("re-points the faint ink to the soft ink inside .exec-blk-demoted, on this screen only", () => {
    expect(css).toMatch(/\.exec-acct-v2 \.exec-blk-demoted\s*\{[^}]*--ink-faint:\s*var\(--ink-soft\)/);
    const blocks = readFileSync(resolve(__dirname, "../../css/blocks.css"), "utf8");
    // The shared rule is untouched: Workbench, Replay and the Event feed share it.
    expect(blocks).toMatch(/\.exec-blk-demoted\s*\{[^}]*opacity:\s*0\.85/);
    expect(blocks).not.toMatch(/\.exec-blk-demoted[^{]*\{[^}]*--ink-faint/);
  });
});
