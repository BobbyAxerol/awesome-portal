/** S05: retained QuantBT WFO endpoints name observed bars (both inclusive), not P08 half-open declarations. */
export const RETAINED_TRAIN_TEST_BASIS = "RETAINED_FOLD_INCLUSIVE_BAR_WINDOWS_AND_PUBLISHED_TEMPORAL_GUARDS_V2" as const;
export interface RetainedTrainTestWindow {
  fold_id: string;
  train_start_utc_ms: number | null;
  train_end_utc_ms: number | null;
  test_start_utc_ms: number | null;
  test_end_utc_ms: number | null;
}

export interface PublishedTemporalGuard {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE";
  value: number | string | boolean | null;
}

export function trainTestDisjoint(
  folds: readonly RetainedTrainTestWindow[],
  purge: PublishedTemporalGuard,
  embargo: PublishedTemporalGuard,
) {
  const basis = RETAINED_TRAIN_TEST_BASIS;
  if (folds.length < 2) {
    return { verdict: "NOT_CHECKABLE" as const, basis, reason_code: "S05_FOLD_PLAN_NOT_COMPLETE" };
  }
  for (const fold of folds) {
    const { train_start_utc_ms: trainStart, train_end_utc_ms: trainEnd,
      test_start_utc_ms: testStart, test_end_utc_ms: testEnd } = fold;
    if ([trainStart, trainEnd, testStart, testEnd].some((value) => value === null || !Number.isSafeInteger(value))) {
      return { verdict: "NOT_CHECKABLE" as const, basis, reason_code: "S05_FOLD_WINDOW_NOT_PUBLISHED" };
    }
    // Equal endpoints describe one observed bar and are not an empty window.
    if (trainStart! > trainEnd! || testStart! > testEnd!) {
      return { verdict: "FAIL" as const, basis, reason_code: "S05_FOLD_WINDOW_INVALID" };
    }
    // The pinned wheel uses train_index[-1]/test_index[-1]. Touching
    // endpoints share that observed bar: fail even with no guard metadata.
    if (trainStart! <= testEnd! && testStart! <= trainEnd!) {
      return { verdict: "FAIL" as const, basis, reason_code: "S05_TRAIN_TEST_WINDOWS_OVERLAP" };
    }
  }
  // Window disjointness alone cannot attest the source's temporal-guard
  // convention. Withhold PASS until both conventions are published.
  if (purge.state !== "AVAILABLE" || embargo.state !== "AVAILABLE"
    || typeof purge.value !== "number" || typeof embargo.value !== "number"
    || !Number.isSafeInteger(purge.value) || purge.value < 0
    || !Number.isSafeInteger(embargo.value) || embargo.value < 0) {
    return { verdict: "NOT_CHECKABLE" as const, basis, reason_code: "S05_TEMPORAL_GUARDS_NOT_PUBLISHED" };
  }
  return { verdict: "PASS" as const, basis, reason_code: null };
}
