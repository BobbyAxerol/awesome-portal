import {describe,it,expect} from "vitest";
import {bindImportedSearch,importedSearchRecipe} from "../src/research/imported-search.binding";
import type {ResearchRequestedSpec} from "../src/research/preflight.contract";
import {executionRecipes,executionRecipeActivationReason,executionRecipeQualification} from "../src/research/execution-recipes";
import {currentSourceExecutionPair,currentSourceRetainedMethod} from "../src/research/current-source-profile";
import {importedRetainedBinding} from "../src/research/imported-search.read";
import {recipeDigest} from "../src/research/execution-recipes";
import {wfoRequested} from "./research-w1-wfo.fixture";
import {quantbtCandidateId} from "../src/research/fold-ordering";
import {retainedStage4Binding} from "../src/research/stage4-binding";

const declaration={schema_version:"research.alpha-source.v1",entrypoint:"generate_signals",timeframes:["1h","4h","1d"],
  warmup_bars:256,determinism:{seed_required:true},parameter_space:{
    length:{kind:"int_range",low:2,high:10,step:2},scale:{kind:"float_range",low:0.1,high:1.1,step:0.1},
    direction:{kind:"categorical",values:[-1,1]},fixed:{kind:"fixed",value:5}}};
const spec=(patch={})=>({schema_version:"research.requested-spec.v2",data:{timeframe:"1h"},protocol:"advanced",
  optimization_mode:"mode_1_decay",optimization_schedule:"global",random_seed:42,parameter_space_overrides:[],...patch}) as ResearchRequestedSpec;
