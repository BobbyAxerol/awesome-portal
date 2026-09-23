/**
 * Screen 06 — S2 Search & Selection (P15 + RS-02).
 *
 * The hi-fi is a study of an optimizer: a trial surface, a progression rail,
 * per-parameter distributions, importance bars, a freeze line and a pool
 * funnel. The installed source ran no search. So this screen keeps that
 * geometry — Stage A, the freeze line, Stage B — and fills it with the one
 * thing the source did publish, a declared fixed parameter profile, and with
 * the exact reason each other panel is empty.
 *
 * The distinction the whole screen turns on: **a search that did not happen is
 * not a search whose results are missing.** `NOT_APPLICABLE` says the question
 * does not arise; `NOT_PUBLISHED` says it does and nothing answered;
 * `NOT_ASSERTED` says nobody claimed it either way. Printing one word for all
 * three would turn a fixed qualification into a broken optimizer.
 *
 * Nothing here computes an objective, a rank, a score or a position:
 * `position_percent` is where the server says the effective value sits inside
 * its own declared range.
 */

import { useEffect } from "react";
import { Link } from "react-router-dom";

import { ProvenanceStrip } from "./ProvenanceStrip";
import { ResearchPanel } from "./ResearchPanel";
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
import type { LedgerSlot } from "./useSearch";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/** Spec 06 §1 and the hi-fi's own header line. */
export const SEARCH_SUBTITLE =
  "Stage A searches on IS. The pool freezes. Stage B selects on the frozen pool. Information crosses the freeze line one way — unless the schedule lets OOS in, and then the claim says exactly that.";

/** Spec 06 §0 rule 4, which is the rule this screen is mostly made of. */
export const SEARCH_RULES_FOOTER =
  "A panel degrades when a field is missing; it never infers one. This run was qualified against a fixed parameter profile rather than searched, so every optimizer panel below states which kind of absence it is — a question that does not arise, a fact nobody published, or a claim nobody asserted.";

export const FREEZE_LABEL = "POOL FREEZE";

/**
 * Spec 06 §10's switcher note, minus its first clause.
 *
 * The full sentence begins "one run is one mode — switching here opens another
 * demo run to learn the reading". There is no switcher on a product route, so
 * that half would point at a control nobody can see. What remains is the fact
 * it exists to teach, and it is why this screen shows one mode and no pills.
 */
export const ONE_MODE_NOTE = "a real run's mode is fixed at submit.";

const DIAGNOSTIC_LABEL: Record<DiagnosticKey, string> = {
  scatter: "trial surface",
  distributions: "per-parameter sampled regions",
  parameter_frequency: "parameter frequency",
  progression: "progression · concentration · pruned rail",
  prune_reasons: "prune reasons",
  importance: "importance",
  interactions: "interactions",
};

/* ------------------------------------------------------------------ parts */

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
function Gap({ gap, what }: { gap: SearchSourceGap; what: string }) {
  return (
    <span className="flex items-baseline gap-1.5" data-gap-fact={what} data-gap-state={gap.state}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {what}
      </span>
      <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={gapReason(gap)}>
        {SEARCH_GAP_WORDS[gap.state]}
      </span>
    </span>
  );
}

