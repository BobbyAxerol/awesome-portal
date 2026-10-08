/**
 * Screen 08 · the OCO tree (HiFi §2.9, lifecycle route): a parent order and the legs the source bound to it, one group per explicit
 * `oco_group_id`. A leg the source cancelled or expired is struck through with the instant of that event; the leg that filled shows its
 * fill. Built from the journal's own IDs and lifecycle events only — no relation from an ID suffix, no role the source did not name.
 */

import { useState } from "react";

import { ocoGroups, trackWords, type OrderTrack } from "./executionTracks";
import { iso } from "./utcMinute";

const FIRST_GROUPS = 6;

const levelWords = (track: OrderTrack) => (track.level === null ? "level not published" : `${track.levelKind === "trigger" ? "trigger " : ""}${track.level}`);

function endWords(track: OrderTrack): string {
  const at = track.endMs === null ? null : iso(track.endMs);
  if (track.state === "filled") return `filled${track.fillPrice ? ` @ ${track.fillPrice}` : ""}${at ? ` · ${at}` : ""}`;
  if (track.state === "canceled") return `cancelled${at ? ` · ${at}` : ""}`;
  if (track.state === "expired") return `expired${at ? ` · ${at}` : ""}`;
  if (track.state === "rejected") return `rejected${at ? ` · ${at}` : ""}`;
  return "no terminal event in the rows read";
}

function Row({ track, leg, last }: { track: OrderTrack; leg: boolean; last?: boolean }) {
  const struck = track.state === "canceled" || track.state === "expired" || track.state === "rejected";
  return (
    <li
      className="mono flex flex-wrap items-baseline gap-x-2 text-[10.5px]"
      style={{ paddingLeft: leg ? 14 : 0, color: struck ? "var(--ink-faint)" : "var(--ink)" }}
      data-oco-leg={leg ? track.orderId : undefined}
      data-oco-parent={leg ? undefined : track.orderId}
      data-leg-state={track.state}
    >
      {leg ? <span style={{ color: "var(--ink-faint)" }} aria-hidden="true">{last ? "└" : "├"}</span> : null}
      <span style={{ textDecoration: struck ? "line-through" : undefined }}>{track.orderId}</span>
      <span style={{ color: "var(--ink-soft)", textDecoration: struck ? "line-through" : undefined }}>{trackWords(track)} · {levelWords(track)}</span>
      <span style={{ color: struck ? "var(--ink-faint)" : "var(--ink-soft)" }} data-leg-end>{endWords(track)}</span>
      {leg && track.activationPolicy ? (
        <span style={{ color: "var(--ink-faint)" }}>activates {track.activationPolicy === "on_parent_full_fill" ? "on parent full fill" : track.activationPolicy.replace(/_/g, " ")}</span>
      ) : null}
    </li>
  );
}

export function OcoTree({ tracks }: { tracks: readonly OrderTrack[] }) {
  const groups = ocoGroups(tracks);
  const [all, setAll] = useState(false);
  if (groups.length === 0) return null;
  const shown = all ? groups : groups.slice(0, FIRST_GROUPS);
  return (
    <section className="flex flex-col gap-2" data-oco-tree={groups.length} aria-label="OCO groups">
      <h4 className="mono text-[9.5px] font-medium uppercase" style={{ color: "var(--ink-faint)" }}>
        OCO groups · {groups.length.toLocaleString("en-US")} · parent and legs by the source's own order ids
      </h4>
      {shown.map((group) => (
        <ul key={group.groupId} className="flex flex-col gap-0.5 border-l pl-2" style={{ borderColor: "var(--line-soft)" }} data-oco-group={group.groupId}>
          {group.parent ? <Row track={group.parent} leg={false} /> : (
            <li className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} data-oco-parent-absent>parent order not in the rows read</li>
          )}
          {group.legs.map((leg, at) => <Row key={leg.orderId} track={leg} leg last={at === group.legs.length - 1} />)}
        </ul>
      ))}
      {groups.length > FIRST_GROUPS ? (
        <button type="button" className="btn-ghost mono self-start text-[10px]" onClick={() => setAll((v) => !v)} data-action="oco-all" aria-expanded={all}>
          {all ? "show fewer" : `show all ${groups.length.toLocaleString("en-US")}`}
        </button>
      ) : null}
    </section>
  );
}
