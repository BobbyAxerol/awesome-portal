/**
 * Screen 04 — D-AN-01 all-time analytics and the window disclosure (group S04_AN).
 *
 * Value path: the published canonical v2 block (`research-retained-analytics-v2.fixed.valid.json`,
 * the shape R-WFO-020 serves) attached to the real retained capture. Absence path: the same capture
 * without the block (an old seal), and facts the server typed absent. Window disclosure: the
 * published `research-evidence.window-disclosure.valid.json`.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import type { CurrentSourceEvidence, EvidenceHub, RetainedAnalyticsV2, WindowDisclosure } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { strategyBenchmarkOption } from "./EvidenceCharts";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const published = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;

const V2 = published<RetainedAnalyticsV2>("research-retained-analytics-v2.fixed.valid.json");
const DISCLOSURE = published<WindowDisclosure>("research-evidence.window-disclosure.valid.json");
const W3 = local<{ evidence: CurrentSourceEvidence }>("w3RealWfo.fixture.json");
const W3B = local<{ hub_evidence: EvidenceHub; progress: import("./progressClient").ProgressRead; requested_spec: import("./progressClient").RunRequestedSpec }>(
  "w3bRealWfo.fixture.json",
);
const IDENTITY = { state: "ready" as const, identity: { progress: W3B.progress, requested: W3B.requested_spec } };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function view(overrides: Partial<React.ComponentProps<typeof EvidenceFlow>> = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
  return render(
    <MemoryRouter>
      <EvidenceFlow
        runId="R-WFO-020"
        hub={W3B.hub_evidence}
        state={researchState({ kind: "ok", rowCount: 5 })}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "ready", evidence: W3.evidence }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        runIdentity={IDENTITY}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

/** The lazy chart chunk settles before a test ends (console guard), as in evidenceFlow.test. */
const settle = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector("[data-chart-table='strategy-benchmark']")).toBeTruthy(), { timeout: 15_000 });

const withV2 = (v2: RetainedAnalyticsV2): React.ComponentProps<typeof EvidenceFlow>["passport"] => ({
  state: "ready",
  evidence: { ...W3.evidence, summary_analytics_v2: v2 } as CurrentSourceEvidence,
});

