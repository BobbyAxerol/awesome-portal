/**
 * B6 - binding Codex's `enrich_analysis` (`d16058ee`): the generated `EnrichedAnalysis` is the shape.
 *
 * Every value path loads a CANONICAL fixture (`packages/contracts/fixtures/research-enriched-analysis.*`),
 * mutated only where a path needs a state the fixtures do not cover (said in the test). Wire paths:
 *   S04 WFO  Evidence `enriched_analysis`   S04 P04 hub  EvidenceHub TOP-LEVEL `enriched_analysis`
 *   S09      ReportDetail TOP-LEVEL `enriched_analysis` (supplement; the frozen core is unchanged)
 *   S01      Library item `analytics_all_time` (see runLibrary.ea.test.tsx)
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import { ReportRoute } from "./ReportRoute";
import { enrichedOf, type EvidenceHub } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { readEnrichedAnalysis, type EnrichedAnalysis } from "./enrichedAnalysis";
import { healthy, noBenchmark, oldSealAbsent, partialMonth } from "./enrichedAnalysis.fixtures";
import { enrichedOfReport, type ReportDetail } from "./reportClient";
import { forgetRunLabels } from "./runLabels";
import { researchState } from "./state";
import { forgetHeldReports } from "./useReport";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetHeldReports();
  forgetRunLabels();
  window.history.replaceState(null, "", "/");
});

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;
const W3B = local<{ hub_evidence: EvidenceHub; progress: import("./progressClient").ProgressRead; requested_spec: import("./progressClient").RunRequestedSpec }>("w3bRealWfo.fixture.json");
const IDENTITY = { state: "ready" as const, identity: { progress: W3B.progress, requested: W3B.requested_spec } };

/* ------------------------------------------------------------------ guard */

