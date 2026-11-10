import { z } from "zod";
import { managerSearchText, managerSearchMode, managerWindowQuery, managerSelectedWindow,
  managerP1Options, managerWindowAbsenceReason, validateManagerP1Response } from "./manager-query-p1.contract";
import { utcMilliseconds, executionEnvironment, financialStage, exactDecimal, opaqueRevision } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";
import { validateManagerDatasetInvariants, validateManagerDisplayText, managerResponseDecimal } from "./manager-dataset-invariants";
import { managerScorePublication } from "./manager-score-publication.contract";
export { managerScorePublication } from "./manager-score-publication.contract";
import { managerCompositionPublication } from "./manager-composition-publication.contract";
export { managerCompositionPublication } from "./manager-composition-publication.contract";
import { managerRegimePublication } from "./manager-regime-publication.contract";
export { managerRegimePublication } from "./manager-regime-publication.contract";
import { managerStageLifecycleReasons, managerStageLifecyclePolicy, validateManagerLifecycle } from "./manager-lifecycle";
import { managerSeriesPublication, validateManagerSeriesPublications } from "./manager-series-publication.contract";
import { validateManagerAllScope, MANAGER_ALL_REASONS } from "./manager-all-scope";

// MD-S1 (DEBT-UXM07-004): the reader's display-safety rules are enforced when a dataset is EMITTED (manager-dataset-invariants.ts),
// never here: this document schema is also what original custody parses, and custody must keep accepted source identifier bytes
// exactly as the source sent them (ELP2-06: "retains actual-worker accepted original identifier bytes without normalization").
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
export const MANAGER_SCALARS = {
  alpha_id: "TEXT", alpha_version_id: "TEXT", name: "TEXT", owner_user_id: "TEXT", portfolio_id: "TEXT",
  lifecycle: "TEXT", venue: "TEXT", health: "TEXT", source_state: "TEXT", stage_presence: "TEXT", current_stage: "TEXT",
  allocation: "DECIMAL", net_pnl: "DECIMAL", unrealized_pnl: "DECIMAL", balance_total: "DECIMAL",
  equity_30d_end_value: "DECIMAL", return_30d_pct: "DECIMAL", score: "DECIMAL",
} as const;
export const managerScalar = z.enum(Object.keys(MANAGER_SCALARS) as [keyof typeof MANAGER_SCALARS, ...Array<keyof typeof MANAGER_SCALARS>]);
/** The fields a dataset can be grouped by (a group key names one of these, never any text). */
export const managerGroupField = z.enum(["portfolio_id", "owner_user_id", "alpha_id", "stage_presence", "current_stage", "venue", "health", "source_state", "lifecycle"]);
export const managerMoneyFields = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"] as const;
/** BE-B1: the two PERCENT figures of a row's economic partition that the Fleet table reads. They are NOT money (never in `managerMoneyFields`: that list
 * drives "an economic partition is required"), NOT scalars (not sortable: the row-level `metrics` map stays the closed seven-key enum) and are admitted
 * as source fact kinds so that a source that has them can publish them. Omitted from a partition when no fact states them (omission = Not published). */
export const managerPercentFields = ["max_drawdown_pct", "win_rate_pct"] as const;
export const managerTuple = z.object({ alpha_id: text, alpha_version_id: text, portfolio_id: text,
  deployment_id: text, account_id: text }).strict();
export const managerPartition = z.object({ economic_domain: z.enum(["ACTUAL", "PAPER", "SANDBOX"]),
  currency: text, basis: text, native_profile_ref: text, domain_proof_ref: text }).strict();
/** FE-CAT-3: `ALL` is NAVIGATION across separately authorized environments (Fleet only), never a consolidated money scope. */
export const managerEnvironmentScope = z.enum(["paper", "sandbox", "live", "ALL"]);
export const managerQuality = z.object({ completeness: z.enum(["COMPLETE", "PARTIAL", "UNRESOLVED"]),
  freshness: z.enum(["FRESH", "STALE", "UNKNOWN"]), reasons: z.array(text).max(32) }).strict();
