/**
 * Alpha 360 inline link guard (UXM-10 F-5, axe link-in-text-block). jsdom has no style cascade for this; the browser
 * proof is the `access ·` test of e2e/execution-v2-coexistence.spec.ts. The "Open" link in the current-facts strip sits in
 * running text and its accent blue is 2.14:1 against the ink (needs 3:1 as a colour-only cue), so it is underlined, on
 * this strip only: the shared .exec-blk-link must not gain an underline for Workbench, Sandbox and Live.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(__dirname, "../../css", name), "utf8");

describe("Alpha 360 current-facts link carries a non-colour cue", () => {
  it("underlines the link inside .exec-alp2-kpis only", () => {
    expect(read("alpha.css")).toMatch(/\.exec-alp2-kpis \.exec-blk-link\s*\{[^}]*text-decoration:\s*underline/);
    expect(read("blocks.css")).not.toMatch(/\.exec-blk-link\s*\{[^}]*text-decoration/);
  });
});

describe("Alpha 360 orders and fills are two-column cards at phone width (DEBT-UXM07-031)", () => {
  const css = read("alpha.css");
  const phone = css.slice(css.indexOf("@media (max-width: 660px)"));

  it("the grid is scoped to .exec-alp2-cardgrid, inside the 660px query, label above value", () => {
    expect(phone).toMatch(/\.exec-alp2-cardgrid tbody tr:not\(\.exec-cards-empty\)\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
    expect(phone).toMatch(/\.exec-alp2-cardgrid tbody tr:not\(\.exec-cards-empty\) td\[data-l\]::before\s*\{[^}]*display:\s*block/);
  });

  it("the id cell is the full-width first line with no label", () => {
    expect(phone).toMatch(/td\[data-l="Order"\],[\s\S]*?td\[data-l="Fill"\]\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*order:\s*-1/);
  });

  it("above 660px the table is the table it was: no cardgrid rule outside the query", () => {
    expect(css.slice(0, css.indexOf("@media (max-width: 660px)"))).not.toMatch(/exec-alp2-cardgrid/);
  });
});
