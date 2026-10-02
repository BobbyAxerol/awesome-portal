/**
 * QA 2026-10-02 · S01 Run Library fixes (group S00_S01_S12). Rows are the
 * published run-library fixture; each case changes the one field it is about.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LABEL_SHAPED_QUERY,
  LEGACY_PICK_REPLACEMENT,
  PICK_TARGET_LABEL,
  RunLibrary,
  effectivePickTarget,
  failureReasonWords,
  openTarget,
  statDisplay,
} from "./RunLibrary";
import { forgetRunLabels, rememberRunLabels } from "./runLabels";
import type { RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";
import { researchState } from "./state";
import type { LibraryFilters } from "./useRunLibrary";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const library = JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8")) as RunLibraryResponse;
const journey = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures/research-foundation.journey-v4.valid.json"), "utf8")) as {
  descriptor: { mapping: { shipped_target_key: string; mine_target_key: string }[] };
};
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
const base = (library.items.find((item) => item.status === "COMPLETED") ?? library.items[0]!) as RunLibraryItem;

afterEach(() => {
  cleanup();
  forgetRunLabels();
  vi.restoreAllMocks();
});

const row = (id: string, over: Partial<RunLibraryItem> = {}): RunLibraryItem =>
  ({ ...base, run_id: id, display_label: `R-${id.toUpperCase()}`, ...over }) as RunLibraryItem;

function mount(items: RunLibraryItem[], filters: Partial<LibraryFilters> = {}, onToggleSel = vi.fn(), onFilters = vi.fn()) {
  rememberRunLabels(items);
  const response = { ...library, items, page: { ...library.page, total_rows: items.length, filtered_rows: items.length, has_more: false, has_previous: false } };
  render(
    <MemoryRouter>
      <RunLibrary
        filters={{ ...EMPTY, ...filters }}
        onFilters={onFilters}
        onToggleSel={onToggleSel}
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
  return { onToggleSel, onFilters };
}

describe("S01 UX-3/4 - a shipped-tab pick opens the screen that replaces it", () => {
  it("every shipped run tab of the published mapping has a screen word and a replacement", () => {
    const shipped = journey.descriptor.mapping.map((m) => m.shipped_target_key).filter((key) => key.endsWith("_legacy"));
    expect(shipped.length).toBeGreaterThan(3);
    for (const key of shipped) {
      expect(PICK_TARGET_LABEL[key], key).toBeDefined();
      expect(PICK_TARGET_LABEL[key]).not.toMatch(/_/);
      expect(LEGACY_PICK_REPLACEMENT[key], key).toBeDefined();
    }
  });

  it("value path: a current-engine run opens the redesigned screen, not the legacy API that does not know it", () => {
    expect(openTarget(base, "run_overview_legacy").to).toBe(`/research/quantbt/runs/${base.run_id}/evidence`);
    expect(openTarget(base, "run_optimization_legacy").to).toBe(`/research/quantbt/runs/${base.run_id}/search`);
    expect(openTarget(base, "run_audit_legacy").label).toBe("open Release Candidate & Publish →");
    expect(effectivePickTarget("freeze")).toBe("freeze");
  });

  it("the banner names the screen, never the raw key", () => {
    mount([base], { to: "run_overview_legacy" });
    const banner = document.querySelector("[data-pick-run-notice]") as HTMLElement;
    expect(banner.textContent).toContain("Evidence Flow");
    expect(banner.textContent).not.toContain("run_overview_legacy");
  });

  it("a legacy 1.0.8 row keeps its own workspace", () => {
    const legacy = row("legacy1", { source_kind: "LEGACY_1_0_8_METADATA" });
    expect(openTarget(legacy, "run_progress_legacy").to).toBe("/research/quantbt/runs/legacy1/overview");
  });

  it("a recovering run opens Progress, not evidence it does not have (UX-13)", () => {
    expect(openTarget(row("rec", { status: "RECOVERY_REQUIRED" })).to).toBe("/research/quantbt/runs/rec/progress");
  });
});

describe("S01 UX-1 - the search says what it reads", () => {
  it("placeholder does not promise what the server does not match", () => {
    mount([base]);
    expect((screen.getByLabelText("Filter runs") as HTMLInputElement).placeholder).toBe("run id, alpha, symbol");
  });

  it("value path: an empty result for a label-shaped query says labels are not searched", () => {
    expect(LABEL_SHAPED_QUERY.test("R-WFO-023")).toBe(true);
    expect(LABEL_SHAPED_QUERY.test("P04-018")).toBe(true);
    expect(LABEL_SHAPED_QUERY.test("WFO")).toBe(true);
    expect(LABEL_SHAPED_QUERY.test("zzzz-nothing")).toBe(false);
    mount([], { q: "WFO-023" });
    expect(document.querySelector("[data-search-label-note]")?.textContent).toContain("not R-… labels");
  });

  it("typed-absence path: another empty query gets no note", () => {
    mount([], { q: "zzzz-nothing" });
    expect(document.querySelector("[data-empty]")).not.toBeNull();
    expect(document.querySelector("[data-search-label-note]")).toBeNull();
  });
});

describe("S01 UX-5 - the third pick says what it replaced; a refusal names both runs", () => {
  const a = row("aa", { comparison: { ...base.comparison, key: "k1" } } as Partial<RunLibraryItem>);
  const b = row("bb", { comparison: { ...base.comparison, key: "k1" } } as Partial<RunLibraryItem>);
  const c = row("cc", { comparison: { ...base.comparison, key: "k2" } } as Partial<RunLibraryItem>);

  it("value path: ticking a third run names the one dropped", () => {
    mount([a, b, c], { sel: ["aa", "bb"] });
    expect(document.querySelector("[data-compare-replaced]")).toBeNull();
    fireEvent.click(document.querySelector('[data-compare-check="cc"]') as HTMLElement);
    /* The controller owns `sel`; the bar keeps the note for the pick that evicted. */
    expect(document.querySelector("[data-compare-replaced]")?.textContent).toBe("max 2 — replaced R-AA");
  });

  it("typed-absence path: un-ticking or a first pick says nothing", () => {
    mount([a, b], { sel: ["aa"] });
    fireEvent.click(document.querySelector('[data-compare-check="bb"]') as HTMLElement);
    expect(document.querySelector("[data-compare-replaced]")).toBeNull();
  });

  it("a refused pair names both runs", () => {
    mount([a, c], { sel: ["aa", "cc"] });
    const pair = document.querySelector("[data-compare-pair]") as HTMLElement;
    expect(pair.textContent).toContain("R-AA");
    expect(pair.textContent).toContain("R-CC");
  });

  it("an open pair needs no naming line", () => {
    mount([a, b], { sel: ["aa", "bb"] });
    expect(document.querySelector("[data-compare-pair]")).toBeNull();
  });
});