describe("S04 · D-AN-01 — value path (published v2 block)", () => {
  it("shows five hero tiles; the Sharpe hero is all-time with the fold mean as its foot", async () => {
    const { container } = view({ passport: withV2(V2) });
    await settle(container);
    expect(container.querySelectorAll("[data-metric-lane='retained']")).toHaveLength(5);
    const sharpe = container.querySelector("[data-metric-value='OOS_SHARPE']") as HTMLElement;
    expect(sharpe.getAttribute("data-exact")).toBe(V2.metrics.sharpe.value);
    expect(sharpe.textContent).toBe("−1.96");
    const foot = container.querySelector("[data-metric='OOS_SHARPE'] [data-metric-scope]")?.textContent ?? "";
    expect(foot).toContain("OOS");
    expect(foot).toContain("engine-direct");
    expect(foot).toContain("fold mean");
    expect(container.querySelector("[data-metric='OOS_SORTINO']")).toBeNull();
  });

  it("replaces the rolling panel with 'Strategy vs benchmark — OOS' and its four cells", async () => {
    const ensureSeries = vi.fn();
    const ensureRetainedKind = vi.fn();
    const { container } = view({ passport: withV2(V2), ensureSeries, ensureRetainedKind });
    await settle(container);
    const figure = container.querySelector("[data-strategy-figure]") as HTMLElement;
    expect(figure.textContent).toContain("Strategy vs benchmark — OOS");
    expect(container.querySelector("[data-rolling-figure]")).toBeNull();
    const exact = (id: string) => figure.querySelector(`[data-behavior-tile='${id}'] [data-exact]`)?.getAttribute("data-exact");
    expect(exact("beta")).toBe(V2.metrics.beta.value);
    expect(exact("corr")).toBe(V2.metrics.correlation.value);
    expect(exact("sharpe")).toBe(V2.metrics.sharpe.value);
    expect(exact("sortino")).toBe(V2.metrics.sortino.value);
    expect(figure.querySelector("[data-behavior-tile='beta']")?.textContent).toContain("−0.01");
    expect(figure.querySelector("[data-behavior-tile='benchmark']")?.textContent).toContain("−10.13%");
    expect([...ensureSeries.mock.calls, ...ensureRetainedKind.mock.calls].some(([kind]) => String(kind).startsWith("ROLLING_"))).toBe(false);
  });

  it("draws both rebased curves from the served points (no rebasing here)", async () => {
    const { container } = view({ passport: withV2(V2) });
    await waitFor(() => expect(container.querySelector("[data-chart-table='strategy-benchmark']")).toBeTruthy(), { timeout: 15_000 });
    const rows = container.querySelectorAll("[data-chart-table='strategy-benchmark'] tbody tr");
    expect(rows).toHaveLength(V2.strategy_curve.length + V2.benchmark_curve.length);
    const option = strategyBenchmarkOption(V2.strategy_curve, V2.benchmark_curve) as unknown as { series: { name: string; data: [number, number][] }[] };
    expect(option.series.map((entry) => entry.name)).toEqual(["Strategy", "Benchmark (buy and hold)"]);
    expect(option.series[0]!.data[0]).toEqual([V2.strategy_curve[0]!.at_utc_ms, 100]);
    expect(option.series[1]!.data).toHaveLength(V2.benchmark_curve.length);
  }, 20_000);

  it("Behavior: every all-time fact, each with its origin and scope in the tooltip and accessible name", async () => {
    const { container } = view({ passport: withV2(V2) });
    await settle(container);
    const card = container.querySelector("[data-behavior-scope='all-time']") as HTMLElement;
    expect(card.textContent).toContain("OOS");
    expect(card.textContent).not.toContain("all time");
    const cell = (label: string) => card.querySelector(`[data-behavior-tile='${label}'] [data-exact]`) as HTMLElement;
    expect(cell("sortino").getAttribute("data-exact")).toBe(V2.metrics.sortino.value);
    expect(cell("sortino").getAttribute("data-fact-origin")).toBe("ENGINE_DIRECT");
    expect(cell("cagr").textContent).toBe("−1.75%");
    expect(cell("profit factor").getAttribute("data-exact")).toBe(V2.metrics.profit_factor.value);
    expect(cell("skew").getAttribute("data-fact-origin")).toBe("PORTAL_DERIVED");
    expect(cell("skew").getAttribute("title")).toContain("portal-derived");
    expect(cell("skew").getAttribute("title")).toContain(V2.metrics.skew.source_locator);
    expect(cell("skew").getAttribute("aria-label")).toBe("Skew 0.75, portal-derived, OOS all time");
    expect(cell("excess kurtosis").getAttribute("data-exact")).toBe(V2.metrics.excess_kurtosis.value);
    expect(cell("volatility").textContent).toBe("1.13%");
    expect(cell("long-bar hit").textContent).toBe("37.93%");
    expect(cell("short-bar hit").textContent).toBe("51.56%");
    expect(cell("drawdown duration").textContent).toContain("74.3 d");
    expect(cell("drawdown duration").textContent).toContain("open");
    expect(cell("turnover").getAttribute("data-exact")).toBe(V2.behaviour.turnover_notional.value);
    const lsf = card.querySelector("[data-exposure-lsf]") as HTMLElement;
    expect(["L", "S", "F"].map((side) => lsf.querySelector(`[data-exposure='${side}'] [data-exact]`)?.getAttribute("data-exact"))).toEqual([
      V2.behaviour.exposure_long_fraction.value,
      V2.behaviour.exposure_short_fraction.value,
      V2.behaviour.exposure_flat_fraction.value,
    ]);
    expect(card.textContent).toContain("exposure episodes (not trades)");
    expect(cell("win rate").textContent).toBe("28.57%");
    expect(cell("payoff").getAttribute("data-exact")).toBe(V2.behaviour.payoff_ratio.value);
    expect(cell("avg hold").getAttribute("data-exact")).toBe(V2.behaviour.average_hold_seconds.value);
    expect(cell("max consec. loss").textContent).toBe("5");
    expect(container.querySelector("[data-analytics-v2-absent]")).toBeNull();
  });

  it("a recovered drawdown carries no 'open' mark", async () => {
    const { container } = view({ passport: withV2({ ...clone(V2), drawdown_recovered: true }) });
    await settle(container);
    expect(container.querySelector("[data-behavior-tile='drawdown duration']")?.textContent).not.toContain("open");
  });

  it("the Hub lane (P04) binds the same block from `summary_analytics_v2` on the Hub", async () => {
    const hub = { ...clone(W3B.hub_evidence), summary_analytics_v2: V2 } as EvidenceHub;
    const { container } = view({ hub, passport: { state: "idle" } });
    await settle(container);
    expect(container.querySelector("[data-strategy-figure]")).toBeTruthy();
    expect(container.querySelector("[data-behavior-scope='all-time']")).toBeTruthy();
  });

  it("the Hub hero Sharpe tile shows the all-time v2 Sharpe, not 'not published' beside the same number in the cells (R-P04-021)", async () => {
    const hub = { ...clone(W3B.hub_evidence), summary_analytics_v2: V2 } as EvidenceHub;
    const { container } = view({ hub, passport: { state: "idle" } });
    await settle(container);
    const tile = container.querySelector("[data-tile='OOS_SHARPE'], [data-metric='OOS_SHARPE']");
    const text = tile?.textContent ?? "";
    expect(text).toContain("OOS");
    expect(text).not.toMatch(/not published/i);
    expect(text).toContain(Number(V2.metrics.sharpe.value).toFixed(2).replace(/^-/, "−"));
  });
});

