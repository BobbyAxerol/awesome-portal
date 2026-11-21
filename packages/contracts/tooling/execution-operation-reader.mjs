/** Existing generic operation union with finite current-authorized variants.
 * Contract publication never commissions relay, source authority or a parent. */
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {operationalCurrentSchemas,updateOperationalPaths,synchronizeOperationalFixture} from "./execution-operational-current-reader.mjs";
import {parentCurrentSchemas,updateParentPaths,updateFollowingParentPaths,updateLiveParentPath,synchronizeParentFixture,
  liveSourceCurrentSchemas,updateLiveSourcePath,synchronizeLiveSourceFixture} from "./execution-positive-parent-reader.mjs";
import {activationCurrentSchemas,updateActivationPaths,activationCurrentFixture,activationFixtureName} from "./execution-activation-current-reader.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const route="/api/v1/execution/operations/{operation_id}";
export const f0ReadRoute="/api/v1/execution/operations/f0/{operation_id}";
export const f0CollectionRoute="/api/v1/execution/operations/f0";

export function f0CollectionSchema(){
  return {type:"object",additionalProperties:false,
    description:"Finite current-actor F0 intent history for one exact resource/environment. At most1024 matching own intents are censused;1025 refuses explicitly. Pages sort created_at descending then operation_id ASCII ascending. Runtime additionally enforces returned_count===items.length, items.length<=limit, unique ids and has_more iff next_cursor is nonnull. No global count, source status, relay or dispatch. Portal timestamps are not source freshness.",
    required:["schema_version","family","coverage","resource","environment","items","page"],properties:{
      schema_version:{const:"portal.execution.f0-command-collection.v1"},family:{const:"F0_BLOCKED_INTENTS_ONLY"},
      coverage:{const:"CURRENT_ACTOR_EXACT_RESOURCE_ONLY"},
      resource:{type:"object",additionalProperties:false,required:["kind","id"],properties:{
        kind:{type:"string",enum:["ACCOUNT","PORTFOLIO","DEPLOYMENT"]},id:{type:"string",pattern:"^[A-Za-z0-9._:-]{1,191}$"}}},
      environment:{type:"string",enum:["paper","sandbox","live"]},
      items:{type:"array",maxItems:100,items:{$ref:"#/$defs/F0BlockedOperationRead"}},
      page:{type:"object",additionalProperties:false,required:["limit","returned_count","has_more","next_cursor"],properties:{
        limit:{type:"integer",minimum:1,maximum:100},returned_count:{type:"integer",minimum:0,maximum:100},
        has_more:{type:"boolean"},next_cursor:{type:["string","null"],minLength:1,maxLength:4096}}},
    }};
}

