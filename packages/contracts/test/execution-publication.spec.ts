import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { publicationCatalogue, datasetPublication } from "../../../apps/control-api/src/execution-v2/publication.contract";
import { browserPublicationCatalogue, assertPublicationFieldName } from "../../../apps/control-api/src/execution-v2/publication-catalogue";
const root=resolve(__dirname,"..");
const load=(path:string)=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const schema=load("schemas/execution-publication-catalogue.v1.schema.json");
const fixture=load("fixtures/execution-publication-catalogue.source.valid.json");
const validate=new Ajv2020({strict:true,allErrors:true}).compile(schema);
describe("ELP2-05 pinned publication schema and source compatibility",()=>{
  it("publishes exactly the served safe contract inventory",()=>{
    expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
    expect(publicationCatalogue.parse(fixture)).toEqual(browserPublicationCatalogue());
    const api=load("openapi/execution-publication-catalogue.openapi.json");
    expect(api.paths["/api/v1/execution/manager/operations"].get.operationId).toBe("executionManagerPublicationCatalogueGet");
    expect(api.components.schemas.PublicationCatalogue).toEqual(Object.fromEntries(Object.entries(schema).filter(([k])=>!["$schema","$id","title"].includes(k))));
  });
  it.each([
    ["registry.json","9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67"],
    ["field-dictionary.json","aca5c54cce66becbf47ef32d30799e9dfe75a4f3d51df4e3ade0e89c53cbec7e"],
    ["metric-dependencies.json","9c945880e821ecec4b5f56f85c5de15d506817cb07984300b824b4f5390c5a31"],
  ])("preserves immutable source bytes %s",(name,digest)=>{
    expect(createHash("sha256").update(readFileSync(resolve(root,"fixtures/execution-publication-source",name))).digest("hex")).toBe(digest);
  });
  it("all source families retain owner/writer/query/grain/history/retention gaps",()=>{
    const source=load("fixtures/execution-publication-source/registry.json");
    expect(source.families).toHaveLength(42);expect(source.new_runtime_exports_enabled).toBe(false);
    for(const family of source.families){
      expect(fixture.families.find((f:any)=>f.family_id===family.id)).toMatchObject({authority_owner:family.owner,grain:family.grain,history_capability:family.history_capability,retention:family.retention});
      expect(family.writer_refs.length).toBeGreaterThan(0);expect(family.source_query_refs.length).toBeGreaterThan(0);
    }
  });
  it("does not relabel pending source data or secret fields as available",()=>{
    for(const change of [{availability:"AVAILABLE"},{runtime_enabled:true},{history_full:true},{history_capability:"SNAPSHOT_TAIL"}]){
      const bad=structuredClone(fixture);Object.assign(bad.families[0],change);
      expect(validate(bad)).toBe(false);expect(publicationCatalogue.safeParse(bad).success).toBe(false);
    }
    expect(validate({...fixture,source_cursor:"private"})).toBe(false);
    expect(()=>assertPublicationFieldName("apiKey")).toThrow();
  });
  it("canonical test publication is explicit TEST_ONLY and rejects unknown wire inputs",()=>{
    const f=load("fixtures/execution-dataset-publication.synthetic.valid.json");
    expect(f.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(datasetPublication.safeParse(f.value).success).toBe(true);
    for(const key of ["relation","jwt","sql","upstream_url","source_cursor"])
      expect(datasetPublication.safeParse({...f.value,[key]:"injection"}).success).toBe(false);
  });
});
