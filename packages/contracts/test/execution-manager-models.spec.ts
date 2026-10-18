import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { managerDatasetResponse, managerMetric, managerModelQuery, managerQuality, managerScorePublication,managerCompositionPublication } from "../../../apps/control-api/src/execution-v2/manager-model.contract";
import { managerRegimePublication } from "../../../apps/control-api/src/execution-v2/manager-regime-publication.contract";
import { managerScoreRevisionView, managerScoreRevisionHistory } from "../../../apps/control-api/src/execution-v2/manager-score-revision.contract";
import { managerP1Options } from "../../../apps/control-api/src/execution-v2/manager-query-p1.contract";
import { managerDatasetRow } from "../../../apps/control-api/src/execution-v2/manager-model.contract";
import { managerP1NoFactsSyntheticOptions } from "../tooling/execution-manager-p1-fixtures.mjs";
const root = resolve(__dirname,"..");
const load = (file:string) => JSON.parse(readFileSync(resolve(root,file),"utf8"));
const api = load("openapi/execution-manager-models.openapi.json");
const schema = load("schemas/execution-manager-dataset.v1.schema.json");
const fixture = load("fixtures/execution-manager-dataset.synthetic.valid.json");
const ajv = new Ajv2020({strict:true,allErrors:true});
const validate = ajv.compile(schema);
describe("ELP2-06 generated named Manager BFF contract",()=>{
  it.each(["original","restated"])("publishes %s historical fixture in Zod, JSON Schema and OpenAPI without operational authority",mode=>{
    const sample=load(`fixtures/execution-manager-score-${mode}.synthetic.valid.json`);
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    const json=load("schemas/execution-manager-score-revision.v1.schema.json");
    expect(api.components.schemas.ManagerScoreRevisionView).toEqual(Object.fromEntries(Object.entries(json).filter(([k])=>!["$schema","$id"].includes(k))));
    const check=ajv.getSchema(json.$id)??ajv.compile(json);
    expect(check(sample.value),JSON.stringify(check.errors)).toBe(true);
    expect(managerScoreRevisionView.parse(sample.value)).toEqual(sample.value);
    expect(check({...sample.value,operational_current:true})).toBe(false);
    expect(managerScoreRevisionView.safeParse({...sample.value,operational_current:true}).success).toBe(false);
    expect(managerScoreRevisionView.safeParse({...sample.value,knowledge_cutoff_ms:0,computed_at_ms:0}).success).toBe(false);
    expect(managerScoreRevisionView.safeParse({...sample.value,eligibility:{...sample.value.eligibility,policy_current:!sample.value.eligibility.policy_current}}).success).toBe(false);
    expect(check({...sample.value,source_set_digest:"PRIVATE"})).toBe(false);
  });
  it("does not publish a fake empty complete history, numeric count or unscoped private revision",()=>{
    const sample=load("fixtures/execution-manager-score-history.synthetic.valid.json");
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    const json=load("schemas/execution-manager-score-history.v1.schema.json"),check=ajv.getSchema(json.$id)??ajv.compile(json);
    expect(check(sample.value),JSON.stringify(check.errors)).toBe(true);
    expect(managerScoreRevisionHistory.parse(sample.value)).toEqual(sample.value);
    for(const invalid of [{...sample.value,page:{...sample.value.page,returned_count:0}},
      {...sample.value,items:[load("fixtures/execution-manager-score-original.synthetic.valid.json").value]}]){
      expect(check(invalid)).toBe(false);expect(managerScoreRevisionHistory.safeParse(invalid).success).toBe(false);
    }
    expect(api.paths["/api/v1/execution/manager/score-view"].get.operationId).toBe("executionManagerScoreRevisionGetV1");
    expect(api.paths["/api/v1/execution/manager/score-revisions"].get.operationId).toBe("executionManagerScoreRevisionHistoryGetV1");
  });
  it("publishes scoped historical counts/lineage and expired-policy facts, not private keys or operational values",()=>{
    const sample=load("fixtures/execution-manager-score-history.available.synthetic.valid.json"),json=load("schemas/execution-manager-score-history.v1.schema.json");
    const check=ajv.getSchema(json.$id)??ajv.compile(json);
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(check(sample.value),JSON.stringify(check.errors)).toBe(true);
    expect(managerScoreRevisionHistory.parse(sample.value)).toEqual(sample.value);
    expect(sample.value.items[0].supersedes_revision_ref).toBe(sample.value.items[1].revision_ref);
    expect(sample.value.items.every((v:any)=>v.eligibility.policy_state==="NOT_CURRENT")).toBe(true);
    for(const patch of [{reason_code:"SCOPED_HISTORY_ENUMERATION_NOT_INSTALLED"},
      {page:{...sample.value.page,authorized_total_count:null}},
      {items:[{...sample.value.items[0],calculation_key:"private"}]}]){
      expect(check({...sample.value,...patch})).toBe(false);
      expect(managerScoreRevisionHistory.safeParse({...sample.value,...patch}).success).toBe(false);
    }
    for(const patch of [{page:{...sample.value.page,returned_count:1}},
      {items:[sample.value.items[0],sample.value.items[0]]},
      {items:[{...sample.value.items[0],supersedes_revision_ref:null}]}])
      expect(managerScoreRevisionHistory.safeParse({...sample.value,...patch}).success).toBe(false);
  });
  it("preserves source plus derived metric reasons up to 64 without widening source-quality admission",()=>{
    const sample=load("fixtures/execution-manager-metric.derived-reasons.synthetic.valid.json");
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(sample.value.quality.reasons).toHaveLength(33);
    const check=ajv.compile(api.components.schemas.ManagerMetric);
    for(const count of [33,64,65]){
      const metric=structuredClone(sample.value);
      metric.quality.reasons=Array.from({length:count},(_,i)=>`TEST_ONLY:reason-${i}`);
      expect(check(metric),JSON.stringify(check.errors)).toBe(count<=64);
      expect(managerMetric.safeParse(metric).success).toBe(count<=64);
      const response=structuredClone(load("fixtures/execution-manager-dataset.rows.synthetic.valid.json").value);
      // C4-R02: this positive producer vector must declare its extra authorized score key.
      response.query_options.metric_keys.push("score");
      response.query_options.sort_fields.push("score");
      response.items[0].metrics.score=metric;
      expect(validate(response),JSON.stringify(validate.errors)).toBe(count<=64);
      expect(managerDatasetResponse.safeParse(response).success).toBe(count<=64);
    }
    expect(check(sample.value),JSON.stringify(check.errors)).toBe(true);
    expect(managerMetric.parse(sample.value)).toEqual(sample.value);
    expect(managerQuality.safeParse(sample.value.quality).success).toBe(false);
    const response=structuredClone(fixture.value);
    response.quality=sample.value.quality;
    expect(validate(response)).toBe(false);
    expect(managerDatasetResponse.safeParse(response).success).toBe(false);
  });
  it("publishes descriptive per-alpha Regime without a scalar, pooled outcomes or production fixture authority",()=>{
    const sample=load("fixtures/execution-manager-regime.synthetic.valid.json");
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    const check=ajv.compile(api.components.schemas.ManagerRegimePublication);
    expect(check(sample.value),JSON.stringify(check.errors)).toBe(true);
    expect(managerRegimePublication.parse(sample.value)).toEqual(sample.value);
    const response={...structuredClone(fixture.value),surface:"ALPHA",regime_details:[sample.value]};
    response.scores.regime={value:null,status:"supported"};
    expect(validate(response),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.safeParse(response).success).toBe(true);
    expect(sample.value.result).not.toHaveProperty("value");
    expect(sample.value.result).not.toHaveProperty("effective_sample_size");
    expect(sample.value.result).not.toHaveProperty("matched_outcome_summary");
    expect(sample.value.result.preview).toBeNull();
  });
  it.each(["scalar","preview","false-count","foreign-neighbor","pooled-outcome"])(
    "rejects semantic Regime inconsistency %s",kind=>{
      const sample=structuredClone(load("fixtures/execution-manager-regime.synthetic.valid.json").value);
      if(kind==="scalar")sample.result.value="99";
      if(kind==="preview")sample.result.preview={forecast:"0.5"};
      if(kind==="false-count")sample.result.neighbor_count++;
      if(kind==="foreign-neighbor")sample.result.stage_breakdown[0].neighbors[0].reference_window_id="TEST_ONLY:hidden";
      if(kind==="pooled-outcome")sample.result.matched_outcome_summary=sample.result.stage_breakdown[0].matched_outcome_summary;
      expect(managerRegimePublication.safeParse(sample).success).toBe(false);
    });
  it("publishes Composition separately from RAW/DIRECT_NAV, with full-denominator absence semantics",()=>{
    const sample=load("fixtures/execution-manager-composition.synthetic.valid.json");
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    const check=ajv.compile(api.components.schemas.ManagerCompositionPublication);
    expect(check(sample.value),JSON.stringify(check.errors)).toBe(true);
    expect(managerCompositionPublication.parse(sample.value)).toEqual(sample.value);
    const response={...structuredClone(fixture.value),surface:"PORTFOLIO",composition_details:[sample.value]};
    response.scores.composition={value:"80",status:"available"};
    expect(validate(response),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.safeParse(response).success).toBe(true);
  });
  it.each(["zero-capital","missing-raw-reference","foreign-raw-reference","wrong-band","false-coverage","bad-hhi","negative-dispersion"])(
    "rejects semantic Composition inconsistency %s even where JSON generation cannot encode refinements",kind=>{
      const sample=structuredClone(load("fixtures/execution-manager-composition.synthetic.valid.json").value);
      if(kind==="zero-capital")sample.result.total_allocated_capital="0";
      if(kind==="missing-raw-reference")sample.provenance.raw_score_refs.pop();
      if(kind==="foreign-raw-reference")sample.provenance.raw_score_refs[0].subject_id="TEST_ONLY:hidden";
      if(kind==="wrong-band")sample.result.band_code="weak";
      if(kind==="false-coverage")sample.result.score_coverage_allocated="0";
      if(kind==="bad-hhi")sample.result.diagnostics.allocation_hhi="1.000000000000000001";
      if(kind==="negative-dispersion")sample.result.diagnostics.score_dispersion="-0.000000000000000001";
      expect(managerCompositionPublication.safeParse(sample).success).toBe(false);
    });
  it("publishes precomputed score details with explicit binding, components and null semantics",()=>{
    const sample=load("fixtures/execution-manager-score.synthetic.valid.json");
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    const check=ajv.compile(api.components.schemas.ManagerScorePublication);
    expect(check(sample.value),JSON.stringify(check.errors)).toBe(true);
    expect(managerScorePublication.parse(sample.value)).toEqual(sample.value);
    const response={...structuredClone(fixture.value),score_details:[sample.value]};
    response.scores.raw={value:"73.3",status:"provisional"};
    expect(validate(response),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.safeParse(response).success).toBe(true);
    const invalid=structuredClone(sample.value);invalid.quality.value="100.0000000000000000000001";
    expect(managerScorePublication.safeParse(invalid).success).toBe(false);
    invalid.quality.value=null;expect(managerScorePublication.safeParse(invalid).success).toBe(false);
    invalid.quality.status="partial_components";invalid.quality.band_code=null;
    expect(managerScorePublication.safeParse(invalid).success).toBe(true);
  });
  it("publishes six current and two explicit historical reads, preserving the current DTO",()=>{
    expect(Object.keys(api.paths)).toHaveLength(8);
    expect(new Set(Object.values(api.paths).map((p:any)=>p.get.operationId)).size).toBe(8);
    expect(api.components.schemas.ManagerDataset).toEqual(Object.fromEntries(Object.entries(schema).filter(([k])=>!["$schema","$id"].includes(k))));
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(fixture.value),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.parse(fixture.value)).toEqual(fixture.value);
  });
  it("registers the new schema alongside the repository schema catalogue without an anonymous-id collision",()=>{
    expect(schema.$id).toBe("https://schemas.primusspark.com/portal/execution-manager-dataset.v1.schema.json");
    const registry=new Ajv2020({strict:true,allErrors:true});
    for(const name of readdirSync(resolve(root,"schemas"))) registry.addSchema(load("schemas/"+name));
    expect(registry.getSchema(schema.$id)).toBeTypeOf("function");
  });
  it.each(["relation","jwt","source_cursor","sql","upstream_url"])("rejects unpublished browser selector %s",key=>{
    expect(validate({...fixture.value,[key]:"private"})).toBe(false);
    expect(managerDatasetResponse.safeParse({...fixture.value,[key]:"private"}).success).toBe(false);
    expect(managerModelQuery.safeParse({environment:"paper",[key]:"private"}).success).toBe(false);
  });
  it("publishes a shared consumer fixture separating source zero, absence and pending score",()=>{
    const rows=load("fixtures/execution-manager-dataset.rows.synthetic.valid.json");
    expect(rows.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(validate(rows.value),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.safeParse(rows.value).success).toBe(true);
    expect(rows.value.items[0].metrics.net_pnl.value).toBe("0");
    expect(rows.value.items[0].metrics.allocation.value).toBeNull();
    expect(rows.value.items[0].metrics.unrealized_pnl).toMatchObject({ value:null,availability:"UNAVAILABLE",reason_code:"METHODOLOGY_NOT_PUBLISHED" });
    expect(rows.value.items[0].economic_partitions[0].metrics.unrealized_pnl).toEqual(rows.value.items[0].metrics.unrealized_pnl);
    expect(rows.value.scores.direct_nav).toEqual({value:null,status:"policy_pending"});
  });
  it("pins a single economic environment and bounds page/query size",()=>{
    expect(managerModelQuery.safeParse({environment:"ALL"}).success).toBe(false);
    expect(managerModelQuery.safeParse({environment:"paper",limit:201}).success).toBe(false);
    expect(managerModelQuery.safeParse({environment:"paper",sort:[{field:"broker_secret",direction:"asc"}]}).success).toBe(false);
    expect(managerModelQuery.safeParse({environment:"paper",filters:[{field:"net_pnl",op:"GTE",value:"1e9"}]}).success).toBe(false);
    expect(managerModelQuery.safeParse({environment:"paper",after:"a",before:"b"}).success).toBe(false);
  });
  it("preserves exact decimals, UTC milliseconds and missing-not-zero semantics",()=>{
    const metric={value:"9007199254740993.000000000000000001",unit:"MONEY",currency:"USD",basis:"TEST_ONLY:net",window:{from_ms:0,to_ms:1},denominator:null,
      methodology_ref:"TEST_ONLY:method",availability:"AVAILABLE",reason_code:null,quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},source_confidence:"VERIFIED",
      provenance_refs:["TEST_ONLY:receipt"],calculation_revision:"TEST_ONLY:calc",policy_revision:"TEST_ONLY:policy"};
    const check=ajv.compile(api.components.schemas.ManagerMetric);
    expect(check(metric)).toBe(true); expect(managerMetric.parse(metric).value).toBe(metric.value);
    expect(check({...metric,value:1})).toBe(false);
    expect(managerMetric.safeParse({...metric,value:null}).success).toBe(false);
    expect(managerMetric.safeParse({...metric,value:null,availability:"UNAVAILABLE",reason_code:"SOURCE_NOT_PUBLISHED"}).success).toBe(true);
    expect(managerMetric.safeParse({...metric,currency:null}).success).toBe(false);
    expect(managerMetric.safeParse({...metric,window:{from_ms:1,to_ms:1}}).success).toBe(false);
  });
  it("has runtime/Ajv parity for authorized metric-key equality without requiring hidden money keys",()=>{
    const sample=load("fixtures/execution-manager-dataset.rows.synthetic.valid.json").value;
    expect(validate(sample),JSON.stringify(validate.errors)).toBe(true);
    const key=sample.query_options.metric_keys[0];
    const missing=structuredClone(sample);delete missing.items[0].metrics[key];
    const extra=structuredClone(sample);extra.items[0].metrics.score=structuredClone(sample.items[0].metrics.net_pnl);
    for(const invalid of [missing,extra]){
      expect(validate(invalid),JSON.stringify(validate.errors)).toBe(false);
      expect(managerDatasetResponse.safeParse(invalid).success).toBe(false);
    }
    const narrowed=structuredClone(sample);delete narrowed.items[0].metrics.allocation;
    narrowed.query_options.metric_keys=narrowed.query_options.metric_keys.filter((k:string)=>k!=="allocation");
    narrowed.query_options.sort_fields=narrowed.query_options.sort_fields.filter((k:string)=>k!=="allocation");
    narrowed.query_options.economic_partition_required_for=narrowed.query_options.economic_partition_required_for.filter((k:string)=>k!=="allocation");
    narrowed.query_options.window.independent_metrics=narrowed.query_options.window.independent_metrics.filter((k:string)=>k!=="allocation");
    expect(validate(narrowed),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.safeParse(narrowed).success).toBe(true);
    const nonMetric=structuredClone(sample.items[0]);nonMetric.metrics.name=structuredClone(nonMetric.metrics.net_pnl);
    expect(ajv.compile(api.components.schemas.ManagerDatasetRow)(nonMetric)).toBe(false);
    expect(managerDatasetRow.safeParse(nonMetric).success).toBe(false);
  });
  it("keeps selected ALL window absence and global summary reason identical in both validators",()=>{
    const sample=load("fixtures/execution-manager-dataset.all-window.synthetic.valid.json").value;
    expect(validate(sample),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.safeParse(sample).success).toBe(true);
    for(const patch of [{selected_window:null},{scores:{...sample.scores,raw:{value:"0",status:"window_not_published",reason_code:"ALL_HISTORY_WINDOW_NOT_PUBLISHED"}}},
      {scores:{...sample.scores,direct_nav:{value:null,status:"window_not_published",reason_code:"EXACT_METRIC_WINDOW_NOT_PUBLISHED"}}},
      {scores:{...sample.scores,reason_code:"RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED"}}]){
      const invalid={...sample,...patch};expect(validate(invalid)).toBe(false);
      expect(managerDatasetResponse.safeParse(invalid).success).toBe(false);
    }
  });
  it("publishes finite options with no duplicate, unauthorized stock or misleading ALL coverage",()=>{
    const sample=load("fixtures/execution-manager-dataset.rows.synthetic.valid.json").value.query_options;
    const check=ajv.compile(api.components.schemas.ManagerQueryOptions);
    expect(check(sample),JSON.stringify(check.errors)).toBe(true);
    expect(managerP1Options.safeParse(sample).success).toBe(true);
    const duplicate=structuredClone(sample);duplicate.metric_keys.push(duplicate.metric_keys[0]);
    const stock=structuredClone(sample);stock.window.independent_metrics.push("balance_total");
    const all=structuredClone(sample);all.window.presets[3]={...all.window.presets[3],data_state:"METRIC_SPECIFIC",reason_code:null};
    for(const invalid of [duplicate,stock,all]){
      expect(check(invalid)).toBe(false);expect(managerP1Options.safeParse(invalid).success).toBe(false);
    }
  });
  it("publishes exact current-only error while preserving six current named routes",()=>{
    expect(api.components.securitySchemes.PortalSession.name).toBe("__Host-portal_session");
    const check=ajv.compile(api.components.schemas.ManagerCurrentOnlyProblem);
    const problem={error:{code:"EXECUTION_READ_CURRENT_ONLY",message:"The requested Execution read is not available."},request_id:"TEST_ONLY:request"};
    expect(check(problem),JSON.stringify(check.errors)).toBe(true);
    expect(check({...problem,source_revision:"PRIVATE"})).toBe(false);
    expect(check({...problem,error:{...problem.error,code:"EXECUTION_READ_QUERY_INVALID"}})).toBe(false);
  });
  it("publishes the same exact search grammar in runtime and JSON (C4-R01)",()=>{
    const check=ajv.compile(api.components.schemas.ManagerDatasetQuery);
    for(const q of ["Alpha"," alpha ","ß","東京","name:/@"]){
      const query={environment:"paper",q};
      expect(check(query),JSON.stringify(check.errors)).toBe(true);
      expect(managerModelQuery.safeParse(query).success).toBe(true);
    }
    for(const q of [""," ","\u00a0","\n","x\n","x\u0000y","x\u007fy"]){
      const query={environment:"paper",q};
      expect(check(query),JSON.stringify(check.errors)).toBe(false);
      expect(managerModelQuery.safeParse(query).success).toBe(false);
    }
    for(const query of [{environment:"paper",q_mode:"PREFIX"},{environment:"paper",stage_filter:["LIVE"]},
      {environment:"paper",q:"Alpha",private_source:"PRIVATE"}]){
      expect(check(query),JSON.stringify(check.errors)).toBe(false);
      expect(managerModelQuery.safeParse(query).success).toBe(false);
    }
    // UTF-8 roundtrip/JS UTF-16 length and interval arithmetic remain runtime-only checks.
    expect(managerModelQuery.safeParse({environment:"paper",q:"\ud800"}).success).toBe(false);
    expect(managerModelQuery.safeParse({environment:"paper",window:{from_ms:1,to_ms:1}}).success).toBe(false);
    for(const window of ["7D","30D","90D","ALL",{from_ms:0,to_ms:1}]){
      const query={environment:"paper",window};expect(check(query),JSON.stringify(check.errors)).toBe(true);
      expect(managerModelQuery.safeParse(query).success).toBe(true);
    }
    for(const name of ["q","q_mode","window"])for(const path of [
      "/api/v1/execution/manager/fund-overview","/api/v1/execution/manager/fleet",
      "/api/v1/execution/manager/portfolios/{id}/overview","/api/v1/execution/manager/alphas/{id}/overview",
      "/api/v1/execution/manager/accounts/{id}/overview","/api/v1/execution/manager/deployments/{id}/overview"]){
      const parameter=api.paths[path].get.parameters.find((p:any)=>p.name===name);
      expect(parameter).toBeDefined();
      if(name==="window")expect(parameter.content["application/json"].schema).toEqual(api.components.schemas.ManagerDatasetQuery.properties.window);
      for(const status of [200,400,401,404,409,503])
        expect(api.paths[path].get.responses[status].headers["Cache-Control"].schema.const).toBe("private, no-store");
    }
  });
  it("builds canonical TEST_ONLY fixture options from the same explicit synthetic context",()=>{
    for(const name of ["execution-manager-dataset.synthetic.valid.json","execution-manager-dataset.rows.synthetic.valid.json"]){
      const sample=load("fixtures/"+name).value,options=sample.query_options;
      expect(options).toEqual(managerP1NoFactsSyntheticOptions({asOf:sample.as_of_ms,
        canSearchName:options.search.fields.includes("name"),sortFields:options.sort_fields,
        groupFields:options.group_fields,metricKeys:options.metric_keys}));
    }
  });
});
