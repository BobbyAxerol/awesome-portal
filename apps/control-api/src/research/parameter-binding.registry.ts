/**
 * A10b · historical parameter binding, looked up by a run's EXACT digest.
 *
 * P16 used to project the *compiled current* P04 constants over every run.
 * A release that changed the Delta binding would then either relabel an old
 * run's parameters with the new ones, or turn a historically verified run
 * into BLOCKED for no reason of its own. This registry is the fix: a run's
 * frozen parameters and declared ranges are read from the binding its
 * immutable producer row names (`adapter_contract_digest`, and for a WFO run
 * the `execution_profile_digest`), never from "whatever this build ships".
 *
 * Adding a binding in a future release is additive: append an entry, keep
 * every old one. Removing an entry would make its runs answer the typed
 * `P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED` — never a silent
 * substitution of the current constants.
 */

import { createHash } from "node:crypto";

import {
  P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  P04_DELTA_DECLARED_CONTRACT,
  P04_DELTA_FIXED_PARAMETERS,
  P04_DELTA_PROTECTED_KERNEL_SHA256,
  P04_DELTA_SPECIFICATION_SHA256,
} from "./p04-delta.binding";
import { DELTA_WFO_PROFILE, DELTA_WFO_PROFILE_DIGEST, RS02_SIGNAL_NOTIONAL_PROFILE_ID } from "./delta-wfo.profile";
import { DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST } from "./delta-wfo-v2.profile";
import { DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST } from "./delta-causal-inner.profile";
import { DELTA_PER_FOLD_DECAY_PROFILE, DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST,
  DELTA_THREE_WINDOW_OPTIMIZED_PROFILE, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST } from "./full02.profiles";
import { boundWarning, positionPercent, type BoundWarning } from "./bound-warning";

export interface DeclaredRange {
  minimum: number;
  maximum: number;
  step: number;
}

export interface HistoricalParameterBinding {
  /** Exact P04 adapter contract digest the run was admitted under. */
  adapterContractDigest: string;
  /** The declared numeric space of that exact adapter contract. */
  parameterSpace: Readonly<Record<string, DeclaredRange>>;
  /** The P04 fixed-qualification bundle bound by that contract. */
  fixedParameters: Readonly<Record<string, number>>;
  /** sha256 of the canonical fixed bundle (the P14 `parameter_bundle_digest`). */
  fixedBundleDigest: string;
  /** Release that first installed this binding (provenance only). */
  installedInRelease: string;
  /** CG-P16-03: where values the code fixes (not declared, not swept) are hashed. */
  codeFixed?: CodeFixedBinding;
}

/**
 * CG-P16-03 · code-fixed parameters and their hash scope (guide §6.6).
 *
 * A value the strategy code fixes is not a declared parameter: it is not in
 * the θ (params) digest, it is covered by the code digest that the adapter
 * contract digest binds. `values` lists such values only when a
 * machine-readable source publishes them; the Delta kernel publishes none
 * (its fixed choices live in the protected source), so the list is a typed
 * absence and the hash scope is still exact.
 */
export interface CodeFixedBinding {
  state: "AVAILABLE" | "NOT_PUBLISHED";
  reasonCode: string | null;
  values: ReadonlyArray<{ name: string; value: string }>;
  /** sha256 of the protected strategy source (inside the adapter contract digest). */
  codeDigest: string;
  /** sha256 of the strategy specification (inside the adapter contract digest). */
  specificationDigest: string;
}

const DELTA_CODE_FIXED: CodeFixedBinding = Object.freeze({
  state: "NOT_PUBLISHED" as const,
  reasonCode: "P04_DELTA_KERNEL_PUBLISHES_NO_CODE_FIXED_VALUE_LIST",
  values: Object.freeze([]),
  codeDigest: P04_DELTA_PROTECTED_KERNEL_SHA256,
  specificationDigest: P04_DELTA_SPECIFICATION_SHA256,
});

