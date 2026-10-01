/**
 * G8 · Screen 06 "what this mode reads" — the per-fold glyph strip (HiFi audit
 * 6.4, block "what this mode reads" of `QuantBT 06 S2 Search and Selection`).
 *
 * The HiFi draws, for every fold, a train cell and a test cell, and colours
 * the test cell by whether the mode lets OOS into selection. Its demo tape
 * decides that with a client-side claim matrix; this screen may not. Every
 * glyph here is a served fact, and each has one owner:
 *
 *  - which folds exist, and their train and test windows —
 *    `researchCurrentSourceSplitGetV1` `fold_plan.folds[]`;
 *  - which mode × schedule this run is —
 *    `researchCurrentSourceSearchGetV1` `search_contract`;
 *  - how that mode × schedule uses the OOS window —
 *    `researchEngineAtlasGetV1` `modes[].facts.schedules[].oos_use_state`
 *    (`oos_use`, `oos_use_condition`), and what it reads —
 *    `modes[].facts.reads.selection_inputs`.
 *
 * Nothing here decides what a mode "should" read. The Atlas descriptor is per
 * mode × schedule, so the OOS cell has one state for the whole strip; only the
 * windows differ fold to fold. A pattern the Atlas does not publish for this
 * run — no facts for the mode, a release the run did not run on, no fold plan —
 * is drawn as a typed absence with its reason, never as a guess. A run that
 * executed no search (the P04 fixed profile) has no per-fold read at all: that
 * is `NOT_APPLICABLE`, and it is drawn as that.
 *
 * Geometry is measured from the HiFi markup: the row is a flex wrap with 14 px
 * gap, `padding: 8px 14px`; each fold is a column (gap 2, centred) of a 1 px
 * gap pair — train 34 × 12, test 14 × 12 with a 1 px border — over a mono
 * 8.5 px label; the note is 10.5 px, line-height 1.5, `flex: 1`, min 260 px.
 * The HiFi's single "train / test" and "full sample" blocks belong to modes its
 * demo gives no folds; the served fold plan has folds for every mode, so the
 * strip draws the served folds for all of them.
 */

import { useEffect, useState } from "react";

import { isPublished, type AtlasDocument, type AtlasMode, type AtlasReadsFact, type AtlasScheduleFact } from "./atlas";
import { foundationApi, toFoundationRefusal, type AtlasResponse } from "./foundationClient";
import { foldLabel, formatUtc, groupDecimalString } from "./researchFormat";
import { CURRENT_SOURCE_LANE_COPY, toResearchRefusal } from "./researchRefusal";
import type { SearchDetail } from "./searchClient";
import {
  NOT_MODIFIED,
  isLaneNotApplicable,
  laneNotApplicableSentence,
  splitApi,
  type CurrentSourceSplit,
  type SourceFold,
} from "./splitClient";
import { isRetainedAnswer } from "./retainedLane";
import { retainedSearchOf, type LedgerSlot } from "./useSearch";

/* ------------------------------------------------------------------ types */

/** How the engine says a mode × schedule uses the OOS window (`oos_use_state`). */
export type OosReading = NonNullable<AtlasScheduleFact["oos_use_state"]>;

/** A window of one fold: drawn only when the fold plan published both of its ends. */
export interface StripWindow {
  published: boolean;
  startUtcMs: number | null;
  endUtcMs: number | null;
  bars: number | null;
}

export interface StripFold {
  /** The engine's own id (`"0"`), kept for the data attribute; the label counts from 1. */
  foldId: string;
  label: string;
  train: StripWindow;
  test: StripWindow;
}

export type FoldPlanSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; folds: SourceFold[] }
  | { state: "absent"; absence: "NOT_PUBLISHED" | "NOT_APPLICABLE"; code: string; sentence: string };

export type AtlasSlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; doc: AtlasDocument; kind: AtlasResponse["selected_release_kind"] }
  | { state: "absent"; code: string; sentence: string };

