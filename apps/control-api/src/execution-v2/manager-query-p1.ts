import { ExecutionReadScopeError } from "./read-scope";
import { managerP1Options, managerSelectedWindow, type ManagerWindowQuery,
  managerWindowMissingSummary, type ManagerSelectedWindow, type ManagerP1Options } from "./manager-query-p1.contract";
import type { ManagerFact, ManagerMetric } from "./manager-model.contract";

type Query = { q?: string; q_mode?: "PREFIX" | "CONTAINS"; window?: ManagerWindowQuery };
type Bounds = { from_ms: number; to_ms: number };
const PRESETS = ["7D", "30D", "90D", "ALL"] as const;
const STOCKS = new Set(["allocation", "balance_total", "unrealized_pnl"]);
const FIXED_30D = new Set(["equity_30d_end_value", "return_30d_pct"]);
export function managerMissingScoreWindow(selected: ManagerSelectedWindow) {
  return managerWindowMissingSummary.parse({ value: null, status: "window_not_published",
    reason_code: selected.reason_code ?? "EXACT_METRIC_WINDOW_NOT_PUBLISHED" });
}
export function rejectManagerAsOf(raw: Record<string, unknown>): void {
  if (Object.hasOwn(raw, "as_of_ms"))
    throw new ExecutionReadScopeError("EXECUTION_READ_CURRENT_ONLY", 400);
}
export function resolveManagerWindow(asOf: number, requested: ManagerWindowQuery | undefined): ManagerSelectedWindow | null {
  if (requested === undefined) return null; // existing request semantics preserved
  let resolved: Bounds | null;
  if (typeof requested === "object") {
    if (requested.to_ms > asOf) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    resolved = requested;
  } else if (requested === "ALL") resolved = null; // no inception/census witness in current document
  else {
    const from = asOf - ({ "7D": 7, "30D": 30, "90D": 90 } as const)[requested] * 86_400_000;
    if (from < 0) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    resolved = { from_ms: from, to_ms: asOf };
  }
  return managerSelectedWindow.parse({ requested, resolved,
    selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY",
    reason_code: resolved === null ? "ALL_HISTORY_WINDOW_NOT_PUBLISHED" : null });
}
const equalWindow = (a: Bounds | null, b: Bounds | null): boolean =>
  a !== null && b !== null && a.from_ms === b.from_ms && a.to_ms === b.to_ms;
function missingWindow(metric: ManagerMetric, selected: ManagerSelectedWindow): ManagerMetric {
  const reason = selected.reason_code ?? "EXACT_METRIC_WINDOW_NOT_PUBLISHED";
  return { ...metric, value: null, denominator: null, availability: "UNAVAILABLE", reason_code: reason,
    quality: { ...metric.quality, completeness: "UNRESOLVED" } };
}
/** Derived read projection only. Never replace/persist source facts or their hash.
 * Keep incompatible-window facts in the member/partition census as null, so a
 * missing tuple/metric cannot disappear from the denominator. */
export function managerFactsForWindow(facts: readonly ManagerFact[], selected: ManagerSelectedWindow | null): ManagerFact[] {
  if (selected === null) return [...facts];
  return facts.map(f => STOCKS.has(f.kind) || equalWindow(f.metric.window, selected.resolved) &&
    (!FIXED_30D.has(f.kind) || selected.resolved!.to_ms - selected.resolved!.from_ms === 30 * 86_400_000)
    ? f : { ...f, metric: missingWindow(f.metric, selected) });
}
/** Call ONLY on results of the existing qualified/conflict-checking selector.
 * Never filter the source document first: that could hide conflicting same-slot
 * publications or remove Composition's original raw-policy dependencies. */
export function managerPublicationsForWindow<T extends { provenance: { binding: {
  window_start_ms: number; window_end_ms: number;
} } }>(accepted: readonly T[], selected: ManagerSelectedWindow | null): T[] {
  return selected === null ? [...accepted] : accepted.filter(s =>
    equalWindow({ from_ms: s.provenance.binding.window_start_ms,
      to_ms: s.provenance.binding.window_end_ms }, selected.resolved));
}
export function matchesManagerName(row: { name: string | null }, q: Query): boolean {
  if (q.q === undefined) return true;
  if (row.name === null) return false;
  const name = row.name.toLowerCase(), needle = q.q.toLowerCase();
  return q.q_mode === "PREFIX" ? name.startsWith(needle) : name.includes(needle);
}
/** Pass already scoped, field-filtered facts/keys only. Never raw dataset rows.
 * Preset evidence presence is deliberately weaker than AVAILABLE metric data. */
export function managerQueryOptions(input: {
  asOf: number; canSearchName: boolean; sortFields: ManagerP1Options["sort_fields"];
  groupFields: ManagerP1Options["group_fields"];
  metricKeys: ManagerP1Options["metric_keys"]; facts: readonly ManagerFact[];
}): ManagerP1Options {
  const presets = PRESETS.map(value => {
    // A pre-epoch preset is not a valid window; do not fabricate a truncated one.
    const days = value === "ALL" ? null : ({ "7D": 7, "30D": 30, "90D": 90 } as const)[value];
    const resolved = days !== null && input.asOf >= days * 86_400_000
      ? { from_ms: input.asOf - days * 86_400_000, to_ms: input.asOf } : null;
    const present = resolved !== null && input.facts.some(f => !STOCKS.has(f.kind) && equalWindow(f.metric.window, resolved) &&
      (!FIXED_30D.has(f.kind) || resolved.to_ms - resolved.from_ms === 30 * 86_400_000));
    return { value, resolved, data_state: present ? "METRIC_SPECIFIC" as const : "NOT_PUBLISHED" as const,
      reason_code: present ? null : value === "ALL" ? "ALL_HISTORY_WINDOW_NOT_PUBLISHED" as const : "EXACT_METRIC_WINDOW_NOT_PUBLISHED" as const };
  });
  return managerP1Options.parse({ temporal_mode: "CURRENT_ONLY",
    search: { fields: input.canSearchName ? ["name"] : [], modes: input.canSearchName ? ["PREFIX", "CONTAINS"] : [],
      maximum_text_length: 160, normalization: "JS_TO_LOWER_CASE_NO_UNICODE_NORMALIZATION" },
    sort_fields: input.sortFields, group_fields: input.groupFields, metric_keys: input.metricKeys,
    economic_partition_required_for: input.metricKeys.filter((key): key is "allocation" | "net_pnl" | "unrealized_pnl" | "balance_total" | "equity_30d_end_value" =>
      ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"].includes(key)),
    window: { custom_supported: true, interpretation: "MATCH_ONLY_NO_READ_TIME_CALCULATION",
      independent_metrics: input.metricKeys.filter((key): key is "allocation" | "balance_total" | "unrealized_pnl" =>
        ["allocation", "balance_total", "unrealized_pnl"].includes(key)), presets },
    stage_environment: [{ environment: "paper", stages: ["PAPER"] },
      { environment: "sandbox", stages: ["SANDBOX"] }, { environment: "live", stages: ["CANARY", "LIVE"] }],
    unavailable_fields: [{ field: "current_stage", reason_code: "CURRENT_STAGE_GRAIN_NOT_PUBLISHED" },
      { field: "days_in_stage", reason_code: "STAGE_ENTRY_TIME_NOT_PUBLISHED" }] });
}
