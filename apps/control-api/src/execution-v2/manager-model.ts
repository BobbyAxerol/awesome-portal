import { accessDigest } from "./access-policy";
import { assertExecutionReadScope, ExecutionReadScopeError, scopeAllowsField, scopeReadPopulation, scopeAllowsFullAccountingPopulation,
  type AuthorizedExecutionReadScope } from "./read-scope";
import { projectionRowVisible } from "./read-projection";
import { KeysetCursorCodec } from "../query/cursor";
import { sumExactDecimals } from "../research/exact-decimal";
import { selectManagerScorePublications, type ManagerScoreReadFence } from "./manager-score-publication";
import { selectManagerCompositionPublications,type ManagerCompositionReadFence } from "./manager-composition-publication";
import { managerModelDocument, managerModelQuery, managerDatasetResponse, MANAGER_SCALARS, managerMoneyFields, managerStatementFields,
  type ManagerMember, type ManagerFact, type ManagerMetric, type ManagerModelDocument, type ManagerModelQuery } from "./manager-model.contract";

export type ManagerSurface = "FUND" | "FLEET" | "PORTFOLIO" | "ALPHA" | "ACCOUNT" | "DEPLOYMENT";
const fail = (code: ConstructorParameters<typeof ExecutionReadScopeError>[0], status = 503): never => { throw new ExecutionReadScopeError(code, status); };
export const managerRowKey = (m: ManagerMember) => JSON.stringify([m.tuple.alpha_id, m.tuple.alpha_version_id, m.tuple.portfolio_id]);
const tupleKey = (m: ManagerMember["tuple"]) => JSON.stringify([m.alpha_id, m.alpha_version_id, m.portfolio_id, m.deployment_id, m.account_id]);
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
const fieldPolicy = (field: string) => ({ stage_presence: "stage", source_state: "freshness",
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
  children: Array<ManagerMember["tuple"] & { stage: ManagerMember["stage"]; binding_ref: string | null }>;
  metrics: Record<string, ManagerMetric>;
  economic_partitions: Array<{ partition: ManagerFact["partition"]; metrics: Record<string, ManagerMetric> }>;
}
/** A safe scalar may be filtered/ordered only if it is declared and permitted.
 * Financial query keys must pin a common economic partition; ALL is never money.
 * A caller cannot change the score denominator via a Fleet filter. */
function validateQuery(scope: AuthorizedExecutionReadScope, query: ManagerModelQuery) {
  const fields = [...query.sort.map(s => s.field), ...query.filters.map(f => f.field), ...query.group_by];
  if (query.stage_filter.length) fields.push("stage_presence");
  if (query.lifecycle_filter !== undefined) fields.push("lifecycle");
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
function economicFacts(facts: ManagerFact[]) {
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
function partitions(facts: ManagerFact[], keys: readonly string[], expectedTuples: Set<string>) {
  const groups = new Map<string, ManagerFact[]>(), rawGroups = new Map<string, ManagerFact[]>();
  const knownTuples = new Set<string>();
  for (const f of facts.filter(f => f.classification !== "CUSTODY")) {
    const key = managerPartitionKey(f.partition), rows = rawGroups.get(key) ?? [];
    rows.push(f); rawGroups.set(key, rows); knownTuples.add(tupleKey(f.tuple));
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
    const expected = new Set([...unknownTuples, ...raw.map(f => tupleKey(f.tuple))]);
    const metricValues = Object.fromEntries(keys.map(key => {
      const value = sumMetric(rows.filter(f => f.kind === key));
      const covered = new Set(raw.filter(f => f.kind === key).map(f => tupleKey(f.tuple)));
      return [key, value.value !== null && [...expected].some(tuple => !covered.has(tuple))
        ? absent("SOURCE_FACT_CENSUS_INCOMPLETE", value) : value];
    }));
    return { partition: rows[0].partition, metrics: metricValues };
  });
}
const DEFAULT_METRICS = [...managerMoneyFields, "return_30d_pct", "score"];
const nullableConsensus = (values: Array<string | null>) => new Set(values).size === 1 ? values[0] : null;
function rowsFor(members: ManagerMember[], facts: ManagerFact[], query: ManagerModelQuery, scope: AuthorizedExecutionReadScope) {
  const groups = new Map<string, ManagerMember[]>();
  const byTuple = new Map<string, ManagerFact[]>();
  for (const fact of facts) { const key = tupleKey(fact.tuple), rows = byTuple.get(key) ?? []; rows.push(fact); byTuple.set(key, rows); }
  for (const member of members) { const key = managerRowKey(member), rows = groups.get(key) ?? []; rows.push(member); groups.set(key, rows); }
  return [...groups].map(([row_key, group]): ManagerDatasetRow => {
    const keys = new Set(group.map(m => tupleKey(m.tuple)));
    const ownFacts = [...keys].flatMap(key => byTuple.get(key) ?? []);
    const economic_partitions = partitions(ownFacts, DEFAULT_METRICS.filter(f => scopeAllowsField(scope, fieldPolicy(f))), keys);
    const selected = query.economic_partition ? economic_partitions.find(p => managerPartitionKey(p.partition) === managerPartitionKey(query.economic_partition!)) :
      economic_partitions.length === 1 ? economic_partitions[0] : undefined;
    const metricValues = Object.fromEntries(DEFAULT_METRICS.filter(f => scopeAllowsField(scope, fieldPolicy(f))).map(key => [key,
      key === "score" ? absent("RUNTIME_SCORE_POLICY_NOT_APPROVED") : selected?.metrics[key] ?? absent(economic_partitions.length > 1 ? "MIXED_ECONOMIC_DOMAINS" : "SOURCE_FACTS_NOT_PUBLISHED")]));
    const identity = group[0].tuple;
    return { row_key, alpha_id: identity.alpha_id, alpha_version_id: identity.alpha_version_id, portfolio_id: identity.portfolio_id,
      name: scopeAllowsField(scope, "name") ? nullableConsensus(group.map(m => m.name)) : null,
      owner_user_id: scopeAllowsField(scope, "owner_user_id") ? nullableConsensus(group.map(m => m.owner_user_id)) : null,
      lifecycle: scopeAllowsField(scope, "lifecycle") ? nullableConsensus(group.map(m => m.lifecycle)) : null,
      venue: scopeAllowsField(scope, "venue") ? nullableConsensus(group.map(m => m.venue)) : null,
      health: scopeAllowsField(scope, "health") ? nullableConsensus(group.map(m => m.health)) : null,
      source_state: scopeAllowsField(scope, "freshness") ? nullableConsensus(group.map(m => m.source_state)) : null,
      stage_presence: scopeAllowsField(scope, "stage") ? [...new Set(group.map(m => m.stage))].sort() : [],
      children: group.map(m => ({ ...m.tuple, stage: m.stage, binding_ref: scopeAllowsField(scope, "binding_id") ? m.binding_ref : null })),
      metrics: metricValues, economic_partitions };
  });
}
const scalar = (row: ManagerDatasetRow, field: keyof typeof MANAGER_SCALARS): string | null =>
  field in row.metrics ? row.metrics[field].value : (row as unknown as Record<string, string | null>)[field] ?? null;
function filtered(row: ManagerDatasetRow, q: ManagerModelQuery) {
  if (q.stage_filter.length && !q.stage_filter.some(stage => row.stage_presence.includes(stage))) return false;
  if (q.lifecycle_filter && row.lifecycle !== q.lifecycle_filter) return false;
  return q.filters.every(f => {
    const value = scalar(row, f.field);
    if (f.op === "IS_NULL") return value === null;
    if (value === null) return false;
    const compare = MANAGER_SCALARS[f.field] === "DECIMAL" ? compareManagerDecimals(value, f.value!) : lexical(value, f.value!);
    return f.op === "EQ" ? compare === 0 : f.op === "GTE" ? compare >= 0 : compare <= 0;
  });
}
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
export function queryManagerModel(scope: AuthorizedExecutionReadScope, input: unknown, rawQuery: unknown,
  codec: KeysetCursorCodec, surface: ManagerSurface = "FLEET", resourceId?: string, scoreFence?: ManagerScoreReadFence,
  compositionFence?:ManagerCompositionReadFence) {
  assertExecutionReadScope(scope);
  if (scope.mode !== "SCOPED_V2") fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
  const doc = managerModelDocument.parse(input), query = managerModelQuery.parse(rawQuery);
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
  const members = doc.members.filter(m => m.valid_from_ms <= doc.as_of_ms && (m.valid_to_ms === null || m.valid_to_ms > doc.as_of_ms) &&
    (!query.stage_filter.length || query.stage_filter.includes(m.stage)) && projectionRowVisible(scope, m.tuple) && selected(m));
  const memberKeys = new Set(members.map(m => tupleKey(m.tuple)));
  const facts = dedupeManagerFacts(doc.facts.filter(f => memberKeys.has(tupleKey(f.tuple)) && projectionRowVisible(scope, f.tuple) &&
    scopeAllowsField(scope, fieldPolicy(f.kind))));
  if (facts.length && ["currency", "profile_id", "provenance_ref"].some(field => !scopeAllowsField(scope, field)))
    fail("EXECUTION_READ_FIELD_POLICY_PENDING");
  const allRows = rowsFor(members, facts, query, scope);
  // No score computation on this read path. Exact authorized population and
  // economic partition must match a separately precomputed, current-policy result.
  if (scopeAllowsField(scope, "score")) for (const row of allRows) {
    const rowMembers = members.filter(m => managerRowKey(m) === row.row_key);
    const partition = query.economic_partition ?? (row.economic_partitions.length === 1 ? row.economic_partitions[0].partition : null);
    if (!partition) continue;
    const values = selectManagerScorePublications(doc, rowMembers, { type: "alpha", id: row.alpha_id }, accessDigest(partition), scoreFence)
      .filter(s => s.slot === "RAW");
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
  const details = scopeAllowsField(scope,"score") && subjectType && partitionsForScore.length === 1 ?
    selectManagerScorePublications(doc,members,{type:subjectType,id:resourceId ?? scope.workspaceId},
      query.economic_partition ? accessDigest(query.economic_partition) : partitionsForScore[0],scoreFence) : [];
  const summary = (slot:"RAW"|"DIRECT_NAV") => {
    const s = details.filter(s => s.slot === slot);
    return s.length === 1 ? {value:s[0].quality.value,status:s[0].quality.status} :
      {value:null,status:"policy_pending" as const};
  };
  const compositionPartition=query.economic_partition?accessDigest(query.economic_partition):
    partitionsForScore.length===1?partitionsForScore[0]:null;
  const selectedStages=query.stage_filter.length?query.stage_filter:
    scope.environment==="paper"?["PAPER" as const]:scope.environment==="sandbox"?["SANDBOX" as const]:["CANARY" as const,"LIVE" as const];
  // These complete accounting outputs must never leak through researcher fields,
  // visible-subset totals, table filters or pagination. Direct NAV stays separate.
  const compositions=(surface==="FUND"||surface==="PORTFOLIO")&&compositionPartition!==null&&
    ["score","allocation","balance_total","currency","provenance_ref"].every(field=>scopeAllowsField(scope,field))&&
    scopeAllowsFullAccountingPopulation(scope,surface==="PORTFOLIO"?resourceId:undefined)?
    selectManagerCompositionPublications(doc,members,{type:surface==="FUND"?"manager_book":"portfolio",id:resourceId??scope.workspaceId},
      selectedStages,compositionPartition,compositionFence):[];
  const rows = allRows.filter(row => filtered(row, query));
  rows.sort((a, b) => {
    for (const order of query.sort) {
      const x = scalar(a, order.field), y = scalar(b, order.field);
      if (x === null || y === null) { if (x !== y) return x === null ? 1 : -1; continue; }
      const c = MANAGER_SCALARS[order.field] === "DECIMAL" ? compareManagerDecimals(x, y) : lexical(x, y);
      if (c) return c * (order.direction === "asc" ? 1 : -1);
    }
    return lexical(a.row_key, b.row_key);
  });
  const queryId = accessDigest({ scope: scope.fingerprint, source: doc.revision, generation: doc.projection_generation,
    surface, resourceId: resourceId ?? null, scores:accessDigest({details,compositions,rows:allRows.map(r => r.metrics.score)}),
    query: { ...query, after: undefined, before: undefined } });
  const cursorContext = { resourceId: `manager-model:${surface}`, workspaceId: scope.workspaceId, queryFingerprint: queryId };
  const encode = (row: ManagerDatasetRow, direction: "after" | "before") => codec.encode({ resource_id: cursorContext.resourceId,
    workspace_id: scope.workspaceId, query_fingerprint: queryId, direction, boundary: [row.row_key] });
  let start = 0, end = rows.length;
  const token = query.after ?? query.before;
  if (token) {
    const [boundary] = codec.decode(token, { ...cursorContext, direction: query.before ? "before" : "after", boundarySize: 1 });
    const index = rows.findIndex(row => row.row_key === boundary);
    if (index < 0) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
    if (query.before) { end = index; start = Math.max(0, end - query.limit); } else start = index + 1;
  }
  const items = rows.slice(start, Math.min(end, start + query.limit));
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
  const groupOutput = [...groupMap].sort(([a], [b]) => lexical(a, b)).map(([, group]) => {
    const keys = new Set(group.rows.map(r => r.row_key));
    const tuples = new Set(members.filter(m => keys.has(managerRowKey(m))).map(m => tupleKey(m.tuple)));
    return { key: group.key, unique_row_count: group.rows.length, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY" as const,
      economic_partitions: partitions(facts.filter(f => tuples.has(tupleKey(f.tuple))), managerMoneyFields.filter(f => scopeAllowsField(scope, f)), tuples) };
  });
  const statementFacts = rootFlows(facts, surface);
  const statement = partitions(statementFacts, managerStatementFields.filter(f => scopeAllowsField(scope, f)), memberKeys);
  const response = { schema_version: "portal.execution.manager-dataset.v1" as const, surface, workspace_id: scope.workspaceId,
    environment: scope.environment, record_authority: "PORTAL_PROJECTION" as const, source_authority: "TRADING_SYSTEM" as const,
    snapshot_id: accessDigest({ scope: scope.fingerprint, queryId, rows }),
    as_of_ms: doc.as_of_ms, recorded_through_ms: doc.recorded_through_ms, facts_through_ms: doc.facts_through_ms,
    quality: doc.source_quality, coverage: "AUTHORIZED_ONLY" as const, economic_aggregation: "PARTITIONED_ONLY" as const,
    query_policy: { null_order: "LAST_BOTH_DIRECTIONS" as const, stage_order: "LEXICAL_SET_NOT_RISK_RANK" as const, maximum_response_bytes: 1048576 as const },
    page: { limit: query.limit, returned_count: items.length, authorized_filtered_count: rows.length,
      next_cursor: start + items.length < rows.length && items.length ? encode(items.at(-1)!, "after") : null,
      previous_cursor: start > 0 && items.length ? encode(items[0], "before") : null },
    items, groups: groupOutput, capital_statements: statement,
    statement_scope: "AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS" as const,
    scores: { raw: summary("RAW"), composition: compositions.length===1?
      {value:compositions[0].result.value,status:compositions[0].result.status}:{ value: null, status: "policy_pending" as const },
      direct_nav: summary("DIRECT_NAV"), regime: { value: null, status: "unavailable" as const },
      reason_code: details.some(s => s.quality.value !== null)||compositions.some(s=>s.result.value!==null) ? "QUALIFIED_PRECOMPUTED_SCORE" as const : "RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED" as const,
      calculation_path: "PRECOMPUTED_ONLY" as const },
    ...(doc.precomputed_scores !== undefined ? {score_details:details} : {}),
    ...(doc.precomputed_compositions!==undefined?{composition_details:compositions}:{}),
    funding_bucket_pnl: { value: null, reason_code: "LOT_ATTRIBUTION_METHOD_NOT_APPROVED" as const },
    lineage: { reducer_revision: "manager-model.v1" as const, source_set_ref: accessDigest(facts.map(f => [f.fact_id, f.revision]).sort()),
      revision: accessDigest({ scope: scope.fingerprint, source: doc.revision }), supersedes_revision: doc.supersedes_revision ? accessDigest({ scope: scope.fingerprint, source: doc.supersedes_revision }) : null },
  };
  if (Buffer.byteLength(JSON.stringify(response)) > 1048576) fail("EXECUTION_READ_SCOPE_LIMIT");
  return managerDatasetResponse.parse(response);
}
