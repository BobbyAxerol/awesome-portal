/**
 * Screen 04 — all-time monthly strip and daily histogram (group S04_F6).
 *
 * Value path: Codex's published fixture `research-all-time-distributions.valid.json` (the companion
 * `summary_analytics_v2.distributions`) and the series-endpoint shape that carries the same facts in
 * `source_sample.derivation`. Absence path: legacy series with none of the new fields, a NOT_APPLICABLE
 * companion with its reason code, a tail window, and string counts that are not numbers.
 * Browser acceptance uses a route mock of these same shapes (the preview has no companion yet).
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import {
  companionRead,
  derivationOf,
  derivedHeadline,
  derivationTitle,
  isDailyDistribution,
  monthCoverage,
  safeCount,
  tailDisclosure,
} from "./allTimeSeries";
import type { CurrentSourceEvidence, CurrentSourceEvidenceSeries, EvidenceHub, EvidenceSeries, RetainedAnalyticsV2 } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { distributionOption } from "./EvidenceCharts";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const published = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;

type Distributions = NonNullable<RetainedAnalyticsV2["distributions"]>;
const DIST = published<Distributions>("research-all-time-distributions.valid.json");
const V2 = published<RetainedAnalyticsV2>("research-retained-analytics-v2.fixed.valid.json");
const W3 = local<{ evidence: CurrentSourceEvidence }>("w3RealWfo.fixture.json");
const W3B = local<{
  hub_evidence: EvidenceHub;
  progress: import("./progressClient").ProgressRead;
  requested_spec: import("./progressClient").RunRequestedSpec;
  series_monthly: CurrentSourceEvidenceSeries;
  series_distribution: CurrentSourceEvidenceSeries;
}>("w3bRealWfo.fixture.json");
const IDENTITY = { state: "ready" as const, identity: { progress: W3B.progress, requested: W3B.requested_spec } };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Kinds = NonNullable<React.ComponentProps<typeof EvidenceFlow>["retainedKinds"]>;

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

const withCompanion = (distributions: unknown): React.ComponentProps<typeof EvidenceFlow>["passport"] => ({
  state: "ready",
  evidence: { ...W3.evidence, summary_analytics_v2: { ...clone(V2), distributions } } as CurrentSourceEvidence,
});
const settle = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector("[data-chart-table='distribution']")).toBeTruthy(), { timeout: 15_000 });

describe("allTimeSeries — the published companion (value path)", () => {
  it("reads the fixture's monthly block into a derived series", () => {
    const read = companionRead({ ...V2, distributions: DIST }, "MONTHLY_RETURNS", "R-X");
    expect(read?.kind).toBe("series");
    const series = (read as { series: EvidenceSeries }).series;
    expect(series.values).toHaveLength(DIST.monthly_returns.values.length);
    expect(series.run_id).toBe("R-X");
    expect(derivationOf(series)).toMatchObject({
      origin: "PORTAL_DERIVED",
      scope: "OOS",
      grain: "UTC_CALENDAR_MONTH",
      definition_id: DIST.monthly_definition,
      input_digest: DIST.input_digest,
      oos_observation_count: 4,
    });
    expect(derivedHeadline(series)).toBe("2 months");
    const title = derivationTitle(series) ?? "";
    expect(title).toContain(DIST.monthly_definition);
    expect(title).toContain("portal-derived · OOS");
    expect(title).toContain("OOS population 4 observations");
    expect(title).toContain("synthetic:sealed_OOS_fold_union");
  });

  it("reads the fixture's histogram as the DAILY one: 12 bins and days, never bars", () => {
    const series = (companionRead({ ...V2, distributions: DIST }, "RETURN_DISTRIBUTION", "R-X") as { series: EvidenceSeries }).series;
    expect(isDailyDistribution(series)).toBe(true);
    expect(derivedHeadline(series)).toBe("12 bins · 4 days");
    expect(derivedHeadline(series)).not.toMatch(/bar/i);
    expect(series.values).toHaveLength(12);
  });

  it("a partial month says partial, its observations, its basis and its base → close", () => {
    const [first, second] = DIST.monthly_returns.values;
    expect(monthCoverage(first!)).toBe(" · partial month · 2 observations · first OOS close · 2026-01-30 → 2026-01-31");
    expect(monthCoverage(second!)).toContain("previous month close");
    expect(monthCoverage({ ...second!, partial: false })).not.toContain("partial month");
    expect(monthCoverage({ ...second!, partial: false })).toContain("2 observations");
  });
});

describe("allTimeSeries — legacy and absent shapes", () => {
  it("a legacy point (no new field) draws no marker and claims nothing", () => {
    expect(monthCoverage({})).toBe("");
    expect(monthCoverage({ partial: undefined })).toBe("");
  });

  it("the enrich_analysis partial wording is unchanged", () => {
    expect(monthCoverage({ partial: true, observation_count: 312, expected_observation_count: 744, basis: "FIRST_OBSERVED" })).toBe(
      " · partial month · 312 of 744 observations",
    );
  });

  it("no companion, or a companion with no usable block, answers null (the series endpoint stays the source)", () => {
    expect(companionRead(undefined, "MONTHLY_RETURNS", "R")).toBeNull();
    expect(companionRead(V2, "MONTHLY_RETURNS", "R")).toBeNull();
    expect(companionRead({ ...V2, distributions: { ...DIST, monthly_returns: { ...DIST.monthly_returns, values: [] } } }, "MONTHLY_RETURNS", "R")).toBeNull();
    expect(companionRead({ ...V2, distributions: DIST }, "EQUITY_OOS" as never, "R")).toBeNull();
  });

  it("NOT_APPLICABLE keeps its state and the server's reason code", () => {
    const na = { ...DIST, return_distribution: { ...DIST.return_distribution, state: "NOT_APPLICABLE", reason_code: "ZERO_VARIANCE_DAILY_RETURNS", values: [], sampling: "NOT_APPLICABLE" } };
    expect(companionRead({ ...V2, distributions: na as Distributions }, "RETURN_DISTRIBUTION", "R")).toEqual({
      kind: "absent",
      state: "NOT_APPLICABLE",
      reason_code: "ZERO_VARIANCE_DAILY_RETURNS",
    });
  });

  it("counts are strings and are parsed safely, never NaN", () => {
    expect(safeCount("12")).toBe(12);
    expect(safeCount("0")).toBe(0);
    expect(safeCount("x")).toBeNull();
    expect(safeCount("")).toBeNull();
    expect(safeCount(undefined)).toBeNull();
    expect(safeCount("-3")).toBeNull();
    const buckets = clone(DIST.return_distribution.values);
    buckets[1]!.count = "not-a-number";
    const data = (distributionOption(buckets as never, true) as { series: { data: (number | null)[] }[] }).series[0]!.data;
    expect(data.some((value) => Number.isNaN(value))).toBe(false);
    expect(data[1]).toBeNull();
    expect(data[0]).toBe(1);
    expect(data[11]).toBe(2);
  });

  it("a legacy distribution has no derivation, keeps today's line and does not claim days", () => {
    const legacy = W3B.series_distribution as unknown as EvidenceSeries;
    expect(derivationOf(legacy)).toBeNull();
    expect(isDailyDistribution(legacy)).toBe(false);
    expect(derivedHeadline(legacy)).toBeNull();
  });
});

describe("allTimeSeries — transport tail", () => {
  const tail = (omitted: number, total: number | undefined, count = 32): EvidenceSeries =>
    ({
      kind: "MONTHLY_RETURNS",
      source_sample: {
        source_observation_count: 5000,
        emitted_point_count: count,
        sampling: "TAIL_WINDOW_V1",
        derivation: {
          origin: "PORTAL_DERIVED", scope: "OOS", input_digest: "a".repeat(64), source_locator: "loc",
          definition_id: "OOS_MONTH_CLOSE_OVER_FIRST_OOS_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1", grain: "UTC_CALENDAR_MONTH",
          oos_observation_count: 5000, omitted_transport_period_count: omitted, ...(total !== undefined ? { total_period_count: total } : {}),
        },
      },
      values: Array.from({ length: count }, (_, i) => ({ month_start_utc_ms: 1_700_000_000_000 + i, return_fraction: "0.01" })),
    }) as unknown as EvidenceSeries;

  it("says 'last 32 of N months' from the served totals", () => {
    expect(tailDisclosure(tail(16, 48))).toBe("last 32 of 48 months");
    expect(derivedHeadline(tail(16, 48))).toBe("last 32 of 48 months");
  });

  it("without a served total it names the omitted count and never a computed sum", () => {
    expect(tailDisclosure(tail(16, undefined))).toBe("last 32 months · 16 earlier");
  });

  it("a full series has no disclosure", () => {
    const full = tail(0, 32);
    (full.source_sample as { sampling: string }).sampling = "FULL";
    expect(tailDisclosure(full)).toBeNull();
    expect(derivedHeadline(full)).toBe("32 months");
  });
});

describe("S04 · F6 — panels (Codex's fixture through the screen)", () => {
  it("draws the monthly strip and the daily histogram from the companion, asking no series endpoint", async () => {
    const ensureRetainedKind = vi.fn();
    const { container } = view({ passport: withCompanion(DIST), ensureRetainedKind });
    await settle(container);
    const monthly = container.querySelector("[data-series-panel='MONTHLY_RETURNS']") as HTMLElement;
    expect(monthly.getAttribute("data-series-state")).toBe("ready");
    expect(monthly.textContent).toContain("monthly returns — all time");
    const months = monthly.querySelectorAll("[data-month]");
    expect([...months].map((m) => m.getAttribute("data-exact"))).toEqual(["0.1", "-0.01"]);
    expect(months[0]!.getAttribute("data-month-partial")).toBe("true");
    expect(months[0]!.getAttribute("title")).toContain("partial month · 2 observations · first OOS close · 2026-01-30 → 2026-01-31");
    expect((months[0]!.querySelector("[data-month-cell]") as HTMLElement).style.background).toContain("repeating-linear-gradient");
    expect(months[1]!.getAttribute("data-month-partial")).toBe("true");
    expect(months[1]!.getAttribute("title")).toContain("previous month close");
    const line = monthly.querySelector("[data-sampling]") as HTMLElement;
    expect(line.textContent).toBe("2 months");
    expect(line.getAttribute("title")).toContain(DIST.monthly_definition);
    expect(line.getAttribute("aria-label")).toContain("portal-derived");

    const dist = container.querySelector("[data-series-panel='RETURN_DISTRIBUTION']") as HTMLElement;
    expect(dist.getAttribute("data-series-state")).toBe("ready");
    expect(dist.textContent).toContain("Return distribution — all time");
    expect(dist.querySelector("[data-sampling]")?.textContent).toBe("12 bins · 4 days");
    expect(dist.querySelector("[data-sampling]")?.getAttribute("title")).toContain(DIST.distribution_definition);
    expect(dist.querySelector("[data-chart='distribution']")?.getAttribute("data-distribution-grain")).toBe("UTC_DAY");
    expect(dist.querySelector("[data-chart-table='distribution'] caption")?.textContent).toContain("Daily return distribution");
    expect(dist.querySelectorAll("[data-chart-table='distribution'] tbody tr")).toHaveLength(12);
    expect(dist.querySelector("[data-chart-table='distribution'] thead")?.textContent).toContain("days");
    expect(dist.textContent).not.toMatch(/\bbars?\b/i);
    expect(ensureRetainedKind).not.toHaveBeenCalledWith("MONTHLY_RETURNS");
    expect(ensureRetainedKind).not.toHaveBeenCalledWith("RETURN_DISTRIBUTION");
  }, 20_000);

  it("a NOT_APPLICABLE companion is the typed absence with the server's reason code and no request", async () => {
    const na = (block: Record<string, unknown>, reason: string) => ({ ...block, state: "NOT_APPLICABLE", reason_code: reason, values: [] });
    const ensureRetainedKind = vi.fn();
    const { container } = view({
      passport: withCompanion({
        ...DIST,
        monthly_returns: na(DIST.monthly_returns, "NO_COMPLETE_OOS_MONTH"),
        return_distribution: na(DIST.return_distribution, "ZERO_VARIANCE_DAILY_RETURNS"),
      }),
      ensureRetainedKind,
    });
    await waitFor(() => expect(container.querySelector("[data-series-panel='MONTHLY_RETURNS'] [data-absence-note]")).toBeTruthy());
    const monthly = container.querySelector("[data-series-panel='MONTHLY_RETURNS'] [data-absence-note]") as HTMLElement;
    expect(monthly.getAttribute("data-absence-note")).toBe("NOT_APPLICABLE");
    expect(monthly.getAttribute("data-reason-code")).toBe("NO_COMPLETE_OOS_MONTH");
    expect(monthly.textContent).toContain("not applicable");
    const dist = container.querySelector("[data-series-panel='RETURN_DISTRIBUTION'] [data-absence-note]") as HTMLElement;
    expect(dist.getAttribute("data-reason-code")).toBe("ZERO_VARIANCE_DAILY_RETURNS");
    expect(container.querySelector("[data-series-panel='RETURN_DISTRIBUTION'] [data-month], [data-series-panel='RETURN_DISTRIBUTION'] [data-chart]")).toBeNull();
    expect(ensureRetainedKind).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("NaN");
  });

  it("with no companion the series endpoint stays the source (still asked)", () => {
    const ensureRetainedKind = vi.fn();
    view({ passport: { state: "ready", evidence: { ...W3.evidence, summary_analytics_v2: clone(V2) } as CurrentSourceEvidence }, ensureRetainedKind });
    expect(ensureRetainedKind).toHaveBeenCalledWith("MONTHLY_RETURNS");
    expect(ensureRetainedKind).toHaveBeenCalledWith("RETURN_DISTRIBUTION");
  });

  it("a legacy retained series (real capture, no derivation) renders exactly as before, with no marker and no days", async () => {
    const retainedKinds = new Map([
      ["MONTHLY_RETURNS", { state: "ready" as const, series: W3B.series_monthly }],
      ["RETURN_DISTRIBUTION", { state: "ready" as const, series: W3B.series_distribution }],
    ]) as Kinds;
    const { container } = view({ passport: { state: "ready", evidence: W3.evidence }, retainedKinds });
    await settle(container);
    const monthly = container.querySelector("[data-series-panel='MONTHLY_RETURNS']") as HTMLElement;
    expect(monthly.textContent).toContain("monthly returns — stitched OOS");
    expect(monthly.querySelector("[data-month-partial]")).toBeNull();
    expect(monthly.querySelector("[data-month]")?.getAttribute("title")).not.toContain("observation");
    expect(monthly.querySelector("[data-sampling]")?.textContent).toContain("source observations");
    expect(monthly.querySelector("[data-sampling]")?.getAttribute("title")).toBeNull();
    const dist = container.querySelector("[data-series-panel='RETURN_DISTRIBUTION']") as HTMLElement;
    expect(dist.textContent).toContain("Return distribution — stitched OOS");
    expect(dist.querySelector("[data-distribution-grain]")).toBeNull();
    expect(dist.querySelector("[data-sampling]")?.textContent).toContain("source observations");
    expect(dist.textContent).not.toMatch(/\bbars?\b|\bdays\b/i);
  }, 20_000);

  it("a derived series from the endpoint carries its provenance and the tail disclosure in the header", async () => {
    const monthly = clone(W3B.series_monthly) as unknown as { source_sample: Record<string, unknown>; values: unknown[] };
    monthly.values = Array.from({ length: 32 }, (_, i) => ({ month_start_utc_ms: Date.UTC(2024, i, 1), return_fraction: i % 2 ? "-0.01" : "0.02" }));
    monthly.source_sample = {
      ...monthly.source_sample,
      emitted_point_count: 32,
      sampling: "TAIL_WINDOW_V1",
      derivation: {
        origin: "PORTAL_DERIVED", scope: "OOS", input_digest: "b".repeat(64), source_locator: "synthetic:sealed_OOS_fold_union",
        definition_id: DIST.monthly_definition, grain: "UTC_CALENDAR_MONTH", oos_observation_count: 9000,
        total_period_count: 40, omitted_transport_period_count: 8,
      },
    };
    const retainedKinds = new Map([["MONTHLY_RETURNS", { state: "ready" as const, series: monthly as unknown as CurrentSourceEvidenceSeries }]]) as Kinds;
    const { container } = view({ passport: { state: "ready", evidence: W3.evidence }, retainedKinds });
    const panel = container.querySelector("[data-series-panel='MONTHLY_RETURNS']") as HTMLElement;
    expect(panel.querySelector("[data-sampling]")?.textContent).toBe("last 32 of 40 months");
    expect(panel.querySelector("[data-sampling]")?.getAttribute("title")).toContain("8 earlier months not sent");
    expect(panel.textContent).toContain("monthly returns — all time");
    expect(panel.querySelectorAll("[data-month]")).toHaveLength(32);
    /* 32 cells wrap into rows instead of colliding their value labels at phone width. */
    expect(panel.querySelector("[data-chart='monthly']")?.className).toContain("flex-wrap");
    expect(panel.querySelector("[data-month-partial]")).toBeNull();
    await waitFor(() => expect(container.querySelector("[data-metrics]")).toBeTruthy(), { timeout: 15_000 });
  }, 20_000);
});
