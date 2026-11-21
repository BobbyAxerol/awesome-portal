import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { RETAINED_TRAIN_TEST_BASIS, trainTestDisjoint } from "../src/research/train-test-disjoint";

const published = { state: "AVAILABLE" as const, value: 1 };
const folds = [
  { fold_id: "f-0", train_start_utc_ms: 0, train_end_utc_ms: 100,
    test_start_utc_ms: 101, test_end_utc_ms: 200 },
  { fold_id: "f-1", train_start_utc_ms: 100, train_end_utc_ms: 200,
    test_start_utc_ms: 201, test_end_utc_ms: 300 },
];

describe("CG-FG-S05-01 retained train/test disjointness", () => {
  it("matches canonical PASS/FAIL fixtures", () => {
    const fixture = JSON.parse(readFileSync(resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures/research-current-source.disjoint-verdicts.valid.json"), "utf8")) as {
      basis: string;
      cases: { folds: typeof folds; purge: typeof published; embargo: typeof published;
        expected: { verdict: string; reason_code: string | null } }[];
    };
    for (const item of fixture.cases) {
      expect(trainTestDisjoint(item.folds, item.purge, item.embargo)).toEqual({ ...item.expected, basis: RETAINED_TRAIN_TEST_BASIS });
    }
  });
  it("publishes PASS only with complete disjoint folds and both temporal guards", () => {
    expect(trainTestDisjoint(folds, published, published)).toMatchObject({
      verdict: "PASS", reason_code: null,
      basis: RETAINED_TRAIN_TEST_BASIS,
    });
  });

  it("publishes FAIL on any overlapping fold even when guard metadata is absent", () => {
    const overlap = folds.map((fold) => ({ ...fold }));
    overlap[1]!.train_end_utc_ms = 230;
    expect(trainTestDisjoint(overlap, { state: "NOT_PUBLISHED", value: null }, published)).toMatchObject({
      verdict: "FAIL", reason_code: "S05_TRAIN_TEST_WINDOWS_OVERLAP",
    });
  });

  it("does not turn missing windows or guard conventions into a green tick", () => {
    expect(trainTestDisjoint([{ ...folds[0]!, train_end_utc_ms: null }, folds[1]!], published, published)).toMatchObject({
      verdict: "NOT_CHECKABLE", reason_code: "S05_FOLD_WINDOW_NOT_PUBLISHED",
    });
    expect(trainTestDisjoint(folds, { state: "NOT_PUBLISHED", value: null }, published)).toMatchObject({
      verdict: "NOT_CHECKABLE", reason_code: "S05_TEMPORAL_GUARDS_NOT_PUBLISHED",
    });
  });

  it("refuses a shared observed endpoint instead of treating retained ends as half-open", () => {
    const touching = folds.map(fold => ({ ...fold }));
    touching[0]!.train_end_utc_ms = touching[0]!.test_start_utc_ms;
    expect(trainTestDisjoint(touching, published, published)).toMatchObject({
      verdict: "FAIL", reason_code: "S05_TRAIN_TEST_WINDOWS_OVERLAP",
    });
  });

  it("accepts distinct one-bar train/test windows and refuses the same single bar", () => {
    const singleBar = folds.map((fold, i) => ({ ...fold,
      train_start_utc_ms: i * 100, train_end_utc_ms: i * 100,
      test_start_utc_ms: i * 100 + 1, test_end_utc_ms: i * 100 + 1,
    }));
    expect(trainTestDisjoint(singleBar, published, published)).toMatchObject({ verdict: "PASS" });
    expect(trainTestDisjoint([{ ...singleBar[0]!, test_start_utc_ms: 0, test_end_utc_ms: 0 }, singleBar[1]!],
      published, published)).toMatchObject({ verdict: "FAIL", reason_code: "S05_TRAIN_TEST_WINDOWS_OVERLAP" });
  });
});
