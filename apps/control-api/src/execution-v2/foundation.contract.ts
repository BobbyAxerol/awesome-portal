import { z } from "zod";

/** Public HTTP values only. Validation does NOT authenticate a human/workload. */
export const exactDecimal = z.string().max(128).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
export const unsignedDecimal = z.string().max(128).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
export const pmCounter = z.string().regex(/^(?:0|[1-9][0-9]{0,18})$/)
  .refine(value => /^(?:0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n, "PM_COUNTER_OVERFLOW");
export const utcMilliseconds = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const opaqueRevision = z.string().min(1).max(256);
export const executionEnvironment = z.enum(["paper", "sandbox", "live"]);
export const financialStage = z.enum(["PAPER", "SANDBOX", "CANARY", "LIVE"]);
const text = z.string().min(1).max(256);
// Python str.strip whitespace, including separators not trimmed by JS trim().
const pmWhitespace = "\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
export const pmText = z.string().min(1).refine(value=>
  Buffer.byteLength(value,"utf8")<=512 && !/[\u0000-\u001f\u007f]/.test(value) &&
  !new RegExp(`^[${pmWhitespace}]|[${pmWhitespace}]$`,"u").test(value),"PM_TEXT_INVALID");
const versionKeys = {
  FUND: ["budget","source","claim"], INITIAL_GRANT: ["budget","source","parent"], TOP_UP: ["budget","source","parent"],
  IMMEDIATE_DECREASE: ["budget","source","parent","book"], RECALL_PARTIAL: ["budget","source","parent","book"],
  RECALL_FULL: ["budget","source","parent","book"], ADJUST_TARGET_BUDGET: ["budget","source","parent","book"],
  SET_ROOT_LIMIT: ["budget","source"],
} as const;
type CandidateOperation = keyof typeof versionKeys;
const amountField: Record<CandidateOperation, "amount" | "target_budget" | "target_root_limit" | null> = {
  FUND:"amount",INITIAL_GRANT:"amount",TOP_UP:"amount",IMMEDIATE_DECREASE:"amount",RECALL_PARTIAL:"amount",
  RECALL_FULL:null,ADJUST_TARGET_BUDGET:"target_budget",SET_ROOT_LIMIT:"target_root_limit",
};
export interface PmaCapitalWire {
  schema_version: "pma.capital-command.v1.1"; operation: CandidateOperation;
  idempotency_key: string; recipient_kind: "ROOT" | "PORTFOLIO" | "DEPLOYMENT_ACCOUNT";
  currency: string; expected_versions: Record<string,string>; reason: string;
  recipient_account_id?: string; recipient_deployment_id?: string; source_ref?: string;
  amount?: string; target_budget?: string; target_root_limit?: string;
}
/** Strict adapter allowlist from PM operator_adapters.py, not its wider component parser. */
export function parsePmaCapitalWire(input: unknown): PmaCapitalWire {
  const discriminator = z.object({operation:z.enum(Object.keys(versionKeys) as [CandidateOperation,...CandidateOperation[]]),
    recipient_kind:z.enum(["ROOT","PORTFOLIO","DEPLOYMENT_ACCOUNT"])}).parse(input);
  if ((discriminator.operation === "SET_ROOT_LIMIT") !== (discriminator.recipient_kind === "ROOT")) {
    throw new Error("PM_RECIPIENT_KIND_MISMATCH");
  }
  const properties: z.ZodRawShape = {schema_version:z.literal("pma.capital-command.v1.1"),
    operation:z.literal(discriminator.operation),idempotency_key:pmText,recipient_kind:z.literal(discriminator.recipient_kind),
    currency:pmText,reason:pmText,
    expected_versions:z.object(Object.fromEntries(versionKeys[discriminator.operation].map(key => [key,pmCounter]))).strict()};
  if(discriminator.recipient_kind === "DEPLOYMENT_ACCOUNT") Object.assign(properties,{recipient_account_id:pmText,recipient_deployment_id:pmText});
  if(discriminator.operation === "FUND") properties.source_ref=pmText;
  const field=amountField[discriminator.operation];
  if(field) properties[field]=field === "amount" ? unsignedDecimal.refine(v=>!/^0(?:\.0+)?$/.test(v),"PM_AMOUNT_MUST_BE_POSITIVE") : unsignedDecimal;
  return z.object(properties).strict().parse(input) as unknown as PmaCapitalWire;
}
/** No dispatch: preserves canonical HTTP string counters and the strict business body. */
export function serializePmaCapitalWire(input: unknown): string {
  return JSON.stringify(parsePmaCapitalWire(input));
}
function parts(value:string): {coefficient:bigint; scale:number} {
  unsignedDecimal.parse(value); const [whole,fraction=""] = value.split(".");
  return {coefficient:BigInt(whole+fraction),scale:fraction.length};
}
export function assertAmountPartition(input: {requested:string;applied:string;pending:string;cancelled:string;rejected:string}): void {
  const entries = [input.requested,input.applied,input.pending,input.cancelled,input.rejected].map(parts);
  const scale=Math.max(...entries.map(v=>v.scale));
  const [requested,...outcomes]=entries.map(v=>v.coefficient*10n**BigInt(scale-v.scale));
  if(outcomes.reduce((sum,v)=>sum+v,0n)!==requested) throw new Error("PM_AMOUNT_PARTITION_MISMATCH");
}

/** A browser intent has no trusted actor/context, URL, relation, SQL or credential input. */
export const browserCapitalIntent = z.object({
  schema_version:z.literal("execution.capital-intent.v2"),workspace_id:text,
  resource:z.object({kind:z.enum(["ROOT","PORTFOLIO","DEPLOYMENT"]),id:text}).strict(),
  environment:executionEnvironment,expected_policy_revision:opaqueRevision,
  business_payload:z.unknown().superRefine((value,context)=>{
    try {parsePmaCapitalWire(value);} catch {context.addIssue({code:z.ZodIssueCode.custom,message:"PM_PAYLOAD_INVALID"});}
  }).transform(parsePmaCapitalWire),
}).strict();

/** Alias registry is a trusted adapter input, not a browser resolver/proxy. */
export function resolveResourceAlias(kind:string,alias:string,mappingRevision:string,
  candidates:readonly string[]) {
  const ids=[...new Set(candidates)];
  if(ids.length!==1) return {state:ids.length?"AMBIGUOUS":"NOT_FOUND",alias,canonical:null,
    mapping_revision:mappingRevision,reason_code:ids.length?"AMBIGUOUS_RESOURCE_ALIAS":"RESOURCE_NOT_FOUND"};
  return {state:"RESOLVED",alias,canonical:{kind,id:ids[0]},mapping_revision:mappingRevision};
}
const qualitySchema=z.object({completeness:z.enum(["COMPLETE","PARTIAL","UNRESOLVED"]),
  freshness:z.enum(["FRESH","STALE","UNKNOWN"]),coverage:z.enum(["AUTHORIZED_ONLY","CURRENT_PAGE_ONLY","RETAINED_OBSERVATIONS"]),
  source_as_of_ms:utcMilliseconds.nullable(),portal_observed_at_ms:utcMilliseconds,source_set_ref:text,
  confidence:z.enum(["VERIFIED","PROVISIONAL","UNKNOWN"]),reasons:z.array(text).max(32)}).strict();
export const edgeMetadataSchema=z.object({contract_version:z.literal("edge.v1"),source_continuity_epoch:text,
  projection_generation:text,event_id:text,event_kind:z.enum(["SNAPSHOT","UPSERT","CORRECTION","TOMBSTONE","RESYNC_REQUIRED"]),
  continuation:text,emitted_at_ms:utcMilliseconds,as_of_ms:utcMilliseconds,source_observed_at_ms:utcMilliseconds.nullable(),
  coverage_watermark:text.nullable(),policy_revision:text,quality:qualitySchema,
  entity_key:text.nullable(),entity_revision:text.nullable(),replacement_ref:text.nullable()}).strict();
export function edgeMetadataToBrowser(input:unknown,context:{snapshot_id:string;dataset:string;
  produced_at_ms:number;received_at_ms:number;projection:{kind:"REUSED_EDGE"|"PORTAL_DERIVED";generation:string;lineage_ref:string|null};
  coverageProof:null|{source_set_ref:string;as_of_ms:number;facts_through_ms:number;recorded_through_ms:number}}){
  const edge=edgeMetadataSchema.parse(input);
  text.parse(context.snapshot_id);text.parse(context.dataset);text.parse(context.projection.generation);
  utcMilliseconds.parse(context.produced_at_ms);utcMilliseconds.parse(context.received_at_ms);
  if(context.projection.kind==="REUSED_EDGE" && context.projection.generation!==edge.projection_generation) throw new Error("PROJECTION_GENERATION_MISMATCH");
  if(context.projection.kind==="PORTAL_DERIVED" && !context.projection.lineage_ref) throw new Error("PROJECTION_LINEAGE_REQUIRED");
  const proof=context.coverageProof;
  if(proof && (proof.source_set_ref!==edge.quality.source_set_ref || proof.as_of_ms!==edge.as_of_ms)) throw new Error("SOURCE_COVERAGE_PROOF_MISMATCH");
  if(proof){utcMilliseconds.parse(proof.facts_through_ms);utcMilliseconds.parse(proof.recorded_through_ms);}
  return {schema_version:"portal.snapshot.v1",snapshot_id:context.snapshot_id,dataset:context.dataset,as_of_ms:edge.as_of_ms,
    recorded_through_ms:proof?.recorded_through_ms??null,facts_through_ms:proof?.facts_through_ms??null,
    produced_at_ms:context.produced_at_ms,received_at_ms:context.received_at_ms,
    source_observed_at_ms:edge.source_observed_at_ms,emitted_at_ms:edge.emitted_at_ms,
    quality:proof ? edge.quality : {...edge.quality,completeness:"UNRESOLVED",reasons:[...new Set([...edge.quality.reasons,"COVERAGE_PROOF_NOT_PUBLISHED"])]},
    resume_cursor:edge.continuation,coverage_watermark:edge.coverage_watermark,
    versions:{source_continuity_epoch:edge.source_continuity_epoch,projection_generation:context.projection.generation,app_policy:edge.policy_revision},
    projection_lineage_ref:context.projection.lineage_ref,adapter_revision:"edge-to-portal-metadata.v1"};
}
/** Explicit timestamp-only legacy adapter; no invented split of source_generation. */
export function parseLegacyUtcMilliseconds(input:unknown):number {
  const value=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/).parse(input);
  const [year,month,day,hour,minute,second]=[value.slice(0,4),value.slice(5,7),value.slice(8,10),value.slice(11,13),value.slice(14,16),value.slice(17,19)].map(Number);
  if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||hour>23||minute>59||second>59) throw new Error("INVALID_LEGACY_TIMESTAMP");
  const ms=Date.parse(value);return utcMilliseconds.parse(ms);
}
export function legacyGenerationDisposition(_sourceGeneration:string) {
  return {state:"UNAVAILABLE",reason_code:"LEGACY_CONTINUITY_PROJECTION_NOT_DISTINGUISHED",source_continuity_epoch:null,projection_generation:null};
}
export function legacyEnvironmentToCanonical(value:unknown,verifiedDemoMapping:null|{canonical:"sandbox";native_profile_ref:string;mapping_receipt_ref:string}=null) {
  if(value==="DEMO") {
    if(!verifiedDemoMapping) throw new Error("VERIFIED_DEMO_MAPPING_REQUIRED");
    text.parse(verifiedDemoMapping.native_profile_ref);text.parse(verifiedDemoMapping.mapping_receipt_ref);
    return executionEnvironment.parse(verifiedDemoMapping.canonical);
  }
  return executionEnvironment.parse(value);
}