export interface HistoricalProfileBinding {
  profileId: string;
  profileDigest: string;
  adapterContractDigest: string;
  /** Declared space the WFO study searched, from the bound adapter contract. */
  parameterSpace: Readonly<Record<string, DeclaredRange>>;
  /** Python scalar kinds of this exact child, not inferred from decimal text. */
  candidateParameterKinds?: Readonly<Record<string, "int" | "float">>;
  installedInRelease: string;
  /**
   * RS-02 lane profiles a seal of this P10 profile is retained under. The
   * ingest refuses a seal unless the producer carries exactly this profile
   * digest, so a retained lane profile names its binding exactly.
   */
  retainedLaneProfileIds?: readonly string[];
  codeFixed?: CodeFixedBinding;
}

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

/** Same canonical form as `sha256ResearchJson` (pinned by a unit test). */
export function bundleDigest(parameters: Readonly<Record<string, number>>): string {
  return createHash("sha256").update(canonicalJson(parameters), "utf8").digest("hex");
}

const P04_V1: HistoricalParameterBinding = Object.freeze({
  adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  parameterSpace: P04_DELTA_DECLARED_CONTRACT.parameter_space,
  fixedParameters: P04_DELTA_FIXED_PARAMETERS,
  fixedBundleDigest: bundleDigest(P04_DELTA_FIXED_PARAMETERS),
  installedInRelease: "research-loop-v1.1/P10",
  codeFixed: DELTA_CODE_FIXED,
});

const WFO_V1: HistoricalProfileBinding = Object.freeze({
  profileId: DELTA_WFO_PROFILE.profile_id,
  profileDigest: DELTA_WFO_PROFILE_DIGEST,
  adapterContractDigest: DELTA_WFO_PROFILE.adapter_contract_digest,
  parameterSpace: P04_DELTA_DECLARED_CONTRACT.parameter_space,
  // strategy/specification.py parameter tuples + research_child's pinned
  // WFO producer: Optuna preserves int_range vs float_range; what-if pins
  // are allowed only on the same two float axes. Keep this with the binding
  // if a later release changes the child or its declarations.
  candidateParameterKinds: Object.freeze({
    window: "int", rsi_l: "int", signalLength: "int", len_atr1: "int",
    len_atr2: "int", rvol: "float", len_vol: "int", slpercent: "float",
  } as const),
  installedInRelease: "research-loop-v1.1/W1",
  retainedLaneProfileIds: Object.freeze([RS02_SIGNAL_NOTIONAL_PROFILE_ID]),
  codeFixed: DELTA_CODE_FIXED,
});

// The temporal executor changes fold controls, not the pinned Delta kernel,
// parameter space or Python scalar kinds. Keep both historical entries.
const WFO_V2: HistoricalProfileBinding = Object.freeze({
  ...WFO_V1,
  profileId: DELTA_WFO_V2_PROFILE_ID,
  profileDigest: DELTA_WFO_V2_PROFILE_DIGEST,
  installedInRelease: "research-loop-v1.1/B8",
});
const CAUSAL_INNER_V1: HistoricalProfileBinding = Object.freeze({
  ...WFO_V1, profileId: DELTA_CAUSAL_INNER_PROFILE_ID, profileDigest: DELTA_CAUSAL_INNER_PROFILE_DIGEST,
  installedInRelease: "research-loop-v1.1/B8-causal-inner",
  retainedLaneProfileIds: Object.freeze([DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id]),
});
const PER_FOLD_DECAY_V1: HistoricalProfileBinding = Object.freeze({
  ...WFO_V1, profileId: DELTA_PER_FOLD_DECAY_PROFILE_ID, profileDigest: DELTA_PER_FOLD_DECAY_PROFILE_DIGEST,
  installedInRelease: "research-loop-v1.1/FULL-02",
  retainedLaneProfileIds: Object.freeze([DELTA_PER_FOLD_DECAY_PROFILE.current_source.profile_id]),
});
const THREE_WINDOW_OPTIMIZED_V1: HistoricalProfileBinding = Object.freeze({
  ...WFO_V1, profileId: DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, profileDigest: DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST,
  installedInRelease: "research-loop-v1.1/FULL-02",
  retainedLaneProfileIds: Object.freeze([DELTA_THREE_WINDOW_OPTIMIZED_PROFILE.current_source.profile_id]),
});

/**
 * The injectable lookup. Tests construct one with an older binding and a
 * newer "current" one to prove a release that changes binding keeps its old
 * runs verified (P16 A10b).
 */
export class ResearchParameterBindingRegistry {
  private readonly adapters: ReadonlyMap<string, HistoricalParameterBinding>;
  private readonly profiles: ReadonlyMap<string, HistoricalProfileBinding>;

