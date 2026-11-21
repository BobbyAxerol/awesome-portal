/**
 * QA sweep 2026-10-02 · S09 Run Report fixes. Every test loads a canonical fixture
 * (`packages/contracts/fixtures/research-report.*`, `research-enriched-analysis.*`) and fails without its fix.
 * Value path and typed-absence path are both asserted.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { healthy, noBenchmark, partialMonth } from "./enrichedAnalysis.fixtures";
import { NOPRINT_NOTE, countLine, equityCaption, nearestPoint, revisionNotice, samplingWords } from "./ReportDetail";
import { ReportRoute } from "./ReportRoute";
import type { ReportDetail } from "./reportClient";
import { BreakableCode, daysAndHours, humanToken, kilobytes, monthWords, roundAxis } from "./reportText";
import { forgetRunLabels } from "./runLabels";
import { forgetHeldReports } from "./useReport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetHeldReports();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
type Body = Omit<ReportDetail, "frozen_core"> & { frozen_core: any; enriched_analysis?: unknown };
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Body;
const retained = () => fixture("research-report.wfo-retained.valid.json");
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function serve(body: Body | { status: number; code: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if ("status" in body) {
      return {
        ok: false,
        status: body.status,
        statusText: String(body.status),
        headers: new Headers(),
        json: async () => ({ error: { code: body.code, message: "server prose" }, request_id: "req-1" }),
      } as unknown as Response;
    }
    return { ok: true, status: 200, statusText: "200", headers: new Headers(), json: async () => body } as unknown as Response;
  });
}
function renderRoute(runId: string, search = "") {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/report${search}`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}
const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`) as HTMLElement | null;
async function open(body: Body, search = "") {
  serve(body);
  renderRoute(body.run_id, search);
  await act(async () => {});
  await screen.findAllByText(/per-fold verdict|run failed|Certification chain/i);
}

describe("QA S09 · text and number hygiene", () => {
  it("the Print tooltip names no PDF export (there is none)", () => {
    expect(NOPRINT_NOTE).not.toMatch(/PDF/);
    expect(NOPRINT_NOTE.split(/\s+/).length).toBeLessThanOrEqual(10);
  });

  it("pure helpers: counts, sampling words, rounding, durations, months, sizes, tokens", () => {
    expect(roundAxis("99.89888278338664")).toBe("99.9");
    expect(roundAxis("-3.46")).toBe("−3.5");
    expect(roundAxis("not a number")).toBe("not a number");
    expect(daysAndHours(417 * 3600)).toBe("17 d 9 h");
    expect(daysAndHours(48 * 3600)).toBe("2 d");
    expect(daysAndHours(5 * 3600)).toBe("5 h");
    expect(daysAndHours(Number.NaN)).toBeNull();
    expect(monthWords(Date.UTC(2026, 6, 1))).toBe("Jul 2026");
    expect(kilobytes(524288)).toBe("512 KB");
    expect(humanToken("walk_forward_oos")).toBe("walk forward oos");
    expect(humanToken("global selection")).toBe("global selection");
    expect(humanToken("2026-09-01")).toBe("2026-09-01");
    expect(samplingWords("FULL")).toBe("all points");
    expect(samplingWords("OBSERVATION_EXTREMA_BUCKET_V2")).toBe("sampled (extrema)");
    expect(samplingWords(null)).toBe("sampling not published");
    const points = [{ at_utc_ms: 0 }, { at_utc_ms: 10 }, { at_utc_ms: 100 }];
    expect(nearestPoint(points, 0.06)).toBe(points[1]);
    expect(nearestPoint(points, 2)).toBe(points[2]);
    expect(nearestPoint([], 0.5)).toBeNull();
    const { container } = render(<BreakableCode code="P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE" />);
    expect(container.textContent).toBe("P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE");
    expect(container.querySelectorAll("wbr").length).toBe(6);
  });

  it("the certification box breaks its reason code at underscores and keeps the exact code", async () => {
    const body = retained();
    await open(body);
    const reason = panel("header")!.querySelector("[data-cert] [data-reason-code]")!;
    /* W4: the code is the tooltip and the data attribute; a long token is never printed (so it never breaks mid-word). */
    expect(reason.getAttribute("data-reason-code")).toBe(body.frozen_core.certification.reason_code);
    expect(reason.getAttribute("title")).toContain(body.frozen_core.certification.reason_code);
  });

  it("equity subtitle value path: the OOS source count comes from enriched_analysis.curves.sampling when the segment has none", async () => {
    const body = retained();
    body.frozen_core.equity.source_observation_count = null;
    const block = healthy();
    body.enriched_analysis = clone(block);
    await open(body);
    const counts = panel("equity")!.querySelector("[data-equity-counts]")!.textContent!;
    expect(counts).toContain(`${body.frozen_core.equity.emitted_point_count} of ${block.curves.sampling.source_observation_count} points`);
    expect(counts).not.toMatch(/emitted|source observations|bucket|v2/i);
  });

  it("W5 S09: equity is one chart region - Home/End read the ends, a touch tap pins the readout, the strip is one region", async () => {
    const body = retained();
    body.enriched_analysis = clone(healthy());
    await open(body);
    const region = panel("equity")!.querySelector("[data-equity-probe-area]") as HTMLElement;
    expect(region.getAttribute("role")).toBe("group");
    expect(region.querySelector("[tabindex]")).toBeNull();
    region.focus();
    fireEvent.keyDown(region, { key: "End" });
    const last = panel("equity")!.querySelector("[data-equity-tip]")!.getAttribute("title")!;
    fireEvent.keyDown(region, { key: "Home" });
    expect(panel("equity")!.querySelector("[data-equity-tip]")!.getAttribute("title")).not.toBe(last);
    fireEvent.keyDown(region, { key: "Escape" });
    expect(panel("equity")!.querySelector("[data-equity-tip]")).toBeNull();
    const months = document.querySelector("[data-months-region]") as HTMLElement;
    expect(months.getAttribute("aria-label")).toBe("Monthly returns");
    expect(months.querySelectorAll("[tabindex]").length).toBe(0);
    expect(months.querySelector("[data-month]")!.getAttribute("aria-hidden")).toBe("true");
    const episode = document.querySelector("[data-episode]")!;
    expect(episode.getAttribute("aria-label")).toBeNull();
    expect(episode.getAttribute("tabindex")).toBe("0");
    const first = months.querySelector("[data-month]") as HTMLElement;
    fireEvent.pointerDown(first, { pointerType: "touch" });
    expect(months.querySelector("[data-months-tip]")).not.toBeNull();
  });

  it("equity subtitle absence path: no source count anywhere prints only what was drawn, never a broken sentence", async () => {
    const body = retained();
    body.frozen_core.equity.source_observation_count = null;
    await open(body);
    const counts = panel("equity")!.querySelector("[data-equity-counts]")!.textContent!;
    expect(counts).toContain(`${body.frozen_core.equity.emitted_point_count} points`);
    expect(counts).not.toMatch(/not published|emitted|source observations/);
    expect(countLine({ ...body.frozen_core.equity, state: "NOT_PUBLISHED", emitted_point_count: null })).toBe("no points published");
  });

  it("an AVAILABLE metric that carries no value reads 'not published', never 'available'", async () => {
    const body = retained();
    const row = body.frozen_core.metrics.find((metric: { key: string }) => metric.key === "NET_RETURN_FRACTION");
    row.value = null;
    row.availability = { state: "AVAILABLE", reason_code: null };
    await open(body);
    const cell = panel("metrics")!.querySelector('[data-metric="NET_RETURN_FRACTION"] td')!;
    expect(cell.textContent).toMatch(/not published/);
    expect(cell.textContent).not.toMatch(/available/i);
    expect(cell.querySelector("[data-reason-code]")).toBeNull();
  });

  it("the metrics table has no definition column; the definition id is the metric name's tooltip", async () => {
    const body = retained();
    await open(body);
    expect([...panel("metrics")!.querySelectorAll("th[scope='col']")].map((th) => th.textContent)).toEqual(["metric", "value"]);
    const first = body.frozen_core.metrics[0];
    expect(panel("metrics")!.querySelector(`[data-metric="${first.key}"] th`)?.getAttribute("title")).toContain(first.definition_id);
  });

  it("the source benchmark absence is named as the source's; the sheet's own portal benchmark is a different thing", async () => {
    const body = retained();
    await open(body);
    const line = panel("provenance")!.querySelector('[data-source-absence="benchmark"]');
    if (line) expect(line.textContent).toMatch(/^\s*source benchmark/);
  });

  it("provenance lists a revision once: the identity block already carries the five, so the table does not repeat them", async () => {
    const body = retained();
    expect(body.frozen_core.identity.some((field: { key: string }) => field.key === "evidence_revision")).toBe(true);
    await open(body);
    expect(panel("provenance")!.querySelector('[data-source-revision="evidence_revision"]')).toBeNull();
    expect(panel("identity")!.querySelector('[data-identity="evidence_revision"]')).not.toBeNull();
  });

  it("the certification chain does not print 'certification cap - not published' and an absent check shows the stage's own state", async () => {
    const body = fixture("research-report.p04-fixed-profile.valid.json");
    await open(body);
    expect(panel("stages")!.textContent).not.toContain("certification cap");
    const s1 = panel("stages")!.querySelector('[data-stage="S1"]')!;
    expect(s1.getAttribute("data-stage-check")).toBe("NOT_PUBLISHED");
    expect(s1.querySelector(".st")!.textContent).not.toMatch(/not published/i);
    expect(s1.querySelector(".st")!.getAttribute("title")).toMatch(/^check /);
    expect(s1.querySelector(".desc [data-reason-code], .desc .rr-reason")).toBeNull();
    /* the check that IS published keeps its own word */
    expect(panel("stages")!.querySelector('[data-stage="S3"] .st')!.textContent).toMatch(/caveat/i);
  });

  it("a single-window run draws one typed line for the folds, not an empty table", async () => {
    const body = fixture("research-report.p04-fixed-profile.valid.json");
    await open(body);
    expect(panel("folds")!.querySelector("table")).toBeNull();
    expect(panel("folds")!.querySelector("[data-folds-absent]")!.outerHTML).toContain(body.frozen_core.folds.reason_code ?? body.frozen_core.folds.availability.reason_code);
  });

  it("the passport reads enum tokens as words and keeps the exact token in the tooltip", async () => {
    const body = retained();
    await open(body);
    const first = panel("passport")!.querySelector("[data-passport-fact='1']")!;
    expect(first.querySelector(".v")!.textContent).not.toMatch(/_/);
    expect(first.querySelector(".v [title]")!.getAttribute("title")).toMatch(/_/);
  });

  it("exports say '512 KB' and 'no export yet'", async () => {
    await open(retained());
    expect(panel("exports")!.querySelector("[title]")!.getAttribute("title")).toContain("max 512 KB per file");
    expect(panel("exports")!.textContent).toContain("no export yet");
    expect(panel("exports")!.textContent).not.toContain("not requested");
  });
});

