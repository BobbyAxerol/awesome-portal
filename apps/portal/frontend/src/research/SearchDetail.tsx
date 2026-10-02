/**
 * Screen 06 — S2 Search & Selection (P15 + RS-02).
 *
 * The hi-fi is a study of an optimizer: a trial surface, a progression rail,
 * per-parameter distributions, importance bars, a freeze line and a pool
 * funnel. The installed source ran no search. So this screen keeps that
 * geometry — Stage A, the freeze line, Stage B, the full-width ledger — and
 * fills it with the one thing the source did publish, a declared fixed
 * parameter profile, and with the exact reason each other panel is empty.
 *
 * The distinction the whole screen turns on: **a search that did not happen is
 * not a search whose results are missing.** `NOT_APPLICABLE` says the question
 * does not arise; `NOT_PUBLISHED` says it does and nothing answered;
 * `NOT_ASSERTED` says nobody claimed it either way.
 *
 * Nothing here computes an objective, a rank, a score or a position:
 * `position_percent` is where the server says the effective value sits inside
 * its own declared range.
 *
 * RF-06: HiFi grid 1.08 : 52px : 1 with a full-height freeze line, the ledger
 * full width under it, Stage B frames kept (DQ-14), every absence printed once,
 * and copy that asserts a fact (a pool froze, a fixed profile) shown only when
 * the read published it (DQ-15).
 */

import { useEffect, useId, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ProvenanceStrip, type ProvenanceFacts } from "./ProvenanceStrip";
import {
  FoldStrip,
  FoldStripAbsence,
  hubModeReadsAbsence,
  modeReadsView,
  type ModeReadsSlots,
  type OosReading,
  type ModeReadsView,
} from "./SearchFoldStrip";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import type { DeclaredParameter } from "./alphaImportClient";
import { reasonCodeSentence } from "./researchRefusal";
import { claimToken, formatUtc, groupDecimalString, shortDigest } from "./researchFormat";
import { InfoMark } from "../components/InfoMark";
import { ShortId } from "./ShortId";
import { ImportedAlphaLine } from "./ImportedAlphaLine";
import type { FoldLedgerSlot } from "./useFoldLedger";
import { useLedgerPages } from "./useLedgerPages";
import { cleanParamText, cleanParameters } from "./searchParamText";
import { refusalState } from "./researchRefusal";
import {
  BestVsSelectedCards,
  FoldDecayBars,
  PoolFunnel,
  PoolPlane,
  SERVER_PREDATES_POOL,
  TypesetFormula,
  freezeLineLabel,
  selectedCandidate,
} from "./SearchStageB";
import { isRetainedAnswer, retainedReadiness, walkForwardOf } from "./retainedLane";
import {
  DIAGNOSTIC_KEYS,
  SEARCH_GAP_WORDS,
  SEARCH_WITHHELD_WORDS,
  gapReason,
  type ClaimRow,
  type ClaimTokenFact,
  type CurrentSourceSearch,
  type OosColumn,
  type ScoringBackend,
  type DiagnosticKey,
  type Parameter,
  type SearchAvailability,
  type SearchDetail as SearchDetailDocument,
  type SearchSourceGap,
} from "./searchClient";
import { deepDiveHref, serializeCursor, type EvidenceCursor } from "./evidenceCursor";
import { AsOf, CopyEvidenceLink, Digest, RunNotFound, SCREEN_FRAME } from "./SplitDetail";
import { LANE_STATE_COPY } from "./splitClient";
import type { LedgerSlot, RetainedRunFacts } from "./useSearch";
import { BoundWarningNote } from "./BoundWarning";
import type { BoundWarningValue } from "./BoundWarning";
import {
  SurfaceAbsence,
  SurfaceDistributions,
  SurfaceProgression,
  SurfaceScatter,
  ThetaJourney,
  two,
  type DeclaredSpace,
} from "./SearchSurface";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/*
 * VD-TEXT-01 (2026-10-01): the header subtitle, the "rules of this screen"
 * footer and the one-mode note are gone — the screen's own labels carry them.
 * The title is the HiFi's, without its explanatory tail.
 */
export const SEARCH_TITLE = "Search & Selection";

export const FREEZE_LABEL = "POOL FREEZE";

const DIAGNOSTIC_LABEL: Record<DiagnosticKey, string> = {
  scatter: "A2 · trial surface",
  distributions: "A4 · per-parameter sampled regions",
  parameter_frequency: "B4 · θ* journey — parameter frequency",
  progression: "A3 · progression",
  prune_reasons: "A3b · prune reasons",
  importance: "A5 · importance",
  interactions: "A6 · parameter interactions",
};

/** Stage A reads these; `parameter_frequency` is Stage B's θ* journey. */
const STAGE_A_DIAGNOSTICS: DiagnosticKey[] = ["scatter", "progression", "prune_reasons", "distributions", "importance", "interactions"];

/* ------------------------------------------------------------------ parts */

const LABEL = "[font-family:var(--font-body)] text-[10px] font-medium uppercase tracking-[.07em]";
const CARD = "flex flex-col gap-[6px] rounded-[8px] border p-[14px]";
const CARD_STYLE = { borderColor: "var(--line)", background: "var(--paper-raised)" } as const;
/** HiFi: the mode card floats one step (`--shadow-e1`); the stage panels sit flat. */
const RAISED_STYLE = { ...CARD_STYLE, boxShadow: "var(--shadow-e1)" } as const;

/**
 * HiFi schedule pill tone: only `per_fold_causal` keeps OOS out of selection,
 * so every other schedule, when it is the run's, wears the warn style (gold on
 * soft gold) rather than the accent.
 */
export function schedulePillTone(schedule: string | null): "accent" | "warn" {
  return schedule !== null && schedule !== "per_fold_causal" ? "warn" : "accent";
}

/**
 * The HiFi freeze-line arrow chip, by kind. `none`/`decay`/`retro`/`na` are the
 * HiFi's four (from the run's claim matrix); `no-freeze` is a run that ran no
 * search and froze no pool; `unpublished` is a run whose claim matrix the read
 * does not publish. Only a published crossing (decay, retro) moves.
 */
export type FreezeArrowKind = "none" | "decay" | "retro" | "na" | "no-freeze" | "unpublished";

export function freezeArrow(kind: FreezeArrowKind): { glyph: string; title: string; tone: string; border: string; flow: boolean } {
  switch (kind) {
    case "none":
      return { glyph: "→", title: "information flows one way, left → right", tone: "var(--accent-2)", border: "var(--accent-2)", flow: false };
    case "decay":
      return { glyph: "◀ OOS", title: "OOS enters selection across the freeze line — the claim becomes selection-adjusted", tone: "var(--bad)", border: "var(--bad)", flow: true };
    case "retro":
      return { glyph: "◀ FULL", title: "refit after reading the full span — retrospective", tone: "var(--bad)", border: "var(--bad)", flow: true };
    case "na":
      return { glyph: "×", title: "no window is withheld", tone: "var(--bad)", border: "var(--bad)", flow: false };
    case "no-freeze":
      return { glyph: "×", title: "no pool froze — this run ran no search, so nothing crossed a freeze line", tone: "var(--ink-faint)", border: "var(--line)", flow: false };
    case "unpublished":
      return { glyph: "—", title: "the run's claim matrix is not published, so which way information crossed is not shown", tone: "var(--ink-faint)", border: "var(--line)", flow: false };
  }
}

/**
 * Reason codes the claim row explains in a few words; the code stays in the
 * title. Defined here rather than in `researchRefusal.ts` (owned elsewhere) —
 * see the RF-06 wave C receipt.
 */
export const CLAIM_REASON_WORDS: Record<string, string> = {
  P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_VALIDATION_CLAIM: "the declared optimizer did not run",
  P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_CHRONOLOGICAL_CLAIM: "the declared optimizer did not run",
  P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_SCORING_BACKEND: "the declared optimizer did not run",
  P04_FIXED_PROFILE_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS: "a fixed profile asserts no OOS selection",
  P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED: "the source receipt is not published",
  UI_RETAINED_LANE_HAS_NO_FIELD: "the retained lane has no field for it",
};

/**
 * HiFi OOS-column chip (`claim.oosStateStyle`): words and tone per state. The
 * HiFi colours map to tokens by value — report only `--state-unavailable`,
 * withheld `--role-is`, selection input / retrospective `--accent-2`,
 * n/a `--bad`. `NOT_PUBLISHED` is not a chip.
 */
export const OOS_COLUMN_CHIP: Record<Exclude<OosColumn["state"], "NOT_PUBLISHED">, { words: string; tone: string }> = {
  SELECTION_INPUT: { words: "selection input", tone: "var(--accent-2)" },
  RETROSPECTIVE: { words: "retrospective", tone: "var(--accent-2)" },
  REPORT_ONLY: { words: "report only", tone: "var(--ink-mute)" },
  WITHHELD: { words: "withheld", tone: "var(--ink-faint)" },
  NOT_APPLICABLE: { words: "n/a", tone: "var(--bad)" },
};

const OOS_COLUMN_TITLE: Partial<Record<OosColumn["state"], string>> = {
  REPORT_ONLY:
    "The outer-OOS window was observed after the parameters were fixed and fed no selection inside this run. Strict outer-OOS selection is a separate fact, and it is not asserted.",
  SELECTION_INPUT: "The OOS column entered selection — the claim is selection-adjusted.",
  RETROSPECTIVE: "Rescored after the full span was read — retrospective evidence, never a deployment claim.",
  WITHHELD: "The outer OOS is withheld until Stage 4 reads it once.",
  NOT_APPLICABLE: "No window was withheld, so no column can be called OOS.",
};

/** The Engine Atlas address for a declared mode (spec 12 §1 hash: tab, mode, schedule, run). */
export function atlasModeHref(reference: NonNullable<ClaimRow["mode_reference"]>, runId: string): string {
  const params = new URLSearchParams({ tab: "modes", mode: reference.mode, schedule: reference.schedule, run: runId });
  return `/research/quantbt/atlas#${params.toString()}`;
}

/**
 * The HiFi claim-row aside, now the tooltip of the optimization_mode label
 * (VD-TEXT-01): two selector layers, two enums, never mixed on this screen.
 */
export const SELECTOR_LAYERS_HELP = "Mode is fixed per run.";

function Withheld({ availability, what }: { availability: SearchAvailability; what?: string }) {
  return (
    <span
      className="mono text-[10px] italic leading-[16px]"
      style={{ color: "var(--ink-faint)" }}
      data-withheld={availability.state}
      title={availability.reason_code ?? availability.state}
    >
      {what ? `${what} — ` : ""}
      {SEARCH_WITHHELD_WORDS[availability.state]}
    </span>
  );
}

/** One named absence, with its own word and the server's reason code. */
function Gap({
  gap,
  what,
  showReason = false,
  bare = false,
}: {
  gap: SearchSourceGap;
  what: string;
  showReason?: boolean;
  /** The label is already printed by the surrounding cell. */
  bare?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-gap-fact={what} data-gap-state={gap.state}>
      {bare ? null : (
        <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {what}
        </span>
      )}
      <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={gapReason(gap)}>
        {SEARCH_GAP_WORDS[gap.state]}
      </span>
      {showReason ? (
        <span className="mono break-all text-[9px]" style={{ color: "var(--ink-faint)" }}>
          {gapReason(gap)}
        </span>
      ) : null}
    </span>
  );
}

/** HiFi pill: square, mono 10.5, 3/10; read-only — one run is one mode. */
function Pill({
  children,
  on = false,
  tone = "accent",
  ...rest
}: { children: ReactNode; on?: boolean; tone?: "accent" | "warn" } & Record<string, unknown>) {
  return (
    <span
      className="mono border px-[10px] py-[3px] text-[10.5px]"
      style={
        on && tone === "warn"
          ? { color: "var(--accent-2)", borderColor: "var(--accent-2)", background: "var(--accent-2-soft)" }
          : on
            ? { color: "var(--accent)", borderColor: "var(--accent)", background: "var(--accent-soft)" }
            : { color: "var(--ink-soft)", borderColor: "var(--line)", background: "var(--paper-raised)" }
      }
      {...rest}
    >
      {children}
    </span>
  );
}

function Chip({
  children,
  tone = "var(--ink-soft)",
  border = "var(--line)",
  ...rest
}: {
  children: ReactNode;
  tone?: string;
  border?: string;
} & Record<string, unknown>) {
  return (
    <span
      className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]"
      style={{ color: tone, borderColor: border, background: "var(--paper-raised)" }}
      {...rest}
    >
      {children}
    </span>
  );
}

function Claim({
  k,
  children,
  accent = false,
  ...rest
}: { k: string; children: ReactNode; accent?: boolean } & Record<string, unknown>) {
  return (
    <span className="flex min-w-0 flex-col gap-[2px]" {...rest}>
      <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {k}
      </span>
      <span
        className={`mono text-[11.5px] ${accent ? "border-l-2 pl-1.5" : ""}`}
        style={{ color: "var(--ink)", borderColor: accent ? "var(--accent-2)" : undefined }}
      >
        {children}
      </span>
    </span>
  );
}

/**
 * A claim-row fact that is not a confirmed value: its own word — `not
 * applicable` upright (the question does not arise), `not asserted` and `not
 * published` in the italic of an absence — and the reason in a few words, the
 * code in the title.
 */
function ClaimAbsence({ state, reason, what }: { state: string; reason: string | null; what: string }) {
  const code = reason ?? state;
  const upright = state === "NOT_APPLICABLE";
  return (
    <span className="flex flex-col gap-[1px]" data-claim-fact={what} data-claim-state={state}>
      <span className={upright ? "" : "italic"} style={{ color: upright ? "var(--ink-soft)" : "var(--ink-faint)" }} title={code}>
        {SEARCH_GAP_WORDS[state as SearchSourceGap["state"]] ?? state.toLowerCase().replace(/_/g, " ")}
      </span>
      <span className="text-[9px] [font-family:var(--font-body)]" style={{ color: "var(--ink-faint)" }} title={code} data-claim-reason={code}>
        {CLAIM_REASON_WORDS[code] ?? code}
      </span>
    </span>
  );
}

