/**
 * Screen 04 — the `enrich_analysis` block (group S04_EA).
 *
 * The block is the frontend's own proposal (`ENRICH_ANALYSIS_SERVICE_SPEC_2026-10-01.md`); the backend
 * does not serve it yet, so the value path loads the PROPOSED fixture, not a backend capture. Absence
 * path: the real retained capture with no block (an old seal), a block the guard refuses, and the
 * block's own typed absences. The guard refuses any `basis` that is not ALL_TIME and any `rolling`.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow, retainedTiles } from "./EvidenceFlow";
import { enrichedOf, type CurrentSourceEvidence, type EvidenceHub } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { readEnrichedAnalysis, type EnrichedAnalysis } from "./enrichedAnalysis";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

/* Same relative path the spec names (`upgrade/research_loop/evidence/P21/enrich-analysis/`), from the repo root. */
const ROOT = join(process.cwd(), "..", "..", "..");
const PROPOSED = JSON.parse(
  readFileSync(join(ROOT, "upgrade", "research_loop", "evidence", "P21", "enrich-analysis", "enriched-analysis.proposed.fixture.json"), "utf8"),
) as EnrichedAnalysis;
const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;
const W3 = local<{ evidence: CurrentSourceEvidence }>("w3RealWfo.fixture.json");
const W3B = local<{ hub_evidence: EvidenceHub; progress: import("./progressClient").ProgressRead; requested_spec: import("./progressClient").RunRequestedSpec }>(
  "w3bRealWfo.fixture.json",
);
const IDENTITY = { state: "ready" as const, identity: { progress: W3B.progress, requested: W3B.requested_spec } };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function view(
  block: unknown | undefined,
  overrides: Partial<React.ComponentProps<typeof EvidenceFlow>> = {},
  entry = "/",
) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
  const evidence = (block === undefined ? { ...W3.evidence } : { ...W3.evidence, enriched_analysis: block }) as CurrentSourceEvidence;
  return render(
    <MemoryRouter initialEntries={[entry]}>
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
        passport={{ state: "ready", evidence }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        runIdentity={IDENTITY}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

/** The lazy chart chunk settles before a test ends (console guard). */
const settle = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector("[data-chart-table='distribution']")).toBeTruthy(), { timeout: 15_000 });
const settleOld = (container: HTMLElement) => waitFor(() => expect(container.querySelector("[data-metrics]")).toBeTruthy(), { timeout: 15_000 });

describe("enrich_analysis guard", () => {
  it("reads the proposed fixture as a block", () => {
    const read = readEnrichedAnalysis(clone(PROPOSED));
    expect(read.kind).toBe("block");
  });

  it("an absent field is absent, not refused", () => {
    expect(readEnrichedAnalysis(undefined)).toEqual({ kind: "absent" });
    expect(readEnrichedAnalysis(null)).toEqual({ kind: "absent" });
    expect(enrichedOf(W3.evidence)).toEqual({ kind: "absent" });
  });

  it.each(["LAST_60D", "ROLLING", "all_time", ""])("refuses basis %j", (basis) => {
    const read = readEnrichedAnalysis({ ...clone(PROPOSED), basis });
    expect(read).toMatchObject({ kind: "refused", reason: "UI_ENRICHED_ANALYSIS_BASIS_NOT_ALL_TIME" });
  });

  it("refuses a non-null rolling block, accepts rolling absent or null", () => {
    expect(readEnrichedAnalysis({ ...clone(PROPOSED), rolling: { window: 63, points: [] } })).toMatchObject({ kind: "refused", reason: "UI_ENRICHED_ANALYSIS_HAS_ROLLING" });
    const noRolling = clone(PROPOSED) as unknown as Record<string, unknown>;
    delete noRolling.rolling;
    expect(readEnrichedAnalysis(noRolling).kind).toBe("block");
  });

  it("refuses an unknown schema, a missing fact and a malformed series", () => {
    expect(readEnrichedAnalysis({ ...clone(PROPOSED), schema_version: "research.enriched-analysis.v2" })).toMatchObject({ reason: "UI_ENRICHED_ANALYSIS_SCHEMA_UNKNOWN" });
    const missing = clone(PROPOSED);
    delete (missing.facts.metrics as unknown as Record<string, unknown>).sortino;
    expect(readEnrichedAnalysis(missing)).toMatchObject({ reason: "UI_ENRICHED_ANALYSIS_SHAPE_INVALID", detail: "facts.metrics.sortino" });
    const bad = clone(PROPOSED);
    bad.curves.strategy_rebased_100[0]!.value = "not a number";
    expect(readEnrichedAnalysis(bad)).toMatchObject({ reason: "UI_ENRICHED_ANALYSIS_SHAPE_INVALID", detail: "curves.strategy_rebased_100" });
    expect(readEnrichedAnalysis("nope")).toMatchObject({ reason: "UI_ENRICHED_ANALYSIS_NOT_AN_OBJECT" });
  });

  it("a fact that says AVAILABLE with no value is refused (never a silent 0)", () => {
    const block = clone(PROPOSED);
    (block.facts.metrics.sharpe as { value: string | null }).value = null;
    expect(readEnrichedAnalysis(block)).toMatchObject({ reason: "UI_ENRICHED_ANALYSIS_SHAPE_INVALID", detail: "facts.metrics.sharpe" });
  });

  it("enrichedOf reads the response once and keeps the answer", () => {
    const evidence = { ...W3.evidence, enriched_analysis: clone(PROPOSED) } as CurrentSourceEvidence;
    expect(enrichedOf(evidence)).toBe(enrichedOf(evidence));
  });
});

