/**
 * Batch F2b (Bobby 2026-10-01) · Screen 13 flow and less text, on the canonical fixtures.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GUARD_MATCH, GUARD_MATCH_TITLE } from "./CompareDetail";
import { CompareRoute } from "./CompareRoute";
import type { Compare } from "./compareClient";
import { forgetRunLabels } from "./runLabels";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const fixture = (name: string): Compare => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Compare;
const base = "/research/quantbt/alphas/delta-rsi-polynomial-alpha/compare";

function server(body: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/compare" element={<CompareRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const page = () => document.querySelector('[data-screen="compare"]') as HTMLElement;
const settled = () => waitFor(() => expect(page().getAttribute("aria-busy")).toBe("false"));

describe("F2b S13 — every run opens its report, its evidence and its release candidate", () => {
  it("each ladder card links the run's report with the run id, next to Evidence Flow and rc_", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    server(body);
    renderAt(`${base}?mode=attempts`);
    await settled();
    const cards = [...document.querySelectorAll("[data-ladder-run]")] as HTMLElement[];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const run = card.getAttribute("data-ladder-run")!;
      expect(card.querySelector("[data-report-link]")?.getAttribute("href")).toBe(`/research/quantbt/runs/${run}/report`);
      expect(card.querySelector("[data-run-link]")?.getAttribute("href")).toBe(`/research/quantbt/runs/${run}/evidence`);
      expect(card.querySelector("[data-rc-link]")?.getAttribute("href")).toBe(`/research/quantbt/runs/${run}/release-candidate`);
    }
    expect(document.querySelector('[data-action="open-lineage"]')?.getAttribute("href")).toContain("/alphas/delta-rsi-polynomial-alpha/lineage");
  });

  it("the pair's run chips are links to each run's report", async () => {
    const body = fixture("research-compare.pair-ok.valid.json");
    server(body);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    const chips = [...document.querySelectorAll("[data-run-chip-report]")] as HTMLAnchorElement[];
    expect(chips.map((chip) => chip.getAttribute("href"))).toEqual(["/research/quantbt/runs/run_a/report", "/research/quantbt/runs/run_b/report"]);
  });

  it("the key-match sentence is the guard's tooltip; the weaker claim reads as the family with the sentence in its title", async () => {
    const body = fixture("research-compare.pair-ok.valid.json");
    server(body);
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    const guard = document.querySelector('[data-verdict="match"] [data-guard-match]')!;
    expect(guard.textContent).toBe("Same key");
    expect(guard.getAttribute("title")).toContain(GUARD_MATCH_TITLE);
    expect(guard.getAttribute("title")).toContain(GUARD_MATCH);
    const weaker = document.querySelector("[data-promotes-under]")!;
    expect(weaker.getAttribute("title")).toMatch(/the pair promotes under its weaker claim: /);
    expect(weaker.textContent).not.toContain("promotes");
  });

  it("hovering a legend entry isolates that attempt's series; leaving restores all", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    server(body);
    renderAt(`${base}?mode=attempts`);
    await settled();
    const legend = [...document.querySelectorAll("[data-fold-legend-run]")] as HTMLElement[];
    if (legend.length < 2) return;
    const first = legend[0]!.getAttribute("data-fold-legend-run")!;
    const marks = () => [...document.querySelectorAll("[data-fold-bar], [data-fold-line]")] as SVGElement[];
    fireEvent.mouseEnter(legend[0]!);
    const dimmed = marks().filter((mark) => mark.style.opacity === "0.18");
    expect(dimmed.length).toBeGreaterThan(0);
    for (const mark of marks()) {
      const run = (mark.getAttribute("data-fold-bar") ?? mark.getAttribute("data-fold-line") ?? "").split(":")[0];
      expect(mark.style.opacity === "0.18").toBe(run !== first);
    }
    fireEvent.mouseLeave(legend[0]!);
    expect(marks().every((mark) => mark.style.opacity === "")).toBe(true);
    expect(legend[0]!.getAttribute("title")).toContain("hover to isolate");
  });
});
