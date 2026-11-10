import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { managerDatasetResponse, managerMetric, managerResponseMetric, managerModelQuery, managerQuality, managerScorePublication,managerCompositionPublication } from "../../../apps/control-api/src/execution-v2/manager-model.contract";
import { managerRegimePublication } from "../../../apps/control-api/src/execution-v2/manager-regime-publication.contract";
import { managerScoreRevisionView, managerScoreRevisionHistory } from "../../../apps/control-api/src/execution-v2/manager-score-revision.contract";
import { canonicalManagerZero, managerResponseDecimal, MANAGER_CANONICAL_DECIMAL_PATTERN } from "../../../apps/control-api/src/execution-v2/manager-dataset-invariants";
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
  it("publishes bounded typed IN with exclusive value/values shapes and no duplicate members",()=>{
    const sample=load("fixtures/execution-manager-query-in.synthetic.valid.json");
    const check=ajv.compile(api.components.schemas.ManagerDatasetQuery);
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    for(const query of sample.cases){expect(check(query),JSON.stringify(check.errors)).toBe(true);expect(managerModelQuery.safeParse(query).success).toBe(true);}
    for(const filter of [{field:'health',op:'IN',values:[]},{field:'health',op:'IN',values:['a','a']},
      {field:'health',op:'IN',values:['a'],value:'a'},{field:'health',op:'EQ',values:['a']},
      {field:'health',op:'IS_NULL',values:['a']},
      {field:'health',op:'IN',values:Array.from({length:33},(_,i)=>String(i))}]){
      const query={environment:'paper',filters:[filter]};
      expect(check(query)).toBe(false);expect(managerModelQuery.safeParse(query).success).toBe(false);
    }
  });
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
    expect(managerModelQuery.safeParse({environment:"EVERYWHERE"}).success).toBe(false);
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

