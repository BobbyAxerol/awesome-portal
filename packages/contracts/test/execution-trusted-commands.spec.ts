import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,expect,it} from "vitest";
import {commandIntent,commandPreview,commandStatus} from "../../../apps/control-api/src/execution-v2/command.contract";
const root=resolve(__dirname,".."),load=(p:string)=>JSON.parse(readFileSync(resolve(root,p),"utf8"));
const api=load("openapi/execution-trusted-commands.openapi.json"),fixture=load("fixtures/execution-trusted-commands.synthetic.valid.json");
const ajv=new Ajv2020({strict:false});
const compile=(name:string)=>ajv.compile(JSON.parse(JSON.stringify({$ref:"#/components/schemas/"+name,components:{schemas:api.components.schemas}})));
describe("ELP2-07 generated command contract",()=>{
  it("publishes four named operations, no arbitrary proxy or context installer",()=>{
    expect(Object.keys(api.paths)).toHaveLength(4);
    expect(api.paths["/api/v1/execution/capital-commands/{id}"].get.operationId).toBe("executionCapitalCommandStatusV1");
    expect(api.paths["/api/v1/execution/capital-commands/{id}"].post).toBeUndefined();
  });
  it.each([["CommandIntent","intent",commandIntent],["CommandPreview","preview_blocked",commandPreview],["CommandStatus","ack_only",commandStatus]] as const)("%s matches runtime Zod and public fixtures",(name,key,schema)=>{
    const validate=compile(name);expect(validate(fixture[key]),JSON.stringify(validate.errors)).toBe(true);
    expect(schema.safeParse(fixture[key]).success).toBe(true);
    expect(validate({...fixture[key],jwt:"forbidden"})).toBe(false);
  });
  it("keeps PM payload typed/strict and its huge counters as strings",()=>{
    const validate=compile("CommandIntent");
    expect(validate({...fixture.intent,business_payload:{...fixture.intent.business_payload,expected_versions:{budget:9007199254740992,source:"2",parent:"3"}}})).toBe(false);
    expect(validate({...fixture.intent,business_payload:{...fixture.intent.business_payload,actor_id:"spoof"}})).toBe(false);
    expect(api.components.schemas.CommandIntent.properties.business_payload.$ref).toContain("PmaCandidateCapitalCommand");
  });
});
