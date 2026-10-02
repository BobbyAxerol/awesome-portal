/** Named additive full available-source custody, never engine-history authority. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const root=new URL("../",import.meta.url),check=process.argv.includes("--check");
const old=JSON.parse(readFileSync(new URL("openapi/research-current-source.openapi.json",root)));
const ref=name=>({$ref:`#/components/schemas/${name}`});
const obj=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const nullable=value=>({anyOf:[value,{type:"null"}]});
const id={type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$"},token={type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$"};
const digest={type:"string",pattern:"^[a-f0-9]{64}$"},count={type:"integer",minimum:0,maximum:2_020_000};
const ordinal={type:"integer",minimum:0,maximum:19_999},cursor={type:"string",minLength:1,maxLength:4096};
const authority={const:"SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK"};
const row=structuredClone(old.components.schemas.ChildAuditRecord);
row.properties.audit_ordinal=ordinal; row.properties.fold_id=nullable(token);row.properties.run_fingerprint=nullable(token);row.required.push("run_fingerprint");
row.properties.seed.anyOf[0].maximum=9007199254740991;
row.description="One normalized source-file lifecycle row with its original ordinal/fold/context/candidate/fingerprints. No wall-clock generation claim. <=4096 serialized bytes.";
const manifest=obj({schema_version:{const:"research.child-audit-companion-manifest.v1"},workspace_id:id,run_id:id,artifact_id:id,
  artifact_revision:{type:"integer",minimum:1},manifest_digest:digest,source_transform_digest:digest,requested_spec_digest:digest,
  effective_spec_digest:digest,dataset_binding_digest:digest,execution_profile_id:id,execution_profile_digest:digest,source_adapter_id:id,profile_id:id,
  source_file_digest:digest,source_contract_digest:digest,rows_digest:digest,source_record_count:{...count,maximum:20000},
  records_dropped_by_source:nullable({...count,maximum:2000000}),source_total_count:nullable(count),source_run_fingerprint:nullable(token),policy:nullable(token),authority});
manifest.description="Companion immutable seal bound to the exact retained P05 artifact/revision, source transform, requested/effective/data/profile and source-file digest. Total is retained source count plus known source drops, otherwise null. Neither private worker/lease fields nor source paths are public.";
const counts=available=>obj({full_source_retained:available ? {...count,maximum:20000} : {type:"null"},records_dropped_by_source:nullable(count),
  source_total_if_known:nullable(count),matching_fold:available ? count : {type:"null"},matching_filter:available ? count : {type:"null"},
  legacy_sample_retained:nullable(count),returned:available ? {...count,maximum:200} : {const:0}});
const pageVariant=custody=>{
  const available=custody==="FULL_SOURCE_RETAINED",reason=custody==="LEGACY_SAMPLE" ? "LEGACY_SAMPLE" : "SOURCE_AUDIT_NOT_RETAINED";
  return obj({schema_version:{const:"research.child-audit-companion-page.v1"},run_id:ref("RunId"),
    availability:obj({state:{const:available ? "AVAILABLE" : "NOT_PUBLISHED"},reason_code:available ? {type:"null"} : {const:reason}}),
    custody:{const:custody},revision:available ? digest : {type:"null"},manifest:available ? ref("Manifest") : {type:"null"},scope:authority,
    counts:counts(available),rows:{type:"array",items:ref("Row"),maxItems:available ? 200 : 0},next_cursor:available ? nullable(cursor) : {type:"null"}});
};
const parameter=(name,schema,required=false,location="query")=>({name,in:location,required,schema});
const contexts=["anti-leakage in-sample search","in-sample scoring","out-of-sample scoring","out-of-sample generation"];
const problem=obj({error:obj({code:{type:"string",maxLength:160,description:"Typed RESEARCH_CURRENT_SOURCE_* refusal; session guard 401 keeps its existing generic code."},
  message:{type:"string",maxLength:1024}})});
problem.properties.request_id={type:"string",maxLength:128};
const doc={openapi:"3.1.0",info:{title:"Research full-source child audit companion",version:"1.0.0",description:
  "Additive bounded source-file lifecycle custody; legacy <=64 fold witnesses and original five-table P05 seal remain unchanged. FULL_SOURCE_RETAINED means all rows available in the bounded source file, not complete engine generation/history: source-dropped rows are irrecoverable. GET reads tenant-scoped immutable custody only, never runs an engine or opens Parquet. Cursor pages are private/no-store."},
  paths:{"/api/v1/quantbt/runs/{run_id}/current-source/child-audit-companion":{get:{operationId:"researchChildAuditCompanionGetV1",
    summary:"Page full available source lifecycle rows or typed legacy absence",security:[{portalSession:[]}],parameters:[
      parameter("run_id",ref("RunId"),true,"path"),parameter("workspace_id",id),parameter("fold_id",token),parameter("context",{enum:contexts}),
      parameter("audit_ordinal",ordinal),parameter("limit",{type:"integer",minimum:1,maximum:200,default:100}),parameter("cursor",cursor)],
    description:"Strict closed selectors. Exact audit_ordinal lookup and cursor are mutually exclusive. Opaque signed cursors bind tenant/actor/run/revision/full filter/page limit; expire and cannot restart on a changed/missing seal. Counts matching_fold and matching_filter cover the full retained population, not only returned rows.",
    responses:{200:{description:"Sealed full-source page or typed absence; dropped source history stays explicit",headers:{"Cache-Control":{schema:{const:"private, no-store"}}},
      content:{"application/json":{schema:ref("Page")}}},...Object.fromEntries([400,401,403,404,503].map(status=>[status,{description:"Typed refusal",content:{"application/json":{schema:ref("Problem")}}}]))}}}},
  components:{securitySchemes:old.components.securitySchemes,schemas:{RunId:old.components.schemas.RunId,UtcMs:old.components.schemas.UtcMs,
    Row:row,Manifest:manifest,Page:{oneOf:["FULL_SOURCE_RETAINED","LEGACY_SAMPLE","NOT_RETAINED"].map(pageVariant)},Problem:problem}}};
function emit(path,value){const text=JSON.stringify(value,null,2)+"\n",url=new URL(path,root);
  if(check){if(readFileSync(url,"utf8")!==text)throw new Error(`Child audit contract drift: ${path}`);}else writeFileSync(url,text);}
emit("openapi/research-child-audit-companion.openapi.json",doc);
// Canonical synthetic examples for contract conformance only, never receipts.
const synthetic=ordinal=>Object.fromEntries(row.required.map(key=>[key,key==="audit_ordinal" ? ordinal : key==="fold_id" ? "fold_000" :
  key==="candidate_id" ? `synthetic-unit-${ordinal}` : key==="context" ? contexts[0] : key==="run_fingerprint" ? "synthetic-unit-run" : null]));
const rows=[synthetic(0),synthetic(1),synthetic(2)];
const canonical=value=>Array.isArray(value) ? value.map(canonical) : value && typeof value==="object" ?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const hash=value=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const m=Object.fromEntries(Object.keys(manifest.properties).map(key=>[key,key.endsWith("digest") ? "a".repeat(64) : "synthetic-unit"]));
Object.assign(m,{schema_version:"research.child-audit-companion-manifest.v1",workspace_id:"synthetic-workspace",run_id:"synthetic-run",artifact_id:"synthetic-artifact",
  artifact_revision:1,source_record_count:3,records_dropped_by_source:2212,source_total_count:2215,source_run_fingerprint:"synthetic-unit-run",policy:null,
  rows_digest:hash(rows),authority:authority.const});
const full={schema_version:"research.child-audit-companion-page.v1",run_id:m.run_id,availability:{state:"AVAILABLE",reason_code:null},custody:"FULL_SOURCE_RETAINED",
  revision:hash(m),manifest:m,scope:authority.const,counts:{full_source_retained:3,records_dropped_by_source:2212,source_total_if_known:2215,
    matching_fold:3,matching_filter:3,legacy_sample_retained:3,returned:3},rows,next_cursor:null};
emit("fixtures/research-child-audit-companion.full-source.valid.json",full);
emit("fixtures/research-child-audit-companion.legacy-sample.valid.json",{...full,availability:{state:"NOT_PUBLISHED",reason_code:"LEGACY_SAMPLE"},custody:"LEGACY_SAMPLE",
  revision:null,manifest:null,counts:{full_source_retained:null,records_dropped_by_source:2212,source_total_if_known:4212,matching_fold:null,matching_filter:null,
    legacy_sample_retained:64,returned:0},rows:[],next_cursor:null});
emit("fixtures/research-child-audit-companion.not-retained.valid.json",{...full,availability:{state:"NOT_PUBLISHED",reason_code:"SOURCE_AUDIT_NOT_RETAINED"},custody:"NOT_RETAINED",
  revision:null,manifest:null,counts:{full_source_retained:null,records_dropped_by_source:null,source_total_if_known:null,matching_fold:null,matching_filter:null,
    legacy_sample_retained:null,returned:0},rows:[],next_cursor:null});
