/**
 * BE-P4 / FE-013 + FE-033: the pure read side of the Manager series.
 *
 * Select-only, like the Score selector: it never computes, repairs, rebases or
 * sums a series. A subject gets a series iff exactly one stored publication
 * binds to (subject, metric, authorized population, stages, economic
 * partition, exact window, this document's revision). Everything else is a
 * typed UNAVAILABLE with the reason it is.
 *
 * Authority precedes search: current scope, field policy and the full
 * accounting population are checked BEFORE any publication is looked at, so the
 * reason a hidden subject gets never depends on what exists behind it.
 */
import { accessDigest } from "./access-policy";
import { projectionRowVisible } from "./read-projection";
import { assertExecutionReadScope, ExecutionReadScopeError, scopeAllowsField, scopeAllowsFullAccountingPopulation, scopeReadPopulation,
  type AuthorizedExecutionReadScope } from "./read-scope";
import { resolveManagerWindow } from "./manager-query-p1";
import { canonicalizeManagerSeriesZero } from "./manager-dataset-invariants";
import { managerModelDocument, type ManagerMember, type ManagerModelDocument } from "./manager-model.contract";
import { managerScorePopulationDigest } from "./manager-score-publication";
import { managerSeriesQuery, managerSeriesResponse, deriveSeriesComparison, SERIES_EMPTY_REASON,
  type ManagerSeriesEntry, type ManagerSeriesQuery } from "./manager-series.contract";
import { SERIES_METRIC_FIELD, seriesStagesFor, type ManagerSeriesPublication } from "./manager-series-publication.contract";

const fail = (code: ConstructorParameters<typeof ExecutionReadScopeError>[0], status = 503): never => { throw new ExecutionReadScopeError(code, status); };
type Subject = ManagerSeriesQuery["subjects"][number];
export interface SeriesSubjectScope { subject: Subject; scope: AuthorizedExecutionReadScope; }

const unavailable = (subject: ManagerSeriesEntry["subject"], reason: ManagerSeriesEntry["reason_code"]): ManagerSeriesEntry => ({
  subject, state: "UNAVAILABLE", reason_code: reason, partition: null, unit: null, currency: null, ratio_scale: null, basis: null, methodology_ref: null,
  window: null, points: [], gaps: [], quality: { completeness: "UNRESOLVED", freshness: "UNKNOWN", reasons: [reason!] },
  source_confidence: "UNKNOWN", provenance_refs: ["SOURCE_NOT_PUBLISHED"], calculation_revision: "manager-series.v1", policy_revision: "NOT_PUBLISHED" });

const subjectKey = (s: Subject, workspaceId: string) => s.subject_type === "FUND" ? { subject_type: "FUND" as const, subject_id: workspaceId } :
  { subject_type: "PORTFOLIO" as const, subject_id: s.subject_id! };

function entryFor(input: SeriesSubjectScope, doc: ManagerModelDocument, query: ManagerSeriesQuery,
  window: { from_ms: number; to_ms: number } | null): ManagerSeriesEntry {
  const { scope, subject } = input, id = subjectKey(subject, scope.workspaceId);
  const portfolioId = subject.subject_type === "PORTFOLIO" ? subject.subject_id : undefined;
  // 1. Authority first. One reason for "not allowed to see this as a whole", whatever the cause.
  const fields = [SERIES_METRIC_FIELD[query.metric], "currency", "provenance_ref"];
  if (!fields.every(field => scopeAllowsField(scope, field)) || !scopeAllowsFullAccountingPopulation(scope, portfolioId))
    return unavailable(id, "SERIES_SCOPE_NOT_AUTHORIZED");
  const members: ManagerMember[] = doc.members.filter(m => m.valid_from_ms <= doc.as_of_ms && (m.valid_to_ms === null || m.valid_to_ms > doc.as_of_ms) &&
    projectionRowVisible(scope, m.tuple) && (portfolioId === undefined || m.tuple.portfolio_id === portfolioId));
  if (!members.length) return unavailable(id, "SUBJECT_HAS_NO_ACTIVE_MEMBERS");
  // 2. Then the source: nothing published, or published but not qualified, is not a series.
  if (doc.precomputed_series === undefined) return unavailable(id, "SERIES_SOURCE_NOT_PUBLISHED");
  if (doc.qualification !== "SOURCE_VERIFIED" || doc.source_quality.freshness !== "FRESH" || doc.source_quality.completeness !== "COMPLETE")
    return unavailable(id, "SOURCE_NOT_QUALIFIED");
  if (window === null) return unavailable(id, "ALL_HISTORY_WINDOW_NOT_PUBLISHED");
  const population = managerScorePopulationDigest(members), stages = seriesStagesFor(scope.environment);
  const subjectType = subject.subject_type === "FUND" ? "manager_book" : "portfolio";
  const candidates = doc.precomputed_series.filter(p => {
    const b = p.binding, v = p.provenance;
    return b.subject_type === subjectType && b.subject_id === id.subject_id && b.metric === query.metric &&
      b.tuple_population_digest === population && accessDigest([...b.stage_filter].sort()) === accessDigest([...stages].sort()) &&
      b.window_end_ms <= doc.as_of_ms && v.source_as_of_ms === doc.as_of_ms && v.scope.workspace_id === doc.workspace_id &&
      v.scope.environment === doc.environment && v.scope.profile_id === doc.profile_id && v.scope.catalogue_digest === doc.catalogue_digest &&
      v.source_revision === doc.revision && v.source_set_digest === doc.source_set_digest;
  });
  if (!candidates.length) return unavailable(id, "SERIES_SOURCE_NOT_PUBLISHED");
  const wanted = query.economic_partition ? accessDigest(query.economic_partition) : null;
  const inPartition = candidates.filter(p => wanted === null || accessDigest(p.binding.partition) === wanted);
  if (!inPartition.length) return unavailable(id, "SERIES_SOURCE_NOT_PUBLISHED");
  if (wanted === null && new Set(inPartition.map(p => accessDigest(p.binding.partition))).size > 1)
    return unavailable(id, "ECONOMIC_PARTITION_REQUIRED");
  const exact = inPartition.filter(p => p.binding.window_start_ms === window.from_ms && p.binding.window_end_ms === window.to_ms);
  if (!exact.length) return unavailable(id, "EXACT_METRIC_WINDOW_NOT_PUBLISHED");
  if (exact.length > 1) return unavailable(id, "AMBIGUOUS_SERIES_PUBLICATION");
  // FE-013: a ratio whose scale the source does not state is a typed absence, never a number the reader must guess the meaning of.
  if (exact[0].series.unit === "RATIO" && exact[0].series.ratio_scale === null) return unavailable(id, "RATIO_SCALE_NOT_PUBLISHED");
  return servedEntry(id, exact[0]);
}

