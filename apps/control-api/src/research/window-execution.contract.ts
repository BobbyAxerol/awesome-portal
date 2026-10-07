/** Source-backed completed windows and native engine audit, never broker replay. */
import { z } from "zod";
import { sha256ResearchJson } from "./preflight.service";

const Id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const Digest=z.string().regex(/^[a-f0-9]{64}$/);
const Ms=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Count=z.number().int().nonnegative().max(200_000);
const Decimal=z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Token=z.string().min(1).max(160).regex(/^[^\x00-\x1f]+$/);
const Reason=z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
export const WindowKindSchema=z.enum(["IS","OOS","HOLDOUT","FULL_SAMPLE"]);
const Availability=z.object({state:z.enum(["AVAILABLE","NOT_PUBLISHED","NOT_APPLICABLE"]),reason_code:Reason.nullable()}).strict()
  .refine(v=>(v.state==="AVAILABLE")===(v.reason_code===null),"Availability requires a consistent reason");
const Fact=z.object({state:z.enum(["AVAILABLE","NOT_PUBLISHED","NOT_APPLICABLE"]),reason_code:Reason.nullable(),
  value:Decimal.nullable(),origin:z.enum(["ENGINE_DIRECT","PORTAL_DERIVED"]),scope:WindowKindSchema,
  input_digest:Digest,source_ref:z.literal("FULL_RETAINED_WINDOW_ACCOUNT_V1")}).strict()
  .refine(v=>(v.state==="AVAILABLE")===(v.value!==null)&&(v.state==="AVAILABLE")===(v.reason_code===null),"Fact availability mismatch");
