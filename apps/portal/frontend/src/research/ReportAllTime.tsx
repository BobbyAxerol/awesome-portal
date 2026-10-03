/**
 * Screen 09 — the all-time supplement (`enriched_analysis`, top level of the Report response).
 *
 * The frozen core above it is the sealed report and is never touched. This block is a clearly labelled
 * supplement drawn from Codex's `EnrichedAnalysis`: one curve, the monthly strip, six key facts and the
 * deepest drawdown episodes. Everything printed is the server's: exact decimals stay in `title` and
 * `data-exact`, origin / locator / digest are in the tooltip and the accessible name. A report sealed
 * before the enrichment has no block; that is one typed line, never an empty frame. Nothing is computed.
 */

import { useRef, useState, type ReactNode } from "react";
import { useChartContract } from "./chartContract";

import { smokeMotionAllowed } from "../execution/smokeMotion";

import type { EnrichedAnalysis, EnrichedBucket, EnrichedEpisode, EnrichedFact, EnrichedRead, IsFactRow } from "./enrichedAnalysis";
import { ENRICHED_CHIP, bucketPosition, distributionStatistics, enrichedBlock, episodeLabel, readIsFacts, regimeAbsence, windowBands } from "./enrichedAnalysis";
import { enrichedAbsenceTitle } from "./enrichedAvailability";
import { formatMetric, shortDigest } from "./researchFormat";
import { daysAndHours, monthWords, roundAxis } from "./reportText";

const DAY = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const UTC = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
/**
 * Entry motion is decided once, on first mount: a re-render or a poll never replays it. Reduced motion, the
 * fixtures page and automated browsers all answer false (`smokeMotionAllowed`), so those render still.
 */
export function useEntryMotion(): boolean {
  const [motion] = useState(() => smokeMotionAllowed());
  return motion;
}

/**
 * The next zoom window over a time-ordered series. `dir` 1 zooms in (half the span, centred on `centerMs`),
 * -1 zooms out (double; null once it covers the whole series), 0 pans by `pan` of the span. A zoom that would
 * leave fewer than `minPoints` served points in view is refused (returns the current window). Pure.
 */
export function nextWindow(
  stamps: readonly number[],
  current: readonly [number, number] | null,
  dir: 1 | -1 | 0,
  centerMs: number | null,
  pan = 0,
  minPoints = 8,
): [number, number] | null {
  if (stamps.length < 2) return current === null ? null : [current[0], current[1]];
  const full0 = stamps[0]!;
  const full1 = stamps[stamps.length - 1]!;
  const [w0, w1] = current ?? [full0, full1];
  const span = w1 - w0;
  if (dir === 0) {
    if (current === null) return null;
    const shift = span * pan;
    const lo = Math.min(Math.max(w0 + shift, full0), full1 - span);
    return [lo, lo + span];
  }
  const centre = centerMs !== null && centerMs >= w0 && centerMs <= w1 ? centerMs : (w0 + w1) / 2;
  const nextSpan = dir === 1 ? span / 2 : span * 2;
  if (dir === -1 && nextSpan >= full1 - full0) return null;
  let lo = centre - nextSpan / 2;
  let hi = centre + nextSpan / 2;
  if (lo < full0) { hi += full0 - lo; lo = full0; }
  if (hi > full1) { lo -= hi - full1; hi = full1; }
  lo = Math.max(lo, full0);
  if (dir === 1 && stamps.filter((at) => at >= lo && at <= hi).length < minPoints) return current === null ? null : [current[0], current[1]];
  return [lo, hi];
}

