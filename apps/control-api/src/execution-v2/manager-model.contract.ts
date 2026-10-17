import { z } from "zod";
import { utcMilliseconds, executionEnvironment, financialStage, exactDecimal, opaqueRevision } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";
import { managerScorePublication } from "./manager-score-publication.contract";
export { managerScorePublication } from "./manager-score-publication.contract";
import { managerCompositionPublication } from "./manager-composition-publication.contract";
export { managerCompositionPublication } from "./manager-composition-publication.contract";
import { managerRegimePublication } from "./manager-regime-publication.contract";
export { managerRegimePublication } from "./manager-regime-publication.contract";

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
export const MANAGER_SCALARS = {
  alpha_id: "TEXT", alpha_version_id: "TEXT", name: "TEXT", owner_user_id: "TEXT", portfolio_id: "TEXT",
  lifecycle: "TEXT", venue: "TEXT", health: "TEXT", source_state: "TEXT",
  allocation: "DECIMAL", net_pnl: "DECIMAL", unrealized_pnl: "DECIMAL", balance_total: "DECIMAL",
  equity_30d_end_value: "DECIMAL", return_30d_pct: "DECIMAL", score: "DECIMAL",
} as const;
export const managerScalar = z.enum(Object.keys(MANAGER_SCALARS) as [keyof typeof MANAGER_SCALARS, ...Array<keyof typeof MANAGER_SCALARS>]);
export const managerMoneyFields = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"] as const;
export const managerTuple = z.object({ alpha_id: text, alpha_version_id: text, portfolio_id: text,
  deployment_id: text, account_id: text }).strict();
export const managerPartition = z.object({ economic_domain: z.enum(["ACTUAL", "PAPER", "SANDBOX"]),
  currency: text, basis: text, native_profile_ref: text, domain_proof_ref: text }).strict();
export const managerQuality = z.object({ completeness: z.enum(["COMPLETE", "PARTIAL", "UNRESOLVED"]),
  freshness: z.enum(["FRESH", "STALE", "UNKNOWN"]), reasons: z.array(text).max(32) }).strict();
// A derived metric preserves the source reasons and adds bounded derivation
// reasons. Match Score publication's existing 64-reason envelope without
// widening the source/document admission envelope or silently truncating it.
const managerMetricQuality = managerQuality.extend({ reasons: z.array(text).max(64) }).strict();
export const managerMetric = z.object({ value: exactDecimal.nullable(), unit: text, currency: text.nullable(),
  basis: text, window: z.object({ from_ms: utcMilliseconds, to_ms: utcMilliseconds }).strict().nullable(),
  denominator: exactDecimal.nullable(), methodology_ref: text.nullable(),
  availability: z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"]), reason_code: text.nullable(),
  quality: managerMetricQuality, source_confidence: z.enum(["VERIFIED", "PROVISIONAL", "UNKNOWN"]),
  provenance_refs: z.array(text).min(1).max(32), calculation_revision: text, policy_revision: text }).strict()
  .superRefine((v, c) => {
    if ((v.availability === "AVAILABLE") !== (v.value !== null) || v.value === null && v.reason_code === null ||
      v.window !== null && v.window.from_ms >= v.window.to_ms ||
      v.unit === "MONEY" && v.currency === null)
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_METRIC_INCONSISTENT" });
  });
export const managerStatementFields = ["opening_economic_capital", "initial_funds", "added_funds", "returned_capital",
  "net_economic_assignments", "current_nav", "realized_pnl", "unrealized_pnl", "actual_fees", "pending_fees",
  "funding", "interest", "initial_budget", "current_budget", "topups_applied", "decreases_applied", "recall_applied",
  "pending_amount", "cancelled_amount", "locked_amount", "exposure_cap"] as const;
export const managerFact = z.object({ fact_id: text, revision: opaqueRevision, source_receipt_ref: text,
  tuple: managerTuple, partition: managerPartition, economic_account_ref: text,
  ownership_partition_ref: text, // Authoritative economic ownership, not a physical custody ID.
  kind: z.enum([...managerStatementFields, "allocation", "balance_total", "net_pnl", "equity_30d_end_value", "return_30d_pct"]),
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
  precomputed_scores: z.array(managerScorePublication).max(128).optional(),
  precomputed_compositions: z.array(managerCompositionPublication).max(128).optional(),
  precomputed_regimes: z.array(managerRegimePublication).max(128).optional(),
}).strict().superRefine((d, c) => {
  if (d.facts_through_ms !== null && d.facts_through_ms > d.as_of_ms || d.as_of_ms > d.observed_at_ms ||
    d.recorded_through_ms > d.observed_at_ms || d.members.some(m => m.valid_to_ms !== null && m.valid_to_ms <= m.valid_from_ms) ||
    d.facts.some(f => f.recorded_at_ms > d.recorded_through_ms || f.effective_at_ms > d.as_of_ms))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_CUTOFF_INVALID" });
});
const filter = z.object({ field: managerScalar, op: z.enum(["EQ", "GTE", "LTE", "IS_NULL"]), value: text.optional() }).strict();
export const managerModelQuery = z.object({ workspace_id: text.optional(), environment: executionEnvironment,
  stage_filter: z.array(financialStage).max(4).default([]), lifecycle_filter: text.optional(),
  filters: z.array(filter).max(16).default([]),
  sort: z.array(z.object({ field: managerScalar, direction: z.enum(["asc", "desc"]) }).strict()).min(1).max(3)
    .default([{ field: "name", direction: "asc" }]),
  group_by: z.array(z.enum(["portfolio_id", "owner_user_id", "alpha_id", "stage_presence", "venue", "health", "source_state", "lifecycle"])).max(2).default([]),
  economic_partition: managerPartition.optional(), limit: z.number().int().min(1).max(200).default(100),
  after: z.string().min(1).max(4096).optional(), before: z.string().min(1).max(4096).optional(),
}).strict().superRefine((q, c) => {
  if (q.after && q.before || new Set(q.sort.map(s => s.field)).size !== q.sort.length || new Set(q.group_by).size !== q.group_by.length)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_QUERY_INVALID" });
  for (const f of q.filters) {
    if (f.op === "IS_NULL" ? f.value !== undefined : f.value === undefined)
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_FILTER_INVALID" });
    if (f.value !== undefined && MANAGER_SCALARS[f.field] === "DECIMAL" && !exactDecimal.safeParse(f.value).success)
      c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_DECIMAL_FILTER_INVALID" });
  }
});
export type ManagerModelDocument = z.infer<typeof managerModelDocument>;
export type ManagerFact = z.infer<typeof managerFact>;
export type ManagerMetric = z.infer<typeof managerMetric>;
export type ManagerModelQuery = z.infer<typeof managerModelQuery>;
export type ManagerMember = z.infer<typeof managerMember>;

