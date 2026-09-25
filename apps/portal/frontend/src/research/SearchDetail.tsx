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

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ProvenanceStrip } from "./ProvenanceStrip";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
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
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import { AsOf, CopyEvidenceLink, Digest, RunNotFound, SCREEN_FRAME } from "./SplitDetail";
import { LANE_STATE_COPY, laneNotApplicableSentence } from "./splitClient";
import type { LedgerSlot } from "./useSearch";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

export const SEARCH_TITLE = "Search & Selection — how parameters were searched and selected";

/** Spec 06 §1 and the hi-fi's own header line. */
export const SEARCH_SUBTITLE =
  "Stage A searches on IS. The pool freezes. Stage B selects on the frozen pool. Information crosses the freeze line one way — unless the schedule lets OOS in, and then the claim says exactly that.";

/**
 * The footer, in parts (FE-S06-04, DQ-15). The rule is always true of this
 * screen; the fixed-profile sentence is a fact about the run and appears only
 * when the read published that fact — never while loading, refused or 404.
 */
export const SEARCH_RULES_BASE =
  "A panel degrades when a field is missing; it never infers one. The frontend never clusters, never ranks and never computes J.";
export const SEARCH_RULES_FIXED_PROFILE =
  "This run was qualified against a fixed parameter profile rather than searched, so every optimizer panel above states which kind of absence it is — a question that does not arise, a fact nobody published, or a claim nobody asserted.";

/** Kept for callers of the P15 build: the sentence that is always true. */
export const SEARCH_RULES_FOOTER = SEARCH_RULES_BASE;

export const FREEZE_LABEL = "POOL FREEZE";

/**
 * Spec 06 §10's switcher note, minus its first clause: there is no switcher on
 * a product route, so the half that points at one is left out.
 */
export const ONE_MODE_NOTE = "a real run's mode is fixed at submit.";

