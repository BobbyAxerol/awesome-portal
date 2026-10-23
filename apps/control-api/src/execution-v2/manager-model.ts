import { resolveManagerWindow, managerFactsForWindow, managerPublicationsForWindow,
  matchesManagerName, managerQueryOptions, managerMissingScoreWindow } from "./manager-query-p1";
import { accessDigest } from "./access-policy";
import { assertExecutionReadScope, ExecutionReadScopeError, scopeAllowsField, scopeReadPopulation, scopeAllowsFullAccountingPopulation,
  type AuthorizedExecutionReadScope, type ReadScopeRequirement } from "./read-scope";
import type { ReadDatasetBinding } from "./read-publication";
import { projectionRowVisible } from "./read-projection";
import { KeysetCursorCodec } from "../query/cursor";
import { sumExactDecimals } from "../research/exact-decimal";
import { canonicalizeManagerDatasetZero } from "./manager-dataset-invariants";
import { selectManagerScorePublications, type ManagerScoreReadFence } from "./manager-score-publication";
import { selectManagerCompositionPublications,type ManagerCompositionReadFence } from "./manager-composition-publication";
import { selectManagerRegimePublications, type ManagerRegimeReadFence } from "./manager-regime-publication";
import { deriveManagerRowLifecycle, deriveManagerRowLifecycleFromFacts, MANAGER_STAGE_LIFECYCLE_POLICY } from "./manager-lifecycle";
import { MANAGER_ALL_ENVIRONMENTS, managerAllRowKey, type ManagerAllReason } from "./manager-all-scope";
import { managerModelDocument, managerModelQuery, managerDatasetResponse, MANAGER_SCALARS, managerMoneyFields, managerStatementFields,
  type ManagerMember, type ManagerFact, type ManagerMetric, type ManagerModelDocument, type ManagerModelQuery } from "./manager-model.contract";

export type ManagerSurface = "FUND" | "FLEET" | "PORTFOLIO" | "ALPHA" | "ACCOUNT" | "DEPLOYMENT";
const fail = (code: ConstructorParameters<typeof ExecutionReadScopeError>[0], status = 503): never => { throw new ExecutionReadScopeError(code, status); };
export const managerRowKey = (m: ManagerMember) => JSON.stringify([m.tuple.alpha_id, m.tuple.alpha_version_id, m.tuple.portfolio_id]);
export const managerTupleKey = (m: ManagerMember["tuple"]) => JSON.stringify([m.alpha_id, m.alpha_version_id, m.portfolio_id, m.deployment_id, m.account_id]);
export const managerPartitionKey = (p: ManagerFact["partition"]) => JSON.stringify([p.economic_domain, p.currency, p.basis, p.native_profile_ref]);
/** Exact numeric ordering; null ordering belongs to the query, not to decimal coercion. */
export function compareManagerDecimals(a: string, b: string): number {
  const convert = (v: string, scale: number) => {
    const negative = v.startsWith("-"), [whole, fraction = ""] = (negative ? v.slice(1) : v).split(".");
    return BigInt(whole + fraction.padEnd(scale, "0")) * (negative ? -1n : 1n);
  };
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const x = convert(a, scale), y = convert(b, scale); return x < y ? -1 : x > y ? 1 : 0;
}
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const fieldPolicy = (field: string) => ({ stage_presence: "stage", current_stage: "stage", source_state: "freshness",
  equity_30d_end_value: "equity", return_30d_pct: "return" } as Record<string, string>)[field] ?? field;
function absent(reason: string, template?: ManagerMetric): ManagerMetric {
  return { value: null, unit: template?.unit ?? "NOT_PUBLISHED", currency: template?.currency ?? null,
    basis: template?.basis ?? "NOT_PUBLISHED", window: template?.window ?? null, denominator: null, methodology_ref: template?.methodology_ref ?? null,
    availability: "UNAVAILABLE", reason_code: reason, quality: { completeness: "UNRESOLVED", freshness: template?.quality.freshness ?? "UNKNOWN", reasons: [reason] },
    source_confidence: "UNKNOWN", provenance_refs: template?.provenance_refs ?? ["SOURCE_NOT_PUBLISHED"],
    calculation_revision: "manager-model.v1", policy_revision: template?.policy_revision ?? "NOT_PUBLISHED" };
}
export interface ManagerDatasetRow {
  row_key: string; alpha_id: string; alpha_version_id: string; portfolio_id: string;
  name: string | null; owner_user_id: string | null; lifecycle: string | null; venue: string | null;
  health: string | null; source_state: string | null; stage_presence: ManagerMember["stage"][];
  current_stage: ManagerMember["stage"] | null; entered_at_ms: number | null; days_in_stage: number | null;
  stage_lifecycle_reasons: ReturnType<typeof deriveManagerRowLifecycle>["stage_lifecycle_reasons"];
  children: Array<ManagerMember["tuple"] & { stage: ManagerMember["stage"]; binding_ref: string | null }>;
  metrics: Record<string, ManagerMetric>;
  economic_partitions: Array<{ partition: ManagerFact["partition"]; metrics: Record<string, ManagerMetric> }>;
  /** FE-CAT-3: set only on the rows of an ALL read (the row's own environment). */
  environment?: ManagerEnvironmentName;
}
/** A safe scalar may be filtered/ordered only if it is declared and permitted.
 * Financial query keys must pin a common economic partition; ALL is never money.
 * A caller cannot change the score denominator via a Fleet filter. */
function validateQuery(scope: AuthorizedExecutionReadScope, query: ManagerModelQuery) {
  const fields = [...query.sort.map(s => s.field), ...query.filters.map(f => f.field), ...query.group_by];
  if (query.stage_filter.length) fields.push("stage_presence");
  if (query.lifecycle_filter !== undefined) fields.push("lifecycle");
  if (query.q !== undefined) fields.push("name");
  for (const field of fields) if (!scopeAllowsField(scope, fieldPolicy(field))) fail("EXECUTION_READ_NOT_AVAILABLE", 400);
  for (const field of [...query.sort.map(s => s.field), ...query.filters.filter(f => f.op !== "IS_NULL").map(f => f.field)])
    if (managerMoneyFields.includes(field as typeof managerMoneyFields[number]) && !query.economic_partition)
      fail("EXECUTION_READ_NOT_AVAILABLE", 400);
}

/** Dedupe source identity, not amount or serialized object. Equal amounts on
 * different source IDs both count. Conflicting versions in one pinned snapshot
 * fail closed rather than silently choosing the prettier/latest outcome. */
