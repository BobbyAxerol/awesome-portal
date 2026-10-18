/** Canonical finite current-audit variants. No source/runtime commissioning. */
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const str=(max=191)=>({type:"string",minLength:1,maxLength:max});
const id={type:"string",pattern:"^[A-Za-z0-9._:-]{1,191}$"};
const time={type:"string",format:"date-time",pattern:"Z$"};
const nullable=s=>({anyOf:[s,{type:"null"}]});
const count={type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const enumeration=values=>({type:"string",enum:values});
const object=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const ref=name=>({$ref:"#/$defs/"+name});
const target=object({type:enumeration(["ACCOUNT","PORTFOLIO","DEPLOYMENT"]),id});
const severity=enumeration(["INFO","WARNING","ERROR","CRITICAL"]);
const environment=enumeration(["PAPER","SANDBOX","LIVE"]);
const version={type:"integer",minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const digest={type:"string",pattern:"^sha256:[0-9a-f]{64}$"};
const absent=reason=>object({state:{const:"UNAVAILABLE"},reason_code:{const:reason},source_side_effect_requested:{const:false}});

export function operationalCurrentSchemas(){
 const OperationalQueueItemV2=object({operation_id:id,operation_kind:{const:"EXECUTION_COMMAND"},
  command_key:{type:"string",minLength:1,maxLength:128,pattern:"^[a-z0-9-]+/(?:[a-z0-9-]+|<root>)$"},target,environment,
  risk_tier:enumeration(["R0_READ","R1_PAPER_MUTATION","R2_SANDBOX","R3_LIVE_PROTECTIVE","R4_LIVE_RISK_INCREASING","UNCLASSIFIED","BLOCKED"]),
  severity,source_authority:enumeration(["PORTAL","EXECUTION","BROKER"]),
  source_status:enumeration(["BLOCKED","PENDING","RUNNING","SUCCEEDED","FAILED","EXPIRED","UNCERTAIN"]),
  verification_result:enumeration(["NOT_STARTED","PENDING","SUCCEEDED","FAILED","PARTIAL","UNCERTAIN","DENIED","EXPIRED"]),
  triage_state:enumeration(["UNACKNOWLEDGED","ACKNOWLEDGED","RESOLVED"]),workflow_version:version,
  acknowledged_at:nullable(time),resolved_at:nullable(time),created_at:time,updated_at:time});
 OperationalQueueItemV2.description="Finite immutable Portal labels plus current local triage, not TS execution. Runtime additionally enforces nonnegative finite dates, updated>=created and the existing triage/timestamp shape. SQL retains six fractional UTC digits for exact keyset boundaries.";
 const page=object({rows:{type:"array",maxItems:250,items:ref("OperationalQueueItemV2")},total_count:count,filtered_count:count,
  next_cursor:nullable(str(4096)),prev_cursor:nullable(str(4096)),has_more:{type:"boolean"},has_previous:{type:"boolean"},
  applied_filters:{type:"array",maxItems:10,items:object({field:{type:"string",maxLength:64},op:{const:"eq"},value:{type:"string",maxLength:256}})},
  applied_sort:{type:"array",maxItems:2,items:object({field:enumeration(["created_at","operation_id"]),direction:enumeration(["asc","desc"])})}});
 const OperationalQueueV2=object({schema_version:{const:"portal.execution.operational-queue.v2"},workspace_id:{type:"string",minLength:3,maxLength:96},
  record_authority:{const:"PORTAL"},record_basis:{const:"PORTAL_CURRENT_OPERATIONAL_WORKFLOW"},coverage:{const:"AUTHORIZED_SUPPORTED_TARGETS_ONLY"},
  supported_target_types:{type:"array",prefixItems:[{const:"ACCOUNT"},{const:"PORTFOLIO"},{const:"DEPLOYMENT"}],items:false,minItems:3,maxItems:3},
  source_integration_state:{const:"UNAVAILABLE"},source_side_effect_requested:{const:false},source_as_of_ms:{type:"null"},observed_at_ms:count,
  read_truth:object({state:enumeration(["AVAILABLE","EMPTY"]),reason_code:nullable({type:"string"}),scope:{const:"REQUEST"}}),page});
 OperationalQueueV2.description="Counts are scoped BEFORE filters/page/sort/edge probes to current supported audit tuples. Nonzero authority with zero rows is EMPTY; no authority is404. Runtime additionally enforces total>=filtered>=page rows, exact read_truth, and has_more/previous iff their opaque cursor is nonnull. Bound1MiB. No ADMIN/read_all/creator bypass or actor/prose/incident/source journal disclosure.";
 const OperationalWorkflowV2=object({schema_version:{const:"portal.execution.operational-workflow.v2"},
  family:{const:"F0_BACKED_PORTAL_WORKFLOW"},record_authority:{const:"PORTAL"},source_side_effect_requested:{const:false},
  provenance_basis:enumeration(["SQL_EXACT_SOURCE_TIMESTAMP","LEGACY_DATE_MILLISECOND_COPY"]),
  observed_at_ms:count,operation:ref("OperationalQueueItemV2"),intent:ref("F0BlockedOperationRead")});
 OperationalWorkflowV2.description="Actual immutable workspace/id/key/target/environment/source queue-F0 join, not inferred family. provenance_basis distinguishes exact SQL timestamp copy from the existing writer's historical JS Date millisecond truncation (not arbitrary tolerance); historical bytes are not rewritten. Different author with full exact current audit is allowed; explicit F0 routes retain their own-author ceiling. Runtime additionally enforces operation ids equal; original planning expiry is not read expiry.";
 const OperationalIncidentCurrentV2=object({schema_version:{const:"portal.execution.incident-current-root.v2"},record_authority:{const:"PORTAL"},
  record_basis:{const:"CURRENT_ROOT_NOT_HISTORICAL_LINEAGE"},incident_id:id,workspace_id:{type:"string",minLength:3,maxLength:96},target,environment,severity,
  workflow_state:enumeration(["OPEN","MITIGATED","RESOLVED"]),workflow_version:version,acknowledged_at:nullable(time),mitigated_at:nullable(time),
  resolved_at:nullable(time),created_at:time,updated_at:time,observed_at_ms:count,source_integration_state:{const:"UNAVAILABLE"},
  source_side_effect_requested:{const:false},deployment_resume_requested:{const:false},
  historical_children:object({availability:{const:"NOT_PUBLISHED"},reason_code:{const:"ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED"}})});
 OperationalIncidentCurrentV2.description="Current Portal root only; target/env/version rechecked before final authority. Forward target guard never attests old annotations/evidence/links/actors or counts. MITIGATED/RESOLVED are local triage, not broker safety. Runtime additionally enforces finite ordered dates and lifecycle timestamp shape.";
 const composition=(field,body,surface)=>object({schema_version:{const:"execution.operational-composition.v1"},
  logical_operation_id:{const:"executionOperational"+surface+"V1"},record_authority:{const:"PORTAL_CONTROL"},source_authority:{const:"PORTAL_CONTROL_ONLY"},
  workspace_id:{type:"string",minLength:3,maxLength:96},read_at_ms:count,read_at:time,composite_revision:digest,
  source_health:{...absent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED"),required:["input_digest","state","reason_code","source_side_effect_requested"],
    properties:{input_digest:digest,...absent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED").properties}},
  redacted_command_journal:{...absent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED"),required:["digest","state","reason_code","source_side_effect_requested"],
    properties:{digest,...absent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED").properties}},
  canary_twin_comparison:absent("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"),
  command_authority:object({state:{const:"UNCHANGED_FAIL_CLOSED"},source_side_effect_requested:{const:false}}),
  lineage:object({source_health_input_digest:digest,command_journal_digest:digest,workflow_digest:digest,formula_version:{const:"execution.operational-composition.v1"}}),
  data:object({[field]:ref(body)})});
 return {OperationalQueueItemV2,OperationalQueueV2,OperationalWorkflowV2,OperationalIncidentCurrentV2,
  OperationalQueueCompositionV2:composition("operations_queue","OperationalQueueV2","OperationsQueue"),
  OperationalIncidentCompositionV2:composition("incident","OperationalIncidentCurrentV2","IncidentDetail")};
}

function response(schema,description){const headers={"Cache-Control":{schema:{const:"private, no-store"}}};
 const result={"200":{description,headers,content:{"application/json":{schema}}}};
 for(const status of [400,401,403,404,409,503])result[status]={headers,description:
  status===400?"Strict input/cursor invalid or unsupported assigned_to filter; contextual refusal fenced after current authority.":
   status===404?"Uniform missing/hidden operational record or no usable current audit authority.":
    status===409?"Current authority/cursor/incident root changed; refresh without legacy fallback.":
     status===503?"Fixed unqualified/not-configured/integrity/byte/census unavailable; never raw provider/SQL/prose or false empty.":"Authenticated current Portal session/authority required.",
  content:{"application/json":{schema:{$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"}}}};
 return result;
}
export function updateOperationalPaths(api){
 const path="/api/v1/execution/operations",get=api.paths[path].get;
 get.description="Sticky current Core mode is selected before strict parsing. Legacy v1 remains separate. V2 requires complete current TS-accepted audit tuples ACCOUNT/PORTFOLIO/DEPLOYMENT per environment BEFORE SQL counts/page; USER/ADMIN are not grants. Source journal unavailable, no mutation. assigned_to is unsupported in V2 (400), not ignored. Existing limit1..250 and both cursor directions preserved; optional target_id narrows the query.";
 get.parameters.push(...(!get.parameters.some(p=>p.name==="target_id")?[{name:"target_id",in:"query",required:false,schema:id}]:[]));
 get.responses=response({oneOf:[{$ref:"../schemas/execution-operations.v1.schema.json#/$defs/OperationQueueResponse"},
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/OperationalQueueV2"}]},"Legacy Portal queue OR finite current-audit V2 cohort, never a global/source completeness claim.");
 const incident=api.paths["/api/v1/execution/operations/incidents/{incident_id}"].get;
 incident.description="Legacy detail remains separate. SCOPED_V2 publishes only current finite Portal root under current exact audit; original children are NOT_PUBLISHED. No title/prose/actors/evidence hashes/counts loaded. No mutation or source side effects.";
 incident.responses=response({oneOf:[{$ref:"../schemas/execution-operations.v1.schema.json#/$defs/IncidentDetail"},
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/OperationalIncidentCurrentV2"}]},"Legacy incident OR finite authorized current root.");
}
export function operationalCurrentFixture(){
 const old=JSON.parse(readFileSync(resolve(root,"fixtures/execution-command-operation.valid.json"),"utf8"));
 const item={operation_id:old.operation_id,operation_kind:"EXECUTION_COMMAND",command_key:old.command_key,
  target:{type:"ACCOUNT",id:"acc_TEST_ONLY_operational"},environment:"PAPER",risk_tier:"BLOCKED",severity:"WARNING",
  source_authority:"PORTAL",source_status:"BLOCKED",verification_result:"NOT_STARTED",triage_state:"UNACKNOWLEDGED",workflow_version:1,
  acknowledged_at:null,resolved_at:null,created_at:old.created_at,updated_at:old.updated_at};
 return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,
  queue:{schema_version:"portal.execution.operational-queue.v2",workspace_id:"ws_TEST_ONLY_operational",record_authority:"PORTAL",
   record_basis:"PORTAL_CURRENT_OPERATIONAL_WORKFLOW",coverage:"AUTHORIZED_SUPPORTED_TARGETS_ONLY",supported_target_types:["ACCOUNT","PORTFOLIO","DEPLOYMENT"],
   source_integration_state:"UNAVAILABLE",source_side_effect_requested:false,source_as_of_ms:null,observed_at_ms:0,
   read_truth:{state:"AVAILABLE",reason_code:null,scope:"REQUEST"},page:{rows:[item],total_count:1,filtered_count:1,next_cursor:null,prev_cursor:null,
    has_more:false,has_previous:false,applied_filters:[],applied_sort:[{field:"created_at",direction:"desc"},{field:"operation_id",direction:"desc"}]}},
  workflow:{schema_version:"portal.execution.operational-workflow.v2",family:"F0_BACKED_PORTAL_WORKFLOW",record_authority:"PORTAL",source_side_effect_requested:false,
   provenance_basis:"SQL_EXACT_SOURCE_TIMESTAMP",
   observed_at_ms:0,operation:item,intent:old},
  incident:{schema_version:"portal.execution.incident-current-root.v2",record_authority:"PORTAL",record_basis:"CURRENT_ROOT_NOT_HISTORICAL_LINEAGE",
   incident_id:"inc_TEST_ONLY_operational",workspace_id:"ws_TEST_ONLY_operational",target:item.target,environment:"PAPER",severity:"WARNING",
   workflow_state:"OPEN",workflow_version:1,acknowledged_at:null,mitigated_at:null,resolved_at:null,created_at:old.created_at,updated_at:old.updated_at,observed_at_ms:0,
   source_integration_state:"UNAVAILABLE",source_side_effect_requested:false,deployment_resume_requested:false,
   historical_children:{availability:"NOT_PUBLISHED",reason_code:"ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED"}}};
}
export function synchronizeOperationalFixture(check){
 const path=resolve(root,"fixtures/execution-operational-current.synthetic.valid.json"),bytes=JSON.stringify(operationalCurrentFixture(),null,2)+"\n";
 if(check){if(readFileSync(path,"utf8")!==bytes)throw new Error("Current operational fixture drift");}else writeFileSync(path,bytes);
}
