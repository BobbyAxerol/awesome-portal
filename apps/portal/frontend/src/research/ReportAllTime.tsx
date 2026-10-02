/**
 * Screen 09 — the all-time supplement (`enriched_analysis`, top level of the Report response).
 *
 * The frozen core above it is the sealed report and is never touched. This block is a clearly labelled
 * supplement drawn from Codex's `EnrichedAnalysis`: one curve, the monthly strip, six key facts and the
 * deepest drawdown episodes. Everything printed is the server's: exact decimals stay in `title` and
 * `data-exact`, origin / locator / digest are in the tooltip and the accessible name. A report sealed
 * before the enrichment has no block; that is one typed line, never an empty frame. Nothing is computed.
 */

import type { ReactNode } from "react";

import type { EnrichedAnalysis, EnrichedEpisode, EnrichedFact, EnrichedRead } from "./enrichedAnalysis";
import { ENRICHED_CHIP, enrichedBlock } from "./enrichedAnalysis";
import { enrichedAbsenceTitle } from "./enrichedAvailability";
import { formatMetric, shortDigest } from "./researchFormat";
import { daysAndHours, monthWords, roundAxis } from "./reportText";

const DAY = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const UTC = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const word = (value: string) => value.toLowerCase().replace(/_/g, "-");

export const ALL_TIME_CSS = `
.rr-at { display: flex; flex-direction: column; gap: 8px; }
.rr-at-chips { display: inline-flex; gap: 6px; align-items: baseline; font-family: var(--font-mono); font-size: 9px; letter-spacing: 0; text-transform: none; font-weight: 400; color: var(--ink-faint); }
.rr-at-chip { border: 1px solid var(--line-soft); border-radius: 3px; padding: 0 5px; }
.rr-at-sampled { color: var(--accent-2); }
.rr-at-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 6px 14px; margin: 0; }
.rr-at-facts > div { display: flex; flex-direction: column; min-width: 0; }
.rr-at-facts dt { font-size: 8.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-faint); }
.rr-at-facts dd { margin: 0; font-family: var(--font-mono); font-size: 11px; font-variant-numeric: tabular-nums; }
.rr-at-curve { display: block; width: 100%; height: 120px; }
.rr-at-axis { display: flex; justify-content: space-between; gap: 8px; font-family: var(--font-mono); font-size: 8.5px; color: var(--ink-faint); }
.rr-at-months { display: flex; flex-wrap: wrap; gap: 8px 4px; }
.rr-at-month { display: flex; flex-direction: column; gap: 2px; min-width: 40px; max-width: 58px; flex: 1 1 40px; text-align: center; font-family: var(--font-mono); font-size: 8.5px; }
.rr-at-cell { display: block; height: 22px; border-radius: 3px; }
.rr-at-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 10px; font-variant-numeric: tabular-nums; }
.rr-at-table th { font-size: 8.5px; font-weight: 400; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-faint); text-align: right; }
.rr-at-table th:first-child, .rr-at-table td:first-child { text-align: left; }
.rr-at-table td { text-align: right; padding: 1px 0; }
.rr-at-sub { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; margin: 0; font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); }
@media print { .rr-at { break-inside: avoid; } }
`;

/* ------------------------------------------------------------- the one-line states */

function AbsentLine({ state, reason, what, title }: { state: string; reason: string | null; what: string; title?: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-absent={what} data-absent-state={state} title={title} aria-label={title !== undefined ? `${what} not published, server reason ${reason}` : undefined}>
      <span className="rr-absent">{what !== "" ? `${what} — ` : ""}not published</span>
      {reason !== null ? (
        <span className="rr-reason" data-reason-code>
          {reason}
        </span>
      ) : null}
    </span>
  );
}

const REFUSAL_WORDS: Record<string, string> = {
  UI_ENRICHED_ANALYSIS_NOT_AN_OBJECT: "not a block",
  UI_ENRICHED_ANALYSIS_SCHEMA_UNKNOWN: "unknown schema",
  UI_ENRICHED_ANALYSIS_BASIS_NOT_ALL_TIME: "basis is not all time",
  UI_ENRICHED_ANALYSIS_HAS_ROLLING: "carries a rolling block",
  UI_ENRICHED_ANALYSIS_SHAPE_INVALID: "shape invalid",
};

/* ------------------------------------------------------------------------- facts */