export function dedupeManagerFacts(facts: readonly ManagerFact[]): ManagerFact[] {
  const seen = new Map<string, ManagerFact>();
  for (const fact of facts) {
    const key = JSON.stringify([fact.partition.economic_domain, fact.partition.native_profile_ref, fact.fact_id]);
    const previous = seen.get(key);
    if (previous && accessDigest(previous) !== accessDigest(fact)) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    seen.set(key, fact);
  }
  return [...seen.values()];
}
function sumMetric(facts: ManagerFact[]): ManagerMetric {
  const first = facts[0]?.metric;
  if (!first) return absent("SOURCE_FACTS_NOT_PUBLISHED");
  // A requested exact window missing on any contributing fact is not a
  // subtotal. Preserve its explicit query-level absence before aggregation.
  const missingWindow = facts.find(f => ["EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ALL_HISTORY_WINDOW_NOT_PUBLISHED"].includes(f.metric.reason_code ?? ""));
  if (missingWindow) return absent(missingWindow.metric.reason_code!, missingWindow.metric);
  // Performance facts need their own methodology; capital/fees/budgets remain
  // independently readable. Missing methodology is not source-zero or PnL.
  if (["return_30d_pct", "net_pnl", "realized_pnl", "unrealized_pnl"].includes(facts[0].kind) &&
    facts.some(f => !f.metric.methodology_ref)) return absent("METHODOLOGY_NOT_PUBLISHED", first);
  const identity = (m: ManagerMetric) => JSON.stringify([m.unit, m.currency, m.basis, m.window,
    m.methodology_ref, m.denominator, m.policy_revision]);
  if (facts.some(f => identity(f.metric) !== identity(first))) return absent("INCOMPARABLE_UNITS", first);
  if (["current_nav", "balance_total", "equity_30d_end_value"].includes(facts[0].kind) &&
    facts.some(f => f.effective_at_ms !== facts[0].effective_at_ms)) return absent("INCOMPARABLE_VALUATION_CUTOFF", first);
  if (facts.length > 1 && first.unit !== "MONEY") return absent("CONSOLIDATED_PATH_REQUIRED", first);
  if (facts.some(f => f.metric.availability !== "AVAILABLE" || f.metric.quality.completeness !== "COMPLETE"))
    return absent("SOURCE_FACTS_PARTIAL", first);
  return { ...first, value: sumExactDecimals(facts.map(f => f.metric.value!))!,
    quality: { completeness: "COMPLETE", freshness: facts.some(f => f.metric.quality.freshness === "STALE") ? "STALE" :
      facts.every(f => f.metric.quality.freshness === "FRESH") ? "FRESH" : "UNKNOWN", reasons: [...new Set(facts.flatMap(f => f.metric.quality.reasons))] },
    source_confidence: facts.some(f => f.metric.source_confidence === "UNKNOWN") ? "UNKNOWN" :
      facts.some(f => f.metric.source_confidence === "PROVISIONAL") ? "PROVISIONAL" : "VERIFIED",
    provenance_refs: [accessDigest(facts.map(f => [f.fact_id, f.revision, f.source_receipt_ref]).sort())],
    calculation_revision: "manager-model.v1" };
}
/** Valuation/balance snapshots of shared ownership count once, not once per
 * deployment/stage clone. Conflicting attribution cannot be repaired by SUM.
 * Budget and allocation receipts remain their distinct authority fact grain. */
export function economicFacts(facts: ManagerFact[]) {
  const snapshots = new Set(["current_nav", "balance_total", "equity_30d_end_value"]);
  const seen = new Map<string, ManagerFact>(), output: ManagerFact[] = [];
  for (const f of facts) {
    if (f.classification === "CUSTODY") continue; // Separate technical/custody authority is required.
    if (!snapshots.has(f.kind)) { output.push(f); continue; }
    const key = JSON.stringify([managerPartitionKey(f.partition), f.kind, f.economic_account_ref, f.ownership_partition_ref]);
    const previous = seen.get(key);
    if (previous && (previous.effective_at_ms !== f.effective_at_ms || accessDigest(previous.metric) !== accessDigest(f.metric)))
      fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    if (!previous) { seen.set(key, f); output.push(f); }
  }
  return output;
}
export function managerPartitionTotals(facts: ManagerFact[], keys: readonly string[], expectedTuples: Set<string>) {
  const groups = new Map<string, ManagerFact[]>(), rawGroups = new Map<string, ManagerFact[]>();
  const knownTuples = new Set<string>();
  for (const f of facts.filter(f => f.classification !== "CUSTODY")) {
    const key = managerPartitionKey(f.partition), rows = rawGroups.get(key) ?? [];
    rows.push(f); rawGroups.set(key, rows); knownTuples.add(managerTupleKey(f.tuple));
  }
  for (const f of economicFacts(facts)) {
    const key = managerPartitionKey(f.partition); const rows = groups.get(key) ?? []; rows.push(f); groups.set(key, rows);
  }
  // A member with no published economic facts cannot be assumed to belong to
  // another partition, nor to contribute zero. Check the raw tuple census
  // before ownership dedupe: a proven shared-account clone still needs a fact.
  const unknownTuples = [...expectedTuples].filter(key => !knownTuples.has(key));
  return [...groups].sort(([a], [b]) => lexical(a, b)).map(([partitionKey, rows]) => {
    const raw = rawGroups.get(partitionKey)!;
    const expected = new Set([...unknownTuples, ...raw.map(f => managerTupleKey(f.tuple))]);
    const metricValues = Object.fromEntries(keys.map(key => {
      const value = sumMetric(rows.filter(f => f.kind === key));
      const covered = new Set(raw.filter(f => f.kind === key).map(f => managerTupleKey(f.tuple)));
      return [key, value.value !== null && [...expected].some(tuple => !covered.has(tuple))
        ? absent("SOURCE_FACT_CENSUS_INCOMPLETE", value) : value];
    }));
    return { partition: rows[0].partition, metrics: metricValues };
  });
}
const DEFAULT_METRICS = [...managerMoneyFields, "return_30d_pct", "score"];
const nullableConsensus = (values: Array<string | null>) => new Set(values).size === 1 ? values[0] : null;
function rowsFor(members: ManagerMember[], facts: ManagerFact[], query: ManagerModelQuery, scope: AuthorizedExecutionReadScope,
  lifecycleStages: ReadonlyMap<string, ManagerMember["stage"][]>, doc: ManagerModelDocument) {
  const groups = new Map<string, ManagerMember[]>();
  // A transition belongs to the complete logical row, not a visible deployment.
  // Withhold timing when another current member of that row is unauthorized.
  const hiddenTimingRows = new Set(doc.members.filter(m => m.valid_from_ms <= doc.as_of_ms &&
    (m.valid_to_ms === null || m.valid_to_ms > doc.as_of_ms) && !projectionRowVisible(scope, m.tuple)).map(managerRowKey));
  const transitionsByRow = new Map<string, NonNullable<ManagerModelDocument["stage_transitions"]>>();
  for (const transition of doc.stage_transitions ?? []) {
    const key = JSON.stringify([transition.alpha_id, transition.alpha_version_id, transition.portfolio_id]);
    const values = transitionsByRow.get(key) ?? []; values.push(transition); transitionsByRow.set(key, values);
  }
  const byTuple = new Map<string, ManagerFact[]>();
  for (const fact of facts) { const key = managerTupleKey(fact.tuple), rows = byTuple.get(key) ?? []; rows.push(fact); byTuple.set(key, rows); }
  for (const member of members) { const key = managerRowKey(member), rows = groups.get(key) ?? []; rows.push(member); groups.set(key, rows); }
  return [...groups].map(([row_key, group]): ManagerDatasetRow => {
    const keys = new Set(group.map(m => managerTupleKey(m.tuple)));
    const ownFacts = [...keys].flatMap(key => byTuple.get(key) ?? []);
    const economic_partitions = managerPartitionTotals(ownFacts, DEFAULT_METRICS.filter(f => scopeAllowsField(scope, fieldPolicy(f))), keys);
    const selected = query.economic_partition ? economic_partitions.find(p => managerPartitionKey(p.partition) === managerPartitionKey(query.economic_partition!)) :
      economic_partitions.length === 1 ? economic_partitions[0] : undefined;
    const metricValues = Object.fromEntries(DEFAULT_METRICS.filter(f => scopeAllowsField(scope, fieldPolicy(f))).map(key => [key,
      key === "score" ? absent("RUNTIME_SCORE_POLICY_NOT_APPROVED") : selected?.metrics[key] ?? absent(economic_partitions.length > 1 ? "MIXED_ECONOMIC_DOMAINS" : "SOURCE_FACTS_NOT_PUBLISHED")]));
    const identity = group[0].tuple;
    const stagePresence = scopeAllowsField(scope, "stage") ? [...new Set(group.map(m => m.stage))].sort() : [];
    return { row_key, ...deriveManagerRowLifecycleFromFacts({
      stages: scopeAllowsField(scope, "stage") ? lifecycleStages.get(row_key) ?? stagePresence : [],
      ...identity, environment: doc.environment, as_of_ms: doc.as_of_ms, source_revision: doc.revision,
      facts: hiddenTimingRows.has(row_key) ? [] : transitionsByRow.get(row_key) ?? [] }), alpha_id: identity.alpha_id, alpha_version_id: identity.alpha_version_id, portfolio_id: identity.portfolio_id,
      name: scopeAllowsField(scope, "name") ? nullableConsensus(group.map(m => m.name)) : null,
      owner_user_id: scopeAllowsField(scope, "owner_user_id") ? nullableConsensus(group.map(m => m.owner_user_id)) : null,
      lifecycle: scopeAllowsField(scope, "lifecycle") ? nullableConsensus(group.map(m => m.lifecycle)) : null,
      venue: scopeAllowsField(scope, "venue") ? nullableConsensus(group.map(m => m.venue)) : null,
      health: scopeAllowsField(scope, "health") ? nullableConsensus(group.map(m => m.health)) : null,
      source_state: scopeAllowsField(scope, "freshness") ? nullableConsensus(group.map(m => m.source_state)) : null,
      stage_presence: stagePresence,
      children: group.map(m => ({ ...m.tuple, stage: m.stage, binding_ref: scopeAllowsField(scope, "binding_id") ? m.binding_ref : null })),
      metrics: metricValues, economic_partitions };
  });
}
/**
 * WP-K slice 6. The value of one published group metric: read in the PINNED partition when the query names one, otherwise in the group's only partition.
 * A group with several partitions and no pin has NO comparable value (money of two currencies is never compared or merged), and neither has a missing
 * or non-available metric: those are null, and null sorts last in both directions and fails GTE / LTE (IS_NULL matches it).
 */
