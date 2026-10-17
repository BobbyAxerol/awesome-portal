/** The two historical documents describe one HTTP route. Keep its union
 * canonical without duplicating command/status or Portal-decision schemas. */
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const route="/api/v1/execution/operations/{operation_id}";
// Update only the finite route object; preserve unrelated historical formatting
// and semantics. Scan JSON strings/escapes rather than matching nested braces.
function replaceRoute(before,value){
  const key=JSON.stringify(route),at=before.indexOf(key+":");
  if(at<0||before.indexOf(key+":",at+key.length)>=0)throw new Error("Operation route must be unique");
  const start=before.indexOf("{",at+key.length);let depth=0,quoted=false,escaped=false;
  for(let index=start;index<before.length;index++){
    const char=before[index];
    if(quoted){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char==='"')quoted=false;continue;}
    if(char==='"'){quoted=true;continue;}
    if(char==="{")depth++;else if(char==="}"&&--depth===0)
      return before.slice(0,start)+JSON.stringify(value,null,2).replaceAll("\n","\n    ")+before.slice(index+1);
  }
  throw new Error("Operation route JSON boundary missing");
}
export const operationReaderSchema=()=>({oneOf:[
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/ExecutionCommandOperation"},
  ...["R1","R2","Live"].map(prefix=>({$ref:"../schemas/execution-governance-portal-decisions.v1.schema.json#/$defs/"+prefix+"DecisionOperation"})),
  {$ref:"../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitDecisionOperation"},
  {$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandStatus"},
]});
export function synchronizeOperationReaders(check=false) {
  for(const name of ["execution-operations","execution-governance"]) {
    const path=resolve(root,"openapi/"+name+".openapi.json"),before=readFileSync(path,"utf8"),api=JSON.parse(before);
    const get=api.paths[route].get;
    get.description="Named operation detail. Exact ecm_ intents use current workspace/resource/environment audit authority and finite CommandStatus; GET never dispatches or reconciles. Existing Portal/F0 decision readers retain their gate checks and scoped-parent refusal. An ACK is not business APPLIED or venue FILLED. HTTP private, no-store.";
    get.responses["200"]={description:"Authorized named operation detail; no generic parent or queue commissioning.",
      headers:{"Cache-Control":{schema:{const:"private, no-store"}}},
      content:{"application/json":{schema:operationReaderSchema()}}};
    for(const status of [400,401,403,404,409,503]) get.responses[status]??={description:
      status===404?"Unknown and hidden commands have the same safe envelope.":"Typed current-authority refusal; no upstream or legacy fallback."};
    const after=replaceRoute(before,api.paths[route]);
    if(check){if(before!==after)throw new Error("Operation reader contract drift: "+name);}
    else writeFileSync(path,after);
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  synchronizeOperationReaders(process.argv.includes("--check"));