// A derived metric preserves the source reasons and adds bounded derivation
// reasons. Match Score publication's existing 64-reason envelope without
// widening the source/document admission envelope or silently truncating it.
const managerMetricQuality = managerQuality.extend({ reasons: z.array(text).max(64) }).strict();
const managerMetricShape = (decimal: z.ZodString) => ({ value: decimal.nullable(), unit: text, currency: text.nullable(),
  basis: text, window: z.object({ from_ms: utcMilliseconds, to_ms: utcMilliseconds }).strict().nullable(),
  denominator: decimal.nullable(), methodology_ref: text.nullable(),
  availability: z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]), reason_code: text.nullable(),
  quality: managerMetricQuality, source_confidence: z.enum(["VERIFIED", "PROVISIONAL", "UNKNOWN"]),
  provenance_refs: z.array(text).min(1).max(32), calculation_revision: text, policy_revision: text });
const managerMetricConsistent = (v: { availability: string; value: string | null; reason_code: string | null;
  window: { from_ms: number; to_ms: number } | null; unit: string; currency: string | null }, c: z.RefinementCtx) => {
  if ((v.availability === "AVAILABLE") !== (v.value !== null) || v.value === null && v.reason_code === null ||
    v.window !== null && v.window.from_ms >= v.window.to_ms ||
    v.unit === "MONEY" && v.currency === null)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_METRIC_INCONSISTENT" });
};
/** A metric as ADMITTED from a source document (a fact). A source value may be "-0": admission is unchanged (MD-5). */
export const managerMetric = z.object(managerMetricShape(exactDecimal)).strict().superRefine(managerMetricConsistent);
/** A metric as EMITTED in the dataset response: canonical zero (MD-5), a signed zero is refused. */
/** `effective_at_ms` is optional and only on the EMITTED metric: the UTC time this figure took effect (a funding or return receipt, a budget approval, an allocation). Absent = not published, never inferred. */
export const managerResponseMetric = z.object({ ...managerMetricShape(managerResponseDecimal), effective_at_ms: utcMilliseconds.optional() }).strict().superRefine(managerMetricConsistent);
export const managerStatementFields = ["opening_economic_capital", "initial_funds", "added_funds", "returned_capital",
  "net_economic_assignments", "current_nav", "realized_pnl", "unrealized_pnl", "actual_fees", "pending_fees",
  "funding", "interest", "initial_budget", "current_budget", "topups_applied", "decreases_applied", "recall_applied",
  "pending_amount", "cancelled_amount", "locked_amount", "exposure_cap"] as const;
export const managerFact = z.object({ fact_id: text, revision: opaqueRevision, source_receipt_ref: text,
  tuple: managerTuple, partition: managerPartition, economic_account_ref: text,
  ownership_partition_ref: text, // Authoritative economic ownership, not a physical custody ID.
  kind: z.enum([...managerStatementFields, "allocation", "balance_total", "net_pnl", "equity_30d_end_value", "return_30d_pct", ...managerPercentFields]),
  metric: managerMetric, effective_at_ms: utcMilliseconds, recorded_at_ms: utcMilliseconds,
  classification: z.enum(["ECONOMIC", "BUDGET", "INTERNAL_TRANSFER", "CUSTODY"]),
  transfer_pair_ref: text.nullable(), counterpart_portfolio_id: text.nullable(),
}).strict();
export const managerMember = z.object({ tuple: managerTuple, stage: financialStage,
  name: text.nullable(), owner_user_id: text.nullable(), lifecycle: text.nullable(), venue: text.nullable(),
  health: text.nullable(), source_state: text.nullable(), binding_ref: text.nullable(),
  assignment_revision: text, owner_revision: text, binding_revision: text,
  valid_from_ms: utcMilliseconds, valid_to_ms: utcMilliseconds.nullable() }).strict();
