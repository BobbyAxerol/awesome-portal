/** Wire fixtures only: ordinary HMD product receipts are a separate gate. */
import {readFileSync} from "node:fs";
import {join} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,it,expect} from "vitest";
import type {components} from "../generated/research-preflight";
const root=join(__dirname,"..");
const doc=(name:string)=>JSON.parse(readFileSync(join(root,`openapi/${name}.openapi.json`),"utf8"));
function validator(name:string,schema:string){
  const schemas=doc(name).components.schemas;
  return new Ajv2020({strict:false}).compile(JSON.parse(JSON.stringify({...schemas[schema],$defs:schemas})
    .replaceAll("#/components/schemas/","#/$defs/")));
}
const clock:components["schemas"]["FixedUtcProvenance"]=JSON.parse(readFileSync(join(root,"fixtures/research-full03.utc-provenance.valid.json"),"utf8"));
describe("FULL03 additive indexed UTC wire authority",()=>{
  it("publishes typed window sampling without calling a chart sample full source history",()=>{
    const value=JSON.parse(readFileSync(join(root,"fixtures/research-full03.protocol-display.synthetic.valid.json"),"utf8")).protocol;
    for(const name of ["research-current-source","research-report"]){
      const validate=validator(name,"ProtocolDisclosure");
      expect(validate(value),JSON.stringify(validate.errors)).toBe(true);
      const bad=structuredClone(value);bad.window_series_metadata.is.emitted_point_count=193;
      expect(validate(bad)).toBe(false);
    }
  });
  it("validates the generated canonical clock fixture and refuses borrowed VN clocks",()=>{
    const validate=validator("research-preflight","FixedUtcProvenance");
    expect(validate(clock),JSON.stringify(validate.errors)).toBe(true);
    for(const changed of [{source_timezone:"Asia/Ho_Chi_Minh"},{clock_basis:"OBSERVED_SOURCE_LOCAL_DATE_V1"},
      {warmup_semantics:"LAST_N_OBSERVED_PREDECESSORS_V1"},{metadata_index_revision:"bad"}])
      expect(validate({...clock,...changed})).toBe(false);
  });
  it("keeps historical no-index bindings valid and pins optional crypto provenance",()=>{
    const value=JSON.parse(readFileSync(join(root,"fixtures/research-preflight.response.valid.json"),"utf8")).dataset_binding;
    const validate=validator("research-preflight","DatasetBinding");
    expect(validate(value),JSON.stringify(validate.errors)).toBe(true);
    expect(validate({...value,provenance:clock}),JSON.stringify(validate.errors)).toBe(true);
    expect(validate({...value,timezone:"Asia/Ho_Chi_Minh",provenance:clock})).toBe(false);
  });
  it("publishes all exact interval/semantic pairs, not an arbitrary family prefix",()=>{
    const table=JSON.parse(readFileSync(join(root,"../../apps/portal/registry/research-execution-recipes.v1.json"),"utf8"));
    const rows=table.recipes.filter((r:any)=>r.source_requirement==="FULL03_IMMUTABLE_DELTA_BINDING");
    const schemas=doc("research-current-source").components.schemas;
    const validate=validator("research-current-source","Provenance");
    const value=JSON.parse(readFileSync(join(root,"fixtures/research-current-source.split.valid.json"),"utf8")).provenance;
    expect(rows).toHaveLength(28);
    for(const row of rows){
      expect(validate({...value,...row.descriptor.current_source}),JSON.stringify(validate.errors)).toBe(true);
      expect(validate({...value,...row.descriptor.current_source,profile_id:"full03.guessed.v1"})).toBe(false);
    }
    expect(schemas.Provenance.properties.source_adapter_id.enum).toContain(value.source_adapter_id);
  });
});