export interface ModeReadsSlots {
  plan: FoldPlanSlot;
  atlas: AtlasSlot;
}

export interface ModeReadsAbsent {
  kind: "absent";
  /** `NOT_APPLICABLE`: the question does not arise. `NOT_PUBLISHED`: it does and nothing answered. */
  state: "NOT_PUBLISHED" | "NOT_APPLICABLE";
  /** The server's reason code where it sent one; a `UI_` code where the screen is the one saying so. */
  code: string;
  sentence: string;
}

export interface ModeReadsStrip {
  kind: "strip";
  mode: string;
  schedule: string;
  release: { id: string; version: string };
  oos: { state: OosReading | null; use: AtlasScheduleFact["oos_use"]; condition: string | null };
  reads:
    | { state: "PUBLISHED"; inputs: string[]; retention: string }
    | { state: "NOT_PUBLISHED"; reason: string };
  folds: StripFold[];
}

export type ModeReadsView = { kind: "idle" } | { kind: "loading" } | ModeReadsAbsent | ModeReadsStrip;

/* ------------------------------------------------------------------ words */

/** Past this many folds the strip draws the first ones and says how many it did not. */
export const FOLD_STRIP_CAP = 48;

export const OOS_READING_WORDS: Record<OosReading, string> = {
  SELECTION_INPUT: "selection input",
  RETROSPECTIVE: "retrospective",
  WITHHELD_UNTIL_S4: "withheld until Stage 4",
  REPORT_ONLY: "report only",
  NOT_APPLICABLE: "not applicable",
};

/**
 * One short line per OOS state (VD-TEXT-01; the HiFi's sentences are longer).
 * The train cell does not pulse here, because nothing the fold plan serves says
 * what any window was read by. The test cell pulses exactly where the HiFi's
 * does — the two states in which OOS enters selection.
 */
export const OOS_READING_NOTE: Record<OosReading, string> = {
  SELECTION_INPUT: "OOS enters selection — claim is selection-adjusted",
  RETROSPECTIVE: "retrospective — not a deployment claim",
  WITHHELD_UNTIL_S4: "OOS withheld — read once, at Stage 4",
  REPORT_ONLY: "OOS is report only — no part in selection",
  NOT_APPLICABLE: "OOS use not applicable for this mode × schedule",
};

const OOS_UNSTATED_NOTE = "OOS use not stated by the engine for this mode × schedule";

/** The screen's own reason codes; a server code is never renamed into one of these. */
export const UI_MODE_READS_CODES = {
  NO_MODE: "UI_SEARCH_CONTRACT_NAMES_NO_MODE_OR_SCHEDULE",
  PLAN_LISTS_NO_FOLDS: "UI_FOLD_PLAN_LISTS_NO_FOLDS",
  PLAN_NOT_ANSWERED: "UI_FOLD_PLAN_NOT_ANSWERED",
  ATLAS_NOT_ANSWERED: "UI_ATLAS_NOT_ANSWERED",
  ATLAS_NOT_CURRENT: "UI_ATLAS_DESCRIBES_NO_CURRENT_RELEASE",
  NO_MODE_ENTRY: "UI_ATLAS_HAS_NO_ENTRY_FOR_THIS_MODE",
  NO_FACTS: "UI_ATLAS_MANIFEST_PUBLISHES_NO_ENGINE_FACTS",
  RELEASE_DIFFERS: "UI_ATLAS_RELEASE_DIFFERS_FROM_THE_RUNS_ENGINE",
  NO_SCHEDULE_FACT: "UI_ATLAS_HAS_NO_FACT_FOR_THIS_SCHEDULE",
} as const;

function absent(state: ModeReadsAbsent["state"], code: string, sentence: string): ModeReadsAbsent {
  return { kind: "absent", state, code, sentence };
}

/* ------------------------------------------------------------- derivation */

function windowOf(start: number | null, end: number | null, bars: number | null): StripWindow {
  const published = start !== null && end !== null;
  return { published, startUtcMs: start, endUtcMs: end, bars: published ? bars : null };
}

