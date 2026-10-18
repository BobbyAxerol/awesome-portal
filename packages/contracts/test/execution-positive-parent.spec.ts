/** Finite parent contract publication and canonical runtime parity.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {describe,expect,it} from "vitest";
import {r2ParentRead,paperExitParentRead,r2ParentOperationRead,paperExitParentOperationRead} from "../../../apps/control-api/src/governance/positive-parent.contract";
import {sandboxParentRead,canaryParentRead,followingSteps} from "../../../apps/control-api/src/governance/following-parent.contract";
import {liveParentRead} from "../../../apps/control-api/src/governance/live-parent.contract";
import {parentReadFieldSeals,parentFieldSetDigest,parentFieldPurpose,parentPurposeEnvironments,PARENT_FIELD_SEAL_CAP,reviewedParentAuditRoot} from "../../../apps/control-api/src/execution-v2/parent-read-fields";
import {parentCurrentSchemas,parentCurrentFixture,parentCompositionFixture,parentReadRoutes,parentFixtureName,
  updateParentPaths,followingReadRoutes,updateFollowingParentPaths,liveParentReadRoute,updateLiveParentPath} from "../tooling/execution-positive-parent-reader.mjs";
import {reviewedAccessPolicy,scopedAccessGrant} from "../../../apps/control-api/src/execution-v2/access.contract";
import {currentActivationCapabilities,currentActivationPlanRead} from "../../../apps/control-api/src/activation/current-activation.contract";
import {activationCurrentSchemas,activationCurrentFixture,activationFixtureName,activationReadRoutes,updateActivationPaths}
  from "../tooling/execution-activation-current-reader.mjs";
import type {operations as ActivationOperations} from "../generated/execution-staged-activation";
import type {components as GovernanceTypes,operations as GovernanceOperations} from "../generated/execution-governance";
import type {operations as OperationsOperations} from "../generated/execution-operations";
import type {components as CanaryTypes,operations as CanaryOperations} from "../generated/execution-canary";

const root=resolve(__dirname,".."),load=(path:string)=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const api=load("openapi/execution-governance.openapi.json"),stored=load("schemas/execution-operations.v1.schema.json");
const fixture=load("fixtures/"+parentFixtureName),definitions=parentCurrentSchemas();
// Strict mode belongs to the finite new definitions; no disabling strictness
// to accommodate the legacy OpenAPI document or unrelated historical schemas.
const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);
ajv.addSchema({$id:"TEST_ONLY:positive-parent",$defs:definitions});
const validate=(name:string,value:unknown)=>ajv.compile({$ref:"TEST_ONLY:positive-parent#/$defs/"+name})(value);
const clone=<T>(value:T):T=>structuredClone(value);
const runtime={R2ParentReadV2:r2ParentRead,PaperExitParentReadV2:paperExitParentRead,
  LiveParentReadV2:liveParentRead,
  R2ParentOperationReadV2:r2ParentOperationRead,PaperExitParentOperationReadV2:paperExitParentOperationRead,
  SandboxParentReadV2:sandboxParentRead,CanaryParentReadV2:canaryParentRead};
const pairs=[
  ["r2","R2ParentReadV2"],["r2_absent","R2ParentReadV2"],
  ["paper_exit","PaperExitParentReadV2"],["paper_exit_absent","PaperExitParentReadV2"],
  ["paper_exit_extended","PaperExitParentReadV2"],["paper_exit_criteria","PaperExitParentReadV2"],
] as const;
const checkBoth=(name:keyof typeof runtime,value:unknown,expected:boolean)=>{
  expect(validate(name,value),name+" JSON Schema").toBe(expected);
  expect(runtime[name].safeParse(value).success,name+" canonical Zod").toBe(expected);
};

describe("C5 separately sealed rich stored Paper Exit criteria",()=>{
  it("publishes exact strings, source absence and registered labels without authority installation",()=>{
    const value=clone(fixture.paper_exit_criteria);
    checkBoth("PaperExitParentReadV2",value,true);
    expect(value.criteria.items[0].observed.value).toBe("1842.000000000000000001");
    expect(value.criteria.items[1].observed.value).toBe("0");
    expect(value.criteria.items[0].op).toEqual({availability:"NOT_PUBLISHED",value:null,
      reason_code:"SOURCE_COMPARATOR_FIELD_NOT_RECORDED"});
    expect(fixture.paper_exit.criteria).toEqual({availability:"NOT_PUBLISHED",reason_code:"PARENT_FIELD_PURPOSE_NOT_QUALIFIED"});
    const generated:GovernanceTypes["schemas"]["PaperExitParentReadV2"]=value;
    expect(generated.criteria).toEqual(value.criteria);
  });
  it("rejects private/unknown fields and representable label, scalar and comparator contradictions in both validators",()=>{
    for(const mutate of [
      (row:any)=>{row.label_key.value="paper_exit.drift";},
      (row:any)=>{row.criterion_key.value="not-registered";},
      (row:any)=>{row.observed.value="1\n";},
      (row:any)=>{row.observed.value=1;},
      (row:any)=>{row.observed={availability:"AVAILABLE",value:null,reason_code:null};},
      (row:any)=>{row.unit.value="https://private.example/";},
      (row:any)=>{row.currency.value="USD\n";},
      (row:any)=>{row.op={availability:"AVAILABLE",value:"<=",reason_code:null};},
      (row:any)=>{row.source_ref.href="https://private.example/";},
      (row:any)=>{row.label="PRIVATE_PROSE";},
      (row:any)=>{row.source_label="PRIVATE_PROSE";},
    ]){
      const value=clone(fixture.paper_exit_criteria);mutate(value.criteria.items[0]);
      checkBoth("PaperExitParentReadV2",value,false);
    }
    const unknown=clone(fixture.paper_exit_criteria),missing={availability:"NOT_PUBLISHED",value:null,
      reason_code:"SOURCE_METRIC_NOT_REGISTERED"};
    unknown.criteria.items[0].criterion_key=missing;unknown.criteria.items[0].label_key=missing;
    checkBoth("PaperExitParentReadV2",unknown,true);
    unknown.criteria.items[0].label_key={availability:"AVAILABLE",value:"paper_exit.drift",reason_code:null};
    checkBoth("PaperExitParentReadV2",unknown,false);
  });
  it("keeps arbitrary parent/child equality and clock correlation runtime-only, never a JSON comparison keyword",()=>{
    for(const mutate of [
      (row:any)=>{row.source_ref.review_id="TEST_ONLY:other";},
      (row:any)=>{row.source_ref.finding_id="TEST_ONLY:other";},
      (row:any)=>{row.source_time.value++;},
    ]){
      const value=clone(fixture.paper_exit_criteria);mutate(value.criteria.items[0]);
      expect(validate("PaperExitParentReadV2",value)).toBe(true);
      expect(paperExitParentRead.safeParse(value).success).toBe(false);
    }
  });
});

describe("ELP2-04 independent finite stored Live approval",()=>{
  it("publishes the original profile-read GET only, without touching legacy mutations or source screen",()=>{
    const profile=load("openapi/execution-profile-read.openapi.json"),before=clone(profile);
    updateLiveParentPath(profile);expect(profile).toEqual(before);
    const get=profile.paths[liveParentReadRoute].get;
    expect(get.operationId).toBe("executionGateLiveReviewV1");
    expect(get.responses[200].content["application/json"].schema).toEqual({oneOf:[
      {$ref:"../schemas/governance-live-review.v1.schema.json"},
      {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/LiveParentReadV2"}]});
    expect(api.paths[liveParentReadRoute]).toBeUndefined();
    const modified=clone(before);modified.paths[liveParentReadRoute].post={operationId:"TEST_ONLY:preserved"};
    const post=clone(modified.paths[liveParentReadRoute].post);updateLiveParentPath(modified);
    expect(modified.paths[liveParentReadRoute].post).toEqual(post);
    expect(modified.paths[liveParentReadRoute].get.parameters).toEqual(get.parameters);
  });
  it("keeps current audit source authority distinct from stored approval, source screen and broker state",()=>{
    checkBoth("LiveParentReadV2",fixture.live,true);
    expect(fixture.live.accepted_manager_facts.availability).toBe("NOT_PUBLISHED");
    for(const change of [
      {anchors:{...fixture.live.anchors,portfolio_id:"TEST_ONLY:invented"}},
      {anchors:{...fixture.live.anchors,environment:"PAPER"}},
      {lineage:{r1_approval_id:"TEST_ONLY:invented"}},
      {source:{...fixture.live.source,runtime_activation_requested:true}},
      {approval:{...fixture.live.approval,gate:"R2"}},
      {private_actor:"TEST_ONLY:private"},
    ])checkBoth("LiveParentReadV2",{...fixture.live,...change},false);
    expect(validate("OperationalLiveParentCompositionV2",fixture.live_composition)).toBe(true);
    expect(fixture.live_composition.data.accepted_manager_facts).toEqual(fixture.live.accepted_manager_facts);
  });
});

describe("ELP2-04 finite current-authorized R2/Paper Exit contracts",()=>{
  it("private reviewed field seals bind exact finite purpose semantics, intervals and environments, never arbitrary fields",()=>{
    const seals=parentFieldPurpose.options.flatMap(purpose=>parentPurposeEnvironments(purpose).map(environment=>({purpose,environment,
      contract_revision:"portal.execution.parent-fields.v1",field_policy_ref:"TEST_ONLY:"+purpose,
      field_set_sha256:parentFieldSetDigest(purpose),valid_from_ms:0,valid_until_ms:1})));
    expect(parentReadFieldSeals.safeParse(seals).success).toBe(true);
    expect(new Set(seals.map(seal=>seal.field_set_sha256)).size).toBe(parentFieldPurpose.options.length);
    expect(parentFieldPurpose.options).toHaveLength(23);
    expect(PARENT_FIELD_SEAL_CAP).toBe(31);expect(seals).toHaveLength(31);
    const first=seals[0]!;
    for(const values of [
      [...seals,first],Array(17).fill(first),
      [{...first,field_set_sha256:parentFieldSetDigest("PAPER_EXIT_ROOT")}],
      [{...first,environment:"live"}],[{...first,purpose:"ALL_FIELDS"}],
      [{...first,contract_revision:"UNREVIEWED"}],[{...first,valid_until_ms:0}],
      [{...first,valid_until_ms:Number.MAX_SAFE_INTEGER+1}],[{...first,arbitrary_field:"nav"}],
    ])expect(parentReadFieldSeals.safeParse(values).success).toBe(false);
  });
  it("preserves existing definitions and appends independent Live root/composition",()=>{
    expect(Object.keys(definitions)).toEqual(["R2ParentReadV2","PaperExitParentReadV2",
      "OperationalR2ParentCompositionV2","OperationalPaperExitParentCompositionV2","R2ParentOperationReadV2","PaperExitParentOperationReadV2",
      "SandboxParentReadV2","CanaryParentReadV2","LiveParentReadV2","OperationalLiveParentCompositionV2"]);
    for(const [name,value]of Object.entries(definitions)){
      expect(stored.$defs[name]).toEqual(value);
      expect(api.components.schemas[name]).toEqual({$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name});
    }
    expect(fixture).toEqual(parentCurrentFixture());
    expect(fixture).toMatchObject({lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,
      production_config:false,authority_installed:false});
    expect(JSON.stringify(fixture)).not.toMatch(/secret|jwt|password|private_intent|frozen_json|economic_capital/);
    // Only CANARY_PROPOSAL discloses proposed cap strings, not PAPER metadata.
    for(const [key]of pairs)expect(JSON.stringify(fixture[key])).not.toMatch(/notional|capital_cap|daily_loss_cap/);
  });
  it.each(pairs)("%s matches strict generated schema and canonical runtime",(key,name)=>{
    checkBoth(name,fixture[key],true);
    checkBoth(name,{...fixture[key],private_actor_id:"TEST_ONLY"},false);
  });
  it("preserves both parent operationIds/parameters and legacy response variants; selected-plan schemas add no route",()=>{
    const targets=[
      [parentReadRoutes.r2,"executionGovernanceR2Review","R2ParentReadV2",{$ref:"#/components/schemas/R2ReviewResponse"}],
      [parentReadRoutes.paperExit,"executionGovernancePaperExitReview","PaperExitParentReadV2",
        {$ref:"../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitReviewResponse"}],
    ] as const;
    const before=clone(api),updated=clone(api);updateParentPaths(updated);
    expect(updated).toEqual(before); // synchronizer is deterministic/idempotent
    expect(Object.keys(updated.paths)).toEqual(Object.keys(before.paths));
    for(const [path,operationId,name,legacy]of targets){
      const get=api.paths[path].get;
      expect(get.operationId).toBe(operationId);
      expect(get.parameters).toEqual(before.paths[path].get.parameters);
      expect(get.responses[200].content["application/json"].schema).toEqual({oneOf:[legacy,
        {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name}]});
      for(const status of [200,400,401,403,404,409,503])
        expect(get.responses[status].headers["Cache-Control"].schema.const).toBe("private, no-store");
      for(const status of [400,401,403,404,409,503])expect(get.responses[status].content["application/json"].schema)
        .toEqual({$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"});
    }
    expect(Object.keys(definitions).filter(name=>name.includes("OperationRead")))
      .toEqual(["R2ParentOperationReadV2","PaperExitParentOperationReadV2"]);
    expect(api.paths["/api/v1/execution/compositions/approvals/{approval_id}"]).toBeUndefined();
  });
  it("finite updates preserve unrelated methods, defaults, parameters/security and components",()=>{
    const input=clone(api);
    input.paths[parentReadRoutes.r2].post={operationId:"TEST_ONLY:preserved-post"};
    input.paths[parentReadRoutes.r2].get.security=[{TEST_ONLY:[]}];
    input.paths[parentReadRoutes.r2].get.responses.default={description:"TEST_ONLY:preserved-default"};
    input.components.schemas.TEST_ONLY_Unrelated={type:"string"};
    const before=clone(input);updateParentPaths(input);
    expect(input.paths[parentReadRoutes.r2].post).toEqual(before.paths[parentReadRoutes.r2].post);
    expect(input.paths[parentReadRoutes.r2].get.security).toEqual(before.paths[parentReadRoutes.r2].get.security);
    expect(input.paths[parentReadRoutes.r2].get.responses.default).toEqual(before.paths[parentReadRoutes.r2].get.responses.default);
    expect(input.components.schemas.TEST_ONLY_Unrelated).toEqual(before.components.schemas.TEST_ONLY_Unrelated);
    expect(()=>updateParentPaths({paths:{}})).toThrow("Missing existing parent GET");
  });
  it("rejects wrong gate/family/environment/source verdict/current-grant claims in both validators",()=>{
    for(const [key,name]of [["r2","R2ParentReadV2"],["paper_exit","PaperExitParentReadV2"]] as const){
      const base=fixture[key];
      for(const patch of [
        {approval:{...base.approval,gate:key==="r2"?"PAPER_EXIT":"R2"}},
        {family:key==="r2"?"PAPER_EXIT":"R2"},
        {anchors:{...base.anchors,environment:"LIVE"}},
        {source:{...base.source,source_verdict:"ACCEPTED"}},
        {source:{...base.source,source_side_effect_requested:true}},
        {current_risk_grant_effective:true},
        {observed_at_ms:Number.MAX_SAFE_INTEGER+1},
        {observed_at_ms:"2026-10-18"},
        {field_contract_revision:"portal.execution.parent-fields.v2"},
      ])checkBoth(name,{...base,...patch},false);
      const without=clone(base);delete without.source;checkBoth(name,without,false);
    }
    checkBoth("R2ParentReadV2",{...fixture.r2,lineage:{...fixture.r2.lineage,currency:"bad\ntext"}},false);
    checkBoth("R2ParentReadV2",{...fixture.r2,lineage:{...fixture.r2.lineage,currency:"bad\n"}},false);
    checkBoth("R2ParentReadV2",{...fixture.r2,lineage:{availability:"NOT_PUBLISHED",reason_code:"GUESS"}},false);
  });
  it("keeps optional lineage/evaluation independent, bounded and nonfinancial",()=>{
    checkBoth("PaperExitParentReadV2",{...fixture.paper_exit,lineage:fixture.paper_exit_absent.lineage},true);
    checkBoth("PaperExitParentReadV2",{...fixture.paper_exit,evaluation:fixture.paper_exit_absent.evaluation},true);
    for(const patch of [
      {evaluation:{...fixture.paper_exit.evaluation,panels:Array(5).fill(fixture.paper_exit.evaluation.panels[0])}},
      {evaluation:{...fixture.paper_exit.evaluation,findings:Array(257).fill(fixture.paper_exit.evaluation.findings[0])}},
      {lineage:{...fixture.paper_exit.lineage,source_snapshot_hash:"f".repeat(64)}},
      {lineage:{...fixture.paper_exit.lineage,private_payload_hash:"sha256:"+"0".repeat(64)}},
      {evaluation:{...fixture.paper_exit.evaluation,nav:"100000"}},
    ])checkBoth("PaperExitParentReadV2",{...fixture.paper_exit,...patch},false);
    const empty={...fixture.paper_exit,evaluation:{...fixture.paper_exit.evaluation,panels:[],findings:[]}};
    checkBoth("PaperExitParentReadV2",empty,true);
  });
  it("enforces panel freshness/poll coverage and extension state conditionals equally",()=>{
    const base=fixture.paper_exit;
    for(const patch of [
      {as_of_ms:null}, // first panel is freshness OK
      {poll_interval_ms:null}, // first panel is POLL_BOUNDED
      {poll_interval_ms:99},
      {poll_interval_ms:3600001},
      {source_completeness:"EVENT_SOURCED"}, // non-poll coverage must have null interval
      {source_authority:"PORTAL"},
      {title:"TEST_ONLY:private prose"},
    ])checkBoth("PaperExitParentReadV2",{...base,evaluation:{...base.evaluation,
      panels:[{...base.evaluation.panels[0],...patch},...base.evaluation.panels.slice(1)]}},false);
    for(const review of [
      {...base.review,review_state:"EXTENDED"},
      {...base.review,extension_days:14,extended_until_ms:base.review.created_at_ms},
      {...fixture.paper_exit_extended.review,extension_days:7},
      {...fixture.paper_exit_extended.review,extended_until_ms:null},
    ])checkBoth("PaperExitParentReadV2",{...base,review},false);
  });
  it("accepts historical expiry and preserves zero/null/absence without inventing source freshness",()=>{
    expect(fixture.r2.approval.expires_at_ms).toBeLessThan(fixture.r2.observed_at_ms);
    checkBoth("R2ParentReadV2",fixture.r2,true);
    checkBoth("R2ParentReadV2",{...fixture.r2,observed_at_ms:0},true);
    expect(fixture.paper_exit.evaluation.panels[1].as_of_ms).toBeNull();
    expect(fixture.paper_exit.evaluation.panels[0].ordinal).toBe(0);
    expect(fixture.paper_exit_absent.evaluation).toEqual({availability:"NOT_PUBLISHED",reason_code:"PARENT_FIELD_PURPOSE_NOT_QUALIFIED"});
  });
  it("documents and tests semantic Zod-only checks instead of pretending standard JSON compares siblings",()=>{
    const base=fixture.paper_exit;
    const cases=[
      {...base,approval:{...base.approval,updated_at_ms:base.approval.created_at_ms-1}},
      {...base,review:{...base.review,review_id:"apr_TEST_ONLY_wrong"}},
      {...base,review:{...base.review,updated_at_ms:base.review.created_at_ms-1}},
      {...base,evaluation:{...base.evaluation,panels:[base.evaluation.panels[0],base.evaluation.panels[0]]}},
      {...base,evaluation:{...base.evaluation,findings:[{...base.evaluation.findings[0],panel_id:"panel_TEST_ONLY_missing"}]}},
      {...base,evaluation:{...base.evaluation,findings:[base.evaluation.findings[0],base.evaluation.findings[0]]}},
    ];
    for(const value of cases){
      expect(validate("PaperExitParentReadV2",value)).toBe(true);
      expect(paperExitParentRead.safeParse(value).success).toBe(false);
    }
    expect(definitions.PaperExitParentReadV2.properties.review.description).toContain("review_id===approval.approval_id");
    expect(definitions.PaperExitParentReadV2.properties.evaluation.oneOf[0].description).toContain("finding.panel_id membership");
    // Newly published text limits use Unicode code points in BOTH validators.
    for(const size of [96,191,192])checkBoth("R2ParentReadV2",{...fixture.r2,
      lineage:{...fixture.r2.lineage,currency:"😀".repeat(size)}},size<=191);
    for(const size of [2,3,96,97])checkBoth("R2ParentReadV2",{...fixture.r2,workspace_id:"😀".repeat(size)},size>=3&&size<=96);
  });
});

describe("ELP2-04 exact selected Portal plan shapes",()=>{
  const selectedPairs=[
    ["r2_operation","R2ParentOperationReadV2"],["r2_operation_uncaptured","R2ParentOperationReadV2"],
    ["r2_operation_applied","R2ParentOperationReadV2"],["r2_operation_expired","R2ParentOperationReadV2"],
    ["paper_exit_operation","PaperExitParentOperationReadV2"],["paper_exit_operation_applied","PaperExitParentOperationReadV2"],
    ["paper_exit_operation_expired","PaperExitParentOperationReadV2"],
  ] as const;
  it.each(selectedPairs)("%s is strict AJV/Zod parity, even after original expiry",(key,name)=>{
    const body=fixture[key];checkBoth(name,body,true);
    expect(body.expires_at_ms).toBeLessThan(body.observed_at_ms);
    expect(body.source).toEqual({authority:"PORTAL",source_verdict:"NOT_ASSERTED",source_side_effect_requested:false});
    expect(body).not.toHaveProperty("lineage");expect(body).not.toHaveProperty("review");expect(body).not.toHaveProperty("evaluation");
    for(const field of ["reason","conditions","actor_user_id","request_key","payload_hash","apply_key_id","apply_token_hash",
      "response_json","receipt","verification_result","source_status","lineage","review","evaluation"])
      checkBoth(name,{...body,[field]:"TEST_ONLY_PRIVATE_NOT_PUBLISHED"},false);
    checkBoth(name,{...body,approval:{...body.approval,actor_user_id:"TEST_ONLY"}},false);
    checkBoth(name,{...body,source:{...body.source,acceptance_digest:"TEST_ONLY"}},false);
    checkBoth(name,{...body,anchors:{...body.anchors,account_id:"TEST_ONLY"}},false);
  });
  it("finite family, gate, command, decision, version and public timestamps agree",()=>{
    for(const [key,name,decisions]of [
      ["r2_operation","R2ParentOperationReadV2",["APPROVE","APPROVE_WITH_CONDITION","DENY"]],
      ["paper_exit_operation","PaperExitParentOperationReadV2",["PROMOTE","EXTEND_OBSERVATION","REJECT"]],
    ] as const){
      const body=fixture[key];
      for(const decision of decisions)for(const status of ["PLANNED","APPLIED","EXPIRED"])
        checkBoth(name,{...body,decision,status,applied_at_ms:status==="APPLIED"?body.created_at_ms:null},true);
      for(const patch of [{schema_version:"portal.execution.governance-parent.v2"},{family:"LIVE"},
        {command_type:body.family==="R2"?"GOVERNANCE_PAPER_EXIT_DECISION":"GOVERNANCE_R2_DECISION"},
        {command_version:2},{expected_version:0},{expected_version:1.5},{status:"SUCCEEDED"},
        {decision:body.family==="R2"?"PROMOTE":"APPROVE"},{status:"APPLIED",applied_at_ms:null},
        {status:"PLANNED",applied_at_ms:body.created_at_ms},{status:"EXPIRED",applied_at_ms:body.created_at_ms},
        {created_at_ms:-1},{expires_at_ms:Number.MAX_SAFE_INTEGER+1},{applied_at_ms:"0"},
        {operation_id:"TEST_ONLY\n"},{operation_id:"😀"},{observed_at_ms:0.5},
        {approval:{...body.approval,gate:body.family==="R2"?"PAPER_EXIT":"R2"}},
        {source:{...body.source,source_verdict:"ACCEPTED"}},{source:{...body.source,source_side_effect_requested:true}},
        {anchors:{...body.anchors,environment:"LIVE"}},{field_contract_revision:"UNREVIEWED"}])
        checkBoth(name,{...body,...patch},false);
      const missing=clone(body);delete missing.operation_id;checkBoth(name,missing,false);
      // Millisecond equality can represent a positive native sub-ms interval.
      checkBoth(name,{...body,created_at_ms:0,expires_at_ms:0,applied_at_ms:null},true);
    }
  });
  it("R2 captured pins are all-null/all-present; Paper can never invent that tuple",()=>{
    const r2=fixture.r2_operation,keys=["parent_approval_id","parent_approval_version","parent_evidence_set_hash"] as const;
    checkBoth("R2ParentOperationReadV2",fixture.r2_operation_uncaptured,true);
    for(let mask=1;mask<7;mask++){
      const body=clone(r2);keys.forEach((key,index)=>{body[key]=(mask&(1<<index))?r2[key]:null;});
      checkBoth("R2ParentOperationReadV2",body,false);
    }
    for(const patch of [{parent_approval_id:"bad id"},{parent_approval_version:0},{parent_evidence_set_hash:"f".repeat(64)}])
      checkBoth("R2ParentOperationReadV2",{...r2,...patch},false);
    for(const key of keys)checkBoth("PaperExitParentOperationReadV2",{...fixture.paper_exit_operation,[key]:r2[key]},false);
    checkBoth("PaperExitParentOperationReadV2",{...fixture.paper_exit_operation,
      parent_approval_id:r2.parent_approval_id,parent_approval_version:1,parent_evidence_set_hash:r2.parent_evidence_set_hash},false);
  });
  it("documents Zod-only sibling-clock relations without custom JSON comparison vocabulary",()=>{
    for(const [key,name]of [["r2_operation","R2ParentOperationReadV2"],["paper_exit_operation","PaperExitParentOperationReadV2"]] as const){
      const body=fixture[key];
      for(const patch of [{expires_at_ms:body.created_at_ms-1},
        {status:"APPLIED",applied_at_ms:body.created_at_ms-1},
        {approval:{...body.approval,updated_at_ms:body.approval.created_at_ms-1}}]){
        const value={...body,...patch};expect(validate(name,value)).toBe(true);
        expect(runtime[name].safeParse(value).success).toBe(false);
      }
      expect(definitions[name].description).toContain("Runtime additionally checks expires_at_ms>=created_at_ms");
    }
  });
});

describe("ELP2-04 finite Sandbox/Canary roots, never effective source verdicts",()=>{
  const followingPairs=[["sandbox","SandboxParentReadV2"],["sandbox_absent","SandboxParentReadV2"],
    ["sandbox_draft","SandboxParentReadV2"],["canary","CanaryParentReadV2"],
    ["canary_absent","CanaryParentReadV2"],["canary_revision","CanaryParentReadV2"]] as const;
  it.each(followingPairs)("%s preserves strict JSON/Zod parity and TEST_ONLY current-association semantics",(key,name)=>{
    const body=fixture[key];checkBoth(name,body,true);
    expect(body.anchors.association_basis).toBe("CURRENT_NATIVE_TARGET_CORRESPONDENCE");
    expect(body.anchors.captured_environment_attested).toBe(false);
    expect(body.source).toEqual({authority:"PORTAL",source_verdict:"NOT_ASSERTED",source_side_effect_requested:false,
      runtime_activation_requested:false,promotion_execution_requested:false});
    expect(body.accepted_manager_facts).toEqual({availability:"NOT_PUBLISHED",reason_code:"PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION"});
    for(const field of ["actor_user_id","created_by_user_id","account_binding","external_account_ref","reason",
      "blocker_codes","source_href","metadata_json","smoke_plan","raw_payload","response_json","command_capability"])
      checkBoth(name,{...body,[field]:"TEST_ONLY_PRIVATE"},false);
    for(const patch of [{family:"PAPER_EXIT"},{schema_version:"portal.execution.governance-parent.v2"},
      {provenance_basis:"SOURCE_ATTESTED_HISTORY"},{observed_at_ms:-1},{observed_at_ms:Number.MAX_SAFE_INTEGER+1},
      {source:{...body.source,source_verdict:"ACCEPTED"}},{source:{...body.source,runtime_activation_requested:true}},
      {anchors:{...body.anchors,captured_environment_attested:true}},
      {anchors:{...body.anchors,association_basis:"HISTORICAL_NATIVE_ASSOCIATION"}},
      {anchors:{...body.anchors,environment:body.family==="CANARY"?"CANARY":"PAPER"}},
      {accepted_manager_facts:{availability:"AVAILABLE",data:{}}}])checkBoth(name,{...body,...patch},false);
    checkBoth(name,{...body,anchors:{...body.anchors,account_id:"TEST_ONLY_PRIVATE"}},false);
    checkBoth(name,{...body,observed_at_ms:0},true);
  });
  it("fixed seven steps require each key once and distinguish missing facts from stored evaluation",()=>{
    const body=fixture.sandbox,items=body.steps.items;
    expect(items.map((row:{step_key:string})=>row.step_key)).toEqual([...followingSteps]);
    checkBoth("SandboxParentReadV2",{...body,steps:{...body.steps,items:[...items].reverse()}},true);
    for(const changed of [items.slice(1),[...items,items[0]],Array(7).fill(items[0]),
      [{...items[0],step_key:"EXTRA"},...items.slice(1)],
      [{...items[0],evidence_id:null},...items.slice(1)],
      [{...items[0],stored_evaluation_state:null},...items.slice(1)],
      [{...items[0],source_authority:null},...items.slice(1)],
      [{...items[0],source_verification_state:null},...items.slice(1)],
      [...items.slice(0,6),{...items[6],evidence_id:"evidence_TEST_ONLY_guessed"}],
      [...items.slice(0,6),{...items[6],as_of_ms:0}],
      [{...items[0],source_authority:"RESEARCH"},...items.slice(1)],
      [{...items[0],evaluation_reason:"PRIVATE"},...items.slice(1)]])
      checkBoth("SandboxParentReadV2",{...body,steps:{...body.steps,items:changed}},false);
    // AVAILABLE can lack source clocks; PASS remains a stored historical fact,
    // never an expiry-derived current certification verdict.
    checkBoth("SandboxParentReadV2",{...body,steps:{...body.steps,
      items:[{...items[0],as_of_ms:null,expires_at_ms:null},...items.slice(1)]}},true);
    expect(items[0].expires_at_ms).toBeLessThan(body.observed_at_ms);
    for(const patch of [{steps:fixture.sandbox_absent.steps},{lineage:fixture.sandbox_absent.lineage}])
      checkBoth("SandboxParentReadV2",{...body,...patch},true);
    checkBoth("SandboxParentReadV2",{...body,steps:{availability:"AVAILABLE",basis:"SOURCE_CERTIFIED",items}},false);
  });
  it("Sandbox lifecycle null/nonnull conditions are expressible JSON; temporal ordering stays Zod-only",()=>{
    const body=fixture.sandbox,r=body.certification,created=r.created_at_ms;
    for(const state of ["DRAFT","IN_REVIEW","APPROVED","DENIED"]){
      const certification={...r,workflow_state:state,submitted_at_ms:state==="DRAFT"?null:created,
        decided_at_ms:["APPROVED","DENIED"].includes(state)?created:null};
      checkBoth("SandboxParentReadV2",{...body,certification},true);
    }
    for(const patch of [{workflow_state:"ACTIVE"},{workflow_version:0},{policy_version:"bad\ntext"},
      {workflow_state:"DRAFT",submitted_at_ms:created,decided_at_ms:null},
      {workflow_state:"IN_REVIEW",submitted_at_ms:null,decided_at_ms:null},
      {workflow_state:"IN_REVIEW",decided_at_ms:created},{decided_at_ms:null},
      {source_integration_state:"VERIFIED"},{delivery_profile:"LIVE"},{actor_user_id:"PRIVATE"}])
      checkBoth("SandboxParentReadV2",{...body,certification:{...r,...patch}},false);
    for(const patch of [{updated_at_ms:created-1},{submitted_at_ms:created-1},
      {decided_at_ms:r.submitted_at_ms-1}]){
      const changed={...body,certification:{...r,...patch}};
      expect(validate("SandboxParentReadV2",changed)).toBe(true);
      expect(sandboxParentRead.safeParse(changed).success).toBe(false);
    }
    expect(definitions.SandboxParentReadV2.properties.certification.description).toContain("Runtime additionally checks");
    for(const size of [191,192])checkBoth("SandboxParentReadV2",{...body,
      certification:{...r,policy_version:"😀".repeat(size)}},size===191);
  });
  it("Canary caps stay positive exact decimal strings and proposals are never EFFECTIVE",()=>{
    const body=fixture.canary,q=body.proposal;
    expect(q.capital_cap).toBe("9007199254740993.123456789123456789");
    for(const value of ["1","1.0","0.000000000000000001","99999999999999999999.999999999999999999"])
      checkBoth("CanaryParentReadV2",{...body,proposal:{...q,capital_cap:value}},true);
    for(const value of ["0","0.000000000000000000","-1","+1","01","1e3",".1","1.",
      "1.0000000000000000001","100000000000000000000",1,null])
      for(const field of ["capital_cap","gross_notional_cap","daily_loss_cap"])
        checkBoth("CanaryParentReadV2",{...body,proposal:{...q,[field]:value}},false);
    for(const patch of [{basis:"EFFECTIVE"},{max_open_orders:0},{max_open_orders:1000001},
      {duration_days:0},{duration_days:91},{currency:"usd"},{native_margin:"1"},{risk_budget:"1"},
      {base_risk_profile_revision:"bad\ntext"}])checkBoth("CanaryParentReadV2",{...body,proposal:{...q,...patch}},false);
    for(const patch of [{proposal:fixture.canary_absent.proposal},{lineage:fixture.canary_absent.lineage}])
      checkBoth("CanaryParentReadV2",{...body,...patch},true);
    checkBoth("CanaryParentReadV2",{...body,proposal:{availability:"NOT_PUBLISHED",reason_code:"GUESS"}},false);
  });
  it("Canary predecessor/revision and source-dark flags are finite, not a live lineage grant",()=>{
    const body=fixture.canary;
    for(const patch of [{revision:0},{revision:1,previous_envelope_id:"env_TEST_ONLY_old"},
      {revision:2,previous_envelope_id:null},{status:"ACTIVE"},{expected_certification_version:0},
      {production_command_active:true},{source_integration_state:"SHADOW"},{delivery_profile:"shadow"},
      {actor_user_id:"PRIVATE"}])checkBoth("CanaryParentReadV2",{...body,envelope:{...body.envelope,...patch}},false);
    // Neither current certification nor promotion eligibility is a DTO field.
    checkBoth("CanaryParentReadV2",{...body,envelope:{...body.envelope,expected_certification_version:99}},true);
    checkBoth("CanaryParentReadV2",{...body,lineage:{...body.lineage,account_id:"PRIVATE"}},false);
    for(const [key,name]of followingPairs){
      const changed=clone(fixture[key]);delete changed.source;checkBoth(name,changed,false);
    }
  });
  it("purpose/environment pairs are exact; old PAPER purposes do not acquire SANDBOX/LIVE authority",()=>{
    expect(parentFieldPurpose.options.filter(p=>!p.startsWith("ACTIVATION_")&&!p.startsWith("LIVE_"))).toEqual([
      "R2_ROOT","R2_LINEAGE","PAPER_EXIT_ROOT","PAPER_EXIT_REVIEW","PAPER_EXIT_LINEAGE",
      "DECISION_OPERATION","SANDBOX_ROOT","SANDBOX_STEPS","SANDBOX_LINEAGE",
      "CANARY_ROOT","CANARY_PROPOSAL","CANARY_LINEAGE","PAPER_EXIT_CRITERIA",
      "DECISION_ACTORS","DECISION_LATEST_OPERATION","R2_DECISION_CONTEXT",
      "RECORDED_PORTAL_ACTIVITY","R2_RECORDED_VERDICTS",
    ]);
    expect(parentPurposeEnvironments("PAPER_EXIT_CRITERIA")).toEqual(["paper"]);
    for(const purpose of parentFieldPurpose.options){
      for(const environment of parentPurposeEnvironments(purpose)){
      const seal={purpose,environment,contract_revision:"portal.execution.parent-fields.v1",
        field_policy_ref:"TEST_ONLY:"+purpose,field_set_sha256:parentFieldSetDigest(purpose),valid_from_ms:0,valid_until_ms:1};
      expect(parentReadFieldSeals.safeParse([seal]).success).toBe(true);
      for(const other of ["paper","sandbox","live"].filter(value=>!parentPurposeEnvironments(purpose).includes(value as "paper"|"sandbox"|"live")))
        expect(parentReadFieldSeals.safeParse([{...seal,environment:other}]).success).toBe(false);
      }
    }
  });
  it("updates only real named GETs, retaining ids, parameters, security, defaults, errors and writes",()=>{
    for(const [document,path,operationId,name,legacy]of [
      ["execution-governance",followingReadRoutes.sandbox,"getSandboxCertification","SandboxParentReadV2",
        "../schemas/execution-sandbox-certification.v1.schema.json#/$defs/CertificationResponse"],
      ["execution-canary",followingReadRoutes.canary,"getCanaryControlRoom","CanaryParentReadV2",
        "../schemas/execution-canary-control-room.v1.schema.json#/$defs/CanaryControlRoom"],
    ] as const){
      const original=load("openapi/"+document+".openapi.json"),updated=clone(original);
      updateFollowingParentPaths(updated,document);expect(updated).toEqual(original);
      const probe=clone(original),get=probe.paths[path].get;
      get.security=[{TEST_ONLY:[]}];get.responses.default={description:"TEST_ONLY:default"};
      probe.paths[path].post={operationId:"TEST_ONLY:write-preserved"};probe.components.schemas.TEST_ONLY_Unrelated={type:"string"};
      const before=clone(probe);updateFollowingParentPaths(probe,document);
      expect(Object.keys(probe.paths)).toEqual(Object.keys(before.paths));
      expect(probe.paths[path].post).toEqual(before.paths[path].post);
      expect(probe.paths[path].get.parameters).toEqual(before.paths[path].get.parameters);
      expect(probe.paths[path].get.security).toEqual(before.paths[path].get.security);
      expect(probe.components.schemas.TEST_ONLY_Unrelated).toEqual(before.components.schemas.TEST_ONLY_Unrelated);
      expect(probe.paths[path].get.operationId).toBe(operationId);
      for(const [status,response]of Object.entries(before.paths[path].get.responses))
        if(status!=="200")expect(probe.paths[path].get.responses[status]).toEqual(response);
      expect(probe.paths[path].get.responses[200].content["application/json"].schema)
        .toEqual({oneOf:[{$ref:legacy},{$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name}]});
      expect(probe.paths[path].get.responses[200].headers["Cache-Control"].schema.const).toBe("private, no-store");
    }
    expect(()=>updateFollowingParentPaths({paths:{}},"execution-canary")).toThrow("Missing existing following-parent GET");
    expect(()=>updateFollowingParentPaths({paths:{}},"made-up")).toThrow("Unsupported following-parent document");
  });
});

describe("C5 separately sealed bounded immutable Portal decisions and R2 verdicts",()=>{
  const purposeAbsent={availability:"NOT_PUBLISHED",reason_code:"PARENT_FIELD_PURPOSE_NOT_QUALIFIED"};
  const r2=()=>clone(fixture.r2_recorded),paper=()=>clone(fixture.paper_exit_recorded);
  it("publishes exact canonical synthetic available vectors and required default absence, not installed authority",()=>{
    checkBoth("R2ParentReadV2",r2(),true);checkBoth("PaperExitParentReadV2",paper(),true);
    const r2Generated:GovernanceTypes["schemas"]["R2ParentReadV2"]=r2();
    const paperGenerated:GovernanceTypes["schemas"]["PaperExitParentReadV2"]=paper();
    expect(r2Generated.recorded_verdicts).toEqual(r2().recorded_verdicts);
    expect(paperGenerated.recorded_activity).toEqual(paper().recorded_activity);
    for(const [key,name]of pairs){const body=clone(fixture[key]);
      expect(body.recorded_activity).toEqual(purposeAbsent);
      if(key.startsWith("r2"))expect(body.recorded_verdicts).toEqual(purposeAbsent);
      for(const field of ["recorded_activity",...(key.startsWith("r2")?["recorded_verdicts"]:[])]){
        const missing=clone(body);delete missing[field];checkBoth(name,missing,false);
      }
    }
    expect(parentPurposeEnvironments("RECORDED_PORTAL_ACTIVITY")).toEqual(["paper"]);
    expect(parentPurposeEnvironments("R2_RECORDED_VERDICTS")).toEqual(["paper"]);
    expect(parentFieldPurpose.options.filter(p=>!p.startsWith("ACTIVATION_")&&!p.startsWith("LIVE_"))).toHaveLength(18);
    expect(fixture.authority_installed).toBe(false);expect(fixture.runtime_qualified).toBe(false);
    // The selected-operation body is unchanged; only the current parent has
    // these separately sealed sections. No implicit selected-plan expansion.
    expect(fixture.r2_operation.recorded_activity).toBeUndefined();
    expect(fixture.paper_exit_operation.recorded_activity).toBeUndefined();
  });
  it.each(["r2","paper_exit"] as const)("%s has finite family-specific activity and no prose, receipt, hash or source stage",key=>{
    const get=key==="r2"?r2:paper,name=key==="r2"?"R2ParentReadV2":"PaperExitParentReadV2";
    for(const mutate of [
      (body:any)=>{body.recorded_activity.items[0].kind=key==="r2"?"PAPER_EXIT_DECISION_RECORDED":"R2_DECISION_RECORDED";},
      (body:any)=>{body.recorded_activity.items[0].decision=key==="r2"?"PROMOTE":"APPROVE";},
      (body:any)=>{body.recorded_activity.items[0].decision="APPLIED";},
      (body:any)=>{body.recorded_activity.items[0].decision="REQUEST_CHANGES";},
      (body:any)=>{body.recorded_activity.items[0].operation_id+="\n";},
      (body:any)=>{body.recorded_activity.items[0].decision_id="https://private.example/";},
      (body:any)=>{body.recorded_activity.items[0].actor_user_id="TEST_ONLY:not-public";},
      (body:any)=>{body.recorded_activity.items[0].reason="PRIVATE_PROSE";},
      (body:any)=>{body.recorded_activity.items[0].evidence_set_hash="sha256:"+"a".repeat(64);},
      (body:any)=>{body.recorded_activity.items[0].source_receipt={state:"APPLIED"};},
      (body:any)=>{body.recorded_activity.items[0].effective_stage="LIVE";},
      (body:any)=>{body.recorded_activity.limit=33;},
      (body:any)=>{body.recorded_activity.coverage="FULL_HISTORY";},
      (body:any)=>{body.recorded_activity.basis="SOURCE_ACCEPTED";},
      (body:any)=>{body.source.source_verdict="ACCEPTED";},
      (body:any)=>{body.source.source_side_effect_requested=true;},
      (body:any)=>{body.anchors.environment="LIVE";},
    ]){const body=get();mutate(body);checkBoth(name,body,false);}
    const noRows=get();noRows.recorded_activity.items=[];checkBoth(name,noRows,true);
    noRows.recorded_activity.has_more=true;checkBoth(name,noRows,false);
    const wrongAbsence=get();wrongAbsence.recorded_activity={availability:"NOT_PUBLISHED",reason_code:"RECORDED_VERDICTS_NOT_PUBLIC"};
    checkBoth(name,wrongAbsence,false);
    for(const absence of [purposeAbsent,{availability:"NOT_PUBLISHED",reason_code:"RECORDED_ACTIVITY_NOT_PUBLIC"}]){
      const body=get();body.recorded_activity=absence;checkBoth(name,body,true);
      const leak=get();leak.recorded_activity={...absence,items:[]};checkBoth(name,leak,false);
    }
  });
  it("applies finite 32/64 row bounds and a full-page requirement only when has_more is true",()=>{
    const body=r2(),activity=body.recorded_activity.items[0],verdict=body.recorded_verdicts.items[0];
    body.recorded_activity.items=Array.from({length:32},(_,i)=>({...activity,decision_id:"TEST_ONLY:d"+i,
      operation_id:"TEST_ONLY:o"+i,decided_at_ms:activity.decided_at_ms-i}));body.recorded_activity.has_more=true;
    body.recorded_verdicts.items=Array.from({length:64},(_,i)=>({...verdict,finding_id:"TEST_ONLY:f"+i,ordinal:i,
      source_ref:{...verdict.source_ref,finding_id:"TEST_ONLY:f"+i}}));body.recorded_verdicts.has_more=true;
    checkBoth("R2ParentReadV2",body,true);
    const activityOverflow=clone(body);activityOverflow.recorded_activity.items.push({...activity,decision_id:"TEST_ONLY:overflow",operation_id:"TEST_ONLY:overflow"});
    checkBoth("R2ParentReadV2",activityOverflow,false);
    const verdictOverflow=clone(body);verdictOverflow.recorded_verdicts.items.push({...verdict,finding_id:"TEST_ONLY:overflow",ordinal:64,
      source_ref:{...verdict.source_ref,finding_id:"TEST_ONLY:overflow"}});checkBoth("R2ParentReadV2",verdictOverflow,false);
    const shortActivity=clone(body);shortActivity.recorded_activity.items.pop();checkBoth("R2ParentReadV2",shortActivity,false);
    const shortVerdict=clone(body);shortVerdict.recorded_verdicts.items.pop();checkBoth("R2ParentReadV2",shortVerdict,false);
  });
  it("does not mistake rounded public-millisecond ties for the private PostgreSQL microsecond/id order",()=>{
    const body=r2(),items=body.recorded_activity.items;
    items[0].decided_at_ms=items[1].decided_at_ms;
    items[0].decision_id="TEST_ONLY:z";items[1].decision_id="TEST_ONLY:a";
    checkBoth("R2ParentReadV2",body,true);
  });
  it("keeps structured R2 criterion values absent, finite outcomes honest and admission unevaluated",()=>{
    const body=r2();
    for(const item of body.recorded_verdicts.items){for(const key of ["criterion_key","label_key","observed","limit","op","unit","currency"])
      expect(item[key]).toEqual({availability:"NOT_PUBLISHED",value:null,reason_code:"SOURCE_STRUCTURED_CRITERION_NOT_RECORDED"});}
    for(const mutate of [
      (row:any)=>{row.outcome="APPROVED";},(row:any)=>{row.blocking=true;},
      (row:any)=>{row.ordinal=-1;},(row:any)=>{row.evaluated_at_ms=-1;},
      (row:any)=>{row.finding_id+="\n";},(row:any)=>{row.source_ref.approval_id+="\n";},
      (row:any)=>{row.source_ref.kind="PORTAL_STORED_PAPER_EXIT_FINDING";},
      (row:any)=>{row.source_ref.basis="SOURCE_ACCEPTED";},
      (row:any)=>{row.source_ref.evidence_hash="sha256:"+"1".repeat(64);},
      (row:any)=>{row.observed={availability:"AVAILABLE",value:"0",reason_code:null};},
      (row:any)=>{row.limit={availability:"NOT_PUBLISHED",value:0,reason_code:"SOURCE_STRUCTURED_CRITERION_NOT_RECORDED"};},
      (row:any)=>{row.op={availability:"NOT_PUBLISHED",value:null,reason_code:"SOURCE_COMPARATOR_FIELD_NOT_RECORDED"};},
      (row:any)=>{row.label="PRIVATE_PROSE";},(row:any)=>{row.source_receipt={verified:true};},
    ]){const bad=r2();mutate(bad.recorded_verdicts.items[0]);checkBoth("R2ParentReadV2",bad,false);}
    for(const patch of [{limit:65},{admission:{state:"READY",reason_code:null}},{coverage:"FULL_CRITERIA_HISTORY"},
      {source_accepted:true},{reason:"PRIVATE_PROSE"}]){const bad=r2();Object.assign(bad.recorded_verdicts,patch);checkBoth("R2ParentReadV2",bad,false);}
    const noRows=r2();noRows.recorded_verdicts.items=[];checkBoth("R2ParentReadV2",noRows,true);
    const paperVerdicts=paper();paperVerdicts.recorded_verdicts=body.recorded_verdicts;checkBoth("PaperExitParentReadV2",paperVerdicts,false);
    for(const absence of [purposeAbsent,{availability:"NOT_PUBLISHED",reason_code:"RECORDED_VERDICTS_NOT_PUBLIC"}]){
      const bad=r2();bad.recorded_verdicts=absence;checkBoth("R2ParentReadV2",bad,true);
      bad.recorded_verdicts={...absence,value:null};checkBoth("R2ParentReadV2",bad,false);
    }
  });
  it("documents sibling identities, scalar arithmetic and cohort-key order as runtime-only constraints",()=>{
    // JSON Schema cannot compare arbitrary sibling values, infer id-key
    // uniqueness, lexical object-key order or a previous row's ordinal.
    for(const mutate of [
      (body:any)=>{body.recorded_activity.items[0].version_after++;},
      (body:any)=>{body.recorded_activity.items[1].decision_id=body.recorded_activity.items[0].decision_id;},
      (body:any)=>{body.recorded_activity.items[1].operation_id=body.recorded_activity.items[0].operation_id;},
      (body:any)=>{body.recorded_activity.items.reverse();},
      (body:any)=>{body.recorded_verdicts.items[0].source_ref.finding_id="TEST_ONLY:other";},
      (body:any)=>{body.recorded_verdicts.items[0].source_ref.approval_id="TEST_ONLY:other";},
      (body:any)=>{body.recorded_verdicts.items[1].finding_id=body.recorded_verdicts.items[0].finding_id;
        body.recorded_verdicts.items[1].source_ref.finding_id=body.recorded_verdicts.items[0].finding_id;},
      (body:any)=>{body.recorded_verdicts.items.reverse();},
    ]){const body=r2();mutate(body);expect(validate("R2ParentReadV2",body)).toBe(true);
      expect(r2ParentRead.safeParse(body).success).toBe(false);}
  });
});

describe("ELP2-04 pure finite parent composition shapes",()=>{
  it.each([["r2_composition","OperationalR2ParentCompositionV2"],["paper_exit_composition","OperationalPaperExitParentCompositionV2"]])
    ("%s is a pure finite component, no Manager/source authority",(key,name)=>{
      const body=fixture[key];expect(validate(name,body)).toBe(true);
      for(const patch of [{command_authority:{state:"ENABLED",source_side_effect_requested:true}},
        {source_health:{...body.source_health,state:"AVAILABLE"}},
        {lineage:{...body.lineage,source_accepted:true}},
        {data:{...body.data,raw_payload:{}}},
        {private_actor_id:"TEST_ONLY"}])expect(validate(name,{...body,...patch})).toBe(false);
    });
  it("R2 manager facts remain exactly null; wrong nested family and injected payloads fail",()=>{
    const r2=fixture.r2_composition;
    expect(validate("OperationalR2ParentCompositionV2",{...r2,data:{...r2.data,accepted_manager_facts:{}}})).toBe(false);
    expect(validate("OperationalR2ParentCompositionV2",{...r2,data:{...r2.data,governance:fixture.paper_exit}})).toBe(false);
    expect(validate("OperationalPaperExitParentCompositionV2",{...fixture.paper_exit_composition,
      data:{exit_review:{...fixture.paper_exit,raw_hash_preimage:{}}}})).toBe(false);
  });
  it("composition revision excludes transport/observation clock but changes with visible content",()=>{
    const body={governance:clone(fixture.r2),accepted_manager_facts:null};
    const initial=parentCompositionFixture("approval_r2",body,fixture.r2.workspace_id,fixture.r2.observed_at_ms);
    const later=parentCompositionFixture("approval_r2",{...body,governance:{...body.governance,observed_at_ms:1}},
      fixture.r2.workspace_id,fixture.r2.observed_at_ms+1);
    expect(later.read_at_ms).not.toBe(initial.read_at_ms);
    expect(later.composite_revision).toBe(initial.composite_revision);
    expect(later.lineage.workflow_digest).toBe(initial.lineage.workflow_digest);
    const changed=parentCompositionFixture("approval_r2",{...body,governance:{...body.governance,
      approval:{...body.governance.approval,approval_version:2}}},fixture.r2.workspace_id,fixture.r2.observed_at_ms);
    expect(changed.composite_revision).not.toBe(initial.composite_revision);
    expect(()=>parentCompositionFixture("TEST_ONLY_unknown_surface",body,fixture.r2.workspace_id,0)).toThrow("unsupported parent surface");
  });
});

// These declarations are compile-time tripwires after Main runs the existing
// openapi-typescript target. No local parallel hand-written client DTO.
type Assert<T extends true>=T;
type _GeneratedR2=GovernanceTypes["schemas"]["R2ParentReadV2"];
type _GeneratedExit=GovernanceTypes["schemas"]["PaperExitParentReadV2"];
type _GeneratedR2Composition=GovernanceTypes["schemas"]["OperationalR2ParentCompositionV2"];
type _GeneratedExitComposition=GovernanceTypes["schemas"]["OperationalPaperExitParentCompositionV2"];
type _R2Family=Assert<_GeneratedR2["family"] extends "R2"?true:false>;
type _ExitFamily=Assert<_GeneratedExit["family"] extends "PAPER_EXIT"?true:false>;
type _R2ManagerFactsNull=Assert<_GeneratedR2Composition["data"]["accepted_manager_facts"] extends null?true:false>;
type _ExitNested=Assert<_GeneratedExitComposition["data"]["exit_review"]["family"] extends "PAPER_EXIT"?true:false>;
type _R2ServedUnion=Assert<Extract<GovernanceOperations["executionGovernanceR2Review"]["responses"][200]["content"]["application/json"],
  {family:"R2"}> extends _GeneratedR2?true:false>;
type _ExitServedUnion=Assert<Extract<GovernanceOperations["executionGovernancePaperExitReview"]["responses"][200]["content"]["application/json"],
  {family:"PAPER_EXIT"}> extends _GeneratedExit?true:false>;
type _R2ServedPresent=Assert<[Extract<GovernanceOperations["executionGovernanceR2Review"]["responses"][200]["content"]["application/json"],
  {family:"R2"}>] extends [never]?false:true>;
type _ExitServedPresent=Assert<[Extract<GovernanceOperations["executionGovernancePaperExitReview"]["responses"][200]["content"]["application/json"],
  {family:"PAPER_EXIT"}>] extends [never]?false:true>;
type _R2Selected=GovernanceTypes["schemas"]["R2ParentOperationReadV2"];
type _ExitSelected=GovernanceTypes["schemas"]["PaperExitParentOperationReadV2"];
type _SelectedSchema=Assert<_R2Selected["schema_version"] extends "portal.execution.governance-parent-operation.v2"?true:false>;
type _SelectedStatus=Assert<_R2Selected["status"] extends "PLANNED"|"APPLIED"|"EXPIRED"?true:false>;
type _PaperCapturedNull=Assert<_ExitSelected["parent_approval_id"] extends null?true:false>;
type _SandboxParent=GovernanceTypes["schemas"]["SandboxParentReadV2"];
type _CanaryParent=CanaryTypes["schemas"]["CanaryParentReadV2"];
type _SandboxWire=GovernanceOperations["getSandboxCertification"]["responses"][200]["content"]["application/json"];
type _CanaryWire=CanaryOperations["getCanaryControlRoom"]["responses"][200]["content"]["application/json"];
type _SandboxServed=Extract<_SandboxWire,{schema_version:"portal.execution.following-parent.v2";family:"SANDBOX"}>;
type _CanaryServed=Extract<_CanaryWire,{schema_version:"portal.execution.following-parent.v2";family:"CANARY"}>;
type _SandboxPresent=Assert<[_SandboxServed] extends [never]?false:true>;
type _CanaryPresent=Assert<[_CanaryServed] extends [never]?false:true>;
type _SandboxShape=Assert<_SandboxServed extends _SandboxParent?true:false>;
type _CanaryShape=Assert<_CanaryServed extends _CanaryParent?true:false>;
type _SandboxEnvironment=Assert<_SandboxParent["anchors"]["environment"] extends "SANDBOX"?true:false>;
type _CanaryEnvironment=Assert<_CanaryParent["anchors"]["environment"] extends "LIVE"?true:false>;
type _CurrentAssociationOnly=Assert<_CanaryParent["anchors"]["captured_environment_attested"] extends false?true:false>;
type _CanaryInactive=Assert<_CanaryParent["envelope"]["production_command_active"] extends false?true:false>;
type _CanaryProposal=Extract<_CanaryParent["proposal"],{availability:"AVAILABLE"}>;
type _CanaryProposalPresent=Assert<[_CanaryProposal] extends [never]?false:true>;
type _CanaryExactCap=Assert<_CanaryProposal["capital_cap"] extends string?true:false>;
type _CanaryProposalNotEffective=Assert<_CanaryProposal["basis"] extends "PROPOSED_NOT_EFFECTIVE"?true:false>;
type _OperationsWire=OperationsOperations["getExecutionCommandOperationF0"]["responses"][200]["content"]["application/json"];
type _GovernanceWire=GovernanceOperations["getPaperExitDecisionOperation"]["responses"][200]["content"]["application/json"];
type _OperationR2=Extract<_OperationsWire,{schema_version:"portal.execution.governance-parent-operation.v2";family:"R2"}>;
type _OperationExit=Extract<_OperationsWire,{schema_version:"portal.execution.governance-parent-operation.v2";family:"PAPER_EXIT"}>;
type _GovernanceR2=Extract<_GovernanceWire,{schema_version:"portal.execution.governance-parent-operation.v2";family:"R2"}>;
type _GovernanceExit=Extract<_GovernanceWire,{schema_version:"portal.execution.governance-parent-operation.v2";family:"PAPER_EXIT"}>;
type _OperationR2Present=Assert<[_OperationR2] extends [never]?false:true>;
type _OperationExitPresent=Assert<[_OperationExit] extends [never]?false:true>;
type _GovernanceR2Present=Assert<[_GovernanceR2] extends [never]?false:true>;
type _GovernanceExitPresent=Assert<[_GovernanceExit] extends [never]?false:true>;
type _SelectedR2Shape=Assert<_OperationR2|_GovernanceR2 extends _R2Selected?true:false>;
type _SelectedExitShape=Assert<_OperationExit|_GovernanceExit extends _ExitSelected?true:false>;


describe("ELP2-04 finite current ROOT Activation metadata contracts",()=>{
  const definitions=activationCurrentSchemas(),fixtures=activationCurrentFixture();
  const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);ajv.addSchema({$id:"TEST_ONLY:activation-current",$defs:definitions});
  const runtime={ActivationCapabilitiesReadV2:currentActivationCapabilities,ActivationPlanReadV2:currentActivationPlanRead};
  const pairs=[["capabilities","ActivationCapabilitiesReadV2"],["plan","ActivationPlanReadV2"],["plan_absent","ActivationPlanReadV2"]] as const;
  const check=(name:keyof typeof runtime,value:unknown,expected:boolean)=>{
    expect(ajv.compile({$ref:"TEST_ONLY:activation-current#/$defs/"+name})(value)).toBe(expected);
    expect(runtime[name].safeParse(value).success).toBe(expected);
  };
  it("documents structural schema versus runtime chronology without manufacturing a current expiry",()=>{
    const historical=clone(fixtures.plan);
    historical.plan.expires_at_ms=historical.plan.created_at_ms;
    check("ActivationPlanReadV2",historical,true);
    const invalid=clone(historical);invalid.plan.expires_at_ms=invalid.plan.created_at_ms-1;
    // JSON Schema validates the finite shape; sibling chronology is enforced
    // by canonical Zod and the protected repository, not a fictitious $data rule.
    expect(ajv.compile({$ref:"TEST_ONLY:activation-current#/$defs/ActivationPlanReadV2"})(invalid)).toBe(true);
    expect(currentActivationPlanRead.safeParse(invalid).success).toBe(false);
  });
  it("publishes strict standalone variants, generated existing GET unions, exact TEST_ONLY fixture and no new paths",()=>{
    const schema=load("schemas/execution-operations.v1.schema.json"),api=load("openapi/execution-staged-activation.openapi.json");
    for(const[name,value]of Object.entries(definitions))expect(schema.$defs[name]).toEqual(value);
    expect(load("fixtures/"+activationFixtureName)).toEqual(fixtures);expect(fixtures.authority_installed).toBe(false);
    const updated=clone(api);updateActivationPaths(updated);expect(updated).toEqual(api);
    for(const[path,name,legacy]of activationReadRoutes){
      expect(api.paths[path].get.responses[200].content["application/json"].schema).toEqual({oneOf:[
        {$ref:"../schemas/execution-staged-activation.v1.schema.json#/$defs/"+legacy},
        {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name}]});
      expect(api.paths[path].get.parameters.filter(p=>p.name==="environment")).toHaveLength(1);
      expect(api.paths[path].get.parameters.find(p=>p.name==="environment").required).toBe(false); //Legacy remains compatible.
      expect(api.paths[path].get.responses[200].headers["Cache-Control"].schema.const).toBe("private, no-store");
    }
    const input=clone(api);input.paths[activationReadRoutes[0][0]].post={operationId:"TEST_ONLY preserved"};
    const post=clone(input.paths[activationReadRoutes[0][0]].post);updateActivationPaths(input);
    expect(input.paths[activationReadRoutes[0][0]].post).toEqual(post);expect(Object.keys(input.paths)).toEqual(Object.keys(api.paths));
    const capabilities:ActivationOperations["listActivationCapabilities"]["responses"][200]["content"]["application/json"]=fixtures.capabilities;
    const plan:ActivationOperations["getStagedActivationPlan"]["responses"][200]["content"]["application/json"]=fixtures.plan;
    expect(capabilities.schema_version).toBe("portal.execution.activation-capabilities-read.v2");expect(plan.schema_version).toBe("portal.execution.activation-plan-read.v2");
  });
  it.each(pairs)("%s has strict AJV/Zod parity and never leaks rich legacy fields",(key,name)=>{
    const body=fixtures[key];check(name,body,true);
    for(const privateField of ["actor","reason","request_key","signer_fingerprint","detached_signature","witness","evidence_set_hash"])
      check(name,{...body,[privateField]:"TEST_ONLY_PRIVATE"},false);
    const wrong=clone(body);wrong.perspective.captured_native_environment="live";check(name,wrong,false);
    const missing=clone(body);delete missing.perspective;check(name,missing,false);
  });
  it("missing rows cannot masquerade as default persisted observations; actual source flags remain exact",()=>{
    const missing=clone(fixtures.capabilities);missing.capabilities[0]={capability_key:"PROJECTION",record_state:"NOT_RECORDED",capability_version:1};
    check("ActivationCapabilitiesReadV2",missing,false);
    const duplicate=clone(fixtures.capabilities);duplicate.capabilities[0]=duplicate.capabilities[1];check("ActivationCapabilitiesReadV2",duplicate,false);
    for(const[field,value]of [["source_enabled",true],["runtime_enabled",true],["kill_switch_engaged",false]]){
      const body=clone(fixtures.plan);body.capability[field]=value;check("ActivationPlanReadV2",body,false);
    }
    const mismatch=clone(fixtures.plan);mismatch.capability.capability_key="SSE";check("ActivationPlanReadV2",mismatch,false);
    const absent=clone(fixtures.plan_absent);absent.evidence.items=[];check("ActivationPlanReadV2",absent,false);
    const privateChild=clone(fixtures.plan);privateChild.evidence.items[0].signer_fingerprint="TEST_ONLY";check("ActivationPlanReadV2",privateChild,false);
  });
  it("only explicit Activation purposes authorize reviewed ROOT audit intake; legacy deployment/Portfolio meanings stay separate",()=>{
    const purpose="ACTIVATION_PLAN_ROOT" as const;
    const seal={purpose,environment:"paper",contract_revision:"portal.execution.parent-fields.v1",field_policy_ref:"TEST_ONLY:activation",
      field_set_sha256:parentFieldSetDigest(purpose),valid_from_ms:0,valid_until_ms:10000};
    const policy=reviewedAccessPolicy.parse({workspace_id:"TEST_ONLY:ws",revision:"TEST_ONLY:policy",artifact_digest:"sha256:"+"1".repeat(64),
      approval_ref:"TEST_ONLY:review",state:"REVIEWED",qualification:"TEST_ONLY",protected_owner_user_id:"TEST_ONLY:owner",
      researcher_fields:{state:"PENDING",policy_ref:null,fields:[]},parent_read_fields:[seal]});
    const grant=scopedAccessGrant.parse({grant_id:"TEST_ONLY:grant",workspace_id:policy.workspace_id,subject_user_id:"TEST_ONLY:reader",
      action:"audit.read",effect:"ALLOW",selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"ROOT",ids:["TEST_ONLY:root"]},
      environments:["paper"],valid_from_ms:0,valid_until_ms:10000,delegable_actions:[],issued_by:"TEST_ONLY:owner",parent_grant_id:null,
      revision:"TEST_ONLY:grant-v1",policy_revision:policy.revision,revoked_at_ms:null,requires_ts_acceptance:true,ts_receipt:null,field_policy_ref:seal.field_policy_ref});
    expect(reviewedParentAuditRoot(grant,policy,100)).toBe(true);
    expect(reviewedParentAuditRoot({...grant,selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"DEPLOYMENT",ids:["TEST_ONLY:dep"]}},policy,100)).toBe(false);
    expect(reviewedParentAuditRoot({...grant,requires_ts_acceptance:false},policy,100)).toBe(false);
    expect(reviewedParentAuditRoot(grant,policy,10000)).toBe(false);
    const oldPolicy={...policy,parent_read_fields:[{...seal,purpose:"R2_ROOT" as const,field_set_sha256:parentFieldSetDigest("R2_ROOT")}]};
    expect(reviewedParentAuditRoot(grant,oldPolicy,100)).toBe(false);
    expect(reviewedParentAuditRoot({...grant,selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"DEPLOYMENT",ids:["TEST_ONLY:dep"]}},oldPolicy,100)).toBe(true);
  });

});

describe("C5 stored actors, latest Portal operation and R2 plan inputs",()=>{
  // Construct finite TEST_ONLY values from canonical roots, never a claimed
  // installed authority. Main owns fixture/schema emitter and generation.
  const missing={availability:"NOT_PUBLISHED",reason_code:"PARENT_FIELD_PURPOSE_NOT_QUALIFIED"} as const;
  function available(key:"r2"|"paper_exit"):any{
    const base=clone(fixture[key]),r2=key==="r2";
    base.actors={availability:"AVAILABLE",basis:"STORED_PORTAL_ACTOR_IDS_NOT_DECISION_AUTHORIZATION",
      requester_user_id:"TEST_ONLY:requester",artifact_creator_user_id:"TEST_ONLY:creator",decided_by_user_id:null,
      viewer_is_requester:false,viewer_is_artifact_creator:false,viewer_is_decided_by:null};
    base.latest_operation={availability:"AVAILABLE",basis:"LATEST_RECORDED_PORTAL_PLAN_NOT_ACTION_ELIGIBILITY",
      operation_id:"TEST_ONLY:latest",command_version:1,command_type:r2?"GOVERNANCE_R2_DECISION":"GOVERNANCE_PAPER_EXIT_DECISION",
      stored_status:"PLANNED",created_at_ms:base.approval.created_at_ms,
      order_basis:"POSTGRES_CREATED_AT_DESC_OPERATION_ID_C_ASC"};
    if(r2)base.decision_context={availability:"AVAILABLE",basis:"VERIFIED_STORED_R2_INPUTS_NOT_ACTION_AUTHORIZATION",
      gate:"R2",workspace_id:base.workspace_id,approval_id:base.approval.approval_id,
      expected_approval_version:base.approval.approval_version,evidence_set_hash:"sha256:"+"c".repeat(64),
      evidence_hashes:{availability:"AVAILABLE",value:["sha256:"+"a".repeat(64),"sha256:"+"b".repeat(64)],reason_code:null},
      command_type:"GOVERNANCE_R2_DECISION",request_schema_version:"governance.r2-decision-plan-request.v1",
      plan_path:"/api/v1/execution/commands/plans",admission:{state:"NOT_EVALUATED",reason_code:"CURRENT_DECISION_ADMISSION_REQUIRES_PLAN"},
      source_side_effect_requested:false};
    return base;
  }
  it.each(["r2","paper_exit"] as const)("%s publishes both available and independently purpose-absent sections",key=>{
    const name=key==="r2"?"R2ParentReadV2":"PaperExitParentReadV2",body=available(key);
    checkBoth(name,body,true);
    const generated:GovernanceTypes["schemas"]["R2ParentReadV2"]|GovernanceTypes["schemas"]["PaperExitParentReadV2"]=body;
    expect(generated.actors).toEqual(body.actors);expect(generated.latest_operation).toEqual(body.latest_operation);
    body.actors=missing;body.latest_operation=missing;if(key==="r2")body.decision_context=missing;
    checkBoth(name,body,true);
    for(const field of ["actors","latest_operation",...(key==="r2"?["decision_context"]:[])]){
      const absent=clone(body);delete absent[field];checkBoth(name,absent,false);
    }
  });
  it.each(["r2","paper_exit"] as const)("%s rejects actor private fields, invalid IDs and null/boolean contradiction in both validators",key=>{
    const name=key==="r2"?"R2ParentReadV2":"PaperExitParentReadV2";
    for(const mutate of [
      (row:any)=>{row.requester_username="TEST_ONLY:private";},
      (row:any)=>{row.requester_user_id+="\n";},
      (row:any)=>{row.artifact_creator_user_id="https://private.example/";},
      (row:any)=>{row.decided_by_user_id=null;row.viewer_is_decided_by=false;},
      (row:any)=>{row.decided_by_user_id="TEST_ONLY:decider";row.viewer_is_decided_by=null;},
      (row:any)=>{row.can_decide=true;},
    ]){const body=available(key);mutate(body.actors);checkBoth(name,body,false);}
    const exactFalse=available(key);exactFalse.actors.decided_by_user_id="TEST_ONLY:decider";
    exactFalse.actors.viewer_is_decided_by=false;checkBoth(name,exactFalse,true);
  });
  it.each(["r2","paper_exit"] as const)("%s latest family, finite status and fixed absence are not action permission or private receipt",key=>{
    const name=key==="r2"?"R2ParentReadV2":"PaperExitParentReadV2";
    for(const status of ["PLANNED","APPLIED","EXPIRED"]){const body=available(key);body.latest_operation.stored_status=status;checkBoth(name,body,true);}
    for(const reason of ["NO_RECORDED_PORTAL_OPERATION","LATEST_RECORDED_OPERATION_NOT_PUBLIC"]){
      const body=available(key);body.latest_operation={availability:"NOT_PUBLISHED",reason_code:reason};checkBoth(name,body,true);
    }
    for(const patch of [
      {command_type:key==="r2"?"GOVERNANCE_PAPER_EXIT_DECISION":"GOVERNANCE_R2_DECISION"},
      {command_version:2},{stored_status:"READY"},{operation_id:"TEST_ONLY:latest\n"},{created_at_ms:-1},
      {order_basis:"JS_DATE_SORT"},{apply_token:"PRIVATE"},{response_json:{}},{can_apply:true},
    ]){const body=available(key);Object.assign(body.latest_operation,patch);checkBoth(name,body,false);}
    const leaked=available(key);leaked.latest_operation={availability:"NOT_PUBLISHED",reason_code:"LATEST_RECORDED_OPERATION_NOT_PUBLIC",operation_id:"PRIVATE"};
    checkBoth(name,leaked,false);
  });
  it("R2 request pins never claim admission, capital or a TS verdict; hash absence differs from empty",()=>{
    const body=available("r2");checkBoth("R2ParentReadV2",body,true);
    for(const patch of [
      {admission:{state:"READY",reason_code:null}},{source_side_effect_requested:true},{command_type:"GOVERNANCE_R1_DECISION"},
      {request_schema_version:"governance.r1-decision-plan-request.v1"},{plan_path:"/api/v1/other"},
      {economic_backing:"0"},{can_decide:true},{receipt:{state:"APPLIED"}},
      {evidence_hashes:{availability:"AVAILABLE",value:null,reason_code:null}},
      {evidence_hashes:{availability:"NOT_PUBLISHED",value:[],reason_code:"EVIDENCE_HASH_LIMIT_EXCEEDED"}},
      {evidence_hashes:{availability:"AVAILABLE",value:["sha256:"+"a".repeat(64),"sha256:"+"a".repeat(64)],reason_code:null}},
      {evidence_hashes:{availability:"AVAILABLE",value:Array.from({length:129},(_,i)=>"sha256:"+i.toString(16).padStart(64,"0")),reason_code:null}},
    ]){const changed=clone(body);Object.assign(changed.decision_context,patch);checkBoth("R2ParentReadV2",changed,false);}
    for(const hashes of [
      {availability:"AVAILABLE",value:[],reason_code:null},
      {availability:"NOT_PUBLISHED",value:null,reason_code:"EVIDENCE_HASH_LIMIT_EXCEEDED"},
    ]){const changed=clone(body);changed.decision_context.evidence_hashes=hashes;checkBoth("R2ParentReadV2",changed,true);}
  });
  it("keeps arbitrary context/parent equality and hash lexical sorting runtime-only",()=>{
    // Ordinary JSON Schema can express the family/admission/null invariants
    // above, not sibling-value equality or lexical array order. Do not add a
    // custom comparison vocabulary or claim AJV rejects these by itself.
    for(const mutate of [
      (row:any)=>{row.workspace_id="TEST_ONLY:other-workspace";},
      (row:any)=>{row.approval_id="TEST_ONLY:other-approval";},
      (row:any)=>{row.expected_approval_version++;},
      (row:any)=>{row.evidence_hashes.value.reverse();},
    ]){const body=available("r2");mutate(body.decision_context);
      expect(validate("R2ParentReadV2",body)).toBe(true);expect(r2ParentRead.safeParse(body).success).toBe(false);}
    // Public approval deliberately omits evidence_set_hash. Its context hash
    // is verified against the private OWN manifest by the actual PG tests,
    // never against an invented public approval.evidence_set_hash sibling.
  });
});
