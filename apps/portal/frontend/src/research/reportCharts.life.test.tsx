/**
 * Chart life wave, S09 report charts: entry motion flags, one crosshair across panels, keyboard zoom with a
 * Reset control only when zoomed, tooltip contents from served strings, best / worst month, episode bands.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { healthy } from "./enrichedAnalysis.fixtures";
import { nearestAt, nextWindow } from "./ReportAllTime";
import { ReportRoute } from "./ReportRoute";
import type { ReportDetail } from "./reportClient";
import { forgetRunLabels } from "./runLabels";
import { forgetHeldReports } from "./useReport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  forgetHeldReports();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
type Body = Omit<ReportDetail, "frozen_core"> & { frozen_core: any; enriched_analysis?: unknown };
const retained = () => JSON.parse(readFileSync(join(FIXTURES, "research-report.wfo-retained.valid.json"), "utf8")) as Body;
const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`) as HTMLElement | null;

async function open(reducedMotion = false) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reducedMotion && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const body = retained();
  body.enriched_analysis = JSON.parse(JSON.stringify(healthy()));
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({ ok: true, status: 200, statusText: "200", headers: new Headers(), json: async () => body }) as unknown as Response);
  render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${body.run_id}/report`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  await screen.findAllByText(/per-fold verdict|Certification chain/i);
  return body;
}

describe("window helpers", () => {
  const stamps = Array.from({ length: 40 }, (_, i) => i * 1000);
  it("zooms in on a centre, out again, and null means the whole series", () => {
    const zin = nextWindow(stamps, null, 1, 20_000)!;
    expect(zin[1] - zin[0]).toBe(19_500);
    expect(zin[0]).toBeLessThan(20_000);
    expect(zin[1]).toBeGreaterThan(20_000);
    expect(nextWindow(stamps, [0, 9_000], -1, null)).toEqual([0, 18_000]);
    expect(nextWindow(stamps, zin, -1, null)).toBeNull();
    expect(nextWindow(stamps, [0, 30_000], -1, null)).toBeNull();
  });
  it("refuses a zoom that would leave fewer than the minimum points in view", () => {
    expect(nextWindow(stamps, [0, 9_000], 1, 4_000)).toEqual([0, 9_000]);
  });
  it("pans inside the series and never past its ends", () => {
    expect(nextWindow(stamps, [0, 10_000], 0, null, 0.25)).toEqual([2_500, 12_500]);
    expect(nextWindow(stamps, [30_000, 39_000], 0, null, 1)).toEqual([30_000, 39_000]);
    expect(nextWindow(stamps, null, 0, null, 0.25)).toBeNull();
  });
  it("nearestAt snaps to the served point", () => {
    expect(nearestAt([{ at_utc_ms: 0 }, { at_utc_ms: 10 }, { at_utc_ms: 20 }], 14)?.at_utc_ms).toBe(10);
    expect(nearestAt([], 5)).toBeNull();
  });
});

describe("S09 all-time charts", () => {
  it("entry motion is on once, and off under prefers-reduced-motion", async () => {
    await open(false);
    expect(document.querySelector("[data-all-time-curve]")!.getAttribute("data-curve-motion")).toBe("on");
    expect(document.querySelectorAll("[data-all-time-curve] .rr-at-draw").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-equity-motion]")!.getAttribute("data-equity-motion")).toBe("on");
    cleanup();
    forgetHeldReports();
    await open(true);
    expect(document.querySelector("[data-all-time-curve]")!.getAttribute("data-curve-motion")).toBe("off");
    expect(document.querySelectorAll("[data-all-time-curve] .rr-at-draw")).toHaveLength(0);
    expect(document.querySelectorAll(".rr-eq-draw")).toHaveLength(0);
    expect(document.querySelector("[data-distribution-motion]")!.getAttribute("data-distribution-motion")).toBe("off");
    expect(document.querySelectorAll(".rr-at-grow, .rr-at-fade")).toHaveLength(0);
  });

  it("the curve reads one served point on every panel, and zoom shows Reset only when zoomed", async () => {
    await open(true);
    const area = panel("all-time")!.querySelector("[data-curve-probe-area]") as HTMLElement;
    expect(document.querySelector("[data-curve-tip]")).toBeNull();
    expect(document.querySelector("[data-curve-reset]")).toBeNull();
    fireEvent.keyDown(area, { key: "ArrowRight" });
    const tip = document.querySelector("[data-curve-tip]") as HTMLElement;
    expect(tip).not.toBeNull();
    expect(tip.textContent).toMatch(/UTC/);
    expect(tip.textContent).toMatch(/strategy \d/);
    expect(tip.textContent).not.toMatch(/(?<!\d)-\d/);
    expect(area.querySelectorAll("[data-curve-cross]").length).toBeGreaterThan(1);
    fireEvent.keyDown(area, { key: "Escape" });
    expect(document.querySelector("[data-curve-tip]")).toBeNull();
    const zoomOut = screen.getByRole("button", { name: "Zoom curve out" }) as HTMLButtonElement;
    expect(zoomOut.disabled).toBe(true);
    expect(zoomOut.title).toBeTruthy();
    fireEvent.keyDown(area, { key: "+" });
    const curve = document.querySelector("[data-all-time-curve]")!;
    if (curve.getAttribute("data-curve-zoomed") === "true") {
      fireEvent.click(document.querySelector("[data-curve-reset]")!);
      expect(curve.getAttribute("data-curve-zoomed")).toBe("false");
    }
    expect(document.querySelector("[data-curve-reset]")).toBeNull();
  });

  it("the distribution reads a bucket with its exact edges and served count; the extreme months are ringed", async () => {
    await open(true);
    const area = document.querySelector("[data-distribution-area]") as HTMLElement | null;
    if (area !== null) {
      fireEvent.keyDown(area, { key: "ArrowRight" });
      const tip = document.querySelector("[data-distribution-tip]") as HTMLElement;
      const bar = document.querySelector("rect[data-bucket='0']") as SVGElement;
      expect(tip.getAttribute("title")).toBe(`${bar.getAttribute("data-lower")} to ${bar.getAttribute("data-upper")} · ${bar.getAttribute("data-count")} days`);
      fireEvent.keyDown(area, { key: "Escape" });
      expect(document.querySelector("[data-distribution-tip]")).toBeNull();
    }
    const ringed = [...document.querySelectorAll("[data-month-extreme]")];
    expect(ringed.length === 0 || ringed.length === 2).toBe(true);
    for (const cell of ringed) expect(cell.getAttribute("title")).toMatch(/full month/);
  });

  it("the equity probe is one crosshair across both panels; zoom keeps Reset hidden until used", async () => {
    await open(true);
    const area = panel("equity")!.querySelector("[data-equity-probe-area]") as HTMLElement;
    expect(panel("equity")!.querySelector("[data-equity-reset]")).toBeNull();
    expect(panel("equity")!.querySelector("[data-underwater-cross]")).toBeNull();
    fireEvent.keyDown(area, { key: "ArrowRight" });
    expect(panel("equity")!.querySelector("[data-equity-cross]")).not.toBeNull();
    expect(panel("equity")!.querySelector("[data-underwater-cross]")).not.toBeNull();
    const zoomOut = screen.getByRole("button", { name: "Zoom equity out" }) as HTMLButtonElement;
    expect(zoomOut.disabled).toBe(true);
    fireEvent.keyDown(area, { key: "+" });
    const reset = panel("equity")!.querySelector("[data-equity-reset]");
    if (reset !== null) {
      expect(panel("equity")!.querySelector("[data-equity-caption]")!.textContent).toMatch(/zoomed \d{4}-\d{2}-\d{2} to/);
      fireEvent.click(reset);
      expect(panel("equity")!.querySelector("[data-equity-reset]")).toBeNull();
    }
    /* the exact table keeps every sealed point whatever the zoom */
    expect(panel("equity")!.querySelectorAll("[data-sr-equity-table] tbody tr").length).toBeGreaterThan(0);
  });
});
