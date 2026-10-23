/**
 * The event ribbon of Alpha 360, one assembly for the Performance chart and the Activity & Decisions chart (the design pins the same
 * ribbon on both). Events come from two published places: the Portal's observed timeline (command-journal rows on the Decision lane) and
 * the dataset's lifecycle events (`lifeEvents`, WP-C open keys: stage, decision, incident, recall, flow). A kind that neither source
 * published is named as a gap with its request id; a lane is never filled from another source.
 */
import { useMemo, useState, type ReactNode } from "react";

import type { ObservedEntry, ObservedTimeline } from "../../../api/observedTimeline";
import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import { EventKindChips, EventRibbon, domainOfSeries, type ChartDomain, type ChartEvent, type ChartState, type EventKind } from "../../charts";
import { EVENT_KIND_TABLE } from "../../charts/eventKinds";
import { stageBands, ribbonEvents, type EquityPanelInput, type StagePath } from "./model";
import type { LifeEvent, StageSpan } from "./lifecycleModel";
import { stageWord } from "./model";
import { Np } from "./np";
import type { PagedRead } from "./useAlphaReads";

export interface RibbonData {
  readonly domain: ChartDomain | null;
  readonly events: readonly ChartEvent[];
  readonly lifeEvents: readonly LifeEvent[];
  readonly seen: readonly ObservedEntry[];
  readonly ribbon: ReactNode;
  readonly chips: ReactNode;
  /** Kinds neither source published, as a caption (empty when every lane has a source). */
  readonly gaps: ReactNode;
}

export function useRibbon(
  timeline: PagedRead<ObservedTimeline>,
  life: { events: readonly LifeEvent[]; missing: readonly EventKind[]; spans?: readonly StageSpan[] },
  paths: readonly StagePath[],
  lead: EquityPanelInput | null,
): RibbonData {
  const [lanes, setLanes] = useState<Partial<Record<EventKind, boolean>>>({});
  const entries: readonly ObservedEntry[] = useMemo(
    () => (timeline.read.phase === "ready" ? timeline.read.value.flatMap((page) => page.timeline.entries) : []),
    [timeline.read],
  );
  const seen = useMemo(() => {
    const keys = new Set<string>();
    return entries.filter((e) => (keys.has(e.key) ? false : (keys.add(e.key), true)));
  }, [entries]);
  const seriesDomain = lead === null ? null : domainOfSeries(lead.points);
  const entryDomain: ChartDomain | null = useMemo(() => {
    const times = [...seen.map((e) => readUtcEpochMs(e.observedAtMs)), ...life.events.map((e) => e.t)].filter((t): t is NonNullable<typeof t> => t !== null);
    return times.length < 2 ? null : { from: times.reduce((a, b) => (b < a ? b : a)), to: times.reduce((a, b) => (b > a ? b : a)) };
  }, [seen, life.events]);
  const domain = seriesDomain ?? entryDomain;
  const events = useMemo<readonly ChartEvent[]>(() => [...ribbonEvents(seen), ...life.events], [seen, life.events]);
  // The published stage spans (exit instants and days) when the dataset has them; otherwise where each stage published a daily close.
  const bands = useMemo(() => {
    const spans = life.spans ?? [];
    if (spans.length === 0 || domain === null) return stageBands(paths);
    return spans.map((s) => ({ id: s.stage, kind: s.stage, label: stageWord(s.stage), from: s.from as UtcEpochMs, to: (s.to ?? domain.to) as UtcEpochMs }));
  }, [life.spans, paths, domain]);
  const state: ChartState = timeline.read.phase === "error" ? { kind: "unavailable", copy: "Not available", reason: timeline.read.reason }
    : timeline.read.phase === "ready" && timeline.read.value[0]?.timeline.state === "PARTIAL"
      ? { kind: "partial", reason: timeline.read.value[0].timeline.reasonCode ?? "The source marked the timeline partial." }
      : { kind: "ready" };
  const ribbon = domain === null ? null : <EventRibbon label="Events and stages" events={events} domain={domain} stages={bands} enabled={lanes} state={state} />;
  const chips = domain === null ? null : (
    <EventKindChips events={events} domain={domain} enabled={lanes} onToggle={(kind) => setLanes((prev) => ({ ...prev, [kind]: prev[kind] === false }))} />
  );
  // The observed timeline publishes decisions only; a kind with no event from either source is a gap, named once.
  const unpublished = life.missing.filter((kind) => kind !== "decision" || !events.some((e) => e.kind === "decision"));
  const gaps = unpublished.length === 0 ? null : (
    <span>{unpublished.map((kind) => EVENT_KIND_TABLE[kind].label).join(", ")}: <Np id="FE-031" /></span>
  );
  return { domain, events, lifeEvents: life.events, seen, ribbon, chips, gaps };
}
