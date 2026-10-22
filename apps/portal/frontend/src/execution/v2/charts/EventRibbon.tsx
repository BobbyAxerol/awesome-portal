/**
 * EventRibbon · events along a time axis, lined up with an EquityPanel.
 *
 * Alignment is structural, not measured: both components read the same
 * `CHART_MARGIN` and the same `domain`, and the ribbon positions marks with CSS
 * `calc()` over the plot width. Marks are real buttons; a lane never hides
 * events silently: events that fall in the same time bucket become one counted
 * mark whose card lists them, and events outside the window are counted.
 */
import { useMemo, useState, type CSSProperties } from "react";

import "../css/charts.css";
import { formatAsOf } from "../boundary";
import { ChartStateFlags, ChartUnavailable } from "./ChartStateView";
import { EVENT_KIND_TABLE, EVENT_KINDS } from "./eventKinds";
import { CHART_MARGIN } from "./hooks";
import type { ChartDomain, ChartEvent, ChartState, EventKind, UtcEpochMs } from "./types";

export interface StageBand {
  /** Stable key. */
  readonly id: string;
  /** Drawn as a hatch (paper, sandbox), an outline (canary) or a solid (live): never colour alone. */
  readonly kind: "paper" | "sandbox" | "canary" | "live";
  /** Printed in the band when it is wide enough. */
  readonly label: string;
  /** Start of the stage. */
  readonly from: UtcEpochMs;
  /** End of the stage. */
  readonly to: UtcEpochMs;
}

export interface EventRibbonProps {
  /** Accessible name. */
  label: string;
  /** All events; those outside `domain` are counted, not drawn. */
  events: readonly ChartEvent[];
  /** The same window the EquityPanel uses. */
  domain: ChartDomain;
  /** Lifecycle stages drawn as a band under the lanes. */
  stages?: readonly StageBand[];
  /** Lanes that are on. Absent keys mean on. */
  enabled?: Partial<Record<EventKind, boolean>>;
  /**
   * The lanes to draw, in order. Default: every kind. A screen whose source publishes one kind passes just that one:
   * a lane with no source is not drawn, and an event of another kind is neither drawn nor counted as outside.
   */
  kinds?: readonly EventKind[];
  /** `unavailable` prints the caller's copy; `partial` and `stale` wear a Flag. */
  state?: ChartState;
  /** Marks closer than domain/buckets share one counted mark. Default 80. */
  buckets?: number;
}

const marginVars = { "--exec-chart-ml": `${CHART_MARGIN.l}px`, "--exec-chart-mr": `${CHART_MARGIN.r}px` } as CSSProperties;

function leftAt(frac: number): CSSProperties {
  return { left: `calc(var(--exec-chart-ml) + (100% - var(--exec-chart-ml) - var(--exec-chart-mr)) * ${frac.toFixed(5)})` };
}

const timeOf = (t: number) => formatAsOf(t as UtcEpochMs);

interface Cluster {
  readonly key: string;
  readonly kind: EventKind;
  readonly frac: number;
  readonly events: readonly ChartEvent[];
}

