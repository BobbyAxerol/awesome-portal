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
  it("carries the HiFi kicker and title", () => {
    draw();
    expect(document.querySelector("[data-journey-kicker]")?.textContent).toBe("Quant Ecosystem Portal · Research");
    expect(document.querySelector("h1")?.textContent).toBe("Journey Map");
    expect(document.querySelector("h1")?.className).toContain("text-[27px]");
    expect(document.querySelector("h1")?.className).toContain("font-normal");
  });

  it("puts a two-swatch legend on the right of the title", () => {
    draw();
    const head = document.querySelector("[data-journey-head]") as HTMLElement;
    const legend = head.querySelector("[data-legend]") as HTMLElement;
    expect(legend).toBeTruthy();
    expect(Array.from(legend.querySelectorAll("[data-legend-tag]")).map((n) => n.textContent)).toEqual(["shipped hi-fi", "redesigned"]);
    // legend follows the title block inside the same header row
    expect(head.firstElementChild?.querySelector("h1")).toBeTruthy();
    expect(head.lastElementChild).toBe(legend);
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

describe("S00 mapping block (00-8…10)", () => {
  it("prints the HiFi caps header and no footnote", () => {
    draw();
    const block = document.querySelector("[data-mapping]") as HTMLElement;
    expect(block.querySelector("h2")?.textContent).toBe("Shipped tab → new screen");
    expect(block.querySelector("h2")?.className).toContain("uppercase");
    expect(block.textContent).not.toContain("skeleton");
    expect(block.querySelectorAll("[data-mapping-row]")).toHaveLength(V4.descriptor.mapping.length);
  });

  it("without a run, the redesign column opens the Run Library as the picker", () => {
    draw();
    const mine = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-mapping-cell='mine']"));
    expect(mine.map((a) => a.getAttribute("href"))).toEqual([
      "/research/quantbt/runs?to=evidence_hub",
      "/research/quantbt/runs?to=search_selection",
      "/research/quantbt/runs?to=freeze",
      "/research/quantbt/runs?to=execute_replay",
      "/research/quantbt/runs?to=release_candidate",
      "/research/quantbt/runs?to=split",
    ]);
    expect(mine[0].title).toBe("Pick a run to open");
  });

  it("with a run in hand, the redesign column opens that run's screen", () => {
    draw(RUN);
    const mine = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-mapping-cell='mine']"));
    expect(mine.map((a) => a.getAttribute("href"))).toEqual([
      `/research/quantbt/runs/${RUN}/evidence`,
      `/research/quantbt/runs/${RUN}/search`,
      `/research/quantbt/runs/${RUN}/freeze`,
      `/research/quantbt/runs/${RUN}/execute`,
      `/research/quantbt/runs/${RUN}/release-candidate`,
      `/research/quantbt/runs/${RUN}/split`,
    ]);
  });

  it("draws a shipped-tab key this build does not route as plain text, never a guessed link", () => {
    draw(RUN);
    const shipped = Array.from(document.querySelectorAll<HTMLElement>("[data-mapping-cell='shipped']"));
    expect(shipped).toHaveLength(V4.descriptor.mapping.length);
    for (const cell of shipped) {
      const key = cell.getAttribute("data-mapping-key") as string;
      const routed = cell.hasAttribute("data-mapping-no-shipped-tab") ? null : mappingHref(key, RUN);
      if (routed) expect(cell.getAttribute("href")).toBe(routed.href);
      else {
        expect(cell.tagName).toBe("SPAN");
        expect(cell.hasAttribute("data-mapping-unrouted") || cell.hasAttribute("data-mapping-no-shipped-tab")).toBe(true);
      }
    }
  });

  it("mappingHref refuses a key that is already a URL", () => {
    expect(mappingHref("https://evil.example.com", RUN)).toBeNull();
    expect(mappingHref("../../admin", null)).toBeNull();
  });
});
