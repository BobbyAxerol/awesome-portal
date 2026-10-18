/**
 * EquityPanel · one value series over time (equity, PnL, return) in pure SVG.
 *
 * What it will not do: join a gap, smooth an extremum, print a digit that is
 * not in the published string, or draw a plot when there is nothing to plot.
 * See the barrel (`index.ts`) for the prop contract.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent } from "react";

import "../css/charts.css";
import type { ExactUnit } from "../../formatExact";
import { formatAsOf } from "../boundary";
import { ChartStateFlags, ChartUnavailable } from "./ChartStateView";
import { compareDecimal, readChartDecimal, showDecimal, subtractDecimal, toGeometry } from "./decimal";
import { envelopeCaption, reduceRun, bucketSizeFor, type Envelope } from "./downsample";
import { EVENT_KIND_TABLE } from "./eventKinds";
import { CHART_MARGIN, useChartId, useElementWidth } from "./hooks";
import { buildSeries, domainOfSeries, nearestIndex, runsOf, splitByKind, stepCursor, type KindRun, type SeriesModel } from "./model";
import { areaPath, gapRectsPath, gapSpans, linePath, XAxis, YAxis, type Frame } from "./plotParts";
import { linear, niceTicks } from "./scale";
import type { ChartDomain, ChartEvent, ChartSegment, ChartState, FlowPin, SeriesPoint, ServerEnvelope, UtcEpochMs } from "./types";

export type DrawdownInput =
  | { readonly kind: "series"; readonly points: readonly SeriesPoint[] }
  | { readonly kind: "absent"; readonly copy: string; readonly reason?: string };

export interface EquityPanelProps {
  /** Visible heading and accessible name. */
  label: string;
  /** Observations in strictly increasing time order; `v: null` is a gap. */
  points: readonly SeriesPoint[];
  /** Legend and readout name of the series. Defaults to `label`. */
  seriesName?: string;
  /** Display class for every value label. Default `money`. */
  unit?: ExactUnit;
  /** Appended to readout values, e.g. `USDT`. */
  currency?: string;
  /** Prefix `+` on positive labels (use for PnL and return). */
  signed?: boolean;
  /** `unavailable` prints the caller's copy and draws no series; `partial` and `stale` still draw and wear a Flag. */
  state?: ChartState;
  /** Shared window. Pass the same value to `EventRibbon` to line the two up. Defaults to the series extent. */
  domain?: ChartDomain;
  /** Expected spacing in ms. A larger gap between two points breaks the line instead of joining them. */
  intervalMs?: number;
  /** A second series on the same axes (for example a paper twin), drawn dashed in the simulated colour. */
  ghost?: { readonly name: string; readonly points: readonly SeriesPoint[] };
  /** Approved band as exact decimals. */
  band?: { readonly name?: string; readonly lo: string; readonly hi: string };
  /** Spans drawn hatched and worded: simulated or retained data. */
  segments?: readonly ChartSegment[];
  /**
   * Drawdown pane. `series` is the published drawdown in percent (<= 0); `absent` prints the
   * caller's copy ("Not published (FE-xxx)"). Omit to show no pane. Drawdown is never derived here.
   */
  drawdown?: DrawdownInput;
  /** Capital movements drawn as signed pins on the plot (the first 24; the caption counts the rest). */
  flows?: readonly FlowPin[];
  /** Marks on the top strip (the first 40; the caption counts the rest). Use `EventRibbon` for the full list. */
  events?: readonly ChartEvent[];
  /** What the server already reduced, repeated verbatim in the envelope caption. */
  serverEnvelope?: ServerEnvelope;
  /** Main plot height in px. Default 280. */
  height?: number;
  /** Rendered between the readout and the plot, for an `EventRibbon`. */
  ribbon?: ReactNode;
}

const DD_HEIGHT = 84;
const DD_GAP = 22;
const MAX_PINS = 24;
const MAX_MARKS = 40;
const charW = 6.6;

function latestDrawable(model: SeriesModel): number {
  for (let i = model.obs.length - 1; i >= 0; i -= 1) if (model.obs[i].s !== null) return i;
  return -1;
}
function firstDrawable(model: SeriesModel): number {
  for (let i = 0; i < model.obs.length; i += 1) if (model.obs[i].s !== null) return i;
  return -1;
}