const Curve=z.array(z.object({at_utc_ms:Ms,value:Decimal}).strict()).max(64);
const Head={state:z.enum(["AVAILABLE","NOT_PUBLISHED","NOT_APPLICABLE"]),reason_code:Reason.nullable(),origin:z.literal("PORTAL_DERIVED")};
export const WindowAnalyticsSchema=z.object({
  schema_version:z.literal("research.window-analytics.v1"),window:WindowKindSchema,fold_id:Id.nullable(),basis:z.literal("ALL_TIME"),
  input_digest:Digest,observation_count:Count.min(2),start_utc_ms:Ms,end_exclusive_utc_ms:Ms,
  first_observed_utc_ms:Ms,last_observed_utc_ms:Ms,
  metrics:z.object(Object.fromEntries(["sharpe","sortino","cagr_fraction","profit_factor","long_hit_rate_fraction",
    "short_hit_rate_fraction","volatility_fraction","skew","excess_kurtosis","beta","correlation","benchmark_return_fraction",
    "max_drawdown_duration_days","sharpe_decay","exposure_long_fraction","exposure_short_fraction","exposure_flat_fraction",
    "win_rate","payoff_ratio","average_hold_seconds","max_consecutive_losses","turnover_notional",
    "return_fraction","max_drawdown_fraction","trade_count"].map(k=>[k,Fact]))).strict(),
  curves:z.object({sampling:z.object({source_observation_count:Count,emitted_point_count:Count.max(64),method:z.literal("EXTREMA_BUCKET_V1")}).strict(),
    strategy_rebased_100:Curve,benchmark_rebased_100:Curve,drawdown_fraction:Curve}).strict(),
  monthly_returns:z.object({...Head,includes_partial_months:z.literal(true),sampling:z.enum(["FULL","TAIL_WINDOW_V1"]),
    total_period_count:Count,omitted_transport_period_count:Count,
    definition_id:z.literal("WINDOW_MONTH_CLOSE_OVER_FIRST_WINDOW_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1"),
    values:z.array(z.object({month_start_utc_ms:Ms,return_fraction:Decimal,observation_count:Count.positive(),
      expected_observation_count:Count.positive(),partial:z.boolean(),basis:z.enum(["FIRST_WINDOW_CLOSE","PREVIOUS_OBSERVED_MONTH_CLOSE"]),
      base_at_utc_ms:Ms,close_at_utc_ms:Ms}).strict()).max(120)}).strict(),
  return_distribution:z.object({...Head,sampling:z.literal("UTC_DAY"),observation_count:Count,
    bucket_basis:z.literal("ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1"),
    statistics_policy:z.object({quantile_method:z.literal("LINEAR_TYPE_7"),probability:z.literal("0.95"),
      risk_variable:z.literal("LOSS_FRACTION_NEGATIVE_RETURN"),risk_sign:z.literal("SIGNED_LOSS_FRACTION"),
      tail:z.literal("LOSS_GTE_VAR_INCLUSIVE"),minimum_observations:z.literal(2)}).strict(),
    buckets:z.array(z.object({lower_inclusive:Decimal,upper:Decimal,upper_inclusive:z.enum(["true","false"]),count:Count}).strict()).max(12)}).strict(),
  drawdown_episodes:z.object({...Head,total:Count,open_episode_present:z.boolean(),longest_open:z.boolean(),
    values:z.array(z.object({start_utc_ms:Ms,trough_utc_ms:Ms,recovery_utc_ms:Ms.nullable(),depth_fraction:Decimal,
      duration_seconds:Ms,label:z.string().max(96).optional()}).strict()).max(10)}).strict(),
}).strict().superRefine((v,c)=>{
  const bad=(message:string)=>c.addIssue({code:z.ZodIssueCode.custom,message});
  if(v.start_utc_ms>v.first_observed_utc_ms||v.first_observed_utc_ms>=v.last_observed_utc_ms||v.last_observed_utc_ms>=v.end_exclusive_utc_ms
    ||Object.values(v.metrics).some(f=>f.scope!==v.window||f.input_digest!==v.input_digest)
    ||Buffer.byteLength(JSON.stringify(v))>65_536)bad("Window analytics scope/digest/budget mismatch");
  for(const curve of [v.curves.strategy_rebased_100,v.curves.benchmark_rebased_100,v.curves.drawdown_fraction])
    if(curve.some((p,i)=>p.at_utc_ms<v.first_observed_utc_ms||p.at_utc_ms>v.last_observed_utc_ms||i>0&&p.at_utc_ms<=curve[i-1]!.at_utc_ms))bad("Window curve chronology mismatch");
  if(v.curves.sampling.source_observation_count!==v.observation_count||v.curves.sampling.emitted_point_count!==v.curves.strategy_rebased_100.length
    ||v.monthly_returns.total_period_count!==v.monthly_returns.values.length+v.monthly_returns.omitted_transport_period_count
    ||v.return_distribution.state==="AVAILABLE"&&v.return_distribution.buckets.reduce((n,b)=>n+b.count,0)!==v.return_distribution.observation_count)bad("Window analytics population mismatch");
});
const numericNames=["qty","price","trigger_price","fee","remaining_qty","filled_qty","stop_price","take_profit_price",
  "avg_entry","avg_exit","realized_pnl","fees","working_qty","working_price","working_trigger_price","fill_qty","fill_price","fill_fee"] as const;
const tokenNames=["order_id","target_order_id","parent_order_id","group_id","oco_group_id","trade_id","symbol","side","order_type",
  "tif","activation_policy","tag","action","status","event_name","reason_code","exit_reason","liquidity","campaign_id","cycle_id","level_id","reject_code","lifecycle_event_kind","lifecycle_order_status"] as const;
const timeNames=["timestamp_utc_ms","activated_at_utc_ms","cancelled_at_utc_ms","filled_at_utc_ms","expires_at_utc_ms",
  "opened_at_utc_ms","closed_at_utc_ms"] as const;