/** Internal normalized projection input, not an ingestion HTTP body. No arbitrary source columns. */
export const managerModelDocument = z.object({ schema_version: z.literal("portal.execution.manager-model-input.v1"),
  workspace_id: text, environment: executionEnvironment, profile_id: text,
  qualification: z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]), family_id: z.literal("alpha_fleet_overview"),
  revision: opaqueRevision, supersedes_revision: opaqueRevision.nullable(),
  source_epoch: text, source_sequence: z.string().regex(/^(?:0|[1-9]\d{0,18})$(?![\s\S])/),
  projection_generation: text, catalogue_digest: publicationDigest,
  source_set_digest: publicationDigest, as_of_ms: utcMilliseconds, recorded_through_ms: utcMilliseconds,
  facts_through_ms: utcMilliseconds.nullable(), observed_at_ms: utcMilliseconds,
  source_quality: managerQuality, members: z.array(managerMember).max(10_000), facts: z.array(managerFact).max(20_000),
  stage_transitions: z.array(z.object({ alpha_id: text, alpha_version_id: text, portfolio_id: text,
    environment: executionEnvironment, stage: financialStage, entered_at_ms: utcMilliseconds,
    exited_at_ms: utcMilliseconds.nullable(), source_revision: opaqueRevision }).strict()).max(10_000).optional(),
  precomputed_scores: z.array(managerScorePublication).max(128).optional(),
  precomputed_compositions: z.array(managerCompositionPublication).max(128).optional(),
  precomputed_regimes: z.array(managerRegimePublication).max(128).optional(),
  // FE-013: NAV / Net PnL / Return series from the financial normalized source. Absent today (source MISSING); never computed here.
  precomputed_series: z.array(managerSeriesPublication).max(256).optional(),
}).strict().superRefine((d, c) => {
  if (d.facts_through_ms !== null && d.facts_through_ms > d.as_of_ms || d.as_of_ms > d.observed_at_ms ||
    d.recorded_through_ms > d.observed_at_ms || d.members.some(m => m.valid_to_ms !== null && m.valid_to_ms <= m.valid_from_ms) ||
    d.facts.some(f => f.recorded_at_ms > d.recorded_through_ms || f.effective_at_ms > d.as_of_ms))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_CUTOFF_INVALID" });
  const allowedStages = d.environment === "paper" ? ["PAPER"] : d.environment === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
  const stageMembers = new Set(d.members.map(m => JSON.stringify([m.tuple.alpha_id, m.tuple.alpha_version_id, m.tuple.portfolio_id, m.stage])));
  for (const t of d.stage_transitions ?? []) {
    if (t.source_revision !== d.revision || t.environment !== d.environment || !allowedStages.includes(t.stage) ||
      t.entered_at_ms > d.as_of_ms || t.exited_at_ms !== null && (t.exited_at_ms <= t.entered_at_ms || t.exited_at_ms > d.as_of_ms) ||
      !stageMembers.has(JSON.stringify([t.alpha_id, t.alpha_version_id, t.portfolio_id, t.stage])))
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_STAGE_TRANSITION_BINDING_INVALID" });
  }
  if (d.members.some(member => !allowedStages.includes(member.stage)))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_ENVIRONMENT_STAGE_MISMATCH" });
  validateManagerSeriesPublications(d, c);
});
const filter =z.object({ field: managerScalar, op: z.enum(["EQ", "GTE", "LTE", "IS_NULL", "IN"]),
  value: text.optional(), values: z.array(text).min(1).max(32).optional() }).strict();
