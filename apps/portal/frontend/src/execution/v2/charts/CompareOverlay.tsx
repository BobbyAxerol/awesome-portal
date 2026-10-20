/**
 * CompareOverlay · two to four series on one shared axis, already on one basis.
 *
 * The component never rebases a ratio and never compares across bases: a
 * series the caller cannot put on the basis is listed as "Not comparable" with
 * the caller's reason, in the legend, hatched, not plotted. The basis is a
 * required caption so the axis always says what it measures.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import "../css/charts.css";
import type { ExactUnit } from "../../formatExact";
import { Flag } from "../Flag";
import { formatAsOf } from "../boundary";
import { ChartStateFlags, ChartUnavailable } from "./ChartStateView";
import { showDecimal } from "./decimal";
import { bucketSizeFor, envelopeCaption, reduceRun, type Envelope } from "./downsample";
import { CHART_MARGIN, useChartId, useElementWidth } from "./hooks";
import { buildSeries, nearestIndex, nearestTimeIndex, resolveCursor, runsOf, stepCursor, type SeriesModel } from "./model";
import { gapRectsPath, gapSpans, linePath, XAxis, YAxis, type Frame } from "./plotParts";
import { linear, niceTicks } from "./scale";
import type { ChartDomain, ChartState, SeriesPoint, UtcEpochMs } from "./types";

export interface CompareSeries {
  /** Stable key. */
  readonly id: string;
  /** Legend, end tag and readout name. */
  readonly label: string;
  /** Values already on the shared basis (see `rebaseToFirst` for money; a ratio must arrive rebased). */
  readonly points: readonly SeriesPoint[];
}

export interface NotComparable {
  /** Stable key. */
  readonly id: string;
  /** Name shown in the partition. */
  readonly label: string;
  /** Why it is outside the comparison: "Other currency", "Return not available". */
  readonly reason: string;
}

export interface CompareOverlayProps {
  /** Visible heading and accessible name. */
  label: string;
  /** Series on the SAME basis. Up to four are drawn. */
  series: readonly CompareSeries[];
  /** Excluded from the overlay, listed with the reason. */
  notComparable?: readonly NotComparable[];
  /** What the axis measures: "Return since window start, Modified Dietz, USDT". Required. */
  basis: string;
  /** Display class for values. Default `pct`. */
  unit?: ExactUnit;
  /** Appended to readout values. */
  currency?: string;
  /** Prefix `+` on positive labels. Default true: an overlay rebased to zero is signed. */
  signed?: boolean;
  /** `unavailable` prints the caller's copy and still lists `notComparable`; `partial` and `stale` still draw and wear a Flag. */
  state?: ChartState;
  /** Shared window; defaults to the extent of the plotted series. */
  domain?: ChartDomain;
  /** Expected spacing in ms. A larger gap breaks that series' line. */
  intervalMs?: number;
  /** Plot height in px. Default 330. */
  height?: number;
}

const TONES = ["series", "series-2", "series-3", "series-4"] as const;
const DASHES = ["", "10 4", "2 4", "10 3 2 3"] as const;
const MARKERS = ["circle", "square", "diamond", "triangle"] as const;
const MAX_SERIES = 4;
const END_GAP = 24;

interface Plotted {
  readonly c: CompareSeries;
  readonly model: SeriesModel;
  readonly k: number;
}

