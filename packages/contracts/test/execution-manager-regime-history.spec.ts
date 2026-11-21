/** Synthetic wire fixtures only; no source, runtime, PG or calibration proof. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,it,expect} from "vitest";
import {managerScoreRevisionView,managerScoreRevisionHistory,managerScoreRevisionQuery}
  from "../../../apps/control-api/src/execution-v2/manager-score-revision.contract";
import {managerHistoricalRegimeDetail} from "../../../apps/control-api/src/execution-v2/manager-regime-history.contract";
const root=resolve(__dirname,".."),load=(p:string)=>JSON.parse(readFileSync(resolve(root,p),"utf8"));
const sample=(kind:string)=>load(`fixtures/execution-manager-regime-${kind}.synthetic.valid.json`);
const api=load("openapi/execution-manager-models.openapi.json"),ajv=new Ajv2020({strict:true,allErrors:true});
const validate=ajv.compile(load("schemas/execution-manager-score-revision.v1.schema.json"));
const validateHistory=ajv.compile(load("schemas/execution-manager-score-history.v1.schema.json"));
describe("independent historical Regime canonical public contract",()=>{
  it.each(["original","restated","partial","missing-corpus"])("publishes %s with exact source/absence clocks",kind=>{
    const fixture=sample(kind);expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(fixture.value),JSON.stringify(validate.errors)).toBe(true);
    expect(managerScoreRevisionView.parse(fixture.value)).toEqual(fixture.value);
    expect(managerHistoricalRegimeDetail.parse(fixture.value.regime)).toEqual(fixture.value.regime);
    expect(fixture.value.score_details).toEqual([]);expect(fixture.value.operational_current).toBe(false);
  });
  it.each(["history","history-unavailable"])("distinguishes %s and null from verified zero counts",kind=>{
    const value=sample(kind).value;
    expect(validateHistory(value),JSON.stringify(validateHistory.errors)).toBe(true);expect(managerScoreRevisionHistory.parse(value)).toEqual(value);
    if(kind==="history-unavailable")expect(value.page.authorized_total_count).toBeNull();
  });
  it("publishes named closed detail/entry/result and only Alpha/Deployment family queries",()=>{
    for(const name of ["ManagerHistoricalRegimeDetail","ManagerHistoricalRegimeEntry","ManagerHistoricalRegimeResult"])
      expect(api.components.schemas[name]).toBeDefined();
    const q={environment:"live",surface:"ALPHA",id:"TEST_ONLY:alpha",metric_family:"REGIME",stage_filter:["LIVE"],
      economic_partition:{economic_domain:"ACTUAL",currency:"USDT",basis:"TEST_ONLY:basis",native_profile_ref:"TEST_ONLY:native",domain_proof_ref:"TEST_ONLY:proof"},
      source_selector:"CURRENT_HEAD",revision_mode:"ORIGINAL_AS_PUBLISHED"};
    expect(managerScoreRevisionQuery.parse(q).metric_family).toBe("REGIME");
    for(const surface of ["FUND","PORTFOLIO","ACCOUNT"])
      expect(managerScoreRevisionQuery.safeParse({...q,surface}).success).toBe(false);
    const detail=ajv.compile(api.components.schemas.ManagerHistoricalRegimeDetail);
    expect(detail({...sample("original").value.regime,private_corpus:"PRIVATE"})).toBe(false);
  });
  it.each(["private-ref","future-feature","wrong-target","mixed-score","false-partial","wrong-cutoff"])
  ("refuses %s without asking the consumer to infer correctness",kind=>{
    const value=structuredClone(sample("restated").value),e=value.regime.entries[0];
    if(kind==="private-ref")e.original_input_ref="PRIVATE:input";
    if(kind==="future-feature")e.original.feature_cutoff_ms++;
    if(kind==="wrong-target")value.target.surface="PORTFOLIO";
    if(kind==="mixed-score")value.composition=load("fixtures/execution-manager-composition-original.synthetic.valid.json").value.composition;
    if(kind==="false-partial")value.regime.reason_codes=["SOURCE_PROJECTION_PARTIAL"];
    if(kind==="wrong-cutoff")e.knowledge_cutoff_ms++;
    expect(managerScoreRevisionView.safeParse(value).success).toBe(false);
  });
});