const bind=(patch={})=>bindImportedSearch(spec(patch),declaration,"a".repeat(64),"generate_signals");
describe("FULL05 confined imported search custody",()=>{
  it("preserves all declaration kinds and narrows numeric bounds without widening steps",()=>{
    const result=bind({parameter_space_overrides:[{name:"length",kind:"sweep",low:4,high:8},{name:"scale",kind:"pin",value:0.3}]});
    expect(result.refusal).toBeNull();expect(result.binding?.parameter_space).toEqual({
      length:{kind:"int_range",low:4,high:8,step:2},scale:{kind:"fixed",value:0.3},
      direction:{kind:"categorical",values:[-1,1]},fixed:{kind:"fixed",value:5}});
    expect(result.binding?.declaration_digest).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([
    [{name:"length",kind:"pin",value:3},"ALPHA_PARAMETER_OUTSIDE_DECLARATION"],
    [{name:"length",kind:"sweep",low:4,high:11},"ALPHA_PARAMETER_OUTSIDE_DECLARATION"],
    [{name:"scale",kind:"pin",value:0.35},"ALPHA_PARAMETER_OUTSIDE_DECLARATION"],
    [{name:"direction",kind:"pin",value:"both"},"ALPHA_PARAMETER_OUTSIDE_DECLARATION"],
    [{name:"fixed",kind:"pin",value:true},"ALPHA_PARAMETER_OUTSIDE_DECLARATION"],
    [{name:"other",kind:"pin",value:1},"ALPHA_PARAMETER_NOT_DECLARED"],
  ])("refuses undeclared/out-of-step/changed fixed request %j",(override,reason)=>{
    expect(bind({parameter_space_overrides:[override]}).refusal?.reason_code).toBe(reason);
  });
  it("binds declaration/timeframe/seed and exact recipe separately",()=>{
    expect(bind({data:{timeframe:"5m"}}).refusal?.reason_code).toBe("ALPHA_TIMEFRAME_NOT_DECLARED");
    expect(bind({random_seed:null}).refusal?.field_path).toEqual(["random_seed"]);
    expect(importedSearchRecipe(spec())?.profile_id).toBe("p10.imported-wfo-temporal-1h.v1");
    expect(importedSearchRecipe(spec({optimization_mode:"mode_2_sbb",optimization_schedule:"per_fold_causal"}))).toBeNull();
  });
  it("never inherits built-in Delta qualification or preview-long limits",()=>{
    const rows=executionRecipes.filter(row=>row.adapter_kind==="IMPORTED_SEARCH");expect(rows).toHaveLength(27);
    for(const row of rows){
      expect(row.preview_override).toBeNull();expect(row.budgets).toMatchObject({cpu_seconds:120,wall_seconds:240,max_warmup_bars:4096});
      expect(currentSourceExecutionPair(row.profile_id,row.profile_digest)).toEqual(row.descriptor.current_source);
      expect(currentSourceRetainedMethod(row.descriptor.current_source.profile_id,row.descriptor.current_source.source_adapter_id)).not.toBeNull();
      expect(currentSourceExecutionPair(row.profile_id,"0".repeat(64))).toBeNull();
      const proof=executionRecipeQualification(row.profile_id),flags={FEATURE_RESEARCH_RUN_PRODUCER:"true",FEATURE_RESEARCH_WFO_PROFILE:"true",
        FEATURE_RESEARCH_IMPORTED_EXECUTION:"true",FEATURE_RESEARCH_FULL05_PROFILE:"true"};
      expect(["CANDIDATE_NOT_QUALIFIED","PRODUCT_RUN_QUALIFIED"]).toContain(proof.kind);
      if(proof.kind==="PRODUCT_RUN_QUALIFIED"){
        expect(proof.receipt_path).toBe("upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md");
        expect(proof.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(executionRecipeActivationReason(row,flags,{engine_release_id:"er_quantbt_111",verified:true}))
        .toBe(proof.kind==="PRODUCT_RUN_QUALIFIED"?null:"RECIPE_NOT_QUALIFIED");
      expect(executionRecipeActivationReason(row,{...flags,FEATURE_RESEARCH_FULL05_PROFILE:"false"},
        {engine_release_id:"er_quantbt_111",verified:true})).toBe("PROFILE_FLAG_OFF");
    }
  });
  it("refuses nonnumeric retained parameters and categorical centroids explicitly",()=>{
    const nonnumeric={...declaration,parameter_space:{...declaration.parameter_space,fixed:{kind:"fixed",value:false}}};
    expect(bindImportedSearch(spec(),nonnumeric,"a".repeat(64),"generate_signals").refusal?.reason_code).toBe("IMPORTED_NON_NUMERIC_SEARCH_NOT_QUALIFIED");
    expect(bind({optimization_mode:"mode_3_flat_minima"}).refusal?.reason_code).toBe("IMPORTED_CATEGORICAL_CENTROID_NOT_APPLICABLE");
    const mixed={...declaration,parameter_space:{direction:{kind:"categorical",values:[1,2.5]}}};
    expect(bindImportedSearch(spec(),mixed,"a".repeat(64),"generate_signals").refusal?.reason_code)
      .toBe("IMPORTED_MIXED_NUMERIC_CATEGORY_NOT_QUALIFIED");
  });
  it("restores imported child scalar kinds only from its immutable run/version binding",()=>{
    const requested=wfoRequested({schema_version:"research.requested-spec.v2",strategy_id:"imported",
      alpha_binding:{alpha_id:"imported",alpha_version_id:"av_imported_1"}},{label_horizon_bars:0,purge_bars:0,embargo_bars:0});
    const input={alphaId:"imported",alphaVersionId:"av_imported_1",requestedSpec:requested,requestedSpecDigest:recipeDigest(requested),
      declaredContract:declaration,entrypoint:"generate_signals",sourceDigest:"a".repeat(64)};
    const binding=importedRetainedBinding("full05.imported-wfo-temporal-1h.v1",input);
    expect(binding?.candidateParameterKinds).toEqual({length:"int",scale:"float",direction:"int",fixed:"int"});
    expect(binding?.codeFixed).toMatchObject({hashScope:"SOURCE_CODE_SHA256",codeDigest:"a".repeat(64)});
    const theta={length:"4",scale:"0.3",direction:"1",fixed:"5"},id=quantbtCandidateId(theta,binding?.candidateParameterKinds)!;
    expect(retainedStage4Binding(theta,"b".repeat(64),[{foldId:"0",records:[
      {audit_ordinal:0,candidate_id:id,context:"selection",strategy_fingerprint:"c".repeat(64)},
      {audit_ordinal:1,candidate_id:id,context:"out-of-sample generation",strategy_fingerprint:"c".repeat(64)},
    ]}],binding?.candidateParameterKinds).pairs).toEqual({params:"MATCH",bundle:"MATCH"});
    expect(importedRetainedBinding("full05.imported-wfo-temporal-1h.v1",{...input,alphaVersionId:"av_new_active"})).toBeNull();
    expect(importedRetainedBinding("full05.imported-wfo-temporal-1h.v1",{...input,requestedSpecDigest:"0".repeat(64)})).toBeNull();
    expect(importedRetainedBinding("full05.imported-wfo-temporal-1h.v1",{...input,sourceDigest:null})).toBeNull();
  });
});