function marker(kind: (typeof MARKERS)[number], cx: number, cy: number) {
  switch (kind) {
    case "square": return <rect x={cx - 4} y={cy - 4} width={8} height={8} />;
    case "diamond": return <polygon points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`} />;
    case "triangle": return <polygon points={`${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`} />;
    default: return <circle cx={cx} cy={cy} r={4.5} />;
  }
}

export function CompareOverlay({ label, series, notComparable = [], basis, unit = "pct", currency, signed = true, state = { kind: "ready" }, domain, intervalMs, height = 330 }: CompareOverlayProps) {
  const id = useChartId("exec-cmp");
  const plotRef = useRef<HTMLDivElement | null>(null);
  const W = useElementWidth(plotRef);
  // The cursor is an INSTANT on the shared timeline, not an ordinal: adding or removing a subject re-indexes the timeline.
  const [cur, setCur] = useState<{ readonly t: number | null; readonly say: boolean }>({ t: null, say: false });

  const built = useMemo(() => series.map((c) => ({ c, model: buildSeries(c.points, unit, intervalMs) })), [series, unit, intervalMs]);

  const notDrawn: NotComparable[] = [];
  const plotted: Plotted[] = [];
  for (const b of built) {
    if (!b.model.ordered) notDrawn.push({ id: b.c.id, label: b.c.label, reason: "Points are not in strictly increasing time order" });
    else if (b.model.drawable === 0) notDrawn.push({ id: b.c.id, label: b.c.label, reason: "No published value in this window" });
    else if (plotted.length >= MAX_SERIES) notDrawn.push({ id: b.c.id, label: b.c.label, reason: `Only ${MAX_SERIES} series fit the palette` });
    else plotted.push({ ...b, k: plotted.length });
  }

  const timeline = useMemo(() => {
    const set = new Set<number>();
    for (const p of plotted) for (const o of p.model.obs) set.add(o.t);
    return [...set].sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  const excluded = [...notComparable, ...notDrawn];
  const excludedList = excluded.length > 0 ? (
    <ul className="exec-compare-nc" aria-label="Not in the comparison">
      {excluded.map((e) => (
        <li key={e.id} className="exec-compare-nc-item" data-testid="not-comparable">
          <i className="exec-c2-sw" data-s="gap" data-hatch="true" />
          <span className="exec-compare-nc-name">{e.label}</span>
          <Flag kind="na" label="Not comparable" size="sm" />
          <span className="exec-compare-nc-reason">{e.reason}</span>
        </li>
      ))}
    </ul>
  ) : null;

  if (state.kind === "unavailable") {
    return (<div className="exec-chart exec-compare"><ChartUnavailable label={label} copy={state.copy} reason={state.reason} height={height} />{excludedList}</div>);
  }
  if (plotted.length === 0) {
    return (<div className="exec-chart exec-compare"><ChartUnavailable label={label} copy="Not available" reason="No series can be drawn on one basis." height={height} />{excludedList}</div>);
  }

  const x0 = (domain ? domain.from : Math.min(...plotted.map((p) => p.model.obs[0].t))) as number;
  const x1 = (domain ? domain.to : Math.max(...plotted.map((p) => p.model.obs[p.model.obs.length - 1].t))) as number;
  const frame: Frame = { W, ml: CHART_MARGIN.l, mr: 150, top: 16, bottom: height - 28 };
  const iw = W - frame.ml - frame.mr;
  const x = linear(x0, x1, frame.ml, frame.ml + iw);

  let lo = 0;
  let hi = 0;
  for (const p of plotted) {
    lo = Math.min(lo, p.model.min as number);
    hi = Math.max(hi, p.model.max as number);
  }
  const air = (hi - lo) * 0.1;
  const ticks = niceTicks(lo - air, hi + air, 5);
  const y = linear(ticks.lo, ticks.hi, frame.bottom, frame.top);

  const budget = Math.max(64, Math.floor(iw));
  const totalDrawable = plotted.reduce((sum, p) => sum + p.model.drawable, 0);
  const bucket = bucketSizeFor(Math.ceil(totalDrawable / plotted.length), budget);
  let shownCount = 0;
  const reducedRuns = plotted.map((p) => {
    const runs = runsOf(p.model).map((r) => reduceRun(r, bucket));
    shownCount += runs.reduce((sum, r) => sum + r.length, 0);
    return runs;
  });
  const envelope: Envelope = { sourceCount: totalDrawable, shownCount, bucket, reduced: shownCount < totalDrawable };
  const gapCount = plotted.reduce((sum, p) => sum + p.model.gaps, 0);
  const unreadable = plotted.reduce((sum, p) => sum + p.model.unreadable, 0);

  const show = (s: string) => showDecimal(s, { unit, signed, currency });
  const timeOf = (t: number) => formatAsOf(t as UtcEpochMs);
  const latest = timeline.length - 1;
  const cursor = resolveCursor(timeline, cur.t);
  const at = timeline[cursor ?? latest];
  const valueAt = (p: Plotted, t: number): string | null => {
    const i = nearestIndex(p.model.obs, t);
    return i >= 0 && p.model.obs[i].t === t ? p.model.obs[i].s : null;
  };

  const sayAt = (t: number) => `${timeOf(t)}. ${plotted.map((p) => `${p.c.label} ${valueAt(p, t) ?? "no point"}`).join(". ")}`;
  const moveTo = (next: number | null, say: boolean) => setCur({ t: next === null ? null : timeline[next], say });
  // A keyboard move says the instant on screen; Escape says the latest; a cursor released by new data says nothing.
  const announce = !cur.say ? "" : cur.t === null ? sayAt(timeline[latest]) : cursor === null ? "" : sayAt(timeline[cursor]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", "Escape"].includes(e.key)) return;
    e.preventDefault();
    moveTo(stepCursor(cursor, e.key, e.shiftKey, timeline.length, latest), true);
  };
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    const scale = rect && rect.width > 0 ? W / rect.width : 1;
    const pxX = (e.clientX - (rect?.left ?? 0)) * scale;
    moveTo(nearestTimeIndex(timeline, x0 + ((pxX - frame.ml) / iw) * (x1 - x0)), false);
  };

  // End labels: de-overlapped at least END_GAP apart, each carrying the series name.
  const ends = plotted
    .map((p) => {
      let lastIdx = p.model.obs.length - 1;
      while (p.model.obs[lastIdx].s === null) lastIdx -= 1;
      const o = p.model.obs[lastIdx];
      return { p, o, y: y(o.n as number), ty: y(o.n as number) };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) if (ends[i].ty - ends[i - 1].ty < END_GAP) ends[i].ty = ends[i - 1].ty + END_GAP;

  const spans = plotted.flatMap((p) => gapSpans(p.model, x));
  const summaryId = `${id}-sum`;
  const readoutId = `${id}-rd`;
  const clip = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name);

  return (
    <figure className="exec-chart exec-compare" data-state={state.kind}>
      <figcaption className="exec-c2-head">
        <span className="exec-c2-title">{label}</span>
        <ChartStateFlags state={state} />
      </figcaption>
      <ul className="exec-c2-legend">
        {plotted.map((p) => (
          <li key={p.c.id}><i className="exec-c2-sw" data-s={TONES[p.k]} data-dash-k={p.k} />{p.c.label}</li>
        ))}
      </ul>
      {excludedList}
      <div className="exec-c2-readout" id={readoutId}>
        <span><span className="exec-c2-ru">{timeOf(at)}</span></span>
        {plotted.map((p) => {
          const v = valueAt(p, at);
          return (
            <span key={p.c.id}>
              <i className="exec-c2-sw" data-s={TONES[p.k]} data-dash-k={p.k} />
              <span className="exec-c2-ru">{p.c.label}</span>
              <b className="exec-c2-rv" data-testid="compare-value">{v !== null ? show(v) : "No point at this time"}</b>
            </span>
          );
        })}
      </div>
      <div
        ref={plotRef}
        className="exec-c2-plot"
        role="group"
        tabIndex={0}
        aria-label={`${label}. Left and right arrow keys move the readout, Shift moves ten points, Home and End jump to the ends, Escape releases it.`}
        aria-describedby={readoutId}
        onKeyDown={onKey}
        onMouseMove={onMove}
        onMouseLeave={() => moveTo(null, false)}
      >
        <svg className="exec-c2-svg" viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="img" aria-label={`${label}, ${plotted.map((p) => p.c.label).join(", ")}`} aria-describedby={summaryId}>
          <defs>
            <clipPath id={`${id}-clip`}><rect x={frame.ml} y={frame.top - 4} width={iw} height={frame.bottom - frame.top + 8} /></clipPath>
            <pattern id={`${id}-hgap`} className="exec-c2-pat" data-s="gap" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" /></pattern>
          </defs>
          <YAxis frame={frame} ticks={ticks} y={y} unit={unit} />
          <XAxis frame={frame} from={x0} to={x1} />
          {spans.length > 0 ? <path className="exec-c2-gaps" d={gapRectsPath(spans, frame.top, frame.bottom)} fill={`url(#${id}-hgap)`} data-testid="gaps" /> : null}
          <g clipPath={`url(#${id}-clip)`}>
            {plotted.map((p, i) => (
              <path key={p.c.id} className="exec-c2-line" data-s={TONES[p.k]} data-main="true" strokeDasharray={DASHES[p.k] || undefined} d={linePath(reducedRuns[i], x, y)} data-testid="compare-line" />
            ))}
          </g>
          {ends.map(({ p, o, y: yy, ty }) => {
            const text = `${clip(p.c.label)}  ${show(o.s as string)}`;
            const w = text.length * 6.8 + 16;
            return (
              <g key={p.c.id} className="exec-c2-endtag" data-s={TONES[p.k]} data-testid="end-tag">
                <title>{`${p.c.label} ${show(o.s as string)}`}</title>
                <line x1={x(o.t) + 5} x2={W - frame.mr + 8} y1={yy} y2={ty} />
                <g className="exec-c2-marker">{marker(MARKERS[p.k], x(o.t), yy)}</g>
                <rect className="exec-c2-endbox" x={W - frame.mr + 8} y={ty - 11} width={w} height={22} />
                <text x={W - frame.mr + 16} y={ty + 4}>{text}</text>
              </g>
            );
          })}
          {cursor !== null ? (
            <g className="exec-c2-cursor" data-testid="cursor">
              <line x1={x(at)} x2={x(at)} y1={frame.top} y2={frame.bottom} />
              {plotted.map((p) => {
                const v = valueAt(p, at);
                const i = nearestIndex(p.model.obs, at);
                return v !== null ? <circle key={p.c.id} cx={x(at)} cy={y(p.model.obs[i].n as number)} r={5} /> : null;
              })}
            </g>
          ) : null}
        </svg>
      </div>
      <p className="exec-c2-basis" data-testid="basis">{`Basis: ${basis}`}</p>
      <p className="exec-c2-envelope" data-testid="envelope">{envelopeCaption(envelope, gapCount, unreadable)}</p>
      <div className="exec-c2-sr" id={summaryId}>
        <p>{`${label}. Basis: ${basis}. ${plotted.length} series on one axis.`}</p>
        <table>
          <caption>{`Latest values, ${label}`}</caption>
          <thead><tr><th scope="col">Series</th><th scope="col">Latest (UTC)</th><th scope="col">Value</th></tr></thead>
          <tbody>
            {ends.map(({ p, o }) => (
              <tr key={p.c.id}><th scope="row">{p.c.label}</th><td>{timeOf(o.t)}</td><td>{show(o.s as string)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="exec-c2-sr" role="status" aria-live="polite">{announce}</div>
    </figure>
  );
}