export const NativeExecutionRecordSchema=z.object({record_kind:z.enum(["ORDER","FILL","TRADE","COMMAND","ORDER_REPORT","LIFECYCLE"]),
  source_relation:z.enum(["result.orders","result.fills","result.trades","metadata.fills_report","metadata.command_report","metadata.order_report","metadata.lifecycle_event_report_v1"]),
  source_ordinal:Count,execution_route:z.enum(["intrabar_bracket","reactive","event_driven"]),
  ...Object.fromEntries(numericNames.map(k=>[k,Decimal.nullable()])),...Object.fromEntries(tokenNames.map(k=>[k,Token.nullable()])),
  ...Object.fromEntries(timeNames.map(k=>[k,Ms.nullable()])),bar_index:Count.nullable(),source_sequence:Count.nullable(),
  reduce_only:z.boolean().nullable(),active:z.boolean().nullable(),waiting_parent:z.boolean().nullable(),
  missing_fields:z.record(z.enum([...numericNames,...tokenNames,...timeNames,"bar_index","source_sequence","reduce_only","active","waiting_parent"]),z.literal("SOURCE_FIELD_NOT_PUBLISHED")),
}).strict().superRefine((v,c)=>{
  const row=v as Record<string,unknown>;
  if([...numericNames,...tokenNames,...timeNames,"bar_index","source_sequence","reduce_only","active","waiting_parent"].some(k=>(row[k]===null)!==Object.hasOwn(v.missing_fields,k)))
    c.addIssue({code:z.ZodIssueCode.custom,message:"Execution missing-field disclosure mismatch"});
});
const Observation=z.object({equity:Decimal,return_fraction:Decimal,drawdown_fraction:Decimal,accepted_position:Decimal,
  signal_target:Decimal.nullable(),candle:z.object({open:Decimal,high:Decimal,low:Decimal,close:Decimal,volume:Decimal.nullable()}).strict().nullable(),
  fee:Decimal.nullable(),funding:Decimal.nullable(),turnover:Decimal.nullable(),active_stop:Decimal.nullable(),active_take_profit:Decimal.nullable()}).strict();
const Envelope={source_ordinal:Count,window:WindowKindSchema,fold_id:Id.nullable(),at_utc_ms:Ms.nullable()};
export const WindowExecutionRowSchema=z.discriminatedUnion("kind",[
  z.object({...Envelope,kind:z.literal("OBSERVATION"),at_utc_ms:Ms,payload:Observation}).strict(),
  z.object({...Envelope,kind:z.literal("ANALYTICS"),at_utc_ms:z.null(),payload:WindowAnalyticsSchema}).strict(),
  z.object({...Envelope,kind:z.literal("EXECUTION"),at_utc_ms:Ms,payload:NativeExecutionRecordSchema}).strict(),
]);
export const WindowDescriptorSchema=z.object({window:WindowKindSchema,fold_id:Id.nullable(),availability:Availability,
  start_utc_ms:Ms.nullable(),end_exclusive_utc_ms:Ms.nullable(),observation_count:Count.nullable(),
  authority:z.enum(["FROZEN_PARAMETER_POST_SELECTION_ACCOUNT","FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC","FOLD_TRAINING_ACCOUNT","RETAINED_OOS_ACCOUNT","RETAINED_NATIVE_ACCOUNT","NO_INDEPENDENT_HOLDOUT"]),
}).strict().refine(v=>(v.availability.state==="AVAILABLE") === (v.start_utc_ms!==null&&v.end_exclusive_utc_ms!==null&&v.observation_count!==null)
  &&(v.start_utc_ms===null||v.start_utc_ms<v.end_exclusive_utc_ms!),"Window availability/bounds/count mismatch");
export const WindowExecutionSourceSchema=z.object({schema_version:z.literal("research.window-execution-source.v1"),
  protocol:z.enum(["three_window_decay","advanced_walk_forward","full_sample"]),execution_route:Id,row_count:Count,rows_digest:Digest,
  counts:z.object({OBSERVATION:Count,ANALYTICS:Count.max(33),EXECUTION:Count}).strict(),windows:z.array(WindowDescriptorSchema).max(33),
  execution_availability:z.record(z.enum(["ORDER","FILL","TRADE","COMMAND","ORDER_REPORT","LIFECYCLE"]),Availability).optional(),
  authority:z.literal("COMPLETED_RETAINED_ACCOUNT_AND_ENGINE_AUDIT_NOT_BROKER_HISTORY")}).strict().refine(v=>Object.values(v.counts).reduce((a,b)=>a+b,0)===v.row_count
    &&new Set(v.windows.map(w=>`${w.window}:${w.fold_id}`)).size===v.windows.length
    &&!(v.protocol==="advanced_walk_forward"&&v.windows.some(w=>w.window==="HOLDOUT"&&w.availability.state==="AVAILABLE")),"Source count/unique scope/protocol mismatch");