describe("S04 · D-AN-01 — absence path", () => {
  it("an old seal (no v2) is one typed line with the served code, not ten empty tiles", () => {
    const { container } = view();
    expect(container.querySelectorAll("[data-metric-lane='retained']")).toHaveLength(5);
    expect(container.querySelector("[data-strategy-figure]")).toBeNull();
    expect(container.querySelector("[data-behavior-scope='all-time']")).toBeNull();
    const line = container.querySelectorAll("[data-analytics-v2-absent]");
    expect(line).toHaveLength(1);
    expect(line[0]!.getAttribute("data-reason-code")).toBe(W3.evidence.source_absences.benchmark.reason_code);
    expect(line[0]!.textContent).toContain("all-time analytics — not published");
    expect(line[0]!.textContent).toContain(W3.evidence.source_absences.benchmark.reason_code as string);
  });

  it("the served PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL code is shown as served", () => {
    const code = "PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL";
    const evidence = {
      ...W3.evidence,
      source_absences: { ...W3.evidence.source_absences, benchmark: { state: "NOT_PUBLISHED", reason_code: code, availability: { state: "NOT_PUBLISHED", reason_code: code } } },
    } as unknown as CurrentSourceEvidence;
    const { container } = view({ passport: { state: "ready", evidence } });
    expect(container.querySelector("[data-analytics-v2-absent] [data-absence-code]")?.textContent).toBe(code);
  });

  it("a fact the server typed absent keeps its cell with the code, never a 0, and the benchmark curve says why", async () => {
    const code = "AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED";
    const gap = (fact: RetainedAnalyticsV2["metrics"]["beta"]) => ({ ...fact, state: "NOT_PUBLISHED" as const, value: null, reason_code: code });
    const v2 = clone(V2);
    v2.metrics.beta = gap(v2.metrics.beta);
    v2.metrics.correlation = gap(v2.metrics.correlation);
    v2.metrics.benchmark_return_fraction = gap(v2.metrics.benchmark_return_fraction);
    v2.metrics.long_hit_rate_fraction = gap(v2.metrics.long_hit_rate_fraction);
    v2.benchmark_curve = [];
    const { container } = view({ passport: withV2(v2) });
    await settle(container);
    for (const id of ["beta", "corr", "benchmark"]) {
      const withheld = container.querySelector(`[data-strategy-figure] [data-behavior-tile='${id}'] [data-withheld]`);
      expect(withheld?.getAttribute("data-reason-code"), id).toBe(code);
      expect(container.querySelector(`[data-strategy-figure] [data-behavior-tile='${id}'] [data-exact]`), id).toBeNull();
    }
    expect(container.querySelector("[data-benchmark-curve-absent] [data-withheld]")?.getAttribute("data-reason-code")).toBe(code);
    const hit = container.querySelector("[data-behavior-scope='all-time'] [data-behavior-tile='long-bar hit']") as HTMLElement;
    expect(hit.querySelector("[data-withheld]")?.getAttribute("data-reason-code")).toBe(code);
    expect(hit.textContent).not.toMatch(/(^|\s)0(\.0+)?%?(\s|$)/);
    /* The facts that stayed available keep their values. */
    expect(container.querySelector("[data-behavior-tile='sortino'] [data-exact]")).toBeTruthy();
  });

  it("an Hub-lane run with no v2 keeps its old typed cells and draws no all-time figure", () => {
    const { container } = view({ passport: { state: "idle" } });
    expect(container.querySelector("[data-strategy-figure]")).toBeNull();
    expect(container.querySelector("[data-gap='behavior-tiles']")).toBeTruthy();
  });
});

