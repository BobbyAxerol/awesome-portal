/** Contract/policy proofs, not substitutes for ordinary historical product runs. */
import {describe,it,expect} from "vitest";
import {executionRecipes,executionRecipe,executionRecipeActivationReason,executionRecipeQualification,recipeDigest,wfoExecutionRecipe} from "../src/research/execution-recipes";
import {FULL03_DELTA_BINDING} from "../src/research/full03-delta.binding";
import {FULL06_DELTA_BINDING,isIndexedDeltaBinding} from "../src/research/full06-delta.binding";
import {researchPortalAdmission} from "../src/research/portal-admission";
import {ResearchParameterBindingRegistry} from "../src/research/parameter-binding.registry";
import {RunSetupProfileSchema} from "../src/research/run-setup.contract";
const rows=executionRecipes.filter(r=>r.descriptor.schema_version==="research.full06-delta-profile.v1");
const flags={FEATURE_RESEARCH_RUN_PRODUCER:"true",FEATURE_RESEARCH_WFO_PROFILE:"true",FEATURE_RESEARCH_FULL06_PROFILE:"true"};
describe("FULL06 exact percent-equity identity, units and bounded activation",()=>{
  it("preserves notional source identity; new AV has a distinct account contract",()=>{
    expect(rows).toHaveLength(63);
    expect(FULL03_DELTA_BINDING.declaredContract.execution.execution_route).toBe("signal_notional");
    expect(FULL06_DELTA_BINDING.declaredContract.execution.execution_route).toBe("pct_equity");
    expect(FULL06_DELTA_BINDING.adapterContractDigest).toBe("72fce10c57c6cc07be1b50658778863aa53ba73919d0cb45ef160647f669bb03");
    expect(isIndexedDeltaBinding({...FULL06_DELTA_BINDING,binding:{adapterId:FULL06_DELTA_BINDING.adapterId,
      contractDigest:FULL03_DELTA_BINDING.adapterContractDigest}})).toBe(false);
  });
  it.each(rows)("does not alias money or qualify a foreign key: $profile_id",row=>{
    expect(recipeDigest(row.descriptor)).toBe(row.profile_digest);
    expect(row.descriptor.account).toMatchObject({alloc_per_trade:0.1,allocation_unit:"EQUITY_FRACTION",leverage:3,
      canonical_one_way_fee_rate:0.0005,funding_enabled:false});
    expect(row.preview_override).toBeNull();
    expect(row.budgets).toMatchObject({cpu_seconds:120,wall_seconds:240});
    const qualified=executionRecipeQualification(row.profile_id).kind==="PRODUCT_RUN_QUALIFIED";
    expect(executionRecipeActivationReason(row,flags,{engine_release_id:"er_quantbt_111",verified:true})).toBe(qualified?null:"RECIPE_NOT_QUALIFIED");
    const selected={...flags,PORTAL_ENV:"local",AUTH_MODE:"dev",RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID:row.profile_id};
    expect(executionRecipeActivationReason(row,selected,{engine_release_id:"er_quantbt_111",verified:true})).toBeNull();
    expect(executionRecipeActivationReason(row,{...selected,AUTH_MODE:"cloudflare"},{engine_release_id:"er_quantbt_111",verified:true})).toBe(qualified?null:"RECIPE_NOT_QUALIFIED");
    expect(executionRecipeActivationReason(row,{...selected,FEATURE_RESEARCH_FULL06_PROFILE:"false"},{engine_release_id:"er_quantbt_111",verified:true})).toBe("PROFILE_FLAG_OFF");
    if(row.adapter_kind==="DELTA_WFO"){
      const spec={schema_version:row.descriptor.requested_spec_version,optimization_mode:row.public_profile.optimization_mode,
        optimization_schedule:row.public_profile.optimization_schedule,execution_route:"pct_equity",
        data:{timeframe:row.public_profile.timeframe},alpha_binding:{alpha_version_id:FULL06_DELTA_BINDING.alphaVersionId}};
      expect(executionRecipe(row.profile_id,row.profile_digest)).toBe(row);
      const successor=executionRecipe(row.profile_id.replace(/\.v1$/,".v2"));
      expect(successor.descriptor).toHaveProperty("predecessor_profile_id",row.profile_id);
      expect(executionRecipeQualification(successor.profile_id).kind).toBe("PRODUCT_RUN_QUALIFIED");
      expect(wfoExecutionRecipe(spec)?.profile_id).toBe(successor.profile_id);
      expect(wfoExecutionRecipe({...spec,execution_route:"signal_notional"})).toBeNull();
      expect(wfoExecutionRecipe({...spec,alpha_binding:{alpha_version_id:FULL03_DELTA_BINDING.alphaVersionId}})).toBeNull();
    }
  });
  it("does not publish candidates as enabled; Atlas count remains bounded",()=>{
    const atlas=researchPortalAdmission(flags as never,{release_id:"er_quantbt_111",verified:true});
    expect(atlas.profiles.filter(p=>p.execution_route==="pct_equity")).toHaveLength(63);
    expect(atlas.profiles.filter(p=>p.execution_route==="pct_equity").every(p=>
      p.state===(executionRecipeQualification(p.profile_id).kind==="PRODUCT_RUN_QUALIFIED"?"ENABLED":"DISABLED"))).toBe(true);
    expect(JSON.stringify(atlas).length).toBeLessThan(1048576);
  });
  it("keeps parameter authority available by historical digest, not active AV",()=>{
    const registry=new ResearchParameterBindingRegistry();
    expect(registry).toBeDefined();
    expect(executionRecipe(rows[0]!.profile_id).descriptor.adapter_contract_digest).not.toBe(FULL03_DELTA_BINDING.adapterContractDigest);
  });
  it("requires the percent account pair at the runtime boundary as in OpenAPI",()=>{
    const shape=RunSetupProfileSchema._def.schema;
    const minimal={execution_route:"pct_equity",account_model:undefined,account:undefined};
    // Use a profile assembled from the image-owned recipe, not a browser sizing override.
    const row=rows[0]!;
    const profile={...row.public_profile,profile_id:row.profile_id,state:"ENABLED",reason_code:null,
      requested_spec_versions:[row.descriptor.requested_spec_version],
      seed_policy:"LOCKED",trial_scope:"GLOBAL_STUDY",trial_default:2,max_total_trials:null,
      frequencies:["weekly"],window_modes:["expanding"],parameter_policy:"DELTA_SEARCH_WITH_QUALIFIED_PINS",
      allowed_pin_names:[],inner_validation:"NOT_APPLICABLE",inner_constraints:null,
      temporal_guards:{policy:"V1_ABSENT_V2_EXPLICIT",defaults:null,max_bars:10000,
        zero_semantics:"ZERO_APPLIES_NO_TEMPORAL_GUARD"},independent_holdout:false,
      account_model:"QUANTBT_PERCENT_EQUITY_V1",account:row.descriptor.account};
    // The publisher has additional image-owned fields not in the response DTO.
    const allowed=Object.fromEntries(Object.entries(profile).filter(([key])=>key in shape.shape));
    expect(RunSetupProfileSchema.safeParse(allowed).success).toBe(true);
    expect(RunSetupProfileSchema.safeParse({...allowed,...minimal}).success).toBe(false);
    expect(RunSetupProfileSchema.safeParse({...allowed,account:undefined}).success).toBe(false);
  });
});
