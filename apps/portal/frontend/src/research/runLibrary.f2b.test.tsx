/**
 * Batch F2b · S01 - flow links and less prose.
 *
 *  1. A stage chip that has a state opens that stage for the run; a pending chip is not a link.
 *  2. A failed run opens Run Progress (the HiFi's "run console"), a completed one Evidence Flow.
 *  3. The picker banner is short; its second sentence is a tooltip.
 *  4. With more than one alpha listed the lineage hint is a button that groups by alpha.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunLibrary, openTarget } from "./RunLibrary";
import type { RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";
import type { LibraryFilters } from "./useRunLibrary";
import { researchState } from "./state";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8"),
) as RunLibraryResponse;
const row = (id: string): RunLibraryItem => fixture.items.find((r) => r.run_id === id)!;
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };

function mount(items: RunLibraryItem[], filters: LibraryFilters = EMPTY, onFilters = vi.fn()) {
  const response = { ...fixture, items };
  render(
    <MemoryRouter>
      <RunLibrary
        filters={filters}
        onFilters={onFilters}
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

afterEach(cleanup);

describe("F2b S01 - flow", () => {
  it("stage chips with a state link to their stage for this run; a pending one does not", () => {
    const run = row("R-WFO-118");
    mount([run]);
    const id = encodeURIComponent(run.run_id);
    const s1 = document.querySelector('[data-stage-link="S1"]') as HTMLAnchorElement;
    expect(s1.getAttribute("href")).toBe(`/research/quantbt/runs/${id}/split`);
    expect(s1.getAttribute("aria-label")).toBe("open S1 for this run");
    expect((document.querySelector('[data-stage-link="S4"]') as HTMLAnchorElement | null)?.getAttribute("href")).toBe(
      `/research/quantbt/runs/${id}/execute`,
    );
    for (const stage of run.stages.filter((s) => s.state === "pend")) {
      expect(document.querySelector(`[data-stage-link="${stage.key}"]`)).toBeNull();
    }
  });

  it("a failed run opens Run Progress, a completed one Evidence Flow", () => {
    expect(openTarget({ ...row("R-WFO-118"), status: "FAILED" }).to).toMatch(/\/progress$/);
    expect(openTarget({ ...row("R-WFO-118"), status: "COMPLETED" }).to).toMatch(/\/evidence$/);
  });

  it("the picker banner is short and carries its second sentence as a tooltip", () => {
    mount([row("R-WFO-118")], { ...EMPTY, to: "execute_replay" });
    const notice = document.querySelector("[data-pick-run-notice]") as HTMLElement;
    expect(notice.textContent).not.toContain("Each card");
    expect(notice.querySelector("span[title]")?.getAttribute("title")).toContain("Each card");
  });

  it("two alphas listed: the lineage hint is a button that groups by alpha", () => {
    const other = { ...row("R-WFO-120"), binding: { ...row("R-WFO-120").binding!, alpha_id: "other-alpha" } };
    const onFilters = vi.fn();
    mount([row("R-WFO-118"), other], EMPTY, onFilters);
    const hint = document.querySelector("[data-lineage-hint]") as HTMLButtonElement;
    expect(hint.tagName).toBe("BUTTON");
    expect(hint.getAttribute("title")).toContain("Group by alpha");
    fireEvent.click(hint);
    expect(onFilters).toHaveBeenCalledWith({ ...EMPTY, group: true });
  });

  it("one alpha listed: the hint links to that alpha's lineage", () => {
    const run = row("R-WFO-118");
    mount([run]);
    const hint = document.querySelector("[data-lineage-hint]") as HTMLAnchorElement;
    expect(hint.getAttribute("href")).toBe(`/research/quantbt/alphas/${run.binding!.alpha_id}/lineage`);
  });
});