/** One fold as the fold plan published it. Nothing is added: an unpublished end is an unpublished window. */
export function stripFoldOf(fold: SourceFold): StripFold {
  return {
    foldId: fold.fold_id,
    label: foldLabel(fold.fold_id),
    train: windowOf(fold.train_start_utc_ms, fold.train_end_utc_ms, fold.anatomy.train_bars),
    test: windowOf(fold.test_start_utc_ms, fold.test_end_utc_ms, fold.anatomy.test_bars),
  };
}

export interface ModeReadsInput {
  /** `search_contract.optimization_mode` / `optimization_schedule`. */
  mode: string | null;
  schedule: string | null;
  /** The search read's own `provenance.engine_version`. */
  engineVersion: string | null;
  plan: FoldPlanSlot;
  atlas: AtlasSlot;
}

/**
 * The strip for one retained run, or the typed reason there is none. Pure: it
 * reads the three served facts it is handed and decides nothing else.
 */
export function modeReadsView({ mode, schedule, engineVersion, plan, atlas }: ModeReadsInput): ModeReadsView {
  if (mode === null || schedule === null) {
    return absent(
      "NOT_PUBLISHED",
      UI_MODE_READS_CODES.NO_MODE,
      "search contract names no mode or schedule — no fold drawn",
    );
  }
  if (plan.state === "absent") return absent(plan.absence, plan.code, plan.sentence);
  if (atlas.state === "absent") return absent("NOT_PUBLISHED", atlas.code, atlas.sentence);
  if (plan.state === "idle" || atlas.state === "idle") return { kind: "idle" };
  if (plan.state === "loading" || atlas.state === "loading") return { kind: "loading" };

  if (plan.folds.length === 0) {
    return absent(
      "NOT_PUBLISHED",
      UI_MODE_READS_CODES.PLAN_LISTS_NO_FOLDS,
      "fold plan lists no fold — no window to draw",
    );
  }
  if (atlas.kind !== "CURRENT") {
    return absent(
      "NOT_PUBLISHED",
      UI_MODE_READS_CODES.ATLAS_NOT_CURRENT,
      "Atlas answered a historical identity with no mode facts — not drawn",
    );
  }
  const entry: AtlasMode | undefined = atlas.doc.modes.find((candidate) => candidate.mode_id === mode);
  if (entry === undefined) {
    return absent(
      "NOT_PUBLISHED",
      UI_MODE_READS_CODES.NO_MODE_ENTRY,
      `Engine Atlas has no entry for ${mode} — not drawn`,
    );
  }
  const facts = entry.facts;
  if (facts === undefined) {
    return absent(
      "NOT_PUBLISHED",
      UI_MODE_READS_CODES.NO_FACTS,
      "manifest publishes no engine facts for this mode × schedule — not drawn",
    );
  }
  const release = atlas.doc.current_release;
  if (facts.source_release_id !== release.release_id || engineVersion === null || release.expected_version !== engineVersion) {
    return absent(
      "NOT_PUBLISHED",
      UI_MODE_READS_CODES.RELEASE_DIFFERS,
      `Atlas states ${release.package} ${release.expected_version}; this run ran on ${engineVersion ?? "an unnamed release"} — not drawn`,
    );
  }
  const fact = facts.schedules.find((candidate) => candidate.schedule === schedule);
  if (fact === undefined) {
    return absent(
      "NOT_PUBLISHED",
      UI_MODE_READS_CODES.NO_SCHEDULE_FACT,
      `Atlas states no ${schedule} fact for ${mode} — OOS use not drawn`,
    );
  }
  const reads: ModeReadsStrip["reads"] = isPublished<AtlasReadsFact>(facts.reads)
    ? { state: "PUBLISHED", inputs: facts.reads.selection_inputs, retention: facts.reads.retention }
    : { state: "NOT_PUBLISHED", reason: facts.reads.reason };
  return {
    kind: "strip",
    mode,
    schedule,
    release: { id: release.release_id, version: release.expected_version },
    oos: { state: fact.oos_use_state ?? null, use: fact.oos_use, condition: fact.oos_use_condition ?? null },
    reads,
    folds: plan.folds.map(stripFoldOf),
  };
}