describe("S04 · enrich_analysis — value path (proposed fixture)", () => {
  it("the hero Sharpe is the block's all-time Sharpe, labelled all time", async () => {
    const { container } = view(clone(PROPOSED));
    await settle(container);
    const sharpe = container.querySelector("[data-metric-value='OOS_SHARPE']") as HTMLElement;
    expect(sharpe.getAttribute("data-exact")).toBe(PROPOSED.facts.metrics.sharpe.value);
    expect(sharpe.textContent).toBe("4.34");
    expect(container.querySelector("[data-metric='OOS_SHARPE'] [data-metric-scope]")?.textContent).toContain("all time");
    const tile = retainedTiles({ ...W3.evidence, enriched_analysis: clone(PROPOSED) } as CurrentSourceEvidence).find((t) => t.key === "OOS_SHARPE");
    expect(tile?.value).toBe(PROPOSED.facts.metrics.sharpe.value);
  });

  it("Strategy vs benchmark — all time draws the block's rebased curves, with the chip", async () => {
    const { container } = view(clone(PROPOSED));
    await settle(container);
    await waitFor(() => expect(container.querySelector("[data-chart-table='strategy-benchmark']")).toBeTruthy(), { timeout: 15_000 });
    const figure = container.querySelector("[data-strategy-figure]") as HTMLElement;
    expect(figure.textContent).toContain("Strategy vs benchmark — all time");
    const rows = container.querySelectorAll("[data-chart-table='strategy-benchmark'] tbody tr");
    expect(rows).toHaveLength(PROPOSED.curves.strategy_rebased_100.length + PROPOSED.curves.benchmark_rebased_100.length);
    const chip = figure.querySelector("[data-enriched-chip]") as HTMLElement;
    expect(chip.textContent).toBe("enrich_analysis · all time");
    expect(chip.getAttribute("title")).toContain("EXTREMA_BUCKET_V2");
    const exact = (id: string) => figure.querySelector(`[data-behavior-tile='${id}'] [data-exact]`)?.getAttribute("data-exact");
    expect(exact("beta")).toBe(PROPOSED.facts.metrics.beta.value);
    expect(exact("benchmark")).toBe(PROPOSED.facts.metrics.benchmark_return_fraction.value);
  }, 20_000);

  it("draws an underwater strip from curves.drawdown_fraction under the figure", async () => {
    const { container } = view(clone(PROPOSED));
    await waitFor(() => expect(container.querySelector("[data-underwater-strip] [data-chart='underwater-strip']")).toBeTruthy(), { timeout: 15_000 });
    await settle(container);
    expect(container.querySelector("[data-strategy-figure] [data-underwater-strip]")).toBeTruthy();
  }, 20_000);

  it("the strip is absent (no empty frame) when the block serves no drawdown curve", async () => {
    const block = clone(PROPOSED);
    block.curves.drawdown_fraction = [];
    const { container } = view(block);
    await settle(container);
    expect(container.querySelector("[data-underwater-strip]")).toBeNull();
  });

  it("MONTHLY_RETURNS and RETURN_DISTRIBUTION come from the block, with the provenance chip, and ask no series endpoint", async () => {
    const ensureRetainedKind = vi.fn();
    const ensureSeries = vi.fn();
    const { container } = view(clone(PROPOSED), { ensureRetainedKind, ensureSeries });
    await settle(container);
    const monthly = container.querySelector("[data-series-panel='MONTHLY_RETURNS']") as HTMLElement;
    expect(monthly.getAttribute("data-series-state")).toBe("ready");
    expect(monthly.querySelector("[data-enriched-chip]")?.textContent).toBe("enrich_analysis · all time");
    expect(monthly.textContent).toContain("monthly returns — all time");
    const months = monthly.querySelectorAll("[data-month]");
    expect(months).toHaveLength(2);
    expect([...months].map((m) => m.getAttribute("data-month"))).toEqual(["2026-07", "2026-08"]);
    expect(months[0]!.getAttribute("data-exact")).toBe("0.013993856266");
    expect(months[0]!.querySelector("[data-month-value]")?.textContent).toBe("+1.40%");
    expect(months[0]!.getAttribute("data-month-partial")).toBeNull();

    const dist = container.querySelector("[data-series-panel='RETURN_DISTRIBUTION']") as HTMLElement;
    expect(dist.getAttribute("data-series-state")).toBe("ready");
    expect(dist.querySelector("[data-enriched-chip]")?.getAttribute("title")).toContain("FULL_RETURN_HISTOGRAM_V2");
    expect(dist.querySelectorAll("[data-chart-table='distribution'] tbody tr")).toHaveLength(PROPOSED.return_distribution.buckets.length);
    expect(dist.textContent).toContain("Return distribution — all time");
    expect(ensureRetainedKind).not.toHaveBeenCalled();
    expect(ensureSeries).not.toHaveBeenCalled();
  }, 20_000);

  it("a partial month is drawn hatched, with its observation count in the tooltip", async () => {
    const block = clone(PROPOSED);
    block.monthly_returns.values[0] = { ...block.monthly_returns.values[0]!, partial: true, observation_count: 312, expected_observation_count: 744 };
    const { container } = view(block);
    await settle(container);
    const [first, second] = [...container.querySelectorAll("[data-series-panel='MONTHLY_RETURNS'] [data-month]")] as HTMLElement[];
    expect(first!.getAttribute("data-month-partial")).toBe("true");
    expect(first!.getAttribute("title")).toContain("partial month · 312 of 744 observations");
    expect((first!.querySelector("[data-month-cell]") as HTMLElement).style.border).toContain("dashed");
    expect((first!.querySelector("[data-month-cell]") as HTMLElement).style.background).toContain("repeating-linear-gradient");
    expect(second!.getAttribute("data-month-partial")).toBeNull();
    expect(second!.getAttribute("title")).not.toContain("partial");
    expect((second!.querySelector("[data-month-cell]") as HTMLElement).style.border).toBe("");
  }, 20_000);

  it("Behavior reads the block's facts and carries the chip; no 'open' mark is invented", async () => {
    const { container } = view(clone(PROPOSED));
    await settle(container);
    const card = container.querySelector("[data-behavior-scope='all-time']") as HTMLElement;
    expect(card.textContent).toContain("enrich_analysis · all time");
    const cell = (label: string) => card.querySelector(`[data-behavior-tile='${label}'] [data-exact]`) as HTMLElement;
    expect(cell("sortino").getAttribute("data-exact")).toBe(PROPOSED.facts.metrics.sortino.value);
    expect(cell("turnover").getAttribute("data-exact")).toBe(PROPOSED.facts.behaviour.turnover_notional.value);
    expect(cell("drawdown duration").textContent).toBe("17.4 d");
    /* sharpe_decay is NOT_APPLICABLE in the block: the cell keeps its typed absence, never 0. */
    const decay = card.querySelector("[data-behavior-tile='sharpe decay'] [data-withheld]") as HTMLElement;
    expect(decay.getAttribute("data-withheld")).toBe("NOT_APPLICABLE");
    expect(decay.getAttribute("data-reason-code")).toBe("PORTAL_ANALYTICS_IS_OR_OOS_SHARPE_UNAVAILABLE");
  }, 20_000);

  it("Drawdown episodes: top rows with start, depth, duration, recovery; an open episode says open", async () => {
    const { container } = view(clone(PROPOSED));
    await settle(container);
    const card = container.querySelector("[data-drawdown-episodes='ready']") as HTMLElement;
    const rows = [...card.querySelectorAll("tbody tr")] as HTMLElement[];
    expect(rows).toHaveLength(8);
    /* the first is open (recovery_utc_ms: null) */
    expect(rows[0]!.getAttribute("data-episode-open")).toBe("true");
    expect(rows[0]!.textContent).toContain("open");
    expect(rows[0]!.textContent).toContain("2026-08-17");
    expect(rows[0]!.querySelector("[data-exact]")?.getAttribute("data-exact")).toBe("-0.004713280512");
    expect(rows[0]!.querySelector("[data-exact]")?.textContent).toBe("−0.47%");
    expect(rows[0]!.getAttribute("title")).toContain("recovery open at the end of the scope");
    expect(rows[0]!.getAttribute("title")).toContain(PROPOSED.scope.locator);
    expect(rows[0]!.getAttribute("aria-label")).toContain("trough");
    expect(rows[1]!.getAttribute("data-episode-open")).toBe("false");
    expect(rows[1]!.textContent).toContain("2026-08-04");
    expect(card.querySelector("[data-episodes-count]")?.textContent).toBe("8");
    /* typographic minus only */
    expect(card.textContent).not.toMatch(/(?<!\d)-\d/);
  }, 20_000);

  it("Drawdown episodes says top n / total when the server has more than it sent", async () => {
    const block = clone(PROPOSED);
    block.drawdown_episodes.total = 37;
    const { container } = view(block);
    await settle(container);
    expect(container.querySelector("[data-episodes-count]")?.textContent).toBe("top 8 / 37");
  }, 20_000);

  it("a block whose episodes are NOT_PUBLISHED shows one typed line, not an empty frame", async () => {
    const block = clone(PROPOSED);
    block.drawdown_episodes = { state: "NOT_PUBLISHED", reason_code: "AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED", origin: "PORTAL_DERIVED", total: 0, values: [] };
    const { container } = view(block);
    await settle(container);
    const line = container.querySelector("[data-drawdown-episodes='absent']") as HTMLElement;
    expect(line.getAttribute("data-reason-code")).toBe("AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED");
    expect(line.textContent).toContain("not published");
    expect(container.querySelector("[data-drawdown-episodes='ready']")).toBeNull();
    expect(line.querySelector("table")).toBeNull();
  }, 20_000);

  it("windows feed the switcher tooltips with the block's own reason codes", async () => {
    const { container } = view(clone(PROPOSED));
    await settle(container);
    const title = (segment: string) => container.querySelector(`[data-window-switcher] [data-segment='${segment}']`)?.getAttribute("title") ?? "";
    expect(title("IS")).toContain("QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT");
    expect(title("IS")).toContain("not published");
    expect(title("Holdout Live")).toContain("P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT");
    expect(title("Holdout Live")).toContain("not applicable");
    expect(title("OOS")).not.toContain("not published");
  }, 20_000);

  it("a window the block withholds is a typed absence with the block's code", async () => {
    window.history.replaceState(null, "", "/?window=holdout");
    const { container } = view(clone(PROPOSED), {}, "/?window=holdout");
    await waitFor(() => expect(container.querySelector("[data-window-absent='holdout']")).toBeTruthy());
    const absent = container.querySelector("[data-window-absent='holdout'] [data-withheld]") as HTMLElement;
    expect(absent.getAttribute("data-withheld")).toBe("NOT_APPLICABLE");
    expect(absent.getAttribute("data-reason-code")).toBe("P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT");
    await settle(container);
  }, 20_000);

  it("a monthly block that is not available falls back to the series endpoint (and its own absence)", async () => {
    const ensureRetainedKind = vi.fn();
    const block = clone(PROPOSED);
    block.monthly_returns = { state: "NOT_PUBLISHED", reason_code: "AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED", origin: "PORTAL_DERIVED", includes_partial_months: false, values: [] };
    const { container } = view(block, { ensureRetainedKind });
    await settle(container);
    const monthly = container.querySelector("[data-series-panel='MONTHLY_RETURNS']") as HTMLElement;
    expect(monthly.querySelector("[data-enriched-chip]")).toBeNull();
    expect(monthly.textContent).toContain("monthly returns — stitched OOS");
    expect(monthly.querySelector("[data-month]")).toBeNull();
    /* the distribution is still the block's */
    expect(container.querySelector("[data-series-panel='RETURN_DISTRIBUTION'] [data-enriched-chip]")).toBeTruthy();
  }, 20_000);
});

