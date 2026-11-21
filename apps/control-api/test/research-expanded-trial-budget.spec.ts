import {describe,it,expect} from 'vitest';
import {executionRecipe,executionRecipeQualification,executionRecipeActivationReason,recipeTrialCountAdmitted,wfoExecutionRecipe,
  preferredIntakeRecipes} from '../src/research/execution-recipes';
import {importedSearchRecipe} from '../src/research/imported-search.binding';
const id='p10.delta-wfo-temporal-1h.v2';
const flags={PORTAL_ENV:'local',AUTH_MODE:'dev',RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:id,
  FEATURE_RESEARCH_RUN_PRODUCER:'true',FEATURE_RESEARCH_WFO_PROFILE:'true',FEATURE_RESEARCH_FULL03_PROFILE:'true'};
describe('owner-approved bounded trial ranges, immutable old intake',()=>{
  it('uses old recipe before qualification and exact candidate only in owner cell',()=>{
    const spec={schema_version:'research.requested-spec.v2',optimization_schedule:'global',optimization_mode:'mode_1_decay',
      execution_route:'signal_notional',data:{timeframe:'1h'},alpha_binding:{alpha_version_id:'av_delta_rsi_polynomial_alpha_1_0_1'},optuna_trials:3};
    const qualified=executionRecipeQualification(id).kind==='PRODUCT_RUN_QUALIFIED';
    expect(wfoExecutionRecipe(spec)?.profile_id).toBe(qualified?id:'p10.delta-wfo-temporal-1h.v1');
    expect(wfoExecutionRecipe(spec,flags)?.profile_id).toBe(id);
    const row=wfoExecutionRecipe({...spec,optuna_trials:400})!;
    expect(row.profile_id).toBe(id);
    expect(executionRecipeActivationReason(row,{...flags,RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:undefined},
      {engine_release_id:'er_quantbt_111',verified:true})).toBe(qualified?null:'RECIPE_NOT_QUALIFIED');
    expect(executionRecipeActivationReason(row,flags,{engine_release_id:'er_quantbt_111',verified:true})).toBeNull();
    expect(preferredIntakeRecipes([executionRecipe('p10.delta-wfo-temporal-1h.v1'),row],undefined,flags)).toEqual([row]);
  });
  it('admits safe integer ranges without inheriting the old long-preview override',()=>{
    const row=executionRecipe(id);
    for(const count of [2,3,100,400])expect(recipeTrialCountAdmitted(row,count,{})).toBe(true);
    for(const count of [0,1,401,Infinity,NaN,2.5])expect(recipeTrialCountAdmitted(row,count,{})).toBe(false);
    expect(recipeTrialCountAdmitted(executionRecipe('p10.delta-wfo-temporal-1h.v1'),400,{})).toBe(false);
    const centroid=executionRecipe('p10.delta-mode3-global-1h.v2');
    for(const count of [5,100,400])expect(recipeTrialCountAdmitted(centroid,count,{})).toBe(true);
    for(const count of [3,4,401,5.5])expect(recipeTrialCountAdmitted(centroid,count,{})).toBe(false);
  });
  it('resolves imported ranges independently from Delta identity',()=>{
    const spec={schema_version:'research.requested-spec.v2',protocol:'advanced',optimization_schedule:'global',
      optimization_mode:'mode_1_decay',data:{timeframe:'1h'},optuna_trials:100};
    expect(importedSearchRecipe(spec as never)?.profile_id).toBe('p10.imported-wfo-temporal-1h.v2');
  });
});
