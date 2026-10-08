import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it,vi} from "vitest";
import {runSetupOptions,runVersionOptions} from "../src/research/run-setup";
import {recipePresentation} from "../src/research/recipe-presentation";
import {RunSetupOptionsSchema,WindowSuggestionSchema,WindowSuggestionRequestSchema} from "../src/research/run-setup.contract";
import {ResearchRunSetupController} from "../src/research/run-setup.controller";
import {researchPortalAdmission} from "../src/research/portal-admission";
import {P04_DELTA_BINDING,P04_DELTA_DECLARED_CONTRACT,P04_DELTA_ADAPTER_CONTRACT_DIGEST} from "../src/research/p04-delta.binding";
import {IMPORTED_ALPHA_ADAPTER_ID,IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST} from "../src/research/imported-alpha.profile";
import {w1Admin,p04Requested} from "./research-w1-wfo.fixture";
import {sha256} from "../src/auth/argon";
import {declarationConditions} from "../src/research/declaration-conditions";
import {ResearchDatasetIndexClient} from "../src/research/dataset-index.client";
import {HttpErrorFilter} from "../src/http-error.filter";
import {ResearchRunSetupError} from "../src/research/run-setup.error";
import {declaredOptimizationRefusal} from "../src/research/preflight.service";
import {ResearchRunAdmissionService} from "../src/research/run-admission.service";
import {executionRecipes} from "../src/research/execution-recipes";
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
  it("discloses version compatibility before data selection without mutating registry/defaults",()=>{
    const before=JSON.stringify(version),result=runVersionOptions(w1Admin,config,version,
      {workspace_id:context.workspace_id,alpha_id:context.alpha_id,alpha_version_id:context.alpha_version_id},admission);
    expect(result.routes.find(r=>r.execution_route==="signal_notional")).toMatchObject({state:"COMPATIBLE",compatible_timeframes:["1h"]});
    expect(result.declared_timeframes).toEqual(["1h","4h","1d"]);
    expect(result).not.toHaveProperty("may_create_run");expect(result).not.toHaveProperty("superseded_by");
    expect(result.context).not.toHaveProperty("dataset_id");expect(JSON.stringify(version)).toBe(before);
    expect(result.source_revision).toBe(runVersionOptions(w1Admin,config,version,result.context,admission).source_revision);
    const denied=runVersionOptions({...w1Admin,role:"USER"},config,version,result.context,admission);
    expect(denied.routes.every(r=>r.state==="UNAVAILABLE"&&r.compatible_profile_ids.length===0)).toBe(true);
    expect(denied.source_revision).not.toBe(result.source_revision);
  });
  it("uses the exact immutable scalar/pct/native binding, not newest ACTIVE as universal replacement",()=>{
    const flags={...config as any,FEATURE_RESEARCH_FULL02_PROFILE:"true",FEATURE_RESEARCH_FULL03_PROFILE:"true",
      FEATURE_RESEARCH_FULL04_PROFILE:"true",FEATURE_RESEARCH_FULL05_PROFILE:"true",FEATURE_RESEARCH_FULL06_PROFILE:"true"};
    const profiles=researchPortalAdmission(flags,{release_id:"er_quantbt_111",verified:true});
    for(const route of ["signal_notional","pct_equity","intrabar_bracket","reactive","event_driven"]) {
      const profile=profiles.profiles.find(row=>row.execution_route===route&&row.state==="ENABLED"
        && executionRecipes.some(r=>r.profile_id===row.profile_id&&r.source_requirement==="FULL03_IMMUTABLE_DELTA_BINDING"));
      const recipe=executionRecipes.find(r=>r.profile_id===profile?.profile_id);
      expect(recipe,route).toBeDefined();
      if(!recipe||!("alpha_binding_requirements" in recipe.descriptor))throw new Error("exact binding missing");
      const v={...version,alphaVersionId:recipe.descriptor.alpha_binding_requirements.alpha_version_id,
        binding:{...version.binding,adapterId:recipe.descriptor.adapter_id,contractDigest:recipe.descriptor.adapter_contract_digest}};
      const result=runVersionOptions(w1Admin,flags,v,{workspace_id:context.workspace_id,alpha_id:context.alpha_id,alpha_version_id:v.alphaVersionId},profiles);
      expect(result.routes.filter(r=>r.state==="COMPATIBLE").map(r=>r.execution_route)).toEqual([route]);
      expect(result.routes.filter(r=>r.execution_route!==route).every(r=>r.compatible_profile_ids.length===0)).toBe(true);
    }
  });
  it("serves presentation metadata for every recipe without changing its descriptor",()=>{
    const before=JSON.stringify(executionRecipes);
    for(const recipe of executionRecipes) {
      const meta=recipePresentation(recipe.public_profile);
      expect(meta.scope).toBe("DISPLAY_ORDER_NOT_OPTIMAL_SETUP_OR_AUTHORIZATION");
      expect(meta.label.length).toBeLessThanOrEqual(120);expect(meta.recommended_rank).toBeGreaterThanOrEqual(0);
    }
    expect(JSON.stringify(executionRecipes)).toBe(before);
    expect(build().profiles[0].recipe).toMatchObject({family:"THREE_WINDOW_FIXED",recommended_rank:0});
    expect(build().profiles[1].recipe).toMatchObject({family:"ADVANCED_WFO"});
    const fixed=build().profiles[0];
    expect(recipePresentation({...fixed,trial_count:{min:2,max:400}}).key).not.toBe(fixed.recipe!.key);
    expect(recipePresentation({execution_route:"event_driven",protocol:"three_window_decay",
      optimization_mode:"mode_4_is_only_robust",optimization_schedule:"global",trial_count:{min:2,max:400}}))
      .toMatchObject({family:"NATIVE_OPTIMIZED",label:"Limit/OCO · native IS optimization"});
  });
  it("projects native optimizer seed/span from its immutable executor, without rewriting the old fixed recipe",()=>{
    const flags={...config as any,FEATURE_RESEARCH_FULL06_PROFILE:"true"};
    const before=JSON.stringify(executionRecipes),profiles=researchPortalAdmission(flags,{release_id:"er_quantbt_111",verified:true});
    const row=profiles.profiles.find(p=>p.profile_id==="p10.delta-event-driven-limit-oco-search-1h.v1")!;
    expect(row).toMatchObject({seed_policy:"LOCKED",random_seed:42,max_span_days:365,trial_count:{min:2,max:400},trial_default:100});
    const old=profiles.profiles.find(p=>p.profile_id==="p10.delta-event-driven-limit-oco-fixed-1h.v1")!;
    expect(old).toMatchObject({seed_policy:"FORBIDDEN",random_seed:null,max_span_days:92,trial_count:{min:1,max:1}});
    expect(JSON.stringify(executionRecipes)).toBe(before);
  });
  it("keeps compatible imported DRAFT timeframes separate from nonnumeric search and dataset grants",()=>{
    const v={...version,lifecycleState:"DRAFT" as const,sourceDigest:"b".repeat(64),
      declaredContract:{...P04_DELTA_DECLARED_CONTRACT,schema_version:"research.alpha-source.v1"},
      binding:{...version.binding,adapterId:IMPORTED_ALPHA_ADAPTER_ID,contractDigest:IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST}};
    const result=runVersionOptions(w1Admin,config,v,{workspace_id:context.workspace_id,alpha_id:context.alpha_id,alpha_version_id:context.alpha_version_id},admission);
    const route=result.routes.find(r=>r.execution_route==="signal_notional")!;
    expect(result.lifecycle_state).toBe("DRAFT");expect(route.state).toBe("COMPATIBLE");
    expect(route.compatible_profile_ids).toEqual([IMPORTED_ALPHA_ADAPTER_ID]);
    expect(new Set(route.compatible_timeframes)).toEqual(new Set(v.declaredContract.timeframes));
    const flags={...config as any,FEATURE_RESEARCH_IMPORTED_EXECUTION:"false"};
    expect(runVersionOptions(w1Admin,flags,v,result.context,admission).routes.every(r=>r.state==="UNAVAILABLE")).toBe(true);
    const disabled=researchPortalAdmission({...config as any,FEATURE_RESEARCH_RUN_PRODUCER:"false"},{release_id:"er_quantbt_111",verified:true});
    expect(runVersionOptions(w1Admin,config,version,result.context,disabled).routes.every(r=>r.state==="UNAVAILABLE")).toBe(true);
  });
  it("fences the new early read before foundation access and never calls the data index",async()=>{
    const catalog=vi.fn(),suggest=vi.fn(),load=vi.fn(async()=>version),atlasRead=vi.fn(async()=>{
      const atlas=read("research-foundation.atlas-current.valid.json");atlas.portal_admission=admission;return atlas;
    });
    const controller=new ResearchRunSetupController({loadRunAdapterEligibility:load} as never,{isMember:async()=>true} as never,
      {atlas:atlasRead} as never,{catalog,suggest} as never,config);
    const req={portalUser:w1Admin,portalWorkspaceId:context.workspace_id} as never;
    const query={alpha_id:context.alpha_id,alpha_version_id:context.alpha_version_id};
    const result=await controller.versionOptions(req,query,reply as never);
    expect(result.context.workspace_id).toBe(context.workspace_id);expect(catalog).not.toHaveBeenCalled();expect(suggest).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith({workspaceId:context.workspace_id,actorUserId:w1Admin.userId},context.alpha_id,context.alpha_version_id);
    expect(reply.header).toHaveBeenCalledWith("cache-control","private, no-store");
    const denied=new ResearchRunSetupController({loadRunAdapterEligibility:load} as never,{isMember:async()=>false} as never,
      {atlas:atlasRead} as never,{catalog,suggest} as never,config);
    load.mockClear();atlasRead.mockClear();
    await expect(denied.versionOptions(req,query,reply as never)).rejects.toMatchObject({status:404});
    await expect(controller.versionOptions(req,{...query,dataset_id:"extra"},reply as never)).rejects.toMatchObject({status:400});
    expect(load).not.toHaveBeenCalled();expect(atlasRead).not.toHaveBeenCalled();
  });
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
  it("discloses unopened engine axes without adding profiles or enabling workloads",()=>{
    const engine=read("research-foundation.atlas-current.valid.json").atlas;
    const r=runSetupOptions(w1Admin,config,version,context,admission,read("research-dataset-catalog.v2.healthy.valid.json"),guards,engine);
    expect(r.profiles).toEqual(build().profiles);
    expect(r.engine_options?.execution_routes.find(row=>row.value==="portfolio")).toMatchObject({state:"DISABLED",reason_code:"PROFILE_NOT_OPENED",field_path:["execution_route"],profile_ids:[]});
    expect(r.engine_options?.optimization_pairs.find(row=>row.optimization_mode==="mode_2_sbb")).toMatchObject({state:"DISABLED",reason_code:"PROFILE_NOT_OPENED",field_path:["optimization_mode"]});
    expect(r.engine_options?.optimization_pairs.find(row=>row.optimization_mode==="mode_1_decay"&&row.optimization_schedule==="per_fold_decay")).toMatchObject({reason_code:"PROFILE_NOT_OPENED",field_path:["optimization_schedule"]});
    expect(r.engine_options?.frequencies.find(row=>row.value==="yearly")).toMatchObject({reason_code:"PROFILE_NOT_OPENED",field_path:["walk_forward","frequency"]});
    expect(r.engine_options?.optimization_pairs.some(row=>row.optimization_mode==="mode_2_sbb"&&row.optimization_schedule!=="global")).toBe(false);
    expect(r.source_revision).not.toEqual(build().source_revision);
    const invalid=structuredClone(r);invalid.engine_options!.execution_routes.find(row=>row.value==="portfolio")!.state="ENABLED";
    expect(RunSetupOptionsSchema.safeParse(invalid).success).toBe(false);
    const blocked=runSetupOptions({...w1Admin,role:"USER"},config,version,context,admission,read("research-dataset-catalog.v2.healthy.valid.json"),guards,engine);
    expect(blocked.engine_options?.execution_routes.find(row=>row.value==="signal_notional"))
      .toMatchObject({state:"DISABLED",reason_code:"RESEARCH_RUN_CREATE_FORBIDDEN",field_path:["alpha_binding"]});
  });
  it("keeps all independent context refusal paths instead of one generic reason",()=>{
    const r=build(version,{...context,timeframe:"15m"},{...w1Admin,role:"USER"});
    expect(r.profiles[0].refusals).toEqual(expect.arrayContaining([
      expect.objectContaining({field_path:["alpha_binding"]}),
      {reason_code:"DATASET_TIMEFRAME_NOT_AVAILABLE",field_path:["data","timeframe"]},
      {reason_code:"ALPHA_TIMEFRAME_NOT_DECLARED",field_path:["data","timeframe"]},
      {reason_code:"PROFILE_TIMEFRAME_NOT_ADMITTED",field_path:["data","timeframe"]},
    ]));
    expect(r.profiles[0].reason_code).toBe(r.profiles[0].refusals![0].reason_code);
  });
  it("uses the same declaration/seed/pin predicate as actual admission, with typed paths",()=>{
    const v={...version,declaredContract:{...P04_DELTA_DECLARED_CONTRACT,schema_version:"research.alpha-source.v1",determinism:{seed_required:true}}};
    const admissionService=new ResearchRunAdmissionService({} as never,config);
    const missing=p04Requested();
    expect(declaredOptimizationRefusal(v,missing)).toMatchObject({reason_code:"ALPHA_RANDOM_SEED_REQUIRED",field_path:["random_seed"]});
    expect(admissionService.importedConfigurationRefusal(missing,v.declaredContract,v.entrypoint)).toEqual({reason_code:"ALPHA_RANDOM_SEED_REQUIRED",field_path:["random_seed"]});
    const unknown=p04Requested({random_seed:42,parameter_space_overrides:[{name:"unknown",kind:"pin",value:1}]});
    expect(declaredOptimizationRefusal(v,unknown)).toMatchObject({reason_code:"ALPHA_PARAMETER_NOT_DECLARED",field_path:["parameter_space_overrides","0","name"]});
    expect(admissionService.importedConfigurationRefusal({...missing,random_seed:42,protocol:"advanced",windows:null} as never,v.declaredContract,v.entrypoint))
      .toEqual({reason_code:"PROFILE_NOT_OPENED",field_path:["protocol"]});
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
    await expect(allowed.suggest(req,body,reply as never)).rejects.toMatchObject({status:409,code:"RESEARCH_SETUP_OPTIONS_STALE",details:{field_path:["options_revision"]}});expect(suggest).not.toHaveBeenCalled();
    const opts=await allowed.options(req,context,reply as never);
    for(const patch of [{start_utc_ms:1},{start_utc_ms:3,end_exclusive_utc_ms:2}]) {
      await expect(allowed.suggest(req,{...body,options_revision:opts.source_revision,...patch},reply as never))
        .rejects.toMatchObject({status:400,details:{field_path:["end_exclusive_utc_ms"]}});
    }
    await expect(allowed.suggest(req,{...body,options_revision:opts.source_revision,frequency:"monthly"},reply as never)).rejects.toMatchObject({status:400,code:"RESEARCH_SETUP_PREFERENCE_REFUSED",details:{field_path:["frequency"]}});
    await expect(allowed.suggest(req,{...body,profile_id:"unknown",options_revision:opts.source_revision},reply as never)).rejects.toMatchObject({status:409,code:"RESEARCH_SETUP_PROFILE_REFUSED",details:{reason_code:"PROFILE_NOT_FOUND",field_path:["profile_id"]}});
    for(const [field,value] of [["frequency","monthly"],["window_mode","rolling"],["train_window","60D"]]) {
      await expect(allowed.suggest(req,{...body,profile_id:admission.profiles[1].profile_id,options_revision:opts.source_revision,[field as string]:value},reply as never))
        .rejects.toMatchObject({status:400,code:"RESEARCH_SETUP_PREFERENCE_REFUSED",details:{field_path:[field]}});
    }
    expect(suggest).not.toHaveBeenCalled();
  });
  it("serializes the distinct stale conflict with request identity, without leaking state",()=>{
    const send=vi.fn(),status=vi.fn(()=>({send}));
    new HttpErrorFilter().catch(new ResearchRunSetupError("RESEARCH_SETUP_OPTIONS_STALE","Run setup changed. Reload setup options before applying a suggestion.",409,
      {gate:"setup_revision",field_path:["options_revision"]}),{switchToHttp:()=>({getResponse:()=>({status}),getRequest:()=>({headers:{"x-request-id":"s02-stale-fixture"}})})} as never);
    expect(status).toHaveBeenCalledWith(409);expect(send).toHaveBeenCalledWith(read("research-run-setup-options.stale.valid.json"));
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