/** W3: a claim token the retained lane published for this run (QuantBT's own word). */
function RetainedToken({ value, what }: { value: string; what: string }) {
  return (
    <span className="flex items-baseline gap-1.5" data-claim-fact={what} data-claim-state="RETAINED_SOURCE">
      <span data-claim-value={value} title={value}>
        {claimToken(value)}
      </span>
      <span className="text-[9px]" style={{ color: "var(--good)" }} title="published by QuantBT for this run, read from the retained lane">
        QUANTBT
      </span>
    </span>
  );
}

/** A run-sourced claim token, or its typed absence. */
function ClaimToken({ fact, what }: { fact: ClaimTokenFact | ClaimRow["oos_used_for_selection"]; what: string }) {
  if (fact.state === "CONFIRMED") {
    return (
      <span className="flex items-baseline gap-1.5" data-claim-fact={what} data-claim-state="CONFIRMED">
        <span data-claim-value={String(fact.value)} title={String(fact.value)}>
          {claimToken(fact.value as string | boolean)}
        </span>
        <span className="text-[9px]" style={{ color: "var(--good)" }} title={fact.provenance}>
          CONFIRMED
        </span>
      </span>
    );
  }
  return <ClaimAbsence state={fact.state} reason={fact.reason_code} what={what} />;
}

/** HiFi OOS-column chip, from the server's own column state. */
function OosColumnChip({ column }: { column: OosColumn }) {
  if (column.state === "NOT_PUBLISHED") {
    return <ClaimAbsence state="NOT_PUBLISHED" reason={column.reason_code} what="oos column" />;
  }
  const chip = OOS_COLUMN_CHIP[column.state];
  const title = [
    OOS_COLUMN_TITLE[column.state],
    column.source_evaluation_state,
    column.provenance !== "NONE" ? column.provenance : null,
    column.reason_code,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className="mono self-start rounded-[3px] border px-[6px] text-[11px] font-semibold"
      style={{ color: chip.tone, borderColor: chip.tone }}
      title={title}
      data-claim-fact="oos column"
      data-oos-column={column.state}
    >
      {chip.words}
    </span>
  );
}

/**
 * W3b: the OOS column on a retained run. `oos_used_for_selection: true` in
 * QuantBT's search contract is the HiFi "selection input" state stated
 * outright; any other answer is not a column state the lane publishes.
 */
function RetainedOosColumn({ used, reading = null }: { used: boolean | null; reading?: OosReading | null }) {
  if (used !== true) return <ClaimAbsence state="NOT_PUBLISHED" reason={RETAINED_NO_FIELD} what="oos column" />;
  /* G8 F-1: the fold strip reads this run's mode × schedule from the Atlas. Where it says RETROSPECTIVE, the chip says
     the same one word — the contract's `oos_used_for_selection: true` alone would call it "selection input". */
  const state = reading === "RETROSPECTIVE" ? "RETROSPECTIVE" : "SELECTION_INPUT";
  const chip = OOS_COLUMN_CHIP[state];
  return (
    <span
      className="mono self-start rounded-[3px] border px-[6px] text-[11px] font-semibold"
      style={{ color: chip.tone, borderColor: chip.tone }}
      title={`${OOS_COLUMN_TITLE[state]} · oos_used_for_selection true in QuantBT's search contract`}
      data-claim-fact="oos column"
      data-claim-state="RETAINED_SOURCE"
      data-oos-column={state}
    >
      {chip.words}
    </span>
  );
}

/**
 * Scoring backend: a confirmed value, or what the request declared — which is
 * not an executed fact, and is tagged so — or the typed absence.
 */
function ScoringBackendFact({ backend }: { backend: ScoringBackend }) {
  if (backend.state === "CONFIRMED" && backend.declared_value !== null) {
    return (
      <span className="flex items-baseline gap-1.5" data-claim-fact="scoring backend" data-claim-state="CONFIRMED">
        <span data-claim-value={backend.declared_value} title={backend.declared_value}>
          {claimToken(backend.declared_value)}
        </span>
        <span className="text-[9px]" style={{ color: "var(--good)" }} title={backend.provenance}>
          CONFIRMED
        </span>
      </span>
    );
  }
  if (backend.declared_value !== null) {
    return (
      <span className="flex flex-col gap-[1px]" data-claim-fact="scoring backend" data-claim-state={backend.state}>
        <span className="flex items-baseline gap-1.5">
          <span data-claim-declared={backend.declared_value} title={backend.declared_value}>
            {claimToken(backend.declared_value)}
          </span>
          <span
            className="text-[9px]"
            style={{ color: "var(--accent-2)" }}
            title={`declared in the request (${backend.provenance}); not an executed fact`}
          >
            DECLARED
          </span>
        </span>
        <span className="text-[9px] [font-family:var(--font-body)]" style={{ color: "var(--ink-faint)" }} title={backend.reason_code ?? backend.state}>
          {backend.state === "NOT_APPLICABLE" ? "not applicable" : "not published"} as run evidence —{" "}
          {CLAIM_REASON_WORDS[backend.reason_code ?? ""] ?? backend.reason_code ?? backend.state}
        </span>
      </span>
    );
  }
  return <ClaimAbsence state={backend.state} reason={backend.reason_code} what="scoring backend" />;
}

/**
 * A panel the hi-fi fills from an optimizer, kept as a frame with its reason.
 * `sentence` (retained runs) adds the reason's sentence where one exists.
 */