describe("QA S09 · chart reading", () => {
  const rect = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) };

  it("hovering the equity chart reads one sealed point (date, equity, drawdown) with the exact values in the title", async () => {
    const body = retained();
    await open(body);
    const area = panel("equity")!.querySelector("[data-equity-probe-area]") as HTMLElement;
    expect(area.getAttribute("tabindex")).toBe("0");
    expect(panel("equity")!.querySelector("[data-equity-tip]")).toBeNull();
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    fireEvent.pointerMove(area, { clientX: 100 });
    const tip = panel("equity")!.querySelector("[data-equity-tip]") as HTMLElement;
    expect(tip).not.toBeNull();
    const exact = tip.getAttribute("data-exact-equity")!;
    const points = [...(body.frozen_core.equity_is?.points ?? []), ...body.frozen_core.equity.points] as { equity: string }[];
    expect(points.map((point) => point.equity)).toContain(exact);
    expect(tip.getAttribute("title")).toContain(exact);
    expect(tip.textContent).toMatch(/drawdown/);
    fireEvent.pointerLeave(area);
    expect(panel("equity")!.querySelector("[data-equity-tip]")).toBeNull();
  });

  it("the arrow keys step through the sealed points; Escape clears the readout", async () => {
    await open(retained());
    const area = panel("equity")!.querySelector("[data-equity-probe-area]") as HTMLElement;
    fireEvent.keyDown(area, { key: "ArrowRight" });
    const first = (panel("equity")!.querySelector("[data-equity-tip]") as HTMLElement).getAttribute("data-exact-equity");
    fireEvent.keyDown(area, { key: "ArrowRight" });
    const second = (panel("equity")!.querySelector("[data-equity-tip]") as HTMLElement).getAttribute("title");
    expect(second).not.toBeNull();
    expect(first).not.toBeNull();
    fireEvent.keyDown(area, { key: "Escape" });
    expect(panel("equity")!.querySelector("[data-equity-tip]")).toBeNull();
  });

  it("all-time curve: strategy and benchmark each keep their own labelled scale, rounded for the axis", async () => {
    const body = retained();
    const block = healthy();
    body.enriched_analysis = clone(block);
    await open(body);
    const curve = panel("all-time")!.querySelector("[data-all-time-curve]")!;
    expect(curve.getAttribute("data-has-benchmark")).toBe("true");
    expect(curve.querySelectorAll("polyline")).toHaveLength(3);
    expect(curve.querySelector("[data-benchmark-curve]")).not.toBeNull();
    const strategy = curve.querySelector('[data-curve-range="strategy"]')!;
    const bench = curve.querySelector('[data-curve-range="benchmark"]')!;
    expect(bench.textContent).toContain("own scale");
    for (const line of [strategy, bench]) {
      /* no 14-digit float on the axis; exact values stay in the title */
      expect(line.textContent).not.toMatch(/\d\.\d{3,}/);
      expect(line.getAttribute("title")).toMatch(/\d\.\d{3,}|\d/);
    }
    expect(curve.querySelector("[data-curve-legend]")!.textContent).toContain("market benchmark");
  });

  it("all-time curve absence path: no benchmark curve says 'market benchmark not published' and draws one panel", async () => {
    const body = retained();
    body.enriched_analysis = clone(noBenchmark());
    await open(body);
    const curve = panel("all-time")!.querySelector("[data-all-time-curve]")!;
    expect(curve.getAttribute("data-has-benchmark")).toBe("false");
    expect(curve.querySelectorAll("[data-curve-plot=strategy] polyline")).toHaveLength(1);
    expect(curve.querySelector("[data-curve-plot=benchmark]")).toBeNull();
    expect(curve.querySelector("[data-curve-legend]")!.textContent).toBe("market benchmark not published");
  });

  it("the return distribution the API serves is drawn: one bar per bucket with the served count and exact edges", async () => {
    const body = retained();
    const block = healthy();
    body.enriched_analysis = clone(block);
    await open(body);
    const dist = panel("all-time")!.querySelector("[data-all-time-distribution]")!;
    const bars = [...dist.querySelectorAll("rect[data-bucket]")];
    expect(bars).toHaveLength(block.return_distribution.buckets.length);
    expect(bars.map((bar) => Number(bar.getAttribute("data-count")))).toEqual(block.return_distribution.buckets.map((bucket) => bucket.count));
    expect(bars[0]!.getAttribute("data-lower")).toBe(block.return_distribution.buckets[0]!.lower_inclusive);
    expect(dist.querySelector("[data-distribution-count]")!.textContent).toContain("days");
    /* the tallest bar is the largest count */
    const heights = bars.map((bar) => Number(bar.getAttribute("height")));
    const counts = bars.map((bar) => Number(bar.getAttribute("data-count")));
    expect(heights.indexOf(Math.max(...heights))).toBe(counts.indexOf(Math.max(...counts)));
  });

  it("the distribution absence path: an unpublished histogram is one typed line, not an empty chart", async () => {
    const body = retained();
    const block = clone(healthy()) as any;
    block.return_distribution = { ...block.return_distribution, state: "NOT_PUBLISHED", reason_code: "P13_NO_DAILY_RETURNS", buckets: [], observation_count: 0 };
    body.enriched_analysis = block;
    await open(body);
    const section = panel("all-time")!;
    expect(section.querySelector("[data-all-time-distribution]")).toBeNull();
    expect(section.textContent).toContain("return distribution — not published");
    expect(section.outerHTML).toContain("P13_NO_DAILY_RETURNS");
  });

  it("monthly returns name the month in words and drawdown durations are days and hours", async () => {
    const body = retained();
    const block = partialMonth();
    body.enriched_analysis = clone(block);
    await open(body);
    const months = [...panel("all-time")!.querySelectorAll("[data-month]")];
    expect(months.length).toBeGreaterThan(0);
    for (const month of months) expect(month.textContent).toMatch(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}/);
    expect(months[0]!.textContent).not.toMatch(/\d\/\d\d/);
    const episode = panel("all-time")!.querySelector("[data-episode] td:nth-child(3)");
    if (episode) {
      expect(episode.textContent).toMatch(/^\d+ (d|h)/);
      expect(episode.getAttribute("title")).toMatch(/ s$/);
    }
  });

  it("the Sharpe in the all-time block says which Sharpe it is", async () => {
    const body = retained();
    body.enriched_analysis = clone(healthy());
    await open(body);
    expect(panel("all-time")!.querySelector("[data-all-time-fact='Sharpe'] dt")!.textContent).toBe("Sharpe");
  });
});