describe("B6 guard - the generated contract is the shape", () => {
  it("the distribution counts of the block are INTEGERS; a string count (the legacy named route's form) is refused", () => {
    const block = healthy();
    expect(block.return_distribution.buckets.every((bucket) => Number.isInteger(bucket.count))).toBe(true);
    expect(block.return_distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(block.return_distribution.observation_count);
    const legacy = clone(block) as unknown as { return_distribution: { buckets: { count: unknown }[] } };
    legacy.return_distribution.buckets[0]!.count = "11";
    expect(readEnrichedAnalysis(legacy)).toMatchObject({ kind: "refused", reason: "UI_ENRICHED_ANALYSIS_SHAPE_INVALID", detail: "return_distribution.buckets" });
  });

  it.each([
    ["lane", (b: Record<string, any>) => { b.lane = "LIVE"; }, "lane"],
    ["scope.coverage", (b: Record<string, any>) => { delete b.scope.coverage; }, "scope"],
    ["scope.window", (b: Record<string, any>) => { b.scope.window = "IS"; }, "scope"],
    ["curves.sampling.method", (b: Record<string, any>) => { b.curves.sampling.method = "EXTREMA_BUCKET_V2"; }, "curves.sampling"],
    ["monthly sampling", (b: Record<string, any>) => { delete b.monthly_returns.sampling; }, "monthly_returns"],
    ["monthly basis", (b: Record<string, any>) => { b.monthly_returns.values[0].basis = "WHATEVER"; }, "monthly_returns.values"],
    ["episodes open flag", (b: Record<string, any>) => { delete b.drawdown_episodes.longest_open; }, "drawdown_episodes"],
    ["library_summary", (b: Record<string, any>) => { delete b.library_summary; }, "library_summary"],
    ["library_summary coverage", (b: Record<string, any>) => { b.library_summary.coverage = "ALL"; }, "library_summary"],
  ])("a block with a bad %s is refused as a shape problem", (_name, mutate, detail) => {
    const block = clone(healthy()) as unknown as Record<string, any>;
    mutate(block);
    expect(readEnrichedAnalysis(block)).toMatchObject({ kind: "refused", reason: "UI_ENRICHED_ANALYSIS_SHAPE_INVALID", detail });
  });

  it("keeps the earlier refusals: basis, rolling, schema", () => {
    expect(readEnrichedAnalysis({ ...clone(healthy()), basis: "LAST_30D" })).toMatchObject({ reason: "UI_ENRICHED_ANALYSIS_BASIS_NOT_ALL_TIME" });
    expect(readEnrichedAnalysis({ ...clone(healthy()), rolling: { window: 30 } })).toMatchObject({ reason: "UI_ENRICHED_ANALYSIS_HAS_ROLLING" });
    expect(readEnrichedAnalysis({ ...clone(healthy()), schema_version: "research.enriched-analysis.v2" })).toMatchObject({ reason: "UI_ENRICHED_ANALYSIS_SCHEMA_UNKNOWN" });
  });

  it("the Hub's block is TOP-LEVEL: enrichedOf reads it there and never from `core`", () => {
    const hub = { ...clone(W3B.hub_evidence), enriched_analysis: healthy() } as EvidenceHub;
    expect(enrichedOf(hub).kind).toBe("block");
    const nested = { ...clone(W3B.hub_evidence), core: { ...(W3B.hub_evidence as unknown as { core: object }).core, enriched_analysis: healthy() } } as unknown as EvidenceHub;
    expect(enrichedOf(nested)).toEqual({ kind: "absent" });
  });

  it("the report reader is top-level too, reads once, and an old seal is absent", () => {
    const report = { enriched_analysis: healthy() } as unknown as ReportDetail;
    expect(enrichedOfReport(report)).toBe(enrichedOfReport(report));
    expect(enrichedOfReport(report).kind).toBe("block");
    expect(enrichedOfReport({ frozen_core: { enriched_analysis: healthy() } } as unknown as ReportDetail)).toEqual({ kind: "absent" });
    expect(enrichedOfReport({ enriched_analysis: oldSealAbsent().enriched_analysis } as unknown as ReportDetail)).toEqual({ kind: "absent" });
  });
});

/* ---------------------------------------------------------- S04 P04 hub lane */

function hubView(block: unknown | undefined, entry = "/") {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
  const hub = (block === undefined ? { ...W3B.hub_evidence } : { ...W3B.hub_evidence, enriched_analysis: block }) as EvidenceHub;
  const ensureSeries = vi.fn();
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <EvidenceFlow
        runId="R-P04-021"
        hub={hub}
        state={researchState({ kind: "ok", rowCount: 5 })}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={ensureSeries}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        runIdentity={IDENTITY}
      />
    </MemoryRouter>,
  );
  return { ...view, ensureSeries };
}
const settleHub = (container: HTMLElement) => waitFor(() => expect(container.querySelector("[data-metrics]")).toBeTruthy(), { timeout: 15_000 });
const settleDist = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector("[data-chart-table='distribution']")).toBeTruthy(), { timeout: 15_000 });

