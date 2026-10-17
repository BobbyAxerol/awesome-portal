import {readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {describe,expect,it} from "vitest";
import {operationReaderSchema} from "../tooling/execution-operation-reader.mjs";
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
