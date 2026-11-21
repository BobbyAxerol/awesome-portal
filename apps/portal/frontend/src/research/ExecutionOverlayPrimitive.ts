/**
 * Screen 08 · the canvas painter for the engine journal's overlay (`executionOverlay.ts` is the model).
 *
 * A lightweight-charts series primitive, so the drawing shares the chart's own coordinates, zoom and repaint — nothing is positioned in
 * the DOM. Two layers: UNDER the candles the quiet washes (bracket zones, the entry baseline); OVER them the edges, the price chips,
 * the trade links and the fills. Everything is thin, small and tied to a price: 8 px triangles with a surface halo, 1 px lines, one
 * 15 px chip per bracket edge. Text is drawn in text tokens; a colour only fills the mark beside it (a chip is the one filled label,
 * its text the surface colour).
 */

import type { IChartApi, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, Time } from "lightweight-charts";

import { withAlpha } from "../styles/tokens";
import { barIndexClamped, type Overlay, type OverlayBracket, type OverlayLeg } from "./executionOverlay";

export interface OverlayPalette {
  ink: string;
  inkSoft: string;
  inkFaint: string;
  accent: string;
  good: string;
  bad: string;
  surface: string;
}

interface BitmapScope {
  context: CanvasRenderingContext2D;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  mediaSize: { width: number; height: number };
}
interface Target {
  useBitmapCoordinateSpace: <T>(fn: (scope: BitmapScope) => T) => T;
}

const FONT = "10px ui-monospace, 'JetBrains Mono', SFMono-Regular, Menlo, monospace";
const LABEL_FONT = "9.5px ui-monospace, 'JetBrains Mono', SFMono-Regular, Menlo, monospace";
/** Labels beside fills are drawn only while few fills are in view; past that the glyphs alone stay (the readout carries the values). */
const MAX_LABELLED_FILLS = 14;