function Chip({
  children,
  tone = "var(--ink-soft)",
  border = "var(--line)",
  ...rest
}: {
  children: React.ReactNode;
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

/** A panel the hi-fi fills from an optimizer, kept at full size and explained. */
function EmptyPanel({
  id,
  title,
  gap,
  extra,
}: {
  id: string;
  title: string;
  gap: SearchSourceGap;
  extra?: string;
}) {
  return (
    <section
      className="flex flex-col gap-1.5 rounded-[8px] border px-4 py-3"
      data-panel={id}
      data-panel-state={gap.state}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {title}
        </h3>
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={gapReason(gap)}>
          {SEARCH_GAP_WORDS[gap.state]}
        </span>
      </div>
      {extra ? (
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
          {extra}
        </p>
      ) : null}
      {/* The reason code, and only that. The rule behind all seven panels is
          stated once above them; repeating it seven times buries the one
          thing that differs — which panel is empty for which reason. */}
      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-gap-reason={id}>
        {gapReason(gap)}
      </span>
    </section>
  );
}

/* ------------------------------------------------- the declared profile */

/**
 * The one panel with real content: the parameters the profile declares.
 *
 * The tick is drawn at `position_percent` — the server's placement of the
 * effective value inside its own range. The browser does not work it out from
 * minimum, maximum and value, because that would be a second opinion about a
 * number already published, and the two would drift the day a bound changes
 * meaning.
 */
function ParameterTable({ parameters }: { parameters: readonly Parameter[] }) {
  return (
    <div className="flex flex-col gap-1.5" data-parameters={parameters.length}>
      <div className="flex gap-3 border-b pb-1" style={{ borderColor: "var(--line-soft)" }}>
        {["parameter", "declared range", "step", "effective", "position"].map((head) => (
          <span
            key={head}
            className="mono text-[9px] uppercase tracking-[.07em]"
            style={{ color: "var(--ink-faint)", flex: head === "position" ? "1 1 auto" : "0 0 auto", minWidth: 78 }}
          >
            {head}
          </span>
        ))}
      </div>

      {parameters.map((parameter) => (
        <div key={parameter.name} className="flex items-center gap-3" data-parameter={parameter.name}>
          <span className="mono text-[10.5px]" style={{ flex: "0 0 auto", minWidth: 78 }}>
            {parameter.name}
          </span>
          <span
            className="mono text-[9.5px]"
            style={{ color: "var(--ink-faint)", flex: "0 0 auto", minWidth: 78 }}
            data-range={parameter.name}
          >
            {parameter.minimum} … {parameter.maximum}
          </span>
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)", flex: "0 0 auto", minWidth: 78 }}>
            {parameter.step}
          </span>
          <span className="mono text-[11px] font-semibold" style={{ flex: "0 0 auto", minWidth: 78 }} data-effective={parameter.name}>
            {parameter.effective_value}
          </span>
          <span
            className="relative h-[12px] flex-1 rounded-[2px] border"
            style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
            title={`${parameter.effective_value} sits at ${parameter.position_percent}% of the declared range · ${parameter.bound_state.toLowerCase().replace(/_/g, " ")}`}
          >
            <span
              data-position={parameter.name}
              data-position-percent={parameter.position_percent}
              className="absolute top-0 h-full w-[2px]"
              style={{ left: `${parameter.position_percent}%`, background: "var(--good)" }}
            />
          </span>
        </div>
      ))}

      {/* Every parameter carries the same declared bound state here. Stamping
          it on each row pushed the values themselves off the line; it is said
          once, and a row that ever differs gets its own marker below. */}
      {[...new Set(parameters.map((parameter) => parameter.bound_state))].map((bound) => (
        <span
          key={bound}
          className="mono text-[9px]"
          style={{ color: "var(--ink-faint)" }}
          data-bound-state={bound}
        >
          every parameter above: {bound.toLowerCase().replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ the ledger */

function LedgerPanel({
  slot,
  ledgerGap,
  onNeeded,
}: {
  slot: LedgerSlot;
  ledgerGap: { state: string; reason_code: string };
  onNeeded: () => void;
}) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-ledger={slot.state}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        trial ledger
      </h3>

      {slot.state === "ready" ? (
        <LedgerRows search={slot.search} />
      ) : slot.state === "refused" ? (
        <div className="flex flex-col gap-1" data-ledger-refusal>
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {slot.refusal.message}
          </p>
          <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
            A retained trial ledger exists only for the admitted Advanced-WFO profile. For this run the
            search contract says the ledger is{" "}
            <span className="mono" data-ledger-gap-state={ledgerGap.state}>
              {ledgerGap.state.toLowerCase().replace(/_/g, " ")}
            </span>{" "}
            — <span className="mono">{ledgerGap.reason_code}</span>. No row, count or zero is shown in
            its place.
          </p>
        </div>
      ) : (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          reading…
        </p>
      )}
    </section>
  );
}

/**
 * The retained ledger, when the run is in the admitted profile.
 *
 * Selected, raw-best and inspected stay three separate ideas, as RS-02
 * requires: the selection row is the source's own selection, and a trial with
 * a better objective is labelled the best *observed*, never "the selection the
 * engine should have made".
 */
function LedgerRows({ search }: { search: CurrentSourceSearch }) {
  const trials = search.ledger.trials;
  const selectedId = search.selection.selected_trial_id;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-ledger-total>
          {search.ledger.returned_rows} of {search.ledger.source_trial_count} retained trials
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-candidate-count>
          {search.candidates.rows.length} of {search.candidates.source_candidate_count} candidates
        </span>
        {selectedId !== null ? (
          <Chip data-selected-trial={selectedId} tone="var(--good)" border="var(--good)">
            selected {selectedId}
          </Chip>
        ) : (
          /* The retained lane has its own availability vocabulary
             (`PENDING_RETENTION`, `NOT_RETAINED_LEGACY`); it is printed as the
             server's own word rather than mapped onto the search lane's. */
          <span
            className="mono text-[10px] italic"
            style={{ color: "var(--ink-faint)" }}
            data-retained-withheld={search.selection.availability.state}
            title={search.selection.availability.reason_code ?? search.selection.availability.state}
          >
            selection — {search.selection.availability.state.toLowerCase().replace(/_/g, " ")}
          </span>
        )}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            {["trial", "state", "objective", "parameters"].map((head) => (
              <th
                key={head}
                className="mono pb-1 text-[9px] uppercase tracking-[.07em]"
                style={{ color: "var(--ink-faint)" }}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trials.map((trial) => (
            <tr key={trial.trial_id} data-trial={trial.trial_id} data-trial-selected={trial.trial_id === selectedId}>
              <td className="mono text-[10px]">{trial.trial_id}</td>
              <td className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                {trial.state}
              </td>
              <td className="mono text-[10.5px]">
                {trial.objective ?? (
                  <span className="italic" style={{ color: "var(--ink-faint)" }}>
                    not published
                  </span>
                )}
              </td>
              <td className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                {Object.entries(trial.parameters)
                  .map(([name, value]) => `${name}=${value}`)
                  .join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ---------------------------------------------------------------- screen */

export interface SearchScreenProps {
  runId: string;
  detail: SearchDetailDocument | null;
  state: ResearchState;
  cursor: EvidenceCursor;
  ledger: LedgerSlot;
  ensureLedger: () => void;
  onReread: () => void;
}

export function SearchScreen({
  runId,
  detail,
  state,
  cursor,
  ledger,
  ensureLedger,
  onReread,
}: SearchScreenProps) {
  const profile = detail?.fixed_profile;
  const parameters = profile?.parameters ?? [];

  return (
    <div className="flex flex-col gap-3" data-screen="search-detail" data-run={runId}>
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Breadcrumb">
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/evidence`, cursor)}
          className="mono"
          style={{ color: "var(--accent)" }}
          data-action="back-to-hub"
        >
          Evidence Flow
        </Link>
        <span style={{ color: "var(--line-strong)" }}>/</span>
        <span className="mono">{runId}</span>
        <span style={{ color: "var(--line-strong)" }}>/</span>
        <span className="mono" style={{ color: "var(--ink-faint)" }}>
          Stage 2 · Search &amp; Selection
        </span>
        <span style={{ color: "var(--line-strong)" }}>·</span>
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/split`, cursor)}
          className="mono"
          style={{ color: "var(--accent)" }}
          data-action="back-to-split"
        >
          ← S1 Split
        </Link>
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/freeze`, cursor)}
          className="mono"
          style={{ color: "var(--accent)" }}
          data-action="next-stage"
        >
          S3 · Freeze →
        </Link>
      </nav>

      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-light" style={{ fontFamily: "var(--font-display)" }}>
          S2 · Search &amp; Selection — how parameters were chosen
        </h1>
        <p className="text-[13.5px] italic" style={{ color: "var(--ink-mute)" }} data-subtitle>
          {SEARCH_SUBTITLE}
        </p>
      </div>

      {detail ? (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border px-3.5 py-2"
          data-source-strip={detail.source_profile.state}
          style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        >
          {/*
            * The installed source is a fixed qualification, not an optimizer
            * that is switched off. The chip says what it is.
            */}
          <Chip data-source-profile={detail.source_profile.state} tone="var(--accent)" border="var(--accent)">
            {detail.source_profile.state.toLowerCase().replace(/_/g, " ")}
          </Chip>

          {/*
            * The request declared a mode and a schedule; the source did not
            * execute a search. Both halves are said, and neither becomes a
            * mode switcher.
            */}
          <span className="flex items-baseline gap-1.5" data-requested-optimizer={detail.requested_optimizer.state}>
            <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              requested
            </span>
            <span className="mono text-[10px]">
              {detail.requested_optimizer.mode ?? "mode not published"}
              {detail.requested_optimizer.schedule ? ` · ${detail.requested_optimizer.schedule}` : ""}
            </span>
            <span className="mono text-[10px] italic" style={{ color: "var(--role-holdout)" }}>
              {detail.requested_optimizer.state.toLowerCase().replace(/_/g, " ")}
            </span>
            <span className="text-[10px]" style={{ color: "var(--ink-faint)" }} data-one-mode>
              {ONE_MODE_NOTE}
            </span>
          </span>

          {/*
            * The candidate-selection metric, as a run-bound fact or as an
            * absence. The installed catalogue's current default is deliberately
            * not what this shows: a release's present setting is not evidence
            * about a request made in the past, and a mode name is not evidence
            * of a metric. So `NOT_PUBLISHED` keeps its reason and no chip, no
            * value and no "inferred" label appear.
            */}
          <span
            className="flex items-baseline gap-1.5"
            data-metric-state={detail.requested_optimizer.candidate_selection_metric.state}
          >
            <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              candidate selection metric
            </span>
            {detail.requested_optimizer.candidate_selection_metric.state === "CONFIRMED" ? (
              <>
                <Chip data-metric-value={detail.requested_optimizer.candidate_selection_metric.value}>
                  {detail.requested_optimizer.candidate_selection_metric.value}
                </Chip>
                <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-metric-provenance>
                  {detail.requested_optimizer.candidate_selection_metric.provenance
                    .toLowerCase()
                    .replace(/_/g, " ")}
                </span>
              </>
            ) : (
              <span
                className="mono text-[10px] italic"
                style={{ color: "var(--ink-faint)" }}
                title={detail.requested_optimizer.candidate_selection_metric.reason_code}
              >
                not published
              </span>
            )}
          </span>

          <span className="flex items-baseline gap-1.5" data-selection-state={detail.selection.state}>
            <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              selection
            </span>
            <span className="mono text-[10px]">
              {detail.selection.state.toLowerCase().replace(/_/g, " ")}
            </span>
          </span>

          {profile && profile.parameter_bundle_digest !== null ? (
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-bundle-digest>
              bundle {profile.parameter_bundle_digest}
            </span>
          ) : null}

          {/* `PARTIAL` here is the contract's own word for a source that
              published a profile and no study — it is not a partial failure. */}
          <Chip data-readiness={detail.readiness}>readiness {detail.readiness.toLowerCase()}</Chip>

          <span className="mono ml-auto text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
            as of {new Date(detail.as_of_utc_ms).toISOString()}
          </span>
        </div>
      ) : null}

      {detail ? <ProvenanceStrip provenance={detail.provenance} /> : null}

      <ResearchPanel
        title="search & selection"
        meta={detail?.revision ? `revision ${detail.revision}` : undefined}
        state={state}
        minBodyHeight={240}
        actions={
          state.mayRetry && state.state !== "available" ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              reread search
            </button>
          ) : undefined
        }
      >
        {detail ? (
          <div className="flex flex-col gap-3">
            {/* -------------------------------------------------- Stage A */}
            <div className="flex flex-col gap-3 xl:flex-row" data-stage-grid>
              <div className="flex flex-1 flex-col gap-3" data-stage="A">
                <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--accent)" }}>
                  Stage A · what the source declared
                </h2>

                <section
                  className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
                  data-panel="search-space"
                  style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                      search space as declared
                    </h3>
                    {profile && profile.adapter_contract_digest !== null ? (
                      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-adapter-digest>
                        adapter {profile.adapter_contract_digest}
                      </span>
                    ) : null}
                  </div>

                  {parameters.length > 0 ? (
                    <ParameterTable parameters={parameters} />
                  ) : (
                    <Withheld
                      availability={profile?.availability ?? detail.availability}
                      what="parameter profile"
                    />
                  )}

                  {/*
                    * The strict outer-OOS selector is neither passed nor
                    * failed here: no chip, no grade, no implication.
                    */}
                  {profile ? <Gap gap={profile.strict_outer_oos} what="strict outer OOS" /> : null}
                </section>

                <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-empty-rule>
                  No chart is drawn in the panels below. An empty axis would read as a study that found
                  nothing, which is a different claim from a study that never ran — so each panel keeps its
                  frame and states which kind of absence it is, with the source's own reason code.
                </p>

                {DIAGNOSTIC_KEYS.map((key) => (
                  <EmptyPanel
                    key={key}
                    id={key}
                    title={DIAGNOSTIC_LABEL[key]}
                    gap={detail.diagnostics[key]}
                  />
                ))}
              </div>

              {/* --------------------------------------------- freeze line */}
              <div
                className="flex items-center justify-center xl:w-[52px]"
                data-freeze-line={detail.selection.state}
              >
                <span
                  className="mono rounded-[4px] border-2 border-dashed px-2 py-2 text-[9px] font-bold tracking-[.14em]"
                  style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)" }}
                  title="Stage A searches, the pool freezes, Stage B selects on what was frozen. This run froze no pool because it ran no search."
                >
                  {FREEZE_LABEL}
                </span>
              </div>

              {/* -------------------------------------------------- Stage B */}
              <div className="flex flex-1 flex-col gap-3" data-stage="B">
                <h2 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--accent)" }}>
                  Stage B · what was selected
                </h2>

                <section
                  className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
                  data-panel="selection"
                  style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
                >
                  <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                    selection
                  </h3>
                  <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                    {detail.selection.state === "FIXED_PARAMETER_PROFILE"
                      ? "The parameters above are the profile this run was qualified against. No trial was selected, because no trial was run — there is no best card, no pick and no θ* that came out of a search."
                      : "The source published no selection for this run."}
                  </p>
                  {/*
                    * `selected_trial_ref` is pinned null by the contract. No
                    * jump-to-trial, no pick hash, no drawer: an action that
                    * points at a trial would imply one exists.
                    */}
                  <Gap gap={detail.selection.selection_trace} what="selection trace" />
                  <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-selected-ref>
                    selected trial ref — none published
                  </span>
                </section>

                <section
                  className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
                  data-panel="inspection"
                  data-inspection-state={detail.inspection.state}
                  style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
                >
                  <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                    fold inspection
                  </h3>
                  <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                    {detail.inspection.requested_fold === null
                      ? "No fold was requested."
                      : `Fold ${detail.inspection.requested_fold} was requested.`}{" "}
                    This source has no optimizer fold, so the request is answered{" "}
                    {detail.inspection.state.toLowerCase().replace(/_/g, " ")} rather than by treating a
                    split fold as a trial fold.
                  </p>
                  <Withheld availability={detail.inspection.availability} />
                </section>

                <LedgerPanel
                  slot={ledger}
                  ledgerGap={{ state: detail.ledger.state, reason_code: detail.ledger.reason_code }}
                  onNeeded={ensureLedger}
                />
              </div>
            </div>

            {Object.keys(detail.source_absences).length > 0 ? (
              <section
                className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-[8px] border px-4 py-3"
                data-source-absences
                style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
              >
                {Object.entries(detail.source_absences).map(([name, gap]) => (
                  <Gap key={name} gap={gap} what={name.replace(/_/g, " ")} />
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
      </ResearchPanel>

      <footer className="flex flex-col gap-1">
        <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-rules-footer>
          {SEARCH_RULES_FOOTER}
        </p>
      </footer>
    </div>
  );
}