describe("S04 · window disclosure — 04-W (published `core.window_disclosure`)", () => {
  const claim = { ...DEFAULT_CURSOR, stage: "claim" as const };
  const withDisclosure = (value: WindowDisclosure | undefined) =>
    ({ ...W3B.hub_evidence, core: { ...W3B.hub_evidence.core, window_disclosure: value } }) as EvidenceHub;

  it("fills IS and OOS bar counts (sums, per-fold in the tooltip) and the holdout as denied with its code", () => {
    const { container } = view({ cursor: claim, hub: withDisclosure(DISCLOSURE) });
    const row = (key: string) => container.querySelector(`[data-window-row='${key}']`) as HTMLElement;
    expect(row("IS").querySelector("[data-window-bars]")?.textContent).toBe("Σ 144 bars");
    expect(row("OOS").querySelector("[data-window-bars]")?.textContent).toBe("Σ 96 bars");
    const title = row("IS").querySelector("[data-window-bars]")?.getAttribute("title") ?? "";
    expect(title).toContain("may overlap");
    expect(title).toContain("fold 1: IS 144 · OOS 96");
    const holdout = row("Holdout").querySelector("[data-holdout-bars='DENIED']") as HTMLElement;
    expect(holdout.textContent).toContain("bars — denied");
    expect(holdout.querySelector("[data-reason-code]")?.getAttribute("data-reason-code")).toBe("P13_SEALED_HOLDOUT_BAR_COUNT_DENIED");
  });

  it("an absent disclosure is a typed absence with the served code, never 0 bars", () => {
    const absent: WindowDisclosure = {
      availability: { state: "NOT_PUBLISHED", reason_code: "P13_WINDOW_DISCLOSURE_MANIFEST_NOT_PUBLISHED" },
      aggregation_scope: null,
      is_bars: null,
      oos_bars: null,
      folds: [],
      holdout_bars: { state: "DENIED", reason_code: "P13_SEALED_HOLDOUT_BAR_COUNT_DENIED", value: null },
    };
    const { container } = view({ cursor: claim, hub: withDisclosure(absent) });
    const is = container.querySelector("[data-window-row='IS'] [data-window-count]") as HTMLElement;
    expect(is.querySelector("[data-withheld]")?.getAttribute("data-reason-code")).toBe("P13_WINDOW_DISCLOSURE_MANIFEST_NOT_PUBLISHED");
    expect(is.textContent).not.toMatch(/\d bars/);
    expect(container.querySelector("[data-window-row='OOS'] [data-window-bars]")).toBeNull();
  });

  it("an older responder with no disclosure keeps the plain 'not published' cell", () => {
    const { container } = view({ cursor: claim, hub: withDisclosure(undefined) });
    expect(container.querySelector("[data-window-row='IS'] [data-window-count] [data-withheld='NOT_PUBLISHED']")).toBeTruthy();
    expect(container.querySelector("[data-window-bars]")).toBeNull();
  });
});
