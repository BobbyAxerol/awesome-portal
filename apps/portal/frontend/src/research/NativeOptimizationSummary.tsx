/**
 * Native optimization (`research.native-optimization.v1`): the bounded summary the server publishes for a recipe searched by the pinned
 * QuantBT native optimizer — on Progress, Evidence and Split alike, one component, one set of words.
 *
 * It says what was searched and what the engine selected, exactly as served (decimal strings are never reformatted; the engine's trial
 * number is its 0-based identity, not a rank). It is NOT the scalar Walk-forward study: there is no per-fold ledger, sampler trace,
 * freeze certificate or Report behind it, and the screen says so instead of drawing one.
 */

import { humanise } from "./humanise";
import { iso } from "./utcMinute";

export interface NativeOptimizationFacts {
  schema_version: "research.native-optimization.v1";
  authority: string;
  scope: string;
  objective_name: string;
  selection_method: string;
  requested_trials: number;
  completed_trials: number;
  retained_trials: number;
  distinct_parameter_sets: number;
  selected_trial_number: number;
  selected_parameters: { [key: string]: string };
  selected_objective: string;
  train_start_utc_ms: number;
  train_end_exclusive_utc_ms: number;
  holdout_used: false;
  table_kind: string;
  table_schema_version: string;
  sha256: string;
}

const AUTHORITY: Record<string, string> = { PINNED_QUANTBT_NATIVE_IS_SHARPE: "pinned QuantBT native optimizer · in-sample Sharpe" };
const SCOPE: Record<string, string> = { P08_WARMUP_PLUS_IS_ONLY: "warm-up + in-sample window only" };
const METHOD: Record<string, string> = { QUANTBT_GENERIC_ROBUST_PLATEAU_NOT_SCALAR_WFO_V1: "QuantBT generic robust plateau — not the scalar Walk-forward algorithm" };
const words = (map: Record<string, string>, token: string) => map[token] ?? humanise(token);
const count = (value: number) => value.toLocaleString("en-US");

export function NativeOptimizationSummary({ optimization }: { optimization: NativeOptimizationFacts }) {
  const o = optimization;
  const parameters = Object.entries(o.selected_parameters);
  const facts: { id: string; label: string; value: React.ReactNode; title?: string }[] = [
    { id: "authority", label: "optimizer", value: words(AUTHORITY, o.authority), title: o.authority },
    { id: "method", label: "selection", value: words(METHOD, o.selection_method), title: o.selection_method },
    { id: "scope", label: "searched on", value: words(SCOPE, o.scope), title: o.scope },
    { id: "window", label: "train window", value: `${iso(o.train_start_utc_ms)} → ${iso(o.train_end_exclusive_utc_ms)} (end excluded)` },
    { id: "holdout", label: "holdout", value: o.holdout_used ? "used" : "not used" },
    {
      id: "trials",
      label: "trials",
      value: `${count(o.requested_trials)} requested · ${count(o.completed_trials)} completed · ${count(o.retained_trials)} retained`,
    },
    { id: "distinct", label: "distinct parameter sets", value: count(o.distinct_parameter_sets) },
    {
      id: "selected",
      label: "selected",
      value: `trial ${o.selected_trial_number} · ${o.objective_name} ${o.selected_objective}`,
      title: "The engine's own 0-based trial number, not a rank; the objective is the exact decimal the engine published.",
    },
  ];
  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" }}
      data-native-optimization={o.selected_trial_number}
      data-screen-label="Native optimization"
      aria-label="Native optimization"
    >
      <h3 className="m-0 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
        Native optimization
        <span className="mono ml-2 text-[10px] font-normal" style={{ color: "var(--ink-faint)" }}>searched on the in-sample window · bounded summary</span>
      </h3>
      <dl className="m-0 grid gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {facts.map((fact) => (
          <div key={fact.id} className="flex min-w-0 flex-col gap-0.5" data-optimization-fact={fact.id} title={fact.title}>
            <dt className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>{fact.label}</dt>
            <dd className="mono m-0 break-words text-[12px]" style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1" data-optimization-parameters>
        <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>selected parameters</span>
        <div className="flex flex-wrap gap-1.5">
          {parameters.map(([key, value]) => (
            <span key={key} className="mono rounded-[6px] border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: "var(--line)", color: "var(--ink)" }} data-optimization-parameter={key} data-exact={value}>
              <span style={{ color: "var(--ink-faint)" }}>{key} </span>
              {value}
            </span>
          ))}
        </div>
      </div>
      <p className="m-0 text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-optimization-boundary>
        The retained trial table ({o.table_kind.replace(/_/g, " ")}, source <span className="mono" title={o.sha256}>{o.sha256.slice(0, 12)}…</span>) is sealed separately. A scalar Search ledger,
        sampler trace, freeze certificate and Report are not published for this recipe, so none is drawn here.
      </p>
    </section>
  );
}
