/** Native IS optimization custody; not the scalar Walk-forward ledger. */
import { z } from "zod";
import { NativeOptimizationSchema } from "./native-route.contract";
import { sha256ResearchJson } from "./preflight.service";
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
export const NativeMetricSchema = z.object({ value: Decimal.nullable(),
  availability: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: z.string().max(160).nullable() }).strict(),
}).strict().superRefine((v,c) => {
  if ((v.value !== null) !== (v.availability.state === "AVAILABLE")
    || (v.value !== null) !== (v.availability.reason_code === null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"Native metric absence disagrees with its value"});
});
export const NativeTrialSchema = z.object({
  source_ordinal: z.number().int().min(0).max(399),
  trial_number: z.number().int().min(0).max(399),
  trial_ordinal: z.number().int().min(1).max(400),
  scope: z.literal("NATIVE_IS_STUDY"),
  state: z.enum(["COMPLETE", "PRUNED", "FAIL", "WAITING", "RUNNING"]),
  parameters: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/), Decimal),
  objective: NativeMetricSchema,
  metrics: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/), NativeMetricSchema),
  selected: z.boolean(),
}).strict();
export const NativeSelectionEvidenceSchema=z.object({
  selector:z.literal("robust_plateau"),objective_index:z.literal(0),
  medoid_trial_number:z.number().int().min(0).max(399),cluster_center_trial:z.number().int().min(0).max(399),
  top_trials:z.number().int().min(1).max(400),feasible_trials:z.number().int().min(1).max(400),
  neighbor_count:z.number().int().min(1).max(400),min_neighbor_count:z.number().int().min(1).max(400),
  seed_consensus:z.number().int().nonnegative(),seed_consensus_count:z.number().int().nonnegative(),
  top_quantile:Decimal,neighborhood_radius:Decimal,plateau_score:Decimal,median_objective:Decimal,worst_objective:Decimal,objective_std:Decimal,
  param_names:z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/)).max(32),
  fallback_reasons:z.array(z.string().max(160)).max(16),
}).strict();
export const NativeCustodySchema = z.object({
  schema_version: z.literal("research.native-read-custody.v2"),
  workspace_id: Id, run_id: Id, artifact_id: Id, artifact_revision: z.number().int().positive(),
  manifest_digest: Digest, requested_spec_digest: Digest, effective_spec_digest: Digest, dataset_binding_digest: Digest,
  execution_profile_id: Id, execution_profile_digest: Digest,
  engine_version: z.enum(["1.1.0", "1.1.1"]),
  summary: NativeOptimizationSchema,
  source_parts: z.array(z.object({ ordinal:z.number().int().positive(),sha256:Digest,rows:z.number().int().positive(),
    bytes:z.number().int().positive().max(8*1024*1024) }).strict()).min(1).max(4),
  trials: z.array(NativeTrialSchema).min(1).max(400),
  selected_parameters_digest: Digest,
  selection_evidence:NativeSelectionEvidenceSchema.nullable(),
  verification_scope: z.literal("P05_MANIFEST_ALL_PARTS_AND_DOCUMENTS_AT_PREPARATION"),
}).strict().superRefine((v,c) => {
  const rows=v.trials,s=v.summary,selected=rows.filter(r=>r.selected);
  if(rows.length!==s.retained_trials || rows.some((r,i)=>r.source_ordinal!==i || r.trial_ordinal!==r.trial_number+1)
    || new Set(rows.map(r=>r.trial_number)).size!==rows.length
    || rows.filter(r=>r.state==="COMPLETE").length!==s.completed_trials
    || v.source_parts.reduce((n,p)=>n+p.rows,0)!==rows.length
    || v.source_parts.some((p,i)=>p.ordinal!==i+1)
    || v.selection_evidence!==null&&v.selection_evidence.medoid_trial_number!==s.selected_trial_number
    || v.selection_evidence!==null&&(v.selection_evidence.feasible_trials>s.completed_trials
      ||v.selection_evidence.top_trials>v.selection_evidence.feasible_trials
      ||v.selection_evidence.neighbor_count>v.selection_evidence.top_trials
      ||!rows.some(r=>r.trial_number===v.selection_evidence!.cluster_center_trial&&r.state==="COMPLETE"))
    || selected.length!==1 || selected[0]!.state!=="COMPLETE" || selected[0]!.trial_number!==s.selected_trial_number
    || selected[0]!.objective.value!==s.selected_objective
    || sha256ResearchJson(selected[0]!.parameters)!==sha256ResearchJson(s.selected_parameters)
    || v.selected_parameters_digest!==sha256ResearchJson(s.selected_parameters)
    || new Set(rows.map(r=>sha256ResearchJson(r.parameters))).size!==s.distinct_parameter_sets
    || rows.some(r=>r.state!=="COMPLETE"&&(r.objective.value!==null||Object.values(r.metrics).some(m=>m.value!==null))))
    c.addIssue({code:z.ZodIssueCode.custom,message:"Native custody population/selection/digest disagrees"});
  if(Buffer.byteLength(JSON.stringify(v))>240*1024)
    c.addIssue({code:z.ZodIssueCode.custom,message:"Native custody exceeds local read-model budget"});
});
export type NativeCustody = z.infer<typeof NativeCustodySchema>;
export const NativeSearchSchema = z.object({
  schema_version:z.literal("research.native-search.v1"),
  authority:z.literal("SEALED_PINNED_QUANTBT_NATIVE_IS_OPTIMIZATION"),
  revision:Digest, summary:NativeOptimizationSchema,
  selected_trial_number:z.number().int().nonnegative().max(399),
  selected_trial_ordinal:z.number().int().positive().max(400), selected_trial_scope:z.literal("NATIVE_IS_STUDY"),
  selected_parameters_digest:Digest,
  ledger:z.object({ total:z.number().int().min(1).max(400), rows:z.array(NativeTrialSchema).min(1).max(200),
    next_cursor:z.string().max(4096).nullable() }).strict(),
  candidates:z.object({ population:z.literal("COMPLETE_NATIVE_TRIAL_EVALUATIONS_NOT_SCALAR_WFO_POOL"),
    total:z.number().int().min(1).max(400), plateau_membership:z.literal("NOT_PUBLISHED"),
    plateau_membership_reason_code:z.literal("NATIVE_SOURCE_DID_NOT_RETAIN_NEIGHBOR_TRIAL_IDENTITIES") }).strict(),
  selection_process:z.object({ method:z.literal("QUANTBT_GENERIC_ROBUST_PLATEAU_NOT_SCALAR_WFO_V1"),
    retained_source_metadata:NativeSelectionEvidenceSchema.nullable(),
    metadata_reason_code:z.literal("NATIVE_SOURCE_SELECTION_METADATA_NOT_RETAINED").nullable(),
    objective:z.literal("IS_SHARPE"), training_scope:z.literal("P08_WARMUP_PLUS_IS_ONLY"), holdout_used:z.literal(false),
    evidence:z.literal("ENGINE_MEDOID_IDENTITY_MATCHES_RETAINED_TRIAL_AND_PARAMETERS"),
    sampler_trace:z.object({state:z.literal("NOT_PUBLISHED"),reason_code:z.literal("NATIVE_SAMPLER_INTERNAL_TRACE_NOT_RETAINED")}).strict(),
  }).strict(),
}).strict();
export const NativeFreezeSchema = z.object({schema_version:z.literal("research.native-freeze.v1"),
  selection_evidence:NativeSelectionEvidenceSchema.nullable().optional(),
  authority:z.literal("SEALED_NATIVE_SELECTED_PARAMETERS_NOT_SCALAR_WFO_CERTIFICATE"),revision:Digest,
  selected_parameters:z.record(Decimal),selected_parameters_digest:Digest,
  selected_trial_number:z.number().int().nonnegative().max(399),selected_trial_ordinal:z.number().int().positive().max(400),
  selected_trial_scope:z.literal("NATIVE_IS_STUDY"),selected_objective:Decimal,
  execution_profile:z.object({id:Id,digest:Digest}).strict(),
  artifact:z.object({revision:z.number().int().positive(),manifest_digest:Digest,source_parts:NativeCustodySchema.innerType().shape.source_parts,
    source_table_digest:Digest,source_table_digest_scope:z.literal("ORIGINAL_CHILD_PARQUET_BYTES_NOT_REWRITTEN_P05_PARTS")}).strict(),
  integrity:z.object({state:z.literal("MATCH_AT_PREPARATION"),verification_scope:z.literal("P05_MANIFEST_ALL_PARTS_AND_DOCUMENTS_AT_PREPARATION"),
    checked_at_utc_ms:z.number().int().nonnegative(),current_bytes_rechecked:z.literal(false),
    selected_identity_match:z.literal(true),selected_parameter_digest_match:z.literal(true)}).strict(),
  scalar_wfo_certificate:z.object({state:z.literal("NOT_APPLICABLE"),reason_code:z.literal("NATIVE_PROTOCOL_IS_NOT_SCALAR_WFO")}).strict(),
  chronology:z.object({state:z.literal("NOT_PUBLISHED"),reason_code:z.literal("NATIVE_SOURCE_DID_NOT_RETAIN_FREEZE_WALL_CLOCK_EVENTS")}).strict(),
}).strict();
export type NativeSearch = z.infer<typeof NativeSearchSchema>;
export type NativeFreeze = z.infer<typeof NativeFreezeSchema>;