function groupMetricValue(partitions: ReadonlyArray<{ partition: ManagerFact["partition"]; metrics: Record<string, { availability: string; value: string | null }> }>,
  key: string, pinned: ManagerFact["partition"] | undefined): string | null {
  const pool = pinned === undefined ? partitions : partitions.filter(p => managerPartitionKey(p.partition) === managerPartitionKey(pinned));
  if (pool.length !== 1) return null;
  const metric = pool[0].metrics[key];
  return metric !== undefined && metric.availability === "AVAILABLE" && metric.value !== null && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(metric.value) ? metric.value : null;
}
export function applyGroupQuery<G extends { key: Array<{ field: string; value: string | null }>; economic_partitions: ReadonlyArray<{ partition: ManagerFact["partition"]; metrics: Record<string, { availability: string; value: string | null }> }> }>(
  groups: G[], query: Pick<ManagerModelQuery, "group_sort" | "group_filters" | "economic_partition">): { groups: G[]; applied: null | {
    sort: ManagerModelQuery["group_sort"]; filters: ManagerModelQuery["group_filters"]; partition_basis: "PINNED_PARTITION" | "SINGLE_PARTITION_ONLY";
    groups_before_filter: number; groups_returned: number } } {
  if (!query.group_sort.length && !query.group_filters.length) return { groups, applied: null };
  const value = (g: G, key: string) => groupMetricValue(g.economic_partitions, key, query.economic_partition);
  let kept = groups.filter(g => query.group_filters.every(f => {
    const v = value(g, f.metric_key);
    if (f.op === "IS_NULL") return v === null;
    if (v === null) return false;
    const c = compareManagerDecimals(v, f.value!);
    return f.op === "GTE" ? c >= 0 : c <= 0;
  }));
  const order = query.group_sort[0];
  if (order) kept = [...kept].sort((a, b) => {
    const x = value(a, order.metric_key), y = value(b, order.metric_key);
    if (x === null || y === null) { if (x !== y) return x === null ? 1 : -1; return lexical(JSON.stringify(a.key), JSON.stringify(b.key)); }
    const c = compareManagerDecimals(x, y);
    return c ? c * (order.direction === "asc" ? 1 : -1) : lexical(JSON.stringify(a.key), JSON.stringify(b.key));
  });
  return { groups: kept, applied: { sort: query.group_sort, filters: query.group_filters,
    partition_basis: query.economic_partition ? "PINNED_PARTITION" : "SINGLE_PARTITION_ONLY", groups_before_filter: groups.length, groups_returned: kept.length } };
}
const scalar = (row: ManagerDatasetRow, field: keyof typeof MANAGER_SCALARS): string | null =>
  field === "stage_presence" ? JSON.stringify(row.stage_presence) :
    field in row.metrics ? row.metrics[field].value : (row as unknown as Record<string, string | null>)[field] ?? null;
function filtered(row: ManagerDatasetRow, q: ManagerModelQuery) {
  if (q.stage_filter.length && !q.stage_filter.some(stage => row.stage_presence.includes(stage))) return false;
  if (q.lifecycle_filter && row.lifecycle !== q.lifecycle_filter) return false;
  return q.filters.every(f => {
    const value = scalar(row, f.field);
    if (f.op === "IS_NULL") return value === null;
    if (value === null) return false;
    if (f.op === "IN") return f.values!.some(candidate => MANAGER_SCALARS[f.field] === "DECIMAL"
      ? compareManagerDecimals(value, candidate) === 0 : value === candidate);
    const compare = MANAGER_SCALARS[f.field] === "DECIMAL" ? compareManagerDecimals(value, f.value!) : lexical(value, f.value!);
    return f.op === "EQ" ? compare === 0 : f.op === "GTE" ? compare >= 0 : compare <= 0;
  });
}
/** The one row order: the query's sort keys (nulls last in both directions), then the row key. */
const rowOrder = (query: { sort: ManagerModelQuery["sort"] }) => (a: ManagerDatasetRow, b: ManagerDatasetRow): number => {
  for (const order of query.sort) {
    const x = scalar(a, order.field), y = scalar(b, order.field);
    if (x === null || y === null) { if (x !== y) return x === null ? 1 : -1; continue; }
    const c = MANAGER_SCALARS[order.field] === "DECIMAL" ? compareManagerDecimals(x, y) : lexical(x, y);
    if (c) return c * (order.direction === "asc" ? 1 : -1);
  }
  return lexical(a.row_key, b.row_key);
};
function rootFlows(facts: ManagerFact[], surface: ManagerSurface) {
  if (surface !== "FUND") return facts;
  const groups = new Map<string, ManagerFact[]>();
  for (const f of facts.filter(f => f.classification === "INTERNAL_TRANSFER")) {
    if (!f.transfer_pair_ref) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    const key = JSON.stringify([managerPartitionKey(f.partition), f.transfer_pair_ref]);
    const group = groups.get(key) ?? []; group.push(f); groups.set(key, group);
  }
  for (const rows of groups.values()) {
    if (rows.length !== 2 || rows[0].tuple.portfolio_id !== rows[1].counterpart_portfolio_id || rows[1].tuple.portfolio_id !== rows[0].counterpart_portfolio_id ||
      rows[0].effective_at_ms !== rows[1].effective_at_ms || rows.some(f => f.metric.unit !== "MONEY" ||
        f.metric.availability !== "AVAILABLE" || f.metric.quality.completeness !== "COMPLETE") ||
      accessDigest([rows[0].metric.currency, rows[0].metric.basis, rows[0].metric.window, rows[0].metric.methodology_ref, rows[0].metric.policy_revision]) !==
        accessDigest([rows[1].metric.currency, rows[1].metric.basis, rows[1].metric.window, rows[1].metric.methodology_ref, rows[1].metric.policy_revision]) ||
      sumExactDecimals(rows.map(f => f.metric.value ?? "INVALID")) !== "0") fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
  }
  return facts.filter(f => f.classification !== "INTERNAL_TRANSFER");
}

