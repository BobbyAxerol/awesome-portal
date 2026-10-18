/** Finite additive R2/Paper Exit schemas and explicitly synthetic fixtures.
 * Schema/TEST_ONLY fixture publication only; never policy installation or runtime authority.
 */
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const object=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const enumeration=values=>({type:"string",enum:values});
const nullable=schema=>({anyOf:[schema,{type:"null"}]});
const id={type:"string",minLength:1,maxLength:191,pattern:"^[A-Za-z0-9._:-]+$"};
const text={type:"string",minLength:1,maxLength:191,not:{pattern:"[\\u0000-\\u001f\\u007f]"}};
const count={type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const version={...count,minimum:1};
const digest={type:"string",pattern:"^sha256:[0-9a-f]{64}$"};
const ref=name=>({$ref:"#/$defs/"+name});
const absence=()=>object({availability:{const:"NOT_PUBLISHED"},reason_code:{const:"PARENT_FIELD_PURPOSE_NOT_QUALIFIED"}});
const sourceAbsent=reason=>object({state:{const:"UNAVAILABLE"},reason_code:{const:reason},source_side_effect_requested:{const:false}});
const reference=name=>({$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name});
export const parentReadRoutes={r2:"/api/v1/execution/governance/approvals/{approval_id}/r2",
  paperExit:"/api/v1/execution/governance/exit-reviews/{review_id}"};
export const parentFixtureName="execution-positive-parent.synthetic.valid.json";

/** Exact finite public shape. Cross-field identity/time/projected-key checks
 * remain in canonical Zod; descriptions and tests name them explicitly rather
 * than claiming standard JSON Schema can compare arbitrary sibling values.
 */
export function parentCurrentSchemas(){
  const approval=gate=>({...object({approval_id:id,gate:{const:gate},
    status:enumeration(["PENDING","APPROVED","APPROVED_WITH_CONDITION","DENIED","CHANGES_REQUESTED","EXPIRED"]),
    approval_version:version,policy_version:text,quorum_required:version,quorum_met:count,evidence_complete:{type:"boolean"},
    created_at_ms:count,updated_at_ms:count,sla_due_at_ms:count,expires_at_ms:count,decided_at_ms:nullable(count)}),
    description:"Portal timestamps, not source freshness. Runtime additionally checks updated/expires/SLA/nonnull decided >= created. Historical planning expiry does not expire current-authorized read."});
  const base=gate=>({schema_version:{const:"portal.execution.governance-parent.v2"},workspace_id:{type:"string",minLength:3,maxLength:96},
    record_authority:{const:"PORTAL"},provenance_basis:{const:"CURRENT_CORE_BASELINE"},
    field_contract_revision:{const:"portal.execution.parent-fields.v1"},observed_at_ms:count,
    source:object({authority:{const:"PORTAL"},source_verdict:{const:"NOT_ASSERTED"},source_side_effect_requested:{const:false}}),
    anchors:object({deployment_id:id,portfolio_id:id,environment:{const:"PAPER"}}),approval:approval(gate)});
  const R2ParentReadV2={...object({...base("R2"),family:{const:"R2"},lineage:{oneOf:[object({availability:{const:"AVAILABLE"},
    basis:{const:"STORED_IMMUTABLE_REFERENCE"},r1_approval_id:id,observed_risk_grant_id:id,currency:text}),absence()]}}),
    description:"Finite current-authorized Portal R2 parent. Stored lineage is historical reference, never an effective TS grant, current R1 permission, source acceptance or dispatch. No prose, actors or monetary values."};
  const panel={...object({panel_id:id,ordinal:count,
    panel_kind:enumeration(["OBSERVATION_COVERAGE","DRIFT","LIMITS_HEALTH","PORTFOLIO_FIT"]),
    source_authority:enumeration(["RESEARCH","EXECUTION","BROKER","DERIVED"]),
    panel_state:enumeration(["OK","PARTIAL","STALE","UNAVAILABLE","ERROR"]),as_of_ms:nullable(count),
    freshness_state:enumeration(["OK","STALE","UNKNOWN"]),source_completeness:enumeration(["EVENT_SOURCED","POLL_BOUNDED","UNKNOWN"]),
    poll_interval_ms:nullable({type:"integer",minimum:100,maximum:3600000}),formula_version:nullable(text)}),
    allOf:[
      {if:{properties:{freshness_state:{const:"OK"}},required:["freshness_state"]},then:{properties:{as_of_ms:count}}},
      {if:{properties:{source_completeness:{const:"POLL_BOUNDED"}},required:["source_completeness"]},
        then:{properties:{poll_interval_ms:{type:"integer",minimum:100,maximum:3600000}}},
        else:{properties:{poll_interval_ms:{type:"null"}}}},
    ]};
  const finding=object({finding_id:id,panel_id:id,ordinal:count,outcome:enumeration(["PASS","WATCH","FAIL","INSUFFICIENT"]),
    blocking:{type:"boolean"},required:{type:"boolean"},as_of_ms:nullable(count)});
  const evaluation={...object({availability:{const:"AVAILABLE"},evaluation_policy_version:text,evaluation_formula_version:text,
    panels:{type:"array",maxItems:4,items:panel},findings:{type:"array",maxItems:256,items:finding}}),
    description:"Runtime additionally checks unique panel_id/panel_kind/panel ordinal/finding_id and finding.panel_id membership. Empty retained arrays do not assert source completeness. No prose/URLs/actors/financial values or private integrity preimages."};
  const review={...object({review_id:id,review_state:enumeration(["PENDING","EXTENDED","REJECTED_TO_PAPER_HELD","PROMOTION_AUTHORIZED"]),
    review_version:version,promote_to:{const:"SANDBOX_VALIDATION"},extension_days:nullable({const:14}),extended_until_ms:nullable(count),
    created_at_ms:count,updated_at_ms:count}),allOf:[
      {if:{properties:{review_state:{const:"EXTENDED"}},required:["review_state"]},
        then:{properties:{extension_days:{const:14},extended_until_ms:count}},
        else:{properties:{extension_days:{type:"null"},extended_until_ms:{type:"null"}}}},
    ],description:"Runtime additionally checks updated>=created and review_id===approval.approval_id. Review disposition is Portal-only, never upstream promotion."};
  const PaperExitParentReadV2={...object({...base("PAPER_EXIT"),family:{const:"PAPER_EXIT"},review,
    evaluation:{oneOf:[evaluation,absence()]},lineage:{oneOf:[object({availability:{const:"AVAILABLE"},
      basis:{const:"VERIFIED_CURRENT_STORED_BYTES_NOT_SOURCE_ACCEPTANCE"},r1_approval_id:id,r2_approval_id:id,
      source_snapshot_hash:digest,evidence_set_hash:digest}),absence()]}}),
    description:"Finite current-authorized Paper Exit. Current stored bytes verified for integrity, not historical source acceptance. Optional sections require their own exact current reviewed field purposes. No raw capture/preimage/private intent/prose is returned."};
  const composition=(surface,data)=>object({schema_version:{const:"execution.operational-composition.v1"},
    logical_operation_id:{const:"executionOperational"+surface+"V1"},record_authority:{const:"PORTAL_CONTROL"},source_authority:{const:"PORTAL_CONTROL_ONLY"},
    workspace_id:{type:"string",minLength:3,maxLength:96},read_at_ms:count,read_at:{type:"string",format:"date-time",pattern:"Z$"},composite_revision:digest,
    source_health:object({input_digest:digest,...sourceAbsent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED").properties}),
    redacted_command_journal:object({digest,...sourceAbsent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED").properties}),
    canary_twin_comparison:sourceAbsent("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"),
    command_authority:object({state:{const:"UNCHANGED_FAIL_CLOSED"},source_side_effect_requested:{const:false}}),
    lineage:object({source_health_input_digest:digest,command_journal_digest:digest,workflow_digest:digest,
      formula_version:{const:"execution.operational-composition.v1"}}),data:object(data)});
  return {R2ParentReadV2,PaperExitParentReadV2,
    OperationalR2ParentCompositionV2:composition("ApprovalR2",{governance:ref("R2ParentReadV2"),accepted_manager_facts:{type:"null"}}),
    OperationalPaperExitParentCompositionV2:composition("PaperExitReview",{exit_review:ref("PaperExitParentReadV2")})};
}

function response(schema,description){
  const headers={"Cache-Control":{schema:{const:"private, no-store"}}};
  const result={"200":{description,headers,content:{"application/json":{schema}}}};
  for(const status of [400,401,403,404,409,503])result[status]={headers,
    description:status===400?"Strict finite input invalid.":status===401?"Current authenticated Portal session required.":
      status===403?"Current actor/session lifecycle denied; no parent detail returned.":
      status===404?"Uniform unknown, hidden, wrong workspace/family/target parent; no disclosure.":
      status===409?"ACCESS_RETRY_REQUIRED: current authority or stored parent changed; no legacy fallback.":
      "Fixed parent field-purpose, integrity, bound or configuration unavailable; no raw SQL/provider/Zod text.",
    content:{"application/json":{schema:{$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"}}}};
  return result;
}

/** Mutates ONLY two existing governance GETs and four finite component entries.
 * Caller uses existing finite-member writer; never serialize the historical doc.
 * Existing ids, parameters, security, captures/decision POSTs and defaults survive.
 * Compositions are pure components: do not invent public composition paths.
 */
export function updateParentPaths(api){
  const specifications=[
    [parentReadRoutes.r2,"R2ParentReadV2",{$ref:"#/components/schemas/R2ReviewResponse"}],
    [parentReadRoutes.paperExit,"PaperExitParentReadV2",{$ref:"../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitReviewResponse"}],
  ];
  for(const [path,name,legacy]of specifications){
    const get=api.paths?.[path]?.get;if(!get)throw new Error("Missing existing parent GET: "+path);
    get.description="Sticky current Core mode is selected before finite parent detail. Legacy v1 remains separate. SCOPED_V2 requires current exact deployment AND portfolio PAPER audit plus the existing gate and reviewed root field purpose before protected loading. R2 uses governance.r2.read; Paper Exit preserves active membership. Optional lineage/evaluation has its own purpose. Historical planning expiry is not read expiry; CURRENT_CORE_BASELINE is not source attestation. No owner/ADMIN shortcut, mutation, upstream call or current-source verdict. One shared authority flight fences the pure response after storage/source rechecks and LAST Core.";
    get.responses={...get.responses,...response({oneOf:[legacy,reference(name)]},
      "Legacy parent OR finite current-authorized v2 parent; optional absence stays typed and no source decision is asserted.")};
  }
  api.components??={};api.components.schemas??={};
  for(const name of Object.keys(parentCurrentSchemas()))api.components.schemas[name]=reference(name);
  return specifications.map(([path])=>path);
}

function canonical(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+":"+canonical(item)).join(",")}}`;
}
const hash=value=>"sha256:"+createHash("sha256").update(canonical(value),"utf8").digest("hex");
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(!value||typeof value!=="object")return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!["read_at","read_at_ms","observed_at_ms","next_cursor","prev_cursor"].includes(key))
    .map(([key,item])=>[key,stable(item)]));
}

/** Pure TEST_ONLY mirror of currentComposition; does not authorize anything.
 * The nested body is already qualified by the runtime; this helper never loads it.
 */
export function parentCompositionFixture(surface,body,workspaceId,readAtMs){
  if(!["approval_r2","paper_exit_review"].includes(surface))throw new Error("TEST_ONLY unsupported parent surface");
  const unavailable=reason=>({state:"UNAVAILABLE",reason_code:reason,source_side_effect_requested:false});
  const input=hash("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED");
  const lineage={source_health_input_digest:input,command_journal_digest:input,workflow_digest:hash(stable(body)),
    formula_version:"execution.operational-composition.v1"};
  return {schema_version:"execution.operational-composition.v1",logical_operation_id:"executionOperational"+
    surface.split("_").map(part=>part[0].toUpperCase()+part.slice(1)).join("")+"V1",
    record_authority:"PORTAL_CONTROL",source_authority:"PORTAL_CONTROL_ONLY",workspace_id:workspaceId,
    read_at_ms:readAtMs,read_at:new Date(readAtMs).toISOString(),composite_revision:hash({surface,lineage}),
    source_health:{input_digest:input,...unavailable("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED")},
    redacted_command_journal:{digest:input,...unavailable("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED")},
    canary_twin_comparison:unavailable("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"),
    command_authority:{state:"UNCHANGED_FAIL_CLOSED",source_side_effect_requested:false},lineage,data:body};
}

export function parentCurrentFixture(){
  const created=Date.parse("2026-10-01T00:00:00.000Z"),observed=Date.parse("2026-10-18T00:00:00.000Z");
  const base={schema_version:"portal.execution.governance-parent.v2",workspace_id:"ws_TEST_ONLY_parent",record_authority:"PORTAL",
    provenance_basis:"CURRENT_CORE_BASELINE",field_contract_revision:"portal.execution.parent-fields.v1",observed_at_ms:observed,
    source:{authority:"PORTAL",source_verdict:"NOT_ASSERTED",source_side_effect_requested:false},
    anchors:{deployment_id:"dep_TEST_ONLY_parent",portfolio_id:"pf_TEST_ONLY_parent",environment:"PAPER"}};
  const approval=(approvalId,gate)=>({approval_id:approvalId,gate,status:"PENDING",approval_version:1,
    policy_version:"TEST_ONLY:policy-v1",quorum_required:2,quorum_met:0,evidence_complete:false,
    created_at_ms:created,updated_at_ms:created,sla_due_at_ms:created+86400000,expires_at_ms:created+172800000,decided_at_ms:null});
  const absent={availability:"NOT_PUBLISHED",reason_code:"PARENT_FIELD_PURPOSE_NOT_QUALIFIED"};
  const r2={...base,family:"R2",approval:{...approval("apr_TEST_ONLY_r2","R2"),status:"EXPIRED"},
    lineage:{availability:"AVAILABLE",basis:"STORED_IMMUTABLE_REFERENCE",r1_approval_id:"apr_TEST_ONLY_r1",
      observed_risk_grant_id:"grant_TEST_ONLY_historical",currency:"TEST_ONLY:USD"}};
  const paperExit={...base,family:"PAPER_EXIT",approval:approval("apr_TEST_ONLY_exit","PAPER_EXIT"),
    review:{review_id:"apr_TEST_ONLY_exit",review_state:"PENDING",review_version:1,promote_to:"SANDBOX_VALIDATION",
      extension_days:null,extended_until_ms:null,created_at_ms:created,updated_at_ms:created},
    evaluation:{availability:"AVAILABLE",evaluation_policy_version:"TEST_ONLY:exit-policy",evaluation_formula_version:"TEST_ONLY:exit-formula",
      panels:["OBSERVATION_COVERAGE","DRIFT","LIMITS_HEALTH","PORTFOLIO_FIT"].map((kind,index)=>({panel_id:"panel_TEST_ONLY_"+index,
        ordinal:index,panel_kind:kind,source_authority:index===0?"RESEARCH":"EXECUTION",panel_state:index===0?"OK":"UNAVAILABLE",
        as_of_ms:index===0?created:null,freshness_state:index===0?"OK":"UNKNOWN",source_completeness:index===0?"POLL_BOUNDED":"UNKNOWN",
        poll_interval_ms:index===0?1000:null,formula_version:null})),
      findings:[0,1,2,3].map(index=>({finding_id:"finding_TEST_ONLY_"+index,panel_id:"panel_TEST_ONLY_"+index,ordinal:index,
        outcome:index===0?"PASS":"INSUFFICIENT",blocking:index!==0,required:true,as_of_ms:index===0?created:null}))},
    lineage:{availability:"AVAILABLE",basis:"VERIFIED_CURRENT_STORED_BYTES_NOT_SOURCE_ACCEPTANCE",r1_approval_id:"apr_TEST_ONLY_r1",
      r2_approval_id:"apr_TEST_ONLY_r2",source_snapshot_hash:"sha256:"+"1".repeat(64),evidence_set_hash:"sha256:"+"2".repeat(64)}};
  const r2Absent={...r2,lineage:{...absent}};
  const paperExitAbsent={...paperExit,evaluation:{...absent},lineage:{...absent}};
  const paperExitExtended={...paperExit,review:{...paperExit.review,review_state:"EXTENDED",review_version:2,
    extension_days:14,extended_until_ms:created+14*86400000,updated_at_ms:created+86400000}};
  return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,production_config:false,
    authority_installed:false,r2,r2_absent:r2Absent,paper_exit:paperExit,paper_exit_absent:paperExitAbsent,paper_exit_extended:paperExitExtended,
    r2_composition:parentCompositionFixture("approval_r2",{governance:r2,accepted_manager_facts:null},base.workspace_id,observed),
    paper_exit_composition:parentCompositionFixture("paper_exit_review",{exit_review:paperExit},base.workspace_id,observed)};
}

/** Called by existing operation-reader synchronizer after finite member updates.
 * No top-level execution: Main owns when generation/check is permitted.
 */
export function synchronizeParentFixture(check=false){
  const path=resolve(root,"fixtures/"+parentFixtureName),bytes=JSON.stringify(parentCurrentFixture(),null,2)+"\n";
  if(check){if(readFileSync(path,"utf8")!==bytes)throw new Error("Positive parent fixture drift");}
  else writeFileSync(path,bytes);
}