function reduceKindRuns(runs: readonly KindRun[], budget: number): { runs: KindRun[]; envelope: Envelope } {
  const sourceCount = runs.reduce((sum, r) => sum + r.marks.length, 0);
  const bucket = bucketSizeFor(sourceCount, budget);
  const out = runs.map((r) => ({ kind: r.kind, marks: reduceRun(r.marks, bucket) }));
  const shownCount = out.reduce((sum, r) => sum + r.marks.length, 0);
  return { runs: out, envelope: { sourceCount, shownCount, bucket, reduced: shownCount < sourceCount } };
}

function sameTime(model: SeriesModel | null, t: number): number {
  if (model === null) return -1;
  const i = nearestIndex(model.obs, t);
  return i >= 0 && model.obs[i].t === t ? i : -1;
}

export function EquityPanel(props: EquityPanelProps) {
  const {
    label, points, unit = "money", currency, signed = false, state = { kind: "ready" }, intervalMs, ghost, band,
    segments = [], drawdown, flows = [], events = [], serverEnvelope, height = 280, ribbon,
  } = props;
  const seriesName = props.seriesName ?? label;
  const id = useChartId("exec-eq");
  const plotRef = useRef<HTMLDivElement | null>(null);
  const W = useElementWidth(plotRef);
  const [cursor, setCursor] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  const model = useMemo(() => buildSeries(points, unit, intervalMs), [points, unit, intervalMs]);
  const ghostModel = useMemo(() => (ghost ? buildSeries(ghost.points, unit, intervalMs) : null), [ghost, unit, intervalMs]);
  const ddModel = useMemo(
    () => (drawdown?.kind === "series" ? buildSeries(drawdown.points, "pct", intervalMs) : null),
    [drawdown, intervalMs],
  );

  if (state.kind === "unavailable") return <ChartUnavailable label={label} copy={state.copy} reason={state.reason} height={height} />;
  if (!model.ordered || (ghostModel && !ghostModel.ordered) || (ddModel && !ddModel.ordered)) {
    return <ChartUnavailable label={label} copy="Not available" reason="Points are not in strictly increasing time order, so the series was not drawn." height={height} />;
  }
  if (model.drawable === 0) {
    return <ChartUnavailable label={label} copy="Not available" reason="No published value in this window." height={height} />;
  }

  const own = domainOfSeries(points) as ChartDomain;
  const domain: ChartDomain = props.domain ?? own;
  const x0 = domain.from as number;
  const x1 = domain.to as number;

  const hasDd = drawdown !== undefined;
  const ddH = hasDd ? DD_HEIGHT : 0;
  const gap = hasDd ? DD_GAP : 0;
  const frame: Frame = { W, ml: CHART_MARGIN.l, mr: CHART_MARGIN.r, top: CHART_MARGIN.t, bottom: height - CHART_MARGIN.b };
  const iw = W - frame.ml - frame.mr;
  const ih = frame.bottom - frame.top;
  const x = linear(x0, x1, frame.ml, frame.ml + iw);

  // y range: series, ghost, band, then 10% air, then round ticks.
  let lo = model.min as number;
  let hi = model.max as number;
  if (ghostModel && ghostModel.min !== null && ghostModel.max !== null) {
    lo = Math.min(lo, ghostModel.min);
    hi = Math.max(hi, ghostModel.max);
  }
  const bandLo = band ? readChartDecimal(band.lo, unit) : null;
  const bandHi = band ? readChartDecimal(band.hi, unit) : null;
  const bandOk = bandLo !== null && bandHi !== null && compareDecimal(bandLo, bandHi) <= 0;
  if (bandOk) {
    lo = Math.min(lo, toGeometry(bandLo));
    hi = Math.max(hi, toGeometry(bandHi));
  }
  const air = (hi - lo) * 0.1;
  const ticks = niceTicks(lo - air, hi + air, 4);
  const y = linear(ticks.lo, ticks.hi, frame.bottom, frame.top);

  const budget = Math.max(64, Math.floor(iw));
  const { runs: kindRuns, envelope } = reduceKindRuns(splitByKind(runsOf(model), segments), budget);
  const actualRuns = kindRuns.filter((r) => r.kind === "actual").map((r) => r.marks);
  const simRuns = kindRuns.filter((r) => r.kind === "simulated").map((r) => r.marks);
  const retRuns = kindRuns.filter((r) => r.kind === "retained").map((r) => r.marks);
  const allRuns = kindRuns.map((r) => r.marks);
  const ghostRuns = ghostModel ? reduceKindRuns(runsOf(ghostModel).map((m) => ({ kind: "actual" as const, marks: m })), budget).runs.map((r) => r.marks) : [];

  const spans = gapSpans(model, x);
  const loIdx = model.low;
  const hiIdx = model.high;
  const last = latestDrawable(model);
  const first = firstDrawable(model);

  const show = (s: string, signedLabel = signed) => showDecimal(s, { unit, signed: signedLabel, currency });
  const timeOf = (t: number) => formatAsOf(t as UtcEpochMs);

  // Cursor and readout.
  const idx = cursor ?? last;
  const o = model.obs[idx];
  const dd = ddModel && sameTime(ddModel, o.t) >= 0 ? ddModel.obs[sameTime(ddModel, o.t)] : null;
  const gh = ghostModel && sameTime(ghostModel, o.t) >= 0 ? ghostModel.obs[sameTime(ghostModel, o.t)] : null;
  const readoutValue = o.s !== null ? show(o.s) : o.bad ? "Unreadable value" : "No published value at this time";
  const change = o.s !== null && first >= 0 && model.obs[first].s !== null ? show(subtractDecimal(o.s, model.obs[first].s as string), true) : null;
  const ddText = drawdown === undefined ? null : drawdown.kind === "absent" ? drawdown.copy : dd?.s ? showDecimal(dd.s, { unit: "pct" }) : "No published value at this time";
  const ghostText = ghost === undefined ? null : gh?.s ? show(gh.s) : "No point at this time";

  const moveTo = (next: number | null, announceIt: boolean) => {
    setCursor(next);
    if (announceIt) {
      const at = model.obs[next ?? last];
      const v = at.s !== null ? show(at.s) : "no published value";
      setAnnounce(`${timeOf(at.t)}, ${v}`);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", "Escape"].includes(e.key)) return;
    e.preventDefault();
    moveTo(stepCursor(cursor, e.key, e.shiftKey, model.obs.length, last), true);
  };
  const fromClientX = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    const scale = rect && rect.width > 0 ? W / rect.width : 1;
    const pxX = (clientX - (rect?.left ?? 0)) * scale;
    const t = x0 + ((pxX - frame.ml) / iw) * (x1 - x0);
    moveTo(nearestIndex(model.obs, t), false);
  };
  const onMove = (e: MouseEvent<HTMLDivElement>) => fromClientX(e.clientX);
  const onTouch = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) fromClientX(e.touches[0].clientX);
  };

  const cx = x(o.t);
  const cursorVisible = cursor !== null;

  // Flag boxes for the high and the low.
  const flagBox = (index: number, text: string, up: boolean) => {
    const ob = model.obs[index];
    const xx = x(ob.t);
    const yy = y(ob.n as number);
    const w = text.length * charW + 12;
    const ty = up ? yy - 22 : yy + 22;
    const gx = Math.max(frame.ml, Math.min(frame.W - frame.mr - w, xx - w / 2));
    return { xx, yy, w, ty, gx, text, up };
  };
  const flags: ReturnType<typeof flagBox>[] = [];
  if (hiIdx && loIdx && compareDecimal(hiIdx.s, loIdx.s) !== 0) {
    if (hiIdx.index !== last) flags.push(flagBox(hiIdx.index, `High ${show(hiIdx.s)}`, true));
    if (loIdx.index !== first) flags.push(flagBox(loIdx.index, `Low ${show(loIdx.s)}`, false));
  }

  const inDomain = (t: number) => t >= x0 && t <= x1;
  const pins = flows.filter((f) => inDomain(f.t) && readChartDecimal(f.value, "money") !== null);
  const drawnPins = pins.slice(0, MAX_PINS);
  const evs = events.filter((e) => inDomain(e.t));
  const drawnEvs = evs.slice(0, MAX_MARKS);

  const ddTop = height + gap;
  const dd0 = ddModel ? Math.min(0, ddModel.min as number) : 0;
  const ddY = linear(dd0 === 0 ? -1 : dd0 * 1.12, 0, ddTop + ddH, ddTop);
  const ddRuns = ddModel ? reduceKindRuns(runsOf(ddModel).map((m) => ({ kind: "actual" as const, marks: m })), budget).runs.map((r) => r.marks) : [];

  const endLabel = show(model.obs[last].s as string);
  const endY = y(model.obs[last].n as number);
  const endW = endLabel.length * 7.4 + 16;

  const segDraw = segments
    .map((s, k) => ({ s, k, a: Math.max(x(s.from), frame.ml), b: Math.min(x(s.to), frame.ml + iw) }))
    .filter((d) => d.b > d.a);

  const caption = envelopeCaption(envelope, model.gaps, model.unreadable);
  const hiddenPins = pins.length - drawnPins.length;
  const hiddenEvs = evs.length - drawnEvs.length;

  const summaryId = `${id}-sum`;
  const readoutId = `${id}-rd`;
  const keyRows: { name: string; t: number; v: string }[] = [];
  if (first >= 0) keyRows.push({ name: "First", t: model.obs[first].t, v: model.obs[first].s as string });
  if (hiIdx) keyRows.push({ name: "High", t: model.obs[hiIdx.index].t, v: hiIdx.s });
  if (loIdx) keyRows.push({ name: "Low", t: model.obs[loIdx.index].t, v: loIdx.s });
  if (last >= 0) keyRows.push({ name: "Latest", t: model.obs[last].t, v: model.obs[last].s as string });

  const summary =
    `${label}. ${model.drawable.toLocaleString("en-US")} published points from ${timeOf(x0)} to ${timeOf(x1)}. ` +
    `Latest ${show(model.obs[last].s as string)}.` +
    (hiIdx && loIdx ? ` High ${show(hiIdx.s)} at ${timeOf(model.obs[hiIdx.index].t)}. Low ${show(loIdx.s)} at ${timeOf(model.obs[loIdx.index].t)}.` : "") +
    (model.gaps > 0 ? ` ${model.gaps} ${model.gaps === 1 ? "gap" : "gaps"} with no published value.` : "") +
    (envelope.reduced ? ` Drawn from ${envelope.shownCount} of ${envelope.sourceCount} points, minimum and maximum kept.` : "");

  return (
    <figure className="exec-chart exec-equity" data-state={state.kind} data-reduced={envelope.reduced ? "true" : "false"}>
      <figcaption className="exec-chart-head">
        <span className="exec-chart-title">{label}</span>
        <ChartStateFlags state={state} />
      </figcaption>

      <ul className="exec-chart-legend">
        <li><i className="exec-chart-sw" data-s="series" />{seriesName}</li>
        {ghost ? <li><i className="exec-chart-sw" data-s="sim" data-dash="true" />{ghost.name}</li> : null}
        {segments.some((s) => s.kind === "simulated") ? <li><i className="exec-chart-sw" data-s="sim" data-hatch="true" />Simulated</li> : null}
        {segments.some((s) => s.kind === "retained") ? <li><i className="exec-chart-sw" data-s="retained" data-hatch="true" />Retained</li> : null}
        {bandOk ? <li><i className="exec-chart-sw" data-s="band" data-dash="true" />{band?.name ?? "Approved band"}</li> : null}
        {spans.length > 0 ? <li><i className="exec-chart-sw" data-s="gap" data-hatch="true" />No published value</li> : null}
      </ul>

      <div className="exec-chart-readout" id={readoutId}>
        <span><span className="exec-chart-ru" data-testid="readout-time">{timeOf(o.t)}</span><b className="exec-chart-rv" data-testid="readout-value">{readoutValue}</b></span>
        {change !== null ? <span><span className="exec-chart-ru">Change in window</span><span data-testid="readout-change">{change}</span></span> : null}
        {ddText !== null ? <span><span className="exec-chart-ru">Drawdown</span><span data-testid="readout-drawdown">{ddText}</span></span> : null}
        {ghostText !== null ? <span><span className="exec-chart-ru">{ghost?.name}</span><span data-testid="readout-ghost">{ghostText}</span></span> : null}
      </div>

      {ribbon}

      <div
        ref={plotRef}
        className="exec-chart-plot"
        role="group"
        tabIndex={0}
        aria-label={`${label}. Left and right arrow keys move the readout, Shift moves ten points, Home and End jump to the ends, Escape releases it.`}
        aria-describedby={readoutId}
        onKeyDown={onKey}
        onMouseMove={onMove}
        onMouseLeave={() => moveTo(null, false)}
        onTouchMove={onTouch}
        onTouchEnd={() => moveTo(null, false)}
      >
        <svg
          className="exec-chart-svg"
          viewBox={`0 0 ${W} ${height + gap + ddH}`}
          width={W}
          height={height + gap + ddH}
          role="img"
          aria-label={label}
          aria-describedby={summaryId}
        >
          <defs>
            <clipPath id={`${id}-clip`}><rect x={frame.ml} y={frame.top - 12} width={iw} height={ih + 12} /></clipPath>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop className="exec-chart-area-top" offset="0%" />
              <stop className="exec-chart-area-bottom" offset="100%" />
            </linearGradient>
            <pattern id={`${id}-hsim`} className="exec-chart-pat" data-s="sim" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" /></pattern>
            <pattern id={`${id}-hret`} className="exec-chart-pat" data-s="retained" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="7" /></pattern>
            <pattern id={`${id}-hgap`} className="exec-chart-pat" data-s="gap" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" /></pattern>
          </defs>

          <YAxis frame={frame} ticks={ticks} y={y} unit={unit} />
          <XAxis frame={frame} from={x0} to={x1} />

          {bandOk ? (
            <g className="exec-chart-band" data-testid="band">
              <rect x={frame.ml} y={y(toGeometry(bandHi))} width={iw} height={Math.max(y(toGeometry(bandLo)) - y(toGeometry(bandHi)), 1)} />
              <line x1={frame.ml} x2={frame.ml + iw} y1={y(toGeometry(bandHi))} y2={y(toGeometry(bandHi))} />
              <line x1={frame.ml} x2={frame.ml + iw} y1={y(toGeometry(bandLo))} y2={y(toGeometry(bandLo))} />
            </g>
          ) : null}

          {segDraw.map((d) => (
            <g key={`${d.s.kind}-${d.k}`} className="exec-chart-seg" data-kind={d.s.kind}>
              <rect x={d.a} y={frame.top} width={d.b - d.a} height={ih} fill={`url(#${id}-${d.s.kind === "simulated" ? "hsim" : "hret"})`} />
              <text x={d.a + 8} y={frame.top + 14} className="exec-chart-seg-label">{d.s.label ?? (d.s.kind === "simulated" ? "Simulated" : "Retained")}</text>
            </g>
          ))}

          {spans.length > 0 ? <path className="exec-chart-gaps" d={gapRectsPath(spans, frame.top, frame.bottom)} fill={`url(#${id}-hgap)`} data-testid="gaps" /> : null}

          <g clipPath={`url(#${id}-clip)`}>
            <path className="exec-chart-area" d={areaPath(allRuns, x, y, frame.bottom)} fill={`url(#${id}-area)`} />
            {ghostRuns.length > 0 ? <path className="exec-chart-line" data-s="sim" data-dash="true" d={linePath(ghostRuns, x, y)} data-testid="ghost-line" /> : null}
            {retRuns.length > 0 ? <path className="exec-chart-line" data-s="retained" data-dash="true" d={linePath(retRuns, x, y)} data-testid="retained-line" /> : null}
            {simRuns.length > 0 ? <path className="exec-chart-line" data-s="sim" data-dash="true" d={linePath(simRuns, x, y)} data-testid="simulated-line" /> : null}
            <path className="exec-chart-line" data-s="series" data-main="true" d={linePath(actualRuns, x, y)} data-testid="series-line" />
          </g>

          {flags.map((f) => (
            <g key={f.text} className="exec-chart-flag" data-testid={f.up ? "high-flag" : "low-flag"}>
              <line x1={f.xx} x2={f.xx} y1={f.yy} y2={f.ty + (f.up ? 14 : -14)} />
              <rect x={f.gx} y={f.ty - (f.up ? 0 : 14)} width={f.w} height={14} />
              <text x={f.gx + 6} y={f.ty - (f.up ? 0 : 14) + 11}>{f.text}</text>
              <circle cx={f.xx} cy={f.yy} r={3} />
            </g>
          ))}

          {drawnPins.map((p) => {
            const xx = x(p.t);
            const negative = p.value.startsWith("-");
            const text = showDecimal(p.value, { unit: "money", signed: true });
            const w = text.length * charW + 12;
            return (
              <g key={p.id} className="exec-chart-pin" data-neg={negative ? "true" : "false"} data-testid="flow-pin">
                <line x1={xx} x2={xx} y1={frame.bottom - 26} y2={frame.bottom} />
                <rect x={xx - w / 2} y={frame.bottom - 40} width={w} height={14} />
                <text x={xx} y={frame.bottom - 29} textAnchor="middle">{text}</text>
              </g>
            );
          })}

          {drawnEvs.map((e) => (
            <g key={e.id} className="exec-chart-evt" data-kind={e.kind} data-testid="event-mark">
              <line x1={x(e.t)} x2={x(e.t)} y1={frame.top - 2} y2={frame.bottom} />
              <text x={x(e.t)} y={frame.top - 8} textAnchor="middle">{EVENT_KIND_TABLE[e.kind].glyph}</text>
            </g>
          ))}

          <g className="exec-chart-end" data-testid="endpoint">
            <circle className="exec-chart-end-halo" cx={x(model.obs[last].t)} cy={endY} r={9} />
            <circle className="exec-chart-end-dot" cx={x(model.obs[last].t)} cy={endY} r={4.5} />
            <rect x={W - frame.mr + 8} y={endY - 11} width={endW} height={22} />
            <text x={W - frame.mr + 16} y={endY + 4}>{endLabel}</text>
          </g>

          {hasDd ? (
            <g className="exec-chart-dd" data-testid="drawdown-pane">
              <text className="exec-chart-pane-title" x={frame.ml} y={ddTop - 7}>Drawdown</text>
              <line className="exec-chart-grid" x1={frame.ml} x2={frame.ml + iw} y1={ddTop} y2={ddTop} />
              {ddModel && ddModel.drawable > 0 ? (
                <>
                  <path className="exec-chart-dd-area" d={areaPath(ddRuns, x, ddY, ddTop)} />
                  <path className="exec-chart-line" data-s="dd" d={linePath(ddRuns, x, ddY)} />
                  {ddModel.low ? (
                    <g className="exec-chart-dd-min">
                      <circle cx={x(ddModel.obs[ddModel.low.index].t)} cy={ddY(ddModel.obs[ddModel.low.index].n as number)} r={4} />
                      <text x={Math.min(x(ddModel.obs[ddModel.low.index].t) + 9, W - frame.mr - 34)} y={ddY(ddModel.obs[ddModel.low.index].n as number) + 4}>{showDecimal(ddModel.low.s, { unit: "pct" })}</text>
                    </g>
                  ) : null}
                </>
              ) : (
                <g className="exec-chart-dd-absent">
                  <rect x={frame.ml} y={ddTop} width={iw} height={ddH} fill={`url(#${id}-hgap)`} />
                  <text x={frame.ml + 10} y={ddTop + ddH / 2 + 4}>
                    {drawdown?.kind === "absent" ? `${drawdown.copy}${drawdown.reason ? ` · ${drawdown.reason}` : ""}` : "Not available · no published value in this window"}
                  </text>
                </g>
              )}
            </g>
          ) : null}

          {cursorVisible ? (
            <g className="exec-chart-cursor" data-testid="cursor">
              <line x1={cx} x2={cx} y1={frame.top} y2={height + gap + ddH} />
              {o.s !== null ? <circle cx={cx} cy={y(o.n as number)} r={5} /> : null}
            </g>
          ) : null}
        </svg>
      </div>

      <p className="exec-chart-envelope" data-testid="envelope">
        {caption}
        {serverEnvelope
          ? ` · Server: ${serverEnvelope.shownCount.toLocaleString("en-US")} of ${serverEnvelope.sourceCount.toLocaleString("en-US")} points, ${serverEnvelope.method}`
          : ""}
        {band && !bandOk ? " · Band not drawn: its bounds are unreadable" : ""}
        {hiddenPins > 0 ? ` · ${hiddenPins} more flow ${hiddenPins === 1 ? "pin" : "pins"} not drawn here` : ""}
        {hiddenEvs > 0 ? ` · ${hiddenEvs} more ${hiddenEvs === 1 ? "event" : "events"} not drawn here` : ""}
        {serverEnvelope && !serverEnvelope.keepsExtrema ? <> <ChartStateFlags state={{ kind: "partial", reason: "server reduction does not guarantee extrema" }} /></> : null}
      </p>

      <div className="exec-chart-sr" id={summaryId}>
        <p>{summary}</p>
        <table>
          <caption>{`Key readings, ${label}`}</caption>
          <thead><tr><th scope="col">Reading</th><th scope="col">Time (UTC)</th><th scope="col">Value</th></tr></thead>
          <tbody>
            {keyRows.map((r) => (
              <tr key={r.name}><th scope="row">{r.name}</th><td>{timeOf(r.t)}</td><td>{show(r.v)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="exec-chart-sr" role="status" aria-live="polite">{announce}</div>
    </figure>
  );
}
