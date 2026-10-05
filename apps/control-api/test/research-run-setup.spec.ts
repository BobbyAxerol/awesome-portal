import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it,vi} from "vitest";
import {runSetupOptions} from "../src/research/run-setup";
import {RunSetupOptionsSchema,WindowSuggestionSchema,WindowSuggestionRequestSchema} from "../src/research/run-setup.contract";
import {ResearchRunSetupController} from "../src/research/run-setup.controller";
import {researchPortalAdmission} from "../src/research/portal-admission";
import {P04_DELTA_BINDING,P04_DELTA_DECLARED_CONTRACT,P04_DELTA_ADAPTER_CONTRACT_DIGEST} from "../src/research/p04-delta.binding";
import {IMPORTED_ALPHA_ADAPTER_ID,IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST} from "../src/research/imported-alpha.profile";
import {w1Admin,p04Requested} from "./research-w1-wfo.fixture";
import {sha256} from "../src/auth/argon";
import {declarationConditions} from "../src/research/declaration-conditions";
import {ResearchDatasetIndexClient} from "../src/research/dataset-index.client";
const root=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,"../../../packages/contracts");
const read=(name:string)=>JSON.parse(readFileSync(resolve(root,`fixtures/${name}`),"utf8"));
const config={FEATURE_RESEARCH_RUN_PRODUCER:"true",FEATURE_RESEARCH_WFO_PROFILE:"true",FEATURE_RESEARCH_PREVIEW_LONG_WFO:"true",
  FEATURE_RESEARCH_IMPORTED_EXECUTION:"true",PORTAL_PUBLIC_ORIGIN:"https://research.test"} as never;
const context={workspace_id:"ws_test",alpha_id:P04_DELTA_BINDING.alphaId,alpha_version_id:P04_DELTA_BINDING.alphaVersionId,
  dataset_id:"crypto-binance-1m",symbol:"BTCUSDT",timeframe:"1h"};
const version={alphaId:context.alpha_id,alphaVersionId:context.alpha_version_id,lifecycleState:"ACTIVE" as const,
  declaredContract:P04_DELTA_DECLARED_CONTRACT,entrypoint:P04_DELTA_DECLARED_CONTRACT.entrypoint,sourceDigest:null,
  binding:{...P04_DELTA_BINDING,contractDigest:P04_DELTA_ADAPTER_CONTRACT_DIGEST}};
const admission=researchPortalAdmission(config,{release_id:"er_quantbt_111",verified:true});
const guards={label_horizon_bars:0,purge_bars:0,embargo_bars:0};
const build=(v=version,ctx=context,user=w1Admin,flags=config)=>runSetupOptions(user,flags,v,ctx,admission,
  read("research-dataset-catalog.v2.healthy.valid.json"),guards);
