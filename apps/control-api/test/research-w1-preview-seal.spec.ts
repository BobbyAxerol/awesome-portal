import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ResearchCurrentSourceSealIngressSchema } from "../src/research/artifact-ingress.contract";
import { CurrentSourceSummarySchema } from "../src/research/current-source.payload";

/**
 * The exact seal body a real WFO run produced on the preview. Local fakes had
 * accepted every body; only this one exposed that the TS summary schema did
 * not admit the exporter's `counts` block.
 */
const fixture = JSON.parse(readFileSync(join(__dirname, "research-w1-preview-seal.fixture.json"), "utf8")) as {
  seal: Record<string, unknown> & { summary: Record<string, unknown>; table_rows: Record<string, number> };
};

describe("W1 real preview current-source seal", () => {
  it("passes the ingress schema and the summary schema as produced", () => {
    expect(ResearchCurrentSourceSealIngressSchema.safeParse(fixture.seal).success).toBe(true);
    const summary = CurrentSourceSummarySchema.safeParse(fixture.seal.summary);
    expect(summary.success).toBe(true);
    expect(summary.success && summary.data.counts).toEqual({
      folds: fixture.seal.table_rows.FOLD,
      trials: fixture.seal.table_rows.TRIAL,
      candidates: fixture.seal.table_rows.CANDIDATE,
    });
  });

  it("carries more than one fold and the three locked trials", () => {
    expect(fixture.seal.table_rows.FOLD).toBeGreaterThanOrEqual(2);
    expect(fixture.seal.table_rows.TRIAL).toBe(3);
  });

  it("still rejects an unknown summary key", () => {
    expect(CurrentSourceSummarySchema.safeParse({ ...fixture.seal.summary, extra: 1 }).success).toBe(false);
  });
});