/** BE-P1 (UXM-07 conformance matrix MD-1..MD-8): what JSON Schema says and what only the producer's Zod refinement says. */
describe("BE-P1 Manager dataset producer invariants: schema part and runtime part", () => {
  const rows = load("fixtures/execution-manager-dataset.rows.synthetic.valid.json").value;
  const clone = <T,>(value:T):T => structuredClone(value);
  const part = (currency:string,tag:string) => ({economic_domain:"PAPER",currency,basis:"TEST_ONLY:net-ledger",
    native_profile_ref:`TEST_ONLY:paper-ledger-${tag}`,domain_proof_ref:"TEST_ONLY:not-economic-authority"});
  function rich() {
    const body = clone(rows), rowA = body.items[0], rowB = clone(rowA);
    rowB.row_key = '["TEST_ONLY:alpha-b","TEST_ONLY:av-b","TEST_ONLY:portfolio"]';
    rowB.alpha_id = "TEST_ONLY:alpha-b"; rowB.alpha_version_id = "TEST_ONLY:av-b";
    Object.assign(rowB.children[0],{alpha_id:"TEST_ONLY:alpha-b",alpha_version_id:"TEST_ONLY:av-b",deployment_id:"TEST_ONLY:deployment-b"});
    const usdt = clone(rowA.metrics.net_pnl), eur = {...clone(rowA.metrics.net_pnl),currency:"EUR",value:"-12.5"};
    const none = {...clone(rowA.metrics.allocation),reason_code:"MULTI_CURRENCY_NO_SINGLE_TOTAL"};
    rowB.metrics.net_pnl = clone(none); rowB.metrics.unrealized_pnl = clone(none);
    rowB.economic_partitions = [{partition:part("USDT","usdt"),metrics:{net_pnl:usdt}},{partition:part("EUR","eur"),metrics:{net_pnl:eur}}];
    body.items = [rowA,rowB];
    body.page = {limit:100,returned_count:2,authorized_filtered_count:2,next_cursor:null,previous_cursor:null};
    body.groups = [{key:[{field:"portfolio_id",value:"TEST_ONLY:portfolio"}],unique_row_count:2,totals_scope:"FULL_AUTHORIZED_FILTERED_QUERY",
      economic_partitions:[{partition:part("USDT","usdt"),metrics:{net_pnl:clone(usdt)}},{partition:part("EUR","eur"),metrics:{net_pnl:clone(eur)}}]}];
    body.capital_statements = [{partition:part("USDT","usdt"),metrics:{balance_total:clone(usdt)}},
      {partition:part("EUR","eur"),metrics:{balance_total:clone(eur)}}];
    return body;
  }
  const both = (body:unknown) => ({schema:validate(body),runtime:managerDatasetResponse.safeParse(body).success});
  it("accepts the rich two-currency page in both validators", () => {
    const body = rich();
    expect(validate(body),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.safeParse(body).success).toBe(true);
  });
  // The schema AND the producer refuse these: the finite part of MD-1/3/4/6/7.
  it.each([
    ["MD-1 empty page with a count", (b:any) => { b.items = []; b.groups = []; }],
    ["MD-1 rows with a zero count", (b:any) => { b.page.returned_count = 0; }],
    ["MD-3 a partition object repeated in capital_statements", (b:any) => { b.capital_statements.push(clone(b.capital_statements[0])); }],
    ["MD-3 a partition object repeated in a row", (b:any) => { b.items[1].economic_partitions.push(clone(b.items[1].economic_partitions[0])); }],
    ["MD-3 a partition object repeated in a group", (b:any) => { b.groups[0].economic_partitions.push(clone(b.groups[0].economic_partitions[0])); }],
    ["MD-4 an unpublished preset that carries a window", (b:any) => { b.query_options.window.presets[0].resolved = {from_ms:1,to_ms:2}; }],
    ["MD-6 a row repeated", (b:any) => { b.items.push(clone(b.items[0])); b.page.returned_count = 3; b.page.authorized_filtered_count = 3; }],
    ["MD-6 a group repeated", (b:any) => { b.groups.push(clone(b.groups[0])); }],
    ["MD-7 a group over a non-groupable field", (b:any) => { b.groups[0].key[0].field = "name"; }],
    ["MD-7 a field twice in one group key", (b:any) => { b.groups[0].key.push({field:"portfolio_id",value:"x"}); }],
  ])("%s is refused by the schema and by the producer", (_name,change) => {
    const body = rich(); change(body);
    expect(both(body)).toEqual({schema:false,runtime:false});
  });
  // JSON Schema cannot state these (equality of two fields, identity inside a list): only the producer refuses them.
  it.each([
    ["MD-1 returned_count below the rows", (b:any) => { b.page.returned_count = 1; }],
    ["MD-1 returned_count above the limit", (b:any) => { b.page.limit = 1; }],
    ["MD-1 more rows than the filtered query", (b:any) => { b.page.authorized_filtered_count = 1; b.page.next_cursor = "n"; }],
    ["MD-1 no cursor but fewer rows than the filtered query", (b:any) => { b.page.authorized_filtered_count = 5; }],
    ["MD-2 a EUR figure inside a USDT partition", (b:any) => { b.capital_statements[0].metrics.balance_total.currency = "EUR"; }],
    ["MD-3 the same partition identity with another proof and figure", (b:any) => { const twin = clone(b.capital_statements[0]); twin.partition.domain_proof_ref = "TEST_ONLY:other"; twin.metrics.balance_total.value = "1"; b.capital_statements.push(twin); }],
    ["MD-6 a row_key shared by two different rows", (b:any) => { b.items[1].row_key = b.items[0].row_key; }],
    ["MD-7 more unique rows in a group than the filtered query", (b:any) => { b.groups[0].unique_row_count = 10; }],
    ["MD-7 a group over a field the options do not offer", (b:any) => { b.query_options.sort_fields = b.query_options.sort_fields.filter((k:string) => k !== "venue"); b.query_options.group_fields = b.query_options.group_fields.filter((k:string) => k !== "venue"); b.groups[0].key[0].field = "venue"; }],
    ["MD-8 a USDT headline above a EUR partition", (b:any) => { b.items[1].metrics.net_pnl = {...clone(b.items[0].metrics.net_pnl),value:"1"}; }],
  ])("%s is refused by the producer only (the schema is silent, the description says it)", (_name,change) => {
    const body = rich(); change(body);
    expect(both(body)).toEqual({schema:true,runtime:false});
  });
  it("publishes a canonical positive partition example and canonical negative cases that both validators judge as stated", () => {
    const positive = load("fixtures/execution-manager-dataset.partitions.synthetic.valid.json"), negative = load("fixtures/execution-manager-dataset.invariants.synthetic.negative.json");
    expect(positive.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT"); expect(negative.lane).toBe(positive.lane);
    expect(negative.base).toBe("execution-manager-dataset.partitions.synthetic.valid.json");
    expect(validate(positive.value),JSON.stringify(validate.errors)).toBe(true);
    expect(managerDatasetResponse.parse(positive.value)).toEqual(positive.value);
    // Two currencies stay in two partitions; the mixed row publishes no headline money figure.
    expect(positive.value.items[1].economic_partitions.map((p:any) => p.partition.currency)).toEqual(["USDT","EUR"]);
    expect(positive.value.items[1].metrics.net_pnl).toMatchObject({value:null,currency:null,reason_code:"MIXED_ECONOMIC_DOMAINS"});
    const apply = (ops:any[]) => {
      const body = clone(positive.value), at = (path:any[]) => path.reduce((node,key) => node[key],body);
      for (const op of ops) {
        const parent = at(op.path.slice(0,-1)), key = op.path.at(-1);
        if (op.op === "set") parent[key] = clone(op.value); else if (op.op === "delete") delete parent[key];
        else if (op.op === "append") parent[key].push(clone(op.value)); else if (op.op === "append_copy") parent[key].push(clone(at(op.from)));
        else if (op.op === "set_copy") parent[key] = clone(at(op.from)); else throw new Error(op.op);
      }
      return body;
    };
    expect(negative.cases.map((c:any) => c.gap).filter((gap:string,i:number,all:string[]) => all.indexOf(gap) === i).sort()).toEqual(["MD-1","MD-2","MD-3","MD-4","MD-5","MD-6","MD-7","MD-8"]);
    for (const c of negative.cases) {
      const body = apply(c.ops), runtime = managerDatasetResponse.safeParse(body);
      expect(runtime.success,c.id).toBe(false);
      expect(!runtime.success && runtime.error.issues.some(i => i.message === c.code || i.code === c.code),c.id).toBe(true);
      expect(validate(body),c.id).toBe(c.refused_by === "PRODUCER_ONLY");
    }
  });
  it("UXM-07 WP-2: the optional per-metric effective_at_ms is a UTC-ms integer in both validators, ordered funds before budget before allocation, and absent where the source published none", () => {
    const sample = load("fixtures/execution-manager-dataset.statement-times.synthetic.valid.json");
    expect(sample.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(both(sample.value)).toEqual({schema:true,runtime:true});
    const m = sample.value.capital_statements[0].metrics;
    expect(m.added_funds).not.toHaveProperty("effective_at_ms");
    const when = (key:string) => m[key].effective_at_ms as number;
    expect(when("initial_funds")).toBeLessThan(when("returned_capital"));
    expect(when("returned_capital")).toBeLessThan(when("current_budget"));
    expect(when("current_budget")).toBeLessThan(when("allocation"));
    expect(when("allocation")).toBeLessThan(sample.value.as_of_ms);
    // A budget is a limit: never above the net funded capital; allocated + headroom closes on it.
    expect(BigInt(m.current_budget.value)).toBeLessThanOrEqual(BigInt(m.net_external_flows.value));
    expect(BigInt(m.allocation.value) + BigInt(m.headroom.value)).toBe(BigInt(m.current_budget.value));
    for (const bad of [-1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
      const body = clone(sample.value); body.capital_statements[0].metrics.initial_funds.effective_at_ms = bad;
      expect(both(body), String(bad)).toEqual({schema:false,runtime:false});
    }
  });
  it("accepts the pinned-partition headline and a past-the-end empty page", () => {
    const pinned = rich(); pinned.items[1].metrics.net_pnl = clone(pinned.items[1].economic_partitions[1].metrics.net_pnl);
    expect(both(pinned)).toEqual({schema:true,runtime:true});
    const empty = clone(fixture.value); empty.page = {limit:2,returned_count:0,authorized_filtered_count:4,next_cursor:null,previous_cursor:null};
    expect(both(empty)).toEqual({schema:true,runtime:true});
  });
  it("accepts a published preset with a window and refuses the unpublished one with bounds in the options component too", () => {
    const check = ajv.compile(api.components.schemas.ManagerQueryOptions), options = clone(rows.query_options);
    expect(check(options),JSON.stringify(check.errors)).toBe(true);
    const published = clone(options);
    published.window.presets[1] = {...published.window.presets[1],data_state:"METRIC_SPECIFIC",resolved:{from_ms:1,to_ms:2592000001},reason_code:null};
    expect(check(published)).toBe(true); expect(managerP1Options.safeParse(published).success).toBe(true);
    const bounded = clone(options); bounded.window.presets[0].resolved = {from_ms:1,to_ms:2};
    expect(check(bounded)).toBe(false); expect(managerP1Options.safeParse(bounded).success).toBe(false);
  });
  // MD-5 (owner decision C, 2026-10-20): canonical zero on emit. A body that carries a signed zero is refused by BOTH validators;
  // a non-zero negative, a positive zero and a scaled positive zero are not touched.
  it.each(["-0","-0.0","-0.00","-0.000000000000000000"])("MD-5 refuses %s on every manager decimal of the response in both validators", zero => {
    const paths: Array<[string,(b:any)=>any]> = [
      ["row headline value",b=>b.items[0].metrics.net_pnl],["row partition value",b=>b.items[0].economic_partitions[0].metrics.net_pnl],
      ["group partition value",b=>b.groups[0].economic_partitions[0].metrics.net_pnl],["capital statement value",b=>b.capital_statements[0].metrics.balance_total]];
    for (const [name,metric] of paths) for (const key of ["value","denominator"]) {
      const body = rich(), target = metric(body); target[key] = zero;
      const issues = managerDatasetResponse.safeParse(body); 
      expect(issues.success,name+" "+key).toBe(false);
      expect(!issues.success && issues.error.issues.some(i => i.message === "MANAGER_DECIMAL_NEGATIVE_ZERO"),name+" "+key).toBe(true);
      expect(validate(body),name+" "+key).toBe(false);
    }
    const summary = rich(); summary.scores.raw = {value:zero,status:"available"};
    expect(both(summary)).toEqual({schema:false,runtime:false});
  });
  it("MD-5 leaves every other decimal alone: positive zero at any scale, a non-zero negative, a non-zero with trailing zeros", () => {
    for (const value of ["0","0.0","0.00","-0.01","-0.10","-1","-10","-10.00","-0.000000000000000001","100.0000000000000001"]) {
      const body = rich(); body.items[0].metrics.net_pnl.value = value; body.items[0].economic_partitions[0].metrics.net_pnl.value = value;
      expect(both(body),value).toEqual({schema:true,runtime:true});
    }
  });
  it("MD-5 does not widen what a SOURCE document may say: the metric admitted from a source still accepts -0", () => {
    const metric = {...rich().items[0].metrics.net_pnl, value:"-0.00"};
    expect(managerMetric.safeParse(metric).success).toBe(true);
    expect(managerResponseMetric.safeParse(metric).success).toBe(false);
    // The published ManagerMetric is the response form; a query filter value is still the plain exact decimal.
    expect(ajv.compile(api.components.schemas.ManagerMetric)(metric)).toBe(false);
    const query = ajv.compile(api.components.schemas.ManagerDatasetQuery);
    const filter = {environment:"paper",filters:[{field:"net_pnl",op:"EQ",value:"-0"}],
      economic_partition:{economic_domain:"PAPER",currency:"USDT",basis:"TEST_ONLY:net-ledger",native_profile_ref:"TEST_ONLY:paper",domain_proof_ref:"TEST_ONLY:proof"}};
    expect(query(filter),JSON.stringify(query.errors)).toBe(true); expect(managerModelQuery.safeParse(filter).success).toBe(true);
  });
  it("MD-5 publishes the rule on every canonical decimal and the emit examples agree with the function", () => {
    const negative = load("fixtures/execution-manager-dataset.invariants.synthetic.negative.json");
    for (const {source,emitted} of negative.emit_examples) {
      expect(canonicalManagerZero(source),source).toBe(emitted); expect(canonicalManagerZero(emitted),emitted).toBe(emitted);
      expect(managerResponseDecimal.safeParse(emitted).success,emitted).toBe(true);
      expect(new RegExp(MANAGER_CANONICAL_DECIMAL_PATTERN.source).test(emitted)).toBe(true);
    }
    const value = api.components.schemas.ManagerMetric.properties.value.anyOf[0];
    expect(value.pattern).toBe(MANAGER_CANONICAL_DECIMAL_PATTERN.source); expect(value.description).toMatch(/Canonical zero/);
    expect(api.components.schemas.ManagerDataset.properties.scores.properties.raw.properties.value.anyOf[0].pattern).toBe(value.pattern);
    // The sealed publications are passed through verbatim and keep the plain decimal.
    expect(JSON.stringify(api.components.schemas.ManagerScorePublication)).not.toContain(value.pattern);
  });
  it("publishes the rule text where the schema cannot check it", () => {
    const response = api.components.schemas.ManagerDataset.properties;
    for (const text of [response.page.description,response.items.description,response.groups.description,response.capital_statements.description])
      expect(typeof text).toBe("string");
    expect(response.page.description).toMatch(/returned_count is items\.length/);
    expect(response.capital_statements.uniqueItems).toBe(true);
    expect(response.items.items.properties.metrics.description).toMatch(/exactly one partition/);
  });
});