const metricMap = z.record(managerScalar, managerMetric);
const partitionMetrics = z.object({ partition: managerPartition, metrics: z.record(z.string(), managerMetric) }).strict();
export const managerDatasetRow = z.object({ row_key: z.string().min(1).max(2048), alpha_id: text, alpha_version_id: text, portfolio_id: text,
  name: text.nullable(), owner_user_id: text.nullable(), lifecycle: text.nullable(), venue: text.nullable(), health: text.nullable(), source_state: text.nullable(),
  stage_presence: z.array(financialStage).max(4),
  children: z.array(managerTuple.extend({ stage: financialStage, binding_ref: text.nullable() }).strict()).max(10_000),
  metrics: metricMap, economic_partitions: z.array(partitionMetrics).max(200) }).strict();
const scorePending = z.object({ value: exactDecimal.nullable(), status: z.enum(["policy_pending", "available", "provisional", "unbound", "invalid_data", "stale", "partial_costs", "partial_components", "insufficient_data"]) }).strict()
  .superRefine((v,c) => { if (["available","provisional"].includes(v.status) !== (v.value !== null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"MANAGER_SCORE_SUMMARY_INVALID"}); });
const compositionSummary = z.object({value:exactDecimal.nullable(),status:z.enum(["policy_pending","available","provisional",
  "partial_coverage","incomparable_basis","no_allocation","invalid_data"])}).strict().superRefine((v,c)=>{
  if(["available","provisional"].includes(v.status)!==(v.value!==null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"MANAGER_COMPOSITION_SUMMARY_INVALID"});
});
export const managerDatasetResponse = z.object({ schema_version: z.literal("portal.execution.manager-dataset.v1"),
  surface: z.enum(["FUND", "FLEET", "PORTFOLIO", "ALPHA", "ACCOUNT", "DEPLOYMENT"]), workspace_id: text,
  environment: executionEnvironment, record_authority: z.literal("PORTAL_PROJECTION"), source_authority: z.literal("TRADING_SYSTEM"),
  snapshot_id: publicationDigest, as_of_ms: utcMilliseconds, recorded_through_ms: utcMilliseconds, facts_through_ms: utcMilliseconds.nullable(),
  quality: managerQuality, coverage: z.literal("AUTHORIZED_ONLY"), economic_aggregation: z.literal("PARTITIONED_ONLY"),
  query_policy: z.object({ null_order: z.literal("LAST_BOTH_DIRECTIONS"), stage_order: z.literal("LEXICAL_SET_NOT_RISK_RANK"), maximum_response_bytes: z.literal(1048576) }).strict(),
  page: z.object({ limit: z.number().int().min(1).max(200), returned_count: z.number().int().min(0).max(200),
    authorized_filtered_count: z.number().int().min(0).max(10_000), next_cursor: z.string().max(4096).nullable(), previous_cursor: z.string().max(4096).nullable() }).strict(),
  items: z.array(managerDatasetRow).max(200), groups: z.array(z.object({ key: z.array(z.object({ field: text, value: text.nullable() }).strict()).max(2),
    unique_row_count: z.number().int().min(0).max(10_000), totals_scope: z.literal("FULL_AUTHORIZED_FILTERED_QUERY"), economic_partitions: z.array(partitionMetrics).max(200) }).strict()).max(200),
  capital_statements: z.array(partitionMetrics).max(200),
  statement_scope: z.literal("AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS"),
  scores: z.object({ raw: scorePending, composition: compositionSummary, direct_nav: scorePending,
    regime: z.object({ value: z.null(), status: z.enum(["unavailable", "supported", "weak_support", "out_of_support", "insufficient_data", "stale", "unbound"]),
      reason_code: z.enum(["REGIME_POLICY_SOURCE_OR_AUTHORIZED_SLICE_NOT_QUALIFIED", "REGIME_IS_PER_ALPHA_OR_DEPLOYMENT_ONLY"]).nullable().optional() }).strict(),
    reason_code: z.enum(["RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED", "QUALIFIED_PRECOMPUTED_SCORE"]), calculation_path: z.literal("PRECOMPUTED_ONLY") }).strict(),
  score_details: z.array(managerScorePublication).max(128).optional(),
  composition_details: z.array(managerCompositionPublication).max(128).optional(),
  regime_details: z.array(managerRegimePublication).max(128).optional(),
  funding_bucket_pnl: z.object({ value: z.null(), reason_code: z.literal("LOT_ATTRIBUTION_METHOD_NOT_APPROVED") }).strict(),
  lineage: z.object({ reducer_revision: z.literal("manager-model.v1"), source_set_ref: publicationDigest,
    revision: publicationDigest, supersedes_revision: publicationDigest.nullable() }).strict(),
}).strict();
