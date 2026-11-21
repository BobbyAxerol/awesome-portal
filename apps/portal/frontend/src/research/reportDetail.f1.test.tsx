/**
 * F1 honesty batch — Screen 09 Run Report (group S04_S09).
 *
 *  - D8 walk       the equity legend no longer says "IS account" for the account
 *                  standing still before the first OOS window
 *  - D2 walk       the printed evidence link is the whole address
 *  - 400-trial     "no report sealed" is not "you don't have access" on the
 *                  reader's own run; the title chip carries the R-… label
 *
 * Report bodies are the canonical contract fixtures. The Run Library page the
 * 404 refinement reads has no canonical fixture in the repo, so its body here
 * is the smallest envelope the client accepts (run_id, display_label, status).
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EQUITY_LEGEND_BEFORE_OOS,
  EQUITY_LEGEND_IS,
  reportEvidenceLinkLabel,
  reportNoticeState,
} from "./ReportDetail";
import { ReportRoute } from "./ReportRoute";
import { REPORT_REFUSAL_COPY, type ReportDetail, type ReportRefusal } from "./reportClient";
import { forgetRunLabels } from "./runLabels";
import { forgetHeldReports, type ReportController } from "./useReport";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetHeldReports();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
type Body = Omit<ReportDetail, "frozen_core"> & { frozen_core: any };
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Body;

type Answer = { status: number; body: unknown };
const res = ({ status, body }: Answer) =>
  ({ ok: status >= 200 && status < 300, status, statusText: String(status), headers: new Headers(), json: async () => body }) as unknown as Response;

const NOT_FOUND: Answer = {
  status: 404,
  body: { error: { code: "RESEARCH_REPORT_NOT_FOUND", message: "Research report was not found." }, request_id: "req_f1" },
};

function libraryPage(items: unknown[]): Answer {
  return {
    status: 200,
    body: {
      schema_version: "research.run-library.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      items,
      page: { limit: 50, total_rows: 39, filtered_rows: items.length, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false, order: "CREATED_AT_DESC_RUN_ID_DESC" },
    },
  };
}

/** A scripted server: the report read and the Run Library poll-by-ids answer separately. */
function server(script: { report: Answer; library?: Answer | (() => never) }) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    calls.push(url);
    if (/\/api\/v1\/quantbt\/runs\?/.test(url)) {
      if (typeof script.library === "function") return script.library();
      return res(script.library ?? libraryPage([]));
    }
    return res(script.report);
  });
  return {
    calls,
    libraryCalls: () => calls.filter((url) => /\/api\/v1\/quantbt\/runs\?/.test(url)),
    reportCalls: () => calls.filter((url) => /\/report(\?|$)/.test(url)),
  };
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

