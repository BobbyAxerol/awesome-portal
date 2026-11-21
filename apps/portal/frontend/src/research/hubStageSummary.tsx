/**
 * Screen 04 — one summary card per stage tab (W4B, Bobby 2026-10-02: the hub tab is the
 * summary, the deep dive is the full body).
 *
 * Every number here is a fact an already-loaded read served: the Hub's fold navigation, window
 * disclosure and dataset coverage, and — when the run identity read answered — the progress
 * snapshot's trial counts and fold selection. Nothing is computed: no span from other spans, no
 * trial id from another. A fact the reads did not serve is simply not printed; when none was
 * served the card says so once. The full body lives one click away, carrying the cursor.
 */

import { humanise } from "./humanise";
import { ResearchScopedLink as Link } from "./ResearchScopedLink";

import { Withheld } from "./EvidenceFlow";
import type { EvidenceCursor } from "./evidenceCursor";
import { isAvailable, type EvidenceHub } from "./evidenceClient";
import type { EvidenceWindow } from "./evidenceWindow";
import type { ProgressRead } from "./progressClient";
import { freezeHref, executeHref, searchHref, splitHref, type LinkCursor } from "./runLinks";
import type { StageChip } from "./runTerminalState";
import { shortDigest } from "./researchFormat";
import { trialLabel, trialTitle } from "./trialLabel";

export type SummaryStage = "split" | "search" | "freeze" | "execute";

const DIVE: Record<SummaryStage, { screen: string; label: string; heading: string; href: (runId: string, c: LinkCursor) => string }> = {
  split: { screen: "S5", label: "Open S5 Split →", heading: "Stage 1 · Split", href: splitHref },
  search: { screen: "S6", label: "Open S6 Search →", heading: "Stage 2 · Search", href: searchHref },
  freeze: { screen: "S7", label: "Open S7 Freeze →", heading: "Stage 3 · Freeze", href: freezeHref },
  execute: { screen: "S8", label: "Open S8 Execute →", heading: "Stage 4 · Execute", href: executeHref },
};

const STAGE_KEY = { split: "S1", search: "S2", freeze: "S3", execute: "S4" } as const;

const TONE: Record<StageChip["tone"], string> = {
  good: "var(--good)",
  accent: "var(--accent)",
  quiet: "var(--ink-faint)",
  bad: "var(--bad)",
  warn: "var(--warn)",
};

