/**
 * S04/S05 (B11 · SELECTION_SURFACES): a fold's own causal selection.
 *
 * Only the exact causal/inner profile publishes `fold_plan.folds[].causal_selection`;
 * every other source omits it and this panel is not drawn. Everything shown is
 * the server's own field: the selected source trial, its parameters, the
 * objective scope and the inner folds the source itself reported. The minimum
 * (`guards.inner_min_folds`) is a DECLARED control, the inner row count is
 * OBSERVED — they are labelled as such and never compared by the browser.
 */
import { formatMetric, formatUtc, foldLabel } from "./researchFormat";
import type { CurrentSourceSplit } from "./splitClient";

export type PlanFold = CurrentSourceSplit["fold_plan"]["folds"][number];
type Guards = Partial<CurrentSourceSplit["guards"]> | null | undefined;
type MinFolds = NonNullable<Guards>["inner_min_folds"];

/** The causal selection a plan fold carries, or null for every legacy source. */
export function causalSelectionOf(fold: PlanFold | undefined) {
  return fold?.causal_selection ?? null;
}

/** True when at least one fold of the plan carries its own causal selection. */
export function planIsCausal(plan: readonly PlanFold[] | null | undefined): boolean {
  return !!plan && plan.some((fold) => fold.causal_selection !== undefined);
}

const MUTED = { color: "var(--ink-faint)" } as const;

function Metric({ value, what, scope }: { value: string | null; what: string; scope: string }) {
  const text = formatMetric(value, "ratio");
  return (
    <span className="flex flex-col" data-causal-metric={what}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={MUTED}>
        {what}
      </span>
      {text !== null ? (
        <span className="mono text-[12px]" title={`${value} · ${scope}`}>
          {text}
        </span>
      ) : (
        <span className="mono text-[10.5px] italic" style={MUTED} title={`${scope} · not published for this fold`}>
          not published
        </span>
      )}
    </span>
  );
}

/** Declared minimum, stated as declared. A typed absence keeps its server reason. */
function DeclaredMinimum({ fact }: { fact: MinFolds }) {
  if (fact && fact.state === "AVAILABLE" && fact.value !== null) {
    return (
      <span className="mono" data-inner-min-folds={String(fact.value)} title="guards.inner_min_folds — declared control, not an observation">
        {String(fact.value)}
      </span>
    );
  }
  const state = fact?.state ?? "NOT_PUBLISHED";
  const reason = fact?.reason_code ?? null;
  return (
    <span className="mono italic" style={MUTED} data-inner-min-folds-state={state} title={reason ?? "guards.inner_min_folds not in this read"}>
      {state === "NOT_APPLICABLE" ? "not applicable" : "not published"}
      {reason ? <span hidden> {reason}</span> : null}
    </span>
  );
}

