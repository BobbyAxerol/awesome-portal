/**
 * P10's one server-owned executable binding.
 *
 * This is intentionally data, not a registry for arbitrary Research source.
 * It ties the already protected Portal Delta kernel to the one P04 child that
 * is installed in this release.  P07 imports never enter this mapping.
 */

import { createHash } from "node:crypto";

export const P04_DELTA_ADAPTER_ID = "p04.delta-rsi.v1" as const;
export const P04_DELTA_ALPHA_ID = "delta-rsi-polynomial-alpha" as const;
export const P04_DELTA_ALPHA_VERSION_ID = "av_delta_rsi_polynomial_alpha_1_0_0" as const;
export const P04_DELTA_STRATEGY_VERSION = "1.0.0" as const;
export const P04_DELTA_PROTECTED_KERNEL_SHA256 =
  "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d" as const;
export const P04_DELTA_SPECIFICATION_SHA256 =
  "3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730" as const;

/** The exact parameters consumed by the pinned P06 child in this release. */
export const P04_DELTA_FIXED_PARAMETERS = Object.freeze({
  window: 32,
  rsi_l: 20,
  signalLength: 9,
  len_atr1: 10,
  len_atr2: 42,
  rvol: 1.6,
  len_vol: 16,
  slpercent: 1.3,
});
/**
 * Publicly safe execution-input contract.  It contains no code, source path,
 * child command, storage path or secret.  P08 reads only the data-requirement
 * fields; P10 pins the full canonical digest before it admits a run.
 */
export const P04_DELTA_DECLARED_CONTRACT = Object.freeze({
  schema_version: "research.alpha-source.v1",
  version: P04_DELTA_STRATEGY_VERSION,
  entrypoint: "strategy.delta_rsi:generate_signals",
  required_columns: ["open", "high", "low", "close", "volume"],
  timeframes: ["1h", "4h", "1d"],
  warmup_bars: 300,
  determinism: { seed_required: false, external_io: false },
  parameter_space: {
    window: { minimum: 20, maximum: 60, step: 2 },
    rsi_l: { minimum: 12, maximum: 30, step: 1 },
    signalLength: { minimum: 3, maximum: 20, step: 1 },
    len_atr1: { minimum: 5, maximum: 20, step: 1 },
    len_atr2: { minimum: 25, maximum: 60, step: 1 },
    rvol: { minimum: 1, maximum: 2.5, step: 0.1 },
    len_vol: { minimum: 8, maximum: 40, step: 2 },
    slpercent: { minimum: 0.7, maximum: 2.5, step: 0.1 },
  },
  execution: {
    adapter_id: P04_DELTA_ADAPTER_ID,
    engine_release_id: "er_quantbt_111",
    execution_route: "signal_notional",
    protocol: "three_window_decay",
    parameter_mode: "fixed_qualification_v1",
  },
  provenance: {
    protected_kernel_sha256: P04_DELTA_PROTECTED_KERNEL_SHA256,
    specification_sha256: P04_DELTA_SPECIFICATION_SHA256,
  },
});

function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export const P04_DELTA_ADAPTER_CONTRACT_DIGEST = createHash("sha256")
  .update(canonicalJson({
    schema_version: "research.p04-delta-binding.v1",
    alpha_id: P04_DELTA_ALPHA_ID,
    alpha_version_id: P04_DELTA_ALPHA_VERSION_ID,
    declared_contract: P04_DELTA_DECLARED_CONTRACT,
    fixed_parameters: P04_DELTA_FIXED_PARAMETERS,
  }), "utf8")
  .digest("hex");

export const P04_DELTA_BINDING = Object.freeze({
  alphaId: P04_DELTA_ALPHA_ID,
  alphaVersionId: P04_DELTA_ALPHA_VERSION_ID,
  alphaName: "Delta-RSI Polynomial Alpha",
  executionSubjectId: "portal.p04.delta-rsi:1.0.0",
  adapterId: P04_DELTA_ADAPTER_ID,
  adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  codeDigest: P04_DELTA_PROTECTED_KERNEL_SHA256,
  entrypoint: "strategy.delta_rsi:generate_signals",
  dependencyRef: "portal.p04.delta-rsi:quantbt-engine==1.1.1",
  declaredContract: P04_DELTA_DECLARED_CONTRACT,
  fixedParameters: P04_DELTA_FIXED_PARAMETERS,
});
