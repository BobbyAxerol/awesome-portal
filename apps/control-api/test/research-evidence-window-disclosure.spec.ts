import { describe, expect, it } from "vitest";

import { ResearchEvidenceWindowDisclosureSchema } from "../src/research/evidence.contract";
import { evidenceWindowDisclosure } from "../src/research/evidence.coverage";
import { p13WindowTopology } from "./research-evidence-window-disclosure.fixture";

const preflight = { topology: p13WindowTopology };
const expected = {
  availability: { state: "AVAILABLE", reason_code: null },
  aggregation_scope: "SUM_OF_FOLD_WINDOWS_MAY_OVERLAP",
  is_bars: 144, oos_bars: 96,
  folds: [{ fold: 1, is_bars: 144, oos_bars: 96 }],
  holdout_bars: { state: "DENIED", reason_code: "P13_SEALED_HOLDOUT_BAR_COUNT_DENIED", value: null },
};

describe("B3 CG-FG-S04-07 retained P08 window disclosure", () => {
  it("projects exact admitted P04 fold counts while denying sealed-holdout bars", () => {
    const actual = evidenceWindowDisclosure(preflight.topology);
    expect(actual).toEqual(expected);
    expect(ResearchEvidenceWindowDisclosureSchema.safeParse(actual).success).toBe(true);
    expect(actual.holdout_bars).toEqual({
      state: "DENIED", reason_code: "P13_SEALED_HOLDOUT_BAR_COUNT_DENIED", value: null,
    });
  });

  it("counts multi-fold windows without claiming disjoint unique IS bars", () => {
    const base = preflight.topology.folds as Array<Record<string, unknown>>;
    const advanced = {
      protocol: "advanced_walk_forward", frequency: "weekly", window_mode: "expanding",
      folds: [base[0], {
        ...base[0], fold_id: "fold_001",
        train: { ...(base[0]!.train as Record<string, unknown>), bars: 200 },
        outer_oos: { ...(base[0]!.outer_oos as Record<string, unknown>), bars: 80 },
      }],
      sealed_holdout: null, topology_digest: "a".repeat(64),
    };
    const actual = evidenceWindowDisclosure(advanced);
    expect(actual).toMatchObject({
      availability: { state: "AVAILABLE" }, aggregation_scope: "SUM_OF_FOLD_WINDOWS_MAY_OVERLAP",
      is_bars: 344, oos_bars: 176, folds: [{ fold: 1, is_bars: 144, oos_bars: 96 }, { fold: 2, is_bars: 200, oos_bars: 80 }],
      holdout_bars: { state: "NOT_APPLICABLE", value: null },
    });
    expect(ResearchEvidenceWindowDisclosureSchema.safeParse(actual).success).toBe(true);
  });

  it("keeps pre-retention and pre-count manifests typed absent", () => {
    const missing = evidenceWindowDisclosure(null);
    expect(missing).toMatchObject({ availability: { state: "NOT_PUBLISHED", reason_code: "P08_TOPOLOGY_NOT_RETAINED" }, folds: [] });
    expect(ResearchEvidenceWindowDisclosureSchema.safeParse(missing).success).toBe(true);
    const fold = (preflight.topology.folds as Array<Record<string, unknown>>)[0]!;
    const noBars = {
      ...preflight.topology,
      folds: [{ ...fold, train: { ...(fold.train as Record<string, unknown>), bars: undefined } }],
    };
    expect(evidenceWindowDisclosure(noBars)).toMatchObject({
      availability: { state: "NOT_PUBLISHED", reason_code: "P08_TOPOLOGY_BAR_COUNTS_NOT_RETAINED" },
    });
  });

  it("rejects corrupted retained topology instead of inventing counts", () => {
    const fold = (preflight.topology.folds as Array<Record<string, unknown>>)[0]!;
    expect(() => evidenceWindowDisclosure({
      ...preflight.topology, folds: [{ ...fold, fold_id: "fold_099" }],
    })).toThrow();
    expect(() => evidenceWindowDisclosure({
      ...preflight.topology, folds: [{ ...fold, train: { ...(fold.train as Record<string, unknown>), bars: 0 } }],
    })).toThrow();
    expect(() => evidenceWindowDisclosure({ topology_digest: "bad" })).toThrow();
  });
});
