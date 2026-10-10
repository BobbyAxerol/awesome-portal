import {readFileSync} from "node:fs";
import {join} from "node:path";
import Ajv from "ajv/dist/2020";
import {it,expect} from "vitest";
const root=join(__dirname,"..");
const json=(path:string)=>JSON.parse(readFileSync(join(root,path),"utf8"));
const schema=json("schemas/execution-retained-review.v1.schema.json");
const fixture=()=>json("fixtures/execution-retained-review.valid.json");
it("UDB03 fixture keeps captured observations separate from rejected current source",()=>{
  const validate=new Ajv({strict:true,allErrors:true}).compile(schema);expect(validate(fixture()),JSON.stringify(validate.errors)).toBe(true);
  for(const field of ["upstream_enabled","source_refresh_enabled","stream_enabled","mutation_enabled","live_eligibility"]){const value=fixture();value[field]=true;expect(validate(value)).toBe(false);}
  const fresh=fixture();fresh.profiles[0].freshness="FRESH";expect(validate(fresh)).toBe(false);
  const management=fixture();management.permissions.manage=true;expect(validate(management)).toBe(false);
});
it("UDB03 generated GET contract exposes no browser profile/relation/source credential inputs",()=>{
  const document=json("openapi/execution-retained-review.openapi.json");
  expect(Object.keys(document.paths)).toEqual(["/api/v1/execution/retained-review","/api/v1/execution/profiles/{environment}/realtime-snapshot","/api/v1/execution/manager/current/{operation_id}"]);
  for(const path of Object.values(document.paths) as any[])expect(Object.keys(path)).toEqual(["get"]);
  expect(Object.keys(document.paths["/api/v1/execution/retained-review"])).toEqual(["get"]);
  const generated=readFileSync(join(root,"generated/execution-retained-review.d.ts"),"utf8");
  for(const name of ["executionRetainedReviewV1","RetainedReviewResponse","RetainedReviewProfile","RetainedReviewPanel"])expect(generated).toContain(name);
});
it("named retained page keeps rejected source separate and publishes bounded exact-value fields",()=>{
  const validate=new Ajv({strict:true,allErrors:true}).compile(json("schemas/execution-retained-operation-page.v1.schema.json"));
  const example=json("fixtures/execution-retained-operation-page.valid.json");
  expect(validate(example),JSON.stringify(validate.errors)).toBe(true);
  expect(example.source_health.availability).toBe("UNAVAILABLE");expect(example.records).toHaveLength(1);
  expect(example.records[0].values.equity).toBe("1234567890.1234567890123456789");
  const fresh=structuredClone(example);fresh.source_health.freshness="FRESH";expect(validate(fresh)).toBe(false);
  const live=structuredClone(example);live.source_health.replay_eligible=true;expect(validate(live)).toBe(false);
  const generated=readFileSync(join(root,"generated/execution-retained-review.d.ts"),"utf8");expect(generated).toContain("RetainedNamedOperationPage");
});
