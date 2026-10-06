/** Additive FULL-03 binding. Historical P04 declaration/digest never changes. */
import {recipeDigest} from "./execution-recipes";
import {P04_DELTA_BINDING, P04_DELTA_DECLARED_CONTRACT} from "./p04-delta.binding";

export const FULL03_DELTA_ADAPTER_ID = "full03.delta-rsi.v1" as const;
export const FULL03_DELTA_ALPHA_VERSION_ID = "av_delta_rsi_polynomial_alpha_1_0_1" as const;
export const FULL03_DELTA_TIMEFRAMES = ["1m","5m","15m","30m","1h","4h","1d"] as const;
export const FULL03_DELTA_DECLARED_CONTRACT = {
  ...P04_DELTA_DECLARED_CONTRACT, version:"1.0.1", timeframes:[...FULL03_DELTA_TIMEFRAMES],
  execution:{...P04_DELTA_DECLARED_CONTRACT.execution,adapter_id:FULL03_DELTA_ADAPTER_ID,
    parameter_mode:"exact_recipe_qualification_v1"},
};
export const FULL03_DELTA_ADAPTER_CONTRACT_DIGEST = recipeDigest({
  schema_version:"research.full03-delta-binding.v1", alpha_id:P04_DELTA_BINDING.alphaId,
  alpha_version_id:FULL03_DELTA_ALPHA_VERSION_ID,declared_contract:FULL03_DELTA_DECLARED_CONTRACT,
  fixed_parameters:P04_DELTA_BINDING.fixedParameters,
});
export const FULL03_DELTA_BINDING = {
  ...P04_DELTA_BINDING,alphaVersionId:FULL03_DELTA_ALPHA_VERSION_ID,adapterId:FULL03_DELTA_ADAPTER_ID,
  adapterContractDigest:FULL03_DELTA_ADAPTER_CONTRACT_DIGEST,declaredContract:FULL03_DELTA_DECLARED_CONTRACT,
};
export function isFull03DeltaBinding(version:{alphaId:string;alphaVersionId:string;
  binding:{adapterId:string;contractDigest:string}|null}):boolean {
  return version.alphaId===FULL03_DELTA_BINDING.alphaId && version.alphaVersionId===FULL03_DELTA_ALPHA_VERSION_ID
    && version.binding?.adapterId===FULL03_DELTA_ADAPTER_ID
    && version.binding.contractDigest===FULL03_DELTA_ADAPTER_CONTRACT_DIGEST;
}
