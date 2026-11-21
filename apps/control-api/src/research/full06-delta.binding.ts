/** Same scalar implementation, distinct immutable route/account declaration. */
import {FULL03_DELTA_BINDING, FULL03_DELTA_DECLARED_CONTRACT, isFull03DeltaBinding} from "./full03-delta.binding";
import {executionRecipe} from "./execution-recipes";
import {NATIVE_DELTA_BINDINGS} from './native-delta.binding';

const profile=executionRecipe("p10.delta-pct-equity-wfo-temporal-1h.v1").descriptor;
export const FULL06_DELTA_DECLARED_CONTRACT={...FULL03_DELTA_DECLARED_CONTRACT,version:"1.0.2",
  execution:{...FULL03_DELTA_DECLARED_CONTRACT.execution,execution_route:"pct_equity",
    account_model:"QUANTBT_PERCENT_EQUITY_V1",account:profile.account}};

export const FULL06_DELTA_BINDING = {
  ...FULL03_DELTA_BINDING, alphaVersionId:profile.alpha_binding_requirements.alpha_version_id,
  adapterContractDigest:profile.adapter_contract_digest, declaredContract:FULL06_DELTA_DECLARED_CONTRACT,
};
export const INDEXED_DELTA_BINDINGS = [FULL03_DELTA_BINDING, FULL06_DELTA_BINDING,...NATIVE_DELTA_BINDINGS] as const;
export function isIndexedDeltaBinding(version:{alphaId:string;alphaVersionId:string;
  binding:{adapterId:string;contractDigest:string}|null}):boolean {
  return INDEXED_DELTA_BINDINGS.some(binding=>version.alphaId===binding.alphaId
    &&version.alphaVersionId===binding.alphaVersionId&&version.binding?.adapterId===binding.adapterId
    &&version.binding?.contractDigest===binding.adapterContractDigest);
}
