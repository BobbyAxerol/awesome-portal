import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { ordinaryAuthorityReceipt, ordinaryDelegateRequest, ordinaryRevokeRequest,
  ordinaryAuthorityStepUpRequest, ordinaryAuthorityStepUpResponse } from "../../../apps/control-api/src/execution-v2/ordinary-profile-authority.contract";
import type { components } from "../generated/execution-ordinary-profile-authority";
const load=(path:string)=>JSON.parse(readFileSync(resolve(__dirname,"..",path),"utf8"));
const api=load("openapi/execution-ordinary-profile-authority.openapi.json");
const fixtures=load("fixtures/execution-ordinary-profile-authority.synthetic.valid.json");
const receipt:components["schemas"]["OrdinaryAuthorityReceipt"]=fixtures.cases.receipt;
const entries=[
  ["delegate","OrdinaryDelegateRequest",ordinaryDelegateRequest],
  ["revoke","OrdinaryRevokeRequest",ordinaryRevokeRequest],
  ["receipt","OrdinaryAuthorityReceipt",ordinaryAuthorityReceipt],
  ["step_up_request","OrdinaryStepUpRequest",ordinaryAuthorityStepUpRequest],
  ["step_up_response","OrdinaryStepUpResponse",ordinaryAuthorityStepUpResponse],
] as const;
describe("ordinary profile authority served contract",()=>{
  it("names its canonical receipt schema so it can share the schema registry",()=>{
    const schema=load("schemas/execution-ordinary-profile-authority.v1.schema.json");
    expect(schema.$id).toBe("https://schemas.primusspark.com/portal/execution-ordinary-profile-authority.v1.schema.json");
    const registry=new Ajv2020({strict:true});registry.addSchema(schema);
    expect(registry.getSchema(schema.$id)?.(receipt)).toBe(true);
  });
  it("publishes only private-composition authenticated operations, no install or upstream privilege",()=>{
    expect(Object.keys(api.paths)).toHaveLength(3);
    for(const path of Object.values(api.paths) as Array<{post:any}>){
      expect(path.post.security).toEqual([{PortalSession:[]}]);
      expect(path.post.parameters[0]).toMatchObject({name:"X-Portal-Idempotency-Key",required:true});
      expect(path.post.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
      expect(path.post.description).toContain("No root artifact installation over HTTP");
    }
    expect(receipt.source_qualified).toBe(false);expect(fixtures.runtime_qualified).toBe(false);
  });
  it.each(entries)("accepts synthetic %s consistently",(name,key,zod)=>{
    const validate=new Ajv2020({strict:false}).compile(api.components.schemas[key]);
    expect(validate(fixtures.cases[name]),JSON.stringify(validate.errors)).toBe(true);
    expect(zod.safeParse(fixtures.cases[name]).success).toBe(true);
    expect(validate({...fixtures.cases[name],arbitrary_authority:true})).toBe(false);
    expect(zod.safeParse({...fixtures.cases[name],arbitrary_authority:true}).success).toBe(false);
  });
  it.each(["source_qualified","stream_commissioned","command_commissioned"])("refuses promoted %s",key=>{
    const value={...receipt,[key]:true};
    expect(ordinaryAuthorityReceipt.safeParse(value).success).toBe(false);
    expect(new Ajv2020({strict:false}).compile(api.components.schemas.OrdinaryAuthorityReceipt)(value)).toBe(false);
  });
  it.each(["action","environment","domain","delegable_actions","issued_by"])("client cannot select delegation %s",field=>{
    const value={...fixtures.cases.delegate,[field]:"invented"};
    expect(ordinaryDelegateRequest.safeParse(value).success).toBe(false);
    expect(new Ajv2020({strict:false}).compile(api.components.schemas.OrdinaryDelegateRequest)(value)).toBe(false);
  });
  it("retains cross-field and current-authority checks as real server invariants",()=>{
    expect(ordinaryDelegateRequest.safeParse({...fixtures.cases.delegate,valid_until_ms:1}).success).toBe(false);
    expect(api.components.schemas.OrdinaryDelegateRequest["x-server-invariants"]).toContain("HEAD_REVISION_AND_DIGEST_CAS");
    expect(ordinaryAuthorityStepUpRequest.safeParse({...fixtures.cases.step_up_request,family:"CAPITAL_COMMAND"}).success).toBe(false);
  });
});