  constructor(
    adapters: readonly HistoricalParameterBinding[] = [P04_V1],
    profiles: readonly HistoricalProfileBinding[] = [WFO_V1, WFO_V2, CAUSAL_INNER_V1, PER_FOLD_DECAY_V1, THREE_WINDOW_OPTIMIZED_V1],
  ) {
    this.adapters = new Map(adapters.map((entry) => [entry.adapterContractDigest, entry]));
    this.profiles = new Map(profiles.map((entry) => [entry.profileDigest, entry]));
  }

  /** The binding for a run's exact adapter digest, or null — never the current constants. */
  byAdapterDigest(digest: string | null | undefined): HistoricalParameterBinding | null {
    return digest ? this.adapters.get(digest) ?? null : null;
  }

  /**
   * The newest installed adapter digest. Used only as the *expected* side of
   * a check for a run whose own digest is not registered at all, so that run
   * reads MISMATCH → BLOCKED (fail closed) rather than borrowing a binding.
   */
  newestAdapterDigest(): string | null {
    let newest: string | null = null;
    for (const digest of this.adapters.keys()) newest = digest;
    return newest;
  }

  /** The WFO profile binding for a run's exact profile digest, or null. */
  byProfileDigest(digest: string | null | undefined): HistoricalProfileBinding | null {
    return digest ? this.profiles.get(digest) ?? null : null;
  }

  /** X2 · B3: the binding a retained RS-02 lane profile was sealed under, or null. */
  byRetainedLaneProfile(profileId: string | null | undefined): HistoricalProfileBinding | null {
    if (!profileId) return null;
    for (const binding of this.profiles.values()) {
      if ((binding.retainedLaneProfileIds ?? []).includes(profileId)) return binding;
    }
    return null;
  }
}

export const DEFAULT_PARAMETER_BINDING_REGISTRY = new ResearchParameterBindingRegistry();

/** Optional Nest token; production uses the default registry above. */
export const RESEARCH_PARAMETER_BINDINGS = Symbol("RESEARCH_PARAMETER_BINDINGS");

/** One declared numeric parameter with its exact value, placement and DR-02 warning. */
export interface DeclaredParameterRow {
  name: string;
  minimum: string;
  maximum: string;
  step: string;
  value: string;
  position_percent: number;
  bound_warning: BoundWarning;
}

export function exactDecimalText(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const text = String(value);
  if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text)) return text;
  // Expand JS's shortest round-trip binary64 representation; no rounding,
  // toFixed or arithmetic over source decimal strings. Imported declarations
  // can legitimately contain 1e-8; the public decimal grammar has no exponent.
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?e([+-]?[0-9]+)$/.exec(text);
  if (!match) return null;
  const digits = match[2] + (match[3] ?? "");
  const point = match[2].length + Number(match[4]);
  const expanded = point <= 0 ? "0." + "0".repeat(-point) + digits
    : point >= digits.length ? digits + "0".repeat(point - digits.length)
    : digits.slice(0, point) + "." + digits.slice(point);
  return match[1] + expanded;
}

/**
 * Rows for a bound parameter map against its historical declaration, in the
 * map's own key order. Returns null when any value is missing from, or
 * outside, its declaration — the caller answers a typed absence, never a row
 * built from a different release's constants.
 */
export function declaredParameterRows(
  space: Readonly<Record<string, DeclaredRange>>,
  values: Readonly<Record<string, number | string>>,
): DeclaredParameterRow[] | null {
  const rows: DeclaredParameterRow[] = [];
  for (const [name, raw] of Object.entries(values)) {
    const range = space[name];
    if (!range) return null;
    const value = typeof raw === "number" ? exactDecimalText(raw) : raw;
    const minimum = exactDecimalText(range.minimum);
    const maximum = exactDecimalText(range.maximum);
    const step = exactDecimalText(range.step);
    if (value === null || minimum === null || maximum === null || step === null) return null;
    const position = positionPercent(value, minimum, maximum);
    if (position === null) return null;
    rows.push({
      name,
      minimum,
      maximum,
      step,
      value,
      position_percent: position,
      bound_warning: boundWarning({ kind: "NUMERIC", value, minimum, maximum }),
    });
  }
  return rows;
}
