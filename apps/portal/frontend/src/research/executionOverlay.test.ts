/** The overlay model from the real Limit/OCO journal (one cycle) and the edges synthetic data can reach. */
import { describe, expect, it } from "vitest";

import limitOco from "./windowLimitOco.fixture.json";
import { buildOverlay, compactQty, directionOf, legLabel } from "./executionOverlay";
import { buildTracks } from "./executionTracks";
import type { ExecutionRow } from "./windowExecutionClient";

const all = (limitOco.page as unknown as { rows: ExecutionRow[] }).rows;
const kind = (k: string) => all.filter((row) => row.payload.record_kind === k);
const tracks = () => buildTracks({ orders: kind("ORDER"), commands: kind("COMMAND"), lifecycle: kind("LIFECYCLE"), fills: kind("FILL") });
const fills = () =>
  kind("FILL").map((row) => ({ at_utc_ms: (row.payload.filled_at_utc_ms ?? row.at_utc_ms)!, price: (row.payload.fill_price ?? row.payload.price)!, qty: row.payload.fill_qty ?? row.payload.qty ?? null, side: row.payload.side ?? null, exit_reason: row.payload.exit_reason ?? null, order_id: row.payload.order_id ?? null }));
const WIDE: [number, number] = [0, Number.MAX_SAFE_INTEGER];

describe("the overlay of the real journal", () => {
  it("one bracket: entry price from the parent's actual fill, the legs by the side of the entry they sit on, never by name", () => {
    const o = buildOverlay(tracks(), fills(), ...WIDE);
    expect(o.brackets).toHaveLength(1);
    const b = o.brackets[0]!;
    expect(b.groupId).toBe("delta-limit-oco-exits-579");
    expect(b.entryText).toBe("63557.0");
    expect(b.legs.map((leg) => [leg.word, leg.levelText, leg.side, leg.state]).sort()).toEqual([
      ["limit", "65209.482", "favourable", "filled"],
      ["stop", "62730.759", "adverse", "canceled"],
    ]);
  });

  it("the bracket spans the instant the source activated its legs to the instant it resolved them", () => {
    const b = buildOverlay(tracks(), fills(), ...WIDE).brackets[0]!;
    const sl = tracks().find((t) => t.orderId.endsWith("-sl"))!;
    expect(b.startMs).toBe(sl.startMs);
    expect(b.endMs).toBe(sl.endMs);
  });

  it("fills are small marks at their own price with a short label; an exit word only where the source named the reason", () => {
    const o = buildOverlay(tracks(), fills(), ...WIDE);
    expect(o.fills).toHaveLength(2);
    expect(o.fills.map((f) => f.label)).toEqual(["buy 0.03147", expect.stringMatching(/^sell 0\.03147( · [A-Z]+)?$/)]);
    expect(o.fills.map((f) => f.priceText)).toEqual(["63557.0", "65209.482"]);
  });

  it("the take-profit fill names the entry as its explicit parent, so the two fills are linked; nothing else is", () => {
    const o = buildOverlay(tracks(), fills(), ...WIDE);
    expect(o.links).toHaveLength(1);
    expect([o.links[0]!.fromPrice, o.links[0]!.toPrice]).toEqual([63557, 65209.482]);
  });

  it("the entry limit order is an entry line; the OCO legs are not", () => {
    const o = buildOverlay(tracks(), fills(), ...WIDE);
    expect(o.entries).toHaveLength(1);
    expect(o.entries[0]!.level).toBe(63557);
    expect(o.entries[0]!.state).toBe("filled");
  });

  it("clips to the page: a window before every event shows nothing", () => {
    const o = buildOverlay(tracks(), fills(), 0, 1000);
    expect([o.fills.length, o.entries.length, o.brackets.length, o.links.length]).toEqual([0, 0, 0, 0]);
  });
});

describe("the edges", () => {
  it("a short entry flips the sides: legs above the entry are adverse", () => {
    const base = tracks();
    const flipped = base.map((t) => (t.orderId === "delta-limit-oco-entry-579" ? { ...t, fillPrice: "70000" } : t));
    const o = buildOverlay(flipped, fills().map((f) => (f.order_id === "delta-limit-oco-entry-579" ? { ...f, side: "sell" } : f)), ...WIDE);
    const sides = Object.fromEntries(o.brackets[0]!.legs.map((leg) => [leg.word, leg.side]));
    /* entry 70000 short: the stop at 62730 is below it (favourable), the limit at 65209 is below it too */
    expect(sides).toEqual({ stop: "favourable", limit: "favourable" });
  });

  it("an unknown side or no entry price leaves the legs' side unknown rather than guessed", () => {
    const base = tracks();
    const o = buildOverlay(base, fills().map((f) => ({ ...f, side: null })), ...WIDE);
    expect(o.brackets[0]!.legs.every((leg) => leg.side === "unknown")).toBe(true);
  });

  it("quantity labels are compact, the direction reads case-insensitively, the leg words are the source's", () => {
    expect([compactQty("0.030952661000266193"), compactQty("2000"), compactQty("0"), compactQty(null), compactQty("x")]).toEqual(["0.03095", "2000", "0", null, null]);
    expect([directionOf("BUY"), directionOf(" sell "), directionOf(null), directionOf("short")]).toEqual(["buy", "sell", "unknown", "unknown"]);
    expect([legLabel("take_profit"), legLabel("stop_loss"), legLabel("entry"), legLabel(null), legLabel(undefined)]).toEqual(["TP", "SL", "", "", ""]);
  });
});