/**
 * The P04 fixed profile ran no search, so it has no per-fold read: the
 * question does not arise. The reason is the hub's own (`source_profile`); a
 * source that has not reported, or a legacy row, is an absence of another kind.
 */
export function hubModeReadsAbsence(detail: Pick<SearchDetail, "source_profile" | "claim_row">): ModeReadsAbsent {
  const profile = detail.source_profile;
  const code = profile.reason_code ?? profile.state;
  if (profile.state === "FIXED_PROFILE_NO_SEARCH") {
    return absent(
      "NOT_APPLICABLE",
      code,
      "no fold strip — fixed profile, no optimizer study",
    );
  }
  return absent(
    "NOT_PUBLISHED",
    code,
    "no search published — no fold read drawn",
  );
}

/* ------------------------------------------------------------ text words */

function windowWords(window: StripWindow, role: string): string {
  if (!window.published || window.startUtcMs === null || window.endUtcMs === null) {
    return `${role} window not published`;
  }
  const bars = window.bars === null ? "" : `, ${groupDecimalString(String(window.bars))} bars`;
  return `${role} ${formatUtc(window.startUtcMs)} to ${formatUtc(window.endUtcMs)}${bars}`;
}

/** What one fold reads, in words: the title of its glyph and its line in the text alternative. */
export function foldReadsWords(fold: StripFold, oos: ModeReadsStrip["oos"]): string {
  const state = oos.state === null ? "OOS use not stated" : OOS_READING_WORDS[oos.state];
  const test =
    oos.state === "NOT_APPLICABLE"
      ? `${windowWords(fold.test, "test")} — no OOS cell drawn, ${state}`
      : `${windowWords(fold.test, "test")} — ${state}`;
  return `${fold.label}: ${windowWords(fold.train, "train")}; ${test}`;
}

/* ------------------------------------------------------------------ cells */

const TRAIN_CELL = "inline-block h-[12px] w-[34px]";
const TEST_CELL = "inline-block h-[12px] w-[14px] border";

const DASHED = { border: "1px dashed var(--ink-faint)", background: "transparent" } as const;

/** The test cell's fill and border per OOS state — tokens only, the HiFi's colours by value. */
function testCellStyle(state: OosReading | null, published: boolean): { style: Record<string, string>; pulse: boolean } {
  if (!published || state === null) return { style: { ...DASHED }, pulse: false };
  switch (state) {
    case "SELECTION_INPUT":
    case "RETROSPECTIVE":
      return { style: { background: "var(--accent-2)", borderColor: "var(--accent)" }, pulse: true };
    case "WITHHELD_UNTIL_S4":
      return {
        style: {
          background: "repeating-linear-gradient(135deg, var(--accent-2-soft) 0 3px, transparent 3px 6px)",
          borderColor: "var(--accent-2)",
        },
        pulse: false,
      };
    case "REPORT_ONLY":
      return { style: { background: "var(--accent-soft)", borderColor: "var(--accent)" }, pulse: false };
    case "NOT_APPLICABLE":
      return { style: {}, pulse: false };
  }
}

