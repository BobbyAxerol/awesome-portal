import { describe, expect, it } from "vitest";

import { ResearchCompareQuerySchema } from "../src/research/compare.contract";

describe("P20 Compare request contract", () => {
  it("keeps the public grammar named, bounded and pair-only", () => {
    expect(ResearchCompareQuerySchema.parse({})).toEqual({
      workspace_id: undefined, mode: "attempts", run_ids: [],
    });
    expect(ResearchCompareQuerySchema.parse({ mode: "pair", runs: "run_left,run.right" })).toEqual({
      workspace_id: undefined, mode: "pair", run_ids: ["run_left", "run.right"],
    });
    expect(ResearchCompareQuerySchema.safeParse({ mode: "pair", runs: "run_left" }).success).toBe(false);
    expect(ResearchCompareQuerySchema.safeParse({ mode: "markets", runs: "run_left,run_right" }).success).toBe(false);
    expect(ResearchCompareQuerySchema.safeParse({ mode: "pair", runs: "run_left,run_left" }).success).toBe(false);
    expect(ResearchCompareQuerySchema.safeParse({ mode: "pair", runs: "a,b,c" }).success).toBe(false);
    expect(ResearchCompareQuerySchema.safeParse({ relation: "current_source_rows_v1" }).success).toBe(false);
  });
});
