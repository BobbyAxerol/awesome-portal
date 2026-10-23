/**
 * The lifecycle spine and the event lanes of Alpha 360, read from the Manager DATASET of the alpha (`getManagerDataset`, ALPHA surface),
 * through the same port the real Edge answers. WP-C (FIXTURE_LAB, register 2c-wpc): the keys below are OPEN partition keys inside
 * `economic_partitions[].metrics` of a row. No schema names them, so the real Edge does not publish them yet; a dataset that does not
 * carry them leaves the spine and the lanes as the `Not published (FE-027/028, FE-031)` they were. Nothing here computes a figure: a
 * day count, a criteria count, an instant and an actor are read as published, and a missing one is absent, never zero.
 *
 * Text rides `reason_code` of an AVAILABLE metric (the Fleet's QBTS band does the same): an actor for an exit date, `Title|actor` for an
 * event, a role for the decider.
 */
import type { SpineStageFacts, SpineStageId } from "../../blocks";
import type { ChartEvent, EventKind } from "../../charts";
import { readUtcEpochMs } from "../../../screenDataContract";
import type { ManagerDataset } from "../../readers/managerDataset";
import type { ManagerMetricRead } from "../../readers/managerMetric";
import type { EventFeedRow } from "../../blocks";
import type { AlphaLifecycle, LifecycleStageId } from "../../readers/alphaLifecycle";

type Metrics = ReadonlyMap<string, ManagerMetricRead>;

/** The first partition of the first row that carries any lifecycle or event key. The keys are alpha-level, so every row says the same. */
function lifeMetrics(dataset: ManagerDataset | null): Metrics | null {
  if (dataset === null) return null;
  for (const row of dataset.items) {
    for (const entry of row.economicPartitions) {
      for (const key of entry.metrics.keys()) if (key.startsWith("life_") || key.startsWith("evt_")) return entry.metrics;
    }
  }
  return null;
}

const whole = (metric: ManagerMetricRead | undefined): number | null => {
  if (metric === undefined || metric.kind !== "value" || !/^\d+$/.test(metric.exact)) return null;
  const n = Number(metric.exact);
  return Number.isSafeInteger(n) ? n : null;
};
const text = (metric: ManagerMetricRead | undefined): string | null => (metric !== undefined && metric.kind === "value" ? metric.reasonCode : null);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** `17 Sep`, UTC. */
export const dayMonth = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
};

export interface LifecycleFacts {
  readonly stages: Partial<Record<SpineStageId, SpineStageFacts>>;
  /** Why a blocked stage is blocked, as published. */
  readonly blockedReason: string | null;
}

const ORDER: readonly SpineStageId[] = ["r1", "r2", "paper", "sandbox", "canary", "live"];

/**
 * Facts per stage for a spine whose current stage is `current`. A stage before it is `done` only when the source published its exit
 * date; the current stage prints its days, criteria and decider as published. `null` when the dataset carries no lifecycle key.
 */
export function lifecycleFacts(dataset: ManagerDataset | null, current: SpineStageId | null): LifecycleFacts | null {
  const m = lifeMetrics(dataset);
  if (m === null || current === null) return null;
  const stages: Partial<Record<SpineStageId, SpineStageFacts>> = {};
  const here = ORDER.indexOf(current);
  ORDER.forEach((id, index) => {
    const exit = m.get(`life_${id}_exit_ms`);
    const exitMs = exit !== undefined && exit.kind === "value" && /^\d+$/.test(exit.exact) ? Number(exit.exact) : null;
    const actor = text(exit);
    const days = whole(m.get(`life_${id}_days`));
    const met = whole(m.get(`life_${id}_criteria_met`));
    const total = whole(m.get(`life_${id}_criteria_total`));
    const criteria = met !== null && total !== null ? { met, total } : null;
    if (index < here) {
      if (exitMs === null) return;
      const gate = id === "r1" || id === "r2";
      stages[id] = {
        outcome: "done",
        daysInStage: gate ? null : days,
        criteria: gate ? null : criteria,
        decidedBy: actor,
        line: gate ? dayMonth(exitMs) : `Exit ${dayMonth(exitMs)}${actor === null ? "" : ` · ${actor}`}`,
      };
    } else if (index === here) {
      stages[id] = { daysInStage: days, criteria, decider: text(m.get(`life_${id}_decider`)) };
    }
  });
  return { stages, blockedReason: text(m.get("life_blocked_reason")) };
}

