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
export const followingReadRoutes={
  sandbox:"/api/v1/execution/deployments/{deployment_id}/certification",
  canary:"/api/v1/execution/deployments/{deployment_id}/canary",
};
export const liveParentReadRoute="/api/v1/execution/governance/approvals/{approval_id}/live";

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
  // Selected stored Portal plan, never source acceptance/apply permission.
  // ROOT schemas above and their semantic digests remain unchanged.
  const selectedOperation={schema_version:{const:"portal.execution.governance-parent-operation.v2"},
    operation_id:id,command_version:{const:1},expected_version:version,
    status:enumeration(["PLANNED","APPLIED","EXPIRED"]),parent_approval_id:nullable(id),
    parent_approval_version:nullable(version),parent_evidence_set_hash:nullable(digest),
    created_at_ms:count,expires_at_ms:count,applied_at_ms:nullable(count)};
  const appliedState={if:{properties:{status:{const:"APPLIED"}},required:["status"]},
    then:{properties:{applied_at_ms:count}},else:{properties:{applied_at_ms:{type:"null"}}}};
  const capturedPins={oneOf:[
    {properties:{parent_approval_id:{type:"null"},parent_approval_version:{type:"null"},parent_evidence_set_hash:{type:"null"}}},
    {properties:{parent_approval_id:id,parent_approval_version:version,parent_evidence_set_hash:digest}},
  ]};
  const operationDescription="Exact selected Portal plan with current-authorized ROOT metadata. APPLIED is stored Portal state, NOT TS acceptance/settlement/verification. Original expiry is historical metadata, not current read TTL; no status rewrite. Runtime additionally checks expires_at_ms>=created_at_ms and nonnull applied_at_ms>=created_at_ms, plus ROOT timestamp relations. Public millisecond equality is valid for a strictly positive sub-ms stored interval. No private intent, actor, token, response, receipt, prose or optional parent section.";
  const R2ParentOperationReadV2={...object({...base("R2"),...selectedOperation,family:{const:"R2"},
    command_type:{const:"GOVERNANCE_R2_DECISION"},decision:enumeration(["APPROVE","APPROVE_WITH_CONDITION","DENY"])}),
    allOf:[appliedState,capturedPins],description:operationDescription+" R2 captured parent pins are all-null or all-present; they are NOT today's R1 version or current permission."};
  const PaperExitParentOperationReadV2={...object({...base("PAPER_EXIT"),...selectedOperation,family:{const:"PAPER_EXIT"},
    command_type:{const:"GOVERNANCE_PAPER_EXIT_DECISION"},decision:enumeration(["PROMOTE","EXTEND_OBSERVATION","REJECT"]),
    parent_approval_id:{type:"null"},parent_approval_version:{type:"null"},parent_evidence_set_hash:{type:"null"}}),
    allOf:[appliedState],description:operationDescription+" Paper plans do not capture parent_approval_*; all three fields must remain null. expected_version is the captured review version."};
  const LiveParentReadV2={...object({...base("LIVE_GATE"),
    schema_version:{const:"portal.execution.live-parent.v2"},family:{const:"LIVE_GATE"},
    anchors:object({deployment_id:id,environment:{const:"LIVE"}}),
    source:object({authority:{const:"PORTAL"},source_verdict:{const:"NOT_ASSERTED"},
      source_side_effect_requested:{const:false},runtime_activation_requested:{const:false}}),
    accepted_manager_facts:object({availability:{const:"NOT_PUBLISHED"},
      reason_code:{const:"PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION"}})}),
    description:"Finite stored Portal LIVE_GATE under current exact DEPLOYMENT/LIVE audit, independent governance.live.read and reviewed LIVE_ROOT purpose. No Portfolio or R1/R2 predecessor was captured or fabricated. Historical expiry is metadata, not current read authority. Manifest integrity is local stored-byte verification, not TS acceptance, broker state or runtime commissioning; source facts stay separately unavailable. Runtime additionally verifies timestamp ordering, exact workspace/parent/target and original manifest. No private actor/prose/hash preimage."};
  return {R2ParentReadV2,PaperExitParentReadV2,
    OperationalR2ParentCompositionV2:composition("ApprovalR2",{governance:ref("R2ParentReadV2"),accepted_manager_facts:{type:"null"}}),
    OperationalPaperExitParentCompositionV2:composition("PaperExitReview",{exit_review:ref("PaperExitParentReadV2")}),
    R2ParentOperationReadV2,PaperExitParentOperationReadV2,...followingCurrentSchemas(),LiveParentReadV2,
    OperationalLiveParentCompositionV2:composition("LiveReview",{governance:ref("LiveParentReadV2"),
      accepted_manager_facts:LiveParentReadV2.properties.accepted_manager_facts})};
}

/** Same finite parent tooling, not another source or schema authority.
 * Current correspondence is NOT captured historical native membership.
 */
