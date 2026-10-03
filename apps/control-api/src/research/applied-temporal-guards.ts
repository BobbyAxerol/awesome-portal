/** S05/BR-F3-02: verify actual source windows against retained bar positions, never wall-time arithmetic. */
import type { CurrentSourceFacts, CurrentSourceFoldFacts } from "./current-source.payload";

export const APPLIED_GUARD_BASIS = "RETAINED_OBSERVATION_INDEX_AND_SOURCE_FOLD_GUARDS_V1" as const;
export const MAXIMUM_GUARD_ENDPOINTS = 2560;
export interface GuardFold {
  fold_id: string;
  train_start_utc_ms: number | null;
  train_end_utc_ms: number | null;
  test_start_utc_ms: number | null;
  test_end_utc_ms: number | null;
  fold_facts?: CurrentSourceFoldFacts;
}
export interface GuardIndexWitness {
  rowCount: number;
  firstOrdinal: number | null;
  lastOrdinal: number | null;
  points: Array<{ atUtcMs: number; ordinal: number }>;
}
type Verdict = "PASS" | "FAIL" | "NOT_CHECKABLE";
export interface AppliedGuardFold {
  fold_id: string;
  verdict: Verdict;
  reason_code: string | null;
  configured_bars: number | null;
  observed_bars: number | null;
  clipping: "NONE" | "DATASET_TAIL" | null;
}
export interface AppliedGuardProof {
  verdict: Verdict;
  basis: typeof APPLIED_GUARD_BASIS;
  reason_code: string | null;
  folds: AppliedGuardFold[];
}
const count = (value: number | null | undefined): value is number => Number.isSafeInteger(value) && value! >= 0;

/** At most ten endpoints per fold, deduplicated. No reader opens a source tape. */
export function guardEndpointTimes(folds: readonly GuardFold[]): number[] {
  const values = new Set<number>();
  for (const fold of folds) {
    const g = fold.fold_facts?.guards;
    for (const value of [fold.train_start_utc_ms, fold.train_end_utc_ms, fold.test_start_utc_ms, fold.test_end_utc_ms,
      g?.purge.start_utc_ms, g?.purge.end_utc_ms, g?.embargo.start_utc_ms, g?.embargo.end_utc_ms,
      g?.label_horizon.start_utc_ms, g?.label_horizon.end_utc_ms]) {
      if (count(value)) values.add(value);
    }
  }
  return [...values].sort((a, b) => a - b);
}

