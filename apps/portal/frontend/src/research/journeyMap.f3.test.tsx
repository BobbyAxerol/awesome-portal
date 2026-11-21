/**
 * F3 · S00 — HiFi parity of the Journey Map header, phase labels and mapping block
 * (inventory 00-1a…d, 00-2, 00-8…10). Bodies are the canonical revision-4 fixture.
 */
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { JourneyMap, mappingHref } from "./JourneyMap";
import type { JourneyResponse } from "./foundationClient";
import { researchState } from "./state";

afterEach(cleanup);

const V4 = JSON.parse(
  readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-foundation.journey-v4.valid.json"), "utf8"),
) as JourneyResponse;

const RUN = "rrun_17f762128acf8c998ac7cc44d13f663f";

function draw(runId: string | null = null) {
  render(
    <MemoryRouter>
      <JourneyMap descriptor={V4.descriptor} inspection={null} state={researchState({ kind: "ok", rowCount: 1 })} runId={runId} />
    </MemoryRouter>,
  );
}

describe("S00 header (00-1a…d)", () => {
  it("carries the title and no kicker (fewer words); the descriptor revision is a data attribute", () => {
    draw();
    expect(document.querySelector("[data-journey-kicker]")).toBeNull();
    expect(document.querySelector("h1 [data-descriptor-revision]")?.getAttribute("data-descriptor-revision")).toBe(String(V4.descriptor.revision));
    expect(document.querySelector("h1")?.textContent).toBe("Journey Map");
  });

  it("puts a one-swatch legend on the right of the title (no 'shipped hi-fi': those screens redirect)", () => {
    draw();
    const head = document.querySelector("[data-journey-head]") as HTMLElement;
    const legend = head.querySelector("[data-legend]") as HTMLElement;
    expect(legend).toBeTruthy();
    expect(Array.from(legend.querySelectorAll("[data-legend-tag]")).map((n) => n.textContent)).toEqual(["redesigned"]);
    /* W4A: the legend sits under the one page-header h1 */
    expect(head.closest("[data-page-header]")?.querySelector("h1")).toBeTruthy();
    expect(head.firstElementChild).toBe(legend);
  });
});

describe("S00 phase labels (00-2)", () => {
  it("are set in the body face, not the serif display face", () => {
    draw();
    const titles = Array.from(document.querySelectorAll<HTMLElement>("[data-phase-title]"));
    expect(titles.length).toBe(V4.descriptor.phases.length);
    for (const h of titles) expect(h.style.fontFamily).toBe("var(--font-body)");
  });
});

describe("S00 mapping (removed from the page; the helper stays)", () => {
  it("draws no mapping block and no word 'shipped'", () => {
    draw();
    expect(document.querySelector("[data-mapping]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/shipped/i);
    for (const card of Array.from(document.querySelectorAll<HTMLElement>("[data-card]"))) {
      expect(card.getAttribute("title") ?? "").not.toMatch(/shipped/i);
    }
  });

  it("the three retired-screen nodes (04, 05, 12) open the redesigned screens", () => {
    draw();
    const route = (id: string) => document.querySelector(`[data-card="${id}"]`)?.getAttribute("data-card-route");
    expect(route("run-library-shipped")).toBe("/research/quantbt/runs");
    expect(route("new-run-shipped")).toBe("/research/quantbt/runs/new");
    expect(route("alpha-imports-shipped")).toBe("/research/quantbt/alpha-import");
  });

  it("mappingHref refuses a key that is already a URL", () => {
    expect(mappingHref("https://evil.example.com", RUN)).toBeNull();
    expect(mappingHref("../../admin", null)).toBeNull();
  });
});
