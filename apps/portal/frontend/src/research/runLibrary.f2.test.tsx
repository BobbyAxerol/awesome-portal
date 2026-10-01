/**
 * Batch F2 · S01 - bind served-but-unread fields.
 *
 *  1. `relationship` of a child row is marked on the card head.
 *  2. Every journey card that needs a run has a screen word in the Run Library
 *     picker; no raw snake_case key reaches the banner or the card link.
 *
 * Base rows come from the committed run-library fixture; journey targets come
 * from the published journey fixture, not a hand-built list.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PICK_TARGET_LABEL, RunLibrary, openTarget } from "./RunLibrary";
import { rememberRunLabels } from "./runLabels";
import type { RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";
import type { LibraryFilters } from "./useRunLibrary";
import { researchState } from "./state";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8"),
) as RunLibraryResponse;
const journey = JSON.parse(
  readFileSync(
    join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-foundation.journey-v4.valid.json"),
    "utf8",
  ),
) as { descriptor: { phases: { cards: { target_key: string; requires_run: boolean; requires_alpha?: boolean }[] }[] } };

const base = (runId: string): RunLibraryItem => {
  const found = fixture.items.find((row) => row.run_id === runId);
  if (!found) throw new Error(`fixture has no ${runId}`);
  return found;
};
/* The fixture predates D1 (its run_id is the label); give the parent the wire id + label a real read carries. */
const PARENT: RunLibraryItem = {
  ...base("R-WFO-118"),
  run_id: "rrun_11111111111111111111111111111111",
  display_label: "R-WFO-118",
};
const child = (
  runId: string,
  kind: RunLibraryItem["relationship"]["kind"],
  parent: string | null,
): RunLibraryItem => ({
  ...base("R-WFO-119"),
  run_id: runId,
  display_label: null,
  relationship: { ...base("R-WFO-119").relationship, kind, parent_run_id: parent },
});

const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };

function mount(items: RunLibraryItem[], to?: string) {
  const response = { ...fixture, items };
  rememberRunLabels(items);
  render(
    <MemoryRouter>
      <RunLibrary
        filters={to ? { ...EMPTY, to } : EMPTY}
        onFilters={vi.fn()}
        onToggleSel={vi.fn()}
        response={response}
        items={response.items}
        state={researchState({ kind: "ok", rowCount: items.length })}
        sparklines={new Map()}
        onVisible={vi.fn()}
        onLoadNext={vi.fn()}
        onLoadPrevious={vi.fn()}
      />
    </MemoryRouter>,
  );
}
const card = (runId: string) => document.querySelector(`[data-run="${runId}"]`) as HTMLElement;
const mark = (runId: string) => card(runId).querySelector("[data-relationship]") as HTMLElement | null;

afterEach(cleanup);

describe("F2 S01 - relationship marker on the card head", () => {
  it("a reproduction child names its parent by display label when the parent is in the list", () => {
    mount([PARENT, child("rrun_repro", "REPRODUCTION_OF_RUN", PARENT.run_id)]);
    expect(mark("rrun_repro")?.textContent).toBe(`reproduction of ${PARENT.display_label}`);
    expect(mark("rrun_repro")?.getAttribute("data-parent-run")).toBe(PARENT.run_id);
  });

  it("an audit child reads 'audit of'", () => {
    mount([PARENT, child("rrun_audit", "AUDIT_OF_SELECTION", PARENT.run_id)]);
    expect(mark("rrun_audit")?.textContent).toBe(`audit of ${PARENT.display_label}`);
  });

  it("a parent that is not in the list is named by its short id, never a made-up label", () => {
    const unknown = "rrun_0123456789abcdef0123456789abcdef";
    mount([child("rrun_audit", "AUDIT_OF_SELECTION", unknown)]);
    const text = mark("rrun_audit")?.textContent ?? "";
    expect(text.startsWith("audit of ")).toBe(true);
    expect(text).not.toMatch(/R-[A-Z0-9]+-\d+/);
    expect(mark("rrun_audit")?.getAttribute("data-parent-run")).toBe(unknown);
  });

  it("a kind the browser has no wording for is shown as the served token", () => {
    mount([PARENT, child("rrun_diag", "DIAGNOSTIC_OF_RUN", PARENT.run_id)]);
    expect(mark("rrun_diag")?.textContent).toBe(`DIAGNOSTIC_OF_RUN ${PARENT.display_label}`);
  });

  it("a known kind with no parent shows the words alone, no placeholder", () => {
    mount([child("rrun_repro", "REPRODUCTION_OF_RUN", null)]);
    expect(mark("rrun_repro")?.textContent).toBe("reproduction of");
    expect(mark("rrun_repro")?.hasAttribute("data-parent-run")).toBe(false);
  });

  it("a plain run shows nothing", () => {
    mount([PARENT, base("R-LEGACY-07")]);
    expect(PARENT.relationship.kind).toBe("PRIMARY");
    expect(mark(PARENT.run_id)).toBeNull();
    expect(mark("R-LEGACY-07")).toBeNull();
  });
});

describe("F2 S01 - every journey pick target has a screen word", () => {
  const targets = [
    ...new Set(
      journey.descriptor.phases
        .flatMap((phase) => phase.cards)
        .filter((cardRow) => cardRow.requires_run || cardRow.requires_alpha)
        .map((cardRow) => cardRow.target_key),
    ),
  ];

  it("the published journey declares pick targets, including alpha_version_legacy", () => {
    expect(targets.length).toBeGreaterThan(5);
    expect(targets).toContain("alpha_version_legacy");
  });

  it("alpha_version_legacy reads 'Alpha version'", () => {
    expect(PICK_TARGET_LABEL.alpha_version_legacy).toBe("Alpha version");
  });

  it.each(targets)("%s: banner and card link carry no raw snake_case token", (key) => {
    expect(PICK_TARGET_LABEL[key]).toBeDefined();
    mount([PARENT], key);
    const banner = [...document.querySelectorAll("span")].find((node) => node.textContent?.startsWith("Pick a run to open"));
    expect(banner).toBeDefined();
    expect(banner?.textContent).not.toMatch(/[a-z]+_[a-z_]+/);
    expect(openTarget(PARENT, key).label).not.toMatch(/[a-z]+_[a-z_]+/);
  });
});