describe("B6 S04 - the P04 hub lane draws from the Hub's top-level block", () => {
  it("healthy: monthly (partial hatched), curves, distribution (integer counts), episodes, behaviour, windows; no series is asked", async () => {
    const { container, ensureSeries } = hubView(clone(healthy()));
    await settleDist(container);
    const block = healthy();

    const monthly = container.querySelector("[data-series-panel='MONTHLY_RETURNS']") as HTMLElement;
    expect(monthly.getAttribute("data-series-state")).toBe("ready");
    expect(monthly.querySelector("[data-enriched-chip]")?.textContent).toBe("portal-derived · OOS");
    expect([...monthly.querySelectorAll("[data-month]")].map((m) => m.getAttribute("data-month-partial"))).toEqual(["true", null, "true"]);

    const dist = container.querySelector("[data-series-panel='RETURN_DISTRIBUTION']") as HTMLElement;
    expect(dist.getAttribute("data-series-state")).toBe("ready");
    const counts = [...dist.querySelectorAll("[data-chart-table='distribution'] tbody tr")].map((row) => row.textContent ?? "");
    expect(counts).toHaveLength(12);
    expect(counts[0]).toContain("11");
    expect(counts[5]).toContain("36");

    await waitFor(() => expect(container.querySelector("[data-chart-table='strategy-benchmark']")).toBeTruthy(), { timeout: 15_000 });
    expect(container.querySelector("[data-strategy-figure]")?.textContent).toContain("Strategy vs benchmark — OOS");
    expect(container.querySelector("[data-underwater-strip]")).toBeTruthy();

    const episodes = container.querySelector("[data-drawdown-episodes='ready']") as HTMLElement;
    expect(episodes.querySelectorAll("tbody tr")).toHaveLength(Math.min(3, block.drawdown_episodes.values.length));
    expect(episodes.querySelector("[data-episodes-count]")?.textContent).toBe("top 3 / 11 · all recovered");

    const behaviour = container.querySelector("[data-behavior-scope='all-time']") as HTMLElement;
    expect((behaviour.querySelector("[data-behavior-tile='sortino'] [data-exact]") as HTMLElement).getAttribute("data-exact")).toBe(block.facts.metrics.sortino.value);

    expect(container.querySelector("[data-metric-value='OOS_SHARPE']")?.getAttribute("data-exact")).toBe(block.facts.metrics.sharpe.value);
    expect(container.querySelector("[data-window-switcher] [data-segment='IS']")?.getAttribute("title")).toContain("RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD");
    expect(container.querySelector("[data-coverage-chip]")).toBeNull();
    expect(ensureSeries).not.toHaveBeenCalledWith("MONTHLY_RETURNS");
    expect(ensureSeries).not.toHaveBeenCalledWith("RETURN_DISTRIBUTION");
  }, 25_000);

  it("a block placed under `core` is not read: the Hub keeps today's panels", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
    const hub = { ...W3B.hub_evidence, core: { ...(W3B.hub_evidence as unknown as { core: object }).core, enriched_analysis: healthy() } } as unknown as EvidenceHub;
    const { container } = render(
      <MemoryRouter>
        <EvidenceFlow
          runId="R-P04-021"
          hub={hub}
          state={researchState({ kind: "ok", rowCount: 5 })}
          cursor={DEFAULT_CURSOR}
          onStage={vi.fn()}
          onFold={vi.fn()}
          onResetCursor={vi.fn()}
          series={new Map()}
          ensureSeries={vi.fn()}
          passport={{ state: "idle" }}
          ensurePassport={vi.fn()}
          onReread={vi.fn()}
          runIdentity={IDENTITY}
        />
      </MemoryRouter>,
    );
    await settleHub(container);
    expect(container.querySelector("[data-enriched-chip]")).toBeNull();
    expect(container.querySelector("[data-drawdown-episodes]")).toBeNull();
  }, 20_000);

  it("partial-month (FIXED, sampled): the single partial month is drawn, the 'sampled' chip carries the source count, the histogram keeps the served reason", async () => {
    const block = partialMonth();
    const { container, ensureSeries } = hubView(clone(block));
    await settleHub(container);
    await waitFor(() => expect(container.querySelector("[data-series-panel='RETURN_DISTRIBUTION']")).toBeTruthy());

    const monthly = container.querySelector("[data-series-panel='MONTHLY_RETURNS']") as HTMLElement;
    const months = [...monthly.querySelectorAll("[data-month]")] as HTMLElement[];
    expect(months).toHaveLength(1);
    expect(months[0]!.getAttribute("data-month-partial")).toBe("true");
    expect(months[0]!.getAttribute("title")).toContain("partial month · 10 of 744 observations");
    expect(months[0]!.getAttribute("data-exact")).toBe(block.monthly_returns.values[0]!.return_fraction);

    /* sampled coverage: a small chip with a tooltip, on the panels drawn from the block */
    const chips = [...container.querySelectorAll("[data-coverage-chip]")] as HTMLElement[];
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.textContent).toBe("sampled");
      expect(chip.getAttribute("title")).toContain("10 of 744 source observations");
      expect(chip.getAttribute("title")).toContain("not a full daily ledger");
      expect(chip.getAttribute("aria-label")).toContain("not a full daily ledger");
    }

    /* NOT_PUBLISHED histogram: typed absence with the reason the block served, no bars, no series request */
    const dist = container.querySelector("[data-series-panel='RETURN_DISTRIBUTION']") as HTMLElement;
    expect(dist.querySelector("[data-chart-table='distribution']")).toBeNull();
    const absent = dist.querySelector("[data-withheld]") as HTMLElement;
    expect(absent.getAttribute("data-withheld")).toBe("NOT_PUBLISHED");
    expect(absent.getAttribute("data-reason-code")).toBe("P04_RETAINED_SAMPLED_EQUITY_HAS_NO_DAILY_RETURN_LEDGER");
    expect(ensureSeries).not.toHaveBeenCalledWith("RETURN_DISTRIBUTION");

    /* one episode, discloses total and no open episode */
    expect(container.querySelector("[data-episodes-count]")?.textContent).toBe("1 · all recovered");
    /* the sampled-only facts the block does not publish stay typed, never 0 */
    const sharpe = block.facts.metrics.sharpe;
    expect(sharpe.state).toBe("NOT_PUBLISHED");
    expect(container.querySelector("[data-metric-value='OOS_SHARPE']")?.getAttribute("data-exact") ?? null).toBeNull();
  }, 25_000);

  it("no-benchmark: the figure keeps its typed benchmark absence with the served reason", async () => {
    const block = noBenchmark();
    const { container } = hubView(clone(block));
    await settleDist(container);
    await waitFor(() => expect(container.querySelector("[data-benchmark-curve-absent]")).toBeTruthy(), { timeout: 15_000 });
    expect(container.querySelector("[data-benchmark-curve-absent] [data-withheld]")?.getAttribute("data-reason-code")).toBe(block.facts.metrics.benchmark_return_fraction.reason_code);
  }, 25_000);

  it("old seal (no block): no chip, no episodes card, no refusal line", async () => {
    const { container } = hubView(oldSealAbsent().enriched_analysis);
    await settleHub(container);
    expect(container.querySelector("[data-enriched-chip]")).toBeNull();
    expect(container.querySelector("[data-drawdown-episodes]")).toBeNull();
    expect(container.querySelector("[data-enriched-refused]")).toBeNull();
  }, 20_000);

  it("a refused hub block (rolling) is one line and draws nothing from it", async () => {
    const { container } = hubView({ ...clone(healthy()), rolling: { window: 63 } });
    await settleHub(container);
    expect(container.querySelector("[data-enriched-refused]")?.getAttribute("data-enriched-refused")).toBe("UI_ENRICHED_ANALYSIS_HAS_ROLLING");
    expect(container.querySelector("[data-enriched-chip]")).toBeNull();
    expect(container.querySelector("[data-drawdown-episodes]")).toBeNull();
  }, 20_000);
});

