/** The journal of a real Delta Limit/OCO run (BTCUSDT, 19 rows copied from the Control API answer) as tracks and an OCO group. */
import { describe, expect, it } from "vitest";

import limitOco from "./windowLimitOco.fixture.json";
import { buildTracks, ocoGroups, trackStyle, trackWords } from "./executionTracks";
import type { ExecutionRow } from "./windowExecutionClient";

const all = (limitOco.page as unknown as { rows: ExecutionRow[] }).rows;
const kind = (k: string) => all.filter((row) => row.payload.record_kind === k);
const tracks = () => buildTracks({ orders: kind("ORDER"), commands: kind("COMMAND"), lifecycle: kind("LIFECYCLE"), fills: kind("FILL") });

describe("order tracks from the real journal", () => {
  it("one track per order, each with the type, level and relations the source published", () => {
    const t = tracks();
    expect(t.map((x) => x.orderId)).toEqual(["delta-limit-oco-entry-579", "delta-limit-oco-entry-579-sl", "delta-limit-oco-entry-579-tp"].sort((a, b) => t.findIndex((y) => y.orderId === a) - t.findIndex((y) => y.orderId === b)));
    const entry = t.find((x) => x.orderId === "delta-limit-oco-entry-579")!;
    const sl = t.find((x) => x.orderId.endsWith("-sl"))!;
    const tp = t.find((x) => x.orderId.endsWith("-tp"))!;
    expect([entry.orderType, entry.level, entry.levelKind, entry.reduceOnly, entry.parentOrderId, entry.activationPolicy]).toEqual(["limit", "63557.0", "price", false, null, "immediate"]);
    expect([sl.orderType, sl.level, sl.levelKind, sl.reduceOnly, sl.parentOrderId, sl.ocoGroupId, sl.activationPolicy]).toEqual(["stop_market", "62730.759", "trigger", true, entry.orderId, "delta-limit-oco-exits-579", "on_parent_full_fill"]);
    expect([tp.orderType, tp.level, tp.levelKind]).toEqual(["limit", "65209.482", "price"]);
  });

  it("states come from the lifecycle events: the entry and take-profit filled, the stop was cancelled — never from a price", () => {
    const t = tracks();
    const by = (suffix: string) => t.find((x) => x.orderId.endsWith(suffix))!;
    expect(by("579").state).toBe("filled");
    expect(by("-tp").state).toBe("filled");
    expect(by("-sl").state).toBe("canceled");
    expect(by("-tp").fillPrice).toBe("65209.482");
    /* the stop and the take-profit end at the same source instant: one filled, its sibling cancelled */
    expect(by("-sl").endMs).toBe(by("-tp").endMs);
    expect(by("-sl").events.map((e) => e.name)).toEqual(["place", "activate", "cancel"]);
    expect(by("-tp").events.map((e) => e.name)).toEqual(["place", "activate", "fill"]);
  });

  it("a child starts when the source activated it, not when it was placed", () => {
    const sl = tracks().find((x) => x.orderId.endsWith("-sl"))!;
    expect(sl.startMs).toBe(sl.events.find((e) => e.name === "activate")!.at);
  });

  it("words and style are by order type and reduce-only, with no role the source did not name", () => {
    const t = tracks();
    expect(t.map((x) => [trackWords(x), trackStyle(x)]).sort()).toEqual([
      ["limit · reduce-only", "exit-limit"],
      ["limit", "entry"],
      ["stop market · reduce-only", "stop"],
    ].sort());
  });

  it("one OCO group named by the explicit group id, its parent from parent_order_id, both legs", () => {
    const groups = ocoGroups(tracks());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.groupId).toBe("delta-limit-oco-exits-579");
    expect(groups[0]!.parent?.orderId).toBe("delta-limit-oco-entry-579");
    expect(groups[0]!.legs.map((l) => l.state).sort()).toEqual(["canceled", "filled"]);
  });

  it("an expire event ends a track as expired (the real run's OCO legs expire when the position closes), a reject as rejected; nothing is called cancelled", () => {
    const mk = (event: string) => buildTracks({
      orders: [{ ...kind("ORDER")[0]!, payload: { ...kind("ORDER")[0]!.payload, order_id: "o1" } }],
      commands: [],
      lifecycle: [
        { ...kind("LIFECYCLE")[0]!, payload: { ...kind("LIFECYCLE")[0]!.payload, order_id: "o1", event_name: "place", timestamp_utc_ms: 1000 } },
        { ...kind("LIFECYCLE")[0]!, payload: { ...kind("LIFECYCLE")[0]!.payload, order_id: "o1", event_name: event, timestamp_utc_ms: 5000 } },
      ],
      fills: [],
    })[0]!;
    expect([mk("expire").state, mk("expire").endMs, mk("reject").state, mk("cancel").state, mk("fill").state]).toEqual(["expired", 5000, "rejected", "canceled", "filled"]);
  });

  it("an order the source gave no lifecycle for stays open with no end, never invented", () => {
    const orders = kind("ORDER").slice(0, 1);
    const t = buildTracks({ orders, commands: [], lifecycle: [], fills: [] });
    expect([t[0]!.state, t[0]!.endMs, t[0]!.events.length]).toEqual(["open", null, 0]);
  });
});
