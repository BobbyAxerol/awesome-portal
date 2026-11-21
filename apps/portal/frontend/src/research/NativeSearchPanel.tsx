/**
 * Screen 06 · the native optimizer's search (`SearchDetail.native_search`, §55).
 *
 * A natively searched recipe ran ONE in-sample study with the pinned QuantBT optimizer: every trial it retained, the selection the engine
 * made on them, and the facts of that selection. This panel reads those and nothing else — it is not the scalar Walk-forward study, so it
 * draws no fold, no sampler trace, no neighbour list and no certificate: each of those is a typed absence with the server's reason.
 * The engine's trial NUMBER (0-based identity) and the display ORDINAL are two facts and are both shown; a decimal is printed exactly as
 * served; `ledger.total` is the whole retained population, not the page in hand.
 */

import { Absence } from "./Absence";
import { humanise } from "./humanise";
import { NativeOptimizationSummary } from "./NativeOptimizationSummary";
import type { NativeSearch } from "./searchClient";

type Row = NativeSearch["ledger"]["rows"][number];

const STATE_INK: Record<string, string> = { COMPLETE: "var(--ink)", PRUNED: "var(--accent-2)", FAIL: "var(--bad)", WAITING: "var(--ink-faint)", RUNNING: "var(--ink-faint)" };
const CARD = { borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" } as const;
/** Numbers and ids in the trial table never break inside a value; the region scrolls sideways instead. */
const NOWRAP = { whiteSpace: "nowrap", overflowWrap: "normal", wordBreak: "normal" } as const;
const LABEL = "text-[10px] font-medium uppercase tracking-[.07em]";

const EVIDENCE: Record<string, string> = { ENGINE_MEDOID_IDENTITY_MATCHES_RETAINED_TRIAL_AND_PARAMETERS: "the engine's medoid is exactly this retained trial and these parameters" };
const SCOPE: Record<string, string> = { NATIVE_IS_STUDY: "native in-sample study" };

function Fact({ id, label, children, title }: { id: string; label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-selection-fact={id} title={title}>
      <dt className={LABEL} style={{ color: "var(--ink-faint)" }}>{label}</dt>
      <dd className="mono m-0 break-words text-[12px]" style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{children}</dd>
    </div>
  );
}

/** The metric columns the loaded rows publish, first-seen order, capped so the table stays readable; the rest are in each row's tooltip. */
export function metricColumns(rows: readonly Row[], cap = 4, objectiveName: string | null = null): string[] {
  const seen: string[] = [];
  /* the objective has its own column: a metric of the same name would print the same value twice */
  for (const row of rows) for (const key of Object.keys(row.metrics)) if (key !== objectiveName && !seen.includes(key)) seen.push(key);
  return seen.slice(0, cap);
}

function Value({ cell, name }: { cell: Row["objective"] | undefined; name: string }) {
  if (cell === undefined) return <Absence reason={null} state="NOT_PUBLISHED" />;
  if (cell.availability.state === "AVAILABLE" && cell.value !== null) return <span data-exact={cell.value} data-metric={name}>{cell.value}</span>;
  return <span data-metric={name} data-metric-absent={cell.availability.reason_code ?? "NOT_PUBLISHED"}><Absence reason={cell.availability.reason_code} state="NOT_PUBLISHED" /></span>;
}

export interface NativeSearchPanelProps {
  native: NativeSearch;
  /** Rows loaded so far (the first page, then every later page), in the server's order. */
  rows: readonly Row[];
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  onMore: () => void;
}

export function NativeSearchPanel({ native, rows, hasMore, loading, error, onMore }: NativeSearchPanelProps) {
  const meta = native.selection_process.retained_source_metadata;
  const columns = metricColumns(rows, 4, native.summary.objective_name);
  const selectedLoaded = rows.some((row) => row.selected);
  return (
    <section className="flex flex-col gap-3" data-native-search={native.selected_trial_number} aria-label="Native search">
      <NativeOptimizationSummary optimization={native.summary} />

      <section className="flex flex-col gap-2 rounded-[8px] border px-4 py-3" style={CARD} data-native-selection aria-label="Selection">
        <h3 className="m-0 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          Selection
          <span className="mono ml-2 text-[10px] font-normal" style={{ color: "var(--ink-faint)" }}>what the engine chose on the retained trials</span>
        </h3>
        <dl className="m-0 grid gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          <Fact id="trial" label="selected trial" title="The engine's own 0-based trial number, and the 1-based display ordinal: two facts, never one.">
            number {native.selected_trial_number} · ordinal {native.selected_trial_ordinal} of {native.ledger.total.toLocaleString("en-US")}
          </Fact>
          <Fact id="scope" label="scope">{SCOPE[native.selected_trial_scope] ?? humanise(native.selected_trial_scope)}</Fact>
          <Fact id="digest" label="parameters digest" title={native.selected_parameters_digest}>{native.selected_parameters_digest.slice(0, 16)}…</Fact>
          <Fact id="evidence" label="evidence">{EVIDENCE[native.selection_process.evidence] ?? humanise(native.selection_process.evidence)}</Fact>
          {meta ? (
            <>
              <Fact id="medoid" label="medoid · cluster centre">trial {meta.medoid_trial_number} · trial {meta.cluster_center_trial}</Fact>
              <Fact id="plateau" label="plateau score">{meta.plateau_score}</Fact>
              <Fact id="neighbours" label="neighbours" title="Counts the engine retained; the trial identities of the neighbours were not retained.">{meta.neighbor_count} of at least {meta.min_neighbor_count}</Fact>
              <Fact id="top" label="top · feasible trials">{meta.top_trials} · {meta.feasible_trials}</Fact>
              <Fact id="consensus" label="seed consensus">{meta.seed_consensus} of {meta.seed_consensus_count}</Fact>
              <Fact id="radius" label="quantile · radius">{meta.top_quantile} · {meta.neighborhood_radius}</Fact>
              <Fact id="objective-spread" label="objective median · worst · std">{meta.median_objective} · {meta.worst_objective} · {meta.objective_std}</Fact>
              <Fact id="params" label="parameters searched">{meta.param_names.join(" · ")}</Fact>
              <Fact id="fallbacks" label="fallback reasons">{meta.fallback_reasons.length === 0 ? "none" : meta.fallback_reasons.join(" · ")}</Fact>
            </>
          ) : (
            <Fact id="metadata" label="selection metadata"><Absence reason={native.selection_process.metadata_reason_code} state="NOT_PUBLISHED" /></Fact>
          )}
          <Fact id="members" label="plateau members"><Absence reason={native.candidates.plateau_membership_reason_code} state="NOT_PUBLISHED" /></Fact>
          <Fact id="sampler" label="sampler trace"><Absence reason={native.selection_process.sampler_trace.reason_code} state="NOT_PUBLISHED" /></Fact>
        </dl>
      </section>

      <section className="flex min-w-0 flex-col gap-2 rounded-[8px] border" style={CARD} data-native-ledger={native.ledger.total} aria-label="Native trial ledger">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>
          <h3 className="m-0 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>Trials</h3>
          <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-native-ledger-count title="ledger.total is every trial the source retained, not the page in hand">
            {rows.length.toLocaleString("en-US")} of {native.ledger.total.toLocaleString("en-US")} loaded · {native.candidates.total.toLocaleString("en-US")} complete evaluations, not the scalar-WFO candidate pool
          </span>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="native trials (scrolls sideways)">
          <table className="w-full min-w-[860px] whitespace-nowrap text-[11px]" data-native-table style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--ink-faint)", textAlign: "left" }}>
                <th scope="col" className="mono px-3 py-1 text-[9.5px] font-medium uppercase" style={NOWRAP}>ordinal</th>
                <th scope="col" className="mono px-2 py-1 text-[9.5px] font-medium uppercase" style={NOWRAP}>trial</th>
                <th scope="col" className="mono px-2 py-1 text-[9.5px] font-medium uppercase" style={NOWRAP}>state</th>
                <th scope="col" className="mono px-2 py-1 text-right text-[9.5px] font-medium uppercase" style={NOWRAP}>objective</th>
                {columns.map((name) => (
                  <th key={name} scope="col" className="mono px-2 py-1 text-right text-[9.5px] font-medium uppercase" style={NOWRAP}>{name.replace(/_/g, " ")}</th>
                ))}
                <th scope="col" className="mono px-2 py-1 text-[9.5px] font-medium uppercase">parameters</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.source_ordinal}
                  data-native-trial={row.trial_number}
                  data-trial-ordinal={row.trial_ordinal}
                  data-trial-state={row.state}
                  data-trial-selected={row.selected}
                  style={{ borderTop: "1px solid var(--line-soft)", background: row.selected ? "var(--accent-soft)" : undefined }}
                >
                  <td className="mono px-3 py-[3px]" style={{ fontVariantNumeric: "tabular-nums", ...NOWRAP }}>{row.trial_ordinal}</td>
                  <td className="mono px-2 py-[3px]" style={{ fontVariantNumeric: "tabular-nums", ...NOWRAP }}>
                    {row.trial_number}
                    {row.selected ? <span className="ml-1.5 rounded-[4px] border px-1 text-[9px]" style={{ borderColor: "var(--accent)", color: "var(--accent)" }} data-theta-star title="The trial the engine selected">θ*</span> : null}
                  </td>
                  <td className="mono px-2 py-[3px]" style={{ color: STATE_INK[row.state] ?? "var(--ink)", ...NOWRAP }}>{row.state.toLowerCase()}</td>
                  <td className="mono px-2 py-[3px] text-right" style={{ fontVariantNumeric: "tabular-nums", ...NOWRAP }}><Value cell={row.objective} name="objective" /></td>
                  {columns.map((name) => (
                    <td key={name} className="mono px-2 py-[3px] text-right" style={{ fontVariantNumeric: "tabular-nums", ...NOWRAP }}><Value cell={row.metrics[name]} name={name} /></td>
                  ))}
                  <td className="mono min-w-[380px] whitespace-normal px-2 py-[3px]" style={{ color: "var(--ink-soft)" }} title={Object.entries(row.parameters).map(([k, v]) => `${k} ${v}`).join(" · ")}>
                    {Object.entries(row.parameters).map(([k, v]) => `${k} ${v}`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!selectedLoaded ? (
          <p className="mono m-0 px-4 text-[10px]" style={{ color: "var(--ink-faint)" }} data-selected-not-loaded>
            θ* is trial {native.selected_trial_number} (ordinal {native.selected_trial_ordinal}); its row is on a page not loaded yet.
          </p>
        ) : null}
        {hasMore || error ? (
          <div className="flex flex-wrap items-center gap-3 px-4 pb-3" data-native-more>
            {hasMore ? (
              <button type="button" className="btn-ghost mono text-[10px]" disabled={loading} onClick={onMore} data-action="native-more" aria-label={`Show more trials, ${rows.length} of ${native.ledger.total} loaded`}>
                {loading ? "loading…" : "more"}
              </button>
            ) : null}
            {error ? (
              <span className="mono text-[10px]" style={{ color: "var(--bad)" }} role="alert" data-native-more-error>
                Could not read the next page. Try again.
              </span>
            ) : null}
          </div>
        ) : (
          <div className="pb-1" />
        )}
      </section>
    </section>
  );
}

/**
 * The scalar claim strip (mode, schedule, validation, chronology, OOS use, scoring, selector, profile, strict outer OOS, "what this mode
 * reads") describes a Walk-forward study; a native search has none of it. It is one line with the server's one reason, instead of ten
 * fields repeating the same typed absence.
 */
export function NativeClaimNote({ reasonCode, readiness }: { reasonCode: string | null; readiness: string }) {
  return (
    <section className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[6px] border px-[14px] py-2" style={{ ...CARD, boxShadow: "none" }} data-native-claim-note data-readiness={readiness.toLowerCase()}>
      <span className={LABEL} style={{ color: "var(--ink-faint)" }}>claim</span>
      <span className="text-[12px]" style={{ color: "var(--ink)" }}>No Walk-forward claim fields apply to a native search.</span>
      <span className="mono text-[10.5px]" style={{ color: "var(--ink-faint)" }} title="Why the scalar fields are absent, as the server states it">
        <Absence reason={reasonCode} state="NOT_APPLICABLE" />
      </span>
      <span className="mono ml-auto text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-native-readiness>readiness {readiness.toLowerCase()}</span>
    </section>
  );
}
