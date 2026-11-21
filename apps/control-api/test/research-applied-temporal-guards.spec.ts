import { describe, expect, it } from "vitest";
import { appliedTemporalGuards, guardEndpointTimes, type GuardFold, type GuardIndexWitness } from "../src/research/applied-temporal-guards";
import { AppliedTemporalGuardProofSchema } from "../src/research/current-source.contract";
import type { CurrentSourceFacts, CurrentSourceFoldFacts } from "../src/research/current-source.payload";
import { openApiValidator } from "./research-rf05-openapi";

// Deliberately irregular market timestamps: no bar-duration or calendar assumption is permitted.
const times = Array.from({ length: 24 }, (_, n) => 1_700_000_000_000 + n * n * 100_000);
const window = (first: number, last: number) => first > last ? { bars: 0, start_utc_ms: null, end_utc_ms: null }
  : { bars: last - first + 1, start_utc_ms: times[first]!, end_utc_ms: times[last]! };
function fold(id: string, testFirst: number, testLast: number, purge = 2, label = 1, embargo = 3): GuardFold {
  const trainLast = testFirst - purge - label - 1;
  return { fold_id: id, train_start_utc_ms: times[0]!, train_end_utc_ms: times[trainLast]!,
    test_start_utc_ms: times[testFirst]!, test_end_utc_ms: times[testLast]!, fold_facts: {
      schema_version: "research.current-source-fold-facts.v1", train_bars: trainLast + 1, test_bars: testLast - testFirst + 1,
      guards: { warmup: window(1, 0), validation: window(1, 0), label_horizon: window(testFirst - label, testFirst - 1),
        purge: window(trainLast + 1, trainLast + purge), embargo: window(testLast + 1, Math.min(times.length - 1, testLast + embargo)),
        cutoff_utc_ms: times[testLast]!, account_policy: "carry" }, oos_score: null, oos_path: null,
    } };
}
const witness: GuardIndexWitness = { rowCount: times.length, firstOrdinal: 0, lastOrdinal: times.length - 1,
  points: times.map((atUtcMs, ordinal) => ({ atUtcMs, ordinal })) };
const facts = { temporal_guards: { purge_bars: 2, embargo_bars: 3, label_horizon_bars: 1 } } as CurrentSourceFacts;
const native = () => [fold("0", 8, 12), fold("1", 16, 22)];
const prove = (folds = native(), source = facts, index: GuardIndexWitness | null = witness) => appliedTemporalGuards(folds, source, index, times.length);