/** WP-K slice 6: portfolio-grain (group) sort and filter on a published group metric. Additive: absent = the lexical group order of before. */
const groupMetricKey = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
export const managerGroupSort = z.object({ metric_key: groupMetricKey, direction: z.enum(["asc", "desc"]) }).strict();
export const managerGroupFilter = z.object({ metric_key: groupMetricKey, op: z.enum(["GTE", "LTE", "IS_NULL"]), value: text.optional() }).strict();
export const managerModelQuery = z.object({ workspace_id: text.optional(), environment: managerEnvironmentScope,
  q: managerSearchText.optional(), q_mode: managerSearchMode.optional(), window: managerWindowQuery.optional(),
  stage_filter: z.array(financialStage).max(4).default([]), lifecycle_filter: text.optional(),
  filters: z.array(filter).max(16).default([]),
  sort: z.array(z.object({ field: managerScalar, direction: z.enum(["asc", "desc"]) }).strict()).min(1).max(3)
    .default([{ field: "name", direction: "asc" }]),
  group_by: z.array(managerGroupField).max(2).default([]),
  group_sort: z.array(managerGroupSort).max(1).default([]), group_filters: z.array(managerGroupFilter).max(8).default([]),
  economic_partition: managerPartition.optional(), limit: z.number().int().min(1).max(200).default(100),
  after: z.string().min(1).max(4096).optional(), before: z.string().min(1).max(4096).optional(),
  group_limit: z.number().int().min(1).max(200).optional(),
  group_after: z.string().min(1).max(4096).optional(), group_before: z.string().min(1).max(4096).optional(),
}).strict().superRefine((q, c) => {
  if (q.q_mode !== undefined && q.q === undefined)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_SEARCH_QUERY_REQUIRED" });
  if (q.group_after && q.group_before || !q.group_by.length && (q.group_limit !== undefined || q.group_after || q.group_before))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_GROUP_QUERY_INVALID" });
  // ALL spans every environment: any stage word may narrow it (an environment without that stage then holds no row).
  const allowedStages = q.environment === "ALL" ? ["PAPER", "SANDBOX", "CANARY", "LIVE"] : q.environment === "paper" ? ["PAPER"] :
    q.environment === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
  if (q.stage_filter.some(stage => !allowedStages.includes(stage)))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_ENVIRONMENT_STAGE_QUERY_INVALID" });
  // A window resolves against ONE environment's cutoff; ALL has no common cutoff, so it carries none.
  if (q.environment === "ALL" && q.window !== undefined)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_ALL_WINDOW_UNSUPPORTED" });
  if (q.after && q.before || new Set(q.sort.map(s => s.field)).size !== q.sort.length || new Set(q.group_by).size !== q.group_by.length)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_QUERY_INVALID" });
  if ((q.group_sort.length || q.group_filters.length) && !q.group_by.length)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_GROUP_QUERY_REQUIRES_GROUP_BY" });
  if ((q.group_sort.length || q.group_filters.length) && q.environment === "ALL")
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_GROUP_QUERY_ALL_UNSUPPORTED" });
  for (const f of q.group_filters)
    if (f.op === "IS_NULL" ? f.value !== undefined : f.value === undefined || !exactDecimal.safeParse(f.value).success)
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_GROUP_FILTER_INVALID" });
  if (new Set(q.group_filters.map(f => `${f.metric_key}:${f.op}`)).size !== q.group_filters.length)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_GROUP_FILTER_DUPLICATE" });
  for (const f of q.filters) {
    if (f.op === "IN" ? f.value !== undefined || f.values === undefined :
      f.values !== undefined || (f.op === "IS_NULL" ? f.value !== undefined : f.value === undefined))
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_FILTER_INVALID" });
    if (f.values && new Set(f.values).size !== f.values.length)
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_FILTER_DUPLICATE_VALUES" });
    if (MANAGER_SCALARS[f.field] === "DECIMAL" &&
      [ ...(f.value === undefined ? [] : [f.value]), ...(f.values ?? []) ].some(v => !exactDecimal.safeParse(v).success))
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_DECIMAL_FILTER_INVALID" });
  }
});
export type ManagerModelDocument = z.infer<typeof managerModelDocument>;
export type ManagerFact = z.infer<typeof managerFact>;
export type ManagerMetric = z.infer<typeof managerMetric>;
export type ManagerModelQuery = z.infer<typeof managerModelQuery>;
export type ManagerMember = z.infer<typeof managerMember>;