/** The served point nearest to `at` in a time-ordered series. */
export function nearestAt<T extends { at_utc_ms: number }>(points: readonly T[], at: number): T | null {
  let best: T | null = null;
  for (const point of points) if (best === null || Math.abs(point.at_utc_ms - at) < Math.abs(best.at_utc_ms - at)) best = point;
  return best;
}

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
.rr-at-table td:not(:first-child) { white-space: nowrap; padding-left: 8px; }
.rr-at-sub { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; margin: 0; font-family: var(--font-mono); font-size: 9px; color: var(--ink-faint); }
.rr-at-wrap { position: relative; outline: none; }
.rr-at-wrap:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.rr-at-plot { position: relative; }
.rr-at-cross { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px solid var(--ink-soft); pointer-events: none; }
.rr-at-dot { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: var(--role-oos); border: 1.5px solid var(--paper-raised); transform: translate(-50%, -50%); pointer-events: none; }
.rr-at-tip { position: absolute; top: 2px; z-index: 2; display: flex; flex-direction: column; gap: 1px; padding: 4px 8px; font-family: var(--font-mono); font-size: 9.5px; line-height: 1.35; white-space: nowrap; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 3px; color: var(--ink); font-variant-numeric: tabular-nums; pointer-events: none; }
.rr-at-tip .k { color: var(--ink-faint); }
.rr-at-band { fill: var(--bad); fill-opacity: .08; stroke: none; }
.rr-at-band[data-active="true"] { fill-opacity: .24; }
.rr-at-win { fill-opacity: .09; stroke: none; }
.rr-at-win[data-window="is"] { fill: var(--role-is); }
.rr-at-win[data-window="oos"] { fill: var(--role-oos); }
.rr-at-win[data-window="holdout"] { fill: var(--role-holdout); }
.rr-at-stat { stroke-width: 1.25; fill: none; }
.rr-at-stat[data-stat="mean"] { stroke: var(--ink); }
.rr-at-stat[data-stat="median"] { stroke: var(--accent); }
.rr-at-stat[data-stat="var_95"], .rr-at-stat[data-stat="cvar_95"] { stroke: var(--bad); }
.rr-at-stat[data-stat="cvar_95"] { stroke-dasharray: 2 2; }
.rr-at-tools { display: inline-flex; gap: 4px; align-items: center; }
.rr-at-btn { font-family: var(--font-mono); font-size: 9px; line-height: 1; padding: 3px 6px; border: 1px solid var(--line); border-radius: 3px; background: var(--paper-raised); color: var(--ink-soft); cursor: pointer; }
.rr-at-btn:hover:not(:disabled) { border-color: var(--ink-faint); color: var(--ink); }
.rr-at-btn:disabled { opacity: .45; cursor: not-allowed; }
.rr-at-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.rr-at-month[data-month-extreme] .rr-at-cell { box-shadow: 0 0 0 1.5px var(--paper-raised), 0 0 0 2.5px var(--ink-soft); }
.rr-at-bar { transition: opacity 120ms; }
.rr-at-table tr[data-active="true"] td { background: var(--paper-sunken); }
@keyframes rr-at-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes rr-at-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes rr-at-fade { from { opacity: 0; } to { opacity: 1; } }
.rr-at-draw { animation: rr-at-reveal 600ms cubic-bezier(.215, .61, .355, 1) both; }
.rr-at-grow { transform-box: fill-box; transform-origin: 50% 100%; animation: rr-at-grow 560ms cubic-bezier(.215, .61, .355, 1) both; }
.rr-at-fade { animation: rr-at-fade 500ms cubic-bezier(.215, .61, .355, 1) both; }
@media (prefers-reduced-motion: reduce) { .rr-at-draw, .rr-at-grow, .rr-at-fade, .rr-eq-draw { animation: none; } }
@media print { .rr-at { break-inside: avoid; } .rr-at-cross, .rr-at-tip, .rr-at-dot, .rr-at-tools { display: none !important; } .rr-at-draw, .rr-at-grow, .rr-at-fade, .rr-eq-draw { animation: none; } .rr-eq-tools { display: none !important; } }
`;

/* ------------------------------------------------------------- the one-line states */

function AbsentLine({ state, reason, what, title }: { state: string; reason: string | null; what: string; title?: string }) {
  return (
    <span
      className="rr-absent"
      data-absent={what}
      data-absent-state={state}
      data-reason-code={reason ?? undefined}
      title={[title, reason].filter(Boolean).join(" · ") || undefined}
      aria-label={reason !== null ? `${what} not published, server reason ${reason}` : undefined}
      tabIndex={reason !== null ? 0 : undefined}
    >
      {what !== "" ? `${what} — ` : ""}not published
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

/** One served IS fact (`by_window.is`): its own scope and definition in the title, never merged with the OOS figure. */
function IsFactCell({ row }: { row: IsFactRow }) {
  const { fact } = row;
  const shown = fact.state === "AVAILABLE" && fact.value !== null ? formatMetric(fact.value, row.unit) : null;
  return (
    <div data-all-time-fact={row.label} data-fact-state={fact.state} data-fact-scope="IS">
      <dt>{row.label}</dt>
      <dd title={row.title} aria-label={`${row.label} ${shown ?? "not published"}, ${word(fact.origin)}`} data-exact={fact.value ?? undefined}>
        {shown !== null ? shown : <AbsentLine state={fact.state} reason={fact.reason_code} what="" />}
      </dd>
    </div>
  );
}

function SummaryCell({ label, value, block, unit, heading }: { label: string; value: string | null; block: EnrichedAnalysis; unit: "fraction"; heading?: string }) {
  const summary = block.library_summary;
  const shown = summary.state === "AVAILABLE" && value !== null ? formatMetric(value, unit) : null;
  const title = [`${label} · OOS all time · portal-derived`, value !== null ? `exact ${value}` : null, block.scope.locator, `input ${shortDigest(summary.input_digest)}`]
    .filter((part): part is string => part !== null)
    .join("\n");
  return (
    <div data-all-time-fact={label} data-fact-state={shown !== null ? "AVAILABLE" : "NOT_PUBLISHED"}>
      <dt>{heading ?? label}</dt>
      <dd title={title} aria-label={`${label} ${shown ?? "not published"}, portal-derived`} data-exact={value ?? undefined}>
        {shown !== null ? shown : <AbsentLine state={summary.state} reason={summary.reason_code} what="" />}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------------- curve */

const W = 1000;
const H = 200;

type CurvePoint = { at_utc_ms: number; value: string };

/** One curve as SVG vertices over the visible time window and its own value range. Positions only. */
function path(points: readonly CurvePoint[], x0: number, x1: number, y0: number, y1: number): string | null {
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

/** Where a value sits on a panel, as a percent from the top (the same mapping `path` draws with). */
function yPct(value: string, lo: number, hi: number): number {
  const y = Number(value);
  if (!Number.isFinite(y) || hi === lo) return 50;
  return ((6 + (1 - (y - lo) / (hi - lo)) * (H - 12)) / H) * 100;
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

const MIN_ZOOM_POINTS = 8;

/**
 * QA S09 (UX-10): the strategy and the market benchmark do not share one y-scale. At +1.7% against +34% a shared
 * scale drew the strategy flat. Each curve has its own panel and its own labelled range, on one time axis; the
 * benchmark panel says "own scale", so no reader compares the two slopes by eye.
 *
 * Alive, still honest: the line reveals once on first mount; a pointer or the arrow keys read the nearest served
 * point on every panel at once (one crosshair); +/- zoom the shared time window and Reset zoom appears only when
 * zoomed. The served drawdown curve rides a compact strip under the strategy, and the served drawdown episodes
 * are shaded on the strategy panel (the hovered table row lights its band). Every figure in the tooltip is a
 * served string; a panel with no served series says so and draws nothing.
 */
function Curve({ block, activeEpisode = null }: { block: EnrichedAnalysis; activeEpisode?: number | null }) {
  /* The chart contract hook runs in the body; this guard keeps it out of the absent branch. */
  if (block.curves.strategy_rebased_100.length < 2) return <AbsentLine state="NOT_PUBLISHED" reason={null} what="strategy curve" />;
  return <CurveBody block={block} activeEpisode={activeEpisode} />;
}

function CurveBody({ block, activeEpisode = null }: { block: EnrichedAnalysis; activeEpisode?: number | null }) {
  const motion = useEntryMotion();
  const [win, setWin] = useState<[number, number] | null>(null);
  const atRef = useRef<number | null>(null);
  const strategy = block.curves.strategy_rebased_100;
  const benchmark = block.curves.benchmark_rebased_100;
  const underwater = block.curves.drawdown_fraction;
  const fullStamps = [...strategy, ...benchmark, ...underwater].map((point) => point.at_utc_ms).sort((a, b) => a - b);
  const full0 = fullStamps[0]!;
  const full1 = fullStamps[fullStamps.length - 1]!;
  const inWindow = <T extends { at_utc_ms: number }>(points: readonly T[]) => (win === null ? points : points.filter((point) => point.at_utc_ms >= win[0] && point.at_utc_ms <= win[1]));
  const visS = inWindow(strategy);
  const zoomed = win !== null && visS.length >= 2;
  const view = zoomed ? inWindow(strategy) : strategy;
  const [x0, x1] = zoomed ? win! : [full0, full1];
  const visB = zoomed ? inWindow(benchmark) : benchmark;
  const visD = zoomed ? inWindow(underwater) : underwater;
  const rangeS = rangeOf(view);
  const rangeB = visB.length > 1 ? rangeOf(visB) : null;
  const lineS = rangeS ? path(view, x0, x1, Number(rangeS.lowText), Number(rangeS.highText)) : null;
  const lineB = rangeB ? path(visB, x0, x1, Number(rangeB.lowText), Number(rangeB.highText)) : null;
  /* The underwater strip: depth grows downward, scaled to the deepest served magnitude. */
  const depths = visD.map((point) => Math.abs(Number(point.value)));
  const deepest = depths.length > 1 && depths.every(Number.isFinite) ? Math.max(...depths) : null;
  const lineD =
    deepest !== null && deepest > 0
      ? visD.map((point, index) => `${(((point.at_utc_ms - x0) / (x1 - x0 || 1)) * W).toFixed(1)},${(4 + (depths[index]! / deepest) * (H - 8)).toFixed(1)}`).join(" ")
      : null;
  const deepestText = deepest !== null ? (visD[depths.indexOf(deepest)]?.value ?? null) : null;
  const sampling = block.curves.sampling;
  const pct = (at: number) => (x1 === x0 ? 50 : ((at - x0) / (x1 - x0)) * 100);
  const episodes = block.drawdown_episodes.state === "AVAILABLE" ? block.drawdown_episodes.values : [];
  const bands = episodes.flatMap((episode, index) => {
    const from = Math.max(episode.start_utc_ms, x0);
    const to = Math.min(episode.recovery_utc_ms ?? full1, x1);
    return to > from ? [{ index, from, to }] : [];
  });
  /* B9: the served half-open IS / OOS / HOLDOUT bounds, as role bands under the curve (frames, not payloads). */
  const windows = windowBands(block.windows);
  const canZoomIn = view.length > MIN_ZOOM_POINTS;
  const setZoomAt = (dir: 1 | -1, centre: number | null) => setWin(nextWindow(strategy.map((point) => point.at_utc_ms), win, dir, centre, 0, MIN_ZOOM_POINTS));
  const tipTitle = (point: { at_utc_ms: number; value: string }): string => {
    const b = lineB !== null ? nearestAt(visB, point.at_utc_ms) : null;
    const d = lineD !== null ? nearestAt(visD, point.at_utc_ms) : null;
    return [`${UTC(point.at_utc_ms)} · strategy exact ${point.value}`, b ? `benchmark exact ${b.value}` : null, d ? `drawdown exact ${d.value}` : null].filter(Boolean).join("\n");
  };
  const chart = useChartContract({
    label: "Strategy curve",
    noun: "point",
    count: view.length,
    describe: (i) => tipTitle(view[i]!),
    summary: `Strategy rebased to 100, ${view.length} points, ${DAY(x0)} to ${DAY(x1)}. Arrow keys read a point.`,
    xs: view.map((point) => pct(point.at_utc_ms)),
    zoom: {
      zoomIn: () => setZoomAt(1, atRef.current),
      zoomOut: () => setZoomAt(-1, atRef.current),
      pan: (dir) => setWin(nextWindow(strategy.map((point) => point.at_utc_ms), win, 0, null, dir * 0.25)),
      reset: () => setWin(null),
      zoomed,
    },
  });
  const at = chart.index !== null ? (view[chart.index] ?? null) : null;
  atRef.current = at?.at_utc_ms ?? null;
  if (lineS === null || rangeS === null) return <AbsentLine state="NOT_PUBLISHED" reason={null} what="strategy curve" />;
  const atB = at !== null && lineB !== null ? nearestAt(visB, at.at_utc_ms) : null;
  const atD = at !== null && lineD !== null ? nearestAt(visD, at.at_utc_ms) : null;
  const inEpisode = at !== null ? episodes.findIndex((episode) => at.at_utc_ms >= episode.start_utc_ms && at.at_utc_ms <= (episode.recovery_utc_ms ?? full1)) : -1;
  const atPct = at !== null ? pct(at.at_utc_ms) : 0;
  const setZoom = (dir: 1 | -1) => setZoomAt(dir, at?.at_utc_ms ?? null);
  const tip = (side: "l" | "r"): { left?: string; right?: string; marginLeft?: number; marginRight?: number } =>
    side === "r" ? { right: `${100 - atPct}%`, marginRight: 8 } : { left: `${atPct}%`, marginLeft: 8 };
  const cross = at !== null ? <span className="rr-at-cross" style={{ left: `${atPct}%` }} aria-hidden="true" data-curve-cross /> : null;
  return (
    <div data-all-time-curve data-has-benchmark={lineB !== null ? "true" : "false"} data-curve-zoomed={zoomed ? "true" : "false"} data-curve-motion={motion ? "on" : "off"}>
      <div className="rr-at-sub" style={{ marginBottom: 2 }}>
        <span className="rr-at-tools" data-curve-tools>
          <button type="button" className="rr-at-btn" aria-label="Zoom curve in" title={canZoomIn ? "Zoom in (+)" : "Too few points in view to zoom in"} disabled={!canZoomIn} onClick={() => setZoom(1)}>
            +
          </button>
          <button type="button" className="rr-at-btn" aria-label="Zoom curve out" title={zoomed ? "Zoom out (−)" : "Already showing all time"} disabled={!zoomed} onClick={() => setZoom(-1)}>
            −
          </button>
          {zoomed ? (
            <button type="button" className="rr-at-btn" data-curve-reset aria-label="Reset zoom" title="Show all time again" onClick={() => setWin(null)}>
              Reset zoom
            </button>
          ) : null}
        </span>
      </div>
      <div
        {...chart.regionProps}
        className={`rr-at-wrap ${chart.regionProps.className ?? ""}`}
        data-curve-probe-area
      >
        <p className="rr-at-sub" data-curve-range="strategy" title={`range of the drawn points: ${rangeS.lowText} to ${rangeS.highText}`}>
          <span style={{ color: "var(--role-oos)" }}>strategy · rebased 100</span>
          <span>
            {rangeS.low} – {rangeS.high}
          </span>
        </p>
        <div className="rr-at-plot" data-curve-plot="strategy">
          <svg className="rr-at-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {windows.map((win) => {
              const from = Math.max(win.start_ms, x0);
              const to = Math.min(win.end_ms, x1);
              return to > from ? (
                <rect key={win.key} className="rr-at-win" data-window={win.key} data-window-state={win.state} x={(pct(from) * W) / 100} width={Math.max(2, ((pct(to) - pct(from)) * W) / 100)} y={0} height={H}>
                  <title>{win.title}</title>
                </rect>
              ) : null;
            })}
            {bands.map((band) => (
              <rect
                key={band.index}
                className="rr-at-band"
                data-episode-band={band.index + 1}
                data-active={activeEpisode === band.index || inEpisode === band.index ? "true" : "false"}
                x={(pct(band.from) * W) / 100}
                width={Math.max(2, ((pct(band.to) - pct(band.from)) * W) / 100)}
                y={0}
                height={H}
              />
            ))}
            <g className={motion ? "rr-at-draw" : undefined}>
              <polyline points={lineS} fill="none" stroke="var(--role-oos)" strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          {cross}
          {at !== null && rangeS ? <span className="rr-at-dot" style={{ left: `${atPct}%`, top: `${yPct(at.value, Number(rangeS.lowText), Number(rangeS.highText))}%` }} aria-hidden="true" /> : null}
          {at !== null ? (
            <span
              className="rr-at-tip"
              style={tip(atPct > 55 ? "r" : "l")}
              data-curve-tip
              title={tipTitle(at)}
            >
              <span>{UTC(at.at_utc_ms)}</span>
              <span>
                <span className="k">strategy </span>
                {roundAxis(at.value, 2)}
              </span>
              {atB ? (
                <span data-tip-benchmark>
                  <span className="k">benchmark </span>
                  {roundAxis(atB.value, 2)}
                  {atB.at_utc_ms !== at.at_utc_ms ? <span className="k"> @ {DAY(atB.at_utc_ms)}</span> : null}
                </span>
              ) : null}
              {atD ? (
                <span data-tip-drawdown>
                  <span className="k">drawdown </span>
                  {formatMetric(atD.value, "fraction") ?? atD.value}
                </span>
              ) : null}
              {inEpisode >= 0 ? (
                <span data-tip-episode>
                  <span className="k">episode {inEpisode + 1} </span>
                  {formatMetric(episodes[inEpisode]!.depth_fraction, "fraction") ?? episodes[inEpisode]!.depth_fraction}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {lineB !== null && rangeB !== null ? (
          <>
            <p className="rr-at-sub" data-curve-range="benchmark" title={`range of the drawn points: ${rangeB.lowText} to ${rangeB.highText}`}>
              <span title="market benchmark (portal) · drawn on its own scale">benchmark · own scale</span>
              <span>
                {rangeB.low} – {rangeB.high}
              </span>
            </p>
            <div className="rr-at-plot" data-curve-plot="benchmark">
              <svg className="rr-at-curve" style={{ height: 56 }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" data-benchmark-curve>
                <g className={motion ? "rr-at-draw" : undefined}>
                  <polyline points={lineB} fill="none" stroke="var(--ink-faint)" strokeWidth={1.2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                </g>
              </svg>
              {cross}
              {atB !== null && rangeB ? <span className="rr-at-dot" style={{ left: `${pct(atB.at_utc_ms)}%`, top: `${yPct(atB.value, Number(rangeB.lowText), Number(rangeB.highText))}%`, background: "var(--ink-faint)" }} aria-hidden="true" /> : null}
            </div>
          </>
        ) : null}
        {lineD !== null ? (
          <>
            <p className="rr-at-sub" data-curve-range="drawdown" title={deepestText !== null ? `deepest served drawdown ${deepestText}` : undefined}>
              <span>drawdown · served curve</span>
              <span>{deepestText !== null ? `deepest ${formatMetric(deepestText, "fraction") ?? deepestText}` : ""}</span>
            </p>
            <div className="rr-at-plot" data-curve-plot="drawdown">
              <svg className="rr-at-curve" style={{ height: 44 }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" data-drawdown-curve>
                <g className={motion ? "rr-at-draw" : undefined}>
                  <polygon points={`0,0 ${lineD} ${W},0`} fill="var(--bad)" fillOpacity={0.14} stroke="none" />
                  <polyline points={lineD} fill="none" stroke="var(--bad)" strokeOpacity={0.8} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                </g>
              </svg>
              {cross}
            </div>
          </>
        ) : null}
      </div>
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
      {windows.length > 0 ? (
        <p className="rr-at-sub" data-curve-windows title={windows.map((win) => win.title).join("\n\n")}>
          <span>
            {windows.map((win, index) => (
              <span key={win.key} data-window-legend={win.key} style={{ color: `var(--role-${win.key})` }}>
                {index > 0 ? " · " : ""}
                {win.label} {DAY(win.start_ms)} → {DAY(win.end_ms)}
              </span>
            ))}
          </span>
        </p>
      ) : null}
      {bands.length > 0 ? (
        <p className="rr-at-sub" data-curve-bands title="Shaded spans are the served drawdown episodes, start to recovery.">
          <span>
            shaded: {bands.length}
            {block.drawdown_episodes.state === "AVAILABLE" && block.drawdown_episodes.values.length < block.drawdown_episodes.total ? ` of ${formatMetric(block.drawdown_episodes.total, "count")}` : ""}
          </span>
        </p>
      ) : null}
      {chart.nodes}
      <span className="sr-only" hidden data-curve-summary title={`Strategy rebased to 100 ranged ${rangeS.low} to ${rangeS.high} from ${DAY(x0)} to ${DAY(x1)}.`} />
    </div>
  );
}

/* ------------------------------------------------------------------ distribution */

/**
 * QA S09 (UX-11 / inventory 42): the daily-return histogram the API already serves. Bars are the served counts,
 * scaled to the tallest bar (layout only); each bar's exact edges and count ride its title, a hover / arrow-key
 * tooltip and the bars' own accessible names. The bars grow once on first mount. Mean / median / VaR / CVaR are
 * marked only when the block serves them (B9 Fact objects + policy); a legacy block draws no mark and no claim.
 */
function Distribution({ block }: { block: EnrichedAnalysis }) {
  const head = block.return_distribution;
  if (head.state !== "AVAILABLE" || head.buckets.length === 0) {
    return <AbsentLine state={head.state} reason={head.reason_code} what="return distribution" />;
  }
  return <DistributionBody block={block} />;
}

function DistributionBody({ block }: { block: EnrichedAnalysis }) {
  const motion = useEntryMotion();
  const head = block.return_distribution;
  const count = head.buckets.length;
  const tallest = Math.max(...head.buckets.map((bucket) => bucket.count), 1);
  const first = head.buckets[0]!;
  const last = head.buckets[count - 1]!;
  const edge = (value: string) => formatMetric(value, "fraction") ?? value;
  const width = 100 / count;
  const bucketTitle = (item: EnrichedBucket) => `${edge(item.lower_inclusive)} to ${edge(item.upper)} · ${item.count} ${item.count === 1 ? "day" : "days"}`;
  const chart = useChartContract({
    label: "Daily return distribution",
    noun: "bucket",
    count,
    describe: (i) => bucketTitle(head.buckets[i]!),
    summary: `Daily return distribution, ${count} buckets, ${head.observation_count} days, ${edge(first.lower_inclusive)} to ${edge(last.upper)}. Arrow keys read a bucket.`,
    xs: head.buckets.map((_, i) => (i + 0.5) * width),
  });
  const active = chart.index;
  const bucket = active !== null ? head.buckets[active] : undefined;
  const centre = active !== null ? (active + 0.5) * width : 0;
  /* B9: the served statistics, positioned by the served bucket edges (VaR/CVaR are loss fractions: return = −loss). */
  const stats = distributionStatistics(block);
  const marks = (stats?.markers ?? []).flatMap((marker) => {
    const at = marker.returnAt !== null ? bucketPosition(head.buckets, marker.returnAt) : null;
    return at === null ? [] : [{ marker, x: at * width }];
  });
  return (
    <div data-all-time-distribution data-bucket-count={count} data-distribution-motion={motion ? "on" : "off"}>
      <div
        {...chart.regionProps}
        className={`rr-at-wrap rr-at-plot ${chart.regionProps.className ?? ""}`}
        data-distribution-area
      >
        <svg className="rr-at-curve" style={{ height: 80 }} viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
          {head.buckets.map((item, index) => {
            const height = (item.count / tallest) * 56;
            const zeroBucket = Number(item.lower_inclusive) < 0 && Number(item.upper) >= 0;
            return (
              <rect
                key={index}
                data-bucket={index}
                data-count={item.count}
                data-lower={item.lower_inclusive}
                data-upper={item.upper}
                className={`rr-at-bar${motion ? " rr-at-grow" : ""}`}
                style={motion ? { animationDelay: `${index * 25}ms` } : undefined}
                x={index * width + 0.4}
                y={58 - height}
                width={width - 0.8}
                height={height}
                fill={zeroBucket ? "var(--ink-soft)" : "var(--role-oos)"}
                opacity={active === null || active === index ? (active === index ? 1 : 0.75) : 0.4}
              >
                <title>{`${edge(item.lower_inclusive)} to ${edge(item.upper)} · ${item.count} ${item.count === 1 ? "day" : "days"}`}</title>
              </rect>
            );
          })}
          {marks.map(({ marker, x }) => (
            <line key={marker.key} className="rr-at-stat" data-stat-mark={marker.key} x1={x} x2={x} y1={0} y2={58} vectorEffect="non-scaling-stroke">
              <title>{marker.title}</title>
            </line>
          ))}
          <line x1={0} x2={100} y1={58.5} y2={58.5} stroke="var(--line)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        </svg>
        {bucket !== undefined && active !== null ? (
          <span
            className="rr-at-tip"
            data-distribution-tip
            style={centre > 55 ? { right: `${100 - centre}%`, marginRight: 6 } : { left: `${centre}%`, marginLeft: 6 }}
            title={`${bucket.lower_inclusive} to ${bucket.upper} · ${bucket.count} days`}
          >
            <span>
              {edge(bucket.lower_inclusive)} to {edge(bucket.upper)}
            </span>
            <span>
              {formatMetric(bucket.count, "count")} {bucket.count === 1 ? "day" : "days"}
            </span>
          </span>
        ) : null}
        {chart.nodes}
      </div>
      <p className="rr-at-sub" style={{ marginTop: 2 }}>
        <span title={`${first.lower_inclusive} to ${last.upper}`}>
          {edge(first.lower_inclusive)} to {edge(last.upper)}
        </span>
        <span data-distribution-count title={`tallest bar ${tallest} days`}>
          {formatMetric(head.observation_count, "count")} days
        </span>
      </p>
      {stats !== null ? (
        <p className="rr-at-sub" style={{ marginTop: 2 }} data-distribution-stats="PUBLISHED" title={stats.policyTitle}>
          {stats.markers.map((marker) => (
            <span key={marker.key} data-stat={marker.key} data-exact={marker.fact.value ?? undefined} data-state={marker.fact.state} title={marker.title}>
              {marker.label} {marker.shown ?? `not published${marker.fact.reason_code !== null ? ` · ${marker.fact.reason_code}` : ""}`}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ months */

function Months({ block }: { block: EnrichedAnalysis }) {
  const head = block.monthly_returns;
  if (head.state !== "AVAILABLE" || head.values.length === 0) {
    return <AbsentLine state={head.state} reason={head.reason_code} what="monthly returns" />;
  }
  return <MonthsBody block={block} />;
}

function MonthsBody({ block }: { block: EnrichedAnalysis }) {
  const motion = useEntryMotion();
  const head = block.monthly_returns;
  /* Best and worst are picked from the served full months (never a partial one); nothing is computed. */
  const full = head.values.filter((row) => !row.partial && Number.isFinite(Number(row.return_fraction)));
  const best = full.length >= 3 ? full.reduce((a, b) => (Number(b.return_fraction) > Number(a.return_fraction) ? b : a)) : null;
  const worst = full.length >= 3 ? full.reduce((a, b) => (Number(b.return_fraction) < Number(a.return_fraction) ? b : a)) : null;
  const shownOf = (row: { return_fraction: string }) => formatMetric(row.return_fraction, "fraction") ?? row.return_fraction;
  const monthTitle = (row: (typeof head.values)[number]): string => {
    const extreme = row === best ? "best" : row === worst ? "worst" : undefined;
    return [
      `${new Date(row.month_start_utc_ms).toISOString().slice(0, 7)} · ${shownOf(row)} · exact ${row.return_fraction}${extreme ? ` · ${extreme} full month` : ""}`,
      row.partial ? `partial month · ${row.observation_count} of ${row.expected_observation_count} observations` : `${row.observation_count} observations`,
      `${word(row.basis)} · ${UTC(row.base_at_utc_ms)} → ${UTC(row.close_at_utc_ms)}`,
      block.scope.locator,
    ].join("\n");
  };
  /* One region for the strip; the months wrap onto rows, so a press goes through each month's own pointProps. */
  const chart = useChartContract({
    label: "Monthly returns",
    noun: "month",
    count: head.values.length,
    describe: (i) => monthTitle(head.values[i]!),
    summary: `Monthly returns, ${head.values.length} months, ${monthWords(head.values[0]!.month_start_utc_ms)} to ${monthWords(head.values[head.values.length - 1]!.month_start_utc_ms)}. Arrow keys read a month.`,
  });
  return (
    <div data-all-time-months data-months-motion={motion ? "on" : "off"}>
      <div {...chart.regionProps} className={`rr-at-months rr-at-wrap ${chart.regionProps.className ?? ""}`} data-months-region>
        {chart.text !== null ? (
          <span className="rr-at-tip" data-months-tip style={{ right: 0, top: "auto", bottom: "calc(100% + 2px)" }} title={chart.text}>
            {chart.text.split("\n").slice(0, 2).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        ) : null}
        {head.values.map((row, index) => {
          const negative = row.return_fraction.trim().startsWith("-");
          const colour = negative ? "var(--bad)" : "var(--good)";
          const month = new Date(row.month_start_utc_ms).toISOString().slice(0, 7);
          const shown = shownOf(row);
          const extreme = row === best ? "best" : row === worst ? "worst" : undefined;
          const magnitude = Math.min(0.85, 0.15 + Math.abs(Number(row.return_fraction)) * 9);
          const title = monthTitle(row);
          return (
            <span
              key={row.month_start_utc_ms}
              className={`rr-at-month${motion ? " rr-at-fade" : ""}`}
              style={motion ? { animationDelay: `${index * 30}ms` } : undefined}
              data-month={month}
              data-exact={row.return_fraction}
              data-month-partial={row.partial ? "true" : undefined}
              data-month-extreme={extreme}
              aria-hidden="true"
              title={title}
              {...chart.pointProps(index)}
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
        {chart.nodes}
      </div>
      <p className="rr-at-sub" style={{ marginTop: 4 }}>
        <span>hatched = partial month</span>
        {best !== null && worst !== null ? (
          <span data-months-extremes title={`ringed: best ${best.return_fraction}, worst ${worst.return_fraction} (full months only)`}>
            ringed: best {monthWords(best.month_start_utc_ms)} {shownOf(best)} · worst {monthWords(worst.month_start_utc_ms)} {shownOf(worst)}
          </span>
        ) : null}
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

function Episodes({ block, onActive }: { block: EnrichedAnalysis; onActive?: (index: number | null) => void }) {
  const head = block.drawdown_episodes;
  if (head.state !== "AVAILABLE" || head.values.length === 0) {
    return <AbsentLine state={head.state} reason={head.reason_code} what="drawdown episodes" />;
  }
  const shown = head.values.length;
  const regime = regimeAbsence(block);
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
            const label = episodeLabel(episode);
            const title = [
              `episode ${index + 1} · ${word(head.origin)} · all time`,
              label !== null ? `label ${label} (descriptive, from the served path)` : null,
              episode.regime !== undefined ? `market regime not published · ${episode.regime.reason_code} · ${episode.regime.source_locator}` : null,
              `start ${UTC(episode.start_utc_ms)}`,
              `trough ${UTC(episode.trough_utc_ms)}`,
              open ? "recovery open at the end of the scope" : `recovery ${UTC(episode.recovery_utc_ms as number)}`,
              `depth exact ${episode.depth_fraction}`,
              block.scope.locator,
            ].filter((part): part is string => part !== null).join("\n");
            return (
              <tr
                key={`${episode.start_utc_ms}-${index}`}
                data-episode={index + 1}
                data-episode-open={open ? "true" : "false"}
                title={title}
                tabIndex={0}
                onPointerEnter={() => onActive?.(index)}
                onPointerLeave={() => onActive?.(null)}
                onFocus={() => onActive?.(index)}
                onBlur={() => onActive?.(null)}
              >
                <td>
                  {DAY(episode.start_utc_ms)}
                  {label !== null ? <span data-episode-label style={{ color: "var(--ink-faint)", display: "block" }}>{label}</span> : null}
                </td>
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
      {regime !== null ? (
        <p className="rr-at-sub" style={{ marginTop: 2 }} data-episode-regime="NOT_PUBLISHED" data-reason-code={regime.reason_code} title={regime.source_locator}>
          <span>market regime — not published</span>
        </p>
      ) : null}
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

const TITLE = "All-time";

export function AllTimeSupplement({ read, absentCode = null }: { read: EnrichedRead; absentCode?: string | null }) {
  /* The hovered / focused episode row lights its shaded band on the curve. */
  const [episode, setEpisode] = useState<number | null>(null);
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
  const isRead = block !== null ? readIsFacts(block) : { kind: "absent" as const, state: "NOT_PUBLISHED" as const, reason_code: null };
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
              ⓘ
            </span>
          </span>
        ) : null}
      </h2>
      <div className="b">
        {block !== null ? (
          <div className="rr-at">
            <dl className="rr-at-facts" data-all-time-facts data-is-facts={isRead.kind} data-is-reason={isRead.kind === "absent" ? isRead.reason_code ?? undefined : undefined}>
              <SummaryCell label="return" heading="Return" value={block.library_summary.return_fraction} block={block} unit="fraction" />
              {/* QA S09 (UX-3): three Sharpe figures exist for one run; this one is the all-time OOS Sharpe, and says so. */}
              <FactCell label="Sharpe" heading="Sharpe" fact={block.facts.metrics.sharpe} unit="ratio" />
              <FactCell label="CAGR" fact={block.facts.metrics.cagr_fraction} unit="fraction" />
              <FactCell label="volatility" fact={block.facts.metrics.volatility_fraction} unit="fraction" />
              <SummaryCell label="max DD" value={block.library_summary.max_drawdown_fraction} block={block} unit="fraction" />
              <FactCell label="max DD length" fact={block.facts.metrics.max_drawdown_duration_days} unit="days" />
              {/* B8: served IS facts, separately scoped next to the OOS ones; omitted IS adds no cell (typed on data-is-facts). */}
              {isRead.kind === "available" ? isRead.rows.map((row) => <IsFactCell key={row.key} row={row} />) : null}
            </dl>
            <Curve block={block} activeEpisode={episode} />
            <div className="grid min-w-0 gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <Sub title="monthly returns">
                <Months block={block} />
              </Sub>
              <Sub title="drawdown episodes">
                <Episodes block={block} onActive={setEpisode} />
              </Sub>
              <Sub title="daily return distribution">
                <Distribution block={block} />
              </Sub>
            </div>
          </div>
        ) : read.kind === "refused" ? (
          <p className="rr-absent" data-enriched-refused={read.reason} title={read.detail}>
            all-time — not drawn ({REFUSAL_WORDS[read.reason] ?? "refused"})
          </p>
        ) : (
          /* B7: the served `enriched_analysis_availability.reason_code`; null (field not served) keeps the code-less line. */
          <AbsentLine state="NOT_PUBLISHED" reason={absentCode} what="all-time analytics" title={absentCode !== null ? enrichedAbsenceTitle(absentCode) : undefined} />
        )}
      </div>
    </section>
  );
}