function servedEntry(id: ManagerSeriesEntry["subject"], p: ManagerSeriesPublication): ManagerSeriesEntry {
  const b = p.binding;
  return { subject: id, state: p.series.points.length ? "AVAILABLE" : "EMPTY", reason_code: p.series.points.length ? null : SERIES_EMPTY_REASON,
    partition: b.partition, unit: p.series.unit, currency: p.series.currency, ratio_scale: p.series.ratio_scale, basis: p.series.basis, methodology_ref: p.series.methodology_ref,
    window: { from_ms: b.window_start_ms, to_ms: b.window_end_ms }, points: p.series.points.map(x => ({ ...x })), gaps: p.series.gaps.map(x => ({ ...x })),
    quality: { ...p.quality, reasons: [...p.quality.reasons] }, source_confidence: p.source_confidence,
    provenance_refs: [p.provenance.input_digest], calculation_revision: p.provenance.calculation_revision, policy_revision: p.provenance.policy_revision };
}

/** Bounded read-side query. Requires `scopes.deliverScopedTogether` at the service boundary. */
export function queryManagerSeries(inputs: readonly SeriesSubjectScope[], input: unknown, rawQuery: unknown) {
  if (!inputs.length) fail("EXECUTION_READ_SCOPE_REQUIRED");
  const doc = managerModelDocument.parse(input), query = managerSeriesQuery.parse(rawQuery);
  if (inputs.length !== query.subjects.length) fail("EXECUTION_READ_SCOPE_REQUIRED");
  const first = inputs[0].scope;
  for (const { scope } of inputs) {
    assertExecutionReadScope(scope);
    if (scope.mode !== "SCOPED_V2") fail("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED");
    if (doc.workspace_id !== scope.workspaceId || doc.environment !== scope.environment || doc.profile_id !== scope.profileId ||
      query.environment !== scope.environment || query.workspace_id && query.workspace_id !== scope.workspaceId ||
      scope.workspaceId !== first.workspaceId) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
    const binding = scopeReadPopulation(scope).binding;
    if (!binding || binding.dataset_id !== doc.family_id || binding.source_revision !== doc.revision ||
      binding.projection_generation !== doc.projection_generation || binding.catalogue_revision !== doc.catalogue_digest)
      fail("EXECUTION_READ_ACCESS_CHANGED", 409);
  }
  const selectedWindow = resolveManagerWindow(doc.as_of_ms, query.window)!;
  const series = inputs.map((input, index) => {
    if (JSON.stringify(input.subject) !== JSON.stringify(query.subjects[index])) fail("EXECUTION_READ_SCOPE_REQUIRED");
    return entryFor(input, doc, query, selectedWindow.resolved);
  });
  const response = { schema_version: "portal.execution.manager-series.v1" as const, workspace_id: first.workspaceId,
    environment: first.environment, record_authority: "PORTAL_PROJECTION" as const, source_authority: "TRADING_SYSTEM" as const,
    metric: query.metric, selected_window: selectedWindow,
    series_source: doc.precomputed_series === undefined ?
      { state: "NOT_PUBLISHED" as const, reason_code: "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED" as const } :
      { state: "PUBLISHED" as const, reason_code: null },
    as_of_ms: doc.as_of_ms, recorded_through_ms: doc.recorded_through_ms, quality: doc.source_quality, series,
    comparison: deriveSeriesComparison(series),
    lineage: { reducer_revision: "manager-series.v1" as const, source_set_ref: doc.source_set_digest,
      revision: accessDigest({ scopes: inputs.map(i => i.scope.fingerprint).sort(), source: doc.revision }) } };
  if (Buffer.byteLength(JSON.stringify(response)) > 1048576) fail("EXECUTION_READ_SCOPE_LIMIT");
  // MD-5: canonical zero on emit, exactly once, before the response parse (which then refuses any signed zero left).
  return managerSeriesResponse.parse(canonicalizeManagerSeriesZero(response));
}