const metricMap = z.record(z.enum([...managerMoneyFields, "return_30d_pct", "score"]), managerResponseMetric);
const partitionMetrics = z.object({ partition: managerPartition, metrics: z.record(z.string(), managerResponseMetric) }).strict();
export const managerDatasetRow = z.object({ row_key: z.string().min(1).max(2048), alpha_id: text, alpha_version_id: text, portfolio_id: text,
  name: text.nullable(), owner_user_id: text.nullable(), lifecycle: text.nullable(), venue: text.nullable(), health: text.nullable(), source_state: text.nullable(),
  stage_presence: z.array(financialStage).max(4),
  // FE-027/FE-012 scalars: sortable/groupable `current_stage`; the entry pair is a typed absence until a source states the transition.
  current_stage: financialStage.nullable(), entered_at_ms: utcMilliseconds.nullable(),
  days_in_stage: z.number().int().min(0).max(10_000_000).nullable(), stage_lifecycle_reasons: managerStageLifecycleReasons,
  // BE-B1: `allocation_effective_at_ms` is optional; the UTC time this deployment's allocation took effect, from the allocation fact(s) of exactly this tuple
  // when they all state ONE time. Absent = Not published (several different times, no allocation fact, or the field is not authorized): never inferred.
  children: z.array(managerTuple.extend({ stage: financialStage, binding_ref: text.nullable(), allocation_effective_at_ms: utcMilliseconds.optional() }).strict()).max(10_000),
  metrics: metricMap, economic_partitions: z.array(partitionMetrics).max(200),
  // FE-CAT-3: present exactly on the rows of an `environment: ALL` dataset (the row's own environment); absent otherwise.
  environment: executionEnvironment.optional() }).strict();
/** FE-CAT-3: what one environment contributed to an ALL read. A missing environment is typed, never silently absent. */
export const managerEnvironmentCoverage = z.object({ environment: executionEnvironment,
  availability: z.enum(["INCLUDED", "UNAVAILABLE"]), reason_code: z.enum(MANAGER_ALL_REASONS).nullable(),
  snapshot_id: publicationDigest.nullable(), as_of_ms: utcMilliseconds.nullable(), recorded_through_ms: utcMilliseconds.nullable(),
  facts_through_ms: utcMilliseconds.nullable(), quality: managerQuality.nullable(),
  authorized_filtered_count: z.number().int().min(0).max(10_000).nullable(), returned_count: z.number().int().min(0).max(200).nullable() }).strict();
const scorePending = z.object({ value: managerResponseDecimal.nullable(), status: z.enum(["policy_pending", "available", "provisional", "unbound", "invalid_data", "stale", "partial_costs", "partial_components", "insufficient_data", "window_not_published"]),
  reason_code: managerWindowAbsenceReason.optional() }).strict()
  .superRefine((v,c) => { if (["available","provisional"].includes(v.status) !== (v.value !== null))
      c.addIssue({code:z.ZodIssueCode.custom,message:"MANAGER_SCORE_SUMMARY_INVALID"});
    if ((v.status === "window_not_published") !== (v.reason_code !== undefined))
      c.addIssue({code:z.ZodIssueCode.custom,message:"MANAGER_SCORE_WINDOW_REASON_REQUIRED"}); });