function f0CollectionPath(){
  const headers={"Cache-Control":{schema:{const:"private, no-store"}}};
  const responses={"200":{description:"Exact current audit authority and creator ceiling; complete bounded F0-only cohort.",headers,
    content:{"application/json":{schema:{$ref:"#/components/schemas/F0CommandCollection"}}}}};
  for(const status of [400,401,403,404,409,503])responses[status]={headers,
    content:{"application/json":{schema:{$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"}}},
    description:status===400?"COMMAND_INPUT_INVALID or COMMAND_COLLECTION_CURSOR_INVALID; strict scalar query or invalid/expired cursor.":
      status===401?"Current authenticated Portal session required.":
      status===403?"CURRENT_ACTOR_AUTHORITY_REQUIRED; no page or cursor disclosed after current session expiry.":
      status===404?"COMMAND_RESOURCE_NOT_FOUND; unauthorized and unknown scopes have one safe envelope.":
      status===409?"ACCESS_RETRY_REQUIRED or COMMAND_COLLECTION_CURSOR_CHANGED; refresh instead of falling back.":
      "Fixed COMMAND_COLLECTION_OVERFLOW/RESPONSE_BOUND/NOT_CONFIGURED, COMMAND_STATUS_UNVERIFIED or COMMAND_UNAVAILABLE. No false empty, silent truncation or raw provider text."};
  return {get:{operationId:"executionF0BlockedOperationsListV2",
    description:"Explicit F0 blocked intents ONLY, not the mixed operation queue. Current exact TS-accepted audit.read is required BEFORE the five-predicate SQL census and again after the last await for success and contextual errors. Full DENY and delegation graph remains effective. Creator is an additional disclosure ceiling, not permission; no ADMIN/read_all bypass, source call, mutation or historical planning-expiry filter. Cursor binds actor/session, exact query/current authority and visible own intents; hidden other-creator/target/environment rows never influence it. Keyset tokens are signed, not encrypted; no private actor/session bytes are embedded in their boundary.",
    "x-strict-query-keys":["workspace_id","resource_kind","resource_id","environment","limit","after"],
    parameters:[
      {name:"workspace_id",in:"query",required:true,schema:{type:"string",minLength:3,maxLength:96}},
      {name:"resource_kind",in:"query",required:true,schema:{type:"string",enum:["ACCOUNT","PORTFOLIO","DEPLOYMENT"]}},
      {name:"resource_id",in:"query",required:true,schema:{type:"string",pattern:"^[A-Za-z0-9._:-]{1,191}$"}},
      {name:"environment",in:"query",required:true,schema:{type:"string",enum:["paper","sandbox","live"]}},
      {name:"limit",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:100,default:25}},
      {name:"after",in:"query",required:false,schema:{type:"string",minLength:1,maxLength:4096}},
    ],responses}};
}

function f0CollectionFixture(){
  const item=JSON.parse(readFileSync(resolve(root,"fixtures/execution-command-operation.valid.json"),"utf8"));
  const query={workspace_id:"ws_TEST_ONLY_f0",resource_kind:"ACCOUNT",resource_id:"acc_TEST_ONLY_f0",environment:"paper",limit:25};
  return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,query,
    response:{schema_version:"portal.execution.f0-command-collection.v1",family:"F0_BLOCKED_INTENTS_ONLY",
      coverage:"CURRENT_ACTOR_EXACT_RESOURCE_ONLY",resource:{kind:query.resource_kind,id:query.resource_id},
      environment:query.environment,items:[item],page:{limit:25,returned_count:1,has_more:false,next_cursor:null}}};
}

// Update only a finite member, preserving unrelated historical formatting.
// Scan JSON strings/escapes rather than matching nested braces. Absent members
// are inserted into the one named object; duplicates are never overwritten.
function member(before,key,value,container,indent){
  const literal=JSON.stringify(key)+":",at=before.indexOf(literal);
  const serialized=JSON.stringify(value,null,2).replaceAll("\n","\n"+" ".repeat(indent));
  if(at<0){
    const anchor=JSON.stringify(container)+": {\n",start=before.indexOf(anchor);
    if(start<0||before.indexOf(anchor,start+anchor.length)>=0)throw new Error("Missing unique object: "+container);
    const point=start+anchor.length;
    return before.slice(0,point)+" ".repeat(indent)+literal+" "+serialized+",\n"+before.slice(point);
  }
  if(before.indexOf(literal,at+literal.length)>=0)throw new Error("Duplicate member: "+key);
  const start=before.indexOf("{",at+literal.length);let depth=0,quoted=false,escaped=false;
  for(let index=start;index<before.length;index++){
    const char=before[index];
    if(quoted){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char==='"')quoted=false;continue;}
    if(char==='"'){quoted=true;continue;}
    if(char==="{")depth++;else if(char==="}"&&--depth===0)
      return before.slice(0,start)+serialized+before.slice(index+1);
  }
  throw new Error("JSON boundary missing: "+key);
}

