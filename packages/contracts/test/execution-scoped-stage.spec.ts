/**
 * BE-P12: the opt-in `identity` / `stage_facts` members of the SCOPED_V2 stage bodies.
 * TEST_ONLY schema/fixture parity; no source or policy authority is installed by any of this.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {describe,expect,it} from "vitest";
import {liveSourceOperationsRead} from "../../../apps/control-api/src/live/live-source.contract";
import {sandboxParentRead,canaryParentRead} from "../../../apps/control-api/src/governance/following-parent.contract";
import {scopedIdentity} from "../../../apps/control-api/src/execution/scoped-stage-wire.contract";
import {ALPHA_IDENTITY_REASONS,PORTFOLIO_NAME_REASONS} from "../../../apps/control-api/src/execution/deployment-identity.contract";
import {parentFieldSetDigest,PARENT_FIELD_SEAL_CAP} from "../../../apps/control-api/src/execution-v2/parent-read-fields";
import {scopedIdentityAlphaReasons,scopedIdentityPortfolioReasons,scopedIdentityExamples,
  followingReadRoutes,liveSourceFixtureName,parentFixtureName} from "../tooling/execution-positive-parent-reader.mjs";
import type {components as LiveTypes,operations as LiveOperations} from "../generated/execution-live-full";
import type {components as GovernanceTypes} from "../generated/execution-governance";
import type {components as CanaryTypes} from "../generated/execution-canary";

const root=resolve(__dirname,".."),load=(file:string)=>JSON.parse(readFileSync(resolve(root,file),"utf8"));
const clone=<T>(value:T):T=>structuredClone(value);
const live=load("fixtures/"+liveSourceFixtureName),parents=load("fixtures/"+parentFixtureName);
const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);
ajv.addSchema(load("schemas/execution-stage-facts.v1.schema.json"));
const operations=load("schemas/execution-operations.v1.schema.json");
ajv.addSchema(operations);
const compiled=(name:string)=>ajv.getSchema(operations.$id+"#/$defs/"+name)!;
const validators={live:compiled("LiveSourceOperationsReadV2"),sandbox:compiled("SandboxParentReadV2"),canary:compiled("CanaryParentReadV2")};
const zod={live:liveSourceOperationsRead,sandbox:sandboxParentRead,canary:canaryParentRead};
const check=(kind:keyof typeof validators,body:unknown,expected:boolean)=>{
  expect(validators[kind](body),kind+" published JSON Schema "+JSON.stringify(validators[kind].errors)).toBe(expected);
  expect(zod[kind].safeParse(body).success,kind+" canonical Zod").toBe(expected);
};

describe("BE-P12 identity block: one closed shape in three bodies",()=>{
  const examples=scopedIdentityExamples();
  it("the published reason words are exactly the producer's (no second vocabulary)",()=>{
    expect([...scopedIdentityAlphaReasons]).toEqual([...ALPHA_IDENTITY_REASONS]);
    expect([...scopedIdentityPortfolioReasons]).toEqual([...PORTFOLIO_NAME_REASONS]);
  });
  it.each([["live","with_members"],["live","with_members_hidden"]] as const)("%s %s is valid in both validators",(kind,key)=>{
    check(kind,live[key],true);
    expect(live[key].identity).toEqual(key==="with_members"?examples.named:examples.hidden);
  });
  it.each([["sandbox","sandbox_identity"],["sandbox","sandbox_identity_hidden"],["canary","canary_identity"],["canary","canary_identity_hidden"]] as const)(
    "%s %s is the sealed parent plus the identity block, valid in both validators",(kind,key)=>{
      check(kind,parents[key],true);
      const {identity:_identity,...rest}=parents[key];
      // Nothing of the sealed record moved: the same body without the block is the pre-existing fixture family.
      check(kind,rest,true);
    });
  it("the original bodies are untouched and still valid: identity and stage_facts are optional",()=>{
    check("live",live.populated,true);check("live",live.unpublished,true);
    for(const key of ["sandbox","sandbox_absent","sandbox_draft"])check("sandbox",parents[key],true);
    for(const key of ["canary","canary_absent","canary_revision"])check("canary",parents[key],true);
    expect(validators.live.schema).toMatchObject({required:expect.not.arrayContaining(["identity","stage_facts"])});
    for(const kind of ["sandbox","canary"] as const)
      expect(validators[kind].schema).toMatchObject({required:expect.not.arrayContaining(["identity"])});
  });
  it("alpha_name is the constant null: no name is ever invented, in either validator",()=>{
    for(const name of ["Some Alpha","","null"]){
      for(const [kind,body] of [["live",live.with_members],["sandbox",parents.sandbox_identity],["canary",parents.canary_identity]] as const){
        const changed=clone(body);changed.identity.alpha_name=name;check(kind,changed,false);
      }
    }
  });
  it.each([
    ["a known alpha without ALPHA_NAME_NOT_PUBLISHED",(i:any)=>{i.alpha_reason_code="ALPHA_IDENTITY_NOT_AUTHORIZED";}],
    ["an unknown alpha claiming ALPHA_NAME_NOT_PUBLISHED",(i:any)=>{i.alpha_id=null;}],
    ["a portfolio name with a reason",(i:any)=>{i.portfolio_name_reason_code="PORTFOLIO_NAME_NOT_PUBLISHED";}],
    ["no portfolio name and no reason",(i:any)=>{i.portfolio_name=null;}],
    ["an alpha reason that is not in the vocabulary",(i:any)=>{i.alpha_reason_code="GUESS";}],
    ["a missing key",(i:any)=>{delete i.alpha_reason_code;}],
    ["a missing basis",(i:any)=>{delete i.basis;}],
    ["a different basis",(i:any)=>{i.basis="PORTAL_RECORD";}],
    ["an extra key",(i:any)=>{i.alpha_label="Unnamed alpha";}],
    ["a strategy id promoted to an alpha id with a bad shape",(i:any)=>{i.alpha_id="has space";}],
    ["an unsafe portfolio name (control character)",(i:any)=>{i.portfolio_name="bad\nname";}],
    ["an unsafe portfolio name (bidi override)",(i:any)=>{i.portfolio_name="bad‮name";}],
    ["a portfolio name with leading space",(i:any)=>{i.portfolio_name=" padded";}],
    ["an over-long portfolio name",(i:any)=>{i.portfolio_name="x".repeat(257);}],
  ])("refuses %s (both validators, all three bodies)",(_label,mutate)=>{
    for(const [kind,body] of [["live",live.with_members],["sandbox",parents.sandbox_identity],["canary",parents.canary_identity]] as const){
      const changed=clone(body);mutate(changed.identity);check(kind,changed,false);
    }
  });
  it("Zod alone is the identity authority for what JSON Schema expresses: same verdict on the examples",()=>{
    expect(scopedIdentity.safeParse(examples.named).success).toBe(true);
    expect(scopedIdentity.safeParse(examples.hidden).success).toBe(true);
    expect(scopedIdentity.safeParse({...examples.named,portfolio_name:"😀".repeat(256)}).success).toBe(true);
    expect(scopedIdentity.safeParse({...examples.named,portfolio_name:"😀".repeat(257)}).success).toBe(false);
  });
});

describe("BE-P12 Live stage_facts: only what an authorized population can prove",()=>{
  const facts=(key:"with_members"|"with_members_hidden")=>live[key].stage_facts;
  it("the examples carry the published stage-facts family schema_version and typed reasons",()=>{
    for(const key of ["with_members","with_members_hidden"] as const){
      expect(facts(key).schema_version).toBe("execution.stage-facts.v1");
      expect(facts(key).runtime.runtime_state).toMatchObject({availability:"NOT_PUBLISHED",reason_code:"RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY"});
      expect(facts(key).sessions).toMatchObject({availability:"NOT_PUBLISHED",reason_code:"SCOPED_SESSION_ROW_FIELDS_NOT_IN_READ_VOCABULARY",rows:[]});
    }
    expect(facts("with_members").reconciliation.verdict).toEqual({availability:"AVAILABLE",value:"OPEN_FINDINGS",reason_code:null});
    expect(facts("with_members_hidden").reconciliation.verdict).toMatchObject({availability:"NOT_PUBLISHED",reason_code:"AUTHORIZED_POPULATION_ONLY"});
  });
  it.each([
    ["NO_OPEN_FINDINGS",(f:any)=>{f.reconciliation.verdict={availability:"AVAILABLE",value:"NO_OPEN_FINDINGS",reason_code:null};}],
    ["an exact open-finding count",(f:any)=>{f.reconciliation.open_finding_count={availability:"AVAILABLE",value:1,reason_code:null};}],
    ["an exact zero unknown-order count",(f:any)=>{f.reconciliation.unknown_order_count={availability:"AVAILABLE",value:0,reason_code:null};}],
    ["an AVAILABLE session list",(f:any)=>{f.sessions={availability:"AVAILABLE",reason_code:null,basis:"EXECUTION_SESSIONS_BOUNDED_WINDOW",
      rows:[],returned_count:0,omitted_count:0,source_complete:true};}],
    ["a fact that is neither AVAILABLE nor NOT_PUBLISHED",(f:any)=>{f.reconciliation.verdict={availability:"UNKNOWN",value:null,reason_code:"X"};}],
    ["an extra key",(f:any)=>{f.extra=true;}],
    ["a lower-case reason",(f:any)=>{f.runtime.since.reason_code="because";}],
  ])("refuses %s on a SCOPED_V2 Live body, in both validators",(_label,mutate)=>{
    const changed=clone(live.with_members);mutate(changed.stage_facts);check("live",changed,false);
  });
  it("accepts a source-observed scoped runtime state and time without asserting activation",()=>{
    const changed=clone(live.with_members);
    changed.stage_facts.runtime.runtime_state={availability:"AVAILABLE",value:"RUNNING",reason_code:null};
    changed.stage_facts.runtime.since={availability:"AVAILABLE",value:"2026-10-12T08:00:00.000Z",reason_code:null};
    check("live",changed,true);
    expect(changed.stage_facts.reconciliation.open_finding_count.availability).toBe("NOT_PUBLISHED");
    expect(changed.stage_facts.sessions.availability).toBe("NOT_PUBLISHED");
  });
  it("the same facts are legal on the V1 body family (the rule is the scoped read's, not the vocabulary's)",()=>{
    const v1=load("schemas/execution-stage-facts.v1.schema.json");
    const validate=ajv.getSchema(v1.$id+"#/$defs/StageFacts")!;
    const body=clone(live.with_members.stage_facts);
    body.reconciliation.verdict={availability:"AVAILABLE",value:"NO_OPEN_FINDINGS",reason_code:null};
    body.reconciliation.open_finding_count={availability:"AVAILABLE",value:0,reason_code:null};
    expect(validate(body),JSON.stringify(validate.errors)).toBe(true);
  });
});

describe("BE-P12 route surface: query parameters only, no new route",()=>{
  const includeOf=(file:string,path:string)=>load("openapi/"+file+".openapi.json").paths[path].get.parameters.find((p:{name:string})=>p.name==="include");
  it("Live, Sandbox and Canary each gain one optional `include` query parameter on the EXISTING GET",()=>{
    const live=load("openapi/execution-live-full.openapi.json");
    expect(Object.keys(live.paths)).toEqual(["/api/v1/execution/deployments/{deployment_id}/live"]);
    expect(includeOf("execution-live-full","/api/v1/execution/deployments/{deployment_id}/live")).toMatchObject({in:"query",required:false,
      schema:{enum:["identity","stage_facts","identity,stage_facts","stage_facts,identity"]}});
    expect(includeOf("execution-governance",followingReadRoutes.sandbox)).toMatchObject({in:"query",required:false,schema:{enum:["identity"]}});
    expect(includeOf("execution-canary",followingReadRoutes.canary)).toMatchObject({in:"query",required:false,schema:{enum:["identity"]}});
  });
});

describe("BE-P12 sealed-digest discipline: no parent-field purpose was added or changed",()=>{
  // The identity block is not a parent record field, so none of these may move. A change here would
  // invalidate a reviewed seal an installed policy already carries.
  it.each([
    ["SANDBOX_ROOT"],["SANDBOX_STEPS"],["SANDBOX_LINEAGE"],["CANARY_ROOT"],["CANARY_PROPOSAL"],["CANARY_LINEAGE"],["LIVE_ROOT"],
  ] as const)("%s keeps its reviewed field-set digest",purpose=>{
    expect(parentFieldSetDigest(purpose)).toBe(PINNED[purpose]);
  });
  it("the seal cap is unchanged",()=>{expect(PARENT_FIELD_SEAL_CAP).toBe(31);});
});

// Compile-only: the generated types carry the optional members, and only optionally.
type Assert<T extends true>=T;
type LiveBody=LiveTypes["schemas"]["LiveSourceOperationsReadV2"];
type _LiveIdentityOptional=Assert<{} extends Pick<LiveBody,"identity">?true:false>;
type _LiveFactsOptional=Assert<{} extends Pick<LiveBody,"stage_facts">?true:false>;
type _AlphaNameNull=Assert<NonNullable<LiveBody["identity"]>["alpha_name"] extends null?true:false>;
type _Include=Assert<NonNullable<NonNullable<LiveOperations["getLiveFullOperations"]["parameters"]["query"]>["include"]> extends
  "identity"|"stage_facts"|"identity,stage_facts"|"stage_facts,identity"?true:false>;
type SandboxBody=GovernanceTypes["schemas"]["SandboxParentReadV2"];
type CanaryBody=CanaryTypes["schemas"]["CanaryParentReadV2"];
type _SandboxIdentityOptional=Assert<{} extends Pick<SandboxBody,"identity">?true:false>;
type _CanaryIdentityOptional=Assert<{} extends Pick<CanaryBody,"identity">?true:false>;

// Pinned from the tree BEFORE BE-P12 (be6d98d1); parent-read-fields.ts is not touched by this change.
const PINNED:Record<string,string>={
  SANDBOX_ROOT:"sha256:8c030ea147886d0b16ddd6eb66c1d860c3e6305c585f1cad326e9e93f7e69740",
  SANDBOX_STEPS:"sha256:9f90f5c599081ab3f22304cc027938a0d73f749194145c1806e9ee3a3f33e301",
  SANDBOX_LINEAGE:"sha256:f341679939f98e613586a1c0e610e0fec0f8bd7eebf62f7e69e0e7bdf8a702ce",
  CANARY_ROOT:"sha256:b9a0399a128fa9a296d328c0377942a413a756e1e6ee0560968a65b0e8b0bea9",
  CANARY_PROPOSAL:"sha256:67b2868e20b2dfe3ed4c3481ed401d9048b98e585955e03c2ff424e788e9eb2d",
  CANARY_LINEAGE:"sha256:185c3ef88a128caf3be35aacfeda54c6d22d659db699b8b43e081dda11c35f7f",
  LIVE_ROOT:"sha256:d6d63a6bee153fb8b0da2ef27d6a35fcc14da491427609db637baec7d5e4ed6d",
};
