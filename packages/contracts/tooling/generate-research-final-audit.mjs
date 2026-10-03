/** Canonical additive browser contract; raw frozen documents remain private. */
import {readFileSync,writeFileSync} from "node:fs";
import {amendCausalInnerOpenApi} from "./generate-research-causal-inner.mjs";
const root=new URL("../",import.meta.url),check=process.argv.includes("--check");
const ref=name=>({$ref:`#/components/schemas/${name}`});
const object=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const nullable=value=>({anyOf:[value,{type:"null"}]});
const id={type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$"};
const digest={type:"string",pattern:"^[a-f0-9]{64}$"};
const positive={type:"integer",minimum:1,maximum:9007199254740991};
const result=object({schema_version:{const:"research.pinned-selection-audit-result.v1"},run_id:id,parent_run_id:id,
  target_digest:digest,parameters_digest:digest,engine_release_id:{const:"er_quantbt_111"},engine_version:{const:"1.1.1"},
  snapshot_id:{type:"string",pattern:"^dss_[a-f0-9]{32}$"},snapshot_content_hash:digest,source_selection_digest:digest,
  source_selection_kind:{const:"P05_SELECTION_PARAMETERS_JSON"},source_selection_part_digest:digest,source_config_digest:digest,
  audit_target_kind:{const:"SINGLE_PARAMETER_SET"},optimizer_reinvoked:{const:false},optimizer_trials:{const:0},
  n_folds:{type:"integer",minimum:2,maximum:16},bars:{type:"integer",minimum:1,maximum:10000}});
const proof=object({child_run_id:id,child_attempt_id:id,artifact_id:id,artifact_revision:positive,manifest_digest:digest,
  result_digest:digest,verified_at_utc_ms:{type:"integer",minimum:0,maximum:9007199254740991},result:ref("PinnedAuditResult")});
proof.description="Immutable, worker-fenced receipt whose child and original target/parts were byte-verified. result_digest hashes canonical result; child_run_id=result.run_id. No raw config, params, data, artifact locator or transport secrets.";
const read=object({schema_version:{const:"research.linked-final-audit.v1"},parent_run_id:id,
  state:{enum:["READY_TO_ADMIT","QUEUED","RUNNING","AWAITING_VERIFICATION","VERIFIED","FAILED","CANCELLED"]},
  target_digest:digest,profile_id:{const:"p23.delta-pinned-final-audit.v1"},
  profile_digest:{const:"457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491"},may_create:{type:"boolean"},
  child_run_id:nullable(id),progress_href:nullable({type:"string",maxLength:512}),verification:nullable(ref("VerifiedPinnedAudit"))});
read.allOf=[
  {if:{properties:{state:{const:"VERIFIED"}}},then:{properties:{verification:ref("VerifiedPinnedAudit")}},
    else:{properties:{verification:{type:"null"}}}},
  {if:{properties:{state:{const:"READY_TO_ADMIT"}}},then:{properties:{child_run_id:{type:"null"},progress_href:{type:"null"}}},
    else:{properties:{child_run_id:id}}},
];
const create=object({client_intent_id:{type:"string",minLength:16,maxLength:160,pattern:"^[A-Za-z0-9][A-Za-z0-9_.:-]*$"},target_digest:digest});
const problem=object({error:object({code:{type:"string",maxLength:160},message:{type:"string",maxLength:1024,
  description:"Diagnostic only, not UI copy. Never contains raw target documents, paths or credentials."}})});
problem.properties.request_id={type:"string",maxLength:128};
const response=status=>({description:status===200?"Bound target and actual verified custody":status===202?"Durable explicit intent accepted; same-intent retry is idempotent":"Typed refusal; no authority is inferred",
  ...(status===200||status===202 ? {headers:{"Cache-Control":{schema:{const:"private, no-store"}}}}:{}),
  content:{"application/json":{schema:ref(status<300?"Read":"Problem")}}});
const parameters=[{name:"run_id",in:"path",required:true,schema:{...id,maxLength:128}},{name:"workspace_id",in:"query",required:false,schema:id}];
const doc={openapi:"3.1.0",info:{title:"Research pinned linked final audit",version:"1.0.0",description:
  "Qualified QuantBT 1.1.1 global Delta signal-notional audit of an original frozen selection. No optimizer/reselection, fresh defaults or data reload. Public GET creates no job; explicit ADMIN producer POST binds same-origin CSRF, workspace, immutable target and shared utility budget. Per-fold causal targets require an individual target sequence and remain typed outside this profile. Not a generic engine/CLI endpoint."},
  paths:{"/api/v1/quantbt/runs/{run_id}/final-audit":{
    get:{operationId:"researchLinkedFinalAuditGetV1",security:[{portalSession:[]}],parameters,
      responses:Object.fromEntries([200,400,401,403,404,409,502,503].map(status=>[status,response(status)]))},
    post:{operationId:"researchLinkedFinalAuditCreateV1",security:[{portalSession:[]}],parameters,
      description:"Same-origin Origin and x-portal-csrf matching the session-bound CSRF cookie are required. Producer authority is independently enforced.",
      requestBody:{required:true,content:{"application/json":{schema:ref("Create")}}},
      responses:Object.fromEntries([202,400,401,403,404,409,502,503].map(status=>[status,response(status)]))}}},
  components:{securitySchemes:{portalSession:{type:"apiKey",in:"cookie",name:"__Host-portal_session"}},
    schemas:{PinnedAuditResult:result,VerifiedPinnedAudit:proof,Read:read,Create:create,Problem:problem}}};
function emit(path,value){let text=JSON.stringify(value,null,2)+"\n";
  // Preserve the established causal generator's canonical schema formatting
  // in the shared readers. All amendments must converge, not fight each other.
  if(path==="openapi/research-report.openapi.json"||path==="openapi/research-attempt-lineage.openapi.json")
    text=amendCausalInnerOpenApi(text,path.slice("openapi/".length,-".openapi.json".length));
  const url=new URL(path,root);
  if(check){if(readFileSync(url,"utf8")!==text)throw new Error(`Pinned audit contract drift: ${path}`);}else writeFileSync(url,text);}
emit("openapi/research-final-audit.openapi.json",doc);
for(const name of ["research-report","research-release-candidate","research-attempt-lineage"]){
  const path=`openapi/${name}.openapi.json`,other=JSON.parse(readFileSync(new URL(path,root)));
  Object.assign(other.components.schemas,{PinnedAuditResult:result,VerifiedPinnedAudit:proof});
  if(name==="research-report") other.components.schemas.ReportDetail.properties.linked_final_audit=ref("VerifiedPinnedAudit");
  if(name==="research-release-candidate"){
    for(const key of ["ComposeResponse","ComposeResponseP21"]) other.components.schemas[key].properties.linked_final_audit=ref("VerifiedPinnedAudit");
    other.components.schemas.PackResponse.properties.frozen_core.properties.linked_final_audit=ref("VerifiedPinnedAudit");
  }
  if(name==="research-attempt-lineage") other.components.schemas.ChildRun.properties.verified_audit=ref("VerifiedPinnedAudit");
  emit(path,other);
}
// Explicitly synthetic canonical states: conformance fixtures, not real proof.
const fake=Object.fromEntries(Object.keys(result.properties).map(key=>[key,key.endsWith("digest")||key.endsWith("hash")?"a".repeat(64):"synthetic"]));
Object.assign(fake,{schema_version:result.properties.schema_version.const,run_id:"rrun_synthetic_child",parent_run_id:"rrun_synthetic_parent",
  engine_release_id:"er_quantbt_111",engine_version:"1.1.1",snapshot_id:`dss_${"b".repeat(32)}`,source_selection_kind:"P05_SELECTION_PARAMETERS_JSON",
  audit_target_kind:"SINGLE_PARAMETER_SET",optimizer_reinvoked:false,optimizer_trials:0,n_folds:2,bars:500});
const {createHash}=await import("node:crypto");
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const verified={child_run_id:fake.run_id,child_attempt_id:"ratt_synthetic_child",artifact_id:"rart_synthetic_child",artifact_revision:1,
  manifest_digest:"c".repeat(64),result_digest:createHash("sha256").update(JSON.stringify(canonical(fake))).digest("hex"),
  verified_at_utc_ms:1791036000000,result:fake};
for(const state of read.properties.state.enum){const hasChild=state!=="READY_TO_ADMIT";
  emit(`fixtures/research-final-audit.${state.toLowerCase()}.valid.json`,{schema_version:read.properties.schema_version.const,
    parent_run_id:fake.parent_run_id,state,target_digest:fake.target_digest,profile_id:"p23.delta-pinned-final-audit.v1",
    profile_digest:"457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491",may_create:!hasChild,
    child_run_id:hasChild?fake.run_id:null,progress_href:hasChild?`/research/quantbt/runs/${fake.run_id}/progress`:null,
    verification:state==="VERIFIED"?verified:null});}
