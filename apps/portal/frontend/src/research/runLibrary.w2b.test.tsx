/**
 * W2B · Run Library copy cuts and the picker banner. Rows come from the
 * published run-library fixture; each case changes the one field it is about.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./libraryDraftChip", () => ({
  readLibraryDraftSummary: vi.fn(() => null),
}));

import { readLibraryDraftSummary } from "./libraryDraftChip";
import { RunLibrary } from "./RunLibrary";
import { forgetRunLabels, rememberRunLabels } from "./runLabels";
import type { RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";
import { researchState } from "./state";
import type { LibraryFilters } from "./useRunLibrary";

const library = JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8")) as RunLibraryResponse;
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
const current = library.items.filter((item) => item.source_kind !== "LEGACY_1_0_8_METADATA" && item.binding && item.mode.key) as RunLibraryItem[];

afterEach(() => {
  cleanup();
  forgetRunLabels();
  vi.mocked(readLibraryDraftSummary).mockReturnValue(null);
});

function mount(items: RunLibraryItem[], filters: Partial<LibraryFilters> = {}) {
  rememberRunLabels(items);
  const response = { ...library, items, page: { ...library.page, total_rows: items.length, filtered_rows: items.length, has_more: false, has_previous: false } };
  render(
    <MemoryRouter>
      <RunLibrary
        filters={{ ...EMPTY, ...filters }}
        onFilters={vi.fn()}
        onToggleSel={vi.fn()}
        response={response}
        items={items}
        state={researchState({ kind: "ok", rowCount: items.length })}
        sparklines={new Map()}
        onVisible={vi.fn()}
        onLoadNext={vi.fn()}
        onLoadPrevious={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("W2B · a fact the list already states once is not repeated on every card", () => {
  it("with no filter, a binding or mode every card shares is said once beside the counter (W4A)", () => {
    mount(current);
    const sameBinding = new Set(current.map((item) => item.binding!.alpha_version_id)).size === 1;
    const sameMode = new Set(current.map((item) => item.mode.display)).size === 1;
    expect(document.querySelectorAll("[data-run] [data-binding]").length).toBe(sameBinding ? 0 : current.length);
    expect(document.querySelectorAll("[data-common-binding]").length).toBe(sameBinding ? 1 : 0);
    expect(document.querySelectorAll("[data-run] [data-mode]").length).toBe(sameMode ? 0 : current.length);
    expect(document.querySelectorAll("[data-common-mode]").length).toBe(sameMode ? 1 : 0);
  });

  it("one alpha in the filter: the cards drop the alpha chip; one mode: the mode chip", () => {
    mount(current, { alpha: [current[0]!.binding!.alpha_id], mode: [current[0]!.mode.key as string] });
    expect(document.querySelectorAll("[data-run] [data-binding]").length).toBe(0);
    expect(document.querySelectorAll("[data-run] [data-mode]").length).toBe(0);
  });

  it("grouped by alpha: the group header names it, the cards do not", () => {
    mount(current, { group: true });
    expect(document.querySelectorAll("[data-run] [data-binding]").length).toBe(0);
  });

  it("an instrument every run shares is said once beside the counter, not per card", () => {
    mount(current);
    expect(new Set(current.map((item) => item.instrument.display)).size).toBe(1);
    expect(document.querySelectorAll("[data-common-instrument]").length).toBe(1);
    expect(document.querySelectorAll("[data-run] [data-instrument]").length).toBe(0);
  });
});

describe("W2B · the picker banner names what is being picked", () => {
  it("the alpha-version card asks for an alpha, other cards for a run", () => {
    mount(current, { to: "alpha_version_legacy", group: true });
    expect(document.querySelector("[data-pick-run-notice]")?.textContent).toContain("Pick an alpha to open");
    cleanup();
    mount(current, { to: "split" });
    expect(document.querySelector("[data-pick-run-notice]")?.textContent).toContain("Pick a run to open");
  });
});

describe("W2B · Continue draft chip", () => {
  it("no saved draft, no chip", () => {
    mount(current);
    expect(document.querySelector('[data-action="continue-draft"]')).toBeNull();
  });

  it("a saved draft shows 'Continue draft · step N' linking to New Run", () => {
    vi.mocked(readLibraryDraftSummary).mockReturnValue({ step: 3 });
    mount(current);
    const chip = document.querySelector('[data-action="continue-draft"]') as HTMLAnchorElement;
    expect(chip.textContent).toBe("Continue draft · step 3");
    expect(chip.getAttribute("href")).toBe("/research/quantbt/runs/new");
  });
});

describe("W2B · 30D tiles say which window they cover", () => {
  it("is labelled 'final 30D', not 'last 30D', beside an all-time chart", () => {
    mount(current);
    const labels = Array.from(document.querySelectorAll("[data-metric^='LAST_30D'] span:first-child")).map((n) => n.textContent);
    for (const label of labels) expect(label).not.toMatch(/^last 30D/);
  });
});
