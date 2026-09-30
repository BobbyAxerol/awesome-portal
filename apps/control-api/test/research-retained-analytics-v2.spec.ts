import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ResearchRetainedAnalyticsV2Schema } from "../src/research/retained-analytics-v2.contract";

const path = resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics-v2.fixed.valid.json");

describe("D-AN-01 sealed analytics v2", () => {
  it("accepts the exact pinned-QuantBT fixture and refuses provenance mismatch", () => {
    const fixture = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    expect(ResearchRetainedAnalyticsV2Schema.safeParse(fixture).success).toBe(true);
    const metrics = fixture.metrics as Record<string, Record<string, unknown>>;
    const tampered = {
      ...fixture,
      metrics: { ...metrics, beta: { ...metrics.beta, input_digest: "0".repeat(64) } },
    };
    expect(ResearchRetainedAnalyticsV2Schema.safeParse(tampered).success).toBe(false);
  });
});