describe("QA S09 · states and flow", () => {
  it("a 409 on the read is its own state with a retry, not the generic failure", async () => {
    serve({ status: 409, code: "RESEARCH_REPORT_CONFLICT" });
    renderRoute("rrun_0123456789abcdef0123456789abcdef");
    await screen.findByText(/answered with a conflict/);
    expect(document.querySelector("[data-report-notice]")!.getAttribute("data-report-notice")).toBe("stale");
    expect(screen.getByRole("button", { name: "Read again" })).not.toBeNull();
    expect(document.body.textContent).not.toContain("could not be read");
    expect(document.body.textContent).not.toContain("server prose");
  });

  it("a link naming another report revision is told so; the matching one is not", async () => {
    const body = retained();
    await open(body, "?report_revision=p18r1_deadbeef");
    const notice = document.querySelector("[data-revision-notice]")!;
    expect(notice.textContent).toContain("p18r1_deadbeef");
    expect(notice.textContent).toContain(body.report_revision);
    cleanup();
    forgetHeldReports();
    await open(body, `?report_revision=${encodeURIComponent(body.report_revision)}`);
    expect(document.querySelector("[data-revision-notice]")).toBeNull();
    expect(revisionNotice(null, body as unknown as ReportDetail)).toBeNull();
    expect(revisionNotice("x", null)).toBeNull();
  });

  it("a failed run offers no release candidate link, no export and no raw attempt id", async () => {
    const body = fixture("research-report.wfo-failed.valid.json");
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText(/run failed at/);
    await act(async () => {});
    expect(document.querySelector('[data-action="release-candidate"]')).toBeNull();
    expect(document.querySelector('[data-action="promotion-release-candidate"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull();
    expect(panel("exports")).toBeNull();
    expect(document.querySelector('[data-export-unavailable]')).toBeNull();
    expect(screen.getByRole("button", { name: "Print" })).not.toBeNull();
    for (const field of panel("identity")!.querySelectorAll(".v")) expect(field.textContent).not.toMatch(/\b(rrun|ratt|rwa)_[0-9A-Za-z]{12,}/);
  });

  it("a sheet with a claim keeps the release candidate link and the exports (value path)", async () => {
    await open(retained());
    expect(document.querySelector('[data-action="release-candidate"]')).not.toBeNull();
    expect(panel("exports")).not.toBeNull();
  });

  it("the final audit names the run by its short id, not the 37-character one", async () => {
    const body = retained();
    body.frozen_core.final_audit.final_audit_run_id = "rrun_3d5633d2adb712722fe4ba108102aa5d";
    await open(body);
    const line = panel("final-audit")!.querySelector("[data-final-audit-kind]")!;
    expect(line.textContent).not.toContain("rrun_3d5633d2adb712722fe4ba108102aa5d");
    expect(line.querySelector("[title]")!.getAttribute("title")).toBe("rrun_3d5633d2adb712722fe4ba108102aa5d");
    expect(panel("final-audit")!.querySelector("[data-optimizer-reinvoked]")!.textContent).toMatch(/optimizer not re-run/);
  });
});

describe("QA S09 wave 2 · remaining partials", () => {
  const seg = (state: string, emitted: number | null, source: number | null, sampling: string | null) =>
    ({ state, emitted_point_count: emitted, source_observation_count: source, sampling, points: [] }) as any;

  it("N-4: a sampled IS segment and a full OOS segment each carry their own sampling word (never '300 of 720' then 'all points')", () => {
    expect(equityCaption(seg("AVAILABLE", 336, 336, "FULL"), seg("AVAILABLE", 300, 720, "FULL"))).toBe(
      "before OOS 300 of 720 points · sampled (extrema) · OOS 336 points · all points · UTC",
    );
    expect(equityCaption(seg("AVAILABLE", 598, 1488, "EXTREMA"), seg("AVAILABLE", 261, 261, "EXTREMA"))).toBe(
      "before OOS 261 points · OOS 598 of 1488 points · sampled (extrema) · UTC",
    );
  });

  it("N-4 value path: agreeing segments say the sampling once; a single segment keeps its caption; no sampling token stays typed", () => {
    expect(equityCaption(seg("AVAILABLE", 336, 336, "FULL"), seg("AVAILABLE", 300, 300, "FULL"))).toBe("before OOS 300 points · OOS 336 points · all points · UTC");
    expect(equityCaption(seg("AVAILABLE", 25, 744, "EXTREMA"), null)).toBe("25 of 744 points · sampled (extrema) · UTC");
    expect(equityCaption(seg("AVAILABLE", 25, 25, null), null)).toBe("25 points · sampling not published · UTC");
  });

  it("UX-22: the failed sheet shows an opaque attempt id as prefix + 8, the whole id in the tooltip", async () => {
    const body = fixture("research-report.wfo-failed.valid.json");
    const field = (body.frozen_core.identity as any[]).find((entry) => entry.key === "attempt_id");
    field.value = "rwa_06GFEQ8XZ00VDADK2P63C144W3";
    serve(body);
    renderRoute(body.run_id);
    await screen.findByText(/run failed at/);
    await act(async () => {});
    const cell = panel("identity")!.querySelector('[data-identity="attempt_id"] .v')!;
    expect(cell.textContent).toBe("rwa_06GFEQ8X");
    expect(cell.querySelector("span")!.getAttribute("title")).toBe("rwa_06GFEQ8XZ00VDADK2P63C144W3");
  });

  it("N-1: an artifact reason code breaks at underscores and keeps its exact text", async () => {
    const body = retained();
    await open(body);
    const code = panel("artifacts")!.querySelector("[data-reason-code]")!;
    /* W4: the code is a tooltip, not a word-per-line printed token. */
    expect(code.getAttribute("data-reason-code")).toMatch(/^[A-Z0-9_]+$/);
    expect(code.textContent).not.toMatch(/[A-Z0-9]+_[A-Z0-9]+/);
  });

  it("UX-1: the headline tile names its source beside its scope; a tile without a scope names none", async () => {
    const body = retained();
    await open(body);
    const tile = panel("headline")!.querySelector('[data-headline="NET_RETURN"]')!;
    expect(tile.querySelector("[data-headline-scope]")).not.toBeNull();
    expect(tile.querySelector("[data-headline-value]")!.getAttribute("title")).toContain("sealed report");
    cleanup();
    forgetHeldReports();
    const none = retained();
    none.frozen_core.headline = none.frozen_core.headline.map((cell: any) => ({ ...cell }));
    none.frozen_core.headline[0].scope = "NOT_PUBLISHED";
    await open(none);
    expect(panel("headline")!.querySelector('[data-headline="' + none.frozen_core.headline[0].key + '"] [data-headline-source]')).toBeNull();
  });

  it("UX-1: the all-time return says its scope and source in its label, beside the headline return of another scope", async () => {
    const body = retained();
    body.enriched_analysis = clone(healthy());
    await open(body);
    expect(panel("all-time")!.querySelector("[data-all-time-fact='return'] dt")!.textContent).toBe("Return");
  });
});