function EmptyPanel({ id, title, gap, sentence = false }: { id: string; title: string; gap: SearchSourceGap; sentence?: boolean }) {
  const words = sentence ? reasonCodeSentence(gapReason(gap)) : null;
  return (
    <section className={CARD} style={CARD_STYLE} data-panel={id} data-panel-state={gap.state}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          {title}
        </h3>
        {/* D24: the server's code is the hover, never the visible text. */}
        <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={gapReason(gap)} data-gap-reason={id} data-gap-code={gapReason(gap)}>
          {SEARCH_GAP_WORDS[gap.state]}
        </span>
      </div>
      {words ? (
        <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} title={gapReason(gap)}>
          {words}
        </span>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------- A1 · the declared profile */

/** HiFi A1 columns (px); `right` columns are numbers. θ* takes the rest, after a 14 px gutter. */
const A1_COLUMNS: { head: string; width: number; right?: boolean }[] = [
  { head: "param", width: 86 },
  { head: "kind", width: 112 },
  { head: "low … high", width: 96 },
  { head: "step", width: 44, right: true },
  { head: "levels", width: 56, right: true },
];

const LEVELS_REASON = "levels — the search read publishes no level count per parameter";


/**
 * The one panel with real content: the parameters the profile declares.
 *
 * HiFi A1 row: name · kind · low … high · step · levels · θ* on a baseline
 * track with a 2 × 11 tick and a 118 px note. The tick is drawn at
 * `position_percent` — the server's placement of the effective value inside
 * its own range; the browser does not work it out, and does not judge "near a
 * bound" either: the note is the served `bound_state` and that placement.
 * `levels` is not served, so its cell says so.
 */
/** HiFi A1 tick tone (spec 06 §3): at bound red, near bound gold, else green — the server's DR-02 state, not a browser judgement. */
function tickTone(warning: BoundWarningValue | null | undefined): string {
  if (warning?.state === "AT_BOUND") return "var(--bad)";
  if (warning?.state === "NEAR_BOUND") return "var(--accent-2)";
  return "var(--good)";
}

function ParameterTable({
  parameters,
  levels,
  pinned,
  kindWidth,
}: {
  parameters: readonly Parameter[];
  /** X2: exact grid levels per parameter, when the read publishes them. */
  levels?: Readonly<Record<string, number | null>>;
  /** X2: parameters the requested spec pinned (a what-if sibling) — the kind cell says so. */
  pinned?: ReadonlySet<string>;
  /** X2: a narrower kind cell when every kind is one short word, so θ*'s track keeps its room in a laptop column. */
  kindWidth?: number;
}) {
  /* Compact (laptop Stage A column): kind and levels narrow, so θ*'s track keeps real width beside the note. */
  const compact = kindWidth !== undefined && kindWidth < 112;
  const levelsWidth = compact ? 44 : 56;
  const noteWidth = compact ? 104 : 118;
  const columns = A1_COLUMNS.map((column) =>
    column.head === "kind" && kindWidth ? { ...column, width: kindWidth } : column.head === "levels" ? { ...column, width: levelsWidth } : column,
  );
  return (
    <div className="flex min-w-0 flex-col" data-parameters={parameters.length}>
      <div
        className="flex border-b pb-[3px] text-[9.5px] uppercase tracking-[.06em]"
        style={{ color: "var(--ink-faint)", borderColor: "var(--line-soft)" }}
        data-a1-head
      >
        {columns.map((column) => (
          <span
            key={column.head}
            className={`flex-none ${column.right ? "text-right" : ""}`}
            style={{ width: column.width }}
            data-align={column.right ? "right" : "left"}
          >
            {column.head}
          </span>
        ))}
        <span className="flex-1 pl-[14px]">θ* and range position</span>
      </div>

      {parameters.map((parameter) => (
        <div
          key={parameter.name}
          className="mono flex items-center border-b py-[2px] text-[10.5px]"
          style={{ borderColor: "var(--paper-sunken)" }}
          data-parameter={parameter.name}
        >
          <span className="w-[86px] flex-none">{parameter.name}</span>
          <span className="flex-none" style={{ color: "var(--ink-soft)", width: kindWidth ?? 112 }} data-kind={parameter.name}>
            {pinned?.has(parameter.name) ? "pinned (sibling)" : parameter.kind}
          </span>
          <span className="w-[96px] flex-none" style={{ color: "var(--ink-soft)" }} data-range={parameter.name}>
            {parameter.minimum} … {parameter.maximum}
          </span>
          <span className="w-[44px] flex-none text-right" style={{ color: "var(--ink-soft)" }} data-step={parameter.name}>
            {parameter.step}
          </span>
          {/* Levels: the exact count when the read publishes it; otherwise the cell
              keeps its place and the absence is printed once, under the table. */}
          {levels && levels[parameter.name] != null ? (
            <span className="flex-none text-right" style={{ width: levelsWidth }} data-levels={parameter.name} data-levels-state="AVAILABLE" title="(maximum − minimum) / step + 1, from the declaration">
              {levels[parameter.name]}
            </span>
          ) : (
            <span
              className="flex-none text-right"
              style={{ width: levelsWidth }}
              title={LEVELS_REASON}
              data-levels={parameter.name}
              data-levels-state="NOT_PUBLISHED"
            >
              <span className="sr-only">levels not published</span>
            </span>
          )}
          <span className="flex flex-1 items-center gap-2 pl-[14px]">
            <span className="w-[44px] flex-none text-right" style={{ color: "var(--good)" }} data-effective={parameter.name}>
              {parameter.effective_value}
            </span>
            <span
              className="relative h-[11px] flex-1 border-b"
              style={{ borderColor: "var(--line)" }}
              role="img"
              aria-label={`${parameter.name} ${parameter.effective_value} at ${parameter.position_percent}% of ${parameter.minimum} … ${parameter.maximum}`}
              title={`${parameter.effective_value} sits at ${parameter.position_percent}% of the declared range · ${parameter.bound_state}`}
            >
              <span
                data-position={parameter.name}
                data-position-percent={parameter.position_percent}
                data-tick-tone={parameter.bound_warning?.state ?? "NOT_PUBLISHED"}
                className="absolute bottom-[-1px] h-[11px] w-[2px]"
                style={{ left: `${parameter.position_percent}%`, background: tickTone(parameter.bound_warning) }}
              />
            </span>
            {/* DR-02: the shared server definition, the shared renderer (S06 = S07). */}
            <span className="flex-none text-[9px] leading-[1.25]" style={{ width: noteWidth }} data-bound-state={parameter.bound_state}>
              <BoundWarningNote warning={parameter.bound_warning} positionPercent={parameter.position_percent} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ the ledger */

/** The rest of the ledger, one cursor page at a time (D5). */
interface LedgerMore {
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  onMore: () => void;
}

function LedgerPanel({
  slot,
  detail,
  onNeeded,
  pick,
  onPick,
  onClear,
  foldNote,
  more,
}: {
  slot: LedgerSlot;
  detail: SearchDetailDocument;
  onNeeded: () => void;
  pick: string | null;
  onPick: (trialId: string) => void;
  onClear?: () => void;
  foldNote: string | null;
  more?: LedgerMore;
}) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);

  const ledgerGap = { state: detail.ledger.state, reason_code: detail.ledger.reason_code };

  return (
    <section className="flex min-w-0 flex-col overflow-x-auto rounded-[6px] border" style={CARD_STYLE} data-ledger={slot.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--line)" }} data-ledger-title>
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          trial ledger — Optuna trials
        </h3>
        {slot.state === "ready" ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-ledger-total>
            {slot.search.ledger.trials.length} of {slot.search.ledger.source_trial_count} retained trials
          </span>
        ) : null}
      </div>

      {slot.state === "ready" ? (
        <LedgerRows search={slot.search} pick={pick} onPick={onPick} onClear={onClear} foldNote={foldNote} more={more} />
      ) : (
        <>
          <LedgerHead />
          <div className="flex flex-col gap-1 px-3 py-2.5">
            {slot.state === "not-applicable" ? (
              /* RF-05: the retained lane answered a typed not-applicable. */
              <div className="flex flex-col gap-1" data-ledger-shell>
                <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                  {/* H18: one sentence; the server's codes ride in the tooltip. */}
                  <span
                    title={`${ledgerGap.reason_code ?? ""} · ${slot.answer.lane.reason_code} · adapter ${slot.answer.lane.run_adapter_contract_digest}`}
                    data-ledger-lane="not-applicable"
                  >
                    {ledgerGap.state === "NOT_APPLICABLE" ? "No trial ledger — fixed profile ran no search." : `Trial ledger — ${SEARCH_GAP_WORDS[ledgerGap.state as SearchSourceGap["state"]] ?? ledgerGap.state}.`}
                  </span>
                  <span hidden data-ledger-gap-state={ledgerGap.state} />
                </p>
              </div>
            ) : slot.state === "refused" ? (
              <div className="flex flex-col gap-1" data-ledger-refusal data-ledger-lane={slot.laneState ?? "refused"}>
                <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                  {slot.laneState ? (
                    <span data-lane-state={slot.laneState}>retained ledger lane — {LANE_STATE_COPY[slot.laneState]}</span>
                  ) : (
                    <RefusalNote refusal={slot.refusal} />
                  )}
                </p>
                <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
                  Search contract: ledger{" "}
                  <span className="mono" data-ledger-gap-state={ledgerGap.state}>
                    {SEARCH_GAP_WORDS[ledgerGap.state as SearchSourceGap["state"]] ?? ledgerGap.state}
                  </span>{" "}
                  — <span className="mono">{ledgerGap.reason_code}</span>
                </p>
              </div>
            ) : (
              <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                asking the retained ledger lane…
              </p>
            )}
          </div>
        </>
      )}

    </section>
  );
}

/** HiFi ledger columns (px). S_IS and S_OOS are numbers (right); digest and note sit after a 14 px gutter. */
const LEDGER_COLUMNS: { head: string; width: number; right?: boolean; gutter?: boolean }[] = [
  { head: "trial", width: 62 },
  { head: "seed", width: 50 },
  { head: "state", width: 96 },
  { head: "S_IS", width: 76, right: true },
  { head: "S_OOS", width: 120, right: true },
  { head: "digest", width: 110, gutter: true },
  { head: "note", width: 0, gutter: true },
];

function columnClass(column: (typeof LEDGER_COLUMNS)[number]): string {
  return `${column.width ? "flex-none" : "flex-1"} ${column.right ? "text-right" : "text-left"} ${column.gutter ? "pl-[14px]" : ""}`;
}

function columnStyle(column: (typeof LEDGER_COLUMNS)[number]) {
  return column.width ? { width: column.width } : undefined;
}

/** HiFi trial-state colours: SELECTED gold, PRUNED faint, INFEASIBLE red, COMPLETE green. */
export function trialStateTone(state: string): string {
  switch (state.toUpperCase()) {
    case "SELECTED":
      return "var(--accent-2)";
    case "PRUNED":
      return "var(--ink-faint)";
    case "INFEASIBLE":
    case "FAIL":
    case "FAILED":
      return "var(--bad)";
    case "COMPLETE":
      return "var(--good)";
    default:
      return "var(--ink-faint)";
  }
}

function LedgerHead() {
  return (
    <div
      className="flex min-w-[760px] border-b px-3 py-[5px] text-[9.5px] uppercase tracking-[.06em]"
      style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}
      data-ledger-head
    >
      {LEDGER_COLUMNS.map((column) => (
        <span key={column.head} className={columnClass(column)} style={columnStyle(column)} data-align={column.right ? "right" : "left"}>
          {column.head}
        </span>
      ))}
    </div>
  );
}

function NotPublished({ title }: { title: string }) {
  return (
    <span className="italic" style={{ color: "var(--ink-faint)" }} title={title}>
      not published
    </span>
  );
}

/**
 * The retained ledger, when the run is in the admitted profile. Selected,
 * raw-best and inspected stay three separate ideas, as RS-02 requires: the
 * source's selection is the gold row, the row the reader clicked is the accent
 * row, and clicking never selects anything.
 */
function LedgerRows({
  search,
  pick,
  onPick,
  onClear,
  foldNote,
  more,
}: {
  search: CurrentSourceSearch;
  pick: string | null;
  onPick: (trialId: string) => void;
  onClear?: () => void;
  foldNote: string | null;
  more?: LedgerMore;
}) {
  const trials = search.ledger.trials;
  const selectedId = search.selection.selected_trial_id;
  const picked = pick;
  /* D1: the ledger is one tab stop (the picked row, else the first); arrows walk the rows, Escape lets go of the pick.
     D9: a pick no longer scrolls the page to its row — the pick chip names it where the reader is. */
  const tabStop = trials.some((trial) => trial.trial_id === picked) ? picked : (trials[0]?.trial_id ?? null);
  const onRowKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && picked !== null && onClear) {
      event.preventDefault();
      onClear();
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : event.key === "Home" ? "first" : event.key === "End" ? "last" : null;
    if (step === null) return;
    const rows = [...(event.currentTarget.querySelectorAll("[data-trial]") as NodeListOf<HTMLElement>)];
    const here = rows.indexOf(event.target as HTMLElement);
    if (here < 0) return;
    event.preventDefault();
    const target = here + (typeof step === "number" ? step : 0);
    const next = step === "first" || target < 0 ? 0 : step === "last" || target > rows.length - 1 ? rows.length - 1 : target;
    rows[next]?.focus();
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-1">
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-candidate-count>
          {search.candidates.rows.length} of {search.candidates.source_candidate_count} candidates
        </span>
        {search.search_contract ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-ledger-scope>
            {search.search_contract.optuna_trials_scope ?? "scope not published"} study
            {foldNote ? ` · ${foldNote}` : ""}
          </span>
        ) : null}
        {selectedId !== null ? (
          <Chip data-selected-trial={selectedId} tone="var(--accent-2)" border="var(--accent-2)">
            selected {selectedId}
          </Chip>
        ) : (
          <span
            className="mono text-[10px] italic"
            style={{ color: "var(--ink-faint)" }}
            data-retained-withheld={search.selection.availability.state}
            title={search.selection.availability.reason_code ?? search.selection.availability.state}
          >
            selection — {search.selection.availability.state}
          </span>
        )}
      </div>
      <LedgerHead />
      <div onKeyDown={onRowKey} data-ledger-rows>
      {trials.map((trial) => {
        const selected = trial.trial_id === selectedId;
        /* Optional: a pre-W3 responder sends the row without its facts. */
        const facts = (trial as Partial<RetainedTrial>).facts;
        return (
          <button
            key={trial.trial_id}
            type="button"
            className="mono flex w-full min-w-[760px] items-baseline border-0 border-b border-solid px-3 py-1 text-left text-[10.5px]"
            style={{
              borderBottomColor: "var(--paper-sunken)",
              color: "var(--ink)",
              background: selected ? "var(--accent-2-soft)" : picked === trial.trial_id ? "var(--accent-soft)" : "transparent",
            }}
            aria-pressed={picked === trial.trial_id}
            tabIndex={trial.trial_id === tabStop ? 0 : -1}
            onClick={() => onPick(trial.trial_id)}
            data-trial={trial.trial_id}
            data-trial-selected={selected}
          >
            <span className={columnClass(LEDGER_COLUMNS[0])} style={columnStyle(LEDGER_COLUMNS[0])}>
              {trial.trial_id}
            </span>
            <span className={columnClass(LEDGER_COLUMNS[1])} style={columnStyle(LEDGER_COLUMNS[1])}>
              <NotPublished title="seed is not published per trial" />
            </span>
            <span
              className={`${columnClass(LEDGER_COLUMNS[2])} text-[9px]`}
              style={{ ...columnStyle(LEDGER_COLUMNS[2]), color: trialStateTone(trial.state) }}
              data-trial-state={trial.state}
            >
              {trial.state}
            </span>
            <span className={columnClass(LEDGER_COLUMNS[3])} style={columnStyle(LEDGER_COLUMNS[3])} data-trial-is>
              {facts ? (
                <MetricCell metric={facts.metrics.mean_is_sharpe} />
              ) : (
                trial.objective ?? <NotPublished title="the retained trial publishes no objective" />
              )}
            </span>
            <span className={columnClass(LEDGER_COLUMNS[4])} style={columnStyle(LEDGER_COLUMNS[4])} data-trial-oos>
              {facts ? (
                <MetricCell metric={facts.metrics.mean_oos_sharpe} />
              ) : (
                <NotPublished title="the retained ledger publishes no OOS value per trial (CG-P15-03)" />
              )}
            </span>
            <span className={columnClass(LEDGER_COLUMNS[5])} style={columnStyle(LEDGER_COLUMNS[5])} data-trial-digest={trial.params_digest ?? ""}>
              {trial.params_digest ? (
                <span title={trial.params_digest}>{shortDigest(trial.params_digest)}</span>
              ) : (
                <NotPublished title="this trial row carries no params_digest" />
              )}
            </span>
            <span
              className={`${columnClass(LEDGER_COLUMNS[6])} text-[9.5px]`}
              style={{ color: "var(--ink-faint)" }}
              data-trial-note
              title={
                facts && facts.state === "AVAILABLE"
                  ? `${facts.stage ?? "stage not published"} · ${scopeWords(facts)} · objective = ${OBJECTIVE_KIND_WORDS[facts.objective_kind]}`
                  : undefined
              }
            >
              {Object.keys(trial.parameters).length > 0
                ? Object.entries(trial.parameters)
                    .map(([name, value]) => `${name}=${cleanParamText(value)}`)
                    .join(" · ")
                : "parameters not published"}
            </span>
          </button>
        );
      })}
      </div>
      {more && (more.hasMore || more.error) ? (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2" data-ledger-more>
          {more.hasMore ? (
            <button type="button" className="btn-ghost mono text-[10px]" disabled={more.loading} title={more.loading ? "Reading the next page of trials" : undefined} onClick={more.onMore} data-action="ledger-more">
              {more.loading ? "loading more trials…" : `show more trials (${trials.length} of ${search.ledger.source_trial_count})`}
            </button>
          ) : null}
          {more.error ? (
            <span className="mono text-[10px]" style={{ color: "var(--bad)" }} data-ledger-more-error role="alert">
              Could not read the next page. Try again.
            </span>
          ) : null}
        </div>
      ) : null}
      {search.candidates.rows.length > 0 && (search.candidates.rows[0] as Partial<RetainedCandidate>).facts ? <CandidateLedger search={search} /> : null}
    </div>
  );
}

/* ------------------------------------------------- retained WFO lane (W3) */

type RetainedTrial = CurrentSourceSearch["ledger"]["trials"][number];
type RetainedCandidate = CurrentSourceSearch["candidates"]["rows"][number];
type TrialFacts = RetainedTrial["facts"];

/** A ratio the HiFi prints to two places, the screen's minus; the exact string rides in the title. */
function ratio2(value: string | null): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed).replace(/^-/, "−");
}

/** Objective-kind words: which number a row's `objective` is (W1 receipt bug b). */
const OBJECTIVE_KIND_WORDS: Record<string, string> = {
  IS_MEAN_SHARPE: "IS mean Sharpe",
  MODE_1_DECAY_J: "Mode 1 J (OOS-adjusted)",
  NOT_PUBLISHED: "objective kind not published",
};

function MetricCell({ metric }: { metric: TrialFacts["metrics"]["mean_is_sharpe"] }) {
  const shown = ratio2(metric.value);
  if (shown === null) {
    return (
      <span className="italic" style={{ color: "var(--ink-faint)" }} title={metric.reason_code ?? undefined} data-metric-absent={metric.reason_code ?? ""}>
        {metric.reason_code === "QUANTBT_IS_SEARCH_STAGE_DOES_NOT_EVALUATE_OOS" ? "not evaluated · IS stage" : "not published"}
      </span>
    );
  }
  return <span title={metric.value ?? undefined}>{shown}</span>;
}

function scopeWords(facts: TrialFacts): string {
  if (facts.fold_scope.kind === "ALL_OUTER_FOLDS") return "all outer folds";
  if (facts.fold_scope.kind === "FOLD") return `fold ${facts.fold_scope.fold_id}`;
  return "fold scope not published";
}

/**
 * W3 · CG-P15-03: the Stage B ledger — QuantBT's candidate replays, each with
 * the OOS numbers the IS search never produced and the J the selector ranked.
 */
