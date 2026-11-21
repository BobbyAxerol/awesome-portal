/**
 * QA 2026-10-02 second wave · group S00_S01_S12: UX-3 legacy alpha pick, UX-11 history,
 * UX-16 dangling arrow, UX-20 labelled defaults, and the new long sentences.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, useNavigationType, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtlasDocument } from "./atlas";
import { EngineAtlas } from "./EngineAtlas";
import { RunLibrary, openTarget, PICK_TARGET_LABEL, effectivePickTarget } from "./RunLibrary";
import { forgetRunLabels, rememberRunLabels } from "./runLabels";
import type { RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";
import { researchState } from "./state";
import { useRunLibrary, type LibraryFilters } from "./useRunLibrary";
import { resolveJourneyCardRoute } from "./screenRoutes";

afterEach(() => {
  cleanup();
  forgetRunLabels();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const library = JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8")) as RunLibraryResponse;
const ATLAS = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures/research-foundation.atlas-current.valid.json"), "utf8")).atlas as AtlasDocument;
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
const bound = library.items.find((item) => item.binding && item.source_kind !== "LEGACY_1_0_8_METADATA") as RunLibraryItem;
const words = (text: string) => text.trim().split(/\s+/).length;

describe("QA2 UX-3 - a legacy alpha pick never lands on the 404 alpha page", () => {
  it("value path: a bound run opens that alpha's Lineage, labelled by the screen's name", () => {
    expect(bound, "fixture needs a bound run").toBeTruthy();
    const target = openTarget(bound, "alpha_version_legacy");
    expect(target.to).toBe(resolveJourneyCardRoute("attempt_lineage", bound.run_id, bound.binding!.alpha_id));
    expect(target.to).toMatch(/\/alphas\/[^/]+\/lineage$/);
    expect(target.to).not.toMatch(/av_/);
    expect(effectivePickTarget("alpha_version_legacy")).toBe("attempt_lineage");
    expect(target.label).toBe(`open ${PICK_TARGET_LABEL.attempt_lineage} →`);
  });

  it("typed-absence path: a row naming no alpha opens its evidence, never an alpha page", () => {
    const scratch = { ...bound, binding: null } as unknown as RunLibraryItem;
    const target = openTarget(scratch, "alpha_version_legacy");
    expect(target.to).toBe(`/research/quantbt/runs/${scratch.run_id}/evidence`);
  });

  it("the CTA tooltip is at most 8 words", () => {
    const title = openTarget(bound, "freeze").title ?? "";
    expect(title).not.toBe("");
    expect(words(title)).toBeLessThanOrEqual(8);
    expect(words(openTarget(bound, "alpha_version_legacy").title ?? "")).toBeLessThanOrEqual(8);
  });
});

describe("QA2 search note", () => {
  it("is at most 8 words", () => {
    rememberRunLabels([]);
    render(
      <MemoryRouter>
        <RunLibrary
          filters={{ ...EMPTY, q: "WFO-023" }}
          onFilters={vi.fn()}
          onToggleSel={vi.fn()}
          response={{ ...library, items: [], page: { ...library.page, total_rows: 3, filtered_rows: 0, has_more: false, has_previous: false } }}
          items={[]}
          state={researchState({ kind: "ok", rowCount: 0 })}
          sparklines={new Map()}
          onVisible={vi.fn()}
          onLoadNext={vi.fn()}
          onLoadPrevious={vi.fn()}
        />
      </MemoryRouter>,
    );
    const note = document.querySelector("[data-search-label-note]")?.textContent ?? "";
    expect(note).toContain("not R-… labels");
    expect(words(note)).toBeLessThanOrEqual(8);
  });
});

describe("QA2 UX-11 - a filter step is a history entry, typing is not", () => {
  function run() {
    const nav: string[] = [];
    function Probe({ children }: { children: ReactNode }) {
      const type = useNavigationType();
      const loc = useLocation();
      nav.push(`${type}:${loc.search}`);
      return <>{children}</>;
    }
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/runs"]}>
        <Probe>{children}</Probe>
      </MemoryRouter>
    );
    const hook = renderHook(() => useRunLibrary(), { wrapper });
    return { hook, nav };
  }

  it("a status step pushes (Back can undo it)", () => {
    const { hook, nav } = run();
    act(() => hook.result.current.setFilters({ ...hook.result.current.filters, status: ["FAILED"] }));
    expect(nav[nav.length - 1]).toBe("PUSH:?status=FAILED");
  });

  it("clearing a filter and toggling group push as well", () => {
    const { hook, nav } = run();
    act(() => hook.result.current.setFilters({ ...hook.result.current.filters, group: true }));
    expect(nav[nav.length - 1]).toBe("PUSH:?group=1");
    act(() => hook.result.current.setFilters({ ...hook.result.current.filters, group: false }));
    expect(nav[nav.length - 1]).toMatch(/^PUSH:/);
  });

  it("typing in the search box replaces, so Back skips keystrokes", () => {
    const { hook, nav } = run();
    act(() => hook.result.current.setFilters({ ...hook.result.current.filters, q: "wfo" }));
    expect(nav[nav.length - 1]).toBe("REPLACE:?q=wfo");
  });
});

describe("QA2 UX-16 - the arrow leads its card, so a wrapped row never dangles one", () => {
  it("no group ends with an arrow and none leads a row's first card", async () => {
    const { JourneyMap } = await import("./JourneyMap");
    const journey = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures/research-foundation.journey-v4.valid.json"), "utf8"));
    render(
      <MemoryRouter>
        <JourneyMap descriptor={journey.descriptor} inspection={null} runId={null} state={researchState({ kind: "ok", rowCount: 1 })} />
      </MemoryRouter>,
    );
    const groups = Array.from(document.querySelectorAll("[data-card-group]"));
    expect(groups.length).toBeGreaterThan(5);
    let arrows = 0;
    for (const group of groups) {
      const kids = Array.from(group.children);
      expect(kids[kids.length - 1]?.hasAttribute("data-arrow")).toBe(false);
      arrows += group.querySelectorAll("[data-arrow]").length;
    }
    expect(arrows).toBeGreaterThan(0);
    for (const phase of Array.from(document.querySelectorAll("[data-phase]"))) {
      expect(phase.querySelector("[data-card-group]")?.querySelector("[data-arrow]")).toBeNull();
    }
  });
});

describe("QA2 UX-20 - the optimizer defaults are labelled, not a key=value dump", () => {
  it("value path: each group and field reads as words with its value; the raw key stays in the tooltip", () => {
    render(
      <MemoryRouter>
        <EngineAtlas doc={ATLAS} state={researchState({ kind: "ok", rowCount: 1 })} tab="modes" onTabChange={vi.fn()} />
      </MemoryRouter>,
    );
    const facts = document.querySelector("[data-release-facts]") as HTMLElement;
    expect(facts.textContent).not.toMatch(/[a-z]+_[a-z]+=/);
    expect(facts.textContent).not.toMatch(/\w=\d/);
    const groups = facts.querySelectorAll("[data-default-group]");
    expect(groups.length).toBeGreaterThan(0);
    const first = groups[0] as HTMLElement;
    const field = first.querySelector("[data-default-field-id]") as HTMLElement;
    expect(field.getAttribute("title")).toContain(field.getAttribute("data-default-field-id")!);
    expect(field.textContent).not.toContain("_");
    expect(field.textContent).not.toContain("=");
  });

  it("typed-absence path: a null default still reads 'unset', never 'null'", () => {
    const doc = structuredClone(ATLAS);
    const text = JSON.stringify(doc).replace(/"default_value":[^,}]+/g, '"default_value":null');
    render(
      <MemoryRouter>
        <EngineAtlas doc={JSON.parse(text) as AtlasDocument} state={researchState({ kind: "ok", rowCount: 1 })} tab="modes" onTabChange={vi.fn()} />
      </MemoryRouter>,
    );
    const facts = document.querySelector("[data-release-facts]") as HTMLElement;
    const field = facts.querySelector("[data-default-field-id]") as HTMLElement;
    expect(field.textContent).toContain("unset");
    expect(field.textContent).not.toMatch(/null/);
  });
});
void fireEvent;
void screen;
