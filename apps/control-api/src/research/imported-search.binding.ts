/** FULL-05: immutable declaration + narrowed search space, never active-version lookup. */
import {recipeDigest, executionRecipes, preferredIntakeRecipes, type ExecutionRecipe, type RecipeFlags} from "./execution-recipes";
import {IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, IMPORTED_ALPHA_ADAPTER_ID} from "./imported-alpha.profile";
import type {ResearchRequestedSpec} from "./preflight.contract";
import type {SetupRefusal} from "./run-setup.contract";

type Scalar = string | number | boolean;
type Parameter = {kind:"fixed";value:Scalar}|{kind:"categorical";values:Scalar[]}
  |{kind:"int_range"|"float_range";low:number;high:number;step:number};
export type ImportedSearchBinding = {schema_version:"research.imported-search-binding.v1";
  source_digest:string;entrypoint:string;declaration:Record<string,unknown>;
  declaration_digest:string;parameter_space:Record<string,Parameter>;parameter_space_digest:string};
export function importedSearchRecipe(spec:ResearchRequestedSpec,flags:RecipeFlags={}):Extract<ExecutionRecipe,{adapter_kind:"IMPORTED_SEARCH"}>|null {
  const rows=executionRecipes.filter((row):row is Extract<ExecutionRecipe,{adapter_kind:"IMPORTED_SEARCH"}>=>row.adapter_kind==="IMPORTED_SEARCH"
    && row.public_profile.timeframe===spec.data.timeframe && row.public_profile.protocol===spec.protocol
    && row.public_profile.optimization_mode===spec.optimization_mode
    && row.public_profile.optimization_schedule===spec.optimization_schedule
    && row.descriptor.requested_spec_version===spec.schema_version);
  const current=preferredIntakeRecipes(rows,spec.optuna_trials,flags);
  if(current.length>1)throw new Error("Ambiguous imported search recipe");
  return current[0]??null;
}
export function bindImportedSearch(spec:ResearchRequestedSpec,declaration:Record<string,unknown>,sourceDigest:string,
  entrypoint:string):{binding:ImportedSearchBinding|null;refusal:SetupRefusal|null} {
  const reject=(reason_code:string,field_path:string[])=>({binding:null,refusal:{reason_code,field_path}});
  if(!/^[a-f0-9]{64}$/.test(sourceDigest)||declaration.schema_version!=="research.alpha-source.v1"
    ||declaration.entrypoint!==entrypoint)return reject("ALPHA_DECLARATION_NOT_PUBLISHED",["alpha_binding"]);
  if(!Array.isArray(declaration.timeframes)||!declaration.timeframes.includes(spec.data.timeframe))
    return reject("ALPHA_TIMEFRAME_NOT_DECLARED",["data","timeframe"]);
  if(!Number.isInteger(declaration.warmup_bars)||(declaration.warmup_bars as number)<1||(declaration.warmup_bars as number)>4096)
    return reject("IMPORTED_WARMUP_EXCEEDS_EXECUTOR_LIMIT",["alpha_binding"]);
  if(spec.random_seed!==42)return reject("ALPHA_RANDOM_SEED_REQUIRED",["random_seed"]);
  const raw=declaration.parameter_space;
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).length<1||Object.keys(raw).length>12)
    return reject("ALPHA_DECLARATION_NOT_PUBLISHED",["alpha_binding"]);
  const space:Record<string,Parameter>={};
  const overrides=new Map(spec.parameter_space_overrides.map(row=>[row.name,row]));
  const scalar=(v:unknown):v is Scalar=>typeof v==="boolean"||typeof v==="string"&&v.length<=256||typeof v==="number"&&Number.isFinite(v);
  const lattice=(v:number,p:{low:number;high:number;step:number})=>Number.isFinite(v)&&v>=p.low&&v<=p.high
    &&Math.abs((v-p.low)/p.step-Math.round((v-p.low)/p.step))<=1e-9;
  for(const [name,value] of Object.entries(raw)){
    if(!value||typeof value!=="object"||Array.isArray(value))return reject("ALPHA_DECLARATION_NOT_PUBLISHED",["alpha_binding"]);
    const p=value as Record<string,unknown>,override=overrides.get(name),path=["parameter_space_overrides",name];
    if(p.kind==="fixed"){
      if(!scalar(p.value))return reject("ALPHA_DECLARATION_NOT_PUBLISHED",["alpha_binding"]);
      if(override&&(override.kind!=="pin"||override.value!==p.value))return reject("ALPHA_PARAMETER_OUTSIDE_DECLARATION",path);
      space[name]={kind:"fixed",value:p.value};
    }else if(p.kind==="categorical"){
      if(!Array.isArray(p.values)||!p.values.length||p.values.length>64||!p.values.every(scalar))return reject("ALPHA_DECLARATION_NOT_PUBLISHED",["alpha_binding"]);
      if(override){
        if(override.kind!=="pin"||!p.values.some(v=>typeof v===typeof override.value&&v===override.value))return reject("ALPHA_PARAMETER_OUTSIDE_DECLARATION",path);
        space[name]={kind:"fixed",value:override.value};
      }else space[name]={kind:"categorical",values:[...p.values]};
    }else if(p.kind==="int_range"||p.kind==="float_range"){
      if(![p.low,p.high,p.step].every(v=>typeof v==="number"&&Number.isFinite(v))||(p.step as number)<=0||(p.low as number)>(p.high as number))
        return reject("ALPHA_DECLARATION_NOT_PUBLISHED",["alpha_binding"]);
      const range={kind:p.kind,low:p.low,high:p.high,step:p.step} as Extract<Parameter,{low:number}>;
      if(range.kind==="int_range"&&![range.low,range.high,range.step].every(Number.isInteger))return reject("ALPHA_DECLARATION_NOT_PUBLISHED",["alpha_binding"]);
      if(!override)space[name]=range;
      else if(override.kind==="pin"){
        if(typeof override.value!=="number"||!lattice(override.value,range)||(range.kind==="int_range"&&!Number.isInteger(override.value)))
          return reject("ALPHA_PARAMETER_OUTSIDE_DECLARATION",path);
        space[name]={kind:"fixed",value:override.value};
      }else{
        if(override.kind!=="sweep"||typeof override.low!=="number"||typeof override.high!=="number"
          ||!lattice(override.low,range)||!lattice(override.high,range)||override.low>override.high)
          return reject("ALPHA_PARAMETER_OUTSIDE_DECLARATION",path);
        space[name]={kind:range.kind,low:override.low,high:override.high,step:range.step};
      }
    }else return reject("ALPHA_DECLARATION_NOT_PUBLISHED",["alpha_binding"]);
    overrides.delete(name);
  }
  // Current retained optimizer DTOs carry exact decimal parameters. Do not
  // silently encode a string/category as an ordinal or pretend mode-3 can
  // average categorical choices. The old pinned imported profile stays valid.
  for(const [name,p] of Object.entries(space)) {
    const values=p.kind==="fixed"?[p.value]:p.kind==="categorical"?p.values:[];
    if(values.some(v=>typeof v!=="number"))return reject("IMPORTED_NON_NUMERIC_SEARCH_NOT_QUALIFIED",["parameter_space_overrides",name]);
    if(p.kind==="categorical"&&values.some(v=>Number.isInteger(v))&&values.some(v=>!Number.isInteger(v)))
      return reject("IMPORTED_MIXED_NUMERIC_CATEGORY_NOT_QUALIFIED",["parameter_space_overrides",name]);
    if(spec.optimization_mode==="mode_3_flat_minima"&&p.kind==="categorical")return reject("IMPORTED_CATEGORICAL_CENTROID_NOT_APPLICABLE",["optimization_mode"]);
  }
  if(overrides.size)return reject("ALPHA_PARAMETER_NOT_DECLARED",["parameter_space_overrides",[...overrides.keys()].sort()[0]!]);
  return {binding:{schema_version:"research.imported-search-binding.v1",source_digest:sourceDigest,entrypoint,
    declaration,declaration_digest:recipeDigest(declaration),parameter_space:space,parameter_space_digest:recipeDigest(space)},refusal:null};
}
export const IMPORTED_SEARCH_SOURCE_DEPENDENCY={adapter_id:IMPORTED_ALPHA_ADAPTER_ID,adapter_contract_digest:IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST};