export function EventRibbon({ label, events, domain, stages = [], enabled = {}, kinds = EVENT_KINDS, state = { kind: "ready" }, buckets = 80 }: EventRibbonProps) {
  const [focus, setFocus] = useState<string | null>(null);
  const from = domain.from as number;
  const to = domain.to as number;
  const span = to - from;
  const on = (k: EventKind) => enabled[k] !== false;

  const { clusters, outside } = useMemo(() => {
    let outside = 0;
    const lanes = new Map<EventKind, Map<number, ChartEvent[]>>();
    for (const e of events) {
      if (!kinds.includes(e.kind)) continue;
      if (e.t < from || e.t > to) {
        outside += 1;
        continue;
      }
      if (enabled[e.kind] === false) continue;
      const bucket = span === 0 ? 0 : Math.min(buckets - 1, Math.floor(((e.t - from) / span) * buckets));
      const lane = lanes.get(e.kind) ?? new Map<number, ChartEvent[]>();
      const list = lane.get(bucket) ?? [];
      list.push(e);
      lane.set(bucket, list);
      lanes.set(e.kind, lane);
    }
    const out: Cluster[] = [];
    for (const kind of kinds) {
      const lane = lanes.get(kind);
      if (!lane) continue;
      for (const [bucket, list] of [...lane.entries()].sort((a, b) => a[0] - b[0])) {
        const sorted = [...list].sort((a, b) => a.t - b.t);
        const mid = sorted[Math.floor(sorted.length / 2)].t;
        out.push({ key: `${kind}-${bucket}`, kind, frac: span === 0 ? 0.5 : (mid - from) / span, events: sorted });
      }
    }
    return { clusters: out, outside };
  }, [events, from, to, span, buckets, enabled, kinds]);

  if (state.kind === "unavailable") return <ChartUnavailable label={label} copy={state.copy} reason={state.reason} height={72} />;

  const stageBands = stages.filter((s) => s.to > from && s.from < to && span > 0);
  const counted = events.filter((e) => kinds.includes(e.kind));
  const empty = counted.length === 0 && stageBands.length === 0;
  const active = clusters.find((c) => c.key === focus) ?? null;

  return (
    <div className="exec-ribbon" role="group" aria-label={label} style={marginVars} data-state={state.kind}>
      {state.kind !== "ready" ? <div className="exec-c2-head"><ChartStateFlags state={state} /></div> : null}
      {empty ? (
        <p className="exec-c2-envelope" data-testid="ribbon-empty">No events or stages in this window.</p>
      ) : (
        <>
          <div className="exec-ribbon-lanes" style={{ height: kinds.length * 18 + 8 }}>
            {kinds.map((kind, row) => (
              <div key={kind} className="exec-ribbon-lane" data-kind={kind} data-off={on(kind) ? "false" : "true"} style={{ top: 4 + row * 18 }}>
                <span className="exec-ribbon-lane-name">{EVENT_KIND_TABLE[kind].label}</span>
                <span className="exec-ribbon-lane-axis" />
              </div>
            ))}
            {clusters.map((c) => {
              const spec = EVENT_KIND_TABLE[c.kind];
              const row = kinds.indexOf(c.kind);
              const many = c.events.length > 1;
              const first = c.events[0];
              const name = many
                ? `${spec.label}: ${c.events.length} events from ${timeOf(first.t)} to ${timeOf(c.events[c.events.length - 1].t)}`
                : `${spec.label}: ${first.title}, ${timeOf(first.t)}`;
              return (
                <button
                  key={c.key}
                  type="button"
                  className="exec-ribbon-ev"
                  data-kind={c.kind}
                  data-many={many ? "true" : "false"}
                  data-testid="ribbon-event"
                  style={{ ...leftAt(c.frac), top: 4 + row * 18 }}
                  aria-label={name}
                  onMouseEnter={() => setFocus(c.key)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(c.key)}
                  onBlur={() => setFocus(null)}
                >
                  <span aria-hidden="true">{many ? `${spec.glyph}${c.events.length}` : spec.glyph}</span>
                </button>
              );
            })}
            {active ? (
              <div className="exec-ribbon-card" aria-hidden="true" data-testid="ribbon-card" style={{ ...leftAt(active.frac), top: 4 + kinds.indexOf(active.kind) * 18 + 20 }}>
                <div className="exec-ribbon-card-kind"><i data-kind={active.kind} />{EVENT_KIND_TABLE[active.kind].label}</div>
                {active.events.slice(0, 5).map((e) => (
                  <div key={e.id} className="exec-ribbon-card-row">
                    <b>{e.title}</b>
                    <span>{[timeOf(e.t), e.actor, e.reason, e.detail].filter((v): v is string => typeof v === "string" && v.length > 0).join(" · ")}</span>
                  </div>
                ))}
                {active.events.length > 5 ? <div className="exec-ribbon-card-row">{`and ${active.events.length - 5} more`}</div> : null}
              </div>
            ) : null}
          </div>
          {stageBands.length > 0 ? (
            <ol className="exec-ribbon-stages" aria-label="Stages">
              {stageBands.map((s) => {
                const a = Math.max(0, (s.from - from) / span);
                const b = Math.min(1, (s.to - from) / span);
                return (
                  <li
                    key={s.id}
                    className="exec-ribbon-stage"
                    data-stage={s.kind}
                    data-testid="ribbon-stage"
                    style={{ ...leftAt(a), width: `calc((100% - var(--exec-chart-ml) - var(--exec-chart-mr)) * ${(b - a).toFixed(5)})` }}
                    title={`${s.label}, ${timeOf(s.from)} to ${timeOf(s.to)}`}
                  >
                    <span>{s.label}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      )}
      {outside > 0 ? <p className="exec-c2-envelope" data-testid="ribbon-outside">{`${outside} ${outside === 1 ? "event" : "events"} outside this window not drawn`}</p> : null}
    </div>
  );
}

export interface EventKindChipsProps {
  /** The same list the ribbon gets, for the counts. */
  events: readonly ChartEvent[];
  /** Count only events inside this window. */
  domain?: ChartDomain;
  /** Which kinds are on. Absent keys mean on. */
  enabled: Partial<Record<EventKind, boolean>>;
  /** Called with the kind the user toggled; the caller owns the state. */
  onToggle: (kind: EventKind) => void;
  /** The kinds to offer, in order. Default: every kind. */
  kinds?: readonly EventKind[];
}

/** The lane filter: one toggle per kind, each with its count and its glyph. */
export function EventKindChips({ events, domain, enabled, onToggle, kinds = EVENT_KINDS }: EventKindChipsProps) {
  return (
    <div className="exec-ribbon-chips" role="group" aria-label="Event kinds">
      {kinds.map((kind) => {
        const pressed = enabled[kind] !== false;
        const count = events.filter((e) => e.kind === kind && (domain === undefined || (e.t >= domain.from && e.t <= domain.to))).length;
        return (
          <button key={kind} type="button" className="exec-ribbon-chip" aria-pressed={pressed} data-kind={kind} onClick={() => onToggle(kind)}>
            <span aria-hidden="true" className="exec-ribbon-chip-glyph">{EVENT_KIND_TABLE[kind].glyph}</span>
            {EVENT_KIND_TABLE[kind].label}
            <span className="exec-ribbon-chip-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
