import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { managerDatasetResponse, managerMetric, managerModelQuery, managerScorePublication } from "../../../apps/control-api/src/execution-v2/manager-model.contract";
const root = resolve(__dirname,"..");
const load = (file:string) => JSON.parse(readFileSync(resolve(root,file),"utf8"));
const api = load("openapi/execution-manager-models.openapi.json");
const schema = load("schemas/execution-manager-dataset.v1.schema.json");
const fixture = load("fixtures/execution-manager-dataset.synthetic.valid.json");
const ajv = new Ajv2020({strict:true,allErrors:true});
const validate = ajv.compile(schema);
describe("ELP2-06 generated named Manager BFF contract",()=>{
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
  it("publishes exactly six named reads and one identical Zod/public DTO",()=>{
    expect(Object.keys(api.paths)).toHaveLength(6);
    expect(new Set(Object.values(api.paths).map((p:any)=>p.get.operationId)).size).toBe(6);
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
});
