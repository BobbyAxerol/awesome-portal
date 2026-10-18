import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,expect,it} from "vitest";
import {commandIntent,commandPreview,publicCommandStatus as commandStatus,commandStatus as storedCommandStatus} from "../../../apps/control-api/src/execution-v2/command.contract";
import {commandCollection,commandCollectionQuery} from "../../../apps/control-api/src/execution-v2/command-collection.contract";
const root=resolve(__dirname,".."),load=(p:string)=>JSON.parse(readFileSync(resolve(root,p),"utf8"));
const currencyFixture=load("fixtures/execution-command-currency.synthetic.valid.json");
const api=load("openapi/execution-trusted-commands.openapi.json"),fixture={...load("fixtures/execution-trusted-commands.synthetic.valid.json"),ack_only:currencyFixture.public_status};
const collectionFixture=load("fixtures/execution-trusted-command-collection.synthetic.valid.json");
const ajv=new Ajv2020({strict:false});
const compile=(name:string)=>ajv.compile(JSON.parse(JSON.stringify({$ref:"#/components/schemas/"+name,components:{schemas:api.components.schemas}})));
describe("ELP2-07 generated command contract",()=>{
  it("publishes verified intent currency while retaining exact historical storage grammar",()=>{
    expect(currencyFixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(currencyFixture.runtime_qualified).toBe(false);
    expect(storedCommandStatus.safeParse(currencyFixture.stored_status).success).toBe(true);
    expect(storedCommandStatus.safeParse(currencyFixture.public_status).success).toBe(false);
    expect(commandStatus.safeParse(currencyFixture.stored_status).success).toBe(false);
    const validate=compile("CommandStatus");
    expect(validate(currencyFixture.stored_status)).toBe(false);
    expect(validate(currencyFixture.public_status)).toBe(true);
    expect(currencyFixture.public_status).toEqual({...currencyFixture.stored_status,currency:fixture.intent.business_payload.currency});
    for(const currency of [null,""," USDT","USDT ","USDT\n"]){
      expect(commandStatus.safeParse({...fixture.ack_only,currency}).success).toBe(false);
      expect(validate({...fixture.ack_only,currency})).toBe(false);
    }
  });
  it("publishes six named operations on five paths without replacing submit",()=>{
    expect(Object.keys(api.paths)).toHaveLength(5);
    const entries=Object.values(api.paths).flatMap((path)=>Object.values(path as Record<string,unknown>));
    expect(entries).toHaveLength(6);
    expect(new Set(entries.map((entry)=> (entry as {operationId:string}).operationId)).size).toBe(6);
    const capital=api.paths["/api/v1/execution/capital-commands"];
    expect(capital.post.operationId).toBe("executionCapitalCommandSubmitV1");
    expect(capital.get.operationId).toBe("executionCapitalCommandCollectionV1");
    expect(capital.get.security).toEqual([{PortalSession:[]}]);
    expect(capital.get.requestBody).toBeUndefined();
    expect(api.paths["/api/v1/execution/capital-commands/{id}"].get.operationId).toBe("executionCapitalCommandStatusV1");
    expect(api.paths["/api/v1/execution/capital-commands/{id}"].post).toBeUndefined();
  });
  it.each([["CommandIntent","intent",commandIntent],["CommandPreview","preview_blocked",commandPreview],["CommandStatus","ack_only",commandStatus]] as const)("%s matches runtime Zod and public fixtures",(name,key,schema)=>{
    const validate=compile(name);expect(validate(fixture[key]),JSON.stringify(validate.errors)).toBe(true);
    expect(schema.safeParse(fixture[key]).success).toBe(true);
    expect(validate({...fixture[key],jwt:"forbidden"})).toBe(false);
  });
  it("keeps required target queries distinct from optional default limit/cursor",()=>{
    const validate=compile("CommandCollectionQuery"),query=collectionFixture.query;
    expect(validate(query),JSON.stringify(validate.errors)).toBe(true);
    expect(commandCollectionQuery.parse(query)).toEqual({...query,limit:25});
    const get=api.paths["/api/v1/execution/capital-commands"].get;
    const parameters=Object.fromEntries(get.parameters.map((p:{name:string})=>[p.name,p]));
    expect(Object.keys(parameters).sort()).toEqual(["workspace_id","resource_kind","resource_id","environment","limit","after"].sort());
    for(const key of ["workspace_id","resource_kind","resource_id","environment"]){
      expect(parameters[key].required).toBe(true);
      const missing={...query};delete missing[key];
      expect(validate(missing)).toBe(false);expect(commandCollectionQuery.safeParse(missing).success).toBe(false);
    }
    expect(parameters.limit.required).toBe(false);expect(parameters.limit.schema.default).toBe(25);
    expect(parameters.limit.schema.minimum).toBe(1);expect(parameters.limit.schema.maximum).toBe(100);
    expect(parameters.after.required).toBe(false);expect(parameters.after.schema.maxLength).toBe(4096);
    for(const limit of [1,100]){
      expect(validate({...query,limit,after:"TEST_ONLY:shape-only-not-a-runtime-cursor"})).toBe(true);
      expect(commandCollectionQuery.safeParse({...query,limit,after:"TEST_ONLY:shape-only-not-a-runtime-cursor"}).success).toBe(true);
    }
    for(const invalid of [{limit:0},{limit:101},{after:"x".repeat(4097)}]){
      expect(validate({...query,...invalid})).toBe(false);
      expect(commandCollectionQuery.safeParse({...query,...invalid}).success).toBe(false);
    }
    for(const extra of [{actor_id:"spoof"},{profile_ref:"forbidden"},{jwt:"forbidden"}]){
      expect(validate({...query,...extra})).toBe(false);
      expect(commandCollectionQuery.safeParse({...query,...extra}).success).toBe(false);
    }
  });
  it("reuses strict CommandStatus items, including typed UNKNOWN absence",()=>{
    const value=collectionFixture.collection,validate=compile("CommandCollection");
    expect(validate(value),JSON.stringify(validate.errors)).toBe(true);
    expect(commandCollection.safeParse(value).success).toBe(true);
    expect(api.components.schemas.CommandCollection.properties.items.items.$ref).toBe("#/components/schemas/CommandStatus");
    expect(api.components.schemas.CommandCollection.properties.items.maxItems).toBe(100);
    expect(value.items[0]).toEqual(fixture.ack_only);
    const empty={...value,items:[],page:{...value.page,returned_count:0}};
    expect(validate(empty)).toBe(true);expect(commandCollection.safeParse(empty).success).toBe(true);
    const leaked={...value,items:[{...value.items[0],authorization_fact:{secret:"forbidden"}}]};
    expect(validate(leaked)).toBe(false);expect(commandCollection.safeParse(leaked).success).toBe(false);
    expect(validate({...value,total_count:1})).toBe(false);
    // Zod owns cross-row/page invariants; JSON Schema carries structural bounds.
    expect(commandCollection.safeParse({...value,page:{...value.page,returned_count:0}}).success).toBe(false);
    expect(commandCollection.safeParse({...value,resource:{...value.resource,id:"OTHER"}}).success).toBe(false);
  });
  it("documents private collection problems without changing existing PM/status schemas",()=>{
    const get=api.paths["/api/v1/execution/capital-commands"].get;
    for(const status of [200,400,401,403,404,409,503])
      expect(get.responses[status].headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(get.responses[400].description).toContain("COMMAND_COLLECTION_CURSOR_INVALID");
    expect(get.responses[409].description).toContain("COMMAND_COLLECTION_CURSOR_CHANGED");
    expect(get.responses[503].description).toContain("COMMAND_COLLECTION_OVERFLOW");
    expect(get.responses[503].content["application/json"].schema.$ref).toBe("#/components/schemas/CommandProblem");
    expect(get.parameters.every((p:{in:string})=>p.in==="query")).toBe(true);
    const foundation=load("openapi/execution-v2-foundation.openapi.json");
    expect(api.components.schemas.PmaCandidateCapitalCommand).toEqual(foundation.components.schemas.PmaCandidateCapitalCommand);
    const validate=compile("CommandStatus");
    expect(validate(fixture.ack_only)).toBe(true);
    expect(validate({...fixture.ack_only,business:{...fixture.ack_only.business,amounts:0}})).toBe(false);
  });
  it("keeps PM payload typed/strict and its huge counters as strings",()=>{
    const validate=compile("CommandIntent");
    expect(validate({...fixture.intent,business_payload:{...fixture.intent.business_payload,expected_versions:{budget:9007199254740992,source:"2",parent:"3"}}})).toBe(false);
    expect(validate({...fixture.intent,business_payload:{...fixture.intent.business_payload,actor_id:"spoof"}})).toBe(false);
    expect(api.components.schemas.CommandIntent.properties.business_payload.$ref).toContain("PmaCandidateCapitalCommand");
  });
});
