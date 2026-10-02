/** Fresh fixed OOS market/account custody, never an execution ledger. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { P04_FIXED_QUALIFICATION_PROFILE_ID } from "./delta-wfo.profile";
import { IMPORTED_ALPHA_PROFILE_ID, IMPORTED_ALPHA_PROFILE_DIGEST } from "./imported-alpha.profile";
import { isVnObservedFixedProfile } from "./vn-observed-fixed.profile";
import { sha256ResearchJson } from "./preflight.service";

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Utc = z.number().int().nonnegative().max(8_640_000_000_000_000);
const DecimalPattern=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const Decimal = z.string().regex(DecimalPattern).max(96);
function compareDecimal(left:string,right:string) {
  if(left.length>96 || right.length>96 || !DecimalPattern.test(left) || !DecimalPattern.test(right)) return NaN;
  const a=left.split("."),b=right.split("."),scale=Math.max(a[1]?.length ?? 0,b[1]?.length ?? 0);
  const units=(parts:string[])=>BigInt(`${parts[0]}${(parts[1] ?? "").padEnd(scale,"0")}`);
  const x=units(a),y=units(b);return x<y ? -1 : x>y ? 1 : 0;
}
export const FIXED_REPLAY_MAX_ROWS = 20_000;
export const FIXED_REPLAY_BATCH_ROWS = 200;
export const FIXED_REPLAY_MAX_WIRE_BYTES = 1_048_576;
export const FIXED_REPLAY_SCOPE = "FIXED_OOS_RETAINED_MARKET_AND_ACCOUNT_NOT_EXECUTION_LEDGER" as const;
export function isFixedReplayProfile(id: string, digest: string | null) {
  return id === P04_FIXED_QUALIFICATION_PROFILE_ID && digest === null
    || id === IMPORTED_ALPHA_PROFILE_ID && digest === IMPORTED_ALPHA_PROFILE_DIGEST
    || isVnObservedFixedProfile(id, digest);
}
export const FixedReplayCompanionRowSchema = z.object({
  source_ordinal:z.number().int().min(0).max(FIXED_REPLAY_MAX_ROWS-1), at_utc_ms:Utc,
  open:Decimal, high:Decimal, low:Decimal, close:Decimal, volume:Decimal,
  equity:Decimal, return_fraction:Decimal, drawdown_fraction:Decimal,
  positions:z.record(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/),Decimal)
    .describe("ENGINE_NATIVE_SYMBOL keys (including DEFAULT), not broker/instrument identity; never relabeled to market_symbol."),
}).strict().refine(r => Object.keys(r.positions).length >= 1 && Object.keys(r.positions).length <= 16
  && compareDecimal(r.volume,"0")>=0 && compareDecimal(r.equity,"0")>0
  && compareDecimal(r.drawdown_fraction,"-1")>=0 && compareDecimal(r.drawdown_fraction,"0")<=0
  && [r.open,r.high,r.low,r.close].every(v=>compareDecimal(v,"0")>0)
  && [r.open,r.low,r.close].every(v=>compareDecimal(r.high,v)>=0)
  && [r.open,r.high,r.close].every(v=>compareDecimal(r.low,v)<=0)
  && Buffer.byteLength(JSON.stringify(r))<=4096,"Bounded actual per-bar market/account observation required");
export type FixedReplayCompanionRow = z.infer<typeof FixedReplayCompanionRowSchema>;
const FixedReplayAvailableSourceSchema = z.object({
  schema_version:z.literal("research.fixed-replay-source.v1"),state:z.literal("AVAILABLE"),reason_code:z.null(),
  file_name:z.literal("fixed-replay.parquet"),file_sha256:Digest,byte_count:z.number().int().min(1).max(2_097_152),
  normalized_rows_sha256:Digest,row_count:z.number().int().min(1).max(FIXED_REPLAY_MAX_ROWS),
  oos_start_utc_ms:Utc,oos_end_exclusive_utc_ms:Utc,first_observed_utc_ms:Utc,last_observed_utc_ms:Utc,
}).strict().refine(s=>s.oos_start_utc_ms<=s.first_observed_utc_ms && s.first_observed_utc_ms<=s.last_observed_utc_ms
  && s.last_observed_utc_ms<s.oos_end_exclusive_utc_ms,"Exact half-open OOS source bounds required");
export const FixedReplayAbsenceReasonSchema = z.enum(["FIXED_REPLAY_ROW_LIMIT_EXCEEDED","FIXED_REPLAY_FILE_LIMIT_EXCEEDED",
  "FIXED_REPLAY_MARKET_FIELDS_UNAVAILABLE","FIXED_REPLAY_SOURCE_UNAVAILABLE"]);
const FixedReplayAbsentSourceSchema = z.object({schema_version:z.literal("research.fixed-replay-source.v1"),
  state:z.literal("NOT_PUBLISHED"),reason_code:FixedReplayAbsenceReasonSchema,oos_start_utc_ms:Utc,oos_end_exclusive_utc_ms:Utc,
}).strict().refine(s=>s.oos_end_exclusive_utc_ms>s.oos_start_utc_ms,"Exact OOS source bounds required");
export const FixedReplaySourceSchema = z.union([FixedReplayAvailableSourceSchema,FixedReplayAbsentSourceSchema]);
export const FixedReplayCompanionManifestSchema = z.object({
  schema_version:z.literal("research.fixed-replay-companion-manifest.v1"),workspace_id:Id,run_id:Id,artifact_id:Id,
  artifact_revision:z.number().int().min(1).max(2_147_483_647),manifest_digest:Digest,
  requested_spec_digest:Digest,effective_spec_digest:Digest,dataset_binding_digest:Digest,
  market_symbol:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/),
  execution_profile_id:Id,execution_profile_digest:Digest.nullable(),source:FixedReplaySourceSchema,
  scope:z.literal(FIXED_REPLAY_SCOPE),
}).strict().refine(m=>isFixedReplayProfile(m.execution_profile_id,m.execution_profile_digest),"Exact admitted fixed/imported profile required");
export type FixedReplayCompanionManifest = z.infer<typeof FixedReplayCompanionManifestSchema>;
const Proof = z.string().min(2).refine(s=>Buffer.byteLength(s,"utf8")<=196_608,"Bounded exact P05 document bytes required");
const Fence = z.object({workspace_id:Id,run_id:Id,job_id:Id,worker_attempt_id:Id,
  lease_epoch:z.number().int().min(1).max(2_147_483_647),artifact_id:Id,artifact_revision:z.number().int().min(1).max(2_147_483_647),
  manifest_digest:Digest,companion_digest:Digest,manifest:FixedReplayCompanionManifestSchema,
  artifact_manifest_json:Proof,run_receipt_json:Proof}).strict();
function envelope(v:z.infer<typeof Fence>) {
  return v.companion_digest===sha256ResearchJson(v.manifest)
    && ["workspace_id","run_id","artifact_id","artifact_revision","manifest_digest"].every(k=>
      v[k as keyof typeof v]===v.manifest[k as keyof FixedReplayCompanionManifest])
    && Buffer.byteLength(JSON.stringify(v))<=FIXED_REPLAY_MAX_WIRE_BYTES;
}
export const FixedReplayCompanionBatchIngressSchema = Fence.extend({
  schema_version:z.literal("research.fixed-replay-companion-batch.v1"),batch_ordinal:z.number().int().min(0).max(99),
  batch_digest:Digest,rows:z.array(FixedReplayCompanionRowSchema).min(1).max(FIXED_REPLAY_BATCH_ROWS),
}).strict().refine(v=>v.manifest.source.state==="AVAILABLE" && envelope(v) && v.batch_digest===sha256ResearchJson(v.rows)
  && v.rows.length===Math.min(200,v.manifest.source.row_count-v.batch_ordinal*200)
  && v.rows.every((r,i)=>r.source_ordinal===v.batch_ordinal*200+i
    && r.at_utc_ms>=v.manifest.source.oos_start_utc_ms && r.at_utc_ms<v.manifest.source.oos_end_exclusive_utc_ms
    && (i===0 || r.at_utc_ms>v.rows[i-1]!.at_utc_ms)),"Replay batch count/ordinal/chronology/digest binding mismatch");
export const FixedReplayCompanionSealIngressSchema = Fence.extend({schema_version:z.literal("research.fixed-replay-companion-seal.v1")})
  .strict().refine(envelope,"Replay seal binding mismatch");
export type FixedReplayCompanionBatchIngress = z.infer<typeof FixedReplayCompanionBatchIngressSchema>;
export type FixedReplayCompanionSealIngress = z.infer<typeof FixedReplayCompanionSealIngressSchema>;
export const FixedReplayCompanionQuerySchema = z.object({workspace_id:Id.optional(),
  source_ordinal:z.coerce.number().int().min(0).max(FIXED_REPLAY_MAX_ROWS-1).optional(),
  limit:z.coerce.number().int().min(1).max(200).default(100),cursor:z.string().min(1).max(4096).optional(),
}).strict().refine(v=>!(v.cursor && v.source_ordinal!==undefined),"Exact ordinal and cursor are mutually exclusive");
export type FixedReplayCompanionQuery = z.infer<typeof FixedReplayCompanionQuerySchema>;
export const FixedReplayCompanionPageSchema = z.object({schema_version:z.literal("research.fixed-replay-companion-page.v1"),run_id:Id,
  availability:z.object({state:z.enum(["AVAILABLE","NOT_PUBLISHED","NOT_APPLICABLE"]),reason_code:z.union([FixedReplayAbsenceReasonSchema,
    z.enum(["FIXED_OOS_CUSTODY_NOT_RECORDED","FIXED_OOS_RETENTION_NOT_FINALIZED","EXECUTION_PROFILE_NOT_FIXED"])]).nullable()}).strict(),
  custody:z.enum(["FRESH_FIXED_OOS_RETAINED","FRESH_SOURCE_NOT_PUBLISHED","NOT_RECORDED","NOT_FINALIZED","NOT_APPLICABLE"]),scope:z.literal(FIXED_REPLAY_SCOPE),
  execution_profile:z.object({id:Id.nullable(),digest:Digest.nullable()}).strict(),
  revision:Digest.nullable(),manifest:FixedReplayCompanionManifestSchema.nullable(),
  counts:z.object({full_source_retained:z.number().int().min(1).max(FIXED_REPLAY_MAX_ROWS).nullable(),
    matching_filter:z.number().int().min(0).max(FIXED_REPLAY_MAX_ROWS).nullable(),returned:z.number().int().min(0).max(200)}).strict(),
  rows:z.array(FixedReplayCompanionRowSchema).max(200),next_cursor:z.string().max(4096).nullable(),
}).strict().refine(v=>{
  const available=v.availability.state==="AVAILABLE";
  const source=v.manifest?.source;
  return (v.manifest!==null)===(v.revision!==null) && available===(source?.state==="AVAILABLE") && available===(v.availability.reason_code===null)
    && (!v.manifest || v.execution_profile.id===v.manifest.execution_profile_id && v.execution_profile.digest===v.manifest.execution_profile_digest)
    && v.counts.returned===v.rows.length && (available
      ? v.custody==="FRESH_FIXED_OOS_RETAINED" && v.revision===sha256ResearchJson(v.manifest)
        && source?.state==="AVAILABLE" && v.run_id===v.manifest!.run_id && v.counts.full_source_retained===source.row_count
        && v.counts.matching_filter!==null && v.counts.matching_filter<=source.row_count
        && v.rows.length<=v.counts.matching_filter
      : v.rows.length===0 && v.next_cursor===null && v.counts.full_source_retained===null && v.counts.matching_filter===null
        && (source?.state==="NOT_PUBLISHED" ? v.custody==="FRESH_SOURCE_NOT_PUBLISHED"
          && v.availability.reason_code===source.reason_code && v.revision===sha256ResearchJson(v.manifest) && v.run_id===v.manifest!.run_id
          : v.availability.state==="NOT_APPLICABLE" ? v.custody==="NOT_APPLICABLE" && v.availability.reason_code==="EXECUTION_PROFILE_NOT_FIXED"
            && v.execution_profile.id!==null && !isFixedReplayProfile(v.execution_profile.id,v.execution_profile.digest)
            : v.custody===(v.availability.reason_code==="FIXED_OOS_CUSTODY_NOT_RECORDED" ? "NOT_RECORDED" : "NOT_FINALIZED")))
    && v.rows.every((r,i)=>i===0 || r.source_ordinal>v.rows[i-1]!.source_ordinal && r.at_utc_ms>v.rows[i-1]!.at_utc_ms);
},"Replay page availability/count/ordinal binding mismatch");

/** P05 hashes exact ASCII-escaped document bytes, NOT normalized row JSON. */
export function fixedReplayCustodyProof(input:FixedReplayCompanionSealIngress | FixedReplayCompanionBatchIngress) {
  const hash=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
  if (hash(input.artifact_manifest_json)!==input.manifest_digest) throw new Error("P05 manifest bytes mismatch");
  const artifact=JSON.parse(input.artifact_manifest_json),receipt=JSON.parse(input.run_receipt_json);
  const docs=artifact.documents;
  const doc=Array.isArray(docs) ? docs.filter((d:any)=>d.name==="run_receipt") : [];
  if (doc.length!==1 || doc[0].relative_path!=="documents/run_receipt.json"
    || doc[0].sha256!==hash(input.run_receipt_json) || doc[0].bytes!==Buffer.byteLength(input.run_receipt_json)
    || receipt.run_id!==input.run_id || receipt.requested_spec_digest!==input.manifest.requested_spec_digest
    || receipt.effective_spec_digest!==input.manifest.effective_spec_digest || receipt.dataset_binding_digest!==input.manifest.dataset_binding_digest
    || receipt.input_scope!=="P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY" || receipt.holdout_rows_exposed_to_child!==0
    || input.manifest.execution_profile_id!==P04_FIXED_QUALIFICATION_PROFILE_ID
      && (receipt.execution_profile_id!==input.manifest.execution_profile_id || receipt.execution_profile_digest!==input.manifest.execution_profile_digest)
    || sha256ResearchJson(receipt.fixed_replay_source)!==sha256ResearchJson(input.manifest.source)
    || artifact.schema_version!=="research.artifact-manifest.v1"
    || ["workspace_id","run_id","artifact_id","artifact_revision","worker_attempt_id","lease_epoch"].some(k=>artifact[k]!==input[k as keyof typeof input])
    || artifact.input?.request_spec_digest!==input.manifest.requested_spec_digest
    || artifact.input?.effective_spec_digest!==input.manifest.effective_spec_digest
    || artifact.input?.dataset_binding_digest!==input.manifest.dataset_binding_digest) throw new Error("P05 receipt/source identity mismatch");
  const tables=Array.isArray(artifact.tables) ? artifact.tables.filter((t:any)=>t.table_kind==="fixed_replay") : [];
  if (input.manifest.source.state==="NOT_PUBLISHED") {
    if(tables.length!==0) throw new Error("Absent source cannot retain replay parts");
    return {artifact,receipt,table:null};
  }
  if (tables.length!==1 || tables[0].rows!==input.manifest.source.row_count
    || tables[0].schema_version!=="research.fixed-replay-table.v1"
    || !Array.isArray(tables[0].parts) || tables[0].parts.length<1 || tables[0].parts.length>100) throw new Error("P05 replay parts absent");
  return {artifact,receipt,table:tables[0]};
}