function followingCurrentSchemas(){
  const base={
    schema_version:{const:"portal.execution.following-parent.v2"},
    workspace_id:{type:"string",minLength:3,maxLength:96},record_authority:{const:"PORTAL"},
    provenance_basis:{const:"CURRENT_CORE_BASELINE"},
    field_contract_revision:{const:"portal.execution.parent-fields.v1"},observed_at_ms:count,
    source:object({authority:{const:"PORTAL"},source_verdict:{const:"NOT_ASSERTED"},
      source_side_effect_requested:{const:false},runtime_activation_requested:{const:false},
      promotion_execution_requested:{const:false}}),
    accepted_manager_facts:object({availability:{const:"NOT_PUBLISHED"},
      reason_code:{const:"PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION"}}),
  };
  const anchors=environment=>object({deployment_id:id,portfolio_id:id,environment:{const:environment},
    association_basis:{const:"CURRENT_NATIVE_TARGET_CORRESPONDENCE"},captured_environment_attested:{const:false}});
  const stepKeys=["CONNECT","SYNC","ORDER_TYPES","RECONCILIATION","TIMEBOXED_RUN","CLEANUP","EXIT_REVIEW"];
  const step={...object({step_key:enumeration(stepKeys),availability:enumeration(["AVAILABLE","NOT_RECORDED"]),
    evidence_id:nullable(id),stored_evaluation_state:nullable(enumeration(["PASS","FAIL","STALE","UNAVAILABLE"])),
    source_authority:nullable(enumeration(["PORTAL","EXECUTION","BROKER","DERIVED"])),
    source_verification_state:nullable(enumeration(["VERIFIED","UNAVAILABLE"])),
    as_of_ms:nullable(count),expires_at_ms:nullable(count)}),
    allOf:[{if:{properties:{availability:{const:"AVAILABLE"}},required:["availability"]},
      then:{properties:{evidence_id:id,stored_evaluation_state:enumeration(["PASS","FAIL","STALE","UNAVAILABLE"]),
        source_authority:enumeration(["PORTAL","EXECUTION","BROKER","DERIVED"]),
        source_verification_state:enumeration(["VERIFIED","UNAVAILABLE"])}},
      else:{properties:Object.fromEntries(["evidence_id","stored_evaluation_state","source_authority",
        "source_verification_state","as_of_ms","expires_at_ms"].map(key=>[key,{type:"null"}]))}}],
    description:"Stored evaluation, not a recomputed freshness/certification verdict. AVAILABLE requires four stored identity/state/authority facts, but source times may be null. NOT_RECORDED has all six facts null, never fabricated evidence or PASS."};
  const certification={...object({certification_id:id,
    workflow_state:enumeration(["DRAFT","IN_REVIEW","APPROVED","DENIED"]),workflow_version:version,
    policy_version:text,formula_version:text,created_at_ms:count,updated_at_ms:count,
    submitted_at_ms:nullable(count),decided_at_ms:nullable(count),
    source_integration_state:enumeration(["UNAVAILABLE","SHADOW"]),delivery_profile:enumeration(["fixture","shadow"])}),
    allOf:[
      {if:{properties:{workflow_state:{const:"DRAFT"}},required:["workflow_state"]},
        then:{properties:{submitted_at_ms:{type:"null"}}},else:{properties:{submitted_at_ms:count}}},
      {if:{properties:{workflow_state:{enum:["APPROVED","DENIED"]}},required:["workflow_state"]},
        then:{properties:{decided_at_ms:count}},else:{properties:{decided_at_ms:{type:"null"}}}},
    ],
    description:"Stored Portal lifecycle, never source certification or current promotion eligibility. Runtime additionally checks updated_at_ms>=created_at_ms, submitted_at_ms>=created_at_ms when present and decided_at_ms>=submitted_at_ms when present. Public millisecond equality is legal."};
  const stepsAvailable={...object({availability:{const:"AVAILABLE"},basis:{const:"CURRENT_LATEST_STORED"},
    items:{type:"array",minItems:7,maxItems:7,items:step,
      allOf:stepKeys.map(key=>({contains:{type:"object",required:["step_key"],properties:{step_key:{const:key}}},
        minContains:1,maxContains:1}))}}),
    description:"Exactly one of each seven fixed step keys, independent of array order. Latest stored facts may include missing/expired/source-unavailable records; no eligibility total or source PASS is inferred."};
  const SandboxParentReadV2={...object({...base,family:{const:"SANDBOX"},anchors:anchors("SANDBOX"),certification,
    steps:{oneOf:[stepsAvailable,absence()]},
    lineage:{oneOf:[object({availability:{const:"AVAILABLE"},basis:{const:"STORED_PORTAL_REFERENCE"},
      promotion_grant_id:id,paper_exit_review_id:id,r1_approval_id:id,r2_approval_id:id}),absence()]}}),
    description:"Finite Portal Sandbox root under current exact SANDBOX deployment+portfolio audit, reviewed SANDBOX_ROOT fields and active workspace membership. CURRENT_NATIVE_TARGET_CORRESPONDENCE is a current association only, NOT an attested historical native deployment/portfolio edge. Optional steps/lineage each require their own exact reviewed purpose. Source/runtime/promotion effects are false. No private account, operator, prose, URLs, smoke amounts, raw evidence or commands."};
  const positiveDecimal={type:"string",pattern:"^(?:0|[1-9][0-9]{0,19})(?:\\.[0-9]{1,18})?$",not:{pattern:"^[0.]+$"}};
  const proposal=object({availability:{const:"AVAILABLE"},basis:{const:"PROPOSED_NOT_EFFECTIVE"},
    base_risk_profile_revision:text,currency:{type:"string",pattern:"^[A-Z0-9]{2,12}$"},
    capital_cap:positiveDecimal,gross_notional_cap:positiveDecimal,daily_loss_cap:positiveDecimal,
    max_open_orders:{type:"integer",minimum:1,maximum:1000000},duration_days:{type:"integer",minimum:1,maximum:90}});
  const envelope={...object({envelope_id:id,revision:version,previous_envelope_id:nullable(id),status:{const:"DRAFT"},
    expected_certification_version:version,created_at_ms:count,source_integration_state:{const:"UNAVAILABLE"},
    delivery_profile:{const:"fixture"},production_command_active:{const:false}}),
    allOf:[{if:{properties:{revision:{const:1}},required:["revision"]},
      then:{properties:{previous_envelope_id:{type:"null"}}},else:{properties:{previous_envelope_id:id}}}]};
  const CanaryParentReadV2={...object({...base,family:{const:"CANARY"},anchors:anchors("LIVE"),envelope,
    proposal:{oneOf:[proposal,absence()]},
    lineage:{oneOf:[object({availability:{const:"AVAILABLE"},basis:{const:"STORED_PORTAL_REFERENCE"},
      certification_id:id,promotion_plan_id:id,paper_exit_review_id:id,r1_approval_id:id,r2_approval_id:id}),absence()]}}),
    description:"Finite immutable Portal Canary DRAFT under exact current LIVE deployment+portfolio audit, independent governance.canary.read and CANARY_ROOT fields. LIVE is requested current association, NOT an attested historical native environment or active Canary. Proposal amounts are positive exact decimal strings, at most20 integer/18 fractional digits, never JS Number, economic backing/budget or effective exposure. Optional proposal/lineage each require their own reviewed purpose. Source verdict NOT_ASSERTED; production_command_active and every side-effect flag remain false. Captured certification version is historical metadata, not current eligibility."};
  return {SandboxParentReadV2,CanaryParentReadV2};
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

/** Mutates ONLY two existing governance GETs and finite component entries.
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

/** Finite updates to the TWO EXISTING following-family GETs, in their actual
 * owning documents. Error/default schemas, paths, operationIds, parameters,
 * security and POSTs are preserved; the new variant changes only GET200.
 */
export function updateFollowingParentPaths(api,document){
  const specifications=document==="execution-governance"?[
    [followingReadRoutes.sandbox,"SandboxParentReadV2",
      "../schemas/execution-sandbox-certification.v1.schema.json#/$defs/CertificationResponse"],
  ]:document==="execution-canary"?[
    [followingReadRoutes.canary,"CanaryParentReadV2",
      "../schemas/execution-canary-control-room.v1.schema.json#/$defs/CanaryControlRoom"],
  ]:null;
  if(!specifications)throw new Error("Unsupported following-parent document");
  for(const [path,name,legacyRef]of specifications){
    const get=api.paths?.[path]?.get;
    if(!get||!get.responses?.["200"])throw new Error("Missing existing following-parent GET: "+path);
    get.description="Sticky current Core mode preserves legacy v1 separately. SCOPED_V2 publishes only a finite current-authorized Portal parent after BOTH current TS-qualified deployment/portfolio audit anchors and the exact reviewed root field purpose. Sandbox uses SANDBOX current correspondence and active membership; Canary uses LIVE current correspondence plus independent governance.canary.read. Current association is NOT captured historical native membership. Optional fields require separate purposes. Stored Portal evaluation/DRAFT never asserts a source verdict, current eligibility, activated runtime or effective capital; source screens remain explicitly unpublished. No mutation/upstream call, owner/ADMIN shortcut or fallback after current-authority refusal. One shared flight fences body and contextual errors after local/source checks and LAST Core.";
    const previous=get.responses["200"];
    get.responses["200"]={...previous,
      description:"Legacy parent OR finite current-authorized v2 Portal root; not an effective source, certification, capital or execution verdict.",
      headers:{...previous.headers,"Cache-Control":{schema:{const:"private, no-store"}}},
      content:{...previous.content,"application/json":{...previous.content?.["application/json"],
        schema:{oneOf:[{$ref:legacyRef},reference(name)]}}}};
    api.components??={};api.components.schemas??={};api.components.schemas[name]=reference(name);
  }
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
  if(!["approval_r2","paper_exit_review","live_review"].includes(surface))throw new Error("TEST_ONLY unsupported parent surface");
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
  // Canonical synthetic examples only. No policy/source installation or
  // operation receipt is implied; past expiry does not rewrite stored state.
  const operation=(family,status,captured=true)=>({...base,
    schema_version:"portal.execution.governance-parent-operation.v2",family,
    approval:family==="R2"?r2.approval:paperExit.approval,
    operation_id:"op_TEST_ONLY_"+family+"_"+status+(captured?"":"_uncaptured"),
    command_type:family==="R2"?"GOVERNANCE_R2_DECISION":"GOVERNANCE_PAPER_EXIT_DECISION",
    command_version:1,expected_version:1,status,decision:family==="R2"?"DENY":"REJECT",
    parent_approval_id:family==="R2"&&captured?"apr_TEST_ONLY_r1":null,
    parent_approval_version:family==="R2"&&captured?1:null,
    parent_evidence_set_hash:family==="R2"&&captured?"sha256:"+"3".repeat(64):null,
    created_at_ms:created,expires_at_ms:created+86400000,
    applied_at_ms:status==="APPLIED"?created+1000:null});
  const followingBase={schema_version:"portal.execution.following-parent.v2",workspace_id:base.workspace_id,
    record_authority:"PORTAL",provenance_basis:"CURRENT_CORE_BASELINE",
    field_contract_revision:"portal.execution.parent-fields.v1",observed_at_ms:observed,
    source:{authority:"PORTAL",source_verdict:"NOT_ASSERTED",source_side_effect_requested:false,
      runtime_activation_requested:false,promotion_execution_requested:false},
    accepted_manager_facts:{availability:"NOT_PUBLISHED",reason_code:"PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION"}};
  const currentAnchors=environment=>({...base.anchors,environment,
    association_basis:"CURRENT_NATIVE_TARGET_CORRESPONDENCE",captured_environment_attested:false});
  const keys=["CONNECT","SYNC","ORDER_TYPES","RECONCILIATION","TIMEBOXED_RUN","CLEANUP","EXIT_REVIEW"];
  const sandbox={...followingBase,family:"SANDBOX",anchors:currentAnchors("SANDBOX"),
    certification:{certification_id:"cert_TEST_ONLY_parent",workflow_state:"APPROVED",workflow_version:3,
      policy_version:"TEST_ONLY:sandbox-policy",formula_version:"TEST_ONLY:sandbox-formula",
      created_at_ms:created,updated_at_ms:created+2000,submitted_at_ms:created+1000,decided_at_ms:created+2000,
      source_integration_state:"UNAVAILABLE",delivery_profile:"fixture"},
    steps:{availability:"AVAILABLE",basis:"CURRENT_LATEST_STORED",items:keys.map((key,index)=>index<4?{
      step_key:key,availability:"AVAILABLE",evidence_id:"evidence_TEST_ONLY_"+index,
      stored_evaluation_state:["PASS","FAIL","STALE","UNAVAILABLE"][index],
      source_authority:["PORTAL","EXECUTION","BROKER","DERIVED"][index],
      source_verification_state:index===0?"VERIFIED":"UNAVAILABLE",as_of_ms:index===0?created:null,
      expires_at_ms:index===0?created+1000:null,
    }:{step_key:key,availability:"NOT_RECORDED",evidence_id:null,stored_evaluation_state:null,
      source_authority:null,source_verification_state:null,as_of_ms:null,expires_at_ms:null})},
    lineage:{availability:"AVAILABLE",basis:"STORED_PORTAL_REFERENCE",promotion_grant_id:"grant_TEST_ONLY_parent",
      paper_exit_review_id:"apr_TEST_ONLY_exit",r1_approval_id:"apr_TEST_ONLY_r1",r2_approval_id:"apr_TEST_ONLY_r2"}};
  const sandboxAbsent={...sandbox,steps:{...absent},lineage:{...absent}};
  const sandboxDraft={...sandboxAbsent,certification:{...sandbox.certification,workflow_state:"DRAFT",
    workflow_version:1,updated_at_ms:created,submitted_at_ms:null,decided_at_ms:null}};
  const canary={...followingBase,family:"CANARY",anchors:currentAnchors("LIVE"),
    envelope:{envelope_id:"env_TEST_ONLY_parent",revision:1,previous_envelope_id:null,status:"DRAFT",
      expected_certification_version:3,created_at_ms:created,source_integration_state:"UNAVAILABLE",
      delivery_profile:"fixture",production_command_active:false},
    proposal:{availability:"AVAILABLE",basis:"PROPOSED_NOT_EFFECTIVE",base_risk_profile_revision:"TEST_ONLY:risk-proposal",
      currency:"USDT",capital_cap:"9007199254740993.123456789123456789",
      gross_notional_cap:"9007199254740994.000000000000000001",daily_loss_cap:"0.000000000000000001",
      max_open_orders:10,duration_days:7},
    lineage:{availability:"AVAILABLE",basis:"STORED_PORTAL_REFERENCE",certification_id:"cert_TEST_ONLY_parent",
      promotion_plan_id:"plan_TEST_ONLY_parent",paper_exit_review_id:"apr_TEST_ONLY_exit",
      r1_approval_id:"apr_TEST_ONLY_r1",r2_approval_id:"apr_TEST_ONLY_r2"}};
  const canaryAbsent={...canary,proposal:{...absent},lineage:{...absent}};
  const canaryRevision={...canary,envelope:{...canary.envelope,envelope_id:"env_TEST_ONLY_parent_2",
    revision:2,previous_envelope_id:canary.envelope.envelope_id}};
  const live={schema_version:"portal.execution.live-parent.v2",family:"LIVE_GATE",workspace_id:base.workspace_id,
    record_authority:"PORTAL",provenance_basis:"CURRENT_CORE_BASELINE",field_contract_revision:base.field_contract_revision,
    observed_at_ms:observed,anchors:{deployment_id:base.anchors.deployment_id,environment:"LIVE"},
    source:{authority:"PORTAL",source_verdict:"NOT_ASSERTED",source_side_effect_requested:false,runtime_activation_requested:false},
    approval:approval("apr_TEST_ONLY_live","LIVE_GATE"),
    accepted_manager_facts:{availability:"NOT_PUBLISHED",reason_code:"PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION"}};
  return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,production_config:false,
    authority_installed:false,r2,r2_absent:r2Absent,paper_exit:paperExit,paper_exit_absent:paperExitAbsent,paper_exit_extended:paperExitExtended,
    r2_composition:parentCompositionFixture("approval_r2",{governance:r2,accepted_manager_facts:null},base.workspace_id,observed),
    paper_exit_composition:parentCompositionFixture("paper_exit_review",{exit_review:paperExit},base.workspace_id,observed),
    r2_operation:operation("R2","PLANNED"),r2_operation_uncaptured:operation("R2","PLANNED",false),
    r2_operation_applied:operation("R2","APPLIED"),r2_operation_expired:operation("R2","EXPIRED"),
    paper_exit_operation:operation("PAPER_EXIT","PLANNED"),paper_exit_operation_applied:operation("PAPER_EXIT","APPLIED"),
    paper_exit_operation_expired:operation("PAPER_EXIT","EXPIRED"),
    sandbox,sandbox_absent:sandboxAbsent,sandbox_draft:sandboxDraft,
    canary,canary_absent:canaryAbsent,canary_revision:canaryRevision,live,
    live_composition:parentCompositionFixture("live_review",{governance:live,
      accepted_manager_facts:live.accepted_manager_facts},base.workspace_id,observed)};
}