const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`) as HTMLElement;

describe("F1 D8 walk — the equity legend and the source absences tell one story", () => {
  it("equity_is is the account before the first OOS window, so the legend says that — not 'IS account'", async () => {
    const body = fixture("research-report.wfo-retained.valid.json");
    /* The served fact the relabel rests on: scope, and a flat account (every point at the opening equity). */
    expect(body.frozen_core.equity_is.scope).toBe("RS02_FINAL_ACCOUNT_BEFORE_FIRST_OUTER_TEST");
    const equities = new Set((body.frozen_core.equity_is.points as { equity: string }[]).map((point) => point.equity));
    expect(equities.size).toBe(1);
    /* The live seal also names "in sample account" as not published; the fixture predates that key. */
    body.frozen_core.source_absences.in_sample_account = {
      state: "NOT_PUBLISHED",
      text: null,
      reason_code: "QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT",
      availability: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT" },
    };
    server({ report: { status: 200, body } });
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");

    const equity = panel("equity");
    expect(equity.querySelector('[data-legend="is"]')?.textContent).toBe(EQUITY_LEGEND_BEFORE_OOS);
    expect(equity.querySelector('[data-legend="is"]')?.getAttribute("data-legend-state")).toBe("published");
    const emitted = body.frozen_core.equity_is;
    expect(equity.querySelector("[data-equity-counts]")?.textContent).toContain(
      `before OOS ${emitted.emitted_point_count} of ${emitted.source_observation_count} points`,
    );
    expect(equity.querySelector("[data-equity-title]")?.textContent).toContain("before OOS vs stitched OOS");
    expect(equity.textContent).not.toMatch(/\bIS account\b|\bIS emitted\b|\bIS \d/);
    expect(equity.querySelector("[data-chart-summary]")?.textContent).not.toMatch(/\bIS\b/);

    /* …and the source absences still say there is no in-sample account: the two statements agree. */
    const absence = panel("provenance").querySelector('[data-source-absence="in_sample_account"]') as HTMLElement;
    expect(absence.textContent).toContain("in sample account");
    expect(absence.outerHTML).toContain("QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT");
  });

  it("a report that publishes no equity_is keeps the 'IS account — <reason>' absence, which its source absence agrees with", async () => {
    const body = fixture("research-report.p04-fixed-profile.valid.json");
    expect(body.frozen_core.equity_is.state).toBe("NOT_PUBLISHED");
    server({ report: { status: 200, body } });
    renderRoute(body.run_id);
    await screen.findByText("claim passport");
    const legend = panel("equity").querySelector('[data-legend="is"]') as HTMLElement;
    expect(legend.getAttribute("data-legend-state")).toBe("absent");
    expect(legend.outerHTML).toContain(body.frozen_core.equity_is.availability.reason_code);
    expect(legend.textContent).not.toBe(EQUITY_LEGEND_BEFORE_OOS);
    expect(EQUITY_LEGEND_IS).toContain("not published");
  });
});

describe("F1 D2 walk — the printed evidence link is the whole address", () => {
  it("prints the full URL (it wraps), identical to the href, with no 8-hex short ids", async () => {
    const body = fixture("research-report.wfo-retained.valid.json");
    server({ report: { status: 200, body } });
    renderRoute(body.run_id);
    await screen.findByText("Claim passport");
    const link = panel("provenance").querySelector("[data-evidence-link] a") as HTMLAnchorElement;
    const href = link.getAttribute("href")!;
    expect(href).toBe(`${window.location.origin}/research/quantbt/runs/${encodeURIComponent(body.run_id)}/report?report_revision=${encodeURIComponent(body.report_revision)}`);
    /* W4: no 120-character URL is printed; the link is a words-only label and the full address is its title and href. */
    expect(link.getAttribute("title")).toBe(href);
    expect(link.textContent).toBe("Link to this report");
    expect(href.length).toBeGreaterThan(100);
    expect(href).not.toMatch(/\/runs\/[a-z]+_[0-9a-f]{8}\/report/);
    expect(reportEvidenceLinkLabel(body.run_id, body as unknown as ReportDetail)).toBe(href);
  });
});

describe("F1 400-trial audit — 'no report sealed' is not 'you don't have access'", () => {
  const OWN = "rrun_ef3e10730fcb16a884ee6dfed3bd87f3";
  const ROW = { run_id: OWN, display_label: "R-WFO-019", status: "CANCELLED" };

  it("the reader's own run with no sealed report says so, keeps the code in details, and the chip carries the label", async () => {
    const api = server({ report: NOT_FOUND, library: libraryPage([ROW]) });
    renderRoute(OWN);
    /* W1: the listed run's own status is the face — one line, three exits, no sheet, no Print. */
    const line = await screen.findByText("Cancelled.");
    const root = document.querySelector('[data-screen="run-report"]') as HTMLElement;
    expect(root.getAttribute("data-report-state")).toBe("empty");
    expect(root.getAttribute("data-run-phase")).toBe("cancelled");
    expect(line.getAttribute("title")).toContain("nothing will arrive");
    expect([...document.querySelectorAll("[data-run-exit-bar] [data-exit]")].map((el) => el.getAttribute("data-exit"))).toEqual(["progress", "new-run", "library"]);
    expect(document.body.textContent).not.toContain(REPORT_REFUSAL_COPY.report[404]);
    expect(document.body.textContent).not.toMatch(/don't have access/i);
    expect(document.querySelector('[data-action="print"]')).toBeNull();
    expect(document.querySelector('[data-panel="noprint-bar"]')).toBeNull();
    /* A cancelled run never seals: no retry is offered. */
    expect(screen.queryByRole("button", { name: "read again" })).toBeNull();
    /* The poll-by-ids is one request for this one run, and only after the 404. */
    /* One read is the evidence gate's status read (before the report read), one the 404's own visibility lookup. */
    expect(api.libraryCalls()).toHaveLength(2);
    expect(api.libraryCalls()[0]).toContain(`ids=${OWN}`);
    /* No certification box for a sheet that was never read (nothing to describe). */
    expect(panel("header").querySelector("[data-cert-box]")).toBeNull();
    /* The title chip prints the R-… label the library row published, not the 37-character id. */
    await waitFor(() => expect(panel("header").querySelector("[data-run-chip] button")?.textContent).toBe("R-WFO-019"));
    expect(panel("header").querySelector("[data-run-chip] button")?.getAttribute("data-full-id")).toBe(OWN);
    expect(panel("header").textContent).not.toContain(OWN);
  });

  it("a run still in progress with no report says Running. and offers Progress; no sheet and no Print", async () => {
    const api = server({ report: NOT_FOUND, library: libraryPage([{ ...ROW, status: "RUNNING" }]) });
    renderRoute(OWN);
    await screen.findByText("Running.");
    expect([...document.querySelectorAll("[data-run-exit-bar] [data-exit]")].map((el) => el.getAttribute("data-exit"))).toEqual(["progress", "library"]);
    expect(api.reportCalls()).toHaveLength(1);
  });

  it("a run the workspace does not list keeps the F-04 sentence exactly: a denial confirms nothing", async () => {
    server({ report: NOT_FOUND, library: libraryPage([]) });
    renderRoute("rrun_00000000000000000000000000000000");
    const line = await screen.findByText("Run not available.");
    expect(line.getAttribute("title")).toBe(REPORT_REFUSAL_COPY.report[404]);
    expect(document.querySelector('[data-screen="run-report"]')?.getAttribute("data-report-state")).toBe("denied");
    expect(document.body.textContent).not.toContain("No sealed report");
    expect([...document.querySelectorAll("[data-run-exit-bar] [data-exit]")].map((el) => el.getAttribute("data-exit"))).toEqual(["library"]);
    expect(document.querySelector('[data-action="print"]')).toBeNull();
    /* No link names the missing run. */
    expect(document.querySelector('a[href*="rrun_0000"]')).toBeNull();
  });

  it("when the library cannot be read nothing is concluded: the F-04 sentence stands", async () => {
    server({ report: NOT_FOUND, library: { status: 503, body: { error: { code: "X", message: "m" }, request_id: "r" } } });
    renderRoute(OWN);
    const line = await screen.findByText("Run not available.");
    expect(line.getAttribute("title")).toBe(REPORT_REFUSAL_COPY.report[404]);
    expect(document.querySelector('[data-screen="run-report"]')?.getAttribute("data-report-state")).toBe("denied");
  });

  it("a 403 asks the library only for the evidence gate's status read and never softens", async () => {
    const api = server({
      report: { status: 403, body: { error: { code: "RESEARCH_REPORT_FORBIDDEN", message: "m" }, request_id: "r" } },
      library: libraryPage([{ ...ROW, status: "COMPLETED" }]),
    });
    renderRoute(OWN);
    const line = await screen.findByText("Run not available.");
    expect(line.getAttribute("title")).toBe(REPORT_REFUSAL_COPY.report[403]);
    await act(async () => {});
    expect(api.libraryCalls()).toHaveLength(1);
    expect(document.body.textContent).not.toContain("No sealed report");
  });

  it("reportNoticeState: only a listed run turns a 404 into 'empty'; every other combination is the controller's own state", () => {
    const refusal = (status: number, code: string): ReportRefusal => ({
      code,
      message: REPORT_REFUSAL_COPY.report[404],
      status,
      requestId: "req_f1",
      state: "denied",
      mayRetry: false,
      terminal: true,
    });
    const controller = (r: ReportRefusal | null): ReportController => ({
      report: null,
      refusal: r,
      state: r ? { state: r.state, reason: r.message, mayRetry: r.mayRetry, retainsContent: false } : researchState({ kind: "in-flight", hasAcceptedResponse: false }),
      inFlight: false,
      notModified: false,
      requestCount: 1,
      retry: () => undefined,
    });
    const missing = controller(refusal(404, "RESEARCH_REPORT_NOT_FOUND"));

    const empty = reportNoticeState(missing, { state: "listed", status: "COMPLETED" });
    expect(empty.state).toBe("empty");
    expect(empty.reason).toBe("No sealed report yet.");
    expect(empty.detail).toBe("run status completed · report read answered 404 RESEARCH_REPORT_NOT_FOUND · request req_f1");
    expect(reportNoticeState(missing, { state: "listed", status: "QUEUED" }).reason).toBe("Queued.");
    expect(reportNoticeState(missing, { state: "listed", status: "CANCELLED" }).reason).toBe("Cancelled.");
    expect(empty.mayRetry).toBe(false);

    expect(reportNoticeState(missing, { state: "listed", status: null }).detail).toBe("report read answered 404 RESEARCH_REPORT_NOT_FOUND · request req_f1");
    expect(reportNoticeState(missing, { state: "idle" }).state).toBe("loading");
    expect(reportNoticeState(missing, { state: "reading" }).state).toBe("loading");
    expect(reportNoticeState(missing, { state: "not-listed" })).toBe(missing.state);
    expect(reportNoticeState(missing, { state: "unread" })).toBe(missing.state);
    /* Other refusals, and a 404 with another code, are never refined. */
    const forbidden = controller(refusal(403, "RESEARCH_REPORT_FORBIDDEN"));
    expect(reportNoticeState(forbidden, { state: "listed", status: "COMPLETED" })).toBe(forbidden.state);
    const otherCode = controller(refusal(404, "SOMETHING_ELSE"));
    expect(reportNoticeState(otherCode, { state: "listed", status: "COMPLETED" })).toBe(otherCode.state);
    const none = controller(null);
    expect(reportNoticeState(none, { state: "listed", status: "COMPLETED" })).toBe(none.state);
  });
});
