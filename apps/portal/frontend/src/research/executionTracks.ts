/**
 * Screen 08 · the engine journal as drawable order tracks and OCO groups — from the source's own IDs and lifecycle events only.
 *
 * An order is a track: its type and price (or trigger) from `result.orders`, its explicit parent / OCO group / activation policy from the
 * command report, and what happened to it from the lifecycle events (`place`, `activate`, `fill`, `cancel`) keyed by `order_id`.
 * Nothing is inferred: no relation from an ID suffix or from row adjacency, no role (entry / stop-loss / take-profit) that the source did
 * not name — a track says its order type and that it is reduce-only, and the screen words it from exactly that.
 */

import type { ExecutionRow } from "./windowExecutionClient";

type Payload = ExecutionRow["payload"];

/** How the source ended an order: its own terminal lifecycle event. `open` = the rows read hold none. */
export type TrackState = "filled" | "canceled" | "expired" | "rejected" | "open";

const TERMINAL: Record<string, TrackState> = { fill: "filled", cancel: "canceled", expire: "expired", reject: "rejected" };

export interface OrderTrack {
  orderId: string;
  orderType: string | null;
  /** Limit price when the order has one, else its trigger; kept as served. */
  level: string | null;
  levelKind: "price" | "trigger" | null;
  reduceOnly: boolean | null;
  parentOrderId: string | null;
  ocoGroupId: string | null;
  activationPolicy: string | null;
  /** UTC ms. The track starts when the source says the order became working (`activate`, else `place`). */
  startMs: number | null;
  endMs: number | null;
  state: TrackState;
  /** The lifecycle events the source published for this order, in time order. */
  events: { name: string; at: number }[];
  fillPrice: string | null;
  fillQty: string | null;
}

const byTime = (a: { at: number }, b: { at: number }) => a.at - b.at;

/** Build one track per order the journal published. `orders` is the ORDER relation; the rest enrich it by explicit `order_id`. */
export function buildTracks(input: {
  orders: readonly ExecutionRow[];
  commands: readonly ExecutionRow[];
  lifecycle: readonly ExecutionRow[];
  fills: readonly ExecutionRow[];
}): OrderTrack[] {
  const relation = new Map<string, Payload>();
  for (const row of input.commands) if (row.payload.order_id) relation.set(row.payload.order_id, row.payload);
  const events = new Map<string, { name: string; at: number }[]>();
  for (const row of input.lifecycle) {
    const p = row.payload;
    const at = p.timestamp_utc_ms ?? row.at_utc_ms;
    if (!p.order_id || !p.event_name || at === null || at === undefined) continue;
    const list = events.get(p.order_id) ?? [];
    list.push({ name: p.event_name, at });
    events.set(p.order_id, list);
  }
  const fills = new Map<string, Payload>();
  for (const row of input.fills) if (row.payload.order_id) fills.set(row.payload.order_id, row.payload);

  const tracks: OrderTrack[] = [];
  for (const row of input.orders) {
    const p = row.payload;
    if (!p.order_id) continue;
    const rel = relation.get(p.order_id);
    const list = (events.get(p.order_id) ?? []).slice().sort(byTime);
    const placed = list.find((e) => e.name === "place");
    const activated = list.find((e) => e.name === "activate");
    const ended = list.find((e) => TERMINAL[e.name] !== undefined);
    const startMs = activated?.at ?? placed?.at ?? row.at_utc_ms ?? null;
    const level = p.price ?? p.trigger_price ?? null;
    const fill = fills.get(p.order_id);
    tracks.push({
      orderId: p.order_id,
      orderType: p.order_type ?? rel?.order_type ?? null,
      level,
      levelKind: p.price !== null && p.price !== undefined ? "price" : p.trigger_price !== null && p.trigger_price !== undefined ? "trigger" : null,
      reduceOnly: p.reduce_only ?? rel?.reduce_only ?? null,
      parentOrderId: rel?.parent_order_id ?? p.parent_order_id ?? null,
      ocoGroupId: rel?.oco_group_id ?? p.oco_group_id ?? null,
      activationPolicy: rel?.activation_policy ?? p.activation_policy ?? null,
      startMs,
      endMs: ended?.at ?? null,
      state: ended ? TERMINAL[ended.name]! : "open",
      events: list,
      fillPrice: fill?.fill_price ?? fill?.price ?? null,
      fillQty: fill?.fill_qty ?? fill?.qty ?? null,
    });
  }
  return tracks.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
}

/** The track's own words: only what the source published about it. */
export function trackWords(track: OrderTrack): string {
  const type = track.orderType === null ? "order type not published" : track.orderType.replace(/_/g, " ");
  return `${type}${track.reduceOnly === true ? " · reduce-only" : ""}`;
}

/** Style class of a track — by order type and reduce-only, never by a role the source did not name. */
export type TrackStyle = "entry" | "stop" | "exit-limit" | "other";
export function trackStyle(track: OrderTrack): TrackStyle {
  if (track.orderType === "stop_market" || track.orderType === "stop_limit") return "stop";
  if (track.orderType === "limit") return track.reduceOnly === true ? "exit-limit" : "entry";
  return "other";
}

export interface OcoGroup {
  groupId: string;
  parent: OrderTrack | null;
  legs: OrderTrack[];
}

/** One group per explicit `oco_group_id`: the parent named by the legs' `parent_order_id`, the legs in time order. */
export function ocoGroups(tracks: readonly OrderTrack[]): OcoGroup[] {
  const byId = new Map(tracks.map((t) => [t.orderId, t]));
  const groups = new Map<string, OcoGroup>();
  for (const track of tracks) {
    if (track.ocoGroupId === null) continue;
    const group = groups.get(track.ocoGroupId) ?? { groupId: track.ocoGroupId, parent: null, legs: [] };
    group.legs.push(track);
    if (track.parentOrderId !== null && group.parent === null) group.parent = byId.get(track.parentOrderId) ?? null;
    groups.set(track.ocoGroupId, group);
  }
  return [...groups.values()].sort((a, b) => (a.legs[0]?.startMs ?? 0) - (b.legs[0]?.startMs ?? 0));
}