function FactCell({ label, fact, unit, heading }: { label: string; fact: EnrichedFact; unit: "ratio" | "fraction" | "days"; heading?: string }) {
  const shown =
    fact.state === "AVAILABLE" && fact.value !== null
      ? unit === "days"
        ? (daysAndHours(Number(fact.value) * 86400) ?? `${formatMetric(fact.value, "count")} d`)
        : formatMetric(fact.value, unit)
      : null;
  const title = [
    `${label} · ${fact.scope} all time · ${word(fact.origin)}`,
    fact.value !== null ? `exact ${fact.value}` : null,
    fact.source_locator,
    `input ${shortDigest(fact.input_digest)}`,
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
  return (
    <div data-all-time-fact={label} data-fact-state={fact.state}>
      <dt>{heading ?? label}</dt>
      <dd title={title} aria-label={`${label} ${shown ?? "not published"}, ${word(fact.origin)}`} data-exact={fact.value ?? undefined}>
        {shown !== null ? shown : <AbsentLine state={fact.state} reason={fact.reason_code} what="" />}
      </dd>
    </div>
  );
}

function SummaryCell({ label, value, block, unit }: { label: string; value: string | null; block: EnrichedAnalysis; unit: "fraction" }) {
  const summary = block.library_summary;
  const shown = summary.state === "AVAILABLE" && value !== null ? formatMetric(value, unit) : null;
  const title = [`${label} · OOS all time · portal-derived`, value !== null ? `exact ${value}` : null, block.scope.locator, `input ${shortDigest(summary.input_digest)}`]
    .filter((part): part is string => part !== null)
    .join("\n");
  return (
    <div data-all-time-fact={label} data-fact-state={shown !== null ? "AVAILABLE" : "NOT_PUBLISHED"}>
      <dt>{label}</dt>
      <dd title={title} aria-label={`${label} ${shown ?? "not published"}, portal-derived`} data-exact={value ?? undefined}>
        {shown !== null ? shown : <AbsentLine state={summary.state} reason={summary.reason_code} what="" />}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------------- curve */

const W = 1000;
const H = 200;

function path(points: readonly { at_utc_ms: number; value: string }[], x0: number, x1: number, y0: number, y1: number): string | null {
  const ys = points.map((point) => Number(point.value));
  if (points.length < 2 || ys.some((y) => !Number.isFinite(y))) return null;
  return points
    .map((point, index) => {
      const x = x1 === x0 ? W / 2 : ((point.at_utc_ms - x0) / (x1 - x0)) * W;
      const y = y1 === y0 ? H / 2 : 6 + (1 - (ys[index] - y0) / (y1 - y0)) * (H - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** The drawn range of a curve, rounded for the axis; the exact strings ride the title. */
function rangeOf(points: readonly { value: string }[]): { low: string; high: string; lowText: string; highText: string } | null {
  const ys = points.map((point) => Number(point.value));
  if (ys.length === 0 || ys.some((y) => !Number.isFinite(y))) return null;
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const lowText = points.find((point) => Number(point.value) === lo)?.value ?? "";
  const highText = points.find((point) => Number(point.value) === hi)?.value ?? "";
  return { low: roundAxis(lowText), high: roundAxis(highText), lowText, highText };
}

/**
 * QA S09 (UX-10): the strategy and the market benchmark do not share one y-scale. At +1.7% against +34% a shared
 * scale drew the strategy flat. Each curve has its own panel and its own labelled range, on one time axis; the
 * benchmark panel says "own scale", so no reader compares the two slopes by eye.
 */
function Curve({ block }: { block: EnrichedAnalysis }) {
  const strategy = block.curves.strategy_rebased_100;
  const benchmark = block.curves.benchmark_rebased_100;
  if (strategy.length < 2) {
    return <AbsentLine state="NOT_PUBLISHED" reason={null} what="strategy curve" />;
  }
  const xs = [...strategy, ...benchmark].map((point) => point.at_utc_ms);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const rangeS = rangeOf(strategy);
  const rangeB = benchmark.length > 1 ? rangeOf(benchmark) : null;
  const lineS = rangeS ? path(strategy, x0, x1, Number(rangeS.lowText), Number(rangeS.highText)) : null;
  const lineB = rangeB ? path(benchmark, x0, x1, Number(rangeB.lowText), Number(rangeB.highText)) : null;
  if (lineS === null || rangeS === null) return <AbsentLine state="NOT_PUBLISHED" reason={null} what="strategy curve" />;
  const sampling = block.curves.sampling;
  const label = `strategy${lineB !== null ? " and market benchmark on their own scales" : ""}, rebased to 100, all time, ${sampling.emitted_point_count} of ${sampling.source_observation_count} points`;
  return (
    <div data-all-time-curve data-has-benchmark={lineB !== null ? "true" : "false"}>
      <p className="rr-at-sub" data-curve-range="strategy" title={`range of the drawn points: ${rangeS.lowText} to ${rangeS.highText}`}>
        <span style={{ color: "var(--role-oos)" }}>strategy · rebased 100</span>
        <span>
          {rangeS.low} – {rangeS.high}
        </span>
      </p>
      <svg className="rr-at-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <title>{`${label}\n${block.scope.locator}`}</title>
        <polyline points={lineS} fill="none" stroke="var(--role-oos)" strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {lineB !== null && rangeB !== null ? (
        <>
          <p className="rr-at-sub" data-curve-range="benchmark" title={`range of the drawn points: ${rangeB.lowText} to ${rangeB.highText}`}>
            <span>market benchmark (portal) · own scale</span>
            <span>
              {rangeB.low} – {rangeB.high}
            </span>
          </p>
          <svg className="rr-at-curve" style={{ height: 56 }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" data-benchmark-curve>
            <polyline points={lineB} fill="none" stroke="var(--ink-faint)" strokeWidth={1.2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          </svg>
        </>
      ) : null}
      <div className="rr-at-axis">
        <span>{DAY(x0)}</span>
        <span>{DAY(x1)}</span>
      </div>
      <p className="rr-at-sub" style={{ marginTop: 2 }}>
        <span data-curve-legend>
          {benchmark.length === 0 ? "market benchmark not published" : lineB !== null ? "market benchmark dashed, own scale" : ""}
        </span>
        <span data-curve-sampling title={`${sampling.method} · extrema kept`}>
          {sampling.emitted_point_count} of {sampling.source_observation_count} points
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ distribution */

/**
 * QA S09 (UX-11 / inventory 42): the daily-return histogram the API already serves. Bars are the served counts,
 * scaled to the tallest bar (layout only); each bar's exact edges and count ride its title and the table below.
 */
function Distribution({ block }: { block: EnrichedAnalysis }) {
  const head = block.return_distribution;
  if (head.state !== "AVAILABLE" || head.buckets.length === 0) {
    return <AbsentLine state={head.state} reason={head.reason_code} what="return distribution" />;
  }
  const tallest = Math.max(...head.buckets.map((bucket) => bucket.count), 1);
  const first = head.buckets[0]!;
  const last = head.buckets[head.buckets.length - 1]!;
  const edge = (value: string) => formatMetric(value, "fraction") ?? value;
  const width = 100 / head.buckets.length;
  return (
    <div data-all-time-distribution data-bucket-count={head.buckets.length}>
      <svg className="rr-at-curve" style={{ height: 80 }} viewBox="0 0 100 60" preserveAspectRatio="none" role="img" aria-label={`daily return distribution, ${head.buckets.length} buckets, ${head.observation_count} days`}>
        {head.buckets.map((bucket, index) => {
          const height = (bucket.count / tallest) * 56;
          const zeroBucket = Number(bucket.lower_inclusive) < 0 && Number(bucket.upper) >= 0;
          return (
            <rect
              key={index}
              data-bucket={index}
              data-count={bucket.count}
              data-lower={bucket.lower_inclusive}
              data-upper={bucket.upper}
              x={index * width + 0.4}
              y={58 - height}
              width={width - 0.8}
              height={height}
              fill={zeroBucket ? "var(--ink-soft)" : "var(--role-oos)"}
              opacity={0.75}
            >
              <title>{`${edge(bucket.lower_inclusive)} to ${edge(bucket.upper)} · ${bucket.count} ${bucket.count === 1 ? "day" : "days"}`}</title>
            </rect>
          );
        })}
        <line x1={0} x2={100} y1={58.5} y2={58.5} stroke="var(--line)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="rr-at-sub" style={{ marginTop: 2 }}>
        <span title={`${first.lower_inclusive} to ${last.upper}`}>
          {edge(first.lower_inclusive)} to {edge(last.upper)}
        </span>
        <span data-distribution-count title={`tallest bar ${tallest} days`}>
          {formatMetric(head.observation_count, "count")} days
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ months */

function Months({ block }: { block: EnrichedAnalysis }) {
  const head = block.monthly_returns;
  if (head.state !== "AVAILABLE" || head.values.length === 0) {
    return <AbsentLine state={head.state} reason={head.reason_code} what="monthly returns" />;
  }
  return (
    <div data-all-time-months>
      <div className="rr-at-months">
        {head.values.map((row) => {
          const negative = row.return_fraction.trim().startsWith("-");
          const colour = negative ? "var(--bad)" : "var(--good)";
          const month = new Date(row.month_start_utc_ms).toISOString().slice(0, 7);
          const shown = formatMetric(row.return_fraction, "fraction") ?? row.return_fraction;
          const magnitude = Math.min(0.85, 0.15 + Math.abs(Number(row.return_fraction)) * 9);
          const title = [
            `${month} · ${shown} · exact ${row.return_fraction}`,
            row.partial ? `partial month · ${row.observation_count} of ${row.expected_observation_count} observations` : `${row.observation_count} observations`,
            `${word(row.basis)} · ${UTC(row.base_at_utc_ms)} → ${UTC(row.close_at_utc_ms)}`,
            block.scope.locator,
          ].join("\n");
          return (
            <span
              key={row.month_start_utc_ms}
              className="rr-at-month"
              data-month={month}
              data-exact={row.return_fraction}
              data-month-partial={row.partial ? "true" : undefined}
              title={title}
              aria-label={title.replace(/\n/g, ", ")}
            >
              <span
                className="rr-at-cell"
                style={
                  row.partial
                    ? { border: `1.5px dashed ${colour}`, background: `repeating-linear-gradient(135deg, ${colour} 0 2px, transparent 2px 5px)`, opacity: Math.max(0.6, magnitude) }
                    : { background: colour, opacity: magnitude }
                }
              />
              <span style={{ color: colour }}>{shown}</span>
              <span style={{ color: "var(--ink-faint)" }}>{monthWords(row.month_start_utc_ms)}</span>
            </span>
          );
        })}
      </div>
      <p className="rr-at-sub" style={{ marginTop: 4 }}>
        <span>hatched = partial month</span>
        {head.sampling === "TAIL_WINDOW_V1" ? (
          <span data-months-window title={`${head.omitted_transport_period_count} earlier months were not sent`}>
            last {head.values.length} of {head.total_period_count} months
          </span>
        ) : null}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------- episodes */

function Episodes({ block }: { block: EnrichedAnalysis }) {
  const head = block.drawdown_episodes;
  if (head.state !== "AVAILABLE" || head.values.length === 0) {
    return <AbsentLine state={head.state} reason={head.reason_code} what="drawdown episodes" />;
  }
  const shown = head.values.length;
  return (
    <div data-all-time-episodes>
      <p className="rr-at-sub" style={{ marginBottom: 2 }}>
        <span data-episodes-count>
          {shown < head.total ? `top ${shown} / ${formatMetric(head.total, "count")}` : formatMetric(head.total, "count")}
        </span>
        <span
          data-open-episode={head.open_episode_present ? "true" : "false"}
          data-longest-open={head.longest_open ? "true" : "false"}
          style={head.open_episode_present ? { color: "var(--accent-2)" } : undefined}
          title={head.open_episode_present ? "An episode is still below its prior peak at the end of the scope." : "Every episode recovered by the end of the scope."}
        >
          {head.open_episode_present ? (head.longest_open ? "open · longest" : "open") : "all recovered"}
        </span>
      </p>
      <table className="rr-at-table">
        <thead>
          <tr>
            <th scope="col">start</th>
            <th scope="col">depth</th>
            <th scope="col">duration</th>
            <th scope="col">recovered</th>
          </tr>
        </thead>
        <tbody>
          {head.values.map((episode: EnrichedEpisode, index) => {
            const open = episode.recovery_utc_ms === null;
            const title = [
              `episode ${index + 1} · ${word(head.origin)} · all time`,
              `start ${UTC(episode.start_utc_ms)}`,
              `trough ${UTC(episode.trough_utc_ms)}`,
              open ? "recovery open at the end of the scope" : `recovery ${UTC(episode.recovery_utc_ms as number)}`,
              `depth exact ${episode.depth_fraction}`,
              block.scope.locator,
            ].join("\n");
            return (
              <tr key={`${episode.start_utc_ms}-${index}`} data-episode={index + 1} data-episode-open={open ? "true" : "false"} title={title} aria-label={title.replace(/\n/g, ", ")}>
                <td>{DAY(episode.start_utc_ms)}</td>
                <td style={{ color: "var(--bad)" }} data-exact={episode.depth_fraction}>
                  {formatMetric(episode.depth_fraction, "fraction") ?? episode.depth_fraction}
                </td>
                <td title={`${episode.duration_seconds} s`} data-exact={episode.duration_seconds}>
                  {daysAndHours(episode.duration_seconds) ?? `${episode.duration_seconds} s`}
                </td>
                <td style={{ color: open ? "var(--accent-2)" : undefined }}>{open ? "open" : DAY(episode.recovery_utc_ms as number)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- block */

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="rr-t2" style={{ margin: 0 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const TITLE = "All-time analytics — supplemental";

export function AllTimeSupplement({ read, absentCode = null }: { read: EnrichedRead; absentCode?: string | null }) {
  const block = enrichedBlock(read);
  const chipTitle =
    block === null
      ? undefined
      : [
          `${ENRICHED_CHIP} · ${block.scope.window} · ${formatMetric(block.scope.observation_count, "count")} observations · ${formatMetric(block.scope.fold_count, "count")} folds`,
          "supplemental · not part of the frozen core",
          block.scope.locator,
          `input ${shortDigest(block.input_digest)}`,
          ...block.source_tables.map((table) => `${table.name} · ${formatMetric(table.row_count, "count")} rows · ${shortDigest(table.digest)}`),
        ].join("\n");
  const sampled = block !== null && block.scope.coverage === "SAMPLED_RETAINED_EQUITY";
  return (
    <section className="rr-block rr-keep" data-panel="all-time" data-all-time={block !== null ? "ready" : read.kind} aria-label={TITLE}>
      <h2 className="t flex flex-wrap items-baseline justify-between gap-2">
        <span>{TITLE}</span>
        {block !== null ? (
          <span className="rr-at-chips">
            {sampled ? (
              <span
                className="rr-at-chip rr-at-sampled"
                data-coverage-chip={block.scope.coverage}
                title={`sampled · ${formatMetric(block.scope.observation_count, "count")} of ${formatMetric(block.scope.source_observation_count, "count")} source observations · not a full daily ledger`}
                aria-label={`sampled, ${formatMetric(block.scope.observation_count, "count")} of ${formatMetric(block.scope.source_observation_count, "count")} source observations, not a full daily ledger`}
              >
                sampled
              </span>
            ) : null}
            <span className="rr-at-chip" data-enriched-chip title={chipTitle} aria-label={chipTitle?.replace(/\n/g, ", ")}>
              {ENRICHED_CHIP}
            </span>
          </span>
        ) : null}
      </h2>
      <div className="b">
        {block !== null ? (
          <div className="rr-at">
            <dl className="rr-at-facts" data-all-time-facts>
              <SummaryCell label="return" value={block.library_summary.return_fraction} block={block} unit="fraction" />
              {/* QA S09 (UX-3): three Sharpe figures exist for one run; this one is the all-time OOS Sharpe, and says so. */}
              <FactCell label="Sharpe" heading="Sharpe · all-time OOS" fact={block.facts.metrics.sharpe} unit="ratio" />
              <FactCell label="CAGR" fact={block.facts.metrics.cagr_fraction} unit="fraction" />
              <FactCell label="volatility" fact={block.facts.metrics.volatility_fraction} unit="fraction" />
              <SummaryCell label="max DD" value={block.library_summary.max_drawdown_fraction} block={block} unit="fraction" />
              <FactCell label="max DD length" fact={block.facts.metrics.max_drawdown_duration_days} unit="days" />
            </dl>
            <Curve block={block} />
            <div className="grid min-w-0 gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <Sub title="monthly returns">
                <Months block={block} />
              </Sub>
              <Sub title="drawdown episodes">
                <Episodes block={block} />
              </Sub>
              <Sub title="daily return distribution">
                <Distribution block={block} />
              </Sub>
            </div>
          </div>
        ) : read.kind === "refused" ? (
          <p className="rr-absent" data-enriched-refused={read.reason} title={read.detail}>
            all-time analytics — refused, {REFUSAL_WORDS[read.reason] ?? "not drawn"}
          </p>
        ) : (
          /* B7: the served `enriched_analysis_availability.reason_code`; null (field not served) keeps the code-less line. */
          <AbsentLine state="NOT_PUBLISHED" reason={absentCode} what="all-time analytics" title={absentCode !== null ? enrichedAbsenceTitle(absentCode) : undefined} />
        )}
      </div>
    </section>
  );
}
