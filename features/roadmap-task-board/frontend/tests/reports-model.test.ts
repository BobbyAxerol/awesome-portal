/**
 * Reports content-integrity tests.
 *
 * The claim being defended: the Reports screen now renders from primitives, and
 * that change did NOT alter, drop or invent any of the document's content. The
 * fragment stays the single source and stays hash-gated; these tests check the
 * derivation.
 */
import { describe, expect, it } from "vitest";

import { VIEW_PANELS } from "../src/content/views";
import viewManifest from "../src/content/content-integrity-views.json";
import {
  ReportsParseError,
  documentStrings,
  parseReportsFragment,
} from "../src/features/reports/reportsModel";

const fragment = VIEW_PANELS.find((panel) => panel.id === "view-reports")!;

/** Visible text of the fragment, with the hidden copy-source twin removed. */
function fragmentVisibleText(html: string): string {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body;
  // `.mermaid-source` is `hidden` and duplicates the visible `<pre>`, so it is
  // not part of what a reader sees.
  root.querySelectorAll(".mermaid-source").forEach((node) => node.remove());
  return (root.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("fragment is still the locked source", () => {
  it("keeps the hash the integrity manifest recorded", () => {
    // Parsing must never be an excuse to edit the document.
    const stored = viewManifest.views.find((view: { id: string }) => view.id === "view-reports");
    expect(stored?.sha256).toBe(fragment.sha256);
  });
});

describe("parseReportsFragment", () => {
  const parsed = parseReportsFragment(fragment.html);

  it("reads the document's own title and repository link", () => {
    expect(parsed.title).toBe("Stakeholder Interpretation & Reporting");
    expect(parsed.repository.label).toBe("Open repository");
    expect(parsed.repository.href).toBe(
      "https://github.com/BobbyAxerol/awesome-quant-interpretation",
    );
  });

  it("preserves the inline code run in the intro", () => {
    // The paragraph opens with `<code>awesome-quant-interpretation</code>`;
    // flattening it to plain text would lose that the name is an identifier.
    expect(parsed.intro[0]).toEqual({ kind: "code", value: "awesome-quant-interpretation" });
    expect(parsed.intro.some((run) => run.kind === "text")).toBe(true);
  });

  it("reads the recommended role and its detail separately", () => {
    expect(parsed.role.title).toBe("Recommended role: report-generation worker");
    expect(parsed.role.detail).toMatch(/Run Registry và Approval Inbox/);
  });

  it("reads the three content cards and excludes the diagram card", () => {
    expect(parsed.cards.map((card) => card.eyebrow)).toEqual(["Inputs", "Analysis", "Outputs"]);
    expect(parsed.cards.map((card) => card.heading)).toEqual([
      "Backtest evidence",
      "Risk & robustness",
      "Decision artifacts",
    ]);
    // The diagram shares `.report-grid-card`; treating it as a content card
    // would render an empty fourth tile.
    expect(parsed.cards).toHaveLength(3);
  });

  it("keeps the mermaid source line-for-line", () => {
    expect(parsed.diagram.caption).toBe("Reporting target flow");
    expect(parsed.diagram.source.split("\n")[0]).toBe("flowchart LR");
    // Mermaid is whitespace-sensitive: the newlines must survive parsing.
    expect(parsed.diagram.source.split("\n").length).toBeGreaterThan(8);
    expect(parsed.diagram.source).toContain("F --> G[Approve / Reject / Request Rerun]");
  });

  it("throws instead of half-rendering when the shape is wrong", () => {
    // The fragment is hash-gated, so a parse failure means the parser is wrong
    // about a document that cannot drift — that must be loud.
    expect(() => parseReportsFragment("<div>nothing here</div>")).toThrow(ReportsParseError);
  });
});

describe("no content lost or invented", () => {
  it("accounts for every visible string in the fragment", () => {
    const parsed = parseReportsFragment(fragment.html);
    const visible = fragmentVisibleText(fragment.html);

    // Every string the model carries must appear in the fragment: nothing was
    // invented on the way through the parser.
    for (const value of documentStrings(parsed)) {
      expect(visible, `missing from fragment: ${value}`).toContain(value);
    }

    // And the fragment's visible prose must be covered by the model: nothing was
    // dropped. The diagram source and the copy-button label are chrome rather
    // than prose, so they are removed before the comparison.
    let remaining = visible;
    for (const value of [...documentStrings(parsed), parsed.diagram.source.replace(/\s+/g, " "), "Copy Mermaid"]) {
      remaining = remaining.replace(value, "");
    }
    expect(remaining.replace(/[\s|]+/g, "")).toBe("");
  });
});
