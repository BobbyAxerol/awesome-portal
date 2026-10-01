/**
 * Screen 04 — D-AN-01 all-time analytics (`summary_analytics_v2`).
 *
 * Portal derives these descriptive statistics server-side over the whole OOS scope; this module
 * only lays them out. Every value is the server's exact decimal string, rounded for display by
 * unit and kept exact in `data-exact` and the title. Each cell names its origin
 * (`portal-derived` / `engine-direct`), its scope and its source locator in the tooltip and in its
 * accessible name. A fact the server did not publish keeps its cell with the typed absence; an old
 * seal with no v2 block at all is one line carrying the served code, never a grid of empty tiles.
 * Nothing here computes a number.
 */

import type { ReactNode } from "react";

import { Withheld } from "./EvidenceFlow";
import type {
  Availability,
  CurrentSourceEvidence,
  EvidenceHub,
  RetainedAnalyticsV2,
  RetainedAnalyticsV2Fact,
} from "./evidenceClient";
import { formatMetric, shortDigest } from "./researchFormat";

const PANEL = { borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" } as const;
const RATIO_2DP = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAYS_1DP = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** The code the server serves for a seal that has no v2 block (Current Source `source_absences.benchmark`). */
export const V2_NOT_COMPUTED = "PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL";

export type V2Unit = "ratio" | "signed" | "percent" | "count" | "days" | "duration";

/**
 * What the all-time cells read: the v2 block's fields, or the same fields drawn out of the
 * `enrich_analysis` block. `drawdown_recovered` is `null` when the source does not say, and then
 * no "open" mark is drawn (the episodes card carries each episode's own recovery).
 */
export type V2Core = Pick<RetainedAnalyticsV2, "input_digest" | "scope_locator" | "benchmark_locator" | "metrics" | "behaviour" | "strategy_curve" | "benchmark_curve"> & {
  drawdown_recovered: boolean | null;
};

/** The v2 block the screen reads: the retained lane's when it answered, else the Hub's. */
export function v2Of(retained: CurrentSourceEvidence | null, hub: EvidenceHub): RetainedAnalyticsV2 | null {
  return retained ? ((retained as Partial<CurrentSourceEvidence>).summary_analytics_v2 ?? null) : (hub.summary_analytics_v2 ?? null);
}

/**
 * Why a seal has no v2 block, as the server said it. The retained read carries it on
 * `source_absences.benchmark`; with no code served the state is shown without one.
 */
export function v2Absence(retained: CurrentSourceEvidence | null): Availability {
  const served = retained ? ((retained as Partial<CurrentSourceEvidence>).source_absences?.benchmark ?? null) : null;
  return {
    state: (served?.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_PUBLISHED") as Availability["state"],
    reason_code: served?.reason_code ?? null,
  };
}

export function originWord(fact: Pick<RetainedAnalyticsV2Fact, "origin">): string {
  return fact.origin.toLowerCase().replace(/_/g, "-");
}

/** The shown form of a served value, by unit. `null` when the string is not a number. */
export function factDisplay(value: string, unit: V2Unit): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  switch (unit) {
    case "ratio":
      return RATIO_2DP.format(parsed).replace(/^-/, "−");
    case "signed":
      return formatMetric(value, "fraction");
    case "percent":
      return formatMetric(value, "fraction")?.replace(/^\+/, "") ?? null;
    case "days":
      return `${DAYS_1DP.format(parsed)} d`;
    case "duration":
      return formatMetric(value, "seconds");
    default:
      return formatMetric(value, "count");
  }
}

function tone(value: string, unit: V2Unit): string {
  return unit === "signed" ? (value.trim().startsWith("-") ? "var(--bad)" : "var(--good)") : "var(--ink)";
}

/** One fact's provenance for a tooltip and an accessible name. */
export function factTitle(fact: RetainedAnalyticsV2Fact, label: string, scopeNote = "all time"): string {
  return [
    `${label} · ${fact.scope} ${scopeNote} · ${originWord(fact)}`,
    fact.value !== null ? `exact ${fact.value}` : null,
    fact.source_locator,
    `input ${shortDigest(fact.input_digest)}`,
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
}

/** A fact's value, or its typed absence, in a cell of the given size. */
export function FactValue({
  fact,
  unit,
  label,
  size = "text-[14px]",
  suffix,
}: {
  fact: RetainedAnalyticsV2Fact;
  unit: V2Unit;
  label: string;
  size?: string;
  suffix?: ReactNode;
}) {
  const shown = fact.state === "AVAILABLE" && fact.value !== null ? factDisplay(fact.value, unit) : null;
  if (fact.state !== "AVAILABLE" || fact.value === null || shown === null) {
    return <Withheld availability={{ state: fact.state === "AVAILABLE" ? "NOT_PUBLISHED" : fact.state, reason_code: fact.reason_code }} />;
  }
  return (
    <span
      className={`mono ${size} font-semibold`}
      style={{ color: tone(fact.value, unit), fontVariantNumeric: "tabular-nums" }}
      data-exact={fact.value}
      data-fact-origin={fact.origin}
      data-fact-scope={fact.scope}
      role="group"
      aria-label={`${label} ${shown}, ${originWord(fact)}, ${fact.scope} all time`}
      title={factTitle(fact, label)}
    >
      {shown}
      {suffix}
    </span>
  );
}

function Cell({ label, children, id }: { label: string; children: ReactNode; id: string }) {
  return (
    <span
      className="flex min-w-0 flex-col gap-px rounded-[6px] border px-2.5 py-1.5"
      style={{ borderColor: "var(--line-soft)" }}
      data-behavior-tile={id}
    >
      <span className="text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
        {label}
      </span>
      {children}
    </span>
  );
}

/** The old-seal line: what is missing, and the code the server gave for it. */
export function AnalyticsAbsentLine({ availability }: { availability: Availability }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-[11px]" data-analytics-v2-absent={availability.state} data-reason-code={availability.reason_code ?? undefined}>
      <Withheld availability={availability} what="all-time analytics" />
      {availability.reason_code !== null ? (
        <code className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-absence-code>
          {availability.reason_code}
        </code>
      ) : null}
    </p>
  );
}

/**
 * EChart 3 — "Strategy vs benchmark — all time". The chart arrives as a node (the lazy chart lives
 * with the screen); the cells under it are the all-time Beta / Corr / Sharpe / Sortino plus the
 * benchmark's own return.
 */
export function StrategyBenchmarkFigure({
  v2,
  chart,
  chip,
  underwater,
}: {
  v2: V2Core;
  chart: ReactNode;
  /** Provenance chip when the figure is drawn from the `enrich_analysis` block. */
  chip?: ReactNode;
  /** The compact underwater strip, drawn only from a served `drawdown_fraction` curve. */
  underwater?: ReactNode;
}) {
  const m = v2.metrics;
  const cells: [string, string, RetainedAnalyticsV2Fact, V2Unit][] = [
    ["beta", "Beta", m.beta, "ratio"],
    ["corr", "Corr", m.correlation, "ratio"],
    ["sharpe", "Sharpe", m.sharpe, "ratio"],
    ["sortino", "Sortino", m.sortino, "ratio"],
    ["benchmark", "Benchmark return", m.benchmark_return_fraction, "signed"],
  ];
  return (
    <figure className="m-0 min-w-0 flex-[1.4_1_520px] rounded-[8px] border p-4" data-strategy-figure style={PANEL}>
      <figcaption className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="mono text-[11px]" style={{ color: "var(--accent-2)" }} data-chart-no>
          EChart 3
        </span>
        <span className="text-[15px]" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
          Strategy vs benchmark — all time
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} title={`${v2.scope_locator}\nbenchmark ${v2.benchmark_locator}`}>
          rebased 100
        </span>
        {chip ?? null}
      </figcaption>
      {v2.strategy_curve.length > 0 ? (
        chart
      ) : (
        <div className="flex min-h-[230px] items-center rounded-[4px] border border-dashed px-3" style={{ borderColor: "var(--line)", background: "var(--paper-sunken)" }} data-strategy-curve-absent>
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} what="strategy curve" />
        </div>
      )}
      {v2.strategy_curve.length > 0 && v2.benchmark_curve.length === 0 ? (
        <p className="mt-1.5" data-benchmark-curve-absent>
          <Withheld
            availability={{ state: m.benchmark_return_fraction.state === "AVAILABLE" ? "NOT_PUBLISHED" : m.benchmark_return_fraction.state, reason_code: m.benchmark_return_fraction.reason_code }}
            what="benchmark curve"
          />
        </p>
      ) : null}
      {underwater ?? null}
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5" data-strategy-cells>
        {cells.map(([id, label, fact, unit]) => (
          <Cell key={id} id={id} label={label}>
            <FactValue fact={fact} unit={unit} label={label} />
          </Cell>
        ))}
      </div>
    </figure>
  );
}