describe("BR-F3-02 native applied guards", () => {
  it("proves positive nonzero purge and exact/legitimately clipped embargo on irregular bars", () => {
    const result = prove();
    expect(result.purge_applied.verdict).toBe("PASS");
    expect(result.embargo_respected.folds.map(row => [row.observed_bars, row.clipping])).toEqual([[3, "NONE"], [1, "DATASET_TAIL"]]);
    for (const proof of Object.values(result)) {
      expect(AppliedTemporalGuardProofSchema.safeParse(proof).success).toBe(true);
      openApiValidator("research-current-source.openapi.json", "AppliedTemporalGuardProof").assert(proof);
    }
  });
  it("does not turn absent historical windows into zero or disjointness PASS", () => {
    const folds = native(); delete folds[0]!.fold_facts;
    expect(prove(folds).purge_applied).toMatchObject({ verdict: "NOT_CHECKABLE", reason_code: "S05_APPLIED_GUARD_WINDOW_NOT_RETAINED" });
    expect(prove(folds).embargo_respected.folds[0]!.observed_bars).toBeNull();
  });
  it("requires actual configured guards and a dense same-seal retained population", () => {
    expect(prove(native(), { temporal_guards: { purge_bars: null } } as never).purge_applied.verdict).toBe("NOT_CHECKABLE");
    for (const index of [null, { ...witness, rowCount: 23 }, { ...witness, firstOrdinal: 1 }, { ...witness, lastOrdinal: 24 }]) {
      expect(prove(native(), facts, index).embargo_respected.verdict).toBe("NOT_CHECKABLE");
    }
  });
  it("checks purge and label horizon independently of disjointness", () => {
    const folds = native(); folds[0]!.fold_facts!.guards!.purge = window(3, 4);
    expect(prove(folds).purge_applied).toMatchObject({ verdict: "FAIL", reason_code: "S05_PURGE_NOT_EXCLUDED_FROM_TRAIN_TEST" });
    expect(prove(folds).embargo_respected.verdict).toBe("PASS");
  });
  it("refuses under/over-reported purge and a false full embargo at the dataset tail", () => {
    const folds = native(); folds[0]!.fold_facts!.guards!.purge.bars = 1;
    expect(prove(folds).purge_applied.verdict).toBe("FAIL");
    folds[1]!.fold_facts!.guards!.embargo.bars = 3;
    expect(prove(folds).embargo_respected.verdict).toBe("FAIL");
  });
  it("does not accept shortened embargo in the middle of the dataset", () => {
    const folds = native(); folds[0]!.fold_facts!.guards!.embargo = window(13, 14);
    expect(prove(folds).embargo_respected).toMatchObject({ verdict: "FAIL", reason_code: "S05_EMBARGO_TAIL_COUNT_MISMATCH" });
  });
  it("rejects an embargo overlapping test despite the correct count", () => {
    const folds = native(); folds[0]!.fold_facts!.guards!.embargo = window(12, 14);
    expect(prove(folds).embargo_respected).toMatchObject({ verdict: "FAIL", reason_code: "S05_EMBARGO_NOT_AFTER_TEST" });
  });
  it("zero guards require explicitly empty source windows; last-bar clipping is separately attested", () => {
    const zeroFacts = { temporal_guards: { purge_bars: 0, embargo_bars: 0, label_horizon_bars: 0 } } as CurrentSourceFacts;
    expect(prove([fold("0", 8, 12, 0, 0, 0), fold("1", 16, 23, 0, 0, 0)], zeroFacts).purge_applied.verdict).toBe("PASS");
    const folds = [fold("0", 8, 12), fold("1", 16, 23)];
    expect(prove(folds).embargo_respected.folds[1]).toMatchObject({ verdict: "PASS", observed_bars: 0, clipping: "DATASET_TAIL" });
    folds[1]!.fold_facts!.guards!.embargo.start_utc_ms = times[23]!;
    expect(prove(folds).embargo_respected.verdict).toBe("FAIL");
  });
  it("does not guess unknown/ambiguous boundary positions or missing label facts", () => {
    const missing = { ...witness, points: witness.points.filter(point => point.ordinal !== 13) };
    expect(prove(native(), facts, missing).embargo_respected.verdict).toBe("NOT_CHECKABLE");
    const ambiguous = { ...witness, points: [...witness.points, witness.points[8]!] };
    expect(prove(native(), facts, ambiguous).purge_applied.verdict).toBe("NOT_CHECKABLE");
    const folds = native(); folds[0]!.fold_facts!.guards!.label_horizon.bars = null;
    expect(prove(folds).purge_applied.reason_code).toBe("S05_LABEL_HORIZON_NOT_RETAINED");
  });
  it("checks source index/window cardinality and known FAIL dominates missing other-fold facts", () => {
    const folds = native(); folds[0]!.fold_facts!.train_bars! += 1; delete folds[1]!.fold_facts;
    expect(prove(folds).purge_applied).toMatchObject({ verdict: "FAIL", reason_code: "S05_FOLD_INDEX_COUNT_MISMATCH" });
  });
  it("requires the full plan, exposes finite endpoint input and rejects inconsistent public verdicts", () => {
    expect(prove([native()[0]!]).purge_applied.verdict).toBe("NOT_CHECKABLE");
    expect(guardEndpointTimes(native()).length).toBeLessThanOrEqual(20);
    const proof = prove().purge_applied;
    expect(AppliedTemporalGuardProofSchema.safeParse({ ...proof, reason_code: "S05_FAKE_PASS" }).success).toBe(false);
    const forged = { ...proof, folds: [{ ...proof.folds[0]!, verdict: "NOT_CHECKABLE", reason_code: "S05_MISSING", clipping: null }, proof.folds[1]!] };
    expect(AppliedTemporalGuardProofSchema.safeParse(forged).success).toBe(false);
    expect(openApiValidator("research-current-source.openapi.json", "AppliedTemporalGuardProof").check(forged)).toBe(false);
  });
});
