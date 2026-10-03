/**
 * B9 charts - binding Codex's `8bd781ed` optional chart fields on S04 / S09 (all-time only).
 *
 * TEST DATA: derived from the CANONICAL `research-enriched-analysis.healthy` fixture and the generated
 * `EnrichedAnalysis` type; the B9 fields are added by the typed builder below (the same construction as
 * `packages/contracts/test/research-b9-chart-contracts.spec.ts`), not hand-written wire JSON.
 * Absent fields: the existing UI is unchanged (asserted).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { distributionOption, strategyBenchmarkOption } from "./EvidenceCharts";
import { DrawdownEpisodes } from "./enrichedPanels";
import { AllTimeSupplement } from "./ReportAllTime";
import {
  bucketPosition,
  distributionStatistics,
  readEnrichedAnalysis,
  windowBands,
  type EnrichedAnalysis,
  type EnrichedFact,
} from "./enrichedAnalysis";
import { healthy } from "./enrichedAnalysis.fixtures";

afterEach(cleanup);

const fact = (base: EnrichedFact, value: string | null, state: EnrichedFact["state"] = "AVAILABLE", reason: string | null = null): EnrichedFact =>
  ({ ...base, state, reason_code: reason, value, origin: "PORTAL_DERIVED", source_locator: "scoped.daily_returns:ALL_TIME_UTC_DAY" }) as EnrichedFact;

/** Typed builder: the healthy block plus the B9 statistics (policy-bound) - all-gain-style negative loss included. */
function withStats(overrides: Partial<Record<"mean" | "median" | "var_95" | "cvar_95", EnrichedFact>> = {}): EnrichedAnalysis {
  const block = healthy();
  const base = block.facts.metrics.sharpe;
  Object.assign(block.return_distribution, {
    mean: fact(base, "0.001"),
    median: fact(base, "0.0005"),
    var_95: fact(base, "0.0123"),
    cvar_95: fact(base, "-0.0021"), // a signed loss fraction: an all-gain tail is negative
    statistics_policy: {
      quantile_method: "LINEAR_TYPE_7",
      probability: "0.95",
      risk_variable: "LOSS_FRACTION_NEGATIVE_RETURN",
      risk_sign: "SIGNED_LOSS_FRACTION",
      tail: "LOSS_GTE_VAR_INCLUSIVE",
      minimum_observations: 2,
    },
    ...overrides,
  });
  return block;
}

const HALF_OPEN = "START_INCLUSIVE_END_EXCLUSIVE" as const;
function withWindows(): EnrichedAnalysis {
  const block = healthy();
  const first = block.scope.first_at_utc_ms;
  const last = block.scope.last_at_utc_ms;
  const mid = Math.floor((first + last) / 2);
  block.windows.is = { ...block.windows.is, start_ms: first, end_ms: mid, source_locator: "P10.immutable_requested_spec.windows.is", bounds_semantics: HALF_OPEN };
  block.windows.oos = { ...block.windows.oos, start_ms: mid, end_ms: last + 1, source_locator: "P10.immutable_requested_spec.windows.oos", bounds_semantics: HALF_OPEN };
  return block;
}

const read = (block: EnrichedAnalysis) => readEnrichedAnalysis(JSON.parse(JSON.stringify(block)));

describe("B9 guard", () => {
  it("accepts the canonical legacy block and a statistics/window block; refuses partial sets", () => {
    expect(read(healthy()).kind).toBe("block");
    expect(read(withStats()).kind).toBe("block");
    expect(read(withWindows()).kind).toBe("block");
    const partial = withStats() as unknown as { return_distribution: Record<string, unknown> };
    delete partial.return_distribution.mean;
    expect(read(partial as unknown as EnrichedAnalysis)).toMatchObject({ kind: "refused", detail: "return_distribution.statistics" });
    const half = withWindows() as unknown as { windows: { oos: Record<string, unknown> } };
    delete half.windows.oos.end_ms;
    expect(read(half as unknown as EnrichedAnalysis)).toMatchObject({ kind: "refused", detail: "windows" });
  });
});

