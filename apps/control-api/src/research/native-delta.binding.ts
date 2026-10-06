/** Distinct versioned declarations; protected scalar kernel is adapted, not replaced. */
import {NATIVE_DELTA_BINDING_TABLE as bindings} from './native-delta-bindings.generated';
import {FULL03_DELTA_BINDING} from './full03-delta.binding';
import {executionRecipe,executionRecipes,type ExecutionRecipe} from './execution-recipes';
export const NATIVE_DELTA_BINDINGS=bindings.map(binding=>({...FULL03_DELTA_BINDING,
  alphaVersionId:binding.alpha_version_id,adapterContractDigest:binding.adapter_contract_digest,
  declaredContract:binding.declared_contract}));
export const isNativeRecipe=(row:ExecutionRecipe|null|undefined):boolean=>row?.descriptor.schema_version==='research.native-route-profile.v1';
export function isNativeReadBinding(id:string|null|undefined,digest:string|null){
  const row=executionRecipes.find(r=>r.profile_id===id);
  return row!==undefined&&isNativeRecipe(row)&&row.descriptor.adapter_contract_digest===digest;
}
export function nativeDeltaRecipe(spec:{execution_route:string;alpha_binding?:{alpha_version_id:string}|null}){
  return executionRecipes.find(row=>isNativeRecipe(row)&&row.descriptor.execution_route===spec.execution_route
    &&'alpha_binding_requirements' in row.descriptor
    &&'alpha_version_id' in row.descriptor.alpha_binding_requirements
    &&row.descriptor.alpha_binding_requirements.alpha_version_id===spec.alpha_binding?.alpha_version_id)??null;
}
export function nativeDeltaProfile(id:string,digest:string|null){const row=executionRecipe(id,digest);
  if(!isNativeRecipe(row))throw new Error('Exact native recipe required');return row;}
