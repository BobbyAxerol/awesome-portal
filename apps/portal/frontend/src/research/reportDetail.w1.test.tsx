// @vitest-environment jsdom
/**
 * W1 / G3 — Screen 09 Run Report: status faces, exits, cursor-aware links.
 *
 * Report bodies are the canonical contract fixtures; the Run Library row is
 * `libraryRow()` from `runStates.fixture` (derived, only status/seal fields
 * overridden). No screen text is hand-built.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportFaceOf } from "./ReportDetail";
import { ReportRoute } from "./ReportRoute";
import type { ReportDetail } from "./reportClient";
import { forgetRunLabels } from "./runLabels";
import { libraryPage, libraryRow, type RunStatusWireFixture } from "./runStates.fixture";
import { clearRunStatusCache } from "./useRunStatus";
import { forgetHeldReports } from "./useReport";

beforeEach(() => clearRunStatusCache());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetHeldReports();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
type Body = Omit<ReportDetail, "frozen_core"> & { frozen_core: any };
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Body;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NOT_FOUND = { error: { code: "RESEARCH_REPORT_NOT_FOUND", message: "m" }, request_id: "req_w1" };

function serve(report: { status: number; body: unknown }, library: RunStatusWireFixture | null, runId: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (/\/api\/v1\/quantbt\/runs\?/.test(url)) return json(200, libraryPage(library === null ? [] : [libraryRow(library, { runId })]));
    return json(report.status, report.body);
  });
}

function renderAt(runId: string, tail = "") {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/report${tail}`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const exits = () => [...document.querySelectorAll("[data-run-exit-bar] [data-exit]")].map((el) => el.getAttribute("data-exit"));
const OWN = "rrun_ef3e10730fcb16a884ee6dfed3bd87f3";

describe("W1-S09 status faces (report read answered 404)", () => {
  it.each([
    ["QUEUED", "Queued.", "queued", ["progress", "library"]],
    ["RUNNING", "Running.", "running", ["progress", "library"]],
    ["FAILED", "Failed.", "failed", ["progress", "new-run", "library"]],
    ["CANCELLED", "Cancelled.", "cancelled", ["progress", "new-run", "library"]],
    ["COMPLETED", "No sealed report yet.", "completed", ["progress", "hub", "library"]],
  ] as const)("W1-S09-%s is one line, its exits, no sheet, no Print", async (status, banner, phase, expected) => {
    serve({ status: 404, body: NOT_FOUND }, status, OWN);
    renderAt(OWN);
    await screen.findByText(banner);
    expect(q('[data-screen="run-report"]')!.getAttribute("data-run-phase")).toBe(phase);
    expect(exits()).toEqual(expected);
    expect(q('[data-action="print"]')).toBeNull();
    expect(q('[data-panel="noprint-bar"]')).toBeNull();
    for (const name of ["passport", "metrics", "equity", "provenance", "footer"]) expect(q(`[data-panel="${name}"]`), name).toBeNull();
    expect(q('[data-action="back-to-hub"]')).toBeNull();
    expect(q('[data-action="back-to-execute"]')).toBeNull();
  });

  it("W1-S09-NOT-LISTED says 'Run not available.' with the Library only, and no link carries the run id", async () => {
    const missing = "rrun_00000000000000000000000000000000";
    serve({ status: 404, body: NOT_FOUND }, null, missing);
    renderAt(missing);
    await screen.findByText("Run not available.");
    expect(exits()).toEqual(["library"]);
    expect(q('[data-run-chip]')).toBeNull();
    expect(q('[data-action="print"]')).toBeNull();
    expect(document.querySelector(`a[href*="${missing}"]`)).toBeNull();
  });

  it("the hub exit of a listed run with no sealed report carries the arriving cursor", async () => {
    serve({ status: 404, body: NOT_FOUND }, "COMPLETED", OWN);
    renderAt(OWN, "#stage=claim&fold=4&trial=351");
    await screen.findByText("No sealed report yet.");
    const hub = q('[data-exit="hub"]')!.getAttribute("href")!;
    expect(hub).toContain("fold=4");
    expect(hub).toContain("trial=351");
  });

  it("reportFaceOf: a 503 or an unread 404 keeps the sheet frame; only 403/404 turn into an exit face", () => {
    const refusal = (status: number, code: string, state: string) => ({ status, code, state, message: "m", requestId: null, mayRetry: false, terminal: true }) as never;
    const controller = (r: unknown) => ({ report: null, refusal: r, state: { state: "x" }, inFlight: false, notModified: false, requestCount: 1, retry: () => undefined }) as never;
    expect(reportFaceOf(controller(refusal(503, "RESEARCH_REPORT_UNAVAILABLE", "unavailable")), { state: "idle" }).kind).toBe("sheet");
    expect(reportFaceOf(controller(refusal(401, "UNAUTHENTICATED", "denied")), { state: "idle" }).kind).toBe("sheet");
    expect(reportFaceOf(controller(refusal(404, "RESEARCH_REPORT_NOT_FOUND", "denied")), { state: "reading" }).kind).toBe("sheet");
    expect(reportFaceOf(controller(refusal(404, "RESEARCH_REPORT_NOT_FOUND", "denied")), { state: "unread" }).kind).toBe("exit");
    expect(reportFaceOf(controller(refusal(403, "RESEARCH_REPORT_FORBIDDEN", "denied")), { state: "idle" }).kind).toBe("exit");
  });
});

describe("W1-S09 a failed run's sheet (200) keeps its honest sheet and gains the exits", () => {
  it("adds Progress, New run and Library to the bar; Print stays (a sheet exists); no export, no Release candidate", async () => {
    const body = fixture("research-report.wfo-failed.valid.json");
    serve({ status: 200, body }, "FAILED", body.run_id);
    renderAt(body.run_id);
    await waitFor(() => expect(q('[data-panel="failed-outcome"]')).not.toBeNull());
    const bar = q('[data-panel="noprint-bar"]')!;
    expect([...bar.querySelectorAll("[data-exit]")].map((el) => el.getAttribute("data-exit"))).toEqual(["progress", "new-run", "library"]);
    expect(bar.querySelector('[data-action="print"]')).not.toBeNull();
    expect(bar.querySelector('[data-action="release-candidate"]')).toBeNull();
  });
});

describe("W1-S09 B3 cursor-aware links on a sealed report", () => {
  it("carries cursor + ?window= into the hub, Execute, Release candidate and Lineage (with ?run=)", async () => {
    const body = fixture("research-report.wfo-retained.valid.json");
    serve({ status: 200, body }, "COMPLETED", body.run_id);
    renderAt(body.run_id, "?window=is#stage=execute&fold=4&trial=351");
    await screen.findByText("Claim passport");
    const hub = q('[data-action="back-to-hub"]')!.getAttribute("href")!;
    expect(hub).toContain("stage=claim");
    expect(hub).toContain("fold=4");
    expect(hub).toContain("window=is");
    expect(q('[data-action="back-to-execute"]')!.getAttribute("href")).toContain("stage=execute");
    expect(q('[data-action="release-candidate"]')!.getAttribute("href")).toContain("fold=4");
    expect(q('[data-action="release-candidate"]')!.getAttribute("href")).toContain("window=is");
    expect(q('[data-action="promotion-release-candidate"]')!.getAttribute("href")).toContain("trial=351");
    expect(q('[data-action="attempt-lineage"]')!.getAttribute("href")).toContain(`run=${body.run_id}`);
  });

  it("with no cursor in hand no link invents one", async () => {
    const body = fixture("research-report.wfo-retained.valid.json");
    serve({ status: 200, body }, "COMPLETED", body.run_id);
    renderAt(body.run_id);
    await screen.findByText("Claim passport");
    for (const action of ["back-to-hub", "back-to-execute", "release-candidate"]) expect(q(`[data-action="${action}"]`)!.getAttribute("href")).not.toContain("#");
    expect(document.body.innerHTML).not.toContain("fold=1");
  });
});

describe("W1-S09 one provenance block", () => {
  it("Identity, Key artifacts and the report's own rows are one block; the digest cells carry their full value as a tooltip", async () => {
    const body = fixture("research-report.wfo-retained.valid.json");
    serve({ status: 200, body }, "COMPLETED", body.run_id);
    renderAt(body.run_id);
    await screen.findByText("Claim passport");
    const block = q('[data-panel="provenance"]')!;
    expect(block.querySelector('[data-panel="identity"]')).not.toBeNull();
    expect(block.querySelector('[data-panel="artifacts"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-panel="identity"]')).toHaveLength(1);
    const sealed = [...block.querySelectorAll("[data-artifact-digest]")].find((el) => el.getAttribute("title")?.length === 64);
    expect(sealed).toBeTruthy();
    await waitFor(() => expect(q('[data-panel="footer"]')).not.toBeNull());
  });

  it("on a phone the digest column is a single column that ends in an ellipsis, never one character per line", () => {
    const css = document.createElement("div");
    css.textContent = "";
    // The sheet's own CSS is the contract: read it from the rendered style element.
    const body = fixture("research-report.wfo-retained.valid.json");
    serve({ status: 200, body }, "COMPLETED", body.run_id);
    renderAt(body.run_id);
    return screen.findByText("Claim passport").then(() => {
      const sheet = document.querySelector('[data-screen="run-report"] > style')!.textContent ?? "";
      const narrow = sheet.slice(sheet.indexOf("@media (max-width: 700px)"), sheet.indexOf("@media print"));
      expect(narrow).toContain(".rr-artgrid { grid-template-columns: minmax(0, 1fr); }");
      expect(narrow).toMatch(/\.rr-dig \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
    });
  });
});