/** Bounded read-side query only. Score computation/recomputation is deliberately
 * not called here. Current policy filters tuples/fields before joins or totals.
 * This function still requires scopes.deliver at its service boundary. */
export type ManagerEnvironmentName = "paper" | "sandbox" | "live";
/** A query that names ONE environment (the parsed `ALL` query is never read as one). */
export type ManagerEnvQuery = Omit<ManagerModelQuery, "environment"> & { environment: ManagerEnvironmentName };

/**
 * Everything one environment's authorized read decides BEFORE paging: the authorized members, the facts they may see, every row built
 * from them and the rows that survive the filters, sorted. It is the single place authorization precedes counting: nothing after it
 * (the page, a group, a statement, an ALL fan-out merge) can see a row or a fact this did not admit.
 */
export function collectManagerRows(scope: AuthorizedExecutionReadScope, input: unknown, query: ManagerEnvQuery,
  surface: ManagerSurface = "FLEET", resourceId?: string, scoreFence?: ManagerScoreReadFence,
  compositionFence?:ManagerCompositionReadFence, regimeFence?: ManagerRegimeReadFence) {
  assertExecutionReadScope(scope);
  if (scope.mode !== "SCOPED_V2") fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
  const doc = managerModelDocument.parse(input);
  const selectedWindow = resolveManagerWindow(doc.as_of_ms, query.window);
  if (doc.workspace_id !== scope.workspaceId || doc.environment !== scope.environment || doc.profile_id !== scope.profileId ||
    query.environment !== scope.environment || query.workspace_id && query.workspace_id !== scope.workspaceId)
    fail("EXECUTION_READ_ACCESS_CHANGED", 409);
  const binding = scopeReadPopulation(scope).binding;
  if (!binding || binding.dataset_id !== doc.family_id || binding.source_revision !== doc.revision ||
    binding.projection_generation !== doc.projection_generation || binding.catalogue_revision !== doc.catalogue_digest)
    fail("EXECUTION_READ_ACCESS_CHANGED", 409);
  for (const field of ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id", "stage"])
    if (!scopeAllowsField(scope, field)) fail("EXECUTION_READ_FIELD_POLICY_PENDING");
  if (surface === "FUND" && !scope.wholePopulation) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
  validateQuery(scope, query);
  const selected = (m: ManagerMember) => surface === "FUND" || surface === "FLEET" ||
    m.tuple[surface === "PORTFOLIO" ? "portfolio_id" : surface === "ALPHA" ? "alpha_id" : surface === "ACCOUNT" ? "account_id" : "deployment_id"] === resourceId;
  const active = doc.members.filter(m => m.valid_from_ms <= doc.as_of_ms && (m.valid_to_ms === null || m.valid_to_ms > doc.as_of_ms) &&
    projectionRowVisible(scope, m.tuple) && selected(m));
  const members = active.filter(m => !query.stage_filter.length || query.stage_filter.includes(m.stage));
  // FE-027: a stage filter narrows the table, never the row's lifecycle. current_stage is read off the
  // authorized active members BEFORE that filter, or "filter to Canary" would crown Canary the only stage.
  const lifecycleStages = new Map<string, ManagerMember["stage"][]>();
  for (const m of active) { const key = managerRowKey(m), set = lifecycleStages.get(key) ?? []; if (!set.includes(m.stage)) set.push(m.stage); lifecycleStages.set(key, set); }
  const memberKeys = new Set(members.map(m => managerTupleKey(m.tuple)));
  const facts = dedupeManagerFacts(doc.facts.filter(f => memberKeys.has(managerTupleKey(f.tuple)) && projectionRowVisible(scope, f.tuple) &&
    scopeAllowsField(scope, fieldPolicy(f.kind))));
  if (facts.length && ["currency", "profile_id", "provenance_ref"].some(field => !scopeAllowsField(scope, field)))
    fail("EXECUTION_READ_FIELD_POLICY_PENDING");
  const selectedFacts = managerFactsForWindow(facts, selectedWindow);
  const allRows = rowsFor(members, selectedFacts, query, scope, lifecycleStages, doc);
  // No score computation on this read path. Exact authorized population and
  // economic partition must match a separately precomputed, current-policy result.
  if (scopeAllowsField(scope, "score")) for (const row of allRows) {
    const rowMembers = members.filter(m => managerRowKey(m) === row.row_key);
    const partition = query.economic_partition ?? (row.economic_partitions.length === 1 ? row.economic_partitions[0].partition : null);
    if (!partition) continue;
    const accepted = selectManagerScorePublications(doc, rowMembers, { type: "alpha", id: row.alpha_id }, accessDigest(partition), scoreFence)
      .filter(s => s.slot === "RAW");
    const values = managerPublicationsForWindow(accepted, selectedWindow);
    if (selectedWindow !== null && (selectedWindow.requested === "ALL" || accepted.length === 1 && values.length === 0))
      row.metrics.score = absent(selectedWindow.reason_code ?? "EXACT_METRIC_WINDOW_NOT_PUBLISHED");
    if (values.length === 1) {
      const s = values[0], ready = s.quality.value !== null;
      const reason = s.quality.reason_codes[0] ?? `SCORE_${s.quality.status.toUpperCase()}`;
      row.metrics.score = { ...absent(reason), value: s.quality.value,
        unit: "SCORE", basis: s.provenance.binding.comparable_basis_id,
        window: {from_ms:s.provenance.binding.window_start_ms,to_ms:s.provenance.binding.window_end_ms},
        methodology_ref: s.quality.formula_id, availability: ready ? "AVAILABLE" : "UNAVAILABLE", reason_code: ready ? null : reason,
        quality: { completeness: ready ? "COMPLETE" : "UNRESOLVED", freshness: s.quality.status === "stale" ? "STALE" : "FRESH", reasons: s.quality.reason_codes },
        source_confidence: s.quality.status === "provisional" ? "PROVISIONAL" : "VERIFIED",
        provenance_refs: [s.provenance.input_digest], calculation_revision: s.provenance.calculation_revision,
        policy_revision: s.provenance.policy_revision! };
    }
  }
  const subjectType = ({ FUND:"manager_book", PORTFOLIO:"portfolio", ALPHA:"alpha", ACCOUNT:"account", DEPLOYMENT:"deployment" } as const)[surface as Exclude<ManagerSurface,"FLEET">];
  const partitionsForScore = [...new Set(facts.map(f => accessDigest(f.partition)))];
  const acceptedDetails = scopeAllowsField(scope,"score") && subjectType && partitionsForScore.length === 1 ?
    selectManagerScorePublications(doc,members,{type:subjectType,id:resourceId ?? scope.workspaceId},
      query.economic_partition ? accessDigest(query.economic_partition) : partitionsForScore[0],scoreFence) : [];
  const details = managerPublicationsForWindow(acceptedDetails, selectedWindow);
  const compositionPartition=query.economic_partition?accessDigest(query.economic_partition):
    partitionsForScore.length===1?partitionsForScore[0]:null;
  const selectedStages=query.stage_filter.length?query.stage_filter:
    scope.environment==="paper"?["PAPER" as const]:scope.environment==="sandbox"?["SANDBOX" as const]:["CANARY" as const,"LIVE" as const];
  // These complete accounting outputs must never leak through researcher fields,
  // visible-subset totals, table filters or pagination. Direct NAV stays separate.
  const acceptedCompositions=(surface==="FUND"||surface==="PORTFOLIO")&&compositionPartition!==null&&
    ["score","allocation","balance_total","currency","provenance_ref"].every(field=>scopeAllowsField(scope,field))&&
    scopeAllowsFullAccountingPopulation(scope,surface==="PORTFOLIO"?resourceId:undefined)?
    selectManagerCompositionPublications(doc,members,{type:surface==="FUND"?"manager_book":"portfolio",id:resourceId??scope.workspaceId},
      selectedStages,compositionPartition,compositionFence):[];
  const compositions = managerPublicationsForWindow(acceptedCompositions, selectedWindow);
  // Independent descriptive per-alpha/version evidence, not a financial or Fund score.
  // Scope/reference corpus is exact BEFORE UI filters, groups, totals or pagination.
  const regimes = ["regime", "binding_id", "provenance_ref"].every(field => scopeAllowsField(scope, field)) ?
    selectManagerRegimePublications(doc, members, query.stage_filter,
      query.economic_partition ? accessDigest(query.economic_partition) : null,
      { type: surface === "DEPLOYMENT" ? "deployment" : "alpha",
        ...(surface === "ALPHA" || surface === "DEPLOYMENT" ? { id: resourceId } : {}) }, regimeFence) : [];
  const subjectRegime = (surface === "ALPHA" || surface === "DEPLOYMENT") && regimes.length === 1 ? regimes[0] : null;
  const rows = allRows.filter(row => matchesManagerName(row, query) && filtered(row, query));
  rows.sort(rowOrder(query));
  return { scope, doc, query, surface, resourceId, selectedWindow, members, facts, selectedFacts, allRows, rows, details, acceptedDetails,
    compositions, acceptedCompositions, regimes, subjectRegime };
}
export type ManagerCollected = ReturnType<typeof collectManagerRows>;

/** Totals per economic partition over the facts of the given rows (by their single-environment `row_key`). Never across environments. */
function partitionTotalsOf(c: ManagerCollected, rowKeys: ReadonlySet<string>) {
  const tuples = new Set(c.members.filter(m => rowKeys.has(managerRowKey(m))).map(m => managerTupleKey(m.tuple)));
  return managerPartitionTotals(c.selectedFacts.filter(f => tuples.has(managerTupleKey(f.tuple))),
    managerMoneyFields.filter(f => scopeAllowsField(c.scope, f)), tuples);
}
const statementOf = (c: ManagerCollected) => managerPartitionTotals(rootFlows(c.facts, c.surface),
  managerStatementFields.filter(f => scopeAllowsField(c.scope, f)), new Set(c.members.map(m => managerTupleKey(m.tuple))));

/** One keyset page of already authorized, filtered and sorted rows; the cursor is signed over the query fingerprint. */
function pageOfRows<R extends { row_key: string }>(rows: readonly R[], query: { limit: number; after?: string; before?: string },
  codec: KeysetCursorCodec, resourceId: string, workspaceId: string, queryId: string) {
  const cursorContext = { resourceId, workspaceId, queryFingerprint: queryId };
  const encode = (row: R, direction: "after" | "before") => codec.encode({ resource_id: cursorContext.resourceId,
    workspace_id: workspaceId, query_fingerprint: queryId, direction, boundary: [row.row_key] });
  let start = 0, end = rows.length;
  const token = query.after ?? query.before;
  if (token) {
    const [boundary] = codec.decode(token, { ...cursorContext, direction: query.before ? "before" : "after", boundarySize: 1 });
    const index = rows.findIndex(row => row.row_key === boundary);
    if (index < 0) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
    if (query.before) { end = index; start = Math.max(0, end - query.limit); } else start = index + 1;
  }
  const items = rows.slice(start, Math.min(end, start + query.limit));
  return { items, page: { limit: query.limit, returned_count: items.length, authorized_filtered_count: rows.length,
    next_cursor: start + items.length < rows.length && items.length ? encode(items.at(-1)!, "after") : null,
    previous_cursor: start > 0 && items.length ? encode(items[0], "before") : null } };
}

export function queryManagerModel(scope: AuthorizedExecutionReadScope, input: unknown, rawQuery: unknown,
  codec: KeysetCursorCodec, surface: ManagerSurface = "FLEET", resourceId?: string, scoreFence?: ManagerScoreReadFence,
  compositionFence?:ManagerCompositionReadFence, regimeFence?: ManagerRegimeReadFence) {
  assertExecutionReadScope(scope);
  if (scope.mode !== "SCOPED_V2") fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
  const parsed = managerModelQuery.parse(rawQuery);
  // ALL is a separate fan-out read over several scopes (`queryManagerModelAll`); one scope can never answer it.
  if (parsed.environment === "ALL") fail("EXECUTION_READ_NOT_AVAILABLE", 400);
  const collected = collectManagerRows(scope, input, parsed as ManagerEnvQuery, surface, resourceId, scoreFence, compositionFence, regimeFence);
  const { doc, query, selectedWindow, members, facts, selectedFacts, allRows, rows, details, acceptedDetails, compositions,
    acceptedCompositions, regimes, subjectRegime } = collected;
  const summary = (slot:"RAW"|"DIRECT_NAV") => {
    const s = details.filter(s => s.slot === slot);
    return s.length === 1 ? {value:s[0].quality.value,status:s[0].quality.status} :
      selectedWindow !== null && (selectedWindow.requested === "ALL" || acceptedDetails.filter(p => p.slot === slot).length === 1) ?
        managerMissingScoreWindow(selectedWindow) : {value:null,status:"policy_pending" as const};
  };
  const queryId = accessDigest({ scope: scope.fingerprint, source: doc.revision, generation: doc.projection_generation,
    surface, resourceId: resourceId ?? null, scores:accessDigest({details,compositions,regimes,rows:allRows.map(r => r.metrics.score)}),
    query: { ...query, q_mode: query.q === undefined ? undefined : query.q_mode ?? "CONTAINS",
      selected_window: selectedWindow, after: undefined, before: undefined } });
  const { items, page } = pageOfRows(rows, query, codec, `manager-model:${surface}`, scope.workspaceId, queryId);
  const groupMap = new Map<string, { key: Array<{ field: string; value: string | null }>; rows: ManagerDatasetRow[] }>();
  if (query.group_by.length) for (const row of rows) {
    // Stage groups overlap by membership; they must not be summed as one book.
    let keys: Array<Array<{ field: string; value: string | null }>> = [[]];
    for (const field of query.group_by) {
      const values = field === "stage_presence" ? row.stage_presence : [(row as unknown as Record<string, string | null>)[field] ?? null];
      keys = keys.flatMap(key => values.map(value => [...key, { field, value }]));
    }
    for (const key of keys) { const id = JSON.stringify(key), group = groupMap.get(id) ?? { key, rows: [] }; group.rows.push(row); groupMap.set(id, group); }
  }
  if (groupMap.size > 200) fail("EXECUTION_READ_SCOPE_LIMIT");
  const groupBase = [...groupMap].sort(([a], [b]) => lexical(a, b)).map(([, group]) => ({
    key: group.key, unique_row_count: group.rows.length, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY" as const,
    economic_partitions: partitionTotalsOf(collected, new Set(group.rows.map(r => r.row_key))) }));
  const grouped = applyGroupQuery(groupBase, query);
  const groupOutput = grouped.groups;
  const statement = statementOf(collected);
  const response = { schema_version: "portal.execution.manager-dataset.v1" as const, surface, workspace_id: scope.workspaceId,
    stage_lifecycle: { ...MANAGER_STAGE_LIFECYCLE_POLICY, entry_time: rows.some(row => row.entered_at_ms !== null)
      ? "EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED" as const : MANAGER_STAGE_LIFECYCLE_POLICY.entry_time },
    selected_window: selectedWindow,
    query_options: managerQueryOptions({ asOf: doc.as_of_ms, canSearchName: scopeAllowsField(scope, "name"),
      stageTimingPublished: rows.length > 0 && rows.every(row => row.entered_at_ms !== null),
      sortFields: (Object.keys(MANAGER_SCALARS) as Array<keyof typeof MANAGER_SCALARS>).filter(key => scopeAllowsField(scope, fieldPolicy(key))),
      groupFields: (["portfolio_id", "owner_user_id", "alpha_id", "stage_presence", "current_stage", "venue", "health", "source_state", "lifecycle"] as const)
        .filter(key => scopeAllowsField(scope, fieldPolicy(key))),
      metricKeys: ([...managerMoneyFields, "return_30d_pct", "score"] as const).filter(key => scopeAllowsField(scope, fieldPolicy(key))), facts }),
    environment: scope.environment, record_authority: "PORTAL_PROJECTION" as const, source_authority: "TRADING_SYSTEM" as const,
    snapshot_id: accessDigest({ scope: scope.fingerprint, queryId, rows }),
    as_of_ms: doc.as_of_ms, recorded_through_ms: doc.recorded_through_ms, facts_through_ms: doc.facts_through_ms,
    quality: doc.source_quality, coverage: "AUTHORIZED_ONLY" as const, economic_aggregation: "PARTITIONED_ONLY" as const,
    query_policy: { null_order: "LAST_BOTH_DIRECTIONS" as const, stage_order: "LEXICAL_SET_NOT_RISK_RANK" as const, maximum_response_bytes: 1048576 as const },
    page,
    items, groups: groupOutput, ...(grouped.applied ? { group_query: grouped.applied } : {}), capital_statements: statement,
    statement_scope: "AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS" as const,
    scores: { raw: summary("RAW"), composition: compositions.length===1?
      {value:compositions[0].result.value,status:compositions[0].result.status}:
        selectedWindow !== null && (selectedWindow.requested === "ALL" || acceptedCompositions.length === 1) ?
          managerMissingScoreWindow(selectedWindow) : { value: null, status: "policy_pending" as const },
      direct_nav: summary("DIRECT_NAV"), regime: { value: null, status: subjectRegime?.result.status ?? "unavailable" as const,
        ...(doc.precomputed_regimes === undefined ? {} : { reason_code: subjectRegime ? null :
          surface === "ALPHA" || surface === "DEPLOYMENT" ? "REGIME_POLICY_SOURCE_OR_AUTHORIZED_SLICE_NOT_QUALIFIED" as const :
            "REGIME_IS_PER_ALPHA_OR_DEPLOYMENT_ONLY" as const }) },
      reason_code: details.some(s => s.quality.value !== null)||compositions.some(s=>s.result.value!==null) ? "QUALIFIED_PRECOMPUTED_SCORE" as const :
        selectedWindow !== null && summary("RAW").status === "window_not_published" && summary("DIRECT_NAV").status === "window_not_published" &&
          (selectedWindow.requested === "ALL" || acceptedCompositions.length === 1 && compositions.length === 0) ?
          selectedWindow.reason_code ?? "EXACT_METRIC_WINDOW_NOT_PUBLISHED" : "RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED" as const,
      calculation_path: "PRECOMPUTED_ONLY" as const },
    ...(doc.precomputed_scores !== undefined ? {score_details:details} : {}),
    ...(doc.precomputed_compositions!==undefined?{composition_details:compositions}:{}),
    ...(doc.precomputed_regimes !== undefined ? { regime_details: regimes } : {}),
    funding_bucket_pnl: { value: null, reason_code: "LOT_ATTRIBUTION_METHOD_NOT_APPROVED" as const },
    lineage: { reducer_revision: "manager-model.v1" as const, source_set_ref: accessDigest(facts.map(f => [f.fact_id, f.revision]).sort()),
      revision: managerLineageRevision(scope.fingerprint, doc.revision),
      supersedes_revision: doc.supersedes_revision ? managerLineageRevision(scope.fingerprint, doc.supersedes_revision) : null },
  };
  if (Buffer.byteLength(JSON.stringify(response)) > 1048576) fail("EXECUTION_READ_SCOPE_LIMIT");
  // MD-5: canonical zero on emit, exactly once, before the response parse (which then refuses any signed zero left).
  return managerDatasetResponse.parse(canonicalizeManagerDatasetZero(response));
}

/**
 * The PUBLIC lineage identity of a Manager read: the stored source revision bound to the exact read scope that served it. It is the
 * only place the formula lives; `lineage.revision` of a dataset and the `named_snapshot.lineage_revision` of the Fleet realtime
 * baseline (CR-01) both come from here, so they cannot drift apart. A different actor, session, grant, visible resource or source
 * revision is a different string.
 */
export const managerLineageRevision = (scopeFingerprint: string, sourceRevision: string): string =>
  accessDigest({ scope: scopeFingerprint, source: sourceRevision });

/**
 * The exact scope requirement `GET /manager/fleet` authorizes under (`alpha.read`, no resource, no whole-population demand). The
 * Fleet realtime baseline mints the same requirement to learn the scope fingerprint the named read WILL carry, so the two reads
 * pair on one derivation instead of on a string both sides promise to match.
 */
export const fleetReadRequirement = (dataset: ReadDatasetBinding): ReadScopeRequirement =>
  ({ action: "alpha.read", resource: undefined, requireWholePopulation: false, dataset });

/* ───────────── FE-CAT-3: the Fleet ALL lens (navigation across separately authorized environments) ─────────────
 * `GET /manager/fleet?environment=ALL` is a fan-out of the SAME single-environment read: the service authorizes and collects each
 * environment under its own scope (`collectManagerRows`), and this function only MERGES what those scopes already admitted. It
 * therefore adds nothing the per-environment reads did not authorize, and it counts only rows that survived authorization.
 *
 *  - rows: every environment's authorized, filtered rows, ordered by the query's sort then the ALL row key; each row keeps its own
 *    `environment` and its own `economic_partitions`; its `row_key` starts with the environment (one row of one environment);
 *  - ONE cursor over one exact snapshot: the query fingerprint binds every included scope, source revision, generation, the typed
 *    outcome of every environment and the query itself, so a page of another snapshot is refused exactly as in one environment;
 *  - `environment_coverage`: per environment included/unavailable (typed reason), its own clocks, quality, snapshot and counts;
 *  - NO money is combined: `page.*_count` count rows, a group lists the partitions of each environment next to each other, and
 *    `capital_statements` is the concatenation of each environment's per-partition statements. No total over partitions exists.
 */
export type ManagerAllRead = { environment: ManagerEnvironmentName } & ({ collected: ManagerCollected } | { unavailable: ManagerAllReason });

/** The per-environment question of an ALL query: the same filters, sort and group, one concrete environment, no cursor. */
export const managerAllEnvironmentQuery = (all: ManagerModelQuery, environment: ManagerEnvironmentName): ManagerEnvQuery =>
  ({ ...all, environment, after: undefined, before: undefined });

/** What an ALL read refuses before it touches any environment: only the Fleet surface, no window, no money order without a pinned partition. */
export function assertManagerAllQuery(query: ManagerModelQuery): void {
  if (query.environment !== "ALL" || query.window !== undefined) fail("EXECUTION_READ_NOT_AVAILABLE", 400);
  for (const field of [...query.sort.map(s => s.field), ...query.filters.filter(f => f.op !== "IS_NULL").map(f => f.field)])
    if (managerMoneyFields.includes(field as typeof managerMoneyFields[number]) && !query.economic_partition) fail("EXECUTION_READ_NOT_AVAILABLE", 400);
}

/** Why an environment's read failed, as the typed reason of its coverage entry (never a message, never a count). */
export function managerAllReasonOf(error: unknown): ManagerAllReason {
  if (!(error instanceof ExecutionReadScopeError)) return "SOURCE_UNAVAILABLE";
  switch (error.code) {
    case "EXECUTION_READ_NOT_AVAILABLE": return "NOT_AVAILABLE_TO_VIEWER";
    case "EXECUTION_READ_POLICY_PENDING": case "EXECUTION_READ_FIELD_POLICY_PENDING": return "POLICY_PENDING";
    case "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED": return "PUBLICATION_NOT_QUALIFIED";
    case "EXECUTION_READ_ACCESS_CHANGED": case "EXECUTION_READ_CURSOR_INVALID": return "CHANGED_DURING_READ";
    case "EXECUTION_READ_SCOPE_LIMIT": return "SCOPE_LIMIT_EXCEEDED";
    default: return "SOURCE_UNAVAILABLE";
  }
}

const COMPLETENESS_RANK = { COMPLETE: 0, PARTIAL: 1, UNRESOLVED: 2 } as const;
const FRESHNESS_RANK = { FRESH: 0, UNKNOWN: 1, STALE: 2 } as const;

export function queryManagerModelAll(reads: readonly ManagerAllRead[], rawQuery: unknown, codec: KeysetCursorCodec, workspaceId: string) {
  const query = managerModelQuery.parse(rawQuery);
  assertManagerAllQuery(query);
  // Exactly one outcome per environment, in the published order: a missing environment is typed, never absent.
  const byEnvironment = new Map(reads.map(read => [read.environment, read] as const));
  if (reads.length !== MANAGER_ALL_ENVIRONMENTS.length || byEnvironment.size !== reads.length) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
  const ordered = MANAGER_ALL_ENVIRONMENTS.map(environment => byEnvironment.get(environment) ?? fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE"));
  type Included = { environment: ManagerEnvironmentName; collected: ManagerCollected };
  const included: Included[] = ordered.flatMap(read => "collected" in read ? [{ environment: read.environment, collected: read.collected }] : []);
  for (const { environment, collected } of included) {
    // Every collected read answers THIS question, in its own scope, for the principal's workspace: anything else is another read.
    if (collected.scope.workspaceId !== workspaceId || collected.scope.environment !== environment || collected.doc.environment !== environment ||
      collected.surface !== "FLEET" || collected.resourceId !== undefined ||
      accessDigest(collected.query) !== accessDigest(managerAllEnvironmentQuery(query, environment))) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
  }
  if (included.length === 0) {
    // Nothing to show. When every environment is simply not the viewer's, this is the single-environment answer (404), not a degraded body.
    const reasons = ordered.map(read => "unavailable" in read ? read.unavailable : "SOURCE_UNAVAILABLE");
    if (reasons.every(reason => reason === "NOT_AVAILABLE_TO_VIEWER")) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
    fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
  }

  // The options every included environment offers (a field one of them may not use is not offered: fail closed).
  const common = <T extends string>(lists: ReadonlyArray<readonly T[]>): T[] => lists.length === 0 ? [] : lists[0].filter(item => lists.every(list => list.includes(item)));
  const scalarKeys = Object.keys(MANAGER_SCALARS) as Array<keyof typeof MANAGER_SCALARS>;
  const groupKeys = ["portfolio_id", "owner_user_id", "alpha_id", "stage_presence", "current_stage", "venue", "health", "source_state", "lifecycle"] as const;
  const sortFields = common(included.map(({ collected }) => scalarKeys.filter(key => scopeAllowsField(collected.scope, fieldPolicy(key)))));
  const groupFields = common(included.map(({ collected }) => groupKeys.filter(key => scopeAllowsField(collected.scope, fieldPolicy(key)))));
  const metricKeys = common(included.map(({ collected }) => ([...managerMoneyFields, "return_30d_pct", "score"] as const).filter(key => scopeAllowsField(collected.scope, fieldPolicy(key)))));
  const canSearchName = included.every(({ collected }) => scopeAllowsField(collected.scope, "name"));

  interface Merged { row: ManagerDatasetRow; source: ManagerCollected; sourceKey: string }
  const merged: Merged[] = included.flatMap(({ environment, collected }) => collected.rows.map((row): Merged => ({
    source: collected, sourceKey: row.row_key,
    row: { ...row, environment, row_key: managerAllRowKey(environment, row),
      metrics: Object.fromEntries(Object.entries(row.metrics).filter(([key]) => (metricKeys as string[]).includes(key))) } })));
  if (merged.length > 10_000) fail("EXECUTION_READ_SCOPE_LIMIT");
  const order = rowOrder(query);
  merged.sort((a, b) => order(a.row, b.row));
  const rows = merged.map(entry => entry.row);

  const queryId = accessDigest({ environments: included.map(({ environment, collected: c }) => [environment, c.scope.fingerprint, c.doc.revision, c.doc.projection_generation,
      accessDigest({ details: c.details, compositions: c.compositions, regimes: c.regimes, rows: c.allRows.map(r => r.metrics.score) })]),
    unavailable: ordered.flatMap(read => "unavailable" in read ? [[read.environment, read.unavailable]] : []), surface: "FLEET",
    query: { ...query, q_mode: query.q === undefined ? undefined : query.q_mode ?? "CONTAINS", selected_window: null, after: undefined, before: undefined } });
  const { items, page } = pageOfRows(rows, query, codec, "manager-model:FLEET:ALL", workspaceId, queryId);

  const groupMap = new Map<string, { key: Array<{ field: string; value: string | null }>; rows: Merged[] }>();
  if (query.group_by.length) for (const entry of merged) {
    let keys: Array<Array<{ field: string; value: string | null }>> = [[]];
    for (const field of query.group_by) {
      const values = field === "stage_presence" ? entry.row.stage_presence : [(entry.row as unknown as Record<string, string | null>)[field] ?? null];
      keys = keys.flatMap(key => values.map(value => [...key, { field, value }]));
    }
    for (const key of keys) { const id = JSON.stringify(key), group = groupMap.get(id) ?? { key, rows: [] }; group.rows.push(entry); groupMap.set(id, group); }
  }
  if (groupMap.size > 200) fail("EXECUTION_READ_SCOPE_LIMIT");
  const groups = [...groupMap].sort(([a], [b]) => lexical(a, b)).map(([, group]) => ({ key: group.key, unique_row_count: group.rows.length,
    totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY" as const,
    // Each environment's partitions side by side. Never merged: a partition belongs to exactly one environment's economic domain.
    economic_partitions: included.flatMap(({ collected }) => {
      const own = group.rows.filter(entry => entry.source === collected);
      return own.length === 0 ? [] : partitionTotalsOf(collected, new Set(own.map(entry => entry.sourceKey)));
    }) }));

  const returnedBy = new Map<string, number>();
  for (const item of items) returnedBy.set(item.environment!, (returnedBy.get(item.environment!) ?? 0) + 1);
  const environmentCoverage = ordered.map(read => "collected" in read ? ({ environment: read.environment, availability: "INCLUDED" as const, reason_code: null,
    snapshot_id: accessDigest({ scope: read.collected.scope.fingerprint, source: read.collected.doc.revision,
      generation: read.collected.doc.projection_generation, rows: read.collected.rows }),
    as_of_ms: read.collected.doc.as_of_ms, recorded_through_ms: read.collected.doc.recorded_through_ms, facts_through_ms: read.collected.doc.facts_through_ms,
    quality: read.collected.doc.source_quality, authorized_filtered_count: read.collected.rows.length, returned_count: returnedBy.get(read.environment) ?? 0 }) :
    ({ environment: read.environment, availability: "UNAVAILABLE" as const, reason_code: read.unavailable, snapshot_id: null, as_of_ms: null,
      recorded_through_ms: null, facts_through_ms: null, quality: null, authorized_filtered_count: null, returned_count: null }));

  // The combined envelope is the CONSERVATIVE one: the oldest clock, the worst quality; an unavailable environment is never COMPLETE or FRESH.
  const docs = included.map(({ collected }) => collected.doc);
  const missing = ordered.length - included.length;
  const worst = <K extends string>(rank: Record<K, number>, values: K[]): K => values.reduce((a, b) => rank[b] > rank[a] ? b : a);
  let completeness = worst(COMPLETENESS_RANK, docs.map(doc => doc.source_quality.completeness));
  let freshness = worst(FRESHNESS_RANK, docs.map(doc => doc.source_quality.freshness));
  if (missing > 0 && completeness === "COMPLETE") completeness = "PARTIAL";
  if (missing > 0 && freshness === "FRESH") freshness = "UNKNOWN";
  const reasonList = [...new Set([
    ...included.flatMap(({ environment, collected }) => collected.doc.source_quality.reasons.map(reason => `${environment}:${reason}`.slice(0, 256))),
    ...ordered.flatMap(read => "unavailable" in read ? [`${read.environment}:ENVIRONMENT_UNAVAILABLE:${read.unavailable}`] : [])])].sort();
  const reasons = reasonList.length > 32 ? [...reasonList.slice(0, 31), "REASONS_TRUNCATED"] : reasonList;

  const response = { schema_version: "portal.execution.manager-dataset.v1" as const, surface: "FLEET" as const, workspace_id: workspaceId,
    stage_lifecycle: { ...MANAGER_STAGE_LIFECYCLE_POLICY, entry_time: rows.some(row => row.entered_at_ms !== null)
      ? "EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED" as const : MANAGER_STAGE_LIFECYCLE_POLICY.entry_time }, selected_window: null,
    query_options: managerQueryOptions({ asOf: Math.min(...docs.map(doc => doc.as_of_ms)), canSearchName, sortFields, groupFields, metricKeys, facts: [],
      stageTimingPublished: rows.length > 0 && rows.every(row => row.entered_at_ms !== null) }),
    environment: "ALL" as const, environment_coverage: environmentCoverage,
    record_authority: "PORTAL_PROJECTION" as const, source_authority: "TRADING_SYSTEM" as const,
    snapshot_id: accessDigest({ environments: included.map(({ environment, collected }) => [environment, collected.scope.fingerprint]), queryId, rows }),
    as_of_ms: Math.min(...docs.map(doc => doc.as_of_ms)), recorded_through_ms: Math.min(...docs.map(doc => doc.recorded_through_ms)),
    facts_through_ms: docs.some(doc => doc.facts_through_ms === null) ? null : Math.min(...docs.map(doc => doc.facts_through_ms!)),
    quality: { completeness, freshness, reasons }, coverage: "AUTHORIZED_ONLY" as const, economic_aggregation: "PARTITIONED_ONLY" as const,
    query_policy: { null_order: "LAST_BOTH_DIRECTIONS" as const, stage_order: "LEXICAL_SET_NOT_RISK_RANK" as const, maximum_response_bytes: 1048576 as const },
    page, items, groups, capital_statements: included.flatMap(({ collected }) => statementOf(collected)),
    statement_scope: "AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS" as const,
    // A Fleet read names no subject, so no Score is selected here (the single-environment Fleet read says the same).
    scores: { raw: { value: null, status: "policy_pending" as const }, composition: { value: null, status: "policy_pending" as const },
      direct_nav: { value: null, status: "policy_pending" as const }, regime: { value: null, status: "unavailable" as const },
      reason_code: "RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED" as const, calculation_path: "PRECOMPUTED_ONLY" as const },
    funding_bucket_pnl: { value: null, reason_code: "LOT_ATTRIBUTION_METHOD_NOT_APPROVED" as const },
    lineage: { reducer_revision: "manager-model.v1" as const,
      source_set_ref: accessDigest(included.map(({ environment, collected }) => [environment, accessDigest(collected.facts.map(f => [f.fact_id, f.revision]).sort())])),
      revision: accessDigest(included.map(({ environment, collected }) => [environment, managerLineageRevision(collected.scope.fingerprint, collected.doc.revision)])),
      supersedes_revision: null },
  };
  if (Buffer.byteLength(JSON.stringify(response)) > 1048576) fail("EXECUTION_READ_SCOPE_LIMIT");
  return managerDatasetResponse.parse(canonicalizeManagerDatasetZero(response));
}