/* ------------------------------------------------------------------- S09 */

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
type Body = Omit<ReportDetail, "frozen_core"> & { frozen_core: any };
const report = () => JSON.parse(readFileSync(join(FIXTURES, "research-report.wfo-retained.valid.json"), "utf8")) as Body;

function serve(body: Body) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => ({ ok: true, status: 200, statusText: "200", headers: new Headers(), json: async () => body }) as unknown as Response,
  );
}
function renderReport(runId: string) {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/report`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}
const panel = () => document.querySelector("[data-panel='all-time']") as HTMLElement;

describe("B6 S09 - the supplemental all-time section", () => {
  it("value path: curve, six facts, monthly strip and episodes, labelled supplemental; the frozen core is untouched", async () => {
    const body = report();
    const frozenBefore = JSON.stringify(body.frozen_core);
    const block: EnrichedAnalysis = healthy();
    serve({ ...body, enriched_analysis: clone(block) } as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");

    const section = panel();
    expect(section.getAttribute("data-all-time")).toBe("ready");
    expect(section.querySelector("h2")?.textContent).toContain("All-time");
    /* W4: the raw function name is no visible chip text; it leads the chip's tooltip. */
    expect(section.querySelector("[data-enriched-chip]")?.textContent).toBe("ⓘ");
    expect(section.querySelector("[data-enriched-chip]")?.getAttribute("title")).toContain("enrich_analysis · all time");
    expect(section.querySelector("[data-enriched-chip]")?.getAttribute("title")).toContain("not part of the frozen core");
    expect(section.querySelector("[data-enriched-chip]")?.getAttribute("title")).toContain(block.scope.locator);
    expect(section.querySelector("[data-coverage-chip]")).toBeNull();

    const fact = (name: string) => section.querySelector(`[data-all-time-fact='${name}'] dd`) as HTMLElement;
    expect(fact("Sharpe").textContent).toBe("3.651");
    expect(fact("Sharpe").getAttribute("data-exact")).toBe(block.facts.metrics.sharpe.value);
    expect(fact("Sharpe").getAttribute("title")).toContain(block.facts.metrics.sharpe.source_locator);
    expect(fact("Sharpe").getAttribute("aria-label")).toContain("portal-derived");
    expect(fact("return").textContent).toBe("+13.94%");
    expect(fact("max DD").textContent).toBe("−1.77%");
    expect(fact("max DD").getAttribute("data-exact")).toBe(block.library_summary.max_drawdown_fraction);
    expect(fact("max DD length").textContent).toBe("2 d");
    expect(section.textContent).not.toMatch(/(?<![\d\w])-\d/);

    const curve = section.querySelector("[data-all-time-curve]") as HTMLElement;
    expect(curve.getAttribute("data-has-benchmark")).toBe("true");
    /* strategy + benchmark + the served drawdown strip */
    expect(curve.querySelectorAll("polyline")).toHaveLength(3);
    expect(curve.querySelectorAll("[data-curve-plot] polyline")).toHaveLength(3);
    expect(curve.querySelector("[data-curve-sampling]")?.textContent).toBe("32 of 60 points");

    const months = [...section.querySelectorAll("[data-month]")] as HTMLElement[];
    expect(months.map((m) => m.getAttribute("data-month-partial"))).toEqual(["true", null, "true"]);
    expect(months[0]!.getAttribute("title")).toContain("partial month · 22 of 31 observations");
    expect(months[0]!.getAttribute("title")).toContain("first-oos-close");
    expect(section.querySelector("[data-months-window]")).toBeNull();

    expect(section.querySelectorAll("[data-all-time-episodes] tbody tr")).toHaveLength(10);
    expect(section.querySelector("[data-episodes-count]")?.textContent).toBe("top 10 / 11");
    expect(section.querySelector("[data-open-episode]")?.getAttribute("data-open-episode")).toBe("false");

    /* the frozen core is fully visible and unchanged */
    expect(JSON.stringify(body.frozen_core)).toBe(frozenBefore);
    expect(document.querySelector("[data-panel='promotion']")).toBeTruthy();
    expect(document.querySelector("[data-panel='provenance']")).toBeTruthy();
    /* the section sits after the sealed blocks and before promotion */
    const order = [...document.querySelectorAll("[data-panel]")].map((node) => node.getAttribute("data-panel"));
    expect(order.indexOf("all-time")).toBeGreaterThan(order.indexOf("warnings"));
    expect(order.indexOf("all-time")).toBeLessThan(order.indexOf("promotion"));
  });

  it("sampled coverage shows the 'sampled' chip with a tooltip; a missing benchmark stays declared, not zero", async () => {
    const body = report();
    const block = partialMonth();
    serve({ ...body, enriched_analysis: clone(block) } as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    const chip = panel().querySelector("[data-coverage-chip]") as HTMLElement;
    expect(chip.textContent).toBe("sampled");
    expect(chip.getAttribute("title")).toContain("10 of 744 source observations");
    expect(chip.getAttribute("title")).toContain("not a full daily ledger");
    expect(panel().querySelector("[data-curve-legend]")?.textContent).toContain("benchmark not published");
    /* Sharpe is NOT_PUBLISHED in the block: its cell is a typed absence with the served reason, never 0 */
    const sharpe = panel().querySelector("[data-all-time-fact='Sharpe']") as HTMLElement;
    expect(sharpe.getAttribute("data-fact-state")).toBe("NOT_PUBLISHED");
    expect(sharpe.querySelector("[data-reason-code]")?.getAttribute("data-reason-code")).toBe(block.facts.metrics.sharpe.reason_code);
    expect(sharpe.textContent).not.toMatch(/\b0(\.0+)?\b/);
    expect(panel().querySelectorAll("[data-month]")).toHaveLength(1);
  });

  it("a long monthly series says how many months were sent (TAIL_WINDOW_V1), from the block's own counts", async () => {
    const body = report();
    const block = clone(healthy());
    block.monthly_returns.sampling = "TAIL_WINDOW_V1";
    block.monthly_returns.total_period_count = 40;
    block.monthly_returns.omitted_transport_period_count = 37;
    serve({ ...body, enriched_analysis: block } as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().querySelector("[data-months-window]")?.textContent).toBe("last 3 of 40 months");
  });

  it("an open episode is marked open, and longest_open is disclosed", async () => {
    const body = report();
    const block = clone(healthy());
    block.drawdown_episodes.values[0] = { ...block.drawdown_episodes.values[0]!, recovery_utc_ms: null };
    block.drawdown_episodes.open_episode_present = true;
    block.drawdown_episodes.longest_open = true;
    serve({ ...body, enriched_analysis: block } as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().querySelector("[data-episode='1']")?.getAttribute("data-episode-open")).toBe("true");
    expect(panel().querySelector("[data-open-episode]")?.getAttribute("data-longest-open")).toBe("true");
    expect(panel().querySelector("[data-open-episode]")?.textContent).toBe("open · longest");
  });

  it("old report (no block): one typed line, no frame, and the sealed sheet is whole", async () => {
    const body = report();
    serve(body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().getAttribute("data-all-time")).toBe("absent");
    expect(panel().querySelector("[data-absent-state='NOT_PUBLISHED']")?.textContent).toContain("not published");
    /* no reason code is invented: the server serves none on this path */
    expect(panel().querySelector("[data-reason-code]")).toBeNull();
    expect(panel().querySelector("svg")).toBeNull();
    expect(panel().querySelector("[data-enriched-chip]")).toBeNull();
    expect(document.querySelector("[data-panel='promotion']")).toBeTruthy();
  });

  it("the old-seal guard fixture (enriched_analysis: null) is the same absence", async () => {
    const body = report();
    serve({ ...body, enriched_analysis: oldSealAbsent().enriched_analysis } as unknown as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().getAttribute("data-all-time")).toBe("absent");
  });

  it.each([
    ["basis", { basis: "LAST_30D" }, "UI_ENRICHED_ANALYSIS_BASIS_NOT_ALL_TIME"],
    ["rolling", { rolling: { window: 63 } }, "UI_ENRICHED_ANALYSIS_HAS_ROLLING"],
    ["schema", { schema_version: "research.enriched-analysis.v9" }, "UI_ENRICHED_ANALYSIS_SCHEMA_UNKNOWN"],
  ])("a refused block (%s) is one line and nothing is drawn from it", async (_name, patch, marker) => {
    const body = report();
    serve({ ...body, enriched_analysis: { ...clone(healthy()), ...patch } } as unknown as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    const line = panel().querySelector("[data-enriched-refused]") as HTMLElement;
    expect(line.getAttribute("data-enriched-refused")).toBe(marker);
    expect(line.textContent).toContain("not drawn");
    expect(panel().querySelector("svg")).toBeNull();
    expect(panel().querySelector("[data-all-time-facts]")).toBeNull();
    expect(panel().querySelector("[data-month]")).toBeNull();
  });

  it("the block's own absences stay typed: no episodes, no months", async () => {
    const body = report();
    const block = clone(healthy());
    block.drawdown_episodes = { ...block.drawdown_episodes, state: "NOT_PUBLISHED", reason_code: "AN29_NO_EPISODES_PUBLISHED", total: 0, values: [] };
    block.monthly_returns = { ...block.monthly_returns, state: "NOT_APPLICABLE", reason_code: "AN29_NO_MONTH", values: [] };
    serve({ ...body, enriched_analysis: block } as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().querySelector("[data-absent='drawdown episodes'][data-reason-code]")?.getAttribute("data-reason-code")).toBe("AN29_NO_EPISODES_PUBLISHED");
    expect(panel().querySelector("[data-absent='monthly returns'][data-reason-code]")?.getAttribute("data-reason-code")).toBe("AN29_NO_MONTH");
    expect(panel().querySelector("[data-month]")).toBeNull();
    expect(panel().querySelector("table")).toBeNull();
  });
});

/* ------------------------------------------------------- no proposed fixture */

describe("B6 - no test reads the proposed fixture", () => {
  it("only canonical fixtures are loaded by the enrich_analysis tests", () => {
    for (const name of ["evidenceFlow.ea.test.tsx", "runLibrary.ea.test.tsx", "enrichedAnalysis.b6.test.tsx"]) {
      const source = readFileSync(join(process.cwd(), "src", "research", name), "utf8");
      expect(source.includes("enriched-analysis." + "proposed")).toBe(false);
    }
  });
});
