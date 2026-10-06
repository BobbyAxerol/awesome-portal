/** Same scalar implementation, distinct immutable route/account declaration. */
import {FULL03_DELTA_BINDING, FULL03_DELTA_DECLARED_CONTRACT, isFull03DeltaBinding} from "./full03-delta.binding";
import {executionRecipe} from "./execution-recipes";

const profile=executionRecipe("p10.delta-pct-equity-wfo-temporal-1h.v1").descriptor;
export const FULL06_DELTA_DECLARED_CONTRACT={...FULL03_DELTA_DECLARED_CONTRACT,version:"1.0.2",
  execution:{...FULL03_DELTA_DECLARED_CONTRACT.execution,execution_route:"pct_equity",
    account_model:"QUANTBT_PERCENT_EQUITY_V1",account:profile.account}};

export const FULL06_DELTA_BINDING = {
  ...FULL03_DELTA_BINDING, alphaVersionId:profile.alpha_binding_requirements.alpha_version_id,
  adapterContractDigest:profile.adapter_contract_digest, declaredContract:FULL06_DELTA_DECLARED_CONTRACT,
};
export const INDEXED_DELTA_BINDINGS = [FULL03_DELTA_BINDING, FULL06_DELTA_BINDING] as const;
export function isIndexedDeltaBinding(version:{alphaId:string;alphaVersionId:string;
  binding:{adapterId:string;contractDigest:string}|null}):boolean {
  return isFull03DeltaBinding(version) || version.alphaId===FULL06_DELTA_BINDING.alphaId
    && version.alphaVersionId===FULL06_DELTA_BINDING.alphaVersionId
    && version.binding?.adapterId===FULL06_DELTA_BINDING.adapterId
    && version.binding.contractDigest===FULL06_DELTA_BINDING.adapterContractDigest;
}
