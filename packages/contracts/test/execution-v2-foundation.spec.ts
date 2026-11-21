import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,it,expect} from "vitest";
import {parsePmaCapitalWire,serializePmaCapitalWire,assertAmountPartition,browserCapitalIntent,pmCounter,utcMilliseconds}
  from "../../../apps/control-api/src/execution-v2/foundation.contract";
import {pmText,resolveResourceAlias,edgeMetadataToBrowser,parseLegacyUtcMilliseconds,legacyGenerationDisposition,legacyEnvironmentToCanonical}
  from "../../../apps/control-api/src/execution-v2/foundation.contract";
const root=resolve(__dirname,"..");
const load=(path:string)=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const schema=load("schemas/execution-v2-foundation.v1.schema.json");
const fixtures=load("fixtures/execution-v2-foundation.synthetic.valid.json");
const ajv=new Ajv2020({strict:true,allErrors:true}); ajv.addSchema(schema);
const validates=(type:string,value:unknown)=>{
  const validate=ajv.getSchema(`${schema.$id}#/$defs/${type}`)!;
  if(!validate) throw new Error(`Unknown fixture schema ${type}`);
  return validate(value);
};
const find=(id:string,type:string)=>structuredClone(fixtures.cases.find((c:any)=>c.id===id).facts.find((f:any)=>f.type===type&&f.valid).value);
describe("ELP2-01 authority foundation",()=>{
  it.each(fixtures.cases)("canonical $id — $title",(entry:any)=>{
    expect(fixtures.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT"); expect(fixtures.production_config).toBe(false);
    for(const fact of entry.facts) expect(validates(fact.type,fact.value),`${entry.id}/${fact.type}`).toBe(fact.valid);
    expect(entry.invariants.length).toBeGreaterThan(0);
  });
  it("T01-01 decimal/null exact round-trip and amount partition",()=>{
    const value="9007199254740993.000000000000000001";
    expect(validates("Decimal",value)).toBe(true); expect(JSON.parse(JSON.stringify({value})).value).toBe(value);
    for(const invalid of [1.2,"1e3","01.2",NaN]) expect(validates("Decimal",invalid)).toBe(false);
    const metric=find("FX-11","MetricCapsule"); expect(validates("MetricCapsule",{...metric,value:null})).toBe(true);
    expect(validates("MetricCapsule",{...metric,value:0})).toBe(false);
    assertAmountPartition({requested:value,applied:"9007199254740993",pending:"0.000000000000000001",cancelled:"0",rejected:"0"});
    expect(()=>assertAmountPartition({requested:"0.3",applied:"0.1",pending:"0.1",cancelled:"0",rejected:"0"})).toThrow("PARTITION");
  });
  it("T01-02 UTC safe integers and lossless PM int64 counter boundary",()=>{
    for(const v of [0,Number.MAX_SAFE_INTEGER]) {expect(validates("UtcMilliseconds",v)).toBe(true); expect(utcMilliseconds.safeParse(v).success).toBe(true);}
    for(const v of [-1,0.1,Number.MAX_SAFE_INTEGER+1,"2026-01-01"]) {expect(validates("UtcMilliseconds",v)).toBe(false);expect(utcMilliseconds.safeParse(v).success).toBe(false);}
    for(const v of ["0","9223372036854775807","9007199254740993","9223372036854775806"]){expect(validates("PmCounter",v),v).toBe(true);expect(pmCounter.safeParse(v).success).toBe(true);}
    for(const v of ["9223372036854775808","9999999999999999999","00",1,"-1","1.0"]){expect(validates("PmCounter",v),String(v)).toBe(false);expect(pmCounter.safeParse(v).success).toBe(false);}
  });
  it("T01-03 browser actor/context/proxy spoofing is rejected",()=>{
    const intent={schema_version:"execution.capital-intent.v2",workspace_id:"test:workspace",resource:{kind:"DEPLOYMENT",id:"D1"},environment:"live",expected_policy_revision:"r1",business_payload:find("FX-04","PmaCapitalCommand")};
    expect(browserCapitalIntent.safeParse(intent).success).toBe(true);
    for(const field of ["actor","human","workload","relation","url","jwt","mtls","sql","policy_revision"])
      expect(browserCapitalIntent.safeParse({...intent,[field]:"spoof"}).success,field).toBe(false);
    expect(()=>parsePmaCapitalWire({...intent.business_payload,actor:"Bobby"})).toThrow();
  });
  it("T01-04 scope/currency/mode and exact conditional PM fields",()=>{
    const body=find("FX-04","PmaCapitalCommand");expect(parsePmaCapitalWire(body).currency).toBe("USDT");
    for(const mutate of [{recipient_kind:"ROOT"},{recipient_deployment_id:undefined},{expected_versions:{budget:"0"}},{amount:"0"},{amount:"-1"},{amount:2},{environment:"live"}]){
      expect(validates("PmaCapitalCommand",{...body,...mutate})).toBe(false);
      expect(()=>parsePmaCapitalWire({...body,...mutate})).toThrow();
    }
    expect(validates("Environment","CANARY")).toBe(false);expect(validates("FinancialStage","ALL")).toBe(false);
  });
  it("T01-05 PM HTTP payload unchanged, component is not adapter activation",()=>{
    const body=find("FX-04","PmaCapitalCommand");const serialized=serializePmaCapitalWire(body);
    expect(JSON.parse(serialized)).toEqual(body); expect(serialized).toContain('"9223372036854775807"');expect(serialized).toContain('"500.00"');
    expect(()=>parsePmaCapitalWire({...body,command_scope:"legacy-example"})).toThrow();
    expect(()=>parsePmaCapitalWire({...body,operation:"RETURN_CAPITAL",expected_versions:{budget:"0"}})).toThrow();
    expect(validates("PmaAdapterReadiness",{operation:"RETURN_CAPITAL",component_supported:true,candidate_supported:false,runtime_enabled:false,reason_code:"ADAPTER_UNAVAILABLE"})).toBe(true);
    for(const bad of [" leading","trailing ","bad\ntext","bad\u007ftext","\u0085padding","😀".repeat(129),"a".repeat(513)]) expect(pmText.safeParse(bad).success).toBe(false);
    for(const good of ["a".repeat(512),"😀".repeat(128),"Bobby · approved reason"]) expect(pmText.safeParse(good).success).toBe(true);
    expect(()=>serializePmaCapitalWire({...body,reason:"😀".repeat(129)})).toThrow();
  });
  it("T01-06 human/workload identity cannot be interchanged or self-verified",()=>{
    const human=find("FX-01","HumanIdentity");const workload={workload_ref:"test:service",audience:"pma.management.v1",delegation_ref:null};
    expect(validates("WorkloadIdentity",workload)).toBe(true);expect(validates("HumanIdentity",workload)).toBe(false);expect(validates("WorkloadIdentity",human)).toBe(false);
    expect(validates("HumanIdentity",{...human,ts_user_id:null})).toBe(false);
    expect(validates("HumanIdentity",{...human,mapping_state:"UNMAPPED",ts_user_id:null})).toBe(true);
    const workloadContext={workload_ref:"service",audience:"pma.management.v1",delegation_ref:"accepted:delegation",workload_scopes:["budget.manage"]};
    expect(validates("TrustedWorkloadContext",workloadContext)).toBe(true);
    for(const bad of [{audience:"execution.read"},{delegation_ref:null},{workload_scopes:[]}]) expect(validates("TrustedWorkloadContext",{...workloadContext,...bad})).toBe(false);
    expect(validates("TrustedHumanContext",human)).toBe(false);
  });
  it("T01-07 source/generation/quality clocks remain separate and required",()=>{
    const event=find("FX-08","StreamEnvelope");expect(event.source_continuity_epoch).not.toBe(event.projection_generation);
    expect(event.quality.source_as_of_ms).toBeNull();expect(event.source_observed_at_ms).toBeNull();
    const {source_continuity_epoch,...missing}=event;expect(validates("StreamEnvelope",missing)).toBe(false);
    expect(validates("StreamEnvelope",{...event,emitted_at_ms:"today"})).toBe(false);
    expect(validates("Quality",{...event.quality,freshness:"AVAILABLE"})).toBe(false);
  });
  it("T01-08 IDs remain opaque, names/aliases do not become canonical identities",()=>{
    expect(validates("ResourceRef",{kind:"ALPHA",id:"alpha@v1/opaque:part"})).toBe(true);
    expect(validates("ResourceRef",{kind:"ALPHA",name:"Delta RSI"})).toBe(false);
    expect(validates("ResourceRef",{kind:"ALPHA",id:""})).toBe(false);
    const a=find("FX-02","Binding"),b=fixtures.cases[1].facts[1].value;
    expect(a.alpha_id).toBe(b.alpha_id);expect([a.alpha_id,a.alpha_version_id,a.portfolio_id]).not.toEqual([b.alpha_id,b.alpha_version_id,b.portfolio_id]);
    const ambiguous=resolveResourceAlias("ALPHA","Delta@legacy","mapping:r1",["alpha:1","alpha:2"]);
    expect(ambiguous.state).toBe("AMBIGUOUS");expect(ambiguous.canonical).toBeNull();expect(validates("AliasResolution",ambiguous)).toBe(true);
    const resolved=resolveResourceAlias("ALPHA","Delta@legacy","mapping:r1",["alpha:1","alpha:1"]);
    expect(resolved.mapping_revision).toBe("mapping:r1");expect(validates("AliasResolution",resolved)).toBe(true);
  });
  it("T01-09 additive Edge/legacy/browser mapping is explicit, no mounted routes implied",()=>{
    const spec=load("openapi/execution-v2-foundation.openapi.json"); expect(spec.paths).toEqual({});
    expect(spec.components.schemas.StreamEnvelope.properties.contract_version.const).toBe("edge.v1");
    expect(spec.components.schemas.ManagerPortfolio.properties.schema_version.const).toBe("execution.manager-portfolio.v2");
    const dictionary=readFileSync(resolve(root,"../../upgrade/execution_loop/evidence/ELP2-01/contract-map.md"),"utf8");
    for(const item of ["current-source.proxy.ts","manager-lists/contracts.ts","execution-v2-foundation.d.ts","CONTRACT_ONLY","retained"]) expect(dictionary).toContain(item);
    const generated=readFileSync(resolve(root,"generated/execution-v2-foundation.d.ts"),"utf8");
    for(const name of Object.keys(schema.$defs)) expect(generated).toContain(`${name}:`);
    const edge=find("FX-08","StreamEnvelope");
    const context={snapshot_id:"snap:1",dataset:"portfolio_overview",produced_at_ms:edge.emitted_at_ms+100,
      received_at_ms:edge.emitted_at_ms+10,projection:{kind:"REUSED_EDGE" as const,generation:edge.projection_generation,lineage_ref:null},coverageProof:null};
    const browser=edgeMetadataToBrowser(edge,context);
    expect(validates("BrowserSnapshotMetadata",browser)).toBe(true);expect(browser.schema_version).toBe("portal.snapshot.v1");
    expect(browser.versions.source_continuity_epoch).toBe(edge.source_continuity_epoch);
    expect(browser.produced_at_ms).not.toBe(edge.emitted_at_ms);expect(browser.facts_through_ms).toBeNull();expect(browser.recorded_through_ms).toBeNull();
    expect(browser.quality.completeness).toBe("UNRESOLVED");
    expect(()=>edgeMetadataToBrowser({...edge,quality:{...edge.quality,freshness:"fresh"}},context)).toThrow();
    expect(()=>edgeMetadataToBrowser(edge,{...context,projection:{...context.projection,generation:"other"}})).toThrow("GENERATION_MISMATCH");
    expect(()=>edgeMetadataToBrowser(edge,{...context,coverageProof:{source_set_ref:"other",as_of_ms:edge.as_of_ms,facts_through_ms:edge.as_of_ms,recorded_through_ms:edge.as_of_ms}})).toThrow("PROOF_MISMATCH");
    expect(parseLegacyUtcMilliseconds("2024-01-01T01:00:00+01:00")).toBe(1704067200000);
    for(const bad of ["2024-01-01T00:00:00","2024-01-01T00:00:00.000001Z","2024-02-30T00:00:00Z"])expect(()=>parseLegacyUtcMilliseconds(bad)).toThrow();
    expect(legacyGenerationDisposition("7").state).toBe("UNAVAILABLE");
    expect(()=>legacyEnvironmentToCanonical("DEMO")).toThrow("VERIFIED_DEMO_MAPPING_REQUIRED");
    expect(legacyEnvironmentToCanonical("DEMO",{canonical:"sandbox",native_profile_ref:"native:demo",mapping_receipt_ref:"test:verified-mapping"})).toBe("sandbox");
    expect(()=>legacyEnvironmentToCanonical("CANARY")).toThrow();
  });
  it("T01-10 environment, financial stage, lifecycle and domain are disjoint",()=>{
    const b=find("FX-02","Binding");for(const bad of [{financial_stage:"ARCHIVED"},{lifecycle:"PAPER"},{environment:"CANARY"},{environment:"paper"},{economic_domain:"PAPER_SIMULATION"}])expect(validates("Binding",{...b,...bad})).toBe(false);
    expect(validates("Binding",{...b,lifecycle:"ARCHIVED"})).toBe(true);
  });
  it("T01-11 metric capsule, field catalogue and revision types are strict",()=>{
    const metric=find("FX-11","MetricCapsule");expect(validates("MetricCapsule",{...metric,denominator:"0",value:null})).toBe(true);
    expect(validates("MetricCapsule",{...metric,calculation_revision:1})).toBe(false);
    const field={field_id:"nav",scalar_type:"DECIMAL",unit:"MONEY",visible_in:["MANAGER"],sortable:true,filter_operators:["GTE"],required_capability:"business.read",methodology_revision:null};
    expect(validates("FieldCatalogueEntry",field)).toBe(true);expect(validates("FieldCatalogueEntry",{...field,filter_operators:["SQL"]})).toBe(false);
    expect(validates("FieldCatalogueEntry",{...field,expression:"sum(hidden_nav)"})).toBe(false);
    expect(validates("ScoreCapsule",{...find("FX-18","ScoreCapsule"),model_revision:"legacy_hhi"})).toBe(false);
    expect(validates("MetricCapsule",{...metric,availability:{state:"AVAILABLE",reason_code:null},value:null})).toBe(false);
    expect(validates("MetricCapsule",{...metric,currency:null})).toBe(false);
    expect(validates("MetricCapsule",{...metric,unit:"PERCENT",denominator:"0"})).toBe(false);
    expect(validates("MetricCapsule",{...metric,domain_proof:null})).toBe(false);
  });
  it("T01-12 manager payload cannot be laundered into restricted researcher schema",()=>{
    const restricted=find("FX-14","RestrictedPortfolio"),manager=find("FX-13","ManagerPortfolio");
    expect(validates("RestrictedPortfolio",restricted)).toBe(true);expect(validates("RestrictedPortfolio",manager)).toBe(false);
    for(const key of ["nav","peers","total","rank","group_total","physical_balance"])expect(validates("RestrictedPortfolio",{...restricted,[key]:"hidden"})).toBe(false);
  });
  it("T01-13 fixed weights/bands are pinned; missing numeric facts stay null",()=>{
    const policy=find("FX-25","ScorePolicy");
    for(const bad of [{weights:{...policy.weights,P:"0.5"}},{runtime_config_state:"APPROVED"},{runtime_config_ref:"fixture"},{bands:[...policy.bands].reverse()}]) expect(validates("ScorePolicy",{...policy,...bad})).toBe(false);
    const pending=find("FX-22","ScoreCapsule");expect(validates("ScoreCapsule",{...pending,value:"0"})).toBe(false);
    const contribution=fixtures.cases.find((c:any)=>c.id==="FX-18").facts[1].value;
    expect(validates("ScoreCapsule",{...contribution,quality_band:"weak"})).toBe(false);
    const sample=find("FX-18","ScoreCapsule");
    for(const [value,quality_band] of [["0","weak"],["39.999999999999999999","weak"],["40","neutral"],["59.999","neutral"],["60","fair"],["74.999999999999999999","fair"],["75","good"],["89.999","good"],["90","very_good"],["100.000","very_good"]]){
      expect(validates("ScoreCapsule",{...sample,value,quality_band}),`${value}/${quality_band}`).toBe(true);
      expect(validates("ScoreCapsule",{...sample,value,quality_band:quality_band==="weak"?"neutral":"weak"})).toBe(false);
    }
    for(const value of ["-1","100.0001","1000"])expect(validates("ScoreCapsule",{...sample,value})).toBe(false);
    expect(validates("ScoreCapsule",{...sample,status:"partial_coverage",value:null,quality_band:null,reason_code:"missing"})).toBe(false);
  });
  it("T01-14 requested/effective windows and economic/research bindings are independent",()=>{
    const manager=find("FX-22","ManagerPortfolio");const direct={...manager.direct_nav_score,research_binding_ref:null};
    expect(validates("ScoreCapsule",direct)).toBe(true);expect(validates("ManagerPortfolio",{...manager,direct_nav_score:direct})).toBe(true);
    expect(validates("ScorePolicy",{...find("FX-25","ScorePolicy"),manager_book_kind:"ECONOMIC_LEDGER"})).toBe(false);
    expect(direct.requested_window).toEqual(direct.effective_window);
  });
  it("T01-15 lowercase score states and uppercase availability do not share a global gate",()=>{
    const manager=find("FX-22","ManagerPortfolio");expect(manager.raw_alpha_scores[0].value).toBeNull();expect(manager.direct_nav_score.value).toBe("73.3");
    expect(validates("ManagerPortfolio",manager)).toBe(true);
    expect(validates("ScoreCapsule",{...manager.direct_nav_score,status:"AVAILABLE"})).toBe(false);
    expect(validates("ScoreCapsule",{...manager.direct_nav_score,availability:{state:"available",reason_code:null}})).toBe(false);
    expect(validates("GrantProposal",{...find("FX-07","GrantProposal"),ts_state:"APPLIED"})).toBe(false);
    const ready={operation_id:"test.read",design_ready:true,fixture_compatible:true,source_ready:false,identity_policy_ready:true,privacy_ready:true,metric_ready:true,performance_ready:true,runtime_enabled:true,blockers:[]};
    expect(validates("EndpointReadiness",ready)).toBe(false);
  });
});