function CandidateLedger({ search }: { search: CurrentSourceSearch }) {
  const selectedId = search.selection.selected_trial_id;
  return (
    <div className="border-t" style={{ borderColor: "var(--line)" }} data-candidate-ledger={search.candidates.rows.length}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          candidate replays — Stage B
        </h3>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {search.candidates.rows.length} of {search.candidates.source_candidate_count} candidates
        </span>
      </div>
      <div className="flex min-w-[760px] border-b px-3 py-[5px] text-[9.5px] uppercase tracking-[.06em]" style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}>
        <span className="w-[86px] flex-none">candidate</span>
        <span className="w-[76px] flex-none">from trial</span>
        <span className="w-[76px] flex-none text-right">S_IS</span>
        <span className="w-[86px] flex-none text-right">S̄_OOS</span>
        <span className="w-[76px] flex-none text-right">decay</span>
        <span className="w-[86px] flex-none text-right">J</span>
        <span className="flex-1 pl-[14px]">note</span>
      </div>
      {search.candidates.rows.map((candidate: RetainedCandidate) => {
        const selected = candidate.facts.source_trial_id === selectedId && candidate.objective === search.selection.objective;
        return (
          <div
            key={candidate.candidate_id}
            className="mono flex min-w-[760px] items-baseline border-b px-3 py-1 text-[10.5px]"
            style={{ borderColor: "var(--paper-sunken)", background: selected ? "var(--accent-2-soft)" : "transparent" }}
            data-candidate={candidate.candidate_id}
            data-candidate-selected={selected}
          >
            <span className="w-[86px] flex-none">{candidate.candidate_id}</span>
            <span className="w-[76px] flex-none">{candidate.facts.source_trial_id ?? "—"}</span>
            <span className="w-[76px] flex-none text-right"><MetricCell metric={candidate.facts.metrics.mean_is_sharpe} /></span>
            <span className="w-[86px] flex-none text-right"><MetricCell metric={candidate.facts.metrics.mean_oos_sharpe} /></span>
            <span className="w-[76px] flex-none text-right"><MetricCell metric={candidate.facts.metrics.mean_decay} /></span>
            <span className="w-[86px] flex-none text-right" title={candidate.objective ?? undefined}>
              {ratio2(candidate.objective) ?? <NotPublished title="the retained candidate publishes no objective" />}
            </span>
            <span className="flex-1 pl-[14px] text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              {candidate.facts.stage ?? "stage not published"} · {scopeWords(candidate.facts)}
              {selected ? " · selected by policy" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** W3 · B1: the pool the selector saw, from the source's own counts — never a derived k. */
function RetainedPoolFreeze({ search }: { search: CurrentSourceSearch }) {
  const contract = search.search_contract;
  const rows: [string, number | null, string][] = [
    ["Optuna trials (Stage A)", search.ledger.source_trial_count, `${contract.optuna_trials_scope ?? "scope not published"} study · ${contract.n_studies ?? "?"} study`],
    [
      "candidate pool",
      search.candidates.source_candidate_count,
      contract.top_is_fraction !== null ? `top_is_fraction ${contract.top_is_fraction}` : contract.top_is_k !== null ? `top_is_k ${contract.top_is_k}` : "pool rule not published",
    ],
    ["selected", search.selection.selected_trial_id === null ? null : 1, contract.candidate_selection_metric ?? "selector not published"],
  ];
  /* Bar length is geometry only: each count against the Stage A trial count. */
  const most = search.ledger.source_trial_count;
  return (
    <div className="flex flex-col gap-[5px]" data-retained-pool="pre-e5">
      <span className="mono text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} title={SERVER_PREDATES_POOL} data-gap-reason="pool">
        pool counts and K — not published · rows below are ledger totals
      </span>
      {rows.map(([label, n, note]) => (
        <span key={label} className="mono flex items-center gap-2 text-[10.5px]" data-pool-row={label}>
          <span className="w-[158px] flex-none text-[10.5px] [font-family:var(--font-body)]" style={{ color: "var(--ink-soft)" }}>
            {label}
          </span>
          {n !== null ? <span className="h-[8px] rounded-[2px]" style={{ width: `${n === 0 ? 2 : Math.round((n / most) * 120)}px`, background: "var(--accent-2)" }} /> : null}
          <span className="min-w-[40px] flex-none text-right">
            {n !== null ? n : <span className="italic" style={{ color: "var(--ink-faint)" }}>not published</span>}
          </span>
          <span className="flex-1 pl-1.5 text-[9px]" style={{ color: "var(--ink-faint)" }}>
            {note}
          </span>
        </span>
      ))}
    </div>
  );
}

const TERM_WORDS: Record<string, string> = {
  mean_oos_sharpe: "mean OOS Sharpe",
  std_decay: "decay dispersion",
  positive_mean_decay: "positive mean decay",
  mean_is_sharpe: "mean IS Sharpe",
};

/**
 * W3 · B2 / CG-P15-04: the selected candidate's objective, term by term, as
 * the retained probe published it (every term recomposes QuantBT's own J).
 * The frontend adds nothing up.
 */
function RetainedFormula({ search }: { search: CurrentSourceSearch }) {
  const selected = search.candidates.rows.find((row) =>
    row.facts.source_trial_id === search.selection.selected_trial_id && row.objective === search.selection.objective);
  const components = selected?.facts.objective_components ?? null;
  if (!components || components.state !== "AVAILABLE") {
    return (
      <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={components?.reason_code ?? search.diagnostics.objective_components.reason_code ?? undefined} data-retained-formula="absent">
        objective components — not published
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-[2px]" data-retained-formula={components.formula}>
      <TypesetFormula search={search} selected={selected} />
      {components.terms.map((term) => (
        <span key={term.term} className="flex items-baseline gap-[9px] border-b py-0.5 text-[10.5px]" style={{ borderColor: "var(--paper-sunken)" }} data-formula-term={term.term}>
          <span className="mono w-[150px] flex-none" style={{ color: "var(--ink-soft)" }}>
            {term.term}
          </span>
          <span className="flex-1" style={{ color: "var(--ink-faint)" }}>
            {TERM_WORDS[term.term] ?? term.term} · {ratio2(term.value) ?? "not published"} × {term.weight.replace(/^-/, "−")}
          </span>
          <span className="mono text-[11px] font-semibold" title={term.contribution}>
            {ratio2(term.contribution) ?? "not published"}
          </span>
        </span>
      ))}
      <span className="flex items-baseline gap-[9px] pt-0.5 text-[10.5px]" data-formula-total>
        <span className="mono w-[150px] flex-none" style={{ color: "var(--accent-2)" }}>
          J (selected)
        </span>
        <span className="flex-1" style={{ color: "var(--ink-faint)" }}>
          {search.diagnostics.probe.objective_rows_recomposed} of {search.diagnostics.probe.objective_rows} recompose
        </span>
        <span className="mono font-semibold" title={search.selection.objective ?? undefined}>
          {ratio2(search.selection.objective) ?? <NotPublished title="the selection publishes no objective" />}
        </span>
      </span>
      {/* HiFi Mode 1 sub-panels (6.10): θ*'s per-fold decay and the pool on the S_IS × S̄_OOS plane. */}
      <div className="flex flex-wrap gap-[14px] pt-1.5" data-formula-panels>
        <FoldDecayBars pool={search.pool} />
        <PoolPlane search={search} selected={selectedCandidate(search)} />
      </div>
    </div>
  );
}

/** A quiet stage-to-stage link (mono 10px, accent) that keeps the cursor it was built with. */
function StageLink({ to, action, title, children }: { to: string; action: string; title: string; children: ReactNode }) {
  return (
    <Link to={to} className="mono text-[10px] normal-case tracking-normal" style={{ color: "var(--accent)" }} data-action={action} title={title}>
      {children}
    </Link>
  );
}

/** W3 · B3: raw IS best, the selected candidate and a centroid kept apart. */
function RetainedBestVsSelected({ search, freezeHref }: { search: CurrentSourceSearch; freezeHref: string | null }) {
  const roles = search.selection.roles;
  const card = (role: typeof roles.raw_best_is, title: string, tone: string, tag: string, key: string) => (
    <div className="flex flex-1 flex-col gap-1 rounded-[6px] border px-3 py-2.5" style={{ borderColor: key === "selected" ? "var(--accent-2)" : "var(--line)", background: key === "selected" ? "var(--paper)" : "transparent" }} data-role-card={key}>
      <span className="flex items-baseline justify-between">
        <span className="mono text-[11px]" style={{ color: tone }}>
          {title} {role.trial_id ?? "—"}
        </span>
        <span className="mono text-[8.5px] font-bold tracking-[.08em]" style={{ color: tone }}>
          {tag}
        </span>
      </span>
      {role.state === "AVAILABLE" ? (
        <span className="mono flex justify-between gap-2.5 text-[10.5px]">
          <span style={{ color: "var(--ink-faint)" }}>{OBJECTIVE_KIND_WORDS[role.objective_kind]}</span>
          <span title={role.objective ?? undefined}>{ratio2(role.objective) ?? "not published"}</span>
        </span>
      ) : (
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={role.reason_code ?? undefined}>
          {role.state === "NOT_APPLICABLE" ? "n/a" : "not published"}
        </span>
      )}
    </div>
  );
  const same = roles.raw_best_is_equals_selected;
  /* E5 · 6.11: each card lists S_IS, S̄_OOS, d̄ decay and max_dd (SearchStageB); an older server keeps one number per card. */
  const fourRows = search.candidates.rows.some((row) => (row as Partial<RetainedCandidate>).max_drawdown !== undefined);
  return (
    <div className="flex flex-col gap-2" data-retained-roles>
      {fourRows ? (
        <BestVsSelectedCards search={search} />
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {card(roles.raw_best_is, "best_trial", "var(--bad)", "RANK 1 BY IS", "raw-best")}
          {card(roles.selected, "selected", "var(--accent-2)", "SELECTED BY POLICY", "selected")}
        </div>
      )}
      <span className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }} data-roles-note>
        {same === true
          ? "Same trial."
          : same === false
            ? "Selector did not take the IS best."
            : "No selection published."}
        {/* H13: the centroid is only worth a sentence when it is a gap that is not by design. */}
        {roles.centroid.state === "NOT_APPLICABLE" ? (
          <span hidden data-centroid={roles.centroid.state} title={roles.centroid.reason_code ?? undefined} />
        ) : (
          <span data-centroid={roles.centroid.state} title={roles.centroid.reason_code ?? undefined}>
            {" "}
            Centroid — not published
          </span>
        )}
      </span>
      {freezeHref !== null && roles.selected.state === "AVAILABLE" ? (
        <StageLink to={freezeHref} action="selected-to-freeze" title="Open S3 · Freeze — this selected θ* as sealed, with its digest">
          θ* sealed in S3 →
        </StageLink>
      ) : null}
    </div>
  );
}

/* ------------------------------------------ retained WFO run facts (W3b) */

/*
 * The P15 hub read covers P04 fixed-profile runs only. On a Delta walk-forward
 * run it answers its own lane code (`P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED`),
 * which describes the hub, not the run. Once the retained lane answered
 * AVAILABLE, every panel below is filled from it — the search contract, the
 * probe, the ledger, the candidates, the selection — and a panel it does not
 * cover prints the retained lane's own typed absence. No hub code is printed.
 */

type RetainedFact = CurrentSourceSearch["diagnostics"]["importance"];

/** The UI's own code (researchRefusal.ts) for a figure the retained lane carries no field for. */
export const RETAINED_NO_FIELD = "UI_RETAINED_LANE_HAS_NO_FIELD";

/** A server state token in words (`FIXED_PROFILE_NO_SEARCH` → `fixed profile no search`); callers keep the token in a title. */
export function stateWords(token: string): string {
  return token.toLowerCase().replace(/_/g, " ");
}

function noField(): SearchSourceGap {
  return { state: "NOT_PUBLISHED", reason_code: RETAINED_NO_FIELD } as SearchSourceGap;
}

function factGap(fact: RetainedFact): SearchSourceGap {
  return { state: fact.state, reason_code: fact.reason_code } as SearchSourceGap;
}

/** A Stage A/B frame filled from the retained lane: the HiFi frame, the lane's own words. */
function RetainedPanel({ id, title, state, children }: { id: string; title: string; state: string; children: ReactNode }) {
  return (
    <section className={`${CARD} min-w-0`} style={CARD_STYLE} data-panel={id} data-panel-state={state} data-panel-lane="retained">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          {title}
        </h3>
        <span className="mono text-[9px]" style={{ color: "var(--good)" }} title="read from the retained current-source lane for this run">
          QUANTBT · retained
        </span>
      </div>
      {children}
    </section>
  );
}

/** The trials in the page the retained lane returned, in source order. */
function retainedTrials(search: CurrentSourceSearch): RetainedTrial[] {
  return search.ledger.trials;
}

/** Parameter names, in the order the selection publishes them (else the first trial's). */
function retainedParameterNames(search: CurrentSourceSearch): string[] {
  const selected = Object.keys(search.selection.parameters ?? {});
  if (selected.length > 0) return selected;
  return Object.keys(retainedTrials(search)[0]?.parameters ?? {});
}

/** "3 of 3", or the page the lane returned when it is not the whole ledger. */
function trialPageWords(search: CurrentSourceSearch): string {
  return `${search.ledger.returned_rows} of ${search.ledger.source_trial_count}`;
}

/** Range, step and kind of one declared parameter — printed as the registry serves them. */
function declaredCells(declared: DeclaredParameter | undefined): { kind: string; range: string; step: string } | null {
  if (!declared) return null;
  switch (declared.kind) {
    case "int_range":
    case "float_range":
      return { kind: declared.kind, range: `${declared.low} … ${declared.high}`, step: String(declared.step) };
    case "categorical":
      return { kind: declared.kind, range: declared.values.map(String).join(" · "), step: "" };
    case "fixed":
      return { kind: declared.kind, range: String(declared.value), step: "" };
  }
}

/**
 * A1 on a retained run: the parameters the retained selection carries, their
 * declared range from the alpha registry for the version the run was admitted
 * with (the requested spec overrides nothing), θ* from QuantBT's selection.
 * No range position is drawn: the lane publishes none and the browser does
 * not work one out.
 */
/** X2: θ*'s declared rows as the hub A1 shape — the server's own values, placement and DR-02 warning. */
function declaredParameters(space: DeclaredSpace): Parameter[] {
  return space.parameters.map((parameter) => ({
    name: parameter.name,
    kind: parameter.kind,
    minimum: parameter.minimum,
    maximum: parameter.maximum,
    step: parameter.step,
    effective_value: parameter.value,
    position_percent: parameter.position_percent,
    bound_state: "WITHIN_DECLARED_RANGE" as const,
    bound_warning: parameter.bound_warning,
  }));
}

/** Parameters the admitted requested spec pinned (a what-if sibling's `parameter_space_overrides`). */
function pinnedNames(run: RetainedRunFacts | undefined): Set<string> {
  const identity = run?.identity.state === "ready" ? run.identity.identity : null;
  const overrides = (identity?.requested?.requested_spec as Record<string, unknown> | null | undefined)?.parameter_space_overrides;
  return new Set(
    Array.isArray(overrides)
      ? overrides.filter((item): item is { kind: string; name: string } => typeof item === "object" && item !== null && (item as { kind?: unknown }).kind === "pin")
        .map((item) => item.name)
      : [],
  );
}

/**
 * X2 · B3: A1 on a retained run when the server publishes the declared space
 * it searched — the A10b binding of the retained lane profile, θ* placed in
 * each range with the shared DR-02 warning (S06 = S07), exact levels and the
 * grid size. A typed absence prints the server's reason.
 */
function ServedSearchSpace({ search, space, run }: { search: CurrentSourceSearch; space: DeclaredSpace; run: RetainedRunFacts | undefined }) {
  const identity = run?.identity.state === "ready" ? run.identity.identity : null;
  const window = walkForwardOf(identity?.requested ?? null);
  const probe = search.diagnostics.probe;
  const contract = search.search_contract;
  const pending = run?.identity.state === "loading";
  const levels = Object.fromEntries(space.parameters.map((parameter) => [parameter.name, parameter.levels]));
  return (
    <section className={`${CARD} min-w-0 overflow-x-auto`} style={CARD_STYLE} tabIndex={0} aria-label="search space as declared" data-panel="search-space" data-panel-lane="retained" data-space-state={space.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          A1 · search space as declared
        </h3>
        <span
          className="mono text-[9.5px]"
          style={{ color: "var(--ink-faint)" }}
          data-space-source="server"
          title={space.binding ? `profile digest ${space.binding.profile_digest} · adapter ${space.binding.adapter_contract_digest}` : space.reason_code ?? undefined}
        >
          {space.binding ? `${space.binding.profile_id} · binding ${space.binding.installed_in_release}` : "config.parameter_space"}
        </span>
      </div>
      {space.state === "AVAILABLE" ? (
        <ParameterTable parameters={declaredParameters(space)} levels={levels} pinned={pinnedNames(run)} kindWidth={pinnedNames(run).size > 0 ? 112 : 56} />
      ) : (
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-gap-fact="ranges" data-gap-state={space.state}>
          <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            kind · range · step
          </span>
          <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={space.reason_code ?? undefined}>
            not published
          </span>
          <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            {reasonCodeSentence(space.reason_code ?? "")}
          </span>
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
            {space.reason_code}
          </span>
        </span>
      )}
      <div className="flex flex-wrap gap-x-[22px] gap-y-1 pt-[5px]" data-coverage>
        {space.grid_size !== null && space.grid_size !== undefined ? (
          <CoverageFact what="grid_size" value={`${groupDecimalString(String(space.grid_size))} points declared`} />
        ) : null}
        <CoverageFact what="sampler seed" value={window.seed !== null ? `${window.seed} · requested spec` : null} pending={pending} />
        <CoverageFact
          what="trials"
          value={`${window.trials !== null ? `${window.trials} requested · ` : ""}${search.ledger.source_trial_count} retained${contract.n_studies !== null ? ` · ${contract.n_studies} ${contract.n_studies === 1 ? "study" : "studies"}` : ""}`}
        />
        <Gap gap={factGap(probe.sampler)} what="sampler trace" />
        <Gap gap={factGap(probe.warm_start)} what="warm start" />
        <Gap gap={factGap(probe.dedupe)} what="dedupe" />
      </div>
      {/* H05: "trials retained" above and the declared grid size already say this. */}
    </section>
  );
}

function RetainedSearchSpace({ search, run }: { search: CurrentSourceSearch; run: RetainedRunFacts | undefined }) {
  /* X2: a server that publishes the declared space is the authority for A1. */
  if (search.declared_space) return <ServedSearchSpace search={search} space={search.declared_space} run={run} />;
  const names = retainedParameterNames(search);
  const identity = run?.identity.state === "ready" ? run.identity.identity : null;
  const requestedSpec = (identity?.requested?.requested_spec ?? null) as Record<string, unknown> | null;
  const overrides = requestedSpec?.parameter_space_overrides;
  const noOverrides = Array.isArray(overrides) && overrides.length === 0;
  const declared = run?.declared;
  const space = declared?.state === "ready" && noOverrides ? declared.space : null;
  const window = walkForwardOf(identity?.requested ?? null);
  const probe = search.diagnostics.probe;
  const contract = search.search_contract;
  const theta = search.selection.parameters ?? {};
  const pending = declared?.state === "loading" || run?.identity.state === "loading";

  return (
    <section className={`${CARD} min-w-0 overflow-x-auto`} style={CARD_STYLE} tabIndex={0} aria-label="search space as declared" data-panel="search-space" data-panel-lane="retained">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          A1 · search space as declared
        </h3>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-space-source={space ? "registry" : declared?.state ?? "none"}>
          {space && declared?.state === "ready"
            ? `declared by ${declared.alphaVersionId} · no overrides in the requested spec`
            : pending
              ? "reading the alpha's declared space…"
              : null}
        </span>
      </div>
      <div className="flex min-w-0 flex-col" data-parameters={names.length}>
        <div className="flex border-b pb-[3px] text-[9.5px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)", borderColor: "var(--line-soft)" }} data-a1-head>
          {A1_COLUMNS.map((column) => (
            <span key={column.head} className={`flex-none ${column.right ? "text-right" : ""}`} style={{ width: column.width }} data-align={column.right ? "right" : "left"}>
              {column.head}
            </span>
          ))}
          <span className="flex-1 pl-[14px]">θ* · selected trial {search.selection.selected_trial_id ?? "—"}</span>
        </div>
        {names.map((name) => {
          const cells = space ? declaredCells(space[name]) : null;
          return (
            <div key={name} className="mono flex items-center border-b py-[2px] text-[10.5px]" style={{ borderColor: "var(--paper-sunken)" }} data-parameter={name}>
              <span className="w-[86px] flex-none">{name}</span>
              <span className="w-[112px] flex-none" style={{ color: "var(--ink-soft)" }} data-kind={name}>
                {cells?.kind ?? ""}
              </span>
              <span className="w-[96px] flex-none" style={{ color: "var(--ink-soft)" }} data-range={name}>
                {cells?.range ?? ""}
              </span>
              <span className="w-[44px] flex-none text-right" style={{ color: "var(--ink-soft)" }} data-step={name}>
                {cells?.step ?? ""}
              </span>
              <span className="w-[56px] flex-none text-right" title={LEVELS_REASON} data-levels={name} data-levels-state="NOT_PUBLISHED">
                <span className="sr-only">levels not published</span>
              </span>
              <span className="flex-1 pl-[14px]" style={{ color: "var(--good)" }} data-effective={name}>
                {theta[name] ?? ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-[22px] gap-y-1 pt-[5px]" data-coverage>
        {space === null && !pending ? (
          <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-gap-fact="ranges" data-gap-state="NOT_PUBLISHED">
            <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              kind · range · step
            </span>
            <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={RETAINED_NO_FIELD}>
              not published
            </span>
            <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              {noOverrides || identity === null
                ? reasonCodeSentence(RETAINED_NO_FIELD)
                : "requested spec overrides the declared space — searched space not published"}
            </span>
          </span>
        ) : null}
        <span className="inline-flex items-baseline gap-x-1.5" data-gap-fact="levels" data-gap-state="NOT_PUBLISHED">
          <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            levels
          </span>
          <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={`${LEVELS_REASON} · ${RETAINED_NO_FIELD}`}>
            not published
          </span>
        </span>
        <CoverageFact what="sampler seed" value={window.seed !== null ? `${window.seed} · requested spec` : null} pending={pending} />
        <CoverageFact
          what="trials"
          value={`${window.trials !== null ? `${window.trials} requested · ` : ""}${search.ledger.source_trial_count} retained${contract.n_studies !== null ? ` · ${contract.n_studies} ${contract.n_studies === 1 ? "study" : "studies"}` : ""}`}
        />
        <Gap gap={factGap(probe.sampler)} what="sampler trace" />
        <Gap gap={factGap(probe.warm_start)} what="warm start" />
        <Gap gap={factGap(probe.dedupe)} what="dedupe" />
      </div>
    </section>
  );
}

function CoverageFact({ what, value, pending = false }: { what: string; value: string | null; pending?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-x-1.5" data-coverage-fact={what}>
      <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {what}
      </span>
      {value !== null ? (
        <span className="mono text-[10.5px]">{value}</span>
      ) : (
        <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={pending ? undefined : "the requested spec did not answer"}>
          {pending ? "reading…" : "not read"}
        </span>
      )}
    </span>
  );
}

/** A2 on a retained run: the trials are rows of the ledger; no surface projection is served or drawn. */
function RetainedSurface({ search }: { search: CurrentSourceSearch }) {
  return (
    <RetainedPanel id="scatter" title={DIAGNOSTIC_LABEL.scatter} state="IN_LEDGER">
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        surface projection — not published · {trialPageWords(search)} trials are rows of the ledger below
      </p>
      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-gap-reason="scatter">
        {RETAINED_NO_FIELD}
      </span>
    </RetainedPanel>
  );
}

/** A3 on a retained run: each trial's own objective in source order, and the probe's pruned count. No best-so-far is computed. */
function RetainedProgression({ search }: { search: CurrentSourceSearch }) {
  const trials = retainedTrials(search);
  const kind = (trials[0] as Partial<RetainedTrial> | undefined)?.facts?.objective_kind;
  const pruned = search.diagnostics.probe.pruned_trial_count;
  return (
    <RetainedPanel id="progression" title={DIAGNOSTIC_LABEL.progression} state="AVAILABLE">
      <div className="flex flex-wrap gap-x-4 gap-y-1" data-progression>
        {trials.map((trial) => (
          <span key={trial.trial_id} className="mono text-[10.5px]" data-progression-trial={trial.trial_id}>
            <span style={{ color: "var(--ink-faint)" }}>trial {trial.trial_id}</span>{" "}
            <span title={trial.objective ?? undefined}>{ratio2(trial.objective) ?? <NotPublished title="the retained trial publishes no objective" />}</span>
          </span>
        ))}
      </div>
      <span className="text-[10px]" style={{ color: "var(--ink-faint)" }} data-progression-note>
        {kind ? `${OBJECTIVE_KIND_WORDS[kind] ?? kind}, ` : ""}in source order · pruned{" "}
        <span className="mono" data-pruned-count>
          {pruned !== null ? `${pruned} of ${search.ledger.source_trial_count}` : "count not published"}
        </span>{" "}
        (capability probe)
      </span>
    </RetainedPanel>
  );
}

/** A4 on a retained run: the values each parameter took, trial by trial, as the ledger publishes them — no bins. */
function RetainedSampledValues({ search }: { search: CurrentSourceSearch }) {
  const trials = retainedTrials(search);
  const theta = search.selection.parameters ?? {};
  return (
    <RetainedPanel id="distributions" title="A4 · per-parameter sampled values" state="AVAILABLE">
      <div className="flex min-w-0 flex-col overflow-x-auto" data-sampled-values>
        <div className="flex border-b pb-[3px] text-[9.5px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)", borderColor: "var(--line-soft)" }}>
          <span className="w-[86px] flex-none">param</span>
          <span className="flex-1">sampled, trial {trials.map((trial) => trial.trial_id).join(" · ")}</span>
          <span className="w-[56px] flex-none text-right">θ*</span>
        </div>
        {retainedParameterNames(search).map((name) => (
          <div key={name} className="mono flex items-baseline border-b py-[2px] text-[10.5px]" style={{ borderColor: "var(--paper-sunken)" }} data-sampled={name}>
            <span className="w-[86px] flex-none">{name}</span>
            <span className="flex-1" style={{ color: "var(--ink-soft)" }}>
              {trials.map((trial) => trial.parameters[name] ?? "—").join(" · ")}
            </span>
            <span className="w-[56px] flex-none text-right" style={{ color: "var(--good)" }}>
              {theta[name] ?? ""}
            </span>
          </div>
        ))}
      </div>
      <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
        {trialPageWords(search)} trials · values as in the ledger
      </span>
    </RetainedPanel>
  );
}

/** B4 on a retained run: the selected candidate's own fold scope says whether θ* moves between folds. */
function RetainedThetaJourney({ search }: { search: CurrentSourceSearch }) {
  const selected = search.candidates.rows.find(
    (row) => row.facts?.source_trial_id === search.selection.selected_trial_id && row.objective === search.selection.objective,
  );
  const scope = selected?.facts?.fold_scope ?? null;
  if (scope === null || scope.kind !== "ALL_OUTER_FOLDS") {
    return <EmptyPanel id="parameter_frequency" title={DIAGNOSTIC_LABEL.parameter_frequency} gap={noField()} sentence />;
  }
  return (
    <RetainedPanel id="parameter_frequency" title={DIAGNOSTIC_LABEL.parameter_frequency} state="ONE_SELECTION_ALL_FOLDS">
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        global θ* (trial <span className="mono">{search.selection.selected_trial_id}</span>) — no per-fold journey
      </p>
      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
        fold_scope {scope.kind} · schedule {search.search_contract.optimization_schedule ?? "not published"}
      </span>
    </RetainedPanel>
  );
}

/**
 * "What this mode reads" on a retained run (HiFi 6.4, G8): the per-fold glyph
 * strip and its note, drawn from the fold plan and the Atlas's own mode
 * descriptor; then, on a line of their own, the search contract's tokens and
 * the Atlas's, verbatim.
 */
function RetainedModeReads({ search, runId, view }: { search: CurrentSourceSearch; runId: string; view: ModeReadsView }) {
  const contract = search.search_contract;
  const probe = search.diagnostics.probe;
  /*
   * The Atlas's own words for this mode × schedule, when the strip was drawn
   * from them: what the mode reads, what it retains, and — when the engine
   * states no condition on it — whether it uses OOS. The claim row above
   * already prints the contract's claim tokens, so they are not repeated here.
   */
  const atlasTokens: [string, string | null, string?][] =
    view.kind === "strip"
      ? [
          view.reads.state === "PUBLISHED"
            ? ["selection_inputs", view.reads.inputs.join(" · ")]
            : ["selection_inputs", null, view.reads.reason],
          view.reads.state === "PUBLISHED" ? ["retention", view.reads.retention] : ["retention", null, view.reads.reason],
          ["atlas_release", view.release.id],
          ...(view.oos.condition === null ? ([["oos_use", view.oos.use]] as [string, string | null][]) : []),
        ]
      : [];
  const tokens: [string, string | null][] = [
    contract.top_is_fraction !== null ? ["top_is_fraction", contract.top_is_fraction] : ["top_is_k", contract.top_is_k === null ? null : String(contract.top_is_k)],
    ["decay_lambda", probe.decay_lambda],
    ["decay_gamma", probe.decay_gamma],
  ];
  const mode = contract.optimization_mode;
  const schedule = contract.optimization_schedule;
  return (
    <>
      <FoldStrip view={view} />
      <div className="flex w-full flex-wrap items-center gap-x-[14px] gap-y-1" data-mode-reads-detail>
        {mode !== null && schedule !== null ? (
          <Link
            to={atlasModeHref({ mode, schedule } as NonNullable<ClaimRow["mode_reference"]>, runId)}
            className="mono text-[10.5px]"
            style={{ color: "var(--accent)" }}
            data-action="open-atlas-mode"
          >
            {mode} · {schedule} in the Engine Atlas →
          </Link>
        ) : null}
        <span className="flex flex-wrap gap-x-3 gap-y-1" data-mode-reads-tokens title="this run's search contract and probe, and the Atlas's descriptor for this mode × schedule, as published">
          {[...atlasTokens, ...tokens].map(([key, value, why]) => (
            <span key={key} className="mono text-[10.5px]" data-mode-read={key}>
              <span style={{ color: "var(--ink-faint)" }}>{key}</span>{" "}
              {value ?? (
                <span className="italic" style={{ color: "var(--ink-faint)" }} title={why ?? RETAINED_NO_FIELD}>
                  not published
                </span>
              )}
            </span>
          ))}
        </span>
        {view.kind === "strip" && view.oos.condition !== null ? (
          <span className="min-w-[260px] flex-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-oos-use-condition>
            <span className="mono">oos_use {view.oos.use}</span> — {view.oos.condition}
          </span>
        ) : null}
      </div>
    </>
  );
}

/** Readiness on a retained run: the retained seal from the progress read (terminal READY + mandatory SEALED). */
function RetainedReadinessFact({ run }: { run: RetainedRunFacts | undefined }) {
  if (run === undefined || run.identity.state === "idle") {
    return (
      <span className="italic" style={{ color: "var(--ink-faint)" }} data-readiness="UNREAD" title="the progress read was not asked">
        not read
      </span>
    );
  }
  if (run.identity.state === "loading") {
    return (
      <span className="italic" style={{ color: "var(--ink-faint)" }} data-readiness="PENDING">
        reading…
      </span>
    );
  }
  const readiness = retainedReadiness(run.identity.identity.progress);
  if (readiness === null) {
    return (
      <span className="italic" style={{ color: "var(--ink-faint)" }} data-readiness="UNREAD" title="the progress read did not answer">
        not read
      </span>
    );
  }
  return (
    <span
      data-readiness={readiness}
      data-readiness-basis="RETAINED_SEAL"
      title="The retained seal from the progress read: the attempt materialized READY and sealed its mandatory bundle."
    >
      {readiness}
    </span>
  );
}

/** The provenance strip on a retained run: the retained lane's own facts; a field it does not carry is left out, not blanked. */
function retainedProvenance(search: CurrentSourceSearch, detail: SearchDetailDocument): ProvenanceFacts {
  const retained = search.provenance;
  return {
    source_adapter_id: retained.source_adapter_id,
    engine_version: retained.engine_version,
    source_transform_digest: retained.source_transform_digest,
    requested_spec_digest: retained.requested_spec_digest,
    effective_spec_digest: retained.effective_spec_digest,
    dataset_binding_digest: retained.dataset_binding_digest,
    manifest_digest: retained.source_manifest_digest ?? detail.provenance.manifest_digest,
  };
}

/* ------------------------------------------------------------ freeze line */

function FreezeLine({ detail, retained = null }: { detail: SearchDetailDocument; retained?: CurrentSourceSearch | null }) {
  const contract = retained?.search_contract ?? null;
  const pool = contract === null ? null : contract.top_is_fraction !== null ? `top_is_fraction ${contract.top_is_fraction}` : contract.top_is_k !== null ? `top_is_k ${contract.top_is_k}` : null;
  /* W3b: the retained lane publishes the pool rule and the candidates it froze. */
  const froze = retained !== null && pool !== null && retained.candidates.source_candidate_count > 0;
  const title = froze
    ? `Stage A searches, the pool freezes (${pool} → ${retained!.candidates.source_candidate_count} candidate${retained!.candidates.source_candidate_count === 1 ? "" : "s"}), Stage B selects on what was frozen.`
    : retained !== null
      ? "Stage A searches, the pool freezes, Stage B selects on what was frozen. The retained lane does not publish this run's pool rule."
      : "Stage A searches, the pool freezes, Stage B selects on what was frozen. This run froze no pool because it ran no search.";
  /* The run's claim matrix (which way information crossed) is not published
     (CG-P15-05); a fixed profile froze nothing, and says so. On a retained run
     the search contract's own `oos_used_for_selection` answers it. */
  const kind: FreezeArrowKind =
    contract !== null
      ? contract.oos_used_for_selection === true
        ? "decay"
        : contract.oos_used_for_selection === false
          ? "none"
          : "unpublished"
      : detail.source_profile.state === "FIXED_PROFILE_NO_SEARCH"
        ? "no-freeze"
        : "unpublished";
  const arrow = freezeArrow(kind);
  /* E5 · 6.7: the HiFi label carries K when the server published it. */
  const served = froze ? freezeLineLabel(retained?.pool) : null;
  const line =
    "h-0 flex-1 border-t-2 border-dashed min-[1100px]:h-auto min-[1100px]:w-0 min-[1100px]:border-l-2 min-[1100px]:border-t-0";
  return (
    <div
      className="flex min-w-0 flex-row items-center gap-2 py-1 min-[1100px]:flex-col min-[1100px]:gap-0 min-[1100px]:overflow-hidden min-[1100px]:pb-0 min-[1100px]:pt-[34px]"
      data-freeze-line={detail.selection.state}
    >
      <span className={line} style={{ borderColor: "var(--accent-2)" }} />
      <span className="flex flex-none flex-row items-center gap-1.5 min-[1100px]:flex-col min-[1100px]:py-[10px]">
        <span
          className="mono whitespace-nowrap text-[9.5px] font-bold tracking-[.14em] min-[1100px]:[transform:rotate(180deg)] min-[1100px]:[writing-mode:vertical-rl]"
          style={{ color: "var(--accent-2)" }}
          title={
            [
              served ? `${title} ${served.title}.` : title,
              typeof retained?.pool?.frozen_at_utc_ms === "number" ? `frozen at ${formatUtc(retained.pool.frozen_at_utc_ms)}` : null,
            ]
              .filter(Boolean)
              .join(" ")
          }
          data-freeze-label={served ? "served" : "rule"}
        >
          {served ? served.text : `${FREEZE_LABEL} · ${froze ? "FROZEN" : retained !== null ? "RULE NOT PUBLISHED" : "NONE — NO SEARCH RAN"}`}
        </span>
        <span
          className="mono whitespace-nowrap rounded-[3px] border px-1.5 py-[3px] text-[10px] font-bold"
          style={{
            color: arrow.tone,
            borderColor: arrow.border,
            background: "var(--paper)",
            ...(arrow.flow ? { ["--rs-motion-duration" as string]: "1.6s" } : {}),
          }}
          title={arrow.title}
          data-freeze-arrow={kind}
          data-motion={arrow.flow ? "flow" : undefined}
        >
          {arrow.glyph}
        </span>
      </span>
      <span className={line} style={{ borderColor: "var(--accent-2)" }} />
    </div>
  );
}

/* ---------------------------------------------------------------- screen */

export interface SearchScreenProps {
  runId: string;
  detail: SearchDetailDocument | null;
  state: ResearchState;
  /** FE-X-11: the server said this run does not exist (404). */
  notFound?: boolean;
  cursor: EvidenceCursor;
  ledger: LedgerSlot;
  ensureLedger: () => void;
  /** F2: the retained ledger asked with the cursor's fold as `fold` — feeds the trial ledger and the fold inspection only. */
  foldLedger?: FoldLedgerSlot;
  onReread: () => void;
  /** W3b: a retained run's identity and declared space (asked only once the retained lane answered). */
  retainedRun?: RetainedRunFacts;
  /** G8: the fold plan and the Atlas, the two reads the "what this mode reads" strip is drawn from (retained runs only). */
  modeReads?: ModeReadsSlots;
  /** X2 · F4 (T07/T08): the trial the reader is inspecting — the hash's `pick=`, never θ*. */
  pick?: string | null;
  onPick?: (trialId: string) => void;
  /** D9: lets go of the pick (the hash's `pick=`). */
  onClear?: () => void;
  /**
   * Drawn inside the Evidence Hub's Search tab (HiFi 04): the hub owns the
   * page frame, the breadcrumb and the title, so this screen leaves out its
   * own. Every read, panel and data-* attribute below is unchanged.
   */
  embedded?: boolean;
}

/**
 * X2 · F4 (T16): the evidence link a reader copies. The hi-fi writes
 * `portal://…/stage/search?mode&schedule&trial&params`; a portal:// address
 * opens nothing, so the link is this screen's own URL with the same facts in
 * its cursor hash: stage, fold, the run's mode and schedule, θ*'s trial and
 * params digest, and the inspected `pick` when there is one. Every value is
 * the server's; a value the run did not publish is left out, never guessed.
 */
export function searchEvidenceLink(
  runId: string,
  cursor: EvidenceCursor,
  lane: CurrentSourceSearch | null,
  run: RetainedRunFacts | undefined,
  pick: string | null,
): string | undefined {
  if (typeof window === "undefined" || !window.location) return undefined;
  const base = `${window.location.origin}/research/quantbt/runs/${encodeURIComponent(runId)}/search`;
  if (lane === null) return `${base}${serializeCursor({ ...cursor, stage: "search" })}`;
  const identity = run?.identity.state === "ready" ? run.identity.identity : null;
  const digests = new Set(
    (identity?.progress?.progress?.folds ?? [])
      .map((fold) => (fold.selection?.state === "AVAILABLE" ? fold.selection.params_digest : null))
      .filter((digest): digest is string => typeof digest === "string"),
  );
  const carried = { ...(cursor.carried ?? {}) };
  if (lane.search_contract.optimization_mode) carried.mode = lane.search_contract.optimization_mode;
  if (lane.selection.selected_trial_id !== null) carried.trial = lane.selection.selected_trial_id;
  if (pick !== null) carried.pick = pick;
  else delete carried.pick;
  return `${base}${serializeCursor({
    ...cursor,
    stage: "search",
    trial: null,
    schedule: lane.search_contract.optimization_schedule ?? cursor.schedule,
    params: digests.size === 1 ? [...digests][0]! : cursor.params,
    carried,
  })}`;
}

/** Names the frames on this screen already state; `source_absences` repeats them. */
const SHOWN_GAPS = new Set<string>([
  ...DIAGNOSTIC_KEYS,
  "trial_ledger",
  "selection_trace",
  "search_fold",
  "strict_outer_oos",
  "candidate_selection_metric",
  "candidate_pool",
  "objective_components",
  "trial_detail",
  "study",
  "sampler_seed_warm_start",
  /* D11: the server's absence key for the trial jump — a control name, not something a reader asked about. */
  "trial_jump",
]);

export function SearchScreen({
  runId,
  detail,
  state,
  notFound = false,
  cursor,
  ledger,
  ensureLedger,
  foldLedger = { state: "idle" },
  onReread,
  retainedRun,
  modeReads,
  pick: controlledPick,
  onPick: controlledOnPick,
  onClear: controlledOnClear,
  embedded = false,
}: SearchScreenProps) {
  const modeReadsLabel = useId();
  /* Controlled by the route (the hash's `pick=`); a bare screen keeps its own. */
  const [localPick, setLocalPick] = useState<string | null>(null);
  const pick = controlledPick !== undefined ? controlledPick : localPick;
  const pickTrial = controlledOnPick ?? setLocalPick;
  const onClear = controlledOnClear ?? (() => setLocalPick(null));
  /* D9: choosing the picked trial again lets it go, so a pick is never a one-way door. */
  const onPick = (trialId: string) => (trialId === pick ? onClear() : pickTrial(trialId));
  const profile = detail?.fixed_profile;
  const parameters = profile?.parameters ?? [];
  const fixed = detail?.source_profile.state === "FIXED_PROFILE_NO_SEARCH";
  const runPath = `/research/quantbt/runs/${encodeURIComponent(runId)}`;
  const hubAbsences = detail ? Object.entries(detail.source_absences).filter(([name]) => !SHOWN_GAPS.has(name)) : [];
  const gapOf = (name: string): SearchSourceGap | null => detail?.source_absences[name] ?? null;
  const metric = detail?.requested_optimizer.candidate_selection_metric;
  /* W3: a sealed retained WFO run answers the claim row, Stage B and two Stage A panels. */
  const retained = ledger.state === "ready" && (ledger.search as Partial<CurrentSourceSearch>).search_contract ? ledger.search : null;
  const retainedClaims =
    retained && retained.search_contract.availability.state === "AVAILABLE" ? retained.search_contract : null;
  /* W3b: the retained lane answered AVAILABLE — it is the authority for every
     panel it covers, and the hub's own lane codes are not shown on this run. */
  const lane = retained && retainedClaims && isRetainedAnswer(retained) ? retained : null;
  const runMode = lane ? lane.search_contract.optimization_mode : detail?.requested_optimizer.mode ?? null;
  const runSchedule = lane ? lane.search_contract.optimization_schedule : detail?.requested_optimizer.schedule ?? null;
  /* G8: the strip is drawn from the fold plan, the search contract and the Atlas — the retained lane only. */
  const stripView: ModeReadsView | null = lane
    ? modeReadsView({
        mode: lane.search_contract.optimization_mode,
        schedule: lane.search_contract.optimization_schedule,
        engineVersion: lane.provenance.engine_version,
        plan: modeReads?.plan ?? { state: "idle" },
        atlas: modeReads?.atlas ?? { state: "idle" },
      })
    : null;
  /* The hub's source_absences describe the hub on a retained run; each panel above states the lane's own. */
  /* D11: a fixed profile (P04) has nothing to draw past A1 — Stage B, the freeze line and every diagnostic shell are dropped. */
  const fixedOnly = fixed && lane === null && !notFound;
  const absences = lane || fixedOnly ? [] : hubAbsences;
  const fixedReasons: string[] = [];
  if (fixedOnly && detail) {
    const served: unknown[] = [
      ...Object.values(detail.source_absences),
      ...Object.values(detail.diagnostics),
      detail.inspection.availability,
      detail.availability,
    ];
    for (const gap of served) {
      const code = typeof gap === "object" && gap !== null ? (gap as { reason_code?: unknown }).reason_code : undefined;
      if (typeof code === "string" && !fixedReasons.includes(code)) fixedReasons.push(code);
    }
  }
  /* F2: the fold-filtered answer replaces the unfiltered one for the trial ledger and the inspection panel only. */
  const folded = lane && foldLedger.state === "ready" ? foldLedger.search : null;
  /* D5: later pages of the retained ledger, appended to the first one in hand. */
  const pages = useLedgerPages(runId, folded ?? lane, folded && foldLedger.state === "ready" ? foldLedger.foldId : null);
  const ledgerSlot: LedgerSlot = pages.merged && (folded || lane) ? { state: "ready", search: pages.merged } : ledger;
  const inspected = folded ?? lane;
  const ledgerMore: LedgerMore = { hasMore: pages.hasMore, loading: pages.loading, error: pages.error !== null, onMore: pages.loadMore };
  /* D6: the ledger's fold id is the plan's own (0-based); the reader's fold is the cursor's. A filter that keeps every trial says nothing. */
  const filter = inspected?.ledger.fold_filter ?? null;
  const foldNote = filter && filter.matched_rows < inspected!.ledger.source_trial_count ? `fold ${cursor.fold}` : null;
  /* D8: a failed read of the retained lane is a failure with a retry, not a source that "has not reported". */
  const laneFailed = ledger.state === "refused" && ledger.laneState === null;
  const shownState: ResearchState = state.state === "partial" && laneFailed ? refusalState(ledger.refusal, false) : state;
  const pickedTrial = pick === null ? null : (pages.merged?.ledger.trials.find((trial) => trial.trial_id === pick) ?? null);
  const pickedPoint = pick === null ? null : (lane?.surface?.points.find((point) => point.trial_id === pick) ?? null);

  return (
    <div
      className={embedded ? "flex w-full min-w-0 flex-col gap-[14px]" : `${SCREEN_FRAME} max-w-[1560px]`}
      data-screen="search-detail"
      data-run={runId}
      data-embedded={embedded ? "hub" : undefined}
    >
      {/* ------------------------------------------------------ header */}
      {embedded ? null : (
      <header
        className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5 border-b pb-[10px]"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex min-w-0 flex-col gap-[3px]">
          <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Breadcrumb" style={{ color: "var(--ink-soft)" }}>
            {notFound ? (
              <Link to="/research/quantbt/runs" style={{ color: "var(--accent)" }} data-action="run-library-crumb">
                Run Library
              </Link>
            ) : (
              <Link to={deepDiveHref(`${runPath}/evidence`, cursor)} style={{ color: "var(--accent)" }} data-action="back-to-hub">
                Evidence Flow
              </Link>
            )}
            <span style={{ color: "var(--ink-faint)" }}>/</span>
            <ShortId id={runId} label="run" className="min-w-0 text-[12px]" />
            <span style={{ color: "var(--ink-faint)" }}>/</span>
            <span style={{ color: "var(--ink)" }}>Stage 2 · Search &amp; Selection</span>
            {notFound ? null : (
              <>
                <span style={{ color: "var(--ink-faint)" }}>·</span>
                <Link
                  to={deepDiveHref(`${runPath}/split`, { ...cursor, stage: "split" })}
                  className="mono text-[10px]"
                  style={{ color: "var(--accent)" }}
                  data-action="back-to-split"
                >
                  ← S1 Split
                </Link>
                <span style={{ color: "var(--ink-faint)" }}>·</span>
                <Link
                  to={deepDiveHref(`${runPath}/freeze`, { ...cursor, stage: "freeze" })}
                  className="mono text-[10px]"
                  style={{ color: "var(--accent)" }}
                  data-action="next-stage"
                >
                  next: S3 Freeze →
                </Link>
              </>
            )}
          </nav>
          <h1 className="text-[22px] font-light tracking-[-0.01em] [line-height:normal]" style={{ fontFamily: "var(--font-display)" }}>
            {SEARCH_TITLE}
          </h1>
        </div>
        {detail ? (
          <div className="flex flex-none flex-col items-end gap-[5px]">
            <AsOf at={detail.as_of_utc_ms} source="search read" basis={detail.as_of_basis} />
            <CopyEvidenceLink href={searchEvidenceLink(runId, cursor, lane, retainedRun, pick)} />
          </div>
        ) : null}
      </header>
      )}

      {notFound ? <RunNotFound runId={runId} /> : null}

      <ResearchPanel
        title="search & selection"
        variant="plain"
        state={shownState}
        minBodyHeight={240}
        recovery={
          shownState.mayRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              reread search
            </button>
          ) : undefined
        }
      >
        {detail ? (
          <div className="flex flex-col gap-[14px]">
            {/* F2: an imported alpha's served identity; a built-in alpha publishes none, so nothing is drawn. */}
            <ImportedAlphaLine binding={detail.imported_alpha} />
            {/* --------------------------------------- mode × schedule card */}
            <section className="rounded-[6px] border" style={RAISED_STYLE} data-source-strip={detail.source_profile.state}>
              <div className="flex flex-wrap items-center gap-2 border-b px-[14px] py-[9px]" style={{ borderColor: "var(--line-soft)" }}>
                <span className={LABEL} style={{ color: "var(--ink-faint)" }} title={SELECTOR_LAYERS_HELP} data-selector-layers>
                  optimization_mode{" "}
                  <InfoMark />
                </span>
                {/* One run is one mode: the run's own, read-only — never a switcher. */}
                <span data-requested-optimizer={lane ? "RETAINED_SOURCE" : detail.requested_optimizer.state} className="flex flex-wrap items-center gap-2">
                  {runMode !== null ? (
                    <Pill on data-run-mode>
                      {runMode}
                    </Pill>
                  ) : (
                    <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} data-run-mode>
                      mode not published
                    </span>
                  )}
                  <span className="mx-1 h-[18px] w-px flex-none" style={{ background: "var(--line)" }} aria-hidden="true" />
                  <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    schedule
                  </span>
                  {runSchedule !== null ? (
                    <Pill
                      on
                      tone={schedulePillTone(runSchedule)}
                      data-run-schedule
                      data-pill-tone={schedulePillTone(runSchedule)}
                      title={
                        schedulePillTone(runSchedule) === "warn"
                          ? "only per_fold_causal keeps OOS out of selection — this schedule is shown in the warn style"
                          : undefined
                      }
                    >
                      {runSchedule}
                    </Pill>
                  ) : (
                    <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} data-run-schedule>
                      schedule not published
                    </span>
                  )}
                  {lane ? (
                    <span
                      className="mono text-[10.5px]"
                      style={{ color: "var(--good)" }}
                      title="QuantBT's search contract for this run, read from the retained current-source lane"
                      data-run-mode-source="retained"
                    >
                      executed · retained search contract
                    </span>
                  ) : (
                    <span className="mono text-[10.5px] italic" style={{ color: "var(--accent-2)" }}>
                      {detail.requested_optimizer.state.toLowerCase().replace(/_/g, " ")}
                    </span>
                  )}
                </span>
              </div>

              {/* Claim row — HiFi's six fields first, each a shell where the read publishes nothing, then the run's own facts. */}
              <div className="flex flex-wrap items-stretch min-[900px]:flex-nowrap">
                <div
                  className="flex flex-1 flex-wrap gap-x-6 gap-y-2 px-[14px] py-[9px]"
                  data-claim-row
                  data-claim-basis={lane ? "RETAINED_SOURCE" : detail.claim_row.basis}
                  title={lane ? "claims from QuantBT's search contract (retained lane)" : `claim basis ${detail.claim_row.basis}`}
                >
                  <Claim k="validation_claim" accent>
                    {retainedClaims?.validation_claim ? (
                      <RetainedToken value={retainedClaims.validation_claim} what="validation claim" />
                    ) : (
                      <ClaimToken fact={detail.claim_row.validation_claim} what="validation claim" />
                    )}
                  </Claim>
                  <Claim k="chronological_claim">
                    {retainedClaims?.chronological_claim ? (
                      <RetainedToken value={retainedClaims.chronological_claim} what="chronological claim" />
                    ) : (
                      <ClaimToken fact={detail.claim_row.chronological_claim} what="chronological claim" />
                    )}
                  </Claim>
                  <Claim k="oos_used_for_selection">
                    {retainedClaims && retainedClaims.oos_used_for_selection !== null ? (
                      <RetainedToken value={retainedClaims.oos_used_for_selection ? "YES" : "NO"} what="oos used for selection" />
                    ) : (
                      <ClaimToken fact={detail.claim_row.oos_used_for_selection} what="oos used for selection" />
                    )}
                  </Claim>
                  <Claim k="OOS column state">
                    {lane ? (
                      <RetainedOosColumn
                        used={lane.search_contract.oos_used_for_selection}
                        reading={stripView?.kind === "strip" ? stripView.oos.state : null}
                      />
                    ) : (
                      <OosColumnChip column={detail.claim_row.oos_column} />
                    )}
                  </Claim>
                  <Claim k="scoring_backend">
                    {retainedClaims?.scoring_backend ? (
                      <RetainedToken value={retainedClaims.scoring_backend} what="scoring backend" />
                    ) : (
                      <ScoringBackendFact backend={detail.claim_row.scoring_backend} />
                    )}
                  </Claim>
                  <Claim k="candidate_selection_metric" data-metric-state={metric?.state}>
                    {retainedClaims?.candidate_selection_metric ? (
                      <RetainedToken value={retainedClaims.candidate_selection_metric} what="candidate selection metric" />
                    ) : metric?.state === "CONFIRMED" ? (
                      <span className="flex items-baseline gap-1.5">
                        <span data-metric-value={metric.value} title={metric.value}>
                          {claimToken(metric.value)}
                        </span>
                        <span className="text-[9px]" style={{ color: "var(--good)" }}>
                          CONFIRMED
                        </span>
                        <span className="text-[9px]" style={{ color: "var(--ink-faint)" }} data-metric-provenance>
                          {metric.provenance.toLowerCase().replace(/_/g, " ")}
                        </span>
                      </span>
                    ) : (
                      <span className="italic" style={{ color: "var(--ink-faint)" }} title={metric?.reason_code ?? undefined}>
                        not published
                      </span>
                    )}
                  </Claim>
                  <Claim k="source profile">
                    {lane ? (
                      <span
                        className="flex flex-col gap-[1px]"
                        data-source-profile="RETAINED_SOURCE"
                        title={`retained profile ${lane.provenance.profile_id} · source adapter ${lane.provenance.source_adapter_id}`}
                      >
                        <span data-profile-id>{lane.provenance.profile_id}</span>
                        <span className="text-[9px]" style={{ color: "var(--ink-faint)" }} data-source-adapter>
                          {lane.provenance.source_adapter_id}
                        </span>
                      </span>
                    ) : (
                      <span data-source-profile={detail.source_profile.state} title={`${detail.source_profile.state}${detail.source_profile.reason_code ? ` · ${detail.source_profile.reason_code}` : ""}`}>
                        {stateWords(detail.source_profile.state)}
                      </span>
                    )}
                  </Claim>
                  <Claim k="selection" data-selection-state={lane ? lane.selection.availability.state : detail.selection.state}>
                    {lane ? (
                      <span className="flex flex-col gap-[1px]">
                        <span title={lane.selection.availability.state}>{stateWords(lane.selection.availability.state)}</span>
                        {lane.selection.selected_trial_id !== null ? (
                          <span className="text-[9px]" style={{ color: "var(--ink-faint)" }} title={lane.selection.objective ?? undefined} data-selection-summary>
                            trial {lane.selection.selected_trial_id} · J {ratio2(lane.selection.objective) ?? "not published"} ·{" "}
                            {OBJECTIVE_KIND_WORDS[lane.selection.objective_kind] ?? lane.selection.objective_kind}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span title={detail.selection.state}>{stateWords(detail.selection.state)}</span>
                    )}
                  </Claim>
                  <Claim k="strict outer OOS">
                    {lane && lane.search_contract?.oos_used_for_selection === true ? (
                      /* QuantBT publishes oos_used_for_selection = true: the selection read OOS, so it was not strict. */
                      <span data-strict-outer-oos="false" title="search_contract.oos_used_for_selection = true (QuantBT)">
                        no · OOS used for selection
                      </span>
                    ) : lane ? (
                      <ClaimAbsence state="NOT_PUBLISHED" reason={RETAINED_NO_FIELD} what="strict outer OOS" />
                    ) : profile ? (
                      <Gap gap={profile.strict_outer_oos} what="strict outer OOS" bare />
                    ) : null}
                  </Claim>
                  <Claim k="readiness">
                    {lane ? (
                      <RetainedReadinessFact run={retainedRun} />
                    ) : (
                      <span
                        data-readiness={detail.readiness}
                        title={`${detail.readiness} — the server's own word: a fixed profile is published; the optimizer facts around it are absent by nature.`}
                      >
                        {stateWords(detail.readiness)}
                      </span>
                    )}
                  </Claim>
                  {profile && profile.parameter_bundle_digest !== null ? (
                    <Claim k="parameter bundle">
                      <Digest value={profile.parameter_bundle_digest} data-bundle-digest />
                    </Claim>
                  ) : null}
                </div>
              </div>

              {/* HiFi "what this mode reads" (6.4, G8). A retained run draws the
                  per-fold strip from the fold plan, its search contract and the
                  Atlas's own mode descriptor. A run that executed no search has
                  no per-fold read: the strip is a typed absence there, and what
                  its declared mode reads is Atlas release metadata (claim_row.
                  mode_reference), never run evidence — a link, tagged so. */}
              <div
                role="group"
                aria-labelledby={modeReadsLabel}
                className="flex flex-wrap items-center gap-[14px] rounded-b-[6px] border-t px-[14px] py-2"
                style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
                data-mode-reads={lane ? "retained" : detail.claim_row.mode_reference ? "reference" : "shell"}
              >
                <span id={modeReadsLabel} className={`${LABEL} flex-none`} style={{ color: "var(--ink-faint)" }}>
                  what this mode reads
                </span>
                {lane && stripView ? (
                  <RetainedModeReads search={lane} runId={runId} view={stripView} />
                ) : detail.claim_row.mode_reference ? (
                  <>
                    <FoldStripAbsence view={hubModeReadsAbsence(detail)} />
                    <div className="flex w-full flex-wrap items-center gap-x-[14px] gap-y-1" data-mode-reads-detail>
                      <Link
                        to={atlasModeHref(detail.claim_row.mode_reference, runId)}
                        className="mono text-[10.5px]"
                        style={{ color: "var(--accent)" }}
                        data-action="open-atlas-mode"
                        title={`${detail.claim_row.mode_reference.operation_id} · ${detail.claim_row.mode_reference.relation}`}
                      >
                        {detail.claim_row.mode_reference.mode} · {detail.claim_row.mode_reference.schedule} in the Engine Atlas →
                      </Link>
                      <Chip data-mode-relation={detail.claim_row.mode_reference.relation} tone="var(--ink-faint)">
                        release metadata · not run evidence
                      </Chip>
                      {detail.claim_row.basis === "DECLARED_NOT_EXECUTED" ? (
                        <span className="min-w-[160px] flex-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                          declared, not executed by the source
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <FoldStripAbsence
                    view={{
                      kind: "absent",
                      state: "NOT_PUBLISHED",
                      code: detail.claim_row.basis,
                      sentence:
                        "no declared mode in the search read — no Atlas entry",
                    }}
                  />
                )}
              </div>
            </section>

            <ProvenanceStrip provenance={lane ? retainedProvenance(lane, detail) : detail.provenance} />

            {/* F3 · H06 hero: the search cinema stays unbuilt until the engine publishes a sampler trace; one typed line holds its place. */}
            {fixed ? null : (() => {
              const samplerCode = lane
                ? lane.diagnostics.probe.sampler.reason_code
                : gapOf("sampler_seed_warm_start")?.reason_code ?? null;
              return (
                <div
                  className="mono flex flex-wrap items-baseline gap-x-2 rounded-[6px] border border-dashed px-3 py-1.5 text-[10.5px]"
                  style={{ borderColor: "var(--line)", color: "var(--ink-faint)" }}
                  data-panel="search-cinema"
                  data-gap-state="NOT_PUBLISHED"
                >
                  <span className="italic" title={samplerCode ?? undefined}>
                    Sampler trace: not published
                  </span>
                </div>
              );
            })()}

            {/* D9: the picked trial, named where the reader is, with a way out. */}
            {pick !== null ? (
              <div
                className="mono sticky z-10 flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-[6px] border px-3 py-1.5 text-[10.5px]"
                style={{ top: "calc(var(--topbar-h, 56px) + 8px)", borderColor: "var(--accent)", background: "var(--paper-raised)", color: "var(--ink)", boxShadow: "var(--shadow-e1)" }}
                data-pick-chip={pick}
              >
                <span>trial {pick}</span>
                <span style={{ color: "var(--ink-soft)" }}>
                  IS {two(pickedPoint?.objective ?? pickedTrial?.objective ?? null) ?? "not published"}
                </span>
                {pickedTrial && Object.keys(pickedTrial.parameters).length > 0 ? (
                  <span style={{ color: "var(--ink-faint)" }}>
                    {Object.entries(pickedTrial.parameters)
                      .map(([name, value]) => `${name} ${cleanParamText(value)}`)
                      .join(" · ")}
                  </span>
                ) : null}
                <button type="button" className="btn-ghost mono text-[10px]" onClick={onClear} aria-label={`clear the picked trial ${pick}`} title="Clear the pick" data-action="clear-pick">
                  ×
                </button>
              </div>
            ) : null}

            {/* ------------------------------------ Stage A · freeze · Stage B */}
            <div
              className={fixedOnly ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[1.08fr_52px_1fr] min-[1100px]:gap-0"}
              data-stage-grid
              data-fixed-profile={fixedOnly ? "" : undefined}
            >
              <div className="flex min-w-0 flex-col gap-3" data-stage="A">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <h2 className="mono text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: "var(--ink-faint)" }}>
                    Stage A · search
                  </h2>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    {fixed ? "no sampler ran — fixed profile" : "what the sampler searched, on IS"}
                  </span>
                </div>

                {lane ? <RetainedSearchSpace search={lane} run={retainedRun} /> : null}
                {lane ? null : (
                <section className={`${CARD} min-w-0 overflow-x-auto`} style={CARD_STYLE} tabIndex={0} aria-label="search space as declared" data-panel="search-space">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                      A1 · search space as declared
                    </h3>
                    {profile && profile.adapter_contract_digest !== null ? (
                      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-adapter-digest>
                        adapter <Digest value={profile.adapter_contract_digest} />
                      </span>
                    ) : null}
                  </div>
                  {parameters.length > 0 ? (
                    /* 6.6: every kind one short word (NUMERIC) → the narrow kind cell, so the range-position note is not clipped at 1440. */
                    <ParameterTable parameters={parameters} kindWidth={parameters.every((parameter) => parameter.kind.length <= 8) ? 64 : undefined} />
                  ) : (
                    <Withheld availability={profile?.availability ?? detail.availability} what="parameter profile" />
                  )}
                  <div className="flex flex-wrap gap-x-[22px] gap-y-1 pt-[5px]" data-coverage>
                    {parameters.length > 0 ? (
                      <span className="inline-flex items-baseline gap-x-1.5" data-gap-fact="levels" data-gap-state="NOT_PUBLISHED">
                        <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                          levels
                        </span>
                        <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={LEVELS_REASON}>
                          not published
                        </span>
                      </span>
                    ) : null}
                    {gapOf("sampler_seed_warm_start") ? (
                      <Gap gap={gapOf("sampler_seed_warm_start") as SearchSourceGap} what="sampler · seeds" />
                    ) : null}
                    {gapOf("study") ? <Gap gap={gapOf("study") as SearchSourceGap} what="trials · grid size" /> : null}
                  </div>
                </section>
                )}

                {fixedOnly ? (
                  /* D11: a fixed profile ran no search — one sentence, with the served reasons on hover, instead of a shell per panel. */
                  <p
                    className="text-[11.5px] leading-[1.5]"
                    style={{ color: "var(--ink-soft)" }}
                    data-panel="fixed-profile-note"
                    title={fixedReasons.length > 0 ? fixedReasons.join(" · ") : undefined}
                  >
                    No search ran — the parameters were fixed.
                  </p>
                ) : null}

                {(fixedOnly ? [] : STAGE_A_DIAGNOSTICS).map((key) => {
                  if (lane) {
                    /* X2 · B3: the server's trial surface draws A2–A5; an older server keeps the W3b frames. */
                    const surface = lane.surface;
                    const space = lane.declared_space;
                    if (surface && space) {
                      const served = surface.state === "AVAILABLE" && space.state === "AVAILABLE";
                      if (key === "scatter") {
                        return served ? (
                          <SurfaceScatter
                            key={key}
                            surface={surface}
                            parametersOf={(id) => cleanParameters((pages.merged ?? lane).ledger.trials.find((trial) => trial.trial_id === id)?.parameters)}
                            schedule={lane.search_contract.optimization_schedule}
                            pick={pick}
                            onPick={onPick}
                            onClear={onClear}
                          />
                        ) : (
                          <SurfaceAbsence key={key} id={key} title={DIAGNOSTIC_LABEL.scatter} reason={surface.reason_code ?? space.reason_code} />
                        );
                      }
                      if (key === "progression" && served) {
                        return <SurfaceProgression key={key} surface={surface} declared={space} prunedCount={lane.diagnostics.probe.pruned_trial_count} />;
                      }
                      if (key === "distributions" && served) return <SurfaceDistributions key={key} surface={surface} />;
                      /* A5 sits inside A4's card, as in the hi-fi. */
                      if (key === "importance" && served) return null;
                      if (key === "interactions") {
                        return <EmptyPanel key={key} id={key} title={DIAGNOSTIC_LABEL[key]} gap={{ state: "NOT_PUBLISHED", reason_code: surface.interactions.reason_code } as SearchSourceGap} sentence />;
                      }
                    }
                    /* W3b: each Stage A frame from the retained lane, or its own typed absence. */
                    if (key === "scatter") return <RetainedSurface key={key} search={lane} />;
                    if (key === "progression") return <RetainedProgression key={key} search={lane} />;
                    if (key === "distributions") return <RetainedSampledValues key={key} search={lane} />;
                    const gap = key === "prune_reasons" || key === "importance" ? factGap(lane.diagnostics[key]) : noField();
                    return <EmptyPanel key={key} id={key} title={DIAGNOSTIC_LABEL[key]} gap={gap} sentence />;
                  }
                  return (
                    <EmptyPanel
                      key={key}
                      id={key}
                      title={DIAGNOSTIC_LABEL[key]}
                      gap={
                        retained && (key === "prune_reasons" || key === "importance")
                          ? /* W3 · CG-P15-04: the retained lane's capability probe answers these two. */
                            ({ state: retained.diagnostics[key].state, reason_code: retained.diagnostics[key].reason_code } as SearchSourceGap)
                          : detail.diagnostics[key]
                      }
                    />
                  );
                })}
              </div>

              {fixedOnly ? null : <FreezeLine detail={detail} retained={lane} />}

              {fixedOnly ? null : (
              <div className="flex min-w-0 flex-col gap-3" data-stage="B">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <h2 className="mono text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: "var(--accent-2)" }}>
                    Stage B · selection
                  </h2>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    {fixed ? "no pool frozen — fixed profile" : "selects on the frozen pool"}
                  </span>
                </div>

                <section className={CARD} style={CARD_STYLE} data-panel="pool-freeze">
                  <h3 className={`${LABEL} flex items-baseline justify-between gap-2`} style={{ color: "var(--ink-faint)" }}>
                    <span>B1 · pool freeze</span>
                    {!fixed && !notFound ? <StageLink to={deepDiveHref(`${runPath}/freeze`, { ...cursor, stage: "freeze" })} action="pool-to-freeze" title="Open S3 · Freeze — the sealed θ* and its digest chain">S3 Freeze →</StageLink> : null}
                  </h3>
                  {retained ? (retained.pool ? <PoolFunnel search={retained} /> : <RetainedPoolFreeze search={retained} />) : gapOf("candidate_pool") ? <Gap gap={gapOf("candidate_pool") as SearchSourceGap} what="candidate pool" showReason /> : null}
                </section>

                <section className={CARD} style={CARD_STYLE} data-panel="formula">
                  <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    B2 · the formula of {runMode ?? "this mode"} — every term
                  </h3>
                  {retained ? (
                    <RetainedFormula search={retained} />
                  ) : gapOf("objective_components") ? (
                    <Gap gap={gapOf("objective_components") as SearchSourceGap} what="objective components" showReason />
                  ) : null}
                </section>

                <section className={CARD} style={CARD_STYLE} data-panel="selection">
                  <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    B3 · best trial ≠ selected params
                  </h3>
                  {retained ? (
                    <RetainedBestVsSelected
                      search={retained}
                      freezeHref={notFound ? null : deepDiveHref(`${runPath}/freeze`, { ...cursor, stage: "freeze" })}
                    />
                  ) : (
                    <>
                  <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                    {detail.selection.state === "FIXED_PARAMETER_PROFILE"
                      ? "Fixed profile — no trial was run, so no best trial or θ*."
                      : "No selection published."}
                  </p>
                  {/* `selected_trial_ref` is pinned null: nothing points at a trial. */}
                  <Gap gap={detail.selection.selection_trace} what="selection trace" />
                  <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-selected-ref>
                    selected trial ref — none published
                  </span>
                    </>
                  )}
                </section>

                {lane && lane.surface?.state === "AVAILABLE" && lane.declared_space?.state === "AVAILABLE" ? (
                  <ThetaJourney surface={lane.surface} declared={lane.declared_space} schedule={lane.search_contract.optimization_schedule} />
                ) : lane ? (
                  <RetainedThetaJourney search={lane} />
                ) : (
                  <EmptyPanel id="parameter_frequency" title={DIAGNOSTIC_LABEL.parameter_frequency} gap={detail.diagnostics.parameter_frequency} />
                )}

                {lane ? (
                  <section className={CARD} style={CARD_STYLE} data-panel="inspection" data-inspection-state="RETAINED_FOLD_FILTER">
                    <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                      fold inspection
                    </h3>
                    <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-inspection-fold={inspected!.ledger.fold_filter?.fold_id ?? ""}>
                      {/* D6/H15: a global study has one selection for every fold; the fold the reader holds is the cursor's (1-based), not the ledger's id. */}
                      {foldNote === null && runSchedule === "global"
                        ? "One global selection — applies to every fold"
                        : foldNote ?? "no fold filter"}{" "}
                      ·{" "}
                      <span className="mono" title={inspected!.ledger.fold_filter?.rule ?? undefined}>
                        {inspected!.ledger.fold_filter?.matched_rows ?? inspected!.ledger.source_trial_count} of {inspected!.ledger.source_trial_count}
                      </span>{" "}
                      trials
                    </p>
                    {foldLedger.state === "refused" ? (
                      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-fold-filter-refused={foldLedger.refusal.code ?? ""}>
                        fold filter — not applied · {foldLedger.refusal.code ?? `HTTP ${foldLedger.refusal.status}`}
                      </span>
                    ) : null}
                  </section>
                ) : (
                <section
                  className={CARD}
                  style={CARD_STYLE}
                  data-panel="inspection"
                  data-inspection-state={detail.inspection.state}
                >
                  <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    fold inspection
                  </h3>
                  <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-inspection-fold={detail.inspection.requested_fold ?? ""}>
                    {detail.inspection.requested_fold === null
                      ? "No fold requested."
                      : `Fold ${detail.inspection.requested_fold} requested.`}{" "}
                    {detail.inspection.state === "NOT_APPLICABLE" ? "Not applicable — no optimizer fold." : "Not published."}
                  </p>
                  <Withheld availability={detail.inspection.availability} />
                </section>
                )}
              </div>
              )}
            </div>

            {/* ------------------------------------------ ledger, full width */}
            <LedgerPanel slot={ledgerSlot} detail={detail} onNeeded={ensureLedger} pick={pick} onPick={onPick} onClear={onClear} foldNote={foldNote} more={ledgerMore} />

            {absences.length > 0 ? (
              <section className="flex flex-wrap gap-x-5 gap-y-1.5 px-1" data-source-absences>
                {absences.map(([name, gap]) => (
                  <Gap key={name} gap={gap} what={name.replace(/_/g, " ")} />
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
      </ResearchPanel>

    </div>
  );
}
