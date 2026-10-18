/** Historical generic operation union plus one explicitly scoped F0 reader.
 * Neither this contract nor the additive route commissions relay or parents. */
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const route="/api/v1/execution/operations/{operation_id}";
export const f0ReadRoute="/api/v1/execution/operations/f0/{operation_id}";

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
  const schemaAfter=member(schemaBefore,"F0BlockedOperationRead",f0BlockedReaderSchema(),"$defs",4);
  if(check){if(schemaBefore!==schemaAfter)throw new Error("Finite F0 reader schema drift");}
  else writeFileSync(schemaPath,schemaAfter);
  for(const name of ["execution-operations","execution-governance"]) {
    const path=resolve(root,"openapi/"+name+".openapi.json"),before=readFileSync(path,"utf8"),api=JSON.parse(before);
    const get=api.paths[route].get;
    get.description="Named operation detail. Exact ecm_ intents use current workspace/resource/environment audit authority and finite CommandStatus; GET never dispatches or reconciles. Existing Portal/F0 decision readers retain their gate checks and scoped-parent refusal. An ACK is not business APPLIED or venue FILLED. HTTP private, no-store.";
    get.responses["200"]={description:"Authorized named operation detail; no generic parent or queue commissioning.",
      headers:{"Cache-Control":{schema:{const:"private, no-store"}}},
      content:{"application/json":{schema:operationReaderSchema()}}};
    for(const status of [400,401,403,404,409,503]) get.responses[status]??={description:
      status===404?"Unknown and hidden commands have the same safe envelope.":"Typed current-authority refusal; no upstream or legacy fallback."};
    let after=member(before,route,api.paths[route],"paths",4);
    if(name==="execution-operations"){
      after=member(after,f0ReadRoute,f0Path(),"paths",4);
      const components=JSON.parse(after).components;
      components.schemas??={};
      components.schemas.F0BlockedOperationRead={$ref:"../schemas/execution-operations.v1.schema.json#/$defs/F0BlockedOperationRead"};
      after=member(after,"components",components,null,2);
    }
    if(check){if(before!==after)throw new Error("Operation reader contract drift: "+name);}
    else writeFileSync(path,after);
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  synchronizeOperationReaders(process.argv.includes("--check"));