export interface StageSpan {
  readonly stage: "paper" | "sandbox" | "canary" | "live";
  readonly from: number;
  /** `null`: the stage is current (it runs to the end of the window). */
  readonly to: number | null;
}

const DAY_MS = 86_400_000;

/**
 * Where each running stage sat on the time axis, from what the dataset published about it: a completed stage ends at its published exit
 * instant and began its published whole days earlier; Live begins at the Canary exit and is current. A stage missing either number has no span.
 */
export function stageSpans(dataset: ManagerDataset | null): readonly StageSpan[] {
  const m = lifeMetrics(dataset);
  if (m === null) return [];
  const exitOf = (stage: string): number | null => {
    const metric = m.get(`life_${stage}_exit_ms`);
    return metric !== undefined && metric.kind === "value" && /^\d+$/.test(metric.exact) ? Number(metric.exact) : null;
  };
  const spans: StageSpan[] = [];
  for (const stage of ["paper", "sandbox", "canary"] as const) {
    const to = exitOf(stage);
    const days = whole(m.get(`life_${stage}_days`));
    if (to !== null && days !== null) spans.push({ stage, from: to - days * DAY_MS, to });
  }
  const live = exitOf("canary");
  if (live !== null) spans.push({ stage: "live", from: live, to: null });
  return spans;
}

/** A tile value read as the published ratio: exact string, or the typed absence's code. */
export function regimeFit(dataset: ManagerDataset | null): { kind: "value"; exact: string } | { kind: "absent"; code: string } | null {
  if (dataset === null) return null;
  for (const row of dataset.items) {
    for (const entry of row.economicPartitions) {
      const metric = entry.metrics.get("regime_fit");
      if (metric === undefined) continue;
      return metric.kind === "value" ? { kind: "value", exact: metric.exact } : { kind: "absent", code: metric.reasonCode };
    }
  }
  return null;
}

export interface LifeEvent extends ChartEvent {
  readonly actor: string;
  /** The receipt reference when the source publishes it (WP-K lifecycle read); the dataset keys carry none. */
  readonly receipt?: string | null;
}

const KINDS: readonly EventKind[] = ["stage", "decision", "incident", "recall", "flow"];

/** The published events of the alpha, one per `evt_<kind>_<n>_ms` key; `missing` names the kinds the dataset carries none of. */
export function lifeEvents(dataset: ManagerDataset | null): { events: readonly LifeEvent[]; missing: readonly EventKind[] } {
  const m = lifeMetrics(dataset);
  if (m === null) return { events: [], missing: KINDS };
  const events: LifeEvent[] = [];
  for (const [key, metric] of m) {
    const match = /^evt_(stage|decision|incident|recall|flow)_(\d+)_ms$/.exec(key);
    if (match === null || metric.kind !== "value" || !/^\d+$/.test(metric.exact)) continue;
    const at = readUtcEpochMs(Number(metric.exact));
    const [title, actor] = (metric.reasonCode ?? "").split("|");
    if (at === null || !title) continue;
    events.push({ id: key, t: at, kind: match[1] as EventKind, title, actor: actor || "Not published" });
  }
  events.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return { events, missing: KINDS.filter((kind) => !events.some((e) => e.kind === kind)) };
}

const FEED_KIND: Readonly<Record<EventKind, { kind: EventFeedRow["kind"]; label: string }>> = {
  stage: { kind: "operation", label: "Stage" },
  decision: { kind: "approval", label: "Decision" },
  incident: { kind: "incident", label: "Incident" },
  recall: { kind: "recall", label: "Recall" },
  flow: { kind: "applied", label: "Capital flow" },
};
/** The same events as table rows: actor as published; the receipt is not in this source (stays absent). */
export function lifeFeedRows(events: readonly LifeEvent[], target: string): EventFeedRow[] {
  return events.map((e) => ({ id: e.id, at: e.t, kind: FEED_KIND[e.kind].kind, kindLabel: FEED_KIND[e.kind].label, target, outcome: e.title, actor: e.actor, ...(e.receipt === undefined ? {} : { receipt: e.receipt }) }));
}