describe("B9 statistics markers (histogram)", () => {
  it("legacy block: no statistics, the existing absence line is kept", () => {
    expect(distributionStatistics(healthy())).toBeNull();
    const absent = healthy();
    const { container } = render(<AllTimeSupplement read={{ kind: "block", block: absent }} />);
    expect(container.querySelector("[data-distribution-stats]")).toBeNull();
    expect(container.querySelectorAll("[data-stat-mark]")).toHaveLength(0);
  });

  it("Facts are bound with the served policy; VaR/CVaR are labelled signed loss fractions and keep their sign", () => {
    const stats = distributionStatistics(withStats())!;
    const byKey = Object.fromEntries(stats.markers.map((m) => [m.key, m]));
    expect(byKey.var_95!.label).toBe("VaR 95% loss");
    expect(byKey.cvar_95!.label).toBe("CVaR 95% loss");
    expect(byKey.cvar_95!.shown).toBe("−0.21%");
    expect(byKey.var_95!.shown).toBe("1.23%");
    /* position on the return axis: return = -loss; the mean/median are returns as served */
    expect(byKey.var_95!.returnAt).toBeCloseTo(-0.0123, 12);
    expect(byKey.cvar_95!.returnAt).toBeCloseTo(0.0021, 12);
    expect(byKey.mean!.returnAt).toBeCloseTo(0.001, 12);
    expect(byKey.var_95!.title).toContain("signed loss fraction (loss = −return)");
    expect(stats.policyTitle).toContain("LINEAR_TYPE_7");
    expect(stats.policyTitle).toContain("SIGNED_LOSS_FRACTION");
    expect(stats.policyTitle).toContain("all-gain sample can be negative");
    expect(stats.policyTitle).toContain("LOSS_GTE_VAR_INCLUSIVE");
  });

  it("a Fact that is not AVAILABLE is typed absence with the served reason, never a marker or a zero", () => {
    const block = withStats({ var_95: fact(healthy().facts.metrics.sharpe, null, "NOT_PUBLISHED", "RETAINED_TOO_FEW_OBSERVATIONS") });
    const stats = distributionStatistics(block)!;
    const v = stats.markers.find((m) => m.key === "var_95")!;
    expect(v.shown).toBeNull();
    expect(v.returnAt).toBeNull();
    const { container } = render(<AllTimeSupplement read={{ kind: "block", block }} />);
    const cell = container.querySelector("[data-stat='var_95']") as HTMLElement;
    expect(cell.textContent).toContain("not published · RETAINED_TOO_FEW_OBSERVATIONS");
    expect(container.querySelectorAll("[data-stat-mark]")).toHaveLength(3);
  });

  it("S09 draws a marker per drawable Fact and a text line with the served policy in its title", () => {
    const { container } = render(<AllTimeSupplement read={{ kind: "block", block: withStats() }} />);
    expect(container.querySelectorAll("[data-stat-mark]")).toHaveLength(4);
    const line = container.querySelector("[data-distribution-stats='PUBLISHED']") as HTMLElement;
    expect(line.getAttribute("title")).toContain("LINEAR_TYPE_7");
    expect(line.textContent).toContain("VaR 95% loss 1.23%");
    expect(line.textContent).toContain("CVaR 95% loss −0.21%");
    expect(line.textContent).not.toMatch(/(?<![\d\w])-\d/);
  });

  it("S04 histogram option carries one markLine per drawable statistic, placed by the served bucket edges", () => {
    const block = withStats();
    const buckets = block.return_distribution.buckets.map((b) => ({ ...b, count: String(b.count) }));
    const plain = distributionOption(buckets as never, true) as { series: { markLine?: { data: unknown[] } }[] };
    const marked = distributionOption(buckets as never, true, { markers: distributionStatistics(block)!.markers }) as { series: { markLine?: { data: { name?: string; xAxis: number }[] } }[] };
    const extra = (marked.series[0]!.markLine!.data.length) - (plain.series[0]!.markLine?.data.length ?? 0);
    expect(extra).toBe(4);
    const names = marked.series[0]!.markLine!.data.map((d) => d.name).filter(Boolean);
    expect(names).toEqual(["mean", "median", "VaR 95% loss", "CVaR 95% loss"]);
  });

  it("bucketPosition: layout only, null outside the buckets", () => {
    const b = healthy().return_distribution.buckets;
    expect(bucketPosition(b, Number(b[0]!.lower_inclusive) - 1)).toBeNull();
    expect(bucketPosition(b, Number(b[0]!.lower_inclusive))).toBe(0);
  });
});

