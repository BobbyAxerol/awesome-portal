/**
 * The painter, locked without pixels: a recording canvas stands in for the real one and the chart's coordinates are stubbed, so the test
 * can say what is drawn, in which colour, at which price — the regression a screenshot cannot give without a baseline.
 */
import { describe, expect, it } from "vitest";
import { canvasTokens, withAlpha } from "../styles/tokens";

import { ExecutionOverlayPrimitive, type OverlayPalette } from "./ExecutionOverlayPrimitive";
import { buildOverlay } from "./executionOverlay";
import type { OrderTrack } from "./executionTracks";

const HOUR = 3_600_000;
const bars = Array.from({ length: 24 }, (_, i) => ({ at_utc_ms: i * HOUR }));
const T = canvasTokens("research");
const PALETTE: OverlayPalette = { ink: T.ink, inkSoft: T.inkSoft, inkFaint: T.inkFaint, accent: T.accent, good: T.good, bad: T.bad, surface: T.paperRaised };

interface Call { name: string; args: unknown[]; fill: string; stroke: string; width: number; dash: number[] }

function recorder() {
  const calls: Call[] = [];
  const state = { fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "", textBaseline: "", lineJoin: "" };
  let dash: number[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, key: string) {
      if (key in state) return (state as Record<string, unknown>)[key];
      if (key === "measureText") return (text: string) => ({ width: text.length * 6 });
      return (...args: unknown[]) => {
        if (key === "setLineDash") dash = args[0] as number[];
        calls.push({ name: key, args, fill: state.fillStyle, stroke: state.strokeStyle, width: state.lineWidth, dash });
      };
    },
    set(_t, key: string, value) {
      (state as Record<string, unknown>)[key] = value;
      return true;
    },
  });
  return { calls, ctx: ctx as unknown as CanvasRenderingContext2D };
}

function paint(model: ReturnType<typeof buildOverlay>, size = { width: 800, height: 400 }, range = { from: 0, to: 50 }) {
  const primitive = new ExecutionOverlayPrimitive();
  /* x = 10 + 20·index; y = 1000 − price, so a higher price is higher on the screen */
  primitive.attached({
    chart: { timeScale: () => ({ logicalToCoordinate: (i: number) => 10 + i * 20, getVisibleLogicalRange: () => range }) },
    series: { priceToCoordinate: (price: number) => 1000 - price },
    requestUpdate: () => undefined,
  } as never);
  primitive.setData(model, bars, PALETTE);
  const layers = primitive.paneViews() as unknown as { renderer: () => { draw: (target: unknown) => void } }[];
  const run = (layer: number) => {
    const { calls, ctx } = recorder();
    layers[layer]!.renderer().draw({ useBitmapCoordinateSpace: (fn: (scope: unknown) => unknown) => fn({ context: ctx, horizontalPixelRatio: 1, verticalPixelRatio: 1, mediaSize: size }) });
    return calls;
  };
  return { under: run(0), over: run(1) };
}

const track = (over: Partial<OrderTrack>): OrderTrack => ({
  orderId: "o", orderType: "limit", level: "100", levelKind: "price", reduceOnly: false, parentOrderId: null, ocoGroupId: null, activationPolicy: null,
  startMs: 0, endMs: null, state: "open", events: [], fillPrice: null, fillQty: null, ...over,
});

/* a SHORT entry at 100 (sell fill), stop above at 110 (cancelled), limit below at 90 (filled), index 2 → 10 */
const SHORT = [
  track({ orderId: "entry", level: "100", startMs: 2 * HOUR, endMs: 2 * HOUR, state: "filled", fillPrice: "100" }),
  track({ orderId: "sl", orderType: "stop_market", level: "110", levelKind: "trigger", reduceOnly: true, parentOrderId: "entry", ocoGroupId: "g", activationPolicy: "on_parent_full_fill", startMs: 2 * HOUR, endMs: 10 * HOUR, state: "canceled" }),
  track({ orderId: "tp", level: "90", reduceOnly: true, parentOrderId: "entry", ocoGroupId: "g", activationPolicy: "on_parent_full_fill", startMs: 2 * HOUR, endMs: 10 * HOUR, state: "filled", fillPrice: "90" }),
];
const FILLS = [
  { at_utc_ms: 2 * HOUR, price: "100", qty: "0.5", side: "sell", exit_reason: null, order_id: "entry" },
  { at_utc_ms: 10 * HOUR, price: "90", qty: "0.5", side: "buy", exit_reason: "take_profit", order_id: "tp" },
];

