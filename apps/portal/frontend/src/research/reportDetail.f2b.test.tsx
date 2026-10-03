/**
 * Batch F2b (Bobby 2026-10-01) · Screen 09 flow and less text.
 *
 * The way out and back in: every neighbour link carries the run id (and, to the hub and
 * Execute replay, the evidence cursor); the Lineage link comes only from the report's own
 * Alpha identity facts. The sentence-length copy that a tooltip can carry is a tooltip.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reportAlphaScope } from "./ReportDetail";
import { ReportRoute } from "./ReportRoute";
import type { ReportDetail } from "./reportClient";
import { forgetRunLabels } from "./runLabels";
import { forgetHeldReports } from "./useReport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetHeldReports();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
type Body = Omit<ReportDetail, "frozen_core"> & { frozen_core: any };
const fixture = () => JSON.parse(readFileSync(join(FIXTURES, "research-report.wfo-retained.valid.json"), "utf8")) as Body;

function serve(body: Body) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      ({ ok: true, status: 200, statusText: "200", headers: new Headers(), json: async () => body }) as unknown as Response,
  );
}

function renderRoute(runId: string, hash = "") {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/report${hash}`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const bar = () => document.querySelector('[data-panel="noprint-bar"]') as HTMLElement;

describe("F2b S09 — the bar is the way out and back in", () => {
  it("links the hub, Execute replay, the release candidate and the Alpha's lineage, each with the run id", async () => {
    const body = fixture();
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const run = body.run_id;
    /* W1 B3: arrived with no cursor, every way back carries none (it used to invent fold=1). */
    expect(bar().querySelector('[data-action="back-to-hub"]')?.getAttribute("href")).toBe(`/research/quantbt/runs/${run}/evidence`);
    expect(bar().querySelector('[data-action="back-to-execute"]')?.getAttribute("href")).toBe(`/research/quantbt/runs/${run}/execute`);
    expect(bar().querySelector('[data-action="release-candidate"]')?.getAttribute("href")).toBe(`/research/quantbt/runs/${run}/release-candidate`);
    const lineage = bar().querySelector('[data-action="attempt-lineage"]')!;
    expect(lineage.getAttribute("href")).toBe(
      `/research/quantbt/alphas/delta-rsi-polynomial-alpha/lineage?av=av_delta_rsi_polynomial_alpha_1_0_0&run=${run}`,
    );
    expect(lineage.getAttribute("title")).toContain("delta-rsi-polynomial-alpha");
    expect(bar().querySelector('[aria-current="page"]')?.textContent).toBe("Report");
  });

  it("carries the evidence cursor (fold) from the arriving hash into the hub and Execute links", async () => {
    const body = fixture();
    serve(body);
    renderRoute(body.run_id, "#stage=execute&fold=2&trial=351&params=abc");
    await screen.findByText("Claim passport");
    const hub = bar().querySelector('[data-action="back-to-hub"]')!.getAttribute("href")!;
    expect(hub).toContain("fold=2");
    expect(hub).toContain("trial=351");
    /* The hub is Stage 5 whatever stage the cursor was on; Execute is Stage 4. */
    expect(hub).toContain("stage=claim");
    expect(bar().querySelector('[data-action="back-to-execute"]')?.getAttribute("href")).toContain("fold=2");
    expect(bar().querySelector('[data-action="back-to-execute"]')?.getAttribute("href")).toContain("stage=execute");
    /* Screen 11 is reached with the same cursor, so its way back is the hub the reader left. */
    expect(bar().querySelector('[data-action="release-candidate"]')?.getAttribute("href")).toContain("fold=2");
    expect(bar().querySelector('[data-action="release-candidate"]')?.getAttribute("href")).toContain("trial=351");
  });

  it("draws no lineage link when the report's alpha fact is absent or not an identifier", () => {
    const body = fixture();
    expect(reportAlphaScope(null)).toBeNull();
    expect(reportAlphaScope(body as unknown as ReportDetail)?.alphaId).toBe("delta-rsi-polynomial-alpha");
    const unavailable = fixture();
    const alpha = unavailable.frozen_core.identity.find((field: { key: string }) => field.key === "alpha");
    alpha.availability = { state: "NOT_PUBLISHED", reason_code: "X" };
    expect(reportAlphaScope(unavailable as unknown as ReportDetail)).toBeNull();
    const odd = fixture();
    odd.frozen_core.identity.find((field: { key: string }) => field.key === "alpha").value = "a/b?c";
    expect(reportAlphaScope(odd as unknown as ReportDetail)).toBeNull();
  });

  it("keeps the run's links out of the print sheet and the long sentences in tooltips", async () => {
    const body = fixture();
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    expect(bar().classList.contains("no-print")).toBe(true);
    /* W4: the toolbar is the one release-candidate link; the promotion block repeats none. */
    expect(document.querySelector('[data-action="promotion-release-candidate"]')).toBeNull();
    const toolbarRelease = bar().querySelector('[data-action="release-candidate"]')!;
    expect(toolbarRelease.textContent).toBe("Release →");
    expect(toolbarRelease.getAttribute("title")).toBe("Next: release candidate for this run");
    expect(document.querySelector('[data-panel="footer"] span[title]')?.getAttribute("title")).toBe("Page prints on letter or A4");
  });

  it("marks verdict and stage state with a status dot class the table styles (not words only)", async () => {
    const body = fixture();
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const verdict = document.querySelector(".rr-verdict")!;
    expect(verdict.getAttribute("data-v")).toMatch(/PASS|WARN|DRAG/);
    expect(document.querySelector(".rr-chain td.st")?.getAttribute("data-s")).toBeTruthy();
    fireEvent.mouseOver(verdict);
  });
});