/** Called by existing operation-reader synchronizer after finite member updates.
 * No top-level execution: Main owns when generation/check is permitted.
 */
export function synchronizeParentFixture(check=false){
  const path=resolve(root,"fixtures/"+parentFixtureName),bytes=JSON.stringify(parentCurrentFixture(),null,2)+"\n";
  if(check){if(readFileSync(path,"utf8")!==bytes)throw new Error("Positive parent fixture drift");}
  else writeFileSync(path,bytes);
}

/** Business observations are NOT parent approval metadata. These finite
 * exports share the existing generator, but do not change any parent schema,
 * field-purpose seal, currentComposition input or parent fixture semantics. */
export const liveSourceReadRoute="/api/v1/execution/deployments/{deployment_id}/live";
export const liveSourceFixtureName="execution-live-source.synthetic.valid.json";
export const liveSourcePanels=["deployments","positions","sessions","orders","fills","accounts",
  "account_balances","margin_balances","account_sync","reconciliation"];
const liveSourceGrain=key=>key==="broker_sync"?"NOT_COMMISSIONED":
  ["accounts","account_balances","margin_balances","account_sync"].includes(key)?"ACCOUNT":"DEPLOYMENT";
export function liveSourceCurrentSchemas(){
  const scalarText={type:"string",minLength:1,maxLength:4096,not:{pattern:"[\\u0000-\\u001f\\u007f]"}};
  const decimal={type:"string",maxLength:96,pattern:"^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$(?![\\s\\S])"};
  const integerString={type:"string",maxLength:96,pattern:"^(?:0|[1-9]\\d*)$(?![\\s\\S])"};
  const continuation=nullable({type:"string",maxLength:128,
    pattern:"^lps2\\.[A-Za-z0-9_-]{1,32}\\.[0-9]{1,8}\\.[0-9]{10}\\.[A-Za-z0-9_-]{43}$(?![\\s\\S])"});
  // Deliberately no required values: hidden/missing is omission, not null or0.
  const values={type:"object",additionalProperties:false,properties:{}};
  for(const key of ["deployment_id","strategy_id","account_id","portfolio_id","position_id","order_id","fill_id",
    "instrument_id","venue","currency","base_currency","state","status","side"])
    values.properties[key]=nullable(scalarText);
  values.properties.mode=nullable({const:"live"});
  for(const key of ["signed_qty","quantity","price","avg_px_open","avg_px_close","mark_price","notional",
    "realized_pnl","unrealized_pnl","total","locked","free","initial","maintenance"])
    values.properties[key]=nullable(decimal);
  for(const key of ["submitted_count","risk_rejected_count","broker_rejected_count","filled_count"])
    values.properties[key]=nullable(integerString);
  for(const key of ["created_at_ms","updated_at_ms","trade_time_ms"])
    values.properties[key]=nullable(count);
  const panel={...object({state:enumeration(["PARTIAL","NOT_PUBLISHED"]),
    reason_code:enumeration(["AUTHORIZED_RETAINED_OBSERVATIONS_ONLY","NO_AUTHORIZED_RETAINED_OBSERVATION",
      "SOURCE_PANEL_NOT_CAPTURED","DEPLOYMENT_GRAIN_NOT_PROVEN","BROKER_PURPOSE_NOT_COMMISSIONED"]),
    source_as_of_ms:{type:"null"},source_clock_reason:{const:"SOURCE_CLOCK_NOT_SCOPED"},
    provenance:object({dataset_id:nullable(scalarText),purpose:nullable(enumeration(["alpha.read","account.read"])),
      field_contract_revision:{const:"portal.execution.live-source-fields.v2"},field_policy_ref:nullable(scalarText),
      projection_basis:{const:"SAME_RETAINED_DOCUMENT"},source_revision:{type:"null"},source_cursor:{type:"null"},
      source_completeness:{const:"UNKNOWN"},history_semantics:{const:"BOUNDED_RETAINED_NOT_FULL_HISTORY"}}),
    grain:enumeration(["ACCOUNT","DEPLOYMENT","NOT_COMMISSIONED"]),
    exact_total:{type:"null"},limit:{const:200},returned_count:{...count,maximum:200},has_more:{type:"boolean"},
    next_cursor:continuation,previous_cursor:continuation,
    records:{type:"array",maxItems:200,items:object({
      observation_id:{type:"string",pattern:"^por1_[0-9a-f]{64}$(?![\\s\\S])"},values})}}),
    allOf:[{if:{properties:{state:{const:"NOT_PUBLISHED"}},required:["state"]},
      then:{properties:{records:{type:"array",maxItems:0},returned_count:{const:0},has_more:{const:false},
        next_cursor:{type:"null"},previous_cursor:{type:"null"}}}},
      {if:{properties:{has_more:{const:true}},required:["has_more"]},
        then:{properties:{next_cursor:{type:"string"}}},else:{properties:{next_cursor:{type:"null"}}}}],
    description:"Bounded CURRENT authorized retained observations only, not source census/full history. Runtime additionally enforces returned_count===records.length. NOT_PUBLISHED has no records or more page. Omitted value is not null and not exact zero. Text maxLength uses JSON code points; canonical Zod additionally applies its UTF16 length, and the projector bounds source text bytes."};
  const data={};
  for(const key of ["deployments","positions","sessions","orders","fills","accounts","account_balances","margin_balances",
    "account_sync","reconciliation","broker_sync"])data[key]={...panel,
      properties:{...panel.properties,grain:{const:liveSourceGrain(key)}}};
  const LiveSourceOperationsReadV2={...object({schema_version:{const:"portal.execution.live-source-operations.v2"},
    workspace_id:scalarText,environment:{const:"live"},profile_id:scalarText,deployment_id:scalarText,
    record_authority:{const:"PORTAL_RETAINED_OBSERVATION"},source_verdict:{const:"NOT_ASSERTED"},
    visibility:{const:"SCOPED"},coverage:{const:"AUTHORIZED_ONLY"},observed_at_ms:count,
    source_side_effect_requested:{const:false},runtime_activation_requested:{const:false},data:object(data),
    runtime:object({state:{type:"null"},reason_code:{const:"SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED"}}),
    realtime:object({active:{const:false},reason_code:{const:"FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY"}}),
    commands:object({enabled:{const:false},reason_code:{const:"READ_NOT_COMMAND_AUTHORITY"}})}),
    description:"Source-only finite Live deployment read; NEVER approval/root/captured lineage, current broker verdict, source completeness, runtime activation, stream or command permission. Legacy LiveFullOperations remains a separate version. Alpha and Account original purposes and reviewed field permissions are independently enforced by the runtime before rows/counts/fields; THIS SCHEMA DOES NOT AUTHORIZE. Portal observed time is not source freshness. Runtime also applies a1MiB encoded body bound and combined current-authority/fresh-source/LAST-Core fence. These are proposed implementation bounds, not measured performance qualification."};
  return {LiveSourceOperationsReadV2};
}

