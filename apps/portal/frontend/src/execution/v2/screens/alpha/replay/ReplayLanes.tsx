/**
 * STAGE / DECISION / INCIDENT lanes under the replay chart (hi-fi trade-replay: three typed lanes on the chart's own window).
 *
 * The events are the alpha's published ones (`lifeEvents`: the Manager dataset's open `evt_*` partition keys, FIXTURE_LAB today). The
 * lanes cover the replay's loaded window, printed as a caption, so a reader never takes them for the whole history. A kind the source
 * published none of is a named gap (`Not published (FE-031)`); a lane is never filled from another source and an event outside the
 * window is counted, not drawn (the ribbon says so).
 */
import { EventRibbon, type ChartDomain, type EventKind } from "../../../charts";
import { EVENT_KIND_TABLE } from "../../../charts/eventKinds";
import { formatInstant } from "../../../boundary";
import { Np } from "../np";
import type { LifeEvent } from "../lifecycleModel";

const LANES: readonly EventKind[] = ["stage", "decision", "incident"];

export interface ReplayLanesProps {
  events: { events: readonly LifeEvent[]; missing: readonly EventKind[] };
  /** The replay's loaded window (candles, else the trades). `null` draws nothing. */
  domain: ChartDomain | null;
  /** Fills of the symbol on show inside the window, against the fills loaded (exact counts). */
  fills?: { inWindow: number; loaded: number } | null;
}

export function ReplayLanes({ events, domain, fills = null }: ReplayLanesProps) {
  if (domain === null) return null;
  const inWindow = events.events.filter((e) => LANES.includes(e.kind) && e.t >= domain.from && e.t <= domain.to);
  const gaps = events.missing.filter((kind) => LANES.includes(kind));
  // No stage, decision or incident event at all: one sentence, not an empty band of three lanes.
  if (!events.events.some((e) => LANES.includes(e.kind))) {
    return (
      <div className="exec-alp2-lanes" data-testid="replay-lanes">
        <p className="exec-alp2-cap" data-testid="replay-lanes-none">
          {fills === null ? null : <span>{fills.inWindow.toLocaleString("en-US")} of {fills.loaded.toLocaleString("en-US")} fills in this window</span>}
          <span>No stage, decision or incident event is published for this alpha up to the read's as-of time.</span>
        </p>
      </div>
    );
  }
  return (
    <div className="exec-alp2-lanes" data-testid="replay-lanes">
      <EventRibbon label="Stage, decision and incident events" events={events.events} domain={domain} kinds={LANES} />
      <p className="exec-alp2-cap">
        {fills === null ? null : <span>{fills.inWindow.toLocaleString("en-US")} of {fills.loaded.toLocaleString("en-US")} fills in this window</span>}
        <span>{inWindow.length} {inWindow.length === 1 ? "event" : "events"} in this window ({formatInstant(new Date(domain.from).toISOString())} to {formatInstant(new Date(domain.to).toISOString())})</span>
        {gaps.length > 0 ? <span>{gaps.map((kind) => EVENT_KIND_TABLE[kind].label).join(", ")}: <Np id="FE-031" /></span> : null}
      </p>
    </div>
  );
}