export function appliedTemporalGuards(folds: readonly GuardFold[], facts: CurrentSourceFacts | undefined,
  witness: GuardIndexWitness | null, sealedObservationCount: number) {
  const guards = facts?.temporal_guards;
  const unique = new Map<number, number>();
  const ambiguous = new Set<number>();
  for (const point of witness?.points ?? []) {
    if (!count(point.atUtcMs) || !count(point.ordinal) || point.ordinal >= sealedObservationCount) continue;
    if (unique.has(point.atUtcMs)) ambiguous.add(point.atUtcMs);
    else unique.set(point.atUtcMs, point.ordinal);
  }
  const indexComplete = witness !== null && witness.rowCount === sealedObservationCount && sealedObservationCount > 0
    && witness.firstOrdinal === 0 && witness.lastOrdinal === sealedObservationCount - 1;
  const ordinal = (at: number | null | undefined) => count(at) && !ambiguous.has(at) ? unique.get(at) : undefined;
  const windowOrdinals = (window: NonNullable<CurrentSourceFoldFacts["guards"]>["purge"]) => {
    if (window.bars === 0) return window.start_utc_ms === null && window.end_utc_ms === null ? { first: null, last: null } : null;
    const first = ordinal(window.start_utc_ms), last = ordinal(window.end_utc_ms);
    return first !== undefined && last !== undefined ? { first, last } : null;
  };

  function verify(fold: GuardFold, kind: "purge" | "embargo"): AppliedGuardFold {
    const configured = kind === "purge" ? guards?.purge_bars : guards?.embargo_bars;
    const native = fold.fold_facts?.guards?.[kind];
    const result = (verdict: Verdict, reason: string | null, clipping: AppliedGuardFold["clipping"] = null): AppliedGuardFold => ({
      fold_id: fold.fold_id, verdict, reason_code: reason, configured_bars: configured ?? null,
      observed_bars: native?.bars ?? null, clipping,
    });
    if (!count(configured)) return result("NOT_CHECKABLE", "S05_CONFIGURED_TEMPORAL_GUARD_NOT_PUBLISHED");
    if (!native || !count(native.bars)) return result("NOT_CHECKABLE", "S05_APPLIED_GUARD_WINDOW_NOT_RETAINED");
    if (native.bars > configured || kind === "purge" && native.bars !== configured) {
      return result("FAIL", "S05_APPLIED_GUARD_COUNT_MISMATCH");
    }
    if (!indexComplete) return result("NOT_CHECKABLE", "S05_RETAINED_GUARD_INDEX_NOT_COMPLETE");
    const trainFirst = ordinal(fold.train_start_utc_ms), trainLast = ordinal(fold.train_end_utc_ms);
    const testFirst = ordinal(fold.test_start_utc_ms), testLast = ordinal(fold.test_end_utc_ms);
    if ([trainFirst, trainLast, testFirst, testLast].some(value => value === undefined)) {
      return result("NOT_CHECKABLE", "S05_FOLD_BOUNDARY_NOT_IN_RETAINED_INDEX");
    }
    if (trainFirst! > trainLast! || testFirst! > testLast! || trainLast! >= testFirst!) {
      return result("FAIL", "S05_FOLD_INDEX_CHRONOLOGY_INVALID");
    }
    if (!count(fold.fold_facts?.train_bars) || !count(fold.fold_facts?.test_bars)) {
      return result("NOT_CHECKABLE", "S05_FOLD_BAR_COUNTS_NOT_RETAINED");
    }
    if (fold.fold_facts.train_bars !== trainLast! - trainFirst! + 1
      || fold.fold_facts.test_bars !== testLast! - testFirst! + 1) {
      return result("FAIL", "S05_FOLD_INDEX_COUNT_MISMATCH");
    }
    if (native.bars === 0 && (native.start_utc_ms !== null || native.end_utc_ms !== null)) {
      return result("FAIL", "S05_ZERO_GUARD_HAS_NONEMPTY_WINDOW");
    }
    const bounds = windowOrdinals(native);
    if (!bounds) return result("NOT_CHECKABLE", "S05_GUARD_BOUNDARY_NOT_IN_RETAINED_INDEX");
    if (native.bars > 0 && (bounds.first === null || bounds.last === null || bounds.first > bounds.last
      || bounds.last - bounds.first + 1 !== native.bars)) return result("FAIL", "S05_GUARD_INDEX_COUNT_MISMATCH");
    if (kind === "purge") {
      const label = fold.fold_facts!.guards!.label_horizon;
      if (!count(guards?.label_horizon_bars) || !count(label.bars)) return result("NOT_CHECKABLE", "S05_LABEL_HORIZON_NOT_RETAINED");
      if (label.bars !== guards.label_horizon_bars) return result("FAIL", "S05_LABEL_HORIZON_COUNT_MISMATCH");
      if (label.bars === 0 && (label.start_utc_ms !== null || label.end_utc_ms !== null)) {
        return result("FAIL", "S05_ZERO_LABEL_HORIZON_HAS_NONEMPTY_WINDOW");
      }
      const labelBounds = windowOrdinals(label);
      if (!labelBounds) return result("NOT_CHECKABLE", "S05_LABEL_HORIZON_BOUNDARY_NOT_IN_RETAINED_INDEX");
      if (testFirst !== trainLast! + configured + label.bars + 1
        || native.bars > 0 && (bounds.first !== trainLast! + 1 || bounds.last !== trainLast! + configured)
        || label.bars > 0 && (labelBounds.first !== trainLast! + configured + 1 || labelBounds.last !== testFirst! - 1)) {
        return result("FAIL", "S05_PURGE_NOT_EXCLUDED_FROM_TRAIN_TEST");
      }
      return result("PASS", null, "NONE");
    }
    const expected = Math.min(configured, sealedObservationCount - testLast! - 1);
    if (native.bars !== expected) return result("FAIL", "S05_EMBARGO_TAIL_COUNT_MISMATCH");
    if (native.bars > 0 && (bounds.first !== testLast! + 1 || bounds.last !== testLast! + expected)) {
      return result("FAIL", "S05_EMBARGO_NOT_AFTER_TEST");
    }
    return result("PASS", null, expected < configured ? "DATASET_TAIL" : "NONE");
  }
  const aggregate = (kind: "purge" | "embargo"): AppliedGuardProof => {
    const rows = folds.map(fold => verify(fold, kind));
    const failed = rows.find(row => row.verdict === "FAIL");
    const missing = rows.find(row => row.verdict === "NOT_CHECKABLE");
    const incomplete = folds.length < 2;
    return { verdict: failed ? "FAIL" : missing || incomplete ? "NOT_CHECKABLE" : "PASS", basis: APPLIED_GUARD_BASIS,
      reason_code: failed?.reason_code ?? missing?.reason_code ?? (incomplete ? "S05_FOLD_PLAN_NOT_COMPLETE" : null), folds: rows };
  };
  return { purge_applied: aggregate("purge"), embargo_respected: aggregate("embargo") };
}