/** Canonical TEST_ONLY fixture, not an installed policy, source signature,
 * accepted PM publication, actual retained document or a product receipt. */
export function liveSourceFixture(){
  const observed=Date.parse("2026-10-18T00:00:00.000Z");
  const specifications=[
    ["deployments","manager.deployments","strategy_deployments","alpha.read"],
    ["positions","manager.positions","positions_v2","alpha.read"],
    ["sessions","manager.sessions","execution_sessions","alpha.read"],
    ["orders","manager.orders","orders","alpha.read"],
    ["fills","manager.fills","fills","alpha.read"],
    ["accounts","manager.accounts","accounts","account.read"],
    ["account_balances","manager.accounts","account_balances","account.read"],
    ["margin_balances","manager.accounts","margin_balances","account.read"],
    ["account_sync","manager.accounts","account_sync_effective","account.read"],
    ["reconciliation","manager.reconciliation","reconciliation_findings","account.read"],
  ];
  const provenance=spec=>({dataset_id:spec?`relation:${spec[1]}:${spec[2]}`:null,purpose:spec?.[3]??null,
    field_contract_revision:"portal.execution.live-source-fields.v2",field_policy_ref:spec?`TEST_ONLY:${spec[0]}-fields`:null,
    projection_basis:"SAME_RETAINED_DOCUMENT",source_revision:null,source_cursor:null,
    source_completeness:"UNKNOWN",history_semantics:"BOUNDED_RETAINED_NOT_FULL_HISTORY"});
  const absent=(reason,spec)=>({state:"NOT_PUBLISHED",reason_code:reason,source_as_of_ms:null,
    source_clock_reason:"SOURCE_CLOCK_NOT_SCOPED",provenance:provenance(spec),exact_total:null,
    grain:liveSourceGrain(spec?.[0]??"broker_sync"),
    limit:200,returned_count:0,has_more:false,next_cursor:null,previous_cursor:null,records:[]});
  const identity={strategy_id:"strategy_TEST_ONLY_source",account_id:"account_TEST_ONLY_source",mode:"live",venue:"TEST_ONLY:venue"};
  const rows={
    deployments:{...identity,deployment_id:"dep_TEST_ONLY_source",state:"OBSERVED",currency:"TEST_ONLY:USD",created_at_ms:0,updated_at_ms:observed},
    positions:{...identity,position_id:"position_TEST_ONLY_source",instrument_id:"TEST_ONLY:BTC-USDT",side:"LONG",
      signed_qty:"0.000000000000000001",quantity:"0.000000000000000001",avg_px_open:"9007199254740993.123456789123456789",
      avg_px_close:null,mark_price:"9007199254740994.000000000000000001",notional:"1.000000000000000001",
      realized_pnl:"0",unrealized_pnl:"-0.000000000000000001",updated_at_ms:observed},
    sessions:{...identity,state:"OBSERVED",submitted_count:"9007199254740993",risk_rejected_count:"0",broker_rejected_count:null,
      filled_count:"1",updated_at_ms:observed},
    orders:{...identity,order_id:"order_TEST_ONLY_source",instrument_id:"TEST_ONLY:BTC-USDT",side:"BUY",quantity:"1.000000000000000001",
      price:"0",status:"OBSERVED",created_at_ms:0,updated_at_ms:observed},
    fills:{...identity,fill_id:"fill_TEST_ONLY_source",instrument_id:"TEST_ONLY:BTC-USDT",side:"BUY",price:"1.000000000000000001",
      quantity:"0.000000000000000001",realized_pnl:null,trade_time_ms:observed},
    accounts:{...identity,base_currency:"TEST_ONLY:USD",created_at_ms:0,updated_at_ms:observed},
    account_balances:{account_id:identity.account_id,currency:"TEST_ONLY:USD",total:"9007199254740993.123456789123456789",
      locked:"0",free:null,updated_at_ms:observed},
    margin_balances:{account_id:identity.account_id,instrument_id:"TEST_ONLY:BTC-USDT",currency:"TEST_ONLY:USD",
      initial:"0.000000000000000001",maintenance:null,updated_at_ms:observed},
    account_sync:{account_id:identity.account_id,mode:"live",currency:"TEST_ONLY:USD",status:"OBSERVED",created_at_ms:0},
    reconciliation:{...identity,status:"OBSERVED",created_at_ms:0},
  };
  const data={},unpublished={};
  for(const [index,spec]of specifications.entries()){
    data[spec[0]]={state:"PARTIAL",reason_code:"AUTHORIZED_RETAINED_OBSERVATIONS_ONLY",source_as_of_ms:null,
      source_clock_reason:"SOURCE_CLOCK_NOT_SCOPED",provenance:provenance(spec),exact_total:null,
      grain:liveSourceGrain(spec[0]),limit:200,returned_count:1,has_more:false,next_cursor:null,previous_cursor:null,
      records:[{observation_id:"por1_"+(index+1).toString(16).padStart(64,"0"),values:rows[spec[0]]}]};
    unpublished[spec[0]]=absent("SOURCE_PANEL_NOT_CAPTURED",spec);
  }
  data.broker_sync=absent("BROKER_PURPOSE_NOT_COMMISSIONED");
  unpublished.broker_sync=absent("BROKER_PURPOSE_NOT_COMMISSIONED");
  // The projector still requires one qualified retained deployment identity.
  // This second fixture lacks optional source panels, not the root identity.
  unpublished.deployments=data.deployments;
  const body={schema_version:"portal.execution.live-source-operations.v2",workspace_id:"ws_TEST_ONLY_live_source",
    environment:"live",profile_id:"profile_TEST_ONLY_source",deployment_id:"dep_TEST_ONLY_source",
    record_authority:"PORTAL_RETAINED_OBSERVATION",source_verdict:"NOT_ASSERTED",visibility:"SCOPED",coverage:"AUTHORIZED_ONLY",
    observed_at_ms:observed,source_side_effect_requested:false,runtime_activation_requested:false,data,
    runtime:{state:null,reason_code:"SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED"},
    realtime:{active:false,reason_code:"FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY"},
    commands:{enabled:false,reason_code:"READ_NOT_COMMAND_AUTHORITY"}};
  return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,production_config:false,
    authority_installed:false,source_publication_installed:false,populated:body,unpublished:{...body,data:unpublished}};
}