const DIAGNOSTIC_LABEL: Record<DiagnosticKey, string> = {
  scatter: "A2 · trial surface",
  distributions: "A4 · per-parameter sampled regions",
  parameter_frequency: "B4 · θ* journey — parameter frequency",
  progression: "A3 · progression · concentration · pruned rail",
  prune_reasons: "A3 · prune reasons",
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
  REPORT_ONLY: { words: "report only", tone: "var(--state-unavailable)" },
  WITHHELD: { words: "withheld", tone: "var(--role-is)" },
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

/** HiFi claim-row aside, verbatim: a fact about this screen, true of every run. */
export const SELECTOR_LAYERS_NOTE = [
  "Two selector layers, two enums: ",
  "optimization_mode",
  " belongs to the walk-forward endpoint; ",
  "CandidateSelector.mode",
  " belongs to the optimization package. This screen never mixes them.",
] as const;

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
      <span data-claim-value>{value}</span>
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
        <span data-claim-value>{fact.value}</span>
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
 * Scoring backend: a confirmed value, or what the request declared — which is
 * not an executed fact, and is tagged so — or the typed absence.
 */
function ScoringBackendFact({ backend }: { backend: ScoringBackend }) {
  if (backend.state === "CONFIRMED" && backend.declared_value !== null) {
    return (
      <span className="flex items-baseline gap-1.5" data-claim-fact="scoring backend" data-claim-state="CONFIRMED">
        <span data-claim-value>{backend.declared_value}</span>
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
          <span data-claim-declared>{backend.declared_value}</span>
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

/** A panel the hi-fi fills from an optimizer, kept as a frame with its reason. */
function EmptyPanel({ id, title, gap }: { id: string; title: string; gap: SearchSourceGap }) {
  return (
    <section className={CARD} style={CARD_STYLE} data-panel={id} data-panel-state={gap.state}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          {title}
        </h3>
        <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={gapReason(gap)}>
          {SEARCH_GAP_WORDS[gap.state]}
        </span>
      </div>
      <span className="mono break-all text-[9px]" style={{ color: "var(--ink-faint)" }} data-gap-reason={id}>
        {gapReason(gap)}
      </span>
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

/** HiFi A1 note, from the server's own bound state and placement — no browser threshold. */
const BOUND_WORDS: Record<Parameter["bound_state"], string> = {
  WITHIN_DECLARED_RANGE: "within range",
};

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
function ParameterTable({ parameters }: { parameters: readonly Parameter[] }) {
  return (
    <div className="flex min-w-0 flex-col" data-parameters={parameters.length}>
      <div
        className="flex border-b pb-[3px] text-[9.5px] uppercase tracking-[.06em]"
        style={{ color: "var(--ink-faint)", borderColor: "var(--line-soft)" }}
        data-a1-head
      >
        {A1_COLUMNS.map((column) => (
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
          <span className="w-[112px] flex-none" style={{ color: "var(--ink-soft)" }} data-kind={parameter.name}>
            {parameter.kind}
          </span>
          <span className="w-[96px] flex-none" style={{ color: "var(--ink-soft)" }} data-range={parameter.name}>
            {parameter.minimum} … {parameter.maximum}
          </span>
          <span className="w-[44px] flex-none text-right" style={{ color: "var(--ink-soft)" }} data-step={parameter.name}>
            {parameter.step}
          </span>
          {/* Levels are not served: the cell keeps its place and its reason, and
              the absence is printed once, under the table — not eight times. */}
          <span
            className="w-[56px] flex-none text-right"
            title={LEVELS_REASON}
            data-levels={parameter.name}
            data-levels-state="NOT_PUBLISHED"
          >
            <span className="sr-only">levels not published</span>
          </span>
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
                className="absolute bottom-[-1px] h-[11px] w-[2px]"
                style={{ left: `${parameter.position_percent}%`, background: "var(--good)" }}
              />
            </span>
            <span
              className="w-[118px] flex-none text-[9px] [font-family:var(--font-body)]"
              style={{ color: "var(--ink-faint)" }}
              title={`${parameter.bound_state} · ${parameter.position_percent}% of the declared range`}
              data-bound-state={parameter.bound_state}
            >
              {BOUND_WORDS[parameter.bound_state] ?? parameter.bound_state} · {Math.round(parameter.position_percent)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ the ledger */

function LedgerPanel({
  slot,
  detail,
  onNeeded,
}: {
  slot: LedgerSlot;
  detail: SearchDetailDocument;
  onNeeded: () => void;
}) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);

  const ledgerGap = { state: detail.ledger.state, reason_code: detail.ledger.reason_code };

  return (
    <section className="flex min-w-0 flex-col overflow-x-auto rounded-[6px] border" style={CARD_STYLE} data-ledger={slot.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--line)" }} data-ledger-title>
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          trial ledger — around θ* · Optuna trials only; candidate replays are a separate ledger
        </h3>
        {slot.state === "ready" ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-ledger-total>
            {slot.search.ledger.returned_rows} of {slot.search.ledger.source_trial_count} retained trials
          </span>
        ) : null}
      </div>

      {slot.state === "ready" ? (
        <LedgerRows search={slot.search} />
      ) : (
        <>
          <LedgerHead />
          <div className="flex flex-col gap-1 px-3 py-2.5">
            {slot.state === "not-applicable" ? (
              /* RF-05: the retained lane answered a typed not-applicable. */
              <div className="flex flex-col gap-1" data-ledger-shell>
                <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                  {/* "exists" only where the read says the question does not arise. */}
                  {ledgerGap.state === "NOT_APPLICABLE" ? "No trial ledger exists for this run" : "No trial ledger is shown for this run"}
                  : the search read says the ledger is{" "}
                  <span className="mono" data-ledger-gap-state={ledgerGap.state}>
                    {SEARCH_GAP_WORDS[ledgerGap.state as SearchSourceGap["state"]] ?? ledgerGap.state}
                  </span>{" "}
                  — <span className="mono text-[10px]">{ledgerGap.reason_code}</span>. No row, count or zero is shown in
                  its place.
                </p>
                <p
                  className="text-[10.5px] leading-[1.5]"
                  style={{ color: "var(--ink-faint)" }}
                  data-ledger-lane="not-applicable"
                  title={`${slot.answer.lane.reason_code} · adapter ${slot.answer.lane.run_adapter_contract_digest}`}
                >
                  retained ledger lane — {laneNotApplicableSentence(slot.answer)}
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
                  For this run the search contract says the ledger is{" "}
                  <span className="mono" data-ledger-gap-state={ledgerGap.state}>
                    {SEARCH_GAP_WORDS[ledgerGap.state as SearchSourceGap["state"]] ?? ledgerGap.state}
                  </span>{" "}
                  — <span className="mono">{ledgerGap.reason_code}</span>. No row, count or zero is shown in its place.
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

      {slot.state === "ready" ? (
        <div className="border-t px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}>
          The OOS column has four states from the mode × schedule matrix — never a boolean. The UI recomputes no
          objective.
        </div>
      ) : null}
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
function LedgerRows({ search }: { search: CurrentSourceSearch }) {
  const trials = search.ledger.trials;
  const selectedId = search.selection.selected_trial_id;
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-1">
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-candidate-count>
          {search.candidates.rows.length} of {search.candidates.source_candidate_count} candidates
        </span>
        {search.search_contract ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-ledger-scope>
            {search.search_contract.optuna_trials_scope ?? "scope not published"} study · {search.search_contract.trial_ledger_mode ?? "ledger mode not published"} ledger ·
            fold filter {search.ledger.fold_filter?.fold_id ?? "none"}
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
            onClick={() => setPicked(trial.trial_id)}
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
            <span className={columnClass(LEDGER_COLUMNS[5])} style={columnStyle(LEDGER_COLUMNS[5])}>
              <NotPublished title="the retained ledger publishes no parameter digest per trial" />
            </span>
            <span className={`${columnClass(LEDGER_COLUMNS[6])} text-[9.5px]`} style={{ color: "var(--ink-faint)" }} data-trial-note>
              {facts && facts.state === "AVAILABLE"
                ? `${facts.stage ?? "stage not published"} · ${scopeWords(facts)} · objective = ${OBJECTIVE_KIND_WORDS[facts.objective_kind]} · `
                : ""}
              {Object.keys(trial.parameters).length > 0
                ? Object.entries(trial.parameters)
                    .map(([name, value]) => `${name}=${value}`)
                    .join(" · ")
                : "parameters not published"}
            </span>
          </button>
        );
      })}
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
          candidate replays — Stage B, every fold, the selector&apos;s own ledger
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
  const rows: [string, number, string][] = [
    ["Optuna trials (Stage A)", search.ledger.source_trial_count, `${contract.optuna_trials_scope ?? "scope not published"} study · ${contract.n_studies ?? "?"} study`],
    [
      "candidate pool",
      search.candidates.source_candidate_count,
      contract.top_is_fraction !== null ? `top_is_fraction ${contract.top_is_fraction}` : contract.top_is_k !== null ? `top_is_k ${contract.top_is_k}` : "pool rule not published",
    ],
    ["selected", search.selection.selected_trial_id === null ? 0 : 1, contract.candidate_selection_metric ?? "selector not published"],
  ];
  /* Bar length is geometry only: each count against the Stage A trial count. */
  const most = search.ledger.source_trial_count;
  return (
    <div className="flex flex-col gap-[5px]" data-retained-pool>
      {rows.map(([label, n, note]) => (
        <span key={label} className="mono flex items-center gap-2 text-[10.5px]" data-pool-row={label}>
          <span className="w-[158px] flex-none text-[10.5px] [font-family:var(--font-body)]" style={{ color: "var(--ink-soft)" }}>
            {label}
          </span>
          <span className="h-[8px] rounded-[2px]" style={{ width: `${n === 0 ? 2 : Math.round((n / most) * 120)}px`, background: "var(--accent-2)" }} />
          <span className="w-[40px] flex-none text-right">{n}</span>
          <span className="flex-1 pl-1.5 text-[9px]" style={{ color: "var(--ink-faint)" }}>
            {note}
          </span>
        </span>
      ))}
    </div>
  );
}

const TERM_WORDS: Record<string, string> = {
  mean_oos_sharpe: "S̄_OOS — mean OOS Sharpe over the outer folds",
  std_decay: "σ(decay) — dispersion of per-fold decay, weighted by −λ",
  positive_mean_decay: "max(0, D̄) — positive mean decay, weighted by −γ",
  mean_is_sharpe: "S̄_IS — the Stage A objective",
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
      <span className="mono border-l-2 py-0.5 pl-2.5 text-[11px]" style={{ borderColor: "var(--accent)" }}>
        J = S̄_OOS − λ·σ(decay) − γ·max(0, D̄) · λ {search.diagnostics.probe.decay_lambda ?? "?"} · γ {search.diagnostics.probe.decay_gamma ?? "?"}
      </span>
      {components.terms.map((term) => (
        <span key={term.term} className="flex items-baseline gap-[9px] border-b py-0.5 text-[10.5px]" style={{ borderColor: "var(--paper-sunken)" }} data-formula-term={term.term}>
          <span className="mono w-[150px] flex-none" style={{ color: "var(--ink-soft)" }}>
            {term.term}
          </span>
          <span className="flex-1" style={{ color: "var(--ink-faint)" }}>
            {TERM_WORDS[term.term] ?? term.term} · value {ratio2(term.value)} × weight {term.weight}
          </span>
          <span className="mono" title={term.contribution}>
            {ratio2(term.contribution)}
          </span>
        </span>
      ))}
      <span className="flex items-baseline gap-[9px] pt-0.5 text-[10.5px]" data-formula-total>
        <span className="mono w-[150px] flex-none" style={{ color: "var(--accent-2)" }}>
          J (selected)
        </span>
        <span className="flex-1" style={{ color: "var(--ink-faint)" }}>
          as QuantBT ranked it — {search.diagnostics.probe.objective_rows_recomposed} of {search.diagnostics.probe.objective_rows} retained objectives recompose from their terms
        </span>
        <span className="mono font-semibold" title={search.selection.objective ?? undefined}>
          {ratio2(search.selection.objective)}
        </span>
      </span>
    </div>
  );
}

/** W3 · B3: raw IS best, the selected candidate and a centroid kept apart. */
function RetainedBestVsSelected({ search }: { search: CurrentSourceSearch }) {
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
  return (
    <div className="flex flex-col gap-2" data-retained-roles>
      <div className="flex gap-2.5">
        {card(roles.raw_best_is, "best_trial", "var(--bad)", "RANK 1 BY IS", "raw-best")}
        {card(roles.selected, "selected", "var(--accent-2)", "SELECTED BY POLICY", "selected")}
      </div>
      <span className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }} data-roles-note>
        {same === true
          ? "The IS best and the selected candidate are the same trial here, but the two numbers measure different things: the IS search scores mean IS Sharpe; the selector ranks the candidate by Mode 1 J over every outer fold."
          : same === false
            ? "The selector did not take the IS best: it ranked the candidate pool by Mode 1 J over every outer fold."
            : "No selection is published, so the IS best is not promoted in its place."}{" "}
        <span data-centroid={roles.centroid.state} title={roles.centroid.reason_code ?? undefined}>
          Centroid — {roles.centroid.state === "NOT_APPLICABLE" ? "not applicable to this selector" : "not published"}.
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ freeze line */

function FreezeLine({ detail }: { detail: SearchDetailDocument }) {
  const froze = false; /* No contract field publishes a pool freeze yet (CG-P15-03). */
  const title = froze
    ? "Stage A searches, the pool freezes, Stage B selects on what was frozen."
    : "Stage A searches, the pool freezes, Stage B selects on what was frozen. This run froze no pool because it ran no search.";
  /* The run's claim matrix (which way information crossed) is not published
     (CG-P15-05); a fixed profile froze nothing, and says so. */
  const kind: FreezeArrowKind = detail.source_profile.state === "FIXED_PROFILE_NO_SEARCH" ? "no-freeze" : "unpublished";
  const arrow = freezeArrow(kind);
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
          title={title}
        >
          {FREEZE_LABEL} · {froze ? "FROZEN" : "NONE — NO SEARCH RAN"}
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
  onReread: () => void;
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
]);

export function SearchScreen({
  runId,
  detail,
  state,
  notFound = false,
  cursor,
  ledger,
  ensureLedger,
  onReread,
}: SearchScreenProps) {
  const profile = detail?.fixed_profile;
  const parameters = profile?.parameters ?? [];
  const fixed = detail?.source_profile.state === "FIXED_PROFILE_NO_SEARCH";
  const runPath = `/research/quantbt/runs/${encodeURIComponent(runId)}`;
  const absences = detail ? Object.entries(detail.source_absences).filter(([name]) => !SHOWN_GAPS.has(name)) : [];
  const gapOf = (name: string): SearchSourceGap | null => detail?.source_absences[name] ?? null;
  const metric = detail?.requested_optimizer.candidate_selection_metric;
  /* W3: a sealed retained WFO run answers the claim row, Stage B and two Stage A panels. */
  const retained = ledger.state === "ready" && (ledger.search as Partial<CurrentSourceSearch>).search_contract ? ledger.search : null;
  const retainedClaims =
    retained && retained.search_contract.availability.state === "AVAILABLE" ? retained.search_contract : null;

  return (
    <div className={`${SCREEN_FRAME} max-w-[1560px]`} data-screen="search-detail" data-run={runId}>
      {/* ------------------------------------------------------ header */}
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
            <span className="mono min-w-0 truncate" title={runId}>
              {runId}
            </span>
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
          <p
            className="text-[13.5px] italic [line-height:normal]"
            style={{ fontFamily: "var(--font-display)", color: "var(--ink-faint)" }}
            data-subtitle
          >
            {SEARCH_SUBTITLE}
          </p>
        </div>
        {detail ? (
          <div className="flex flex-none flex-col items-end gap-[5px]">
            <AsOf at={detail.as_of_utc_ms} source="search read" basis={detail.as_of_basis} />
            <CopyEvidenceLink />
          </div>
        ) : null}
      </header>

      {notFound ? <RunNotFound runId={runId} /> : null}

      <ResearchPanel
        title="search & selection"
        variant="plain"
        state={state}
        minBodyHeight={240}
        recovery={
          state.mayRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              reread search
            </button>
          ) : undefined
        }
      >
        {detail ? (
          <div className="flex flex-col gap-[14px]">
            {/* --------------------------------------- mode × schedule card */}
            <section className="rounded-[6px] border" style={RAISED_STYLE} data-source-strip={detail.source_profile.state}>
              <div className="flex flex-wrap items-center gap-2 border-b px-[14px] py-[9px]" style={{ borderColor: "var(--line-soft)" }}>
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  optimization_mode
                </span>
                {/* One run is one mode: the run's own, read-only — never a switcher. */}
                <span data-requested-optimizer={detail.requested_optimizer.state} className="flex flex-wrap items-center gap-2">
                  {detail.requested_optimizer.mode !== null ? (
                    <Pill on data-run-mode>
                      {detail.requested_optimizer.mode}
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
                  {detail.requested_optimizer.schedule !== null ? (
                    <Pill
                      on
                      tone={schedulePillTone(detail.requested_optimizer.schedule)}
                      data-run-schedule
                      data-pill-tone={schedulePillTone(detail.requested_optimizer.schedule)}
                      title={
                        schedulePillTone(detail.requested_optimizer.schedule) === "warn"
                          ? "only per_fold_causal keeps OOS out of selection — this schedule is shown in the warn style"
                          : undefined
                      }
                    >
                      {detail.requested_optimizer.schedule}
                    </Pill>
                  ) : (
                    <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} data-run-schedule>
                      schedule not published
                    </span>
                  )}
                  <span className="mono text-[10.5px] italic" style={{ color: "var(--accent-2)" }}>
                    {detail.requested_optimizer.state.toLowerCase().replace(/_/g, " ")}
                  </span>
                </span>
                <span className="ml-auto text-[10px]" style={{ color: "var(--ink-faint)" }} data-one-mode>
                  {ONE_MODE_NOTE}
                </span>
              </div>

              {/* Claim row — HiFi's six fields first, each a shell where the read publishes nothing, then the run's own facts. */}
              <div className="flex flex-wrap items-stretch min-[900px]:flex-nowrap">
                <div
                  className="flex flex-1 flex-wrap gap-x-6 gap-y-2 px-[14px] py-[9px]"
                  data-claim-row
                  data-claim-basis={detail.claim_row.basis}
                  title={`claim basis ${detail.claim_row.basis}`}
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
                      <RetainedToken value={String(retainedClaims.oos_used_for_selection)} what="oos used for selection" />
                    ) : (
                      <ClaimToken fact={detail.claim_row.oos_used_for_selection} what="oos used for selection" />
                    )}
                  </Claim>
                  <Claim k="OOS column state">
                    <OosColumnChip column={detail.claim_row.oos_column} />
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
                        <span data-metric-value={metric.value}>{metric.value}</span>
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
                    <span data-source-profile={detail.source_profile.state} title={detail.source_profile.reason_code ?? undefined}>
                      {detail.source_profile.state}
                    </span>
                  </Claim>
                  <Claim k="selection" data-selection-state={detail.selection.state}>
                    {detail.selection.state}
                  </Claim>
                  <Claim k="strict outer OOS">
                    {profile ? <Gap gap={profile.strict_outer_oos} what="strict outer OOS" bare /> : null}
                  </Claim>
                  <Claim k="readiness">
                    <span
                      data-readiness={detail.readiness}
                      title="The server's own word: a fixed profile is published; the optimizer facts around it are absent by nature."
                    >
                      {detail.readiness}
                    </span>
                  </Claim>
                  {profile && profile.parameter_bundle_digest !== null ? (
                    <Claim k="parameter bundle">
                      <Digest value={profile.parameter_bundle_digest} data-bundle-digest />
                    </Claim>
                  ) : null}
                </div>
                <div
                  className="flex w-full items-center border-t px-[14px] py-[9px] min-[900px]:w-auto min-[900px]:max-w-[250px] min-[900px]:border-l min-[900px]:border-t-0"
                  style={{ borderColor: "var(--line-soft)" }}
                  data-selector-layers
                >
                  <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                    {SELECTOR_LAYERS_NOTE[0]}
                    <span className="mono">{SELECTOR_LAYERS_NOTE[1]}</span>
                    {SELECTOR_LAYERS_NOTE[2]}
                    <span className="mono">{SELECTOR_LAYERS_NOTE[3]}</span>
                    {SELECTOR_LAYERS_NOTE[4]}
                  </span>
                </div>
              </div>

              {/* HiFi "what this mode reads": what a mode reads is Atlas release
                  metadata for the declared mode (claim_row.mode_reference), never
                  run evidence — so it is a link there, tagged so, not cells here. */}
              <div
                className="flex flex-wrap items-center gap-[14px] rounded-b-[6px] border-t px-[14px] py-2"
                style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
                data-mode-reads={detail.claim_row.mode_reference ? "reference" : "shell"}
              >
                <span className={`${LABEL} flex-none`} style={{ color: "var(--ink-faint)" }}>
                  what this mode reads
                </span>
                {detail.claim_row.mode_reference ? (
                  <>
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
                    <span className="min-w-[260px] flex-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                      {detail.claim_row.basis === "DECLARED_NOT_EXECUTED"
                        ? "The request declared this mode and the source did not execute it. What the mode reads on each side of the freeze is described for the release in the Atlas; nothing from it is drawn here as this run's evidence."
                        : "What the mode reads on each side of the freeze is described for the release in the Atlas; nothing from it is drawn here as this run's evidence."}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="mono text-[10.5px] italic"
                      style={{ color: "var(--ink-faint)" }}
                      title={`claim basis ${detail.claim_row.basis}`}
                    >
                      not published
                    </span>
                    <span className="min-w-[260px] flex-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                      The search read names no declared mode for this run, so there is no Atlas entry to point at and no
                      cell is drawn.
                    </span>
                  </>
                )}
              </div>
            </section>

            <ProvenanceStrip provenance={detail.provenance} />

            {/* ------------------------------------ Stage A · freeze · Stage B */}
            <div
              className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[1.08fr_52px_1fr] min-[1100px]:gap-0"
              data-stage-grid
            >
              <div className="flex min-w-0 flex-col gap-3" data-stage="A">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <h2 className="mono text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: "var(--role-is)" }}>
                    Stage A · search
                  </h2>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    {fixed ? "no sampler ran — the source declared a fixed profile" : "what the sampler searched, on IS"}
                  </span>
                </div>

                <section className={`${CARD} min-w-0 overflow-x-auto`} style={CARD_STYLE} data-panel="search-space">
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
                    <ParameterTable parameters={parameters} />
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

                {STAGE_A_DIAGNOSTICS.map((key) => (
                  <EmptyPanel
                    key={key}
                    id={key}
                    title={DIAGNOSTIC_LABEL[key]}
                    gap={
                      retained && (key === "prune_reasons" || key === "importance")
                        ? /* W3 · CG-P15-04: the retained lane's capability probe answers these two. */
                          { state: retained.diagnostics[key].state, reason_code: retained.diagnostics[key].reason_code } as SearchSourceGap
                        : detail.diagnostics[key]
                    }
                  />
                ))}
              </div>

              <FreezeLine detail={detail} />

              <div className="flex min-w-0 flex-col gap-3" data-stage="B">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <h2 className="mono text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: "var(--accent-2)" }}>
                    Stage B · selection
                  </h2>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    {fixed ? "no pool was frozen — the declared profile is the selection" : "selects on the frozen pool"}
                  </span>
                </div>

                <section className={CARD} style={CARD_STYLE} data-panel="pool-freeze">
                  <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    B1 · pool freeze
                  </h3>
                  {retained ? <RetainedPoolFreeze search={retained} /> : gapOf("candidate_pool") ? <Gap gap={gapOf("candidate_pool") as SearchSourceGap} what="candidate pool" showReason /> : null}
                </section>

                <section className={CARD} style={CARD_STYLE} data-panel="formula">
                  <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    B2 · the formula of {detail.requested_optimizer.mode ?? "this mode"} — every term
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
                    <RetainedBestVsSelected search={retained} />
                  ) : (
                    <>
                  <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                    {detail.selection.state === "FIXED_PARAMETER_PROFILE"
                      ? "The parameters in A1 are the profile this run was qualified against. No trial was selected, because no trial was run — there is no best card, no pick and no θ* that came out of a search."
                      : "The source published no selection for this run."}
                  </p>
                  {/* `selected_trial_ref` is pinned null: nothing points at a trial. */}
                  <Gap gap={detail.selection.selection_trace} what="selection trace" />
                  <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-selected-ref>
                    selected trial ref — none published
                  </span>
                    </>
                  )}
                </section>

                <EmptyPanel id="parameter_frequency" title={DIAGNOSTIC_LABEL.parameter_frequency} gap={detail.diagnostics.parameter_frequency} />

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
                      ? "No fold was requested."
                      : `Fold ${detail.inspection.requested_fold} was requested.`}{" "}
                    {detail.inspection.state === "NOT_APPLICABLE"
                      ? "This source has no optimizer fold, so the request is answered not applicable rather than by treating a split fold as a trial fold."
                      : "The source published nothing for it."}
                  </p>
                  <Withheld availability={detail.inspection.availability} />
                </section>
              </div>
            </div>

            {/* ------------------------------------------ ledger, full width */}
            <LedgerPanel slot={ledger} detail={detail} onNeeded={ensureLedger} />

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

      <footer className="flex flex-col gap-[3px] border-t pt-2" style={{ borderColor: "var(--line)" }}>
        <span className="text-[9.5px] uppercase tracking-[.1em]" style={{ color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p className="text-[11px] leading-[1.6]" style={{ color: "var(--ink-soft)" }} data-rules-footer>
          {SEARCH_RULES_BASE}
          {fixed ? ` ${SEARCH_RULES_FIXED_PROFILE}` : ""}
        </p>
      </footer>
    </div>
  );
}