export const operationReaderSchema=()=>({oneOf:[
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/ExecutionCommandOperation"},
  ...["R1","R2","Live"].map(prefix=>({$ref:"../schemas/execution-governance-portal-decisions.v1.schema.json#/$defs/"+prefix+"DecisionOperation"})),
  {$ref:"../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitDecisionOperation"},
  {$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandStatus"},
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/OperationalWorkflowV2"},
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/R2ParentOperationReadV2"},
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/PaperExitParentOperationReadV2"},
]});

/** The published catalogue is generated from the same reviewed 64-key source
 * as catalog.generated.ts. It is an allowlist, never runtime source authority.
 * Old stored blockers are validated, not recomputed from this catalogue. */
export function f0BlockedReaderSchema(){
  const catalogue=JSON.parse(readFileSync(resolve(root,"fixtures/execution-command-catalog.valid.json"),"utf8"));
  const codes=[...new Set([...catalogue.entries.map(entry=>entry.blocked_reason),
    "COMMAND_RELAY_DISABLED","OWNER_REVIEW_REQUIRED","N16B_TARGET_SCOPE_UNSUPPORTED",
    "N16B_CURRENT_PRIMITIVE_PLAN_INVALID","N16B_RUNTIME_ACTIVATION_PENDING"])].sort();
  return {
    title:"Finite current-authorized F0 blocked intent",
    description:"Same twelve-field execution.command-operation.v1 body, no source status or dispatch. Stored target is requested intent, not TS attestation. created_at and updated_at are Portal timestamps, not source freshness. Runtime additionally enforces nonnegative finite epochs and updated_at >= created_at.",
    allOf:[{$ref:"#/$defs/ExecutionCommandOperation"},{type:"object",properties:{
      command_key:{type:"string",enum:catalogue.entries.map(entry=>entry.key).sort()},
      blockers:{type:"array",minItems:1,maxItems:3,uniqueItems:true,items:{type:"string",enum:codes},
        contains:{const:"COMMAND_RELAY_DISABLED"}},
      warnings:{type:"array",maxItems:0},
    }}],
  };
}

function f0Path(){
  const headers={"Cache-Control":{schema:{const:"private, no-store"}}};
  const responses={"200":{description:"Current exact audit authority; finite retained BLOCKED intent only.",headers,
    content:{"application/json":{schema:{$ref:"#/components/schemas/F0BlockedOperationRead"}}}}};
  for(const status of [400,401,403,404,409,503])responses[status]={headers,
    content:{"application/json":{schema:{$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"}}},description:
    status===400?"COMMAND_INPUT_INVALID: explicit workspace and one compatible opaque operation id required; no extra or duplicate query keys.":
    status===401?"Authenticated current Portal session required.":
    status===403?"Current actor/session lifecycle refused; no record disclosed.":
    status===404?"COMMAND_RESOURCE_NOT_FOUND: unknown, other creator/workspace/family, unsupported target and hidden intents have the same safe envelope.":
    status===409?"ACCESS_RETRY_REQUIRED: current authority changed during read; no legacy or family fallback.":
    "Fixed COMMAND_STATUS_UNVERIFIED or COMMAND_UNAVAILABLE; no raw stored/provider/validation text."};
  return {get:{operationId:"executionF0BlockedOperationGetV2",
    description:"Explicit F0 family only; creator is an extra lookup ceiling, not permission. Requires current TS-accepted audit.read for the exact original ACCOUNT/PORTFOLIO/DEPLOYMENT target and paper/sandbox/live environment. No owner/ADMIN/read_all override, target-kind alias, generic-family fallback, source call or mutation. Original planning expiry does not expire historical read. Private no-store with final current Core/receipt fence.",
    "x-strict-query-keys":["workspace_id"],
    parameters:[{name:"operation_id",in:"path",required:true,schema:{type:"string",pattern:"^[A-Za-z0-9._:-]{1,191}$"}},
      {name:"workspace_id",in:"query",required:true,schema:{type:"string",minLength:3,maxLength:96}}],responses}};
}

export function synchronizeOperationReaders(check=false) {
  const schemaPath=resolve(root,"schemas/execution-operations.v1.schema.json"),schemaBefore=readFileSync(schemaPath,"utf8");
  let schemaAfter=member(schemaBefore,"F0BlockedOperationRead",f0BlockedReaderSchema(),"$defs",4);
  schemaAfter=member(schemaAfter,"F0CommandCollection",f0CollectionSchema(),"$defs",4);
  for(const [name,value] of Object.entries(operationalCurrentSchemas()))schemaAfter=member(schemaAfter,name,value,"$defs",4);
  for(const [name,value] of Object.entries(parentCurrentSchemas()))schemaAfter=member(schemaAfter,name,value,"$defs",4);
  for(const [name,value] of Object.entries(liveSourceCurrentSchemas()))schemaAfter=member(schemaAfter,name,value,"$defs",4);
  for(const [name,value] of Object.entries(activationCurrentSchemas()))schemaAfter=member(schemaAfter,name,value,"$defs",4);
  if(check){if(schemaBefore!==schemaAfter)throw new Error("Finite F0 reader schema drift");}
  else writeFileSync(schemaPath,schemaAfter);
  for(const name of ["execution-operations","execution-governance"]) {
    const path=resolve(root,"openapi/"+name+".openapi.json"),before=readFileSync(path,"utf8"),api=JSON.parse(before);
    const get=api.paths[route].get;
    get.description="Named operation detail. Exact ecm_ intents retain current exact audit authority and finite CommandStatus. SCOPED_V2 uses positive stored family identity: F0 keeps immutable queue/intent provenance and exact target audit; selected R2/Paper plans require BOTH current PAPER deployment/portfolio audit anchors, ROOT plus exact DECISION_OPERATION field purpose and the actual gate/member requirement. Unknown, unsupported or ambiguous identity never tries another family. No creator/ADMIN/read_all permission substitute. Legacy decision readers remain separate. Historical expiry/expected versions do not expire today's authorized read or assert current apply eligibility. GET never dispatches/reconciles; stored Portal APPLIED is not TS acceptance/FILLED. HTTP private, no-store.";
    get.responses["200"]={description:"Authorized concrete operation; finite workflow and selected R2/Paper plan variants are additive, not source receipts.",
      headers:{"Cache-Control":{schema:{const:"private, no-store"}}},
      content:{"application/json":{schema:operationReaderSchema()}}};
    for(const status of [400,401,403,404,409,503]){
      const existing=get.responses[status]??{};
      get.responses[status]={...existing,description:existing.description??(status===404?
        "Unknown and hidden commands have the same safe envelope.":"Typed current-authority refusal; no upstream or legacy fallback."),
        headers:{...existing.headers,"Cache-Control":{schema:{const:"private, no-store"}}},
        content:{...existing.content,"application/json":{schema:{$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"}}}};
    }
    let after=member(before,route,api.paths[route],"paths",4);
    if(name==="execution-operations"){
      const updated=JSON.parse(after);updateOperationalPaths(updated);
      for(const p of ["/api/v1/execution/operations","/api/v1/execution/operations/incidents/{incident_id}"])
        after=member(after,p,updated.paths[p],"paths",4);
      after=member(after,f0ReadRoute,f0Path(),"paths",4);
      after=member(after,f0CollectionRoute,f0CollectionPath(),"paths",4);
      const components=JSON.parse(after).components;
      components.schemas??={};
      components.schemas.F0BlockedOperationRead={$ref:"../schemas/execution-operations.v1.schema.json#/$defs/F0BlockedOperationRead"};
      components.schemas.F0CommandCollection={$ref:"../schemas/execution-operations.v1.schema.json#/$defs/F0CommandCollection"};
      for(const key of Object.keys(operationalCurrentSchemas()))components.schemas[key]={$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+key};
      after=member(after,"components",components,null,2);
    }
    if(name==="execution-governance"){
      const updated=JSON.parse(after);
      for(const path of updateParentPaths(updated))after=member(after,path,updated.paths[path],"paths",4);
      for(const path of updateFollowingParentPaths(updated,name))after=member(after,path,updated.paths[path],"paths",4);
      after=member(after,"components",updated.components,null,2);
    }
    if(check){if(before!==after)throw new Error("Operation reader contract drift: "+name);}
    else writeFileSync(path,after);
  }
  // Canary has no generic operation GET. Touch only its existing finite
  // parent GET and component, using the SAME finite-member writer.
  const canaryPath=resolve(root,"openapi/execution-canary.openapi.json");
  const canaryBefore=readFileSync(canaryPath,"utf8"),canary=JSON.parse(canaryBefore);
  let canaryAfter=canaryBefore;
  for(const path of updateFollowingParentPaths(canary,"execution-canary"))
    canaryAfter=member(canaryAfter,path,canary.paths[path],"paths",4);
  canaryAfter=member(canaryAfter,"components",canary.components,null,2);
  if(check){if(canaryBefore!==canaryAfter)throw new Error("Following parent contract drift: execution-canary");}
  else writeFileSync(canaryPath,canaryAfter);
  // Stored approval metadata and the source-only deployment screen retain
  // distinct routes and independently proven authority.
  const profileReadPath=resolve(root,"openapi/execution-profile-read.openapi.json");
  const profileBefore=readFileSync(profileReadPath,"utf8"),profileRead=JSON.parse(profileBefore);
  const parentRoute=updateLiveParentPath(profileRead);
  let profileAfter=member(profileBefore,parentRoute,profileRead.paths[parentRoute],"paths",4);
  if(check){if(profileBefore!==profileAfter)throw new Error("Finite Live parent contract drift");}
  else writeFileSync(profileReadPath,profileAfter);
  // Existing Live deployment GET, not the separate stored approval route.
  // Same finite member writer; all unrelated historical bytes remain intact.
  const livePath=resolve(root,"openapi/execution-live-full.openapi.json");
  const liveBefore=readFileSync(livePath,"utf8"),live=JSON.parse(liveBefore);
  const liveRoute=updateLiveSourcePath(live);
  let liveAfter=member(liveBefore,liveRoute,live.paths[liveRoute],"paths",4);
  liveAfter=member(liveAfter,"components",live.components,null,2);
  if(check){if(liveBefore!==liveAfter)throw new Error("Finite Live source contract drift");}
  else writeFileSync(livePath,liveAfter);
  const fixture=resolve(root,"fixtures/execution-f0-command-collection.synthetic.valid.json");
  const bytes=JSON.stringify(f0CollectionFixture(),null,2)+"\n";
  if(check){if(readFileSync(fixture,"utf8")!==bytes)throw new Error("F0 collection fixture drift");}
  else writeFileSync(fixture,bytes);
  const activationPath=resolve(root,"openapi/execution-staged-activation.openapi.json"),activationBefore=readFileSync(activationPath,"utf8"),activation=JSON.parse(activationBefore);
  let activationAfter=activationBefore;
  for(const path of updateActivationPaths(activation))activationAfter=member(activationAfter,path,activation.paths[path],"paths",4);
  activationAfter=member(activationAfter,"components",activation.components,null,2);
  const activationFixturePath=resolve(root,"fixtures/"+activationFixtureName),activationFixtureBytes=JSON.stringify(activationCurrentFixture(),null,2)+"\n";
  if(check){if(activationBefore!==activationAfter||readFileSync(activationFixturePath,"utf8")!==activationFixtureBytes)throw Error("Activation reader contract drift");}
  else{writeFileSync(activationPath,activationAfter);writeFileSync(activationFixturePath,activationFixtureBytes);}
  synchronizeOperationalFixture(check);
  synchronizeParentFixture(check);
  synchronizeLiveSourceFixture(check);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  synchronizeOperationReaders(process.argv.includes("--check"));