/** The Behavior block, all time: bar-return statistics, exposure and position episodes. */
export function BehaviorV2({ v2, chip }: { v2: V2Core; chip?: string }) {
  const m = v2.metrics;
  const b = v2.behaviour;
  const rows: [string, string, RetainedAnalyticsV2Fact, V2Unit, ReactNode?][] = [
    ["sortino", "Sortino", m.sortino, "ratio"],
    ["cagr", "CAGR", m.cagr_fraction, "signed"],
    ["profit-factor", "Profit factor", m.profit_factor, "ratio"],
    ["volatility", "Volatility", m.volatility_fraction, "percent"],
    ["long-hit", "Long-bar hit", m.long_hit_rate_fraction, "percent"],
    ["short-hit", "Short-bar hit", m.short_hit_rate_fraction, "percent"],
    ["dd-duration", "Drawdown duration", m.max_drawdown_duration_days, "days",
      v2.drawdown_recovered !== false ? null : <span className="ml-1 text-[9px] font-normal" style={{ color: "var(--ink-faint)" }} title="Still below the prior peak at the end of the scope.">open</span>],
    ["skew", "Skew", m.skew, "ratio"],
    ["kurtosis", "Excess kurtosis", m.excess_kurtosis, "ratio"],
    ["decay", "Sharpe decay", m.sharpe_decay, "ratio"],
    ["turnover", "Turnover", b.turnover_notional, "count"],
  ];
  const episodes: [string, string, RetainedAnalyticsV2Fact, V2Unit][] = [
    ["win-rate", "Win rate", b.win_rate, "percent"],
    ["payoff", "Payoff", b.payoff_ratio, "ratio"],
    ["hold", "Avg hold", b.average_hold_seconds, "duration"],
    ["consec-loss", "Max consec. loss", b.max_consecutive_losses, "count"],
  ];
  const exposure: [string, string, RetainedAnalyticsV2Fact][] = [
    ["L", "long", b.exposure_long_fraction],
    ["S", "short", b.exposure_short_fraction],
    ["F", "flat", b.exposure_flat_fraction],
  ];
  const group = (label: string, title?: string) => (
    <span className="col-span-full mt-1 text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }} title={title}>
      {label}
    </span>
  );
  return (
    <section className="flex min-w-0 flex-[1_1_340px] flex-col gap-1.5 rounded-[8px] border p-3.5" data-gap="behavior-tiles" data-behavior-scope="all-time" style={PANEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-body)" }}>
          behavior
        </h3>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} title={`${v2.scope_locator}\ninput ${shortDigest(v2.input_digest)}`}>
          {chip ?? "all time · OOS"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" data-behavior-grid>
        {rows.map(([id, label, fact, unit, suffix]) => (
          <Cell key={id} id={label.toLowerCase()} label={label}>
            <FactValue fact={fact} unit={unit} label={label} suffix={suffix} />
          </Cell>
        ))}
        {group("exposure", "Share of OOS bars by side. Source: positions.")}
        <Cell id="exposure L/S/F" label="long / short / flat">
          <span className="mono flex flex-wrap gap-x-2 text-[13px]" data-exposure-lsf>
            {exposure.map(([tag, label, fact]) => (
              <span key={tag} className="inline-flex items-baseline gap-0.5" data-exposure={tag}>
                <span className="text-[9px]" style={{ color: "var(--ink-faint)" }}>{tag}</span>
                <FactValue fact={fact} unit="percent" label={`exposure ${label}`} size="text-[13px]" />
              </span>
            ))}
          </span>
        </Cell>
        {group("episodes — not audited trades", "Position episodes (entry to exit) derived from positions; QuantBT publishes no audited trade ledger for this route.")}
        {episodes.map(([id, label, fact, unit]) => (
          <Cell key={id} id={label.toLowerCase()} label={label}>
            <FactValue fact={fact} unit={unit} label={label} />
          </Cell>
        ))}
      </div>
    </section>
  );
}
