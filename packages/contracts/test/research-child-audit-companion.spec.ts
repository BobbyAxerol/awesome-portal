import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe,expect,it } from "vitest";
const root=join(__dirname,".."),read=(path:string)=>JSON.parse(readFileSync(join(root,path),"utf8"));
const doc=read("openapi/research-child-audit-companion.openapi.json");
const validate=new Ajv2020({strict:false}).compile(JSON.parse(JSON.stringify({...doc.components.schemas.Page,$defs:doc.components.schemas}).replaceAll("#/components/schemas/","#/$defs/")));
describe("named full-source custody companion public contract",()=>{
  it.each(["full-source","legacy-sample","not-retained"])("validates canonical synthetic %s, never private worker/path fields",name=>{
    const fixture=read(`fixtures/research-child-audit-companion.${name}.valid.json`);
    expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
    for(const extra of [{...fixture,worker_attempt_id:"private"},{...fixture,source_path:"private"},{...fixture,lease_epoch:1}]) expect(validate(extra)).toBe(false);
  });
  it("does not let legacy samples masquerade as full-source pages and caps the public page",()=>{
    const old=read("fixtures/research-child-audit-companion.legacy-sample.valid.json");
    expect(validate({...old,custody:"FULL_SOURCE_RETAINED"})).toBe(false);
    const full=read("fixtures/research-child-audit-companion.full-source.valid.json");
    expect(validate({...full,rows:Array.from({length:201},()=>full.rows[0]),counts:{...full.counts,returned:201}})).toBe(false);
    const get=Object.values(doc.paths)[0] as {get:{operationId:string;parameters:Array<{name:string;schema:object}>}};
    expect(get.get.operationId).toBe("researchChildAuditCompanionGetV1");
    expect(get.get.parameters.find(p=>p.name==="limit")!.schema).toMatchObject({maximum:200});
    expect(doc.info.description).toContain("source-dropped rows are irrecoverable");
  });
});