export function CausalSelectionPanel({
  fold,
  guards,
  foldNumber,
}: {
  fold: PlanFold;
  guards?: Guards;
  foldNumber?: number;
}) {
  const selection = causalSelectionOf(fold);
  if (selection === null) return null;
  const params = Object.entries(selection.parameters);
  const objective = formatMetric(selection.objective, "ratio");
  const label = foldLabel(fold.fold_id);
  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border p-[14px]"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-card="causal-selection"
      data-causal-fold={fold.fold_id}
      data-causal-fold-number={foldNumber}
      aria-label={`${label} own causal selection`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={MUTED}>
          {label} · selected on its own inner validation
        </span>
        <span
          className="mono text-[10px]"
          style={{ color: "var(--accent)" }}
          data-causal-scope={selection.scope}
          title={`${selection.causality_claim} · outer_oos_used_for_selection = ${String(selection.outer_oos_used_for_selection)}`}
        >
          applies to its own OOS fold · outer OOS not used to select
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
        <span className="mono" data-causal-trial={selection.selected_trial_id} title="study-qualified retained trial id">
          source {selection.selected_trial_id}
        </span>
        <span className="mono" style={MUTED} data-causal-study={selection.study_id}>
          study {selection.study_id} · seed {selection.fold_seed}
        </span>
        <span className="mono" style={MUTED} title={`${selection.candidate_count} candidates in this fold's study`}>
          {selection.candidate_count} candidates
        </span>
      </div>

      <div className="flex flex-wrap gap-[6px]" data-causal-params>
        {params.length > 0 ? (
          params.map(([name, value]) => (
            <span
              key={name}
              className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]"
              style={{ color: "var(--ink-soft)", borderColor: "var(--line)", background: "var(--paper-raised)" }}
              data-causal-param={name}
            >
              {name} {value}
            </span>
          ))
        ) : (
          <span className="mono text-[10.5px] italic" style={MUTED}>
            parameters not published
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <span className="flex flex-col" data-causal-metric="objective">
          <span className="mono text-[9px] uppercase tracking-[.07em]" style={MUTED}>
            objective · inner validation
          </span>
          {objective !== null ? (
            <span className="mono text-[12px]" title={`${selection.objective} · ${selection.objective_kind}`}>
              {objective}
            </span>
          ) : (
            <span className="mono text-[10.5px] italic" style={MUTED}>
              not published
            </span>
          )}
        </span>
        <Metric value={selection.candidate_is_metric} what="IS · inner mean" scope={selection.candidate_is_scope} />
        <Metric value={selection.candidate_oos_metric} what="OOS · this fold" scope={`${selection.candidate_oos_scope} (${selection.candidate_metrics_scope})`} />
        <Metric value={selection.candidate_decay} what="decay" scope={selection.candidate_decay_scope} />
      </div>

      <div className="flex flex-col gap-1 border-t pt-2 text-[11px]" style={{ borderColor: "var(--line-soft)" }} data-causal-inner>
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span data-inner-observed={selection.inner_fold_count} title="source-reported: the inner folds the source actually retained for this outer fold">
            <span style={MUTED}>inner folds observed </span>
            <span className="mono">{selection.inner_fold_count}</span>
            <span className="text-[10px]" style={MUTED}> (source-reported)</span>
          </span>
          <span title="guards.inner_min_folds: the minimum the run declared, not an observation">
            <span style={MUTED}>declared minimum </span>
            <DeclaredMinimum fact={guards?.inner_min_folds} />
          </span>
          <span className="mono text-[10px]" style={MUTED} data-inner-validation>
            {selection.inner_validation.inner_split_frequency} · {selection.inner_validation.inner_window_mode} · train {selection.inner_validation.inner_train_window}
          </span>
        </span>
        <div className="max-h-[168px] overflow-auto" tabIndex={0} role="region" aria-label={`${label} inner folds; scrolls sideways when narrow`}>
          <table className="w-full min-w-[420px] border-collapse text-[10.5px]">
            <thead>
              <tr>
                {["inner fold", "train", "test"].map((head) => (
                  <th key={head} scope="col" className="px-2 py-1 text-left text-[9px] font-medium uppercase tracking-[.07em]" style={MUTED}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selection.inner_folds.map((inner) => (
                <tr key={inner.inner_fold_id} data-inner-fold={inner.inner_fold_id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <td className="mono px-2 py-1" title={inner.inner_fold_id}>
                    {inner.inner_fold_id}
                  </td>
                  <td className="mono px-2 py-1" title={`${inner.train_start_utc_ms} → ${inner.train_end_utc_ms}`}>
                    {formatUtc(inner.train_start_utc_ms)} → {formatUtc(inner.train_end_utc_ms)}
                  </td>
                  <td className="mono px-2 py-1" title={`${inner.test_start_utc_ms} → ${inner.test_end_utc_ms}`}>
                    {formatUtc(inner.test_start_utc_ms)} → {formatUtc(inner.test_end_utc_ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
