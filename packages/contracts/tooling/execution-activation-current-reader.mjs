/** Additive finite Activation metadata only; not activation/trust installation. */
import {createHash} from "node:crypto";
const object=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const enumeration=values=>({type:"string",enum:values}),nullable=value=>({oneOf:[value,{type:"null"}]});
const id={type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,511}$"};
const rev={type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$"};
const hash={type:"string",pattern:"^sha256:[0-9a-f]{64}$"};
const time={type:"integer",minimum:-62135596800000,maximum:253402300799999};
const count={type:"integer",minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const keys=["PROJECTION","QUERY","SSE","COMMAND_R1","COMMAND_R2","COMMAND_R3","COMMAND_R4"];
const profiles=["fixture","shadow","paper","sandbox","live_canary","live_full"];
const capability=(recorded)=>object(recorded?{capability_key:enumeration(keys),record_state:{const:"RECORDED"},
  effective_profile:{const:"fixture"},desired_profile:enumeration(profiles),capability_version:count,
  source_enabled:{const:false},runtime_enabled:{const:false},kill_switch_engaged:{const:true},last_plan_id:nullable(id),
  created_at_ms:time,updated_at_ms:time}:{capability_key:enumeration(keys),record_state:{const:"NOT_RECORDED"}});
const capabilityUnion={oneOf:[capability(false),capability(true)]};
const base={record_authority:{const:"PORTAL"},provenance_basis:{const:"CURRENT_CORE_BASELINE"},
  field_contract_revision:{const:"portal.execution.parent-fields.v1"},workspace_id:id,
  perspective:object({environment:enumeration(["paper","sandbox","live"]),root_id:id,basis:{const:"CURRENT_PUBLISHED_TECHNICAL_ROOT"},
    captured_native_environment:{type:"null"}}),observed_at_ms:{type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER},snapshot_revision:hash};
export function activationCurrentSchemas(){
  const Capabilities=object({...base,schema_version:{const:"portal.execution.activation-capabilities-read.v2"},
    capabilities:{type:"array",minItems:7,maxItems:7,items:capabilityUnion,allOf:keys.map(key=>({
      contains:{type:"object",required:["capability_key"],properties:{capability_key:{const:key}}},minContains:1,maxContains:1}))}});
  const Plan=object({...base,schema_version:{const:"portal.execution.activation-plan-read.v2"},
    plan:object({plan_id:id,capability_key:enumeration(keys),action:enumeration(["PROMOTE","ROLLBACK"]),from_profile:enumeration(profiles),
      target_profile:enumeration(profiles),expected_capability_version:count,plan_version:count,stored_status:enumeration(["READY","BLOCKED","DENIED","APPLIED","VERIFIED"]),
      expiry_basis:{const:"HISTORICAL_CAPTURE_NOT_CURRENT_READ_AUTHORITY"},expires_at_ms:time,applied_at_ms:nullable(time),
      verified_at_ms:nullable(time),resulting_capability_version:nullable(count),created_at_ms:time,updated_at_ms:time,
      source_side_effect_requested:{const:false},runtime_activation_requested:{const:false},owner_artifact_imported:{const:false}}),
    capability:capability(true),
    evidence:{oneOf:[object({availability:{const:"NOT_AUTHORIZED"}}),object({availability:{const:"AVAILABLE"},basis:{const:"STORED_NOT_ACTIVATION_TRUST"},
      items:{type:"array",maxItems:16,items:object({ordinal:{type:"integer",minimum:0,maximum:15},kind:enumeration(["CONTRACT","IMAGE","SCHEMA","QUALIFICATION","ROLLBACK"]),
        reference_id:id,artifact_digest:hash,schema_version:rev,compatibility_revision:rev,expires_at_ms:time,
        structure_valid:{const:true},owner_accepted:{const:false},trusted_for_activation:{const:false}})}})]},
    compatibility:{oneOf:[object({availability:{const:"NOT_AUTHORIZED"}}),object({availability:{const:"AVAILABLE"},
      basis:{const:"STORED_REQUIREMENTS_NOT_COMPATIBILITY_VERDICT"},items:{type:"array",maxItems:16,items:object({
        ordinal:{type:"integer",minimum:0,maximum:15},kind:enumeration(["CONTRACT","IMAGE","SCHEMA","CAPABILITY"]),
        component:rev,exact_revision:rev,expected_digest:hash})}})]}});
  Plan.allOf=keys.map(key=>({if:{properties:{plan:{type:"object",required:["capability_key"],properties:{capability_key:{const:key}}}},required:["plan"]},
    then:{properties:{capability:{type:"object",required:["capability_key"],properties:{capability_key:{const:key}}}}}}));
  const description="Finite stored Portal metadata under current maintenance.read plus exact TS-qualified ROOT audit and reviewed Activation field seals. Explicit environment is a CURRENT technical perspective, not captured native origin; no role/read_all authority or source verdict. Historical plan expiry is not read expiry. Exact flags are validated, not masked. Missing capabilities NOT_RECORDED do not invent default versions. Evidence and compatibility are independently optional; private signatures/prose/actors/request/hash witnesses never disclose or enter public revision. SAME issuer-bound flight holds bodies AND contextual errors through fresh source and LAST Core/session/clock checks. No GET writes or activation.";
  Capabilities.description=description;Plan.description=description+
    " Runtime additionally verifies exact stored timestamp chronology and state/child/head integrity. Standard JSON Schema validates finite scalar/closed shape and cannot express sibling timestamp ordering; AJV shape validation alone is not that producer-integrity proof.";
  return {ActivationCapabilitiesReadV2:Capabilities,ActivationPlanReadV2:Plan};
}
export const activationReadRoutes=[
  ["/api/v1/execution/activation/capabilities","ActivationCapabilitiesReadV2","CapabilitiesResponse"],
  ["/api/v1/execution/activation/plans/{plan_id}","ActivationPlanReadV2","PlanResponse"],
];
export function updateActivationPaths(api){
  for(const [path,name,legacy]of activationReadRoutes){
    const get=api.paths?.[path]?.get;if(!get)throw Error("Missing existing Activation GET");
    get.parameters??=[];
    if(!get.parameters.some(p=>p.name==="environment"&&p.in==="query"))get.parameters.push({name:"environment",in:"query",required:false,
      description:"REQUIRED for SCOPED_V2: explicit current unique published ROOT perspective; never inferred from target profile. Legacy unchanged.",
      schema:enumeration(["paper","sandbox","live"])});
    const headers={"Cache-Control":{schema:{const:"private, no-store"}}};
    get.responses[200]={description:"Legacy v1 OR finite current-authorized Activation metadata; no activation.",headers,
      content:{"application/json":{schema:{oneOf:[
        {$ref:"../schemas/execution-staged-activation.v1.schema.json#/$defs/"+legacy},
        {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name}]}}}};
    for(const status of [400,401,403,404,409,503]){
      get.responses[status]??={description:"Fixed current read refusal; no raw provider/SQL/private data.",
        content:{"application/json":{schema:{$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"}}}};
      get.responses[status].headers={...get.responses[status].headers,...headers};
    }
  }
  api.components??={};api.components.schemas??={};
  for(const name of Object.keys(activationCurrentSchemas()))api.components.schemas[name]={$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name};
  return activationReadRoutes.map(([path])=>path);
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?
  Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)])):value;
const digest=value=>"sha256:"+createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const finish=body=>({...body,observed_at_ms:10000,snapshot_revision:digest(body)});
export const activationFixtureName="execution-activation-current.synthetic.valid.json";
export function activationCurrentFixture(){
  const common={record_authority:"PORTAL",provenance_basis:"CURRENT_CORE_BASELINE",field_contract_revision:"portal.execution.parent-fields.v1",
    workspace_id:"TEST_ONLY:workspace",perspective:{environment:"paper",root_id:"TEST_ONLY:root",basis:"CURRENT_PUBLISHED_TECHNICAL_ROOT",captured_native_environment:null}};
  const recorded={capability_key:"QUERY",record_state:"RECORDED",effective_profile:"fixture",desired_profile:"fixture",capability_version:1,
    source_enabled:false,runtime_enabled:false,kill_switch_engaged:true,last_plan_id:null,created_at_ms:1000,updated_at_ms:1000};
  const caps=finish({...common,schema_version:"portal.execution.activation-capabilities-read.v2",
    capabilities:keys.map(key=>key==="QUERY"?recorded:{capability_key:key,record_state:"NOT_RECORDED"})});
  const root={...common,schema_version:"portal.execution.activation-plan-read.v2",capability:recorded,
    plan:{plan_id:"TEST_ONLY:plan",capability_key:"QUERY",action:"PROMOTE",from_profile:"fixture",target_profile:"shadow",
      expected_capability_version:1,plan_version:1,stored_status:"BLOCKED",expiry_basis:"HISTORICAL_CAPTURE_NOT_CURRENT_READ_AUTHORITY",
      expires_at_ms:5000,applied_at_ms:null,verified_at_ms:null,resulting_capability_version:null,created_at_ms:1000,updated_at_ms:1000,
      source_side_effect_requested:false,runtime_activation_requested:false,owner_artifact_imported:false}};
  return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,production_config:false,authority_installed:false,
    capabilities:caps,plan:finish({...root,evidence:{availability:"AVAILABLE",basis:"STORED_NOT_ACTIVATION_TRUST",items:[{ordinal:0,kind:"CONTRACT",
      reference_id:"TEST_ONLY:evidence",artifact_digest:digest("TEST_ONLY:artifact"),schema_version:"TEST_ONLY.v1",
      compatibility_revision:"TEST_ONLY.v1",expires_at_ms:5000,structure_valid:true,owner_accepted:false,trusted_for_activation:false}]},
      compatibility:{availability:"AVAILABLE",basis:"STORED_REQUIREMENTS_NOT_COMPATIBILITY_VERDICT",items:[]}}),
    plan_absent:finish({...root,evidence:{availability:"NOT_AUTHORIZED"},compatibility:{availability:"NOT_AUTHORIZED"}})};
}