function FoldGlyph({ fold, oos }: { fold: StripFold; oos: ModeReadsStrip["oos"] }) {
  const test = testCellStyle(oos.state, fold.test.published);
  return (
    <span className="flex flex-col items-center gap-[2px]" data-strip-fold={fold.foldId} title={foldReadsWords(fold, oos)}>
      <span className="flex gap-px">
        <span
          className={TRAIN_CELL}
          style={fold.train.published ? { background: "var(--viz-train)" } : DASHED}
          data-strip-cell="train"
          data-window={fold.train.published ? "published" : "not-published"}
        />
        {oos.state === "NOT_APPLICABLE" ? null : (
          <span
            className={TEST_CELL}
            style={{
              ...test.style,
              ...(test.pulse ? { animationDelay: ".4s", ["--rs-motion-duration" as string]: "2.2s" } : {}),
            }}
            data-strip-cell="test"
            data-window={fold.test.published ? "published" : "not-published"}
            data-oos-reading={oos.state ?? "NOT_STATED"}
            data-motion={test.pulse ? "pulse" : undefined}
          />
        )}
      </span>
      <span className="mono text-[8.5px]" style={{ color: "var(--ink-faint)" }}>
        {fold.label}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ strip */

/**
 * The strip's own children of the "what this mode reads" row: the fold glyphs
 * and the note, or the typed absence. They are direct flex items of the row
 * (`display: contents`), exactly as the HiFi lays them out; the label is the
 * row's.
 */
export function FoldStrip({ view }: { view: ModeReadsView }) {
  if (view.kind === "idle") {
    return (
      <span className="contents" data-fold-strip="idle">
        <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title="the fold plan and the Atlas were not asked">
          not read
        </span>
      </span>
    );
  }
  if (view.kind === "loading") {
    return (
      <span className="contents" data-fold-strip="loading">
        <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} role="status">
          reading the fold plan and this mode's Atlas entry…
        </span>
      </span>
    );
  }
  if (view.kind === "absent") return <FoldStripAbsence view={view} />;

  const shown = view.folds.slice(0, FOLD_STRIP_CAP);
  const hidden = view.folds.length - shown.length;
  const note = view.oos.state === null ? OOS_UNSTATED_NOTE : OOS_READING_NOTE[view.oos.state];
  return (
    <span
      className="contents"
      data-fold-strip="drawn"
      data-strip-mode={view.mode}
      data-strip-schedule={view.schedule}
      data-strip-release={view.release.id}
      data-strip-oos={view.oos.state ?? "NOT_STATED"}
    >
      <span className="contents" aria-hidden="true" data-fold-glyphs>
        {shown.map((fold) => (
          <FoldGlyph key={fold.foldId} fold={fold} oos={view.oos} />
        ))}
      </span>
      {hidden > 0 ? (
        <span
          className="mono text-[10px]"
          style={{ color: "var(--ink-faint)" }}
          data-fold-strip-more={hidden}
          title={`${shown.length} of ${view.folds.length} folds are drawn; the text alternative lists all of them`}
        >
          +{groupDecimalString(String(hidden))} more folds
        </span>
      ) : null}
      <span className="min-w-[260px] flex-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-fold-strip-note>
        {note}
      </span>
      <ul className="sr-only" data-fold-strip-text>
        <li>
          {view.mode} under the {view.schedule} schedule: OOS is{" "}
          {view.oos.state === null ? "not stated by the engine" : OOS_READING_WORDS[view.oos.state]}. {view.folds.length} folds in the
          fold plan{hidden > 0 ? `, ${shown.length} drawn` : ""}.
        </li>
        {view.folds.map((fold) => (
          <li key={fold.foldId} data-fold-strip-line={fold.foldId}>
            {foldReadsWords(fold, view.oos)}
          </li>
        ))}
      </ul>
    </span>
  );
}

/** A typed absence, in the strip's place: its state word, the reason in a sentence, the code in the title. */
export function FoldStripAbsence({ view }: { view: ModeReadsAbsent }) {
  return (
    <span
      className="contents"
      data-fold-strip="absent"
      data-absence-state={view.state}
      data-absence-code={view.code}
    >
      <span
        className={`mono text-[10.5px] ${view.state === "NOT_APPLICABLE" ? "" : "italic"}`}
        style={{ color: "var(--ink-faint)" }}
        title={view.code}
        data-absence-word
      >
        {view.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}
      </span>
      <span
        className="min-w-[260px] flex-1 text-[10.5px] leading-[1.5]"
        style={{ color: "var(--ink-soft)" }}
        title={view.code}
        data-fold-strip-note
      >
        {view.sentence}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------- hook */

const NO_PLAN: FoldPlanSlot = { state: "idle" };
const NO_ATLAS: AtlasSlot = { state: "idle" };

/** A refusal in words: the lane state's own sentence when the 409 named one, else the screen's fixed copy. */
function planRefusal(error: unknown): FoldPlanSlot {
  const refusal = toResearchRefusal(error);
  return {
    state: "absent",
    absence: "NOT_PUBLISHED",
    code: refusal.code ?? (refusal.status > 0 ? `HTTP_${refusal.status}` : UI_MODE_READS_CODES.PLAN_NOT_ANSWERED),
    sentence: `${refusal.laneState ? CURRENT_SOURCE_LANE_COPY[refusal.laneState] : refusal.message} No fold is drawn.`,
  };
}

/**
 * The two reads the strip needs on a retained run: the fold plan
 * (`researchCurrentSourceSplitGetV1`) and the Engine Atlas
 * (`researchEngineAtlasGetV1`, whose ETag cache S12 shares). Both are asked
 * once, and only after the retained search lane answered — a run the lane
 * never holds (P04) asks for neither. Neither read is a write.
 */
export function useModeReads(runId: string, ledger: LedgerSlot, workspaceId?: string): ModeReadsSlots {
  const enabled = retainedSearchOf(ledger) !== null;
  const key = `${workspaceId ?? ""}|${runId}`;
  const [plan, setPlan] = useState<{ key: string; slot: FoldPlanSlot } | null>(null);
  const [atlas, setAtlas] = useState<{ key: string; slot: AtlasSlot } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const settle = (slot: FoldPlanSlot) => {
      if (!controller.signal.aborted) setPlan({ key, slot });
    };
    splitApi
      .currentSource(runId, { workspaceId, signal: controller.signal })
      .then((answer) => {
        if (answer === NOT_MODIFIED) return;
        if (isLaneNotApplicable(answer)) {
          settle({ state: "absent", absence: "NOT_APPLICABLE", code: answer.lane.reason_code, sentence: laneNotApplicableSentence(answer) });
          return;
        }
        if (!isRetainedAnswer(answer)) {
          const source = answer as CurrentSourceSplit;
          settle({
            state: "absent",
            absence: "NOT_PUBLISHED",
            code: source.availability.reason_code ?? source.availability.state,
            sentence: "fold plan not available — no fold drawn",
          });
          return;
        }
        settle({ state: "ready", folds: (answer as CurrentSourceSplit).fold_plan.folds });
      })
      .catch((error: unknown) => settle(planRefusal(error)));
    return () => controller.abort();
  }, [enabled, key, runId, workspaceId]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const settle = (slot: AtlasSlot) => {
      if (!controller.signal.aborted) setAtlas({ key, slot });
    };
    foundationApi
      .atlas(workspaceId ? { workspace_id: workspaceId } : {}, controller.signal)
      .then((response) => {
        if (response.atlas === null) {
          settle({
            state: "absent",
            code: UI_MODE_READS_CODES.ATLAS_NOT_CURRENT,
            sentence: "Atlas answered a historical identity with no mode facts — not drawn",
          });
          return;
        }
        settle({ state: "ready", doc: response.atlas, kind: response.selected_release_kind });
      })
      .catch((error: unknown) => {
        const refusal = toFoundationRefusal(error);
        settle({
          state: "absent",
          code: refusal.code ?? (refusal.status > 0 ? `HTTP_${refusal.status}` : UI_MODE_READS_CODES.ATLAS_NOT_ANSWERED),
          sentence: `Engine Atlas could not be read — ${refusal.message}`,
        });
      });
    return () => controller.abort();
  }, [enabled, key, workspaceId]);

  if (!enabled) return { plan: NO_PLAN, atlas: NO_ATLAS };
  return {
    plan: plan?.key === key ? plan.slot : { state: "loading" },
    atlas: atlas?.key === key ? atlas.slot : { state: "loading" },
  };
}
