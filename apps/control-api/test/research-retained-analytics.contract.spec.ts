import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { ResearchRetainedAnalyticsSchema } from "../src/research/retained-analytics.contract";
import { CurrentSourceSummarySchema } from "../src/research/current-source.payload";
import { ResearchEvidenceSourceSchema } from "../src/research/progress.contract";
import { p13EvidenceSourceFixture } from "./research-evidence.fixture";
import { openApiValidator } from "./research-rf05-openapi";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = () => JSON.parse(readFileSync(resolve(root, "fixtures/research-retained-analytics.fixed.valid.json"), "utf8"));
const canonical = new Ajv2020({ strict: false, allErrors: true }).compile(JSON.parse(readFileSync(resolve(root, "schemas/research-retained-analytics.v1.schema.json"), "utf8")));
const published = ["research-evidence.openapi.json", "research-current-source.openapi.json"].map(document => openApiValidator(document, "RetainedAnalytics"));

describe("E11/E14 sealed engine analytics wire", () => {
  it("agrees across canonical JSON, Zod, both public OpenAPI surfaces and private ingress", () => {
    const value = fixture();
    expect(canonical(value), JSON.stringify(canonical.errors)).toBe(true);
    expect(ResearchRetainedAnalyticsSchema.safeParse(value).success).toBe(true);
    published.forEach(schema => schema.assert(value));
    const source = p13EvidenceSourceFixture();
    const privateBlock = fixture();
    privateBlock.oos_observation_count = source.source.oos_observation_count;
    privateBlock.total_trade_count.value = source.direct.num_trades;
    privateBlock.in_sample_equity.start_utc_ms -= 120000;
    privateBlock.in_sample_equity.end_exclusive_utc_ms -= 120000;
    privateBlock.in_sample_equity.points.forEach(point => { point.at_utc_ms -= 120000; });
    expect(ResearchEvidenceSourceSchema.safeParse({ ...source, summary_analytics: privateBlock }).success).toBe(true);
    privateBlock.total_trade_count.value = "999";
    expect(ResearchEvidenceSourceSchema.safeParse({ ...source, summary_analytics: privateBlock }).success).toBe(false);
  });
  it.each(["net_oos_return", "total_trade_count"])("rejects AVAILABLE+null for %s in every contract", key => {
    const value = fixture(); value[key].value = null;
    expect(canonical(value)).toBe(false);
    expect(ResearchRetainedAnalyticsSchema.safeParse(value).success).toBe(false);
    published.forEach(schema => expect(schema.check(value)).toBe(false));
  });
  it("rejects invented trade tiles, missing typed reasons, decimals-as-numbers and source scopes", () => {
    for (const change of [
      value => { value.behaviour.win_rate.state = "AVAILABLE"; value.behaviour.win_rate.reason_code = null; },
      value => { value.behaviour.payoff_ratio.reason_code = null; },
      value => { value.net_oos_return.value = 0.012; },
      value => { value.net_oos_return.scope = "CHILD_TAPE"; },
      value => { value.net_oos_return.origin = "SOURCE_DERIVED"; },
      value => { value.total_trade_count.value = "1.5"; },
    ] as Array<(value: any) => void>) {
      const value = fixture(); change(value);
      expect(canonical(value)).toBe(false);
      expect(ResearchRetainedAnalyticsSchema.safeParse(value).success).toBe(false);
      published.forEach(schema => expect(schema.check(value)).toBe(false));
    }
  });
  it("refuses future/OOS IS points, duplicate time, dishonest counts and oversized curves", () => {
    for (const change of [
      value => { value.in_sample_equity.points[1].at_utc_ms = value.in_sample_equity.end_exclusive_utc_ms; },
      value => { value.in_sample_equity.points[1].at_utc_ms = value.in_sample_equity.points[0].at_utc_ms; },
      value => { value.in_sample_equity.emitted_point_count = 1; },
      value => { value.behaviour.exposure_fraction.value = "1.01"; },
    ] as Array<(value: any) => void>) {
      const value = fixture(); change(value);
      expect(ResearchRetainedAnalyticsSchema.safeParse(value).success).toBe(false);
    }
    const value = fixture(); value.in_sample_equity.points = Array.from({ length: 25 }, () => value.in_sample_equity.points[0]);
    expect(canonical(value)).toBe(false);
    published.forEach(schema => expect(schema.check(value)).toBe(false));
  });
  it("accepts a sealed summary block but preserves byte-compatible older seals", () => {
    const summary = JSON.parse(readFileSync(resolve(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")).summary;
    expect(CurrentSourceSummarySchema.parse(summary)).not.toHaveProperty("summary_analytics");
    const analytics = fixture();
    expect(CurrentSourceSummarySchema.safeParse({ ...summary, summary_analytics: analytics }).success).toBe(false);
    analytics.in_sample_equity = { state: "NOT_PUBLISHED", reason_code: "QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT",
      scope: "SELECTED_CANDIDATE_IS", source_locator: "QuantBT.walk_forward.output.final_account_not_candidate_IS",
      start_utc_ms: null, end_exclusive_utc_ms: null, source_observation_count: 0, emitted_point_count: 0, sampling: null, points: [] };
    expect(CurrentSourceSummarySchema.parse({ ...summary, summary_analytics: analytics }).summary_analytics).toEqual(analytics);
  });
});
