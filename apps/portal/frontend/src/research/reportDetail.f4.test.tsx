/**
 * Batch F4 (S09) - CG-FG-S09-02 series digest + scope on a new seal, typed absence on an old one, an old core untouched;
 * the metrics grid lists only what the core carries.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
function renderRoute(runId: string) {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/report`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const DIGEST = "ab".repeat(32);

describe("F4 S09 - equity digest", () => {
  it("value path: a new seal shows the short digest, the full one in title, and its scope", async () => {
    const body = fixture();
    Object.assign(body.frozen_core.equity, {
      digest: DIGEST,
      digest_scope: "FULL_STITCHED_SOURCE_SERIES",
      logical_name: "series/stitched.parquet",
      digest_availability: { state: "AVAILABLE", reason_code: null },
    });
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const line = document.querySelector("[data-equity-digest]")!;
    expect(line.getAttribute("data-digest-state")).toBe("AVAILABLE");
    const value = line.querySelector("[data-digest-value]")!;
    expect(value.getAttribute("data-digest-value")).toBe(DIGEST);
    expect(value.textContent).toContain(`sha256:${DIGEST.slice(0, 12)}`);
    expect(value.textContent).not.toContain(DIGEST);
    expect(value.getAttribute("title")).toContain(`sha256:${DIGEST}`);
    expect(line.querySelector("[data-digest-scope]")!.textContent).toMatch(/full stitched source series/i);
  });

  it("typed absence: an old seal says not published with the server's code, never a made-up digest", async () => {
    const body = fixture();
    Object.assign(body.frozen_core.equity, {
      digest: null,
      digest_scope: null,
      logical_name: null,
      digest_availability: { state: "NOT_PUBLISHED", reason_code: "P05_SEAL_PREDATES_SOURCE_SERIES_BYTE_DIGEST" },
    });
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const line = document.querySelector("[data-equity-digest]")!;
    expect(line.getAttribute("data-digest-state")).toBe("NOT_PUBLISHED");
    expect(line.querySelector("[data-digest-value]")).toBeNull();
    expect(line.textContent).toContain("series digest");
    expect(line.querySelector("[data-reason-code]")!.textContent).toBe("P05_SEAL_PREDATES_SOURCE_SERIES_BYTE_DIGEST");
  });

  it("an old core without the fields is left exactly as it was: no digest line, same metrics rows", async () => {
    const body = fixture();
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    expect(document.querySelector("[data-equity-digest]")).toBeNull();
    const rows = [...document.querySelectorAll('[data-panel="metrics"] tr[data-metric]')].map((row) => row.getAttribute("data-metric"));
    expect(rows).toEqual(body.frozen_core.metrics.map((metric: { key: string }) => metric.key));
  });

  it("the metrics grid never grows an all-time analytics row the core does not carry", async () => {
    const body = fixture();
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const text = document.querySelector('[data-panel="metrics"]')!.textContent ?? "";
    for (const label of ["Sortino", "Beta", "Profit factor", "Skew"]) {
      if (!JSON.stringify(body.frozen_core.metrics).includes(label)) expect(text).not.toContain(label);
    }
  });
});