export const WindowExecutionManifestSchema=z.object({schema_version:z.literal("research.window-execution-manifest.v1"),workspace_id:Id,run_id:Id,
  artifact_id:Id,artifact_revision:z.number().int().positive(),manifest_digest:Digest,requested_spec_digest:Digest,effective_spec_digest:Digest,
  dataset_binding_digest:Digest,execution_profile_id:Id,execution_profile_digest:Digest.nullable(),source:WindowExecutionSourceSchema}).strict();
const Proof=z.string().min(2).max(262_144);
const Fence={workspace_id:Id,run_id:Id,job_id:Id,worker_attempt_id:Id,lease_epoch:z.number().int().positive(),
  manifest:WindowExecutionManifestSchema,companion_digest:Digest,artifact_manifest_json:Proof,source_document_json:Proof};
function envelope(v:{manifest:z.infer<typeof WindowExecutionManifestSchema>;companion_digest:string;workspace_id:string;run_id:string}) {
  return v.companion_digest===sha256ResearchJson(v.manifest)&&v.workspace_id===v.manifest.workspace_id&&v.run_id===v.manifest.run_id
    &&Buffer.byteLength(JSON.stringify(v))<=1_000_000;
}
export const WindowExecutionBatchSchema=z.object({...Fence,schema_version:z.literal("research.window-execution-batch.v1"),
  batch_ordinal:Count,start_ordinal:Count,batch_digest:Digest,rows:z.array(WindowExecutionRowSchema).min(1).max(200)}).strict()
  .refine(v=>envelope(v)&&sha256ResearchJson(v.rows)===v.batch_digest&&v.rows.every((r,i)=>r.source_ordinal===v.start_ordinal+i)
    &&v.start_ordinal+v.rows.length<=v.manifest.source.row_count,"Batch scope/digest/ordinal/byte mismatch");
export const WindowExecutionSealSchema=z.object({...Fence,schema_version:z.literal("research.window-execution-seal.v1")}).strict().refine(envelope,"Seal scope/digest mismatch");
export const WindowExecutionQuerySchema=z.object({workspace_id:Id.optional(),window:WindowKindSchema.default("OOS"),fold_id:Id.optional(),
  limit:z.coerce.number().int().min(1).max(200).default(100),cursor:z.string().min(1).max(4096).optional(),
  at_utc_ms:z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),record_kind:z.enum(["ORDER","FILL","TRADE","COMMAND","ORDER_REPORT","LIFECYCLE"]).optional()}).strict();
export const WindowExecutionPageSchema=z.object({schema_version:z.literal("research.window-execution-page.v1"),run_id:Id,
  availability:Availability,revision:Digest.nullable(),window:WindowKindSchema,fold_id:Id.nullable(),
  descriptor:WindowDescriptorSchema.nullable(),counts:z.object({matching:Count.nullable(),returned:Count.max(200)}).strict(),
  rows:z.array(WindowExecutionRowSchema).max(200),next_cursor:z.string().max(4096).nullable(),
  authority:z.literal("COMPLETED_RETAINED_ACCOUNT_AND_ENGINE_AUDIT_NOT_BROKER_HISTORY")}).strict()
  .refine(v=>v.counts.returned===v.rows.length&&v.rows.every(r=>r.window===v.window&&r.fold_id===v.fold_id)
    &&(v.availability.state==="AVAILABLE"||v.rows.length===0&&v.next_cursor===null),"Page scope/availability mismatch");
export type WindowExecutionManifest=z.infer<typeof WindowExecutionManifestSchema>;
export type WindowExecutionRow=z.infer<typeof WindowExecutionRowSchema>;
export type WindowExecutionQuery=z.infer<typeof WindowExecutionQuerySchema>;
export type WindowExecutionBatch=z.infer<typeof WindowExecutionBatchSchema>;
export type WindowExecutionSeal=z.infer<typeof WindowExecutionSealSchema>;