describe("B9 drawdown label and typed regime absence", () => {
  const labelled = (): EnrichedAnalysis => {
    const block = healthy();
    block.drawdown_episodes.values = block.drawdown_episodes.values.map((e, i) => ({
      ...e,
      label: `episode ${i + 1} descriptive`,
      regime: {
        state: "NOT_PUBLISHED" as const,
        reason_code: "SOURCE_DID_NOT_PUBLISH_MARKET_REGIME" as const,
        value: null,
        source_locator: "scoped.drawdown_episodes[].regime",
        input_digest: block.input_digest,
      },
    }));
    return block;
  };

  it("S04 card shows the served label and the served regime reason once; invents no regime", () => {
    const { container } = render(<DrawdownEpisodes block={labelled()} />);
    expect(container.querySelectorAll("[data-episode-label]").length).toBeGreaterThan(0);
    const regime = container.querySelector("[data-episode-regime]") as HTMLElement;
    expect(regime.getAttribute("data-reason-code")).toBe("SOURCE_DID_NOT_PUBLISH_MARKET_REGIME");
    expect(regime.textContent).toContain("not published");
  });

  it("S09 table shows the same; legacy episodes show neither", () => {
    const withIt = render(<AllTimeSupplement read={{ kind: "block", block: labelled() }} />);
    expect(withIt.container.querySelector("[data-episode-regime]")?.getAttribute("data-reason-code")).toBe("SOURCE_DID_NOT_PUBLISH_MARKET_REGIME");
    expect(withIt.container.querySelector("[data-episode-label]")).not.toBeNull();
    cleanup();
    const legacy = render(<AllTimeSupplement read={{ kind: "block", block: healthy() }} />);
    expect(legacy.container.querySelector("[data-episode-regime]")).toBeNull();
    expect(legacy.container.querySelector("[data-episode-label]")).toBeNull();
  });
});

describe("B9 window bands (half-open, located)", () => {
  it("legacy windows draw no band", () => {
    expect(windowBands(healthy().windows)).toEqual([]);
    const { container } = render(<AllTimeSupplement read={{ kind: "block", block: healthy() }} />);
    expect(container.querySelector("[data-window]")).toBeNull();
    expect(container.querySelector("[data-curve-windows]")).toBeNull();
  });

  it("bands carry half-open bounds, the source locator, and say a non-AVAILABLE window has no payload", () => {
    const block = withWindows();
    block.windows.is.state = "NOT_PUBLISHED";
    block.windows.is.reason_code = "RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD";
    const bands = windowBands(block.windows);
    expect(bands.map((b) => b.key)).toEqual(["is", "oos"]);
    expect(bands[0]!.title).toContain("start inclusive, end exclusive");
    expect(bands[0]!.title).toContain("P10.immutable_requested_spec.windows.is");
    expect(bands[0]!.title).toContain("no IS account payload is claimed");
    expect(bands[1]!.title).not.toContain("payload is claimed");
  });

  it("NOT_APPLICABLE windows and reversed bounds are not drawn", () => {
    const block = withWindows();
    block.windows.is.state = "NOT_APPLICABLE";
    expect(windowBands(block.windows).map((b) => b.key)).toEqual(["oos"]);
    block.windows.oos.end_ms = block.windows.oos.start_ms;
    expect(windowBands(block.windows)).toEqual([]);
  });

  it("S09 curve draws a role-token band per window; S04 option adds markArea entries", () => {
    const block = withWindows();
    const { container } = render(<AllTimeSupplement read={{ kind: "block", block }} />);
    const rects = container.querySelectorAll("rect.rr-at-win");
    expect(rects.length).toBe(2);
    expect(Array.from(rects).map((r) => r.getAttribute("data-window"))).toEqual(["is", "oos"]);
    /* W4: "(end exclusive)" is no printed text; the windows legend carries the window titles. */
    expect(container.querySelector("[data-curve-windows]")?.textContent).not.toContain("end exclusive");

    const strategy = block.curves.strategy_rebased_100;
    const option = strategyBenchmarkOption(strategy, block.curves.benchmark_rebased_100, { bands: windowBands(block.windows) }) as { series: { markArea?: { data: unknown[] } }[] };
    expect(option.series[0]!.markArea!.data).toHaveLength(2);
    const plain = strategyBenchmarkOption(strategy, block.curves.benchmark_rebased_100) as { series: { markArea?: unknown }[] };
    expect(plain.series[0]!.markArea).toBeUndefined();
  });
});
