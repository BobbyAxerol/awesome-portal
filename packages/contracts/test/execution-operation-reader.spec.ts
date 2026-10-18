import {readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {describe,expect,it} from "vitest";
import {operationReaderSchema,f0BlockedReaderSchema,f0ReadRoute} from "../tooling/execution-operation-reader.mjs";
import {f0BlockedOperation,f0ReadQuery} from "../../../apps/control-api/src/operations/f0-read.contract";
const root=resolve(__dirname,".."),load=(name:string)=>JSON.parse(readFileSync(resolve(root,name),"utf8"));
const names=["execution-operations","execution-governance"];
const base="https://schemas.primusspark.com/portal/";
const ajv=new Ajv2020({strict:false,allErrors:true});addFormats(ajv);
for(const name of readdirSync(resolve(root,"schemas"))){
  const schema=load("schemas/"+name);ajv.addSchema(schema);
  ajv.addSchema({...schema,$id:base+"schemas/"+name});
}
ajv.addSchema(load("openapi/execution-trusted-commands.openapi.json"),base+"openapi/execution-trusted-commands.openapi.json");
const documents=names.map(name=>load("openapi/"+name+".openapi.json"));
documents.forEach((api,index)=>ajv.addSchema(api,base+"openapi/"+names[index]+".openapi.json"));
const pointer="/paths/~1api~1v1~1execution~1operations~1{operation_id}/get/responses/200/content/application~1json/schema";
const validators=names.map(name=>ajv.compile({$ref:base+"openapi/"+name+".openapi.json#"+pointer}));
const trusted=load("fixtures/execution-trusted-commands.synthetic.valid.json");
const old=load("fixtures/execution-command-operation.valid.json");
describe("ELP2-04 one named operation reader across historical documents",()=>{
  it("preserves operationIds and one canonical union of six existing concrete schemas",()=>{
    expect(documents.map(api=>api.paths["/api/v1/execution/operations/{operation_id}"].get.operationId))
      .toEqual(["getExecutionCommandOperationF0","getPaperExitDecisionOperation"]);
    for(const api of documents){
      const get=api.paths["/api/v1/execution/operations/{operation_id}"].get;
      expect(get.responses["200"].content["application/json"].schema).toEqual(operationReaderSchema());
      expect(get.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
      for(const status of [400,401,403,404,409,503])expect(get.responses[status]).toBeDefined();
    }
    expect(operationReaderSchema().oneOf).toHaveLength(6);
  });
  it.each(names.map((name,index)=>[name,index] as const))("%s retains F0 and accepts strict trusted status without inferring APPLIED",(name,index)=>{
    const validate=validators[index];
    expect(validate(old),JSON.stringify(validate.errors)).toBe(true);
    expect(trusted.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(trusted.ack_only),JSON.stringify(validate.errors)).toBe(true);
    expect(trusted.ack_only.business.state).toBe("UNKNOWN");
    expect(validate({...trusted.ack_only,jwt:"private"})).toBe(false);
    expect(validate({...old,source_side_effect_requested:true})).toBe(false);
  });
  it("keeps all existing distinct Portal decision refs; no alias to R1 or broad arbitrary payload",()=>{
    const refs=operationReaderSchema().oneOf.map(item=>item.$ref);
    for(const name of ["R1","R2","Live"])expect(refs).toContain(
      "../schemas/execution-governance-portal-decisions.v1.schema.json#/$defs/"+name+"DecisionOperation");
    expect(refs).toContain("../schemas/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitDecisionOperation");
    for(const validate of validators)expect(validate({schema_version:"arbitrary",payload:{}})).toBe(false);
  });
});

describe("ELP2-04 explicit current-authorized F0 blocked-intent contract",()=>{
  const path=documents[0].paths[f0ReadRoute];
  const validate=ajv.compile({$ref:base+"openapi/execution-operations.openapi.json#/components/schemas/F0BlockedOperationRead"});
  it("adds exactly one named family without replacing either generic operation",()=>{
    expect(path.get.operationId).toBe("executionF0BlockedOperationGetV2");
    expect(documents[1].paths[f0ReadRoute]).toBeUndefined();
    expect(path.get.parameters.map((item:{name:string;required:boolean})=>[item.name,item.required]))
      .toEqual([["operation_id",true],["workspace_id",true]]);
    expect(path.get["x-strict-query-keys"]).toEqual(["workspace_id"]);
    for(const status of [200,400,401,403,404,409,503])
      expect(path.get.responses[status].headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(load("schemas/execution-operations.v1.schema.json").$defs.F0BlockedOperationRead)
      .toEqual(f0BlockedReaderSchema());
  });
  it.each([400,401,403,404,409,503])("publishes the canonical typed problem for refusal %s",status=>{
    const schema=path.get.responses[status].content["application/json"].schema;
    expect(schema).toEqual({$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"});
    const problem=ajv.compile({$ref:base+"openapi/execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"});
    expect(problem({error:{code:"COMMAND_RESOURCE_NOT_FOUND",message:"Resource is not available."},request_id:"TEST_ONLY"})).toBe(true);
    expect(problem({error:{code:"COMMAND_STATUS_UNVERIFIED",message:"Status is not available."},request_id:"TEST_ONLY",
      public_copy_key:"COMMAND_STATUS_UNVERIFIED",safe_next_action:"REVIEW_BLOCKER"})).toBe(true);
    expect(problem({error:{code:"COMMAND_STATUS_UNVERIFIED",message:"Status is not available.",private_stack:"TEST_ONLY"},request_id:"TEST_ONLY"})).toBe(false);
  });
  it("uses the existing twelve-field synthetic BLOCKED body, never an engine receipt",()=>{
    expect(validate(old),JSON.stringify(validate.errors)).toBe(true);
    expect(f0BlockedOperation.safeParse(old).success).toBe(true);
    expect(Object.keys(old)).toHaveLength(12);
    expect(old.status).toBe("BLOCKED");
    expect(old.relay_receipt).toBeNull();
    expect(old.source_side_effect_requested).toBe(false);
    // Existing compatible non-ULID identifiers are not silently retired.
    for(const id of ["historical.TEST_ONLY:receipt-1","op_01K3COMMANDPLAN000000000000"]){
      expect(validate({...old,operation_id:id})).toBe(true);
      expect(f0BlockedOperation.safeParse({...old,operation_id:id}).success).toBe(true);
    }
  });
  const invalid=[
    ["unknown command",{command_key:"test-only/unpublished"}],
    ["arbitrary blocker",{blockers:["COMMAND_RELAY_DISABLED","TEST_ONLY_PRIVATE_TEXT"]}],
    ["missing relay-disabled fact",{blockers:["OWNER_REVIEW_REQUIRED"]}],
    ["duplicate blocker",{blockers:["COMMAND_RELAY_DISABLED","COMMAND_RELAY_DISABLED"]}],
    ["four blockers",{blockers:["COMMAND_RELAY_DISABLED","OWNER_REVIEW_REQUIRED","N16B_RUNTIME_ACTIVATION_PENDING","N16B_CURRENT_PRIMITIVE_PLAN_INVALID"]}],
    ["warning prose",{warnings:["TEST_ONLY_PRIVATE_TEXT"]}],
    ["source dispatch",{source_side_effect_requested:true}],
    ["source receipt",{relay_receipt:{ack:"TEST_ONLY"}}],
    ["nonblocked",{status:"APPLIED"}],
    ["invented verification",{verification_result:"PASSED"}],
    ["private field",{payload_hash:"sha256:"+"0".repeat(64)}],
    ["bad date",{updated_at:"TEST_ONLY_not_a_date"}],
  ] as const;
  it.each(invalid)("rejects %s identically in served schema and runtime",(_name,extra)=>{
    const value={...old,...extra};
    expect(validate(value)).toBe(false);
    expect(f0BlockedOperation.safeParse(value).success).toBe(false);
  });
  it("publishes exact finite catalogue/code allowlists and empty warnings",()=>{
    const catalogue=load("fixtures/execution-command-catalog.valid.json");
    const constraint=f0BlockedReaderSchema().allOf[1] as {properties:{command_key:{enum:string[]};blockers:{items:{enum:string[]}}}};
    expect(constraint.properties.command_key.enum).toEqual(catalogue.entries.map((entry:{key:string})=>entry.key).sort());
    for(const code of constraint.properties.blockers.items.enum){
      const value={...old,blockers:[...new Set(["COMMAND_RELAY_DISABLED",code])]};
      expect(validate(value),code).toBe(true);
      expect(f0BlockedOperation.safeParse(value).success,code).toBe(true);
    }
  });
  it("requires exact workspace and rejects extra, empty and duplicate query values",()=>{
    expect(f0ReadQuery.safeParse({workspace_id:"ws_TEST_ONLY"}).success).toBe(true);
    for(const value of [{},{workspace_id:""},{workspace_id:["ws_TEST_ONLY","ws_OTHER"]},
      {workspace_id:"ws_TEST_ONLY",environment:"PAPER"},{workspace_id:"ws_TEST_ONLY",from_source:true}])
      expect(f0ReadQuery.safeParse(value).success).toBe(false);
  });
  it("runtime additionally rejects reversed finite Portal timestamps as documented",()=>{
    expect(f0BlockedOperation.safeParse({...old,updated_at:"2026-08-21T12:00:00Z"}).success).toBe(false);
    expect(f0BlockedReaderSchema().description).toContain("updated_at >= created_at");
  });
});