/* ── the same facts from the published lifecycle read (WP-K, `portal.execution.alpha-lifecycle.v1`) ─────────────────────────────────────── */

const STAGE_KEY: Readonly<Record<LifecycleStageId, SpineStageId>> = { R1: "r1", R2: "r2", PAPER: "paper", SANDBOX: "sandbox", CANARY: "canary", LIVE: "live" };

/** Facts per stage from the read's stage rows; `null` unless the stages section is published. Same rules as `lifecycleFacts`: done only with a published exit. */
export function lifecycleFactsOfRead(lifecycle: AlphaLifecycle | null, current: SpineStageId | null): LifecycleFacts | null {
  if (lifecycle === null || lifecycle.stages.state !== "PUBLISHED" || current === null) return null;
  const rows = lifecycle.stages.value;
  const here = ORDER.indexOf(current);
  const stages: Partial<Record<SpineStageId, SpineStageFacts>> = {};
  for (const row of rows) {
    const id = STAGE_KEY[row.stage];
    const index = ORDER.indexOf(id);
    const criteria = row.criteria === null ? null : { met: row.criteria.met, total: row.criteria.total };
    if (index < here) {
      if (row.exitedAtMs === null) continue;
      const gate = id === "r1" || id === "r2";
      stages[id] = {
        outcome: "done",
        daysInStage: gate ? null : row.daysInStage,
        criteria: gate ? null : criteria,
        decidedBy: row.decidedBy,
        line: gate ? dayMonth(row.exitedAtMs) : `Exit ${dayMonth(row.exitedAtMs)}${row.decidedBy === null ? "" : ` · ${row.decidedBy}`}`,
      };
    } else if (index === here) {
      stages[id] = { daysInStage: row.daysInStage, criteria, decider: row.deciderRole };
    }
  }
  // The reason is the alpha's, as on the dataset keys: the first stage that states one (the stage-state toggle shows it on whichever stage it previews).
  const blocked = rows.find((row) => row.blockedReason !== null)?.blockedReason ?? null;
  return { stages, blockedReason: blocked };
}

/** Where each running stage sat on the time axis, from the read's own entry and exit instants (no day arithmetic). A stage missing either instant has no span. */
export function stageSpansOfRead(lifecycle: AlphaLifecycle | null): readonly StageSpan[] {
  if (lifecycle === null || lifecycle.stages.state !== "PUBLISHED") return [];
  const spans: StageSpan[] = [];
  for (const row of lifecycle.stages.value) {
    const stage = STAGE_KEY[row.stage];
    if (stage !== "paper" && stage !== "sandbox" && stage !== "canary" && stage !== "live") continue;
    if (row.enteredAtMs === null) continue;
    if (stage === "live") spans.push({ stage, from: row.enteredAtMs, to: row.exitedAtMs });
    else if (row.exitedAtMs !== null) spans.push({ stage, from: row.enteredAtMs, to: row.exitedAtMs });
  }
  return spans;
}

/** The regime-fit tile from the read: the published exact ratio, or the typed absence's code. `null` unless the section is published. */
export function regimeFitOfRead(lifecycle: AlphaLifecycle | null): { kind: "value"; exact: string } | { kind: "absent"; code: string } | null {
  if (lifecycle === null || lifecycle.regimeFit.state !== "PUBLISHED") return null;
  const fit = lifecycle.regimeFit.value;
  return fit.state === "PUBLISHED" ? { kind: "value", exact: fit.exact } : { kind: "absent", code: fit.reasonCode };
}

/** The events of the unified feed; `missing` names the kinds the published feed carries none of. `null` unless the events section is published. */
export function lifeEventsOfRead(lifecycle: AlphaLifecycle | null): { events: readonly LifeEvent[]; missing: readonly EventKind[] } | null {
  if (lifecycle === null || lifecycle.events.state !== "PUBLISHED") return null;
  const events: LifeEvent[] = lifecycle.events.value.items
    .map((e) => ({ id: e.eventId, t: e.atMs, kind: e.kind as EventKind, title: e.title, actor: e.actor ?? "Not published", receipt: e.receiptRef }))
    .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  return { events, missing: KINDS.filter((kind) => !events.some((e) => e.kind === kind)) };
}
