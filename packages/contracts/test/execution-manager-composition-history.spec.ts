/** Canonical synthetic producer fixtures only; no source/PG/runtime/owner proof. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,it,expect} from "vitest";
import {managerHistoricalComposition,managerScoreRevisionView,managerScoreRevisionHistory,
  managerScoreRevisionQuery,managerScoreRevisionHistoryQuery}
  from "../../../apps/control-api/src/execution-v2/manager-score-revision.contract";

const root=resolve(__dirname,".."),load=(path:string)=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const sample=(kind:string)=>load(`fixtures/execution-manager-composition-${kind}.synthetic.valid.json`);
const api=load("openapi/execution-manager-models.openapi.json"),ajv=new Ajv2020({strict:true,allErrors:true});
const schema=load("schemas/execution-manager-score-revision.v1.schema.json"),check=ajv.compile(schema);
describe("ELP2-06 exact historical Composition canonical producer contract",()=>{
  it.each(["original","restated","partial","no-allocation"])("publishes %s with exact absence/clock semantics",kind=>{
    const fixture=sample(kind),value=fixture.value;
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(check(value),JSON.stringify(check.errors)).toBe(true);
    expect(managerScoreRevisionView.parse(value)).toEqual(value);
    expect(managerHistoricalComposition.parse(value.composition)).toEqual(value.composition);
    expect(value.operational_current).toBe(false);expect(value.score_details).toEqual([]);
    if(kind==="no-allocation")expect(value.composition.result).toMatchObject({value:null,status:"no_allocation",total_allocated_capital:"0",contributions:[]});
    if(kind==="partial")expect(value.composition.result).toMatchObject({value:null,total_allocated_capital:"80",score_coverage_allocated:"0.75",bounds:{lower:"67.5",upper:"92.5"}});
  });
  it("generates a named closed Composition detail and optional family selector, without changing endpoints",()=>{
    expect(api.components.schemas.ManagerHistoricalComposition).toBeDefined();
    const q=api.components.schemas.ManagerScoreRevisionQuery;
    expect(q.properties.metric_family.enum).toEqual(["SCORE","COMPOSITION","REGIME"]);
    expect(q.required).not.toContain("metric_family");
    expect(api.paths["/api/v1/execution/manager/score-view"].get.operationId).toBe("executionManagerScoreRevisionGetV1");
    expect(api.paths["/api/v1/execution/manager/score-revisions"].get.operationId).toBe("executionManagerScoreRevisionHistoryGetV1");
    const detail=ajv.compile(api.components.schemas.ManagerHistoricalComposition);
    expect(detail({...sample("restated").value.composition,private_custody_key:"PRIVATE"})).toBe(false);
  });
  it("preserves default SCORE query shape and rejects non-accounting Composition targets",()=>{
    const q={environment:"paper",surface:"PORTFOLIO",id:"TEST_ONLY:portfolio",economic_partition:{economic_domain:"PAPER",currency:"USDT",basis:"TEST_ONLY:basis",native_profile_ref:"TEST_ONLY:native",domain_proof_ref:"TEST_ONLY:proof"},source_selector:"CURRENT_HEAD",revision_mode:"RESTATED_CURRENT_POLICY"};
    expect(managerScoreRevisionQuery.parse(q)).not.toHaveProperty("metric_family");
    expect(managerScoreRevisionQuery.parse({...q,metric_family:"SCORE"}).metric_family).toBe("SCORE");
    expect(managerScoreRevisionQuery.parse({...q,metric_family:"COMPOSITION"}).metric_family).toBe("COMPOSITION");
    for(const surface of ["ALPHA","ACCOUNT","DEPLOYMENT"]){
      expect(managerScoreRevisionQuery.safeParse({...q,surface,metric_family:"COMPOSITION"}).success).toBe(false);
      expect(managerScoreRevisionHistoryQuery.safeParse({...q,surface,metric_family:"COMPOSITION"}).success).toBe(false);
    }
  });
  it("publishes causal Composition history without mixing original mode or raw/direct entries",()=>{
    const fixture=sample("history"),json=load("schemas/execution-manager-score-history.v1.schema.json"),validate=ajv.compile(json);
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(fixture.value),JSON.stringify(validate.errors)).toBe(true);
    expect(managerScoreRevisionHistory.parse(fixture.value)).toEqual(fixture.value);
    expect(fixture.value.items[0].supersedes_revision_ref).toBe(fixture.value.items[1].revision_ref);
  });
  it.each(["false-availability","private-id","duplicate-dependency","false-census","missing-reason","mixed-score","wrong-target","wrong-time"])("refuses %s rather than making consumer repair it",kind=>{
    const value=structuredClone(sample("restated").value);
    if(kind==="false-availability")value.composition.availability="PARTIAL";
    if(kind==="private-id")value.composition.result.allocation_snapshot_id="PRIVATE:allocation";
    if(kind==="duplicate-dependency")value.composition.raw_dependencies.push(value.composition.raw_dependencies[0]);
    if(kind==="false-census")value.composition.raw_dependencies.pop();
    if(kind==="missing-reason")value.composition.raw_dependencies[0].availability="NOT_PUBLISHED";
    if(kind==="mixed-score")value.score_details=[load("fixtures/execution-manager-score-history.available.synthetic.valid.json").value.items[0].score_details[0]];
    if(kind==="wrong-target")value.target.surface="ALPHA";
    if(kind==="wrong-time")value.composition.computed_at_ms--;
    expect(managerScoreRevisionView.safeParse(value).success).toBe(false);
  });
});