const priceText = (value: number) => value.toLocaleString("en-US", value >= 1000 ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const withdrawn = (leg: OverlayLeg) => leg.state === "canceled" || leg.state === "expired" || leg.state === "rejected";

export class ExecutionOverlayPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private requestUpdate: (() => void) | null = null;
  private model: Overlay = { fills: [], entries: [], brackets: [], links: [] };
  private bars: readonly { at_utc_ms: number }[] = [];
  private palette: OverlayPalette | null = null;

  private readonly under = { zOrder: () => "bottom" as const, renderer: () => ({ draw: (target: unknown) => (target as Target).useBitmapCoordinateSpace((scope) => this.paintUnder(scope)) }) };
  private readonly over = { zOrder: () => "top" as const, renderer: () => ({ draw: (target: unknown) => (target as Target).useBitmapCoordinateSpace((scope) => this.paintOver(scope)) }) };
  private readonly views = [this.under, this.over] as unknown as ReturnType<NonNullable<ISeriesPrimitive<Time>["paneViews"]>>;

  setData(model: Overlay, bars: readonly { at_utc_ms: number }[], palette: OverlayPalette): void {
    this.model = model;
    this.bars = bars;
    this.palette = palette;
    this.requestUpdate?.();
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  updateAllViews(): void {
    /* every paint reads the model and the chart's coordinates afresh */
  }

  paneViews() {
    return this.views;
  }

  private x(ms: number): number | null {
    if (this.chart === null || this.bars.length === 0) return null;
    return this.chart.timeScale().logicalToCoordinate(barIndexClamped(this.bars, ms) as Logical);
  }

  private y(price: number): number | null {
    return this.series === null ? null : this.series.priceToCoordinate(price);
  }

  private box(bracket: OverlayBracket): { x0: number; x1: number } | null {
    const x0 = this.x(bracket.startMs);
    const x1 = this.x(bracket.endMs ?? this.bars[this.bars.length - 1]!.at_utc_ms);
    if (x0 === null || x1 === null) return null;
    return { x0, x1: Math.max(x1, x0 + 6) };
  }

  private tint(leg: OverlayLeg, p: OverlayPalette): string {
    return leg.side === "adverse" ? p.bad : leg.side === "favourable" ? p.good : p.inkFaint;
  }

  private paintUnder(scope: BitmapScope): void {
    const p = this.palette;
    if (p === null) return;
    const { context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr } = scope;
    c.save();
    c.setTransform(hr, 0, 0, vr, 0, 0);
    for (const bracket of this.model.brackets) {
      const box = this.box(bracket);
      const yEntry = bracket.entryPrice === null ? null : this.y(bracket.entryPrice);
      if (box === null || yEntry === null) continue;
      for (const leg of bracket.legs) {
        const yLeg = this.y(leg.level);
        if (yLeg === null) continue;
        /* a wash between the entry and the leg: strong for the leg that traded, a whisper for a withdrawn one */
        c.fillStyle = withAlpha(this.tint(leg, p), withdrawn(leg) ? 0.05 : 0.10);
        c.fillRect(box.x0, Math.min(yEntry, yLeg), box.x1 - box.x0, Math.abs(yLeg - yEntry));
      }
      c.strokeStyle = withAlpha(p.accent, 0.5);
      c.lineWidth = 1;
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(box.x0, yEntry);
      c.lineTo(box.x1, yEntry);
      c.stroke();
    }
    c.restore();
  }

  private paintOver(scope: BitmapScope): void {
    const p = this.palette;
    if (p === null || this.chart === null) return;
    const { context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr } = scope;
    c.save();
    c.setTransform(hr, 0, 0, vr, 0, 0);

    /* entry limit orders: a thin working line to the fill; faded and dashed when the order never traded */
    for (const entry of this.model.entries) {
      const x0 = this.x(entry.startMs);
      const x1 = this.x(entry.endMs ?? this.bars[this.bars.length - 1]!.at_utc_ms);
      const y = this.y(entry.level);
      if (x0 === null || x1 === null || y === null || x1 <= x0) continue;
      c.strokeStyle = entry.state === "filled" ? withAlpha(p.accent, 0.75) : withAlpha(p.inkFaint, 0.7);
      c.lineWidth = 1;
      c.setLineDash(entry.state === "filled" ? [] : [3, 3]);
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.stroke();
    }

    /* bracket edges and their price chips */
    c.font = FONT;
    c.textBaseline = "middle";
    for (const bracket of this.model.brackets) {
      const box = this.box(bracket);
      if (box === null) continue;
      for (const leg of bracket.legs) {
        const y = this.y(leg.level);
        if (y === null) continue;
        const color = this.tint(leg, p);
        const faded = withdrawn(leg);
        c.strokeStyle = faded ? withAlpha(color, 0.6) : color;
        c.lineWidth = faded ? 1 : 1.5;
        c.setLineDash(faded ? [3, 3] : []);
        c.beginPath();
        c.moveTo(box.x0, y);
        c.lineTo(box.x1, y);
        c.stroke();
        c.setLineDash([]);
        /* a box cut by the page edge says so: a small chevron where the edge runs on */
        c.lineWidth = 1.5;
        if (bracket.continuesRight) {
          c.beginPath();
          c.moveTo(box.x1 - 4, y - 3.5);
          c.lineTo(box.x1, y);
          c.lineTo(box.x1 - 4, y + 3.5);
          c.stroke();
        }
        if (bracket.continuesLeft) {
          c.beginPath();
          c.moveTo(box.x0 + 4, y - 3.5);
          c.lineTo(box.x0, y);
          c.lineTo(box.x0 + 4, y + 3.5);
          c.stroke();
        }
        const text = `${leg.word} ${priceText(leg.level)}`;
        const width = c.measureText(text).width + 10;
        if (box.x1 - box.x0 < width + 12) continue;
        const cy = leg.side === "adverse" ? y + 10 : y - 10;
        const left = box.x1 - width - 2;
        c.beginPath();
        c.roundRect(left, cy - 7.5, width, 15, 3);
        if (faded) {
          c.fillStyle = withAlpha(p.surface, 0.9);
          c.fill();
          c.strokeStyle = withAlpha(color, 0.55);
          c.lineWidth = 1;
          c.stroke();
        } else {
          c.fillStyle = color;
          c.fill();
        }
        /* text on a filled chip wears the surface colour: light on the dark-theme-light fill and dark on the light-theme-dark fill — never a literal */
        c.fillStyle = faded ? p.inkSoft : p.surface;
        c.textAlign = "left";
        c.fillText(text, left + 5, cy + 0.5);
      }
    }

    /* explicit trade links: a dotted path from an entry fill to the fill that names it as its parent */
    c.strokeStyle = withAlpha(p.accent, 0.6);
    c.lineWidth = 1;
    c.setLineDash([1, 3]);
    for (const link of this.model.links) {
      const xa = this.x(link.fromMs);
      const xb = this.x(link.toMs);
      const ya = this.y(link.fromPrice);
      const yb = this.y(link.toPrice);
      if (xa === null || xb === null || ya === null || yb === null) continue;
      c.beginPath();
      c.moveTo(xa, ya);
      c.lineTo(xb, yb);
      c.stroke();
    }
    c.setLineDash([]);

    /* fills: one small triangle each, tip at the price, with a surface halo; a short label while few are in view */
    const range = this.chart.timeScale().getVisibleLogicalRange();
    const inView = this.model.fills.filter((fill) => {
      const i = barIndexClamped(this.bars, fill.atMs);
      return range === null || (i >= range.from - 1 && i <= range.to + 1);
    });
    const labelled = inView.length <= MAX_LABELLED_FILLS;
    c.font = LABEL_FONT;
    c.textAlign = "center";
    for (const fill of inView) {
      const x = this.x(fill.atMs);
      const y = this.y(fill.price);
      if (x === null || y === null) continue;
      const up = fill.direction !== "sell";
      const tip = up ? y + 2 : y - 2;
      const base = up ? y + 9 : y - 9;
      c.beginPath();
      c.moveTo(x, tip);
      c.lineTo(x - 4, base);
      c.lineTo(x + 4, base);
      c.closePath();
      c.lineJoin = "round";
      c.lineWidth = 3;
      c.strokeStyle = p.surface;
      c.stroke();
      c.fillStyle = fill.direction === "unknown" ? p.inkFaint : p.accent;
      c.fill();
      if (labelled) {
        /* the label is a small pill, so it reads over candles instead of sinking into them; it stays inside the plot and
           flips to the other side of the glyph when its own side has no room */
        const width = c.measureText(fill.label).width + 10;
        const room = scope.mediaSize;
        let cy = up ? base + 12 : base - 12;
        if (cy - 7 < 2) cy = Math.max(base, y) + 12;
        else if (cy + 7 > room.height - 2) cy = Math.min(base, y) - 12;
        const left = Math.max(2, Math.min(room.width - width - 2, x - width / 2));
        c.beginPath();
        c.roundRect(left, cy - 7, width, 14, 3);
        c.fillStyle = withAlpha(p.surface, 0.94);
        c.fill();
        c.lineWidth = 1;
        c.strokeStyle = withAlpha(p.inkFaint, 0.4);
        c.stroke();
        c.textBaseline = "middle";
        c.fillStyle = p.ink;
        c.fillText(fill.label, left + width / 2, cy + 0.5);
      }
    }
    c.restore();
  }
}
