import {readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {describe,expect,it} from "vitest";
import {operationReaderSchema,f0BlockedReaderSchema,f0ReadRoute,f0CollectionRoute,f0CollectionSchema} from "../tooling/execution-operation-reader.mjs";
import {f0BlockedOperation,f0ReadQuery,f0CollectionQuery,f0Collection} from "../../../apps/control-api/src/operations/f0-read.contract";
import {operationalQueue,operationalQueueQuery,operationalWorkflow,operationalIncident} from "../../../apps/control-api/src/operations/operational-read.contract";
import {operationalCurrentSchemas} from "../tooling/execution-operational-current-reader.mjs";
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
// Existing documents/loader/harness; no alternate schema or duplicate runner.
ajv.addSchema(load("openapi/execution-canary.openapi.json"),base+"openapi/execution-canary.openapi.json");
const pointer="/paths/~1api~1v1~1execution~1operations~1{operation_id}/get/responses/200/content/application~1json/schema";
const validators=names.map(name=>ajv.compile({$ref:base+"openapi/"+name+".openapi.json#"+pointer}));
const trusted={...load("fixtures/execution-trusted-commands.synthetic.valid.json"),
  ack_only:load("fixtures/execution-command-currency.synthetic.valid.json").public_status};
const old=load("fixtures/execution-command-operation.valid.json");
describe("ELP2-04 one named operation reader across historical documents",()=>{
  it("preserves operationIds and all seven existing variants while adding two finite selected plans",()=>{
    expect(documents.map(api=>api.paths["/api/v1/execution/operations/{operation_id}"].get.operationId))
      .toEqual(["getExecutionCommandOperationF0","getPaperExitDecisionOperation"]);
    for(const api of documents){
      const get=api.paths["/api/v1/execution/operations/{operation_id}"].get;
      expect(get.responses["200"].content["application/json"].schema).toEqual(operationReaderSchema());
      expect(get.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
      for(const status of [400,401,403,404,409,503])expect(get.responses[status]).toBeDefined();
    }
    expect(operationReaderSchema().oneOf).toHaveLength(9);
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
  it("both existing generic documents serve each finite selected-plan fixture, not a parent ROOT or arbitrary private fields",()=>{
    const fixture=load("fixtures/execution-positive-parent.synthetic.valid.json");
    const keys=["r2_operation","r2_operation_uncaptured","r2_operation_applied","r2_operation_expired",
      "paper_exit_operation","paper_exit_operation_applied","paper_exit_operation_expired"];
    for(const check of validators){
      for(const key of keys){const body=fixture[key];expect(check(body),JSON.stringify(check.errors)).toBe(true);
        for(const patch of [{response_json:{}},{receipt:{}},{private_actor_id:"TEST_ONLY"},
          {family:"LIVE"},{status:"SUCCEEDED"},{schema_version:"portal.execution.governance-parent.v2"}])
          expect(check({...body,...patch})).toBe(false);
      }
      expect(check(fixture.r2)).toBe(false);expect(check(fixture.paper_exit)).toBe(false);
    }
    const refs=operationReaderSchema().oneOf.map(item=>item.$ref);
    for(const name of ["R2ParentOperationReadV2","PaperExitParentOperationReadV2"])
      expect(refs).toContain("../schemas/execution-operations.v1.schema.json#/$defs/"+name);
    for(const api of documents)for(const status of [400,401,403,404,409,503]){
      const response=api.paths["/api/v1/execution/operations/{operation_id}"].get.responses[status];
      expect(response.headers["Cache-Control"].schema.const).toBe("private, no-store");
      expect(response.content["application/json"].schema)
        .toEqual({$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"});
    }
  });
});

describe("ELP2-04 existing following-family GET response unions",()=>{
  const fixture=load("fixtures/execution-positive-parent.synthetic.valid.json");
  it.each([
    ["execution-governance","certification",["sandbox","sandbox_absent","sandbox_draft"],
      "fixtures/execution-sandbox-certification.unavailable.valid.json"],
    ["execution-canary","canary",["canary","canary_absent","canary_revision"],
      "fixtures/execution-canary-control-room.unavailable.valid.json"],
  ] as const)("%s preserves its real legacy reader and adds only its own finite root",(document,suffix,keys,legacyFixture)=>{
    const path="/api/v1/execution/deployments/{deployment_id}/"+suffix;
    const pointer="/paths/"+path.replaceAll("~","~0").replaceAll("/","~1")+
      "/get/responses/200/content/application~1json/schema";
    const check=ajv.compile({$ref:base+"openapi/"+document+".openapi.json#"+pointer});
    expect(check(load(legacyFixture)),JSON.stringify(check.errors)).toBe(true);
    for(const key of keys){
      const body=fixture[key];expect(check(body),JSON.stringify(check.errors)).toBe(true);
      for(const patch of [{account_binding:{}},{private_actor_id:"TEST_ONLY"},
        {source:{...body.source,source_verdict:"ACCEPTED"}},{raw_payload:{}},
        {schema_version:"portal.execution.governance-parent.v2"}])expect(check({...body,...patch})).toBe(false);
    }
    expect(check(suffix==="canary"?fixture.sandbox:fixture.canary)).toBe(false);
    for(const generic of validators)for(const key of keys)expect(generic(fixture[key])).toBe(false);
    expect(operationReaderSchema().oneOf).toHaveLength(9); // selected operations only; ROOTs are not operations
  });
});

describe("ELP2-04 finite current operational variants and canonical runtime parity",()=>{
  const fixture=load("fixtures/execution-operational-current.synthetic.valid.json");
  const definitions=operationalCurrentSchemas();
  const validate=(name:string)=>ajv.compile({$ref:base+"openapi/execution-operations.openapi.json#/components/schemas/"+name});
  const cases=[
    ["queue","OperationalQueueV2",operationalQueue],
    ["workflow","OperationalWorkflowV2",operationalWorkflow],
    ["incident","OperationalIncidentCurrentV2",operationalIncident],
  ] as const;
  it("publishes six finite additive component types without replacing legacy bodies",()=>{
    expect(Object.keys(definitions)).toHaveLength(6);
    for(const [name,schema] of Object.entries(definitions)){
      expect(load("schemas/execution-operations.v1.schema.json").$defs[name]).toEqual(schema);
      expect(documents[0].components.schemas[name]).toEqual({$ref:"../schemas/execution-operations.v1.schema.json#/$defs/"+name});
    }
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");expect(fixture.runtime_qualified).toBe(false);
    for(const get of [documents[0].paths["/api/v1/execution/operations"].get,
      documents[0].paths["/api/v1/execution/operations/incidents/{incident_id}"].get]){
      expect(get.responses["200"].content["application/json"].schema.oneOf).toHaveLength(2);
      for(const status of [200,400,401,403,404,409,503])expect(get.responses[status].headers["Cache-Control"].schema.const).toBe("private, no-store");
    }
  });
  it.each(cases)("%s accepts the labelled fixture and rejects unapproved additional fields",(key,name,runtime)=>{
    const check=validate(name),body=fixture[key];
    expect(check(body),JSON.stringify(check.errors)).toBe(true);expect(runtime.safeParse(body).success).toBe(true);
    expect(check({...body,private_actor_id:"TEST_ONLY"})).toBe(false);expect(runtime.safeParse({...body,private_actor_id:"TEST_ONLY"}).success).toBe(false);
  });
  it.each([
    ["source execution",{...fixture.queue,source_side_effect_requested:true}],
    ["global completeness",{...fixture.queue,coverage:"GLOBAL_COMPLETE"}],
    ["hidden counts",{...fixture.queue,page:{...fixture.queue.page,hidden_count:1}}],
    ["unbounded page",{...fixture.queue,page:{...fixture.queue.page,rows:Array(251).fill(fixture.queue.page.rows[0])}}],
    ["actor field",{...fixture.queue,page:{...fixture.queue.page,rows:[{...fixture.queue.page.rows[0],actor_user_id:"TEST_ONLY"}]}}],
    ["wrong purpose target",{...fixture.queue,page:{...fixture.queue.page,rows:[{...fixture.queue.page.rows[0],target:{type:"ORDER",id:"TEST_ONLY"}}]}}],
  ])("queue rejects %s in schema and runtime",(_label,body)=>{
    expect(validate("OperationalQueueV2")(body)).toBe(false);expect(operationalQueue.safeParse(body).success).toBe(false);
  });
  it("labels exact SQL versus the actual historical millisecond writer without arbitrary tolerance",()=>{
    for(const basis of ["SQL_EXACT_SOURCE_TIMESTAMP","LEGACY_DATE_MILLISECOND_COPY"]){
      const body={...fixture.workflow,provenance_basis:basis};
      expect(validate("OperationalWorkflowV2")(body)).toBe(true);expect(operationalWorkflow.safeParse(body).success).toBe(true);
      for(const check of validators)expect(check(body),JSON.stringify(check.errors)).toBe(true);
    }
    for(const body of [{...fixture.workflow,provenance_basis:"CLOSE_ENOUGH"},
      {...fixture.incident,historical_children:{availability:"AVAILABLE",count:0}},
      {...fixture.incident,workflow_version:Number.MAX_SAFE_INTEGER+1}]){
      const runtime="incident_id" in body?operationalIncident:operationalWorkflow;
      expect(runtime.safeParse(body).success).toBe(false);
      expect(validate("incident_id" in body?"OperationalIncidentCurrentV2":"OperationalWorkflowV2")(body)).toBe(false);
    }
  });
  it("keeps lifecycle/count/cursor cross-field runtime checks explicit",()=>{
    expect(definitions.OperationalQueueV2.description).toContain("total>=filtered");
    for(const page of [{...fixture.queue.page,total_count:0},{...fixture.queue.page,filtered_count:0},
      {...fixture.queue.page,has_more:true},{...fixture.queue.page,prev_cursor:"TEST_ONLY"}])
      expect(operationalQueue.safeParse({...fixture.queue,page}).success).toBe(false);
    expect(operationalWorkflow.safeParse({...fixture.workflow,intent:{...fixture.workflow.intent,operation_id:"TEST_ONLY:other"}}).success).toBe(false);
    expect(operationalIncident.safeParse({...fixture.incident,workflow_state:"RESOLVED"}).success).toBe(false);
  });
  it("publishes strict bounded two-direction query while refusing duplicates and guessed target kinds",()=>{
    const query={workspace_id:fixture.queue.workspace_id,target_type:"ACCOUNT",target_id:"TEST_ONLY:account",limit:"250"};
    expect(operationalQueueQuery.safeParse(query).success).toBe(true);
    for(const patch of [{limit:"251"},{limit:["1","2"]},{target_type:"ORDER"},{after:"a",before:"b"},{private_actor:"TEST_ONLY"}])
      expect(operationalQueueQuery.safeParse({...query,...patch}).success).toBe(false);
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

describe("ELP2-04 separate exact-own F0 collection contract",()=>{
  const fixture=load("fixtures/execution-f0-command-collection.synthetic.valid.json");
  const path=documents[0].paths[f0CollectionRoute];
  const validate=ajv.compile({$ref:base+"openapi/execution-operations.openapi.json#/components/schemas/F0CommandCollection"});
  it("publishes a separate family with exact strict query and canonical synthetic fixture",()=>{
    expect(path.get.operationId).toBe("executionF0BlockedOperationsListV2");
    expect(documents[1].paths[f0CollectionRoute]).toBeUndefined();
    expect(path.get["x-strict-query-keys"]).toEqual(["workspace_id","resource_kind","resource_id","environment","limit","after"]);
    expect(path.get.parameters.map((p:{name:string;required:boolean})=>[p.name,p.required])).toEqual([
      ["workspace_id",true],["resource_kind",true],["resource_id",true],["environment",true],["limit",false],["after",false]]);
    expect(load("schemas/execution-operations.v1.schema.json").$defs.F0CommandCollection).toEqual(f0CollectionSchema());
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");expect(fixture.runtime_qualified).toBe(false);
    expect(f0CollectionQuery.parse(fixture.query)).toEqual(fixture.query);
    expect(f0Collection.safeParse(fixture.response).success).toBe(true);
    expect(validate(fixture.response),JSON.stringify(validate.errors)).toBe(true);
    expect(operationReaderSchema().oneOf).toHaveLength(9);
  });
  it.each([200,400,401,403,404,409,503])("has a no-store typed response for %s",status=>{
    const response=path.get.responses[status];expect(response.headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(response.content["application/json"].schema).toEqual(status===200?{$ref:"#/components/schemas/F0CommandCollection"}:
      {$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"});
  });
  it.each([
    ["mixed family",{family:"TRUSTED_CAPITAL_COMMANDS_ONLY"}],
    ["full coverage",{coverage:"GLOBAL_COMPLETE"}],
    ["global total",{total:500}],
    ["unsupported root",{resource:{kind:"ROOT",id:"TEST_ONLY:root"}}],
    ["source environment",{environment:"PAPER"}],
    ["extra page fields",{page:{...fixture.response.page,hidden_count:100}}],
    ["private item",{items:[{...old,payload_hash:"TEST_ONLY"}]}],
    ["too many items",{items:Array(101).fill(old)}],
  ])("rejects %s in both served schema and runtime",(_name,patch)=>{
    const value={...fixture.response,...patch};expect(validate(value)).toBe(false);expect(f0Collection.safeParse(value).success).toBe(false);
  });
  it("keeps cross-field page invariants explicit rather than pretending generated types enforce them",()=>{
    expect(f0CollectionSchema().description).toContain("returned_count===items.length");
    for(const page of [{...fixture.response.page,returned_count:0},{...fixture.response.page,has_more:true},
      {...fixture.response.page,next_cursor:"TEST_ONLY"}])
      expect(f0Collection.safeParse({...fixture.response,page}).success).toBe(false);
    expect(f0Collection.safeParse({...fixture.response,items:[old,old],page:{...fixture.response.page,returned_count:2}}).success).toBe(false);
    expect(f0Collection.safeParse({...fixture.response,items:[],page:{...fixture.response.page,returned_count:0}}).success).toBe(true);
  });
  it("refuses extra/duplicate/nonexact query fields and preserves the existing detail query",()=>{
    for(const value of [{...fixture.query,from_source:true},{...fixture.query,limit:["1","1"]},
      {...fixture.query,resource_kind:"ORDER"},{...fixture.query,environment:"all"},{...fixture.query,limit:101}])
      expect(f0CollectionQuery.safeParse(value).success).toBe(false);
    expect(f0ReadQuery.safeParse({workspace_id:fixture.query.workspace_id}).success).toBe(true);
    expect(f0ReadQuery.safeParse(fixture.query).success).toBe(false);
  });
});