describe("the painter", () => {
  const model = buildOverlay(SHORT, FILLS, 0, 24 * HOUR);

  it("washes the zones under the candles: red above the entry to the stop, green below it to the limit, a whisper for the withdrawn leg", () => {
    const { under } = paint(model);
    const rects = under.filter((c) => c.name === "fillRect").map((c) => ({ y: c.args[1], h: c.args[3], fill: c.fill }));
    /* y(110)=890, y(100)=900, y(90)=910 */
    expect(rects).toEqual([
      { y: 890, h: 10, fill: withAlpha(PALETTE.bad, 0.05) },
      { y: 900, h: 10, fill: withAlpha(PALETTE.good, 0.1) },
    ]);
  });

  it("draws each leg's edge — solid and heavier for the leg that traded, faded and dashed for the cancelled one — with a price chip", () => {
    const { over } = paint(model);
    const strokes = over.filter((c) => c.name === "stroke");
    expect(strokes.some((c) => c.width === 1.5 && c.dash.length === 0 && c.stroke === PALETTE.good)).toBe(true);
    expect(strokes.some((c) => c.width === 1 && c.dash.join() === "3,3" && c.stroke === withAlpha(PALETTE.bad, 0.6))).toBe(true);
    const texts = over.filter((c) => c.name === "fillText").map((c) => c.args[0]);
    expect(texts).toContain("stop 110.00");
    expect(texts).toContain("limit 90.00");
  });

  it("paints one small triangle per fill with its short label, the exit word only where the source named it", () => {
    const { over } = paint(model);
    expect(over.filter((c) => c.name === "closePath")).toHaveLength(2);
    const texts = over.filter((c) => c.name === "fillText").map((c) => c.args[0]);
    expect(texts).toContain("sell 0.5");
    expect(texts).toContain("buy 0.5 · TP");
  });

  it("stops labelling when many fills are in view; the triangles stay", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ at_utc_ms: i * HOUR, price: String(100 + i), qty: "1", side: "buy", exit_reason: null, order_id: null }));
    const { over } = paint(buildOverlay([], many, 0, 24 * HOUR));
    expect(over.filter((c) => c.name === "closePath")).toHaveLength(20);
    expect(over.filter((c) => c.name === "fillText")).toHaveLength(0);
  });

  it("keeps a label inside the plot: clamped at the left edge, flipped below the glyph at the top edge", () => {
    const edge = [{ at_utc_ms: 0, price: "100", qty: "1", side: "sell", exit_reason: null, order_id: null }];
    const { over } = paint(buildOverlay([], edge, 0, 24 * HOUR));
    const pill = over.find((c) => c.name === "roundRect")!;
    expect(Number(pill.args[0])).toBeGreaterThanOrEqual(2);
    /* a sell's label sits above its glyph; a fill near the top of the plot (price 990 → y 10) flips it below */
    const topEdge = [{ at_utc_ms: 5 * HOUR, price: "990", qty: "1", side: "sell", exit_reason: null, order_id: null }];
    const high = paint(buildOverlay([], topEdge, 0, 24 * HOUR)).over.find((c) => c.name === "roundRect")!;
    expect(Number(high.args[1])).toBeGreaterThan(10);
    const normal = [{ at_utc_ms: 5 * HOUR, price: "100", qty: "1", side: "sell", exit_reason: null, order_id: null }];
    const mid = paint(buildOverlay([], normal, 0, 24 * HOUR)).over.find((c) => c.name === "roundRect")!;
    expect(Number(mid.args[1]) + 7).toBeLessThan(900);
  });

  it("marks a bracket cut by the page edge with a chevron, and a whole one with none", () => {
    const whole = paint(model).over.filter((c) => c.name === "lineTo").length;
    const cut = paint(buildOverlay(SHORT, FILLS, 4 * HOUR, 8 * HOUR)).over.filter((c) => c.name === "lineTo").length;
    const cutModel = buildOverlay(SHORT, FILLS, 4 * HOUR, 8 * HOUR).brackets[0]!;
    expect([cutModel.continuesLeft, cutModel.continuesRight]).toEqual([true, true]);
    expect([model.brackets[0]!.continuesLeft, model.brackets[0]!.continuesRight]).toEqual([false, false]);
    /* each cut end adds two lineTo per leg edge (the chevron) over what the same edges would need */
    expect(cut).toBeGreaterThan(0);
    expect(whole).toBeGreaterThan(0);
  });
});