const reply={header:vi.fn()};
describe("S02 Alpha-bound setup without admission widening",()=>{
  it("publishes exact runnable version/flag/timeframe limits, not engine ceilings",()=>{
    const r=build();expect(RunSetupOptionsSchema.parse(r)).toEqual(r);
    expect(r.profiles.filter(p=>p.state==="ENABLED")).toHaveLength(4);
    expect(r.profiles[1]).toMatchObject({trial_count:{min:2,max:400},max_span_days:92,fold_bounds:{min:2,max:16},seed_policy:"LOCKED",random_seed:42,independent_holdout:false});
    expect(r.profiles[3]).toMatchObject({trial_count:{min:3,max:3},max_total_trials:48,trial_scope:"PER_OUTER_FOLD_STUDY"});
    expect(r.profiles[1].requested_spec_versions).toEqual(["research.requested-spec.v1"]);
    expect(r.profiles[1].temporal_guards.policy).toBe("V1_ABSENT_V2_EXPLICIT");
    expect(r.profiles[2].temporal_guards.defaults).toEqual(guards);
    expect(r).not.toHaveProperty("may_create_run");
  });
  it("preserves actor, binding, declared-timeframe and producer fences",()=>{
    for(const r of [build(version,context,{...w1Admin,role:"USER"}),build(version,context,w1Admin,{...config as any,FEATURE_RESEARCH_RUN_PRODUCER:"false"}),
      build({...version,binding:null}),build(version,{...context,timeframe:"15m"})])expect(r.profiles.every(p=>p.state==="DISABLED")).toBe(true);
    expect(build(version,{...context,timeframe:"4h"}).profiles.every(p=>p.state==="DISABLED")).toBe(true);
    const catalog=read("research-dataset-catalog.v2.healthy.valid.json");
    catalog.datasets.find((d:any)=>d.dataset_id===context.dataset_id).symbols.items.find((s:any)=>s.symbol===context.symbol).coverage_by_timeframe=[];
    expect(runSetupOptions(w1Admin,config,version,context,admission,catalog,guards).profiles[0].reason_code).toBe("SYMBOL_TIMEFRAME_COVERAGE_NOT_PUBLISHED");
  });
  it("gives imported DRAFT its own pins-only recipe, not Delta WFO",()=>{
    const declaration={...P04_DELTA_DECLARED_CONTRACT,schema_version:"research.alpha-source.v1",determinism:{seed_required:true}};
    const v={...version,lifecycleState:"DRAFT",declaredContract:declaration,sourceDigest:"b".repeat(64),
      binding:{...version.binding,adapterId:IMPORTED_ALPHA_ADAPTER_ID,contractDigest:IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST}};
    const r=build(v as never);expect(r.profiles.filter(p=>p.state==="ENABLED")).toMatchObject([{profile_id:IMPORTED_ALPHA_ADAPTER_ID,
      protocol:"three_window_decay",parameter_policy:"DECLARED_PINS_ONLY",seed_policy:"REQUIRED",requested_spec_versions:["research.requested-spec.v1"]}]);
    expect(r.profiles.slice(0,5).every(p=>p.state==="DISABLED")).toBe(true);
  });
  it("recognizes imported pins and optional/required seed instead of fixed Delta defaults",()=>{
    const p={...admission.profiles[0],parameter_policy:"DECLARED_PINS_ONLY" as const,seed_policy:"REQUIRED" as const};
    const s=p04Requested({random_seed:7,parameter_space_overrides:[{name:"rvol",kind:"pin",value:1}]});
    const m=read("research-declaration-estimate.v1.available.valid.json").metadata;
    const r=declarationConditions(s,m,[p],["1h"]);expect(r.conditions.find(x=>x.key==="seed")?.state).toBe("PASS");
    expect(r.conditions.some(x=>x.key==="parameter_overrides")).toBe(false);
    expect(declarationConditions({...s,random_seed:null},m,[p],["1h"]).conditions.find(x=>x.key==="seed")?.state).toBe("FAIL");
  });
  it("fences workspace, CSRF and obsolete options before requesting any suggestion",async()=>{
    const catalog=vi.fn(async()=>read("research-dataset-catalog.v2.healthy.valid.json")),suggest=vi.fn(),load=vi.fn(async()=>version);
    const atlas=read("research-foundation.atlas-current.valid.json");atlas.portal_admission=admission;
    const controller=new ResearchRunSetupController({loadRunAdapterEligibility:load} as never,{isMember:async()=>false} as never,
      {atlas:async()=>atlas} as never,{catalog,suggest} as never,config);
    const csrf="s02-test-csrf", req={portalUser:w1Admin,portalWorkspaceId:context.workspace_id,headers:{origin:"https://research.test","x-portal-csrf":csrf},
      cookies:{"__Host-portal_csrf":csrf},portalSession:{csrfSecretHash:sha256(csrf)}} as never;
    await expect(controller.options(req,context,reply as never)).rejects.toMatchObject({status:404});expect(load).not.toHaveBeenCalled();
    const body={...context,profile_id:admission.profiles[0].profile_id,options_revision:"f".repeat(64)};
    await expect(controller.suggest({...req as any,headers:{}} as never,body,reply as never)).rejects.toMatchObject({status:403});
    const allowed=new ResearchRunSetupController({loadRunAdapterEligibility:load} as never,{isMember:async()=>true} as never,
      {atlas:async()=>atlas} as never,{catalog,suggest} as never,config);
    await expect(allowed.suggest(req,body,reply as never)).rejects.toMatchObject({status:409});expect(suggest).not.toHaveBeenCalled();
    const opts=await allowed.options(req,context,reply as never);
    await expect(allowed.suggest(req,{...body,options_revision:opts.source_revision,frequency:"monthly"},reply as never)).rejects.toMatchObject({status:400});
    expect(suggest).not.toHaveBeenCalled();
  });
  it("validates shared A/B/C/D and typed absence, refusing extra authorization",()=>{
    const r=read("research-window-suggestion.three-window.valid.json");expect(WindowSuggestionSchema.safeParse(r).success).toBe(true);
    r.metadata.patch.windows.oos.start_utc_ms++;expect(WindowSuggestionSchema.safeParse(r).success).toBe(false);
    expect(WindowSuggestionSchema.safeParse(read("research-window-suggestion.unavailable.valid.json")).success).toBe(true);
    expect(WindowSuggestionRequestSchema.safeParse({...context,profile_id:admission.profiles[0].profile_id,options_revision:"a".repeat(64),start_utc_ms:1}).success).toBe(false);
  });
  it("returns a fenced editable hint without creating a preflight or authorizing a job",async()=>{
    const atlas=read("research-foundation.atlas-current.valid.json");atlas.portal_admission=admission;
    const metadata=read("research-window-suggestion.three-window.valid.json").metadata;
    const catalog=read("research-dataset-catalog.v2.healthy.valid.json");metadata.catalog_revision=catalog.catalog_revision;
    const suggest=vi.fn(async()=>metadata),controller=new ResearchRunSetupController({loadRunAdapterEligibility:async()=>version} as never,
      {isMember:async()=>true} as never,{atlas:async()=>atlas} as never,{catalog:async()=>catalog,suggest} as never,config);
    const csrf="s02-valid-csrf",req={portalUser:w1Admin,portalWorkspaceId:context.workspace_id,
      headers:{origin:"https://research.test","x-portal-csrf":csrf},cookies:{"__Host-portal_csrf":csrf},portalSession:{csrfSecretHash:sha256(csrf)}} as never;
    const options=await controller.options(req,context,reply as never);
    const result=await controller.suggest(req,{...context,profile_id:options.profiles[0].profile_id,options_revision:options.source_revision,
      start_utc_ms:metadata.patch.windows.is.start_utc_ms,end_exclusive_utc_ms:metadata.patch.windows.holdout.end_exclusive_utc_ms},reply as never);
    expect(result.metadata.patch).toEqual(metadata.patch);expect(result.preflight_required).toBe(true);
    expect(result).not.toHaveProperty("preflight_token");expect(result).not.toHaveProperty("may_create_run");
    expect(suggest).toHaveBeenCalledWith(w1Admin,expect.objectContaining({warmup_bars:300,expected_catalog_revision:catalog.catalog_revision}));
  });
  it("checks the signed suggestion response context and index pin",async()=>{
    const sample=read("research-window-suggestion.three-window.valid.json").metadata;
    const client=new ResearchDatasetIndexClient({INTERNAL_PRINCIPAL_SECRET:"s02-test-principal-0123456789",PORTAL_API_BASE_URL:"http://private.test",RESEARCH_PREFLIGHT_TIMEOUT_MS:1000} as never);
    const body={...sample,protocol:"three_window_decay",expected_catalog_revision:sample.catalog_revision,
      start_utc_ms:sample.patch.windows.is.start_utc_ms,end_exclusive_utc_ms:sample.patch.windows.holdout.end_exclusive_utc_ms};
    const stub=vi.spyOn(globalThis,"fetch");
    try {
      stub.mockResolvedValueOnce(new Response(JSON.stringify(sample)));
      expect(await client.suggest(w1Admin,body)).toEqual(sample);
      expect(stub.mock.calls[0][1]?.method).toBe("POST");
      for(const patch of [{symbol:"ETHUSDT"},{catalog_revision:"f".repeat(64)},{warmup_bars:1}]) {
        stub.mockResolvedValueOnce(new Response(JSON.stringify({...sample,...patch})));
        await expect(client.suggest(w1Admin,body)).rejects.toMatchObject({status:502});
      }
      stub.mockResolvedValueOnce(new Response(JSON.stringify({...sample,patch:{...sample.patch,windows:{...sample.patch.windows,
        holdout:{...sample.patch.windows.holdout,end_exclusive_utc_ms:sample.patch.windows.holdout.end_exclusive_utc_ms+3_600_000}}}})));
      await expect(client.suggest(w1Admin,body)).rejects.toMatchObject({status:502});
    } finally {stub.mockRestore();}
  });
});