const compositionSummary = z.object({value:managerResponseDecimal.nullable(),status:z.enum(["policy_pending","available","provisional",
  "partial_coverage","incomparable_basis","no_allocation","invalid_data","window_not_published"]),
  reason_code:managerWindowAbsenceReason.optional()}).strict().superRefine((v,c)=>{
  if(["available","provisional"].includes(v.status)!==(v.value!==null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"MANAGER_COMPOSITION_SUMMARY_INVALID"});
  if ((v.status === "window_not_published") !== (v.reason_code !== undefined))
    c.addIssue({code:z.ZodIssueCode.custom,message:"MANAGER_COMPOSITION_WINDOW_REASON_REQUIRED"});
});
export const managerDatasetResponse = z.object({ schema_version: z.literal("portal.execution.manager-dataset.v1"),
  // Additive fields; old requests retain their original financial semantics.
  selected_window: managerSelectedWindow.nullable(), query_options: managerP1Options,
  surface: z.enum(["FUND", "FLEET", "PORTFOLIO", "ALPHA", "ACCOUNT", "DEPLOYMENT"]), workspace_id: text,
  stage_lifecycle: managerStageLifecyclePolicy,
  environment: managerEnvironmentScope,
  // FE-CAT-3: exactly when `environment` is ALL: one entry per environment (paper, sandbox, live), in that order.
  environment_coverage: z.array(managerEnvironmentCoverage).length(3).optional(),
  record_authority: z.literal("PORTAL_PROJECTION"), source_authority: z.literal("TRADING_SYSTEM"),
  snapshot_id: publicationDigest, as_of_ms: utcMilliseconds, recorded_through_ms: utcMilliseconds, facts_through_ms: utcMilliseconds.nullable(),
  quality: managerQuality, coverage: z.literal("AUTHORIZED_ONLY"), economic_aggregation: z.literal("PARTITIONED_ONLY"),
  query_policy: z.object({ null_order: z.literal("LAST_BOTH_DIRECTIONS"), stage_order: z.literal("LEXICAL_SET_NOT_RISK_RANK"), maximum_response_bytes: z.literal(1048576) }).strict(),
  page: z.object({ limit: z.number().int().min(1).max(200), returned_count: z.number().int().min(0).max(200),
    authorized_filtered_count: z.number().int().min(0).max(10_000), next_cursor: z.string().max(4096).nullable(), previous_cursor: z.string().max(4096).nullable() }).strict(),
  group_page: z.object({ limit: z.number().int().min(1).max(200), returned_count: z.number().int().min(0).max(200),
    authorized_filtered_count: z.number().int().min(0).max(40_000), next_cursor: z.string().max(4096).nullable(), previous_cursor: z.string().max(4096).nullable() }).strict().optional(),
  items: z.array(managerDatasetRow).max(200), groups: z.array(z.object({ key: z.array(z.object({ field: managerGroupField, value: text.nullable() }).strict()).max(2),
    attribution: z.object({ alpha_id: text, name: text.nullable(), owner_user_id: text.nullable(),
      name_reason_code: z.enum(["GROUP_NAME_NOT_PUBLISHED", "GROUP_NAME_AMBIGUOUS"]).nullable(),
      owner_reason_code: z.enum(["GROUP_OWNER_NOT_PUBLISHED", "GROUP_OWNER_AMBIGUOUS"]).nullable() }).strict().optional(),
    unique_row_count: z.number().int().min(0).max(10_000), totals_scope: z.literal("FULL_AUTHORIZED_FILTERED_QUERY"), economic_partitions: z.array(partitionMetrics).max(200) }).strict()).max(200),
  // WP-K slice 6: present only when the query named a group sort or filter. `partition_basis` says which partition each group's metric was read in.
  group_query: z.object({ sort: z.array(managerGroupSort).max(1), filters: z.array(managerGroupFilter).max(8),
    partition_basis: z.enum(["PINNED_PARTITION", "SINGLE_PARTITION_ONLY"]),
    groups_before_filter: z.number().int().min(0).max(40_000), groups_returned: z.number().int().min(0).max(200) }).strict().optional(),
  capital_statements: z.array(partitionMetrics).max(200),
  statement_scope: z.literal("AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS"),
  scores: z.object({ raw: scorePending, composition: compositionSummary, direct_nav: scorePending,
    regime: z.object({ value: z.null(), status: z.enum(["unavailable", "supported", "weak_support", "out_of_support", "insufficient_data", "stale", "unbound"]),
      reason_code: z.enum(["REGIME_POLICY_SOURCE_OR_AUTHORIZED_SLICE_NOT_QUALIFIED", "REGIME_IS_PER_ALPHA_OR_DEPLOYMENT_ONLY"]).nullable().optional() }).strict(),
    reason_code: z.enum(["RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED", "QUALIFIED_PRECOMPUTED_SCORE", "EXACT_METRIC_WINDOW_NOT_PUBLISHED", "ALL_HISTORY_WINDOW_NOT_PUBLISHED"]), calculation_path: z.literal("PRECOMPUTED_ONLY") }).strict(),
  score_details: z.array(managerScorePublication).max(128).optional(),
  composition_details: z.array(managerCompositionPublication).max(128).optional(),
  regime_details: z.array(managerRegimePublication).max(128).optional(),
  funding_bucket_pnl: z.object({ value: z.null(), reason_code: z.literal("LOT_ATTRIBUTION_METHOD_NOT_APPROVED") }).strict(),
  lineage: z.object({ reducer_revision: z.literal("manager-model.v1"), source_set_ref: publicationDigest,
    revision: publicationDigest, supersedes_revision: publicationDigest.nullable() }).strict(),
}).strict().superRefine(validateManagerAllScope).superRefine(validateManagerP1Response).superRefine(validateManagerLifecycle).superRefine(validateManagerDatasetInvariants).superRefine(validateManagerDisplayText);