describe("S04 · enrich_analysis — absence and refusal", () => {
  it("old seal: no block draws no chip, no episodes card and no refusal line; today's panels keep their absence", async () => {
    const { container } = view(undefined);
    await settleOld(container);
    expect(container.querySelector("[data-enriched-chip]")).toBeNull();
    expect(container.querySelector("[data-drawdown-episodes]")).toBeNull();
    expect(container.querySelector("[data-underwater-strip]")).toBeNull();
    expect(container.querySelector("[data-enriched-refused]")).toBeNull();
    expect(container.querySelector("[data-strategy-figure]")).toBeNull();
    const monthly = container.querySelector("[data-series-panel='MONTHLY_RETURNS']") as HTMLElement;
    expect(monthly.textContent).toContain("monthly returns — stitched OOS");
    expect(monthly.getAttribute("data-series-state")).not.toBe("ready");
    expect(container.querySelector("[data-window-switcher] [data-segment='IS']")?.getAttribute("title")).toContain("the Evidence Hub publishes the OOS window only");
    expect(container.querySelector("[data-analytics-v2-absent]")).toBeTruthy();
  }, 20_000);

  it.each([
    ["basis LAST_60D", { basis: "LAST_60D" }, "UI_ENRICHED_ANALYSIS_BASIS_NOT_ALL_TIME"],
    ["a rolling block", { rolling: { window: 63, points: [] } }, "UI_ENRICHED_ANALYSIS_HAS_ROLLING"],
  ])("%s is refused: one line, nothing drawn from the block", async (_name, patch, marker) => {
    const { container } = view({ ...clone(PROPOSED), ...patch });
    await settleOld(container);
    const line = container.querySelector("[data-enriched-refused]") as HTMLElement;
    expect(line.getAttribute("data-enriched-refused")).toBe(marker);
    expect(line.textContent).toContain("refused");
    expect(container.querySelector("[data-enriched-chip]")).toBeNull();
    expect(container.querySelector("[data-drawdown-episodes]")).toBeNull();
    expect(container.querySelector("[data-strategy-figure]")).toBeNull();
    expect(container.querySelector("[data-underwater-strip]")).toBeNull();
    expect(container.querySelector("[data-series-panel='MONTHLY_RETURNS'] [data-month]")).toBeNull();
    /* the hero Sharpe is not the refused block's */
    expect(container.querySelector("[data-metric-value='OOS_SHARPE']")?.getAttribute("data-exact") ?? null).not.toBe(PROPOSED.facts.metrics.sharpe.value);
  }, 20_000);

  it("without a benchmark curve the figure keeps its typed line and the block's chip", async () => {
    const block = clone(PROPOSED);
    block.curves.benchmark_rebased_100 = [];
    block.facts.metrics.benchmark_return_fraction = {
      ...block.facts.metrics.benchmark_return_fraction,
      state: "NOT_PUBLISHED",
      reason_code: "P08_BENCHMARK_NOT_RETAINED",
      value: null,
    };
    const { container } = view(block);
    await settle(container);
    const line = container.querySelector("[data-benchmark-curve-absent] [data-withheld]") as HTMLElement;
    expect(line.getAttribute("data-reason-code")).toBe("P08_BENCHMARK_NOT_RETAINED");
  }, 20_000);
});