const PANEL = { borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" } as const;
const COUNT = new Intl.NumberFormat("en-US");

export interface StageFact {
  id: string;
  label: string;
  value: string;
  /** Where the value comes from, or what it is not: the tooltip and the accessible name. */
  title?: string;
}

/** The global selection every fold froze (retained lane), when the route could read it. */
export interface LaneSelection {
  trial: number | null;
  sourceId?: number | string | null;
  paramsDigest: string | null;
}

interface Selection {
  trial: number | null;
  sourceId: string | null;
  paramsDigest: string | null;
  scope: string | null;
}

/**
 * The selection this cursor's fold froze: the fold's own published selection, else the retained
 * lane's global one, else the run's structured hand-off cursor when it names this fold.
 */
export function selectionOf(progress: ProgressRead | null, cursor: EvidenceCursor, lane: LaneSelection | null): Selection | null {
  const snapshot = progress?.progress ?? null;
  const own = snapshot?.folds.find((fold) => fold.fold === cursor.fold)?.selection;
  if (own && own.state === "AVAILABLE" && own.trial !== null) {
    return { trial: own.trial, sourceId: own.source_trial_id ?? null, paramsDigest: own.params_digest ?? null, scope: own.scope };
  }
  if (lane !== null && (lane.trial !== null || lane.paramsDigest !== null)) {
    return { trial: lane.trial, sourceId: lane.sourceId == null ? null : String(lane.sourceId), paramsDigest: lane.paramsDigest, scope: "GLOBAL_STUDY" };
  }
  const handoff = snapshot?.claim.handoff_cursor ?? null;
  if (handoff && handoff.fold === cursor.fold) {
    return { trial: handoff.trial, sourceId: null, paramsDigest: handoff.params_digest, scope: null };
  }
  return null;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function bars(count: number): string {
  return `${COUNT.format(count)} ${count === 1 ? "bar" : "bars"}`;
}

/** The headline facts of one stage, from what the hub and the progress read already served. */
export function stageFacts(
  stage: SummaryStage,
  hub: EvidenceHub,
  cursor: EvidenceCursor,
  progress: ProgressRead | null,
  lane: LaneSelection | null,
): StageFact[] {
  const facts: StageFact[] = [];
  const navigation = hub.core.fold_navigation;
  const folds = navigation && isAvailable(navigation.availability) ? navigation : null;
  const disclosure = hub.core.window_disclosure && isAvailable(hub.core.window_disclosure.availability) ? hub.core.window_disclosure : null;
  const foldWindow = disclosure?.folds.find((entry) => entry.fold === cursor.fold) ?? null;
  const selection = selectionOf(progress, cursor, lane);

  if (stage === "split") {
    const count = folds?.published_fold_count ?? null;
    if (count !== null) {
      const observed = folds?.observed_folds ?? [];
      const span = observed.length > 1 ? `${observed[0]}–${observed[observed.length - 1]}` : null;
      facts.push({
        id: "folds",
        label: "folds",
        value: span !== null ? `${count} · ${span}` : String(count),
        title: `${count} published ${count === 1 ? "fold" : "folds"}${span !== null ? `, observed ${span}` : ""}`,
      });
    }
    if (foldWindow !== null) {
      facts.push({
        id: "fold-window",
        label: `fold ${cursor.fold}`,
        value: `IS ${bars(foldWindow.is_bars)} · OOS ${bars(foldWindow.oos_bars)}`,
        title: "Bars of the cursor fold's in-sample and out-of-sample windows, as the dataset snapshot published them.",
      });
    }
    const range = hub.core.dataset_coverage && isAvailable(hub.core.dataset_coverage.availability) ? hub.core.dataset_coverage.range : null;
    if (range) {
      facts.push({
        id: "data-span",
        label: "data",
        value: `${utcDate(range.start_utc_ms)} → ${utcDate(range.end_exclusive_utc_ms - 1)}`,
        title: "UTC dates of the full dataset snapshot query, not of one fold.",
      });
    }
  } else if (stage === "search") {
    const overall = progress?.progress?.overall ?? null;
    if (overall !== null && overall.trials_declared > 0) {
      facts.push({
        id: "trials",
        label: "trials",
        value: `${COUNT.format(overall.trials_done)} of ${COUNT.format(overall.trials_declared)}`,
        title: "Trials the source observed against the trials the run declared.",
      });
    }
    const label = selection === null ? null : trialLabel({ ordinal: selection.trial, sourceId: selection.sourceId });
    if (label !== null) {
      facts.push({ id: "selected", label: "selected", value: label, title: trialTitle });
    }
  } else if (stage === "freeze") {
    if (selection?.paramsDigest) {
      facts.push({
        id: "candidate",
        label: "candidate",
        value: shortDigest(selection.paramsDigest) ?? selection.paramsDigest,
        title: `Parameter digest the cursor fold froze\n${selection.paramsDigest}`,
      });
    }
    const label = selection === null ? null : trialLabel({ ordinal: selection.trial, sourceId: selection.sourceId });
    if (label !== null) facts.push({ id: "frozen-trial", label: "frozen", value: label, title: trialTitle });
  } else {
    if (foldWindow !== null) {
      facts.push({ id: "replay-window", label: `fold ${cursor.fold} OOS`, value: bars(foldWindow.oos_bars), title: "The replayed out-of-sample window of the cursor fold." });
    } else if (disclosure?.oos_bars != null) {
      facts.push({ id: "replay-window", label: "OOS", value: bars(disclosure.oos_bars), title: "Sum of the fold OOS windows; windows may overlap." });
    }
    const route = hub.core.run_identity?.route.id;
    if (route && isAvailable(route.availability) && route.value !== null) {
      facts.push({ id: "route", label: "route", value: route.value });
    }
  }
  return facts;
}

export function StageSummaryCard({
  stage,
  hub,
  runId,
  cursor,
  windowNamed = null,
  chip,
  progress = null,
  laneSelection = null,
}: {
  stage: SummaryStage;
  hub: EvidenceHub;
  runId: string;
  cursor: EvidenceCursor;
  windowNamed?: EvidenceWindow | null;
  /** The stage row's chip (`stageChip` of the row and the run's phase), or null when the row is not served. */
  chip: StageChip | null;
  progress?: ProgressRead | null;
  laneSelection?: LaneSelection | null;
}) {
  const dive = DIVE[stage];
  const facts = stageFacts(stage, hub, cursor, progress, laneSelection);
  const to = dive.href(runId, { cursor, window: windowNamed });
  return (
    <section
      data-screen-label={dive.heading}
      data-hub-stage-summary={stage}
      data-stage-row={STAGE_KEY[stage]}
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[8px] border px-4 py-3.5"
      style={PANEL}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div data-tab-heading>
          <h2 className="text-[23px] font-normal" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
            {dive.heading}
          </h2>
        </div>
        {chip !== null ? (
          <span className="mono inline-flex items-center gap-1.5 text-[11px] font-semibold" data-stage-state={chip.word} style={{ color: TONE[chip.tone] }}>
            <span aria-hidden="true" className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: TONE[chip.tone] }} />
            {chip.word}
          </span>
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} what="stage" />
        )}
      </div>

      {facts.length > 0 ? (
        <dl className="m-0 flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2" data-stage-facts>
          {facts.map((fact) => (
            <div key={fact.id} className="flex min-w-0 flex-col gap-0.5" data-stage-fact={fact.id} title={fact.title} aria-label={fact.title ? `${fact.label} ${fact.value}. ${fact.title}` : undefined}>
              <dt className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                {fact.label}
              </dt>
              <dd className="mono m-0 text-[13px] font-semibold" style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="flex-1" data-stage-facts-none>
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} what="summary" />
        </span>
      )}

      <Link
        to={to}
        data-deep-dive={stage}
        data-action="open-deep-dive"
        title={`The full ${dive.heading} screen, with this cursor${windowNamed ? ` and the ${windowNamed} window` : ""}`}
        className="mono ml-auto rounded-[6px] border px-3 py-1.5 text-[11px] font-semibold"
        style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      >
        {dive.label}
      </Link>
    </section>
  );
}

/** The Atlas tab: where this run sits in the mode × route matrix, one link, no embedded atlas. */
export function AtlasSummaryCard({ hub, runId }: { hub: EvidenceHub; runId: string }) {
  const identity = hub.core.run_identity;
  const params = new URLSearchParams({ tab: "modes" });
  const parts: string[] = [];
  for (const [key, fact] of [
    ["mode", identity?.mode],
    ["schedule", identity?.schedule],
    ["route", identity?.route.id],
  ] as const) {
    if (fact && isAvailable(fact.availability) && fact.value !== null) {
      params.set(key, fact.value);
      parts.push(humanise(fact.value));
    }
  }
  params.set("run", runId);
  return (
    <section data-screen-label="Atlas" data-hub-stage-summary="atlas" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[8px] border px-4 py-3.5" style={PANEL}>
      <div data-tab-heading>
        <h2 className="text-[23px] font-normal" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
          Atlas
        </h2>
      </div>
      {parts.length > 0 ? (
        <span className="mono min-w-0 flex-1 text-[12px]" style={{ color: "var(--ink-soft)" }} data-atlas-cell title="The mode, schedule and route this run occupies in the Atlas.">
          {parts.join(" · ")}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <Link
        to={`/research/quantbt/atlas#${params.toString()}`}
        data-action="open-atlas"
        title="The Engine Atlas, opened on this run's mode, schedule and route"
        className="mono ml-auto rounded-[6px] border px-3 py-1.5 text-[11px] font-semibold"
        style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      >
        Open S12 Atlas →
      </Link>
    </section>
  );
}
