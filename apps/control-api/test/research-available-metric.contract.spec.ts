import { describe, expect, it } from "vitest";
import { ResearchRunLibraryItemSchema } from "../src/research/run-library.contract";
import { ResearchAttemptLineageNodeSchema } from "../src/research/lineage.contract";
import { ResearchCompareResponseSchema } from "../src/research/compare.contract";

const available = { state: "AVAILABLE", reason_code: null };
const absent = { state: "NOT_PUBLISHED", reason_code: "SOURCE_VALUE_NOT_PUBLISHED" };
const libraryMetric = ResearchRunLibraryItemSchema.shape.stats.items[0];
const lineageMetric = ResearchAttemptLineageNodeSchema.shape.run_facts.shape.oos_sharpe;
const compareMetric = ResearchCompareResponseSchema.shape.result.options[0].shape.attempts.element.shape.original_metrics.element;

describe("B8 AVAILABLE metric wire invariants", () => {
  for (const [name, schema, fixture] of [
    ["Library", libraryMetric, {
      key: "oos_sharpe", label: "OOS Sharpe", role: "OOS_SHARPE", tone: "DEFAULT",
      scope: "OOS", definition_id: "research.metric.v1.oos_sharpe",
    }],
    ["Lineage", lineageMetric, {
      source: "P13_EVIDENCE_PROJECTION", scope: "OOS", definition_id: "research.metric.v1.oos_sharpe",
    }],
    ["Compare", compareMetric, {
      key: "OOS_SHARPE", scope: "OOS", definition_id: "research.metric.v1.oos_sharpe",
    }],
  ] as const) {
    it(`${name} refuses AVAILABLE/null, accepts a genuine zero and typed absence`, () => {
      expect(schema.safeParse({ ...fixture, value: null, availability: available }).success).toBe(false);
      expect(schema.safeParse({ ...fixture, value: "0", availability: available }).success).toBe(true);
      expect(schema.safeParse({ ...fixture, value: null, availability: absent }).success).toBe(true);
    });
  }
});
