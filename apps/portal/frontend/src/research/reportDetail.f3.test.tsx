/**
 * Batch F3 (S09) — HiFi parity: fold marks as fold_01, ratios in ink, a failed decay in red and a DRAG row tinted,
 * both only from the served verdict and failed_criteria.
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

describe("F3 S09 — HiFi parity", () => {
  it("09-03: the equity fold marks read fold_01, fold_02 — never the raw 0 and 1", async () => {
    const body = fixture();
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const marks = [...document.querySelectorAll("[data-boundary-label]")].map((el) => el.textContent);
    expect(marks).toEqual(["fold_01", "fold_02"]);
    expect([...document.querySelectorAll("line[data-boundary]")].map((el) => el.getAttribute("data-boundary"))).toEqual(["fold_01", "fold_02"]);
  });

  it("09-04: the OOS Sharpe tile stays in ink, the money and fraction tiles keep their sign colour", async () => {
    const body = fixture();
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const sign = (key: string) => document.querySelector(`[data-headline="${key}"] [data-headline-value]`)?.getAttribute("data-sign");
    expect(document.querySelector('[data-headline="OOS_SHARPE"] [data-headline-value]')).not.toBeNull();
    expect(sign("OOS_SHARPE")).toBeNull();
    expect(sign("NET_RETURN")).toBe("neg");
  });

  it("09-05: a DRAG row is tinted and a decay that the server lists as failed is red, nothing is decided here", async () => {
    const body = fixture();
    const rows = body.frozen_core.folds.rows as Array<{ verdict: string; failed_criteria: string[] }>;
    rows[0]!.verdict = "DRAG";
    rows[0]!.failed_criteria = ["OOS_SHARPE", "DECAY"];
    rows[1]!.verdict = "DRAG";
    rows[1]!.failed_criteria = ["OOS_SHARPE"];
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const tr = [...document.querySelectorAll("tr[data-fold]")] as HTMLElement[];
    expect(tr.map((row) => row.getAttribute("data-v"))).toEqual(["DRAG", "DRAG"]);
    expect(tr[0]!.querySelector("td[data-fold-decay]")?.getAttribute("data-fail")).toBe("DECAY");
    expect(tr[1]!.querySelector("td[data-fold-decay]")?.getAttribute("data-fail")).toBeNull();
  });

  it("09-05: a PASS row carries no tint hook value of DRAG and no failed decay", async () => {
    const body = fixture();
    const rows = body.frozen_core.folds.rows as Array<{ verdict: string; failed_criteria: string[] }>;
    rows[0]!.verdict = "PASS";
    rows[0]!.failed_criteria = [];
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const first = document.querySelector("tr[data-fold]")!;
    expect(first.getAttribute("data-v")).toBe("PASS");
    expect(first.querySelector("td[data-fold-decay]")?.getAttribute("data-fail")).toBeNull();
  });
});
