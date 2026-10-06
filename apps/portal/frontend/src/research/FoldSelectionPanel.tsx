/**
 * S07 (B11 · SELECTION_SURFACES): per-fold selection on the freeze ordering read.
 *
 * Drawn only when `fold_ordering.selection_scope = PER_FOLD` (the causal/inner
 * profile). Each fold shows its OWN selected candidate (id, params digest,
 * study, source trial, inner-fold count) and the server's data-time verdict.
 * The engine's wall clocks are not published and stay absent here, with the
 * server's reason code; Portal orchestration clocks (OrchestrationClocks.tsx)
 * are a different thing and are never used to fill them.
 */
import { foldShort, shortDigest } from "./researchFormat";
import type { FoldOrdering, FoldOrderingRow } from "./freezeClient";

const VERDICT_WORDS: Record<FoldOrderingRow["verdict"], string> = {
  CAUSAL_DATA_TIME_SELECTION: "causal · data-time selection",
  NOT_CAUSAL_GLOBAL_SELECTION: "not causal · global selection",
  NOT_CAUSAL_OUTER_OOS_SELECTION: "not causal · outer OOS used for selection",
  NOT_EVALUATED: "not evaluated",
  NOT_PUBLISHED: "not published",
};

const MUTED = { color: "var(--ink-faint)" } as const;

export function FoldSelectionPanel({ ordering }: { ordering: FoldOrdering | null | undefined }) {
  if (!ordering || ordering.selection_scope !== "PER_FOLD") return null;
  const wall = ordering.wall_clock;
  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border p-[14px]"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-card="fold-selection"
      data-selection-scope="PER_FOLD"
      aria-label="per-fold selection"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={MUTED}>
          each fold's own selection
        </span>
        <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} title="selection_scope = PER_FOLD: a fold's selection applies to its own OOS fold only">
          per fold · no global θ*
        </span>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="per-fold selection table; scrolls sideways when narrow">
        <table className="w-full min-w-[640px] border-collapse text-[11px]" data-fold-selection-table>
          <thead>
            <tr>
              {["fold", "verdict (data time)", "selected candidate", "params digest", "study · trial", "inner folds"].map((head) => (
                <th key={head} scope="col" className="px-2 py-1 text-left text-[9px] font-medium uppercase tracking-[.07em]" style={MUTED}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordering.folds.map((fold) => {
              const own = fold.selected_candidate;
              return (
                <tr key={fold.fold_id} data-selection-fold={fold.fold_id} data-verdict={fold.verdict} style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <td className="mono whitespace-nowrap px-2 py-1" title={`source fold id ${fold.fold_id}`} data-fold-label>
                    {foldShort(fold.fold_id)}
                  </td>
                  <td className="px-2 py-1" title={fold.reason_code ?? fold.verdict}>
                    <span className="mono text-[10px]" data-fold-verdict={fold.verdict}>
                      {VERDICT_WORDS[fold.verdict]}
                    </span>
                    {fold.reason_code ? (
                      <span className="mono block break-all text-[9px]" style={MUTED} data-fold-verdict-reason={fold.reason_code}>
                        {fold.reason_code}
                      </span>
                    ) : null}
                  </td>
                  {own ? (
                    <>
                      <td className="mono px-2 py-1" data-own-candidate={own.candidate_id ?? undefined}>
                        {own.candidate_id ?? <span className="italic" style={MUTED}>not published</span>}
                      </td>
                      <td className="mono px-2 py-1" title={own.params_digest} data-own-digest={own.params_digest}>
                        {shortDigest(own.params_digest, 12)}…
                      </td>
                      <td className="mono px-2 py-1">
                        {own.study_id} · {own.selected_trial_id}
                      </td>
                      <td className="mono px-2 py-1" title="source-reported inner folds for this outer fold">
                        {own.inner_fold_count}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="mono px-2 py-1 italic" style={MUTED} data-own-selection="absent">
                      own selection not published
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="mono flex flex-wrap items-baseline gap-x-2 text-[10px]" style={MUTED} data-engine-clock="absent" title="The verdict reads retained data-time ranges and each fold's own selection — it is not an engine freeze or read-clock guarantee.">
        engine wall clock: not published
        <span hidden data-reason={wall.reason_code}>
          {wall.reason_code}
        </span>
      </span>

    </section>
  );
}
