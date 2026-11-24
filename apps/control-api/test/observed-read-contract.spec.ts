import { describe, expect, it } from "vitest";
import {
  OBSERVED_METHOD_IDS, observedFigure, observedOverviewQuery, observedReadResponse, type ObservedReadResponse,
} from "../src/execution-v2/observed-read.contract";
import { computeObservedFigures } from "../src/execution-v2/observed-read.figures";

const H = 3_600_000;
const T0 = Date.parse("2026-11-20T00:00:00Z");
const item = (id: number, hour: number, equity: string, netPnl: string) => ({
  fields: { id, account_id: "acct-1", ts: new Date(T0 + hour * H).toISOString(), mode: "paper", equity, net_pnl: netPnl, currency: "USDT" },
});

function valid(): ObservedReadResponse {
  const computed = computeObservedFigures({
    availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH", reason_code: null, window_truncated: false,
    items: [item(1, 0, "100", "0"), item(2, 1, "101", "1")] as never,
  }, T0 + 2 * H, {
    census: { availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH",
      items: [{ fields: { account_id: "acct-1", base_currency: "USDT" } }] },
    snapshot_freshness: "FRESH", snapshot_completeness: "COMPLETE", cumulative_net_pnl_supported: true,
    test_only_grid_coverage: { qualification: "TEST_ONLY", minimum_points: 2, minimum_duration_ms: H, maximum_gap_ms: H },
  });
  return {
    schema_version: "portal.execution.observed-read.v1", surface: "FUND", workspace_id: "ws_test", environment: "paper",
    trust: { class: "CORE_OBSERVED_NOT_QUALIFIED", qualified: false, source_confidence: "UNKNOWN",
      label_code: "OBSERVED_BY_CORE_FROM_EDGE_SNAPSHOT", not_ts_qualified: true },
    record_authority: "PORTAL_OBSERVATION", source_authority: "EDGE_SNAPSHOT_VIA_CORE",
    observation_semantics: "BOUNDED_CURRENT_WINDOW", access_mode: "LEGACY_COMPATIBILITY", coverage: "WORKSPACE_WHOLE_POPULATION",
    as_of: { read_at_ms: T0 + 2 * H, snapshot_source_as_of_ms: T0 + H, snapshot_received_ms: T0 + H, last_refresh_ms: T0 + H,
      oldest_figure_ts_ms: computed.oldest_figure_ts_ms, newest_figure_ts_ms: computed.newest_figure_ts_ms },
    projection: { profile_id: "PAPER_OKX_SWAP", epoch_id: "e1", sequence: 7, payload_digest: `sha256:${"a".repeat(64)}`,
      source_catalogue_sha256: `sha256:${"b".repeat(64)}` },
    quality: computed.quality, figures: computed.figures, not_published: computed.not_published,
  };
}
const mutate = (change: (body: Record<string, any>) => void) => {
  const body = JSON.parse(JSON.stringify(valid()));
  change(body);
  return observedReadResponse.safeParse(body);
};

describe("portal.execution.observed-read.v1 contract", () => {
  it("accepts the canonical observed body (positive fixture) and names its own authority", () => {
    const parsed = observedReadResponse.safeParse(valid());
    expect(parsed.success).toBe(true);
    const text = JSON.stringify(valid());
    for (const forbidden of ["SOURCE_VERIFIED", "TRADING_SYSTEM", "\"VERIFIED\"", "PROVISIONAL", "AUTHORIZED_ONLY"]) expect(text).not.toContain(forbidden);
    expect(valid().figures.map(figure => figure.method_id)).toEqual(expect.arrayContaining(Object.values(OBSERVED_METHOD_IDS)));
  });

  it("rejects a qualified claim in every field that could carry one", () => {
    expect(mutate(b => { b.trust.qualified = true; }).success).toBe(false);
    expect(mutate(b => { b.trust.source_confidence = "VERIFIED"; }).success).toBe(false);
    expect(mutate(b => { b.trust.not_ts_qualified = false; }).success).toBe(false);
    expect(mutate(b => { b.trust.class = "TS_QUALIFIED"; }).success).toBe(false);
    expect(mutate(b => { b.source_authority = "TRADING_SYSTEM"; }).success).toBe(false);
    expect(mutate(b => { b.record_authority = "PORTAL_PROJECTION"; }).success).toBe(false);
    expect(mutate(b => { b.coverage = "AUTHORIZED_ONLY"; }).success).toBe(false);
    expect(mutate(b => { b.access_mode = "SCOPED_V2"; }).success).toBe(false);
    expect(mutate(b => { b.figures[0].source_confidence = "PROVISIONAL"; }).success).toBe(false);
    expect(mutate(b => { b.figures[0].source_confidence = "VERIFIED"; }).success).toBe(false);
    expect(mutate(b => { b.figures[0].policy_revision = "policy-m0r2"; }).success).toBe(false);
    expect(mutate(b => { b.schema_version = "portal.execution.manager-dataset.v1"; }).success).toBe(false);
  });

  it("rejects a money figure without a currency, a non-number, a cross-currency duplicate partition and unknown keys", () => {
    expect(mutate(b => { b.figures[0].currency = ""; }).success).toBe(false);
    expect(mutate(b => { b.figures[0].currency = null; }).success).toBe(false);
    expect(mutate(b => { b.figures[0].value = "1e5"; }).success).toBe(false);
    expect(mutate(b => { b.figures[0].value = 5; }).success).toBe(false);
    expect(mutate(b => { b.figures.push(JSON.parse(JSON.stringify(b.figures[0]))); }).success).toBe(false);
    expect(mutate(b => { b.extra = 1; }).success).toBe(false);
    expect(mutate(b => { b.figures[0].extra = 1; }).success).toBe(false);
  });

  it("keeps value, availability, unit and method consistent", () => {
    const base = valid().figures[0]!;
    expect(observedFigure.safeParse(base).success).toBe(true);
    expect(observedFigure.safeParse({ ...base, availability: "UNAVAILABLE" }).success).toBe(false); // value present
    expect(observedFigure.safeParse({ ...base, value: null }).success).toBe(false); // value null but AVAILABLE
    expect(observedFigure.safeParse({ ...base, availability: "PARTIAL", reason_code: null }).success).toBe(false);
    expect(observedFigure.safeParse({ ...base, unit: "FRACTION" }).success).toBe(false);
    expect(observedFigure.safeParse({ ...base, method_id: OBSERVED_METHOD_IDS.RETURN }).success).toBe(false);
    expect(observedFigure.safeParse({ ...base, accounts_reported: base.accounts_total + 1 }).success).toBe(false);
  });

  it("validates the overview query strictly and defaults to paper", () => {
    expect(observedOverviewQuery.parse({})).toEqual({ environment: "paper" });
    expect(observedOverviewQuery.parse({ environment: "sandbox", workspace_id: "ws_x" }).environment).toBe("sandbox");
    expect(observedOverviewQuery.safeParse({ environment: "all" }).success).toBe(false);
    expect(observedOverviewQuery.safeParse({ relation: "orders" }).success).toBe(false);
  });
});
