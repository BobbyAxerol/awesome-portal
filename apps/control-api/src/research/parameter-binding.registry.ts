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
} from "./p04-delta.binding";
import { DELTA_WFO_PROFILE, DELTA_WFO_PROFILE_DIGEST } from "./delta-wfo.profile";
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
}

export interface HistoricalProfileBinding {
  profileId: string;
  profileDigest: string;
  adapterContractDigest: string;
  /** Declared space the WFO study searched, from the bound adapter contract. */
  parameterSpace: Readonly<Record<string, DeclaredRange>>;
  installedInRelease: string;
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
});

const WFO_V1: HistoricalProfileBinding = Object.freeze({
  profileId: DELTA_WFO_PROFILE.profile_id,
  profileDigest: DELTA_WFO_PROFILE_DIGEST,
  adapterContractDigest: DELTA_WFO_PROFILE.adapter_contract_digest,
  parameterSpace: P04_DELTA_DECLARED_CONTRACT.parameter_space,
  installedInRelease: "research-loop-v1.1/W1",
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
    profiles: readonly HistoricalProfileBinding[] = [WFO_V1],
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
  return /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text) ? text : null;
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
