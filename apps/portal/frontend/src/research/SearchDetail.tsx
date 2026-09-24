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

import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ProvenanceStrip } from "./ProvenanceStrip";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import {
  DIAGNOSTIC_KEYS,
  SEARCH_GAP_WORDS,
  SEARCH_WITHHELD_WORDS,
  gapReason,
  type CurrentSourceSearch,
  type DiagnosticKey,
  type Parameter,
  type SearchAvailability,
  type SearchDetail as SearchDetailDocument,
  type SearchSourceGap,
} from "./searchClient";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import { AsOf, CopyEvidenceLink, Digest, RunNotFound } from "./SplitDetail";
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

function Pill({ children, on = false, ...rest }: { children: ReactNode; on?: boolean } & Record<string, unknown>) {
  return (
    <span
      className="mono rounded-[3px] border px-[10px] py-[3px] text-[10.5px] leading-[14px]"
      style={
        on
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

function Claim({ k, children, ...rest }: { k: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <span className="flex min-w-0 flex-col gap-[2px]" {...rest}>
      <span className="text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {k}
      </span>
      <span className="mono text-[11.5px]" style={{ color: "var(--ink)" }}>
        {children}
      </span>
    </span>
  );
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

const A1_COLUMNS = [
  { head: "param", width: 86 },
  { head: "kind", width: 72 },
  { head: "low … high", width: 96 },
  { head: "step", width: 44 },
  { head: "θ* and range position", width: 0 },
];

/**
 * The one panel with real content: the parameters the profile declares.
 *
 * The tick is drawn at `position_percent` — the server's placement of the
 * effective value inside its own range. The browser does not work it out.
 * `levels` is not served, so the column is not drawn rather than computed.
 */
function ParameterTable({ parameters }: { parameters: readonly Parameter[] }) {
  return (
    <div className="flex flex-col gap-[6px] overflow-x-auto" data-parameters={parameters.length}>
      <div className="flex min-w-[460px] items-baseline gap-2 px-[3px]">
        {A1_COLUMNS.map((column) => (
          <span
            key={column.head}
            className="text-[9.5px] uppercase tracking-[.06em]"
            style={{
              color: "var(--ink-faint)",
              flex: column.width ? `0 0 ${column.width}px` : "1 1 auto",
            }}
          >
            {column.head}
          </span>
        ))}
      </div>

      {parameters.map((parameter) => (
        <div key={parameter.name} className="mono flex min-w-[460px] items-center gap-2 py-[2px] text-[10.5px]" data-parameter={parameter.name}>
          <span style={{ flex: "0 0 86px" }}>{parameter.name}</span>
          <span style={{ flex: "0 0 72px", color: "var(--ink-soft)" }} data-kind={parameter.name}>
            {parameter.kind}
          </span>
          <span style={{ flex: "0 0 96px", color: "var(--ink-faint)" }} data-range={parameter.name}>
            {parameter.minimum} … {parameter.maximum}
          </span>
          <span style={{ flex: "0 0 44px", color: "var(--ink-faint)" }}>{parameter.step}</span>
          <span className="flex flex-1 items-center gap-2">
            <span className="font-semibold" style={{ flex: "0 0 40px", textAlign: "right" }} data-effective={parameter.name}>
              {parameter.effective_value}
            </span>
            <span
              className="relative h-[10px] flex-1 rounded-[2px]"
              style={{ background: "var(--paper-sunken)" }}
              role="img"
              aria-label={`${parameter.name} ${parameter.effective_value} at ${parameter.position_percent}% of ${parameter.minimum} … ${parameter.maximum}`}
              title={`${parameter.effective_value} sits at ${parameter.position_percent}% of the declared range · ${parameter.bound_state}`}
            >
              <span
                data-position={parameter.name}
                data-position-percent={parameter.position_percent}
                className="absolute top-[-2px] h-[14px] w-[2px]"
                style={{ left: `${parameter.position_percent}%`, background: "var(--good)" }}
              />
            </span>
          </span>
        </div>
      ))}

      {/* The server's bound state, said once rather than stamped on each row. */}
      {[...new Set(parameters.map((parameter) => parameter.bound_state))].map((bound) => (
        <span key={bound} className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-bound-state={bound}>
          every parameter above: {bound}
        </span>
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
    <section className="flex min-w-0 flex-col rounded-[6px] border" style={CARD_STYLE} data-ledger={slot.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
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
          <div className="overflow-x-auto">
            <LedgerHead />
          </div>
          <div className="flex flex-col gap-1 px-3 py-2.5">
            {slot.state === "not-applicable" ? (
              /* FE-X-12: the search read already answered; the retained lane was not asked. */
              <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-ledger-shell>
                No trial ledger exists for this run: the search read says the ledger is{" "}
                <span className="mono" data-ledger-gap-state={ledgerGap.state}>
                  {SEARCH_GAP_WORDS[ledgerGap.state as SearchSourceGap["state"]] ?? ledgerGap.state}
                </span>{" "}
                — <span className="mono text-[10px]">{ledgerGap.reason_code}</span>. No row, count or zero is shown in
                its place.
              </p>
            ) : slot.state === "refused" ? (
              <div className="flex flex-col gap-1" data-ledger-refusal>
                <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                  <RefusalNote refusal={slot.refusal} />
                </p>
                <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
                  A retained trial ledger exists only for the admitted Advanced-WFO profile. For this run the search
                  contract says the ledger is{" "}
                  <span className="mono" data-ledger-gap-state={ledgerGap.state}>
                    {ledgerGap.state.toLowerCase().replace(/_/g, " ")}
                  </span>{" "}
                  — <span className="mono">{ledgerGap.reason_code}</span>. No row, count or zero is shown in its place.
                </p>
              </div>
            ) : (
              <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                reading the retained ledger…
              </p>
            )}
          </div>
        </>
      )}

      {slot.state === "ready" ? (
        <div className="border-t px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--paper-sunken)", color: "var(--ink-faint)" }}>
          The OOS column has four states from the mode × schedule matrix — never a boolean. The UI recomputes no
          objective.
        </div>
      ) : null}
    </section>
  );
}

const LEDGER_COLUMNS = [
  { head: "trial", width: 96 },
  { head: "seed", width: 50 },
  { head: "state", width: 96 },
  { head: "S_IS", width: 76 },
  { head: "S_OOS", width: 120 },
  { head: "digest", width: 110 },
  { head: "note", width: 0 },
];

function LedgerHead() {
  return (
    <div className="flex min-w-[760px] border-t px-3 py-[5px]" style={{ borderColor: "var(--paper-sunken)" }}>
      {LEDGER_COLUMNS.map((column) => (
        <span
          key={column.head}
          className="text-[9.5px] uppercase tracking-[.06em]"
          style={{ color: "var(--ink-faint)", flex: column.width ? `0 0 ${column.width}px` : "1 1 auto" }}
        >
          {column.head}
        </span>
      ))}
    </div>
  );
}

/**
 * The retained ledger, when the run is in the admitted profile. Selected,
 * raw-best and inspected stay three separate ideas, as RS-02 requires.
 */
function LedgerRows({ search }: { search: CurrentSourceSearch }) {
  const trials = search.ledger.trials;
  const selectedId = search.selection.selected_trial_id;

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 pb-1">
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-candidate-count>
          {search.candidates.rows.length} of {search.candidates.source_candidate_count} candidates
        </span>
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
      {trials.map((trial) => (
        <div
          key={trial.trial_id}
          className="mono flex min-w-[760px] items-baseline border-t px-3 py-1 text-[10.5px]"
          style={{
            borderColor: "var(--paper-sunken)",
            background: trial.trial_id === selectedId ? "var(--accent-2-soft)" : undefined,
          }}
          data-trial={trial.trial_id}
          data-trial-selected={trial.trial_id === selectedId}
        >
          <span style={{ flex: "0 0 96px" }}>{trial.trial_id}</span>
          <span style={{ flex: "0 0 50px", color: "var(--ink-faint)" }} className="italic" title="seed is not published per trial">
            not published
          </span>
          <span style={{ flex: "0 0 96px", color: "var(--ink-faint)" }} className="text-[9px]">
            {trial.state}
          </span>
          <span style={{ flex: "0 0 76px" }}>
            {trial.objective ?? (
              <span className="italic" style={{ color: "var(--ink-faint)" }}>
                not published
              </span>
            )}
          </span>
          <span style={{ flex: "0 0 120px", color: "var(--ink-faint)" }} className="italic">
            not published
          </span>
          <span style={{ flex: "0 0 110px", color: "var(--ink-faint)" }} className="italic">
            not published
          </span>
          <span className="flex-1 text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            {Object.entries(trial.parameters)
              .map(([name, value]) => `${name}=${value}`)
              .join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ freeze line */

function FreezeLine({ detail }: { detail: SearchDetailDocument }) {
  const froze = false; /* No contract field publishes a pool freeze yet (CG-P15-03). */
  const title = froze
    ? "Stage A searches, the pool freezes, Stage B selects on what was frozen."
    : "Stage A searches, the pool freezes, Stage B selects on what was frozen. This run froze no pool because it ran no search.";
  return (
    <div
      className="flex flex-row items-center gap-2 py-1 min-[1100px]:flex-col min-[1100px]:pt-[34px]"
      data-freeze-line={detail.selection.state}
    >
      <span className="h-0 flex-1 border-t-2 border-dashed min-[1100px]:h-auto min-[1100px]:w-0 min-[1100px]:border-l-2 min-[1100px]:border-t-0" style={{ borderColor: "var(--role-holdout)" }} />
      <span
        className="mono whitespace-nowrap text-[9.5px] font-bold tracking-[.14em] min-[1100px]:[transform:rotate(180deg)] min-[1100px]:[writing-mode:vertical-rl]"
        style={{ color: "var(--role-holdout)" }}
        title={title}
      >
        {FREEZE_LABEL} · {froze ? "FROZEN" : "NONE — NO SEARCH RAN"}
      </span>
      <span className="h-0 flex-1 border-t-2 border-dashed min-[1100px]:h-auto min-[1100px]:w-0 min-[1100px]:border-l-2 min-[1100px]:border-t-0" style={{ borderColor: "var(--role-holdout)" }} />
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

  return (
    <div className="flex flex-col gap-[14px]" data-screen="search-detail" data-run={runId}>
      {/* ------------------------------------------------------ header */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
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
            <span style={{ color: "var(--line)" }}>/</span>
            <span className="mono min-w-0 truncate" title={runId}>
              {runId}
            </span>
            <span style={{ color: "var(--line)" }}>/</span>
            <span style={{ color: "var(--ink)" }}>Stage 2 · Search &amp; Selection</span>
            {notFound ? null : (
              <>
                <Link
                  to={deepDiveHref(`${runPath}/split`, { ...cursor, stage: "split" })}
                  className="mono ml-2 text-[10px]"
                  style={{ color: "var(--accent)" }}
                  data-action="back-to-split"
                >
                  ← S1 Split
                </Link>
                <Link
                  to={deepDiveHref(`${runPath}/freeze`, { ...cursor, stage: "freeze" })}
                  className="mono ml-1 text-[10px]"
                  style={{ color: "var(--accent)" }}
                  data-action="next-stage"
                >
                  next: S3 Freeze →
                </Link>
              </>
            )}
          </nav>
          <h1 className="text-[22px] font-light leading-[1.2]" style={{ fontFamily: "var(--font-display)" }}>
            {SEARCH_TITLE}
          </h1>
          <p
            className="text-[13.5px] italic leading-[1.35]"
            style={{ fontFamily: "var(--font-display)", color: "var(--ink-faint)" }}
            data-subtitle
          >
            {SEARCH_SUBTITLE}
          </p>
        </div>
        {detail ? (
          <div className="flex flex-none flex-col items-end gap-[5px]">
            <AsOf at={detail.as_of_utc_ms} source="search read" />
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
            <section className="rounded-[6px] border" style={CARD_STYLE} data-source-strip={detail.source_profile.state}>
              <div className="flex flex-wrap items-center gap-2 border-b px-[14px] py-[9px]" style={{ borderColor: "var(--paper-sunken)" }}>
                <span className={LABEL} style={{ color: "var(--ink-faint)" }}>
                  optimization_mode
                </span>
                {/* One run is one mode: the run's own, read-only — never a switcher. */}
                <span data-requested-optimizer={detail.requested_optimizer.state} className="flex flex-wrap items-center gap-2">
                  <Pill on data-run-mode>
                    {detail.requested_optimizer.mode ?? "mode not published"}
                  </Pill>
                  <span className={`${LABEL} ml-3`} style={{ color: "var(--ink-faint)" }}>
                    schedule
                  </span>
                  <Pill on data-run-schedule>
                    {detail.requested_optimizer.schedule ?? "schedule not published"}
                  </Pill>
                  <span className="mono text-[10.5px] italic" style={{ color: "var(--role-holdout)" }}>
                    {detail.requested_optimizer.state.toLowerCase().replace(/_/g, " ")}
                  </span>
                </span>
                <span className="ml-auto text-[10px]" style={{ color: "var(--ink-faint)" }} data-one-mode>
                  {ONE_MODE_NOTE}
                </span>
              </div>

              {/* Claim row — the run's own words for what it claims. */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 px-[14px] py-[9px]" data-claim-row>
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
                <Claim k="candidate_selection_metric" data-metric-state={metric?.state}>
                  {metric?.state === "CONFIRMED" ? (
                    <span className="flex items-baseline gap-1.5">
                      <Chip data-metric-value={metric.value}>{metric.value}</Chip>
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
                <Claim k="validation claim">
                  <span className="italic" style={{ color: "var(--ink-faint)" }} title="the search read publishes no validation claim (CG-P15-05)">
                    not published
                  </span>
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
            </section>

            <ProvenanceStrip provenance={detail.provenance} />

            {/* ------------------------------------ Stage A · freeze · Stage B */}
            <div
              className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[1.08fr_52px_1fr] min-[1100px]:gap-0"
              data-stage-grid
            >
              <div className="flex min-w-0 flex-col gap-3" data-stage="A">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <h2 className="mono text-[11px] font-bold uppercase" style={{ color: "var(--role-is)" }}>
                    Stage A · search
                  </h2>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    {fixed ? "no sampler ran — the source declared a fixed profile" : "what the sampler searched, on IS"}
                  </span>
                </div>

                <section className={CARD} style={CARD_STYLE} data-panel="search-space">
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
                  <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-1.5" style={{ borderColor: "var(--paper-sunken)" }} data-coverage>
                    {gapOf("sampler_seed_warm_start") ? (
                      <Gap gap={gapOf("sampler_seed_warm_start") as SearchSourceGap} what="sampler · seeds" />
                    ) : null}
                    {gapOf("study") ? <Gap gap={gapOf("study") as SearchSourceGap} what="trials · grid size" /> : null}
                  </div>
                </section>

                {STAGE_A_DIAGNOSTICS.map((key) => (
                  <EmptyPanel key={key} id={key} title={DIAGNOSTIC_LABEL[key]} gap={detail.diagnostics[key]} />
                ))}
              </div>

              <FreezeLine detail={detail} />

              <div className="flex min-w-0 flex-col gap-3" data-stage="B">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <h2 className="mono text-[11px] font-bold uppercase" style={{ color: "var(--role-holdout)" }}>
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
                  {gapOf("candidate_pool") ? <Gap gap={gapOf("candidate_pool") as SearchSourceGap} what="candidate pool" showReason /> : null}
                </section>

                <section className={CARD} style={CARD_STYLE} data-panel="formula">
                  <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    B2 · the formula of {detail.requested_optimizer.mode ?? "this mode"} — every term
                  </h3>
                  {gapOf("objective_components") ? (
                    <Gap gap={gapOf("objective_components") as SearchSourceGap} what="objective components" showReason />
                  ) : null}
                </section>

                <section className={CARD} style={CARD_STYLE} data-panel="selection">
                  <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
                    B3 · best trial ≠ selected params
                  </h3>
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
        <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
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
