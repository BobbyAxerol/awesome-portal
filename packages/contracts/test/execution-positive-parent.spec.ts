/** Finite parent contract publication and canonical runtime parity.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {describe,expect,it} from "vitest";
import {r2ParentRead,paperExitParentRead} from "../../../apps/control-api/src/governance/positive-parent.contract";
import {parentReadFieldSeals,parentFieldSetDigest,parentFieldPurpose} from "../../../apps/control-api/src/execution-v2/parent-read-fields";
import {parentCurrentSchemas,parentCurrentFixture,parentCompositionFixture,parentReadRoutes,parentFixtureName,
  updateParentPaths} from "../tooling/execution-positive-parent-reader.mjs";
import type {components as GovernanceTypes,operations as GovernanceOperations} from "../generated/execution-governance";

const root=resolve(__dirname,".."),load=(path:string)=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const api=load("openapi/execution-governance.openapi.json"),stored=load("schemas/execution-operations.v1.schema.json");
const fixture=load("fixtures/"+parentFixtureName),definitions=parentCurrentSchemas();
// Strict mode belongs to the finite new definitions; no disabling strictness
// to accommodate the legacy OpenAPI document or unrelated historical schemas.
const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);
ajv.addSchema({$id:"TEST_ONLY:positive-parent",$defs:definitions});
const validate=(name:string,value:unknown)=>ajv.compile({$ref:"TEST_ONLY:positive-parent#/$defs/"+name})(value);
const clone=<T>(value:T):T=>structuredClone(value);
const runtime={R2ParentReadV2:r2ParentRead,PaperExitParentReadV2:paperExitParentRead};
const pairs=[
  ["r2","R2ParentReadV2"],["r2_absent","R2ParentReadV2"],
  ["paper_exit","PaperExitParentReadV2"],["paper_exit_absent","PaperExitParentReadV2"],
  ["paper_exit_extended","PaperExitParentReadV2"],
] as const;
const checkBoth=(name:keyof typeof runtime,value:unknown,expected:boolean)=>{
  expect(validate(name,value),name+" JSON Schema").toBe(expected);
  expect(runtime[name].safeParse(value).success,name+" canonical Zod").toBe(expected);
};

describe("ELP2-04 finite current-authorized R2/Paper Exit contracts",()=>{
  it("private reviewed field seals bind exact finite purpose semantics, intervals and environments, never arbitrary fields",()=>{
    const seals=parentFieldPurpose.options.map(purpose=>({purpose,environment:"paper",
      contract_revision:"portal.execution.parent-fields.v1",field_policy_ref:"TEST_ONLY:"+purpose,
      field_set_sha256:parentFieldSetDigest(purpose),valid_from_ms:0,valid_until_ms:1}));
    expect(parentReadFieldSeals.safeParse(seals).success).toBe(true);
    expect(new Set(seals.map(seal=>seal.field_set_sha256)).size).toBe(seals.length);
    const first=seals[0]!;
    for(const values of [
      [...seals,first],Array(17).fill(first),
      [{...first,field_set_sha256:parentFieldSetDigest("PAPER_EXIT_ROOT")}],
      [{...first,environment:"live"}],[{...first,purpose:"ALL_FIELDS"}],
      [{...first,contract_revision:"UNREVIEWED"}],[{...first,valid_until_ms:0}],
      [{...first,valid_until_ms:Number.MAX_SAFE_INTEGER+1}],[{...first,arbitrary_field:"nav"}],
    ])expect(parentReadFieldSeals.safeParse(values).success).toBe(false);
  });
  it("publishes exactly four finite definitions and fixture-only provenance without installing authority",()=>{
    expect(Object.keys(definitions)).toEqual(["R2ParentReadV2","PaperExitParentReadV2",
      "OperationalR2ParentCompositionV2","OperationalPaperExitParentCompositionV2"]);
    for(const [name,value]of Object.entries(definitions)){
      expect(stored.$defs[name]).toEqual(value);
      expect(api.components.schemas[name]).toEqual({$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name});
    }
    expect(fixture).toEqual(parentCurrentFixture());
    expect(fixture).toMatchObject({lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,
      production_config:false,authority_installed:false});
    expect(JSON.stringify(fixture)).not.toMatch(/secret|jwt|password|private_intent|frozen_json|notional|economic_capital/);
  });
  it.each(pairs)("%s matches strict generated schema and canonical runtime",(key,name)=>{
    checkBoth(name,fixture[key],true);
    checkBoth(name,{...fixture[key],private_actor_id:"TEST_ONLY"},false);
  });
  it("preserves both existing operationIds/parameters and legacy response variants; adds no route or command DTO",()=>{
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
    expect(Object.keys(definitions).some(name=>name.includes("OperationRead"))).toBe(false);
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
    expect(()=>parentCompositionFixture("live_review",body,fixture.r2.workspace_id,0)).toThrow("unsupported parent surface");
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