describe("S01 - labels, not wire ids, in names a screen reader reads (UX-21) and a copy that says so (UX-10)", () => {
  it("the checkbox and the id button carry the label", () => {
    mount([row("zz")]);
    expect(screen.getByRole("checkbox").getAttribute("aria-label")).toBe("select R-ZZ for compare");
    expect(document.querySelector("[data-run-id]")?.getAttribute("aria-label")).toBe("run R-ZZ, copy id");
    expect(document.body.innerHTML).not.toMatch(/aria-label="[^"]*rrun_/);
  });

  it("a click shows 'copied' beside the label", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount([row("zz")]);
    fireEvent.click(document.querySelector("[data-run-id]") as HTMLElement);
    await screen.findByText("copied");
    expect(writeText).toHaveBeenCalledWith("zz");
  });
});

describe("S01 - a pill that never holds a value is not drawn; a failure reads in words", () => {
  it("cert pill: drawn with a grade, absent without one", () => {
    mount([row("g1", { certificate: { grade: "B", availability: { state: "AVAILABLE", reason_code: null } } } as Partial<RunLibraryItem>)]);
    expect(document.querySelector("[data-certificate]")?.textContent).toBe("cert B");
    cleanup();
    mount([row("g2", { certificate: { grade: null, availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" } } } as Partial<RunLibraryItem>)]);
    expect(document.querySelector("[data-certificate]")).toBeNull();
    expect(document.querySelector("[data-run]")?.getAttribute("data-certificate-absent")).toBe("SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE");
  });

  it("failure tokens read as words; unknown shapes stay as served", () => {
    expect(failureReasonWords("ENGINE_ERROR")).toBe("engine error");
    expect(failureReasonWords("ARTIFACT_COMMIT_FAILED")).toBe("artifact commit failed");
    expect(failureReasonWords("P06_RETRY_NOT_DISPATCHED")).toBe("retry not dispatched");
    expect(statDisplay({ role: "FAILURE_REASON", value: "ENGINE_ERROR" })).toBe("engine error");
    expect(statDisplay({ role: "FAILURE_REASON", value: "Engine said: out of memory" })).toBe("Engine said: out of memory");
    expect(statDisplay({ role: "FAILURE_REASON", value: null })).toBeNull();
  });
});