/** Existing GET only, preserving its operationId/parameters/other verbs and
 * legacy success reference. Correct known error media to actual HttpErrorFilter.
 * Retain unused historical Problem component bytes; do not rewrite the document. */
export function updateLiveSourcePath(api){
  const get=api.paths?.[liveSourceReadRoute]?.get;
  if(!get||!get.responses?.["200"]||get.operationId!=="getLiveFullOperations")
    throw new Error("Missing existing Live source GET");
  const unrelated=(get.parameters??[]).filter(p=>!(p.in==="query"&&["panel","cursor"].includes(p.name)));
  get.parameters=[...unrelated,
    {name:"panel",in:"query",required:false,schema:{type:"string",enum:liveSourcePanels},
      description:"Fixed Live panel only. Advances that panel; all other panels return their first page. Same independent Live/Alpha/Account current-authority flight. Account panels remain ACCOUNT grain, not deployment economics."},
    {name:"cursor",in:"query",required:false,schema:{type:"string",maxLength:128,minLength:1},
      description:"Opaque Portal lps2 continuation from this exact panel under the SAME deployment/workspace/profile/session/current scope and immutable retained snapshot. Requires panel. Never a source cursor; no source or authority selection. Expired/changed-view cursor is refused; restart this panel from its first page."}];
  get.description="Sticky current Core preserves legacy separately. SCOPED_V2 is the exact DEPLOYMENT/LIVE source-only reader under independent governance.live.read, original Alpha/Account purposes and exact reviewed fields. Before retained reads, after every purpose, after snapshot equality and at LAST Core, the SAME combined flight retains all current obligations for body and held errors. No Canary/root lookup or fallback, source/broker acceptance, stream, activation, command, mutation, synthetic total or global population claim. Panel/source clock absence remains typed; Portal observed time is not source freshness.";
  const prior=get.responses["200"];
  get.responses["200"]={...prior,description:"Legacy Live operations OR finite current-authorized source-only retained observations, never a joint ROOT+source acceptance.",
    headers:{...prior.headers,"Cache-Control":{schema:{const:"private, no-store"}}},
    content:{...prior.content,"application/json":{...prior.content?.["application/json"],schema:{oneOf:[
      {$ref:"../schemas/execution-live-full-operations.v1.schema.json#/$defs/LiveFullOperations"},
      reference("LiveSourceOperationsReadV2")]}}}};
  for(const status of [400,401,403,404,409,500,503]){
    // The legacy404 is a Response $ref; remove it when replacing that exact
    // response, otherwise generators can retain the stale problem+json arm.
    const {$ref:_legacyProblemRef,...existing}=get.responses[status]??{};
    get.responses[status]={...existing,description:status===404?"Uniform hidden/missing workspace, deployment or source grain; no existence leak.":
      status===409?"Current authority/publication changed; refresh without fallback.":status===503?
      "Fixed unavailable/unqualified/overflow refusal; no private provider or SQL text.":status===500?
      "Fixed INTERNAL_ERROR envelope for unexpected faults; not raw exception text.":"Current authenticated session, exact app/source/field authority and valid request required.",
      content:{"application/json":{schema:{$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"}}}};
  }
  api.components??={};api.components.schemas??={};
  api.components.schemas.LiveSourceOperationsReadV2=reference("LiveSourceOperationsReadV2");
  return liveSourceReadRoute;
}
export function synchronizeLiveSourceFixture(check=false){
  const path=resolve(root,"fixtures/"+liveSourceFixtureName),bytes=JSON.stringify(liveSourceFixture(),null,2)+"\n";
  if(check){if(readFileSync(path,"utf8")!==bytes)throw new Error("Finite Live source fixture drift");}
  else writeFileSync(path,bytes);
}
/** Existing profile-read Live approval GET only; never add a duplicate route
 * to governance or replace its separate source-only deployment screen. */
export function updateLiveParentPath(api){
  const get=api.paths?.[liveParentReadRoute]?.get;
  if(!get||!get.responses?.["200"])throw new Error("Missing existing Live parent GET");
  get.description="Sticky current Core selects the independent exact Live reader before legacy reads. SCOPED_V2 requires current qualified DEPLOYMENT/LIVE audit, governance.live.read and LIVE_ROOT purpose before protected SQL. No fabricated Portfolio or predecessor, owner/read_all/decide shortcut or source-screen call. One SAME flight fences successful metadata and held errors after exact local equality, source and LAST Core/session/clock checks. Historical approval expiry is not read expiry; stored approval is not current TS acceptance, execution or activation.";
  const prior=get.responses["200"];
  get.responses={...get.responses,...response({oneOf:[
    {$ref:"../schemas/governance-live-review.v1.schema.json"},reference("LiveParentReadV2")]},
    "Legacy Live review OR finite current-authorized stored LIVE_GATE root. Separate source facts stay typed unavailable.")};
  get.responses["200"]={...prior,...get.responses["200"],
    headers:{...prior.headers,...get.responses["200"].headers},
    content:{...prior.content,...get.responses["200"].content}};
  // This historical profile-read document has no components object. The
  // existing response union directly references the shared finite schema;
  // do not manufacture a second component catalogue just for this GET.
  return liveParentReadRoute;
}
