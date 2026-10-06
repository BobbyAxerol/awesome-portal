/** FULL05 reads reconstruct scalar kinds from the SAME immutable run/version. */
import {bindImportedSearch} from "./imported-search.binding";
import {currentSourceRetainedRecipe} from "./current-source-profile";
import {ResearchRequestedSpecSchema} from "./preflight.contract";
import {recipeDigest} from "./execution-recipes";
import type {RunDeclarationInputs} from "./run-declaration.read";
import type {HistoricalProfileBinding} from "./parameter-binding.registry";

export function importedRetainedBinding(profileId:string,input:RunDeclarationInputs|undefined):HistoricalProfileBinding|null {
  const recipe=currentSourceRetainedRecipe(profileId);
  if(recipe?.adapter_kind!=="IMPORTED_SEARCH"||!input)return null;
  const parsed=ResearchRequestedSpecSchema.safeParse(input.requestedSpec);
  if(!parsed.success||recipeDigest(input.requestedSpec)!==input.requestedSpecDigest
    ||parsed.data.alpha_binding?.alpha_id!==input.alphaId||parsed.data.alpha_binding?.alpha_version_id!==input.alphaVersionId
    ||parsed.data.protocol!==recipe.public_profile.protocol
    ||parsed.data.data.timeframe!==recipe.public_profile.timeframe
    ||parsed.data.optimization_mode!==recipe.public_profile.optimization_mode
    ||parsed.data.optimization_schedule!==recipe.public_profile.optimization_schedule
    ||!input.sourceDigest||!input.entrypoint
    ||!input.declaredContract||typeof input.declaredContract!=="object"||Array.isArray(input.declaredContract))return null;
  const result=bindImportedSearch(parsed.data,input.declaredContract as Record<string,unknown>,input.sourceDigest,input.entrypoint);
  if(!result.binding)return null;
  const kinds:Record<string,"int"|"float">={},ranges:HistoricalProfileBinding["parameterSpace"]={};
  const mutable=ranges as Record<string,{minimum:number;maximum:number;step:number}>;
  for(const [name,p]of Object.entries(result.binding.parameter_space)){
    kinds[name]=p.kind==="int_range"?"int":p.kind==="float_range"?"float":
      (p.kind==="fixed"?[p.value]:p.kind==="categorical"?p.values:[]).every(v=>typeof v==="number"&&Number.isInteger(v))?"int":"float";
    if(p.kind==="int_range"||p.kind==="float_range")mutable[name]={minimum:p.low,maximum:p.high,step:p.step};
    else if(p.kind==="fixed")mutable[name]={minimum:p.value as number,maximum:p.value as number,step:1};
    // Arbitrary categorical choices are NOT a continuous numeric interval.
    // Keep their trial identities, but do not fabricate a surface grid.
  }
  return {profileId:recipe.profile_id,profileDigest:recipe.profile_digest!,adapterContractDigest:recipe.descriptor.adapter_contract_digest,
    parameterSpace:ranges,candidateParameterKinds:kinds,installedInRelease:"research-loop-v2.0/FULL-05",
    retainedLaneProfileIds:[profileId],codeFixed:{hashScope:"SOURCE_CODE_SHA256",state:"NOT_PUBLISHED",reasonCode:"IMPORTED_SOURCE_PUBLISHES_NO_CODE_FIXED_VALUE_LIST",
      values:[],codeDigest:input.sourceDigest,specificationDigest:result.binding.declaration_digest}};
}
