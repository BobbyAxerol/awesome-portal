/**
 * The Alpha readers against the canonical serving fixtures the producer published (BE-P3 / S3-U2, S3-U3; lane FIXTURE_LAB:
 * `producer_run: true` bodies are real service output on synthetic inputs, not a source receipt). Every case is first judged
 * by the published schema (the oracle), then read by the product reader the Alpha screen uses. This is the check that
 * the double had been skipping: a screen that only ever saw the hand-written double could never learn the real shape.
 */
import { describe, expect, it } from "vitest";

import { readFinancialChart } from "../../../api/financialChart";
import { readMarketCandles } from "../../../api/marketCandles";
import { readObservedTimeline } from "../../../api/observedTimeline";
import { readAlphaFleetItem, readAlphaResourceItem, readProfileEnvelope } from "../../../api/profileRead";
import { readSubjectActivity } from "../../../api/subjectActivity";
import { loadCanonical } from "../../testkit/loadCanonical";
import { alphaName, alphaTitle, alphaVersion, deploymentRows } from "./model";
import { alphaViewOf, legacyResource } from "./view";
import { validateAgainst } from "../../testkit/schema";

type Any = Record<string, any>;
const cases = (file: string): { name: string; value: Any }[] => loadCanonical<Any>(file).cases;

describe("alpha resource (execution.alpha-resource.v1)", () => {
  it.each(cases("execution-alpha-resource.v1.synthetic").map((c) => [c.name, c] as const))("%s validates and reads", (_name, c) => {
    expect(validateAgainst("execution-alpha-resource.v1", "", c.value)).toEqual([]);
    const envelope = readProfileEnvelope(c.value);
    expect(envelope).not.toBeNull();
    expect(envelope!.state).toBe(c.value.state);
  });

  it("the ready case reads as the alpha the screen draws: Unnamed alpha, UNVERSIONED, READY|ATTENTION|FINDING health, names from data.alpha.portfolios", () => {
    const ready = cases("execution-alpha-resource.v1.synthetic")[0]!.value;
    const envelope = readProfileEnvelope(ready)!;
    const item = readAlphaResourceItem(envelope.objects.alpha ?? ready.data.alpha);
    expect(item).not.toBeNull();
    expect(item!.alphaId).toBe("alpha_btc_trend");
    expect(item!.alphaLabel).toBe("Unnamed alpha");
    expect(item!.version).toBe("UNVERSIONED");
    // neither literal is a name or a version the screen may print
    expect(alphaName(item)).toBeNull();
    expect(alphaVersion(item)).toBeNull();
    expect(alphaTitle(item, "alpha_btc_trend")).toBe("alpha_btc_trend");
    // a deployment's portfolio_name is null by contract; the name is joined from portfolios[] on portfolio_id
    expect(item!.deployments[0]!.portfolioName).toBeNull();
    expect(deploymentRows(item)[0]!.portfolio).toBe("Core");
    expect(item!.health).toBe("UNKNOWN");
    expect(item!.deployments[0]).toMatchObject({ positionFactCount: 1, netPnl: null,
      positionMetricsAvailability: "UNAVAILABLE", positionMetricsReasonCode: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" });
    expect(item!.positionPnl[0]).toMatchObject({ net: null, state: "UNAVAILABLE", reasonCode: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" });
    expect(item!.exposure[0]).toMatchObject({ value: null, state: "UNAVAILABLE", reasonCode: "FINANCIAL_AGGREGATE_SOURCE_NOT_QUALIFIED" });
    expect(deploymentRows(item)[0]).toMatchObject({ netPnl: null, exposure: null, health: "UNKNOWN" });
  });

  it("keeps source zero, an old complete body and nullable timestamps distinct from unavailable values", () => {
    const alpha = structuredClone(cases("execution-alpha-resource.v1.synthetic")[0]!.value.data.alpha);
    const d = alpha.deployments[0];
    delete d.position_count_availability; delete d.position_count_reason_code;
    delete d.position_metrics_availability; delete d.position_metrics_reason_code;
    Object.assign(d, { position_fact_count: 0, realized_pnl: "0", unrealized_pnl: "0", net_pnl: "0", exposure: "0", updated_at: null });
    alpha.updated_at = null;
    alpha.position_pnl = [{ currency: "USDT", realized: "0", unrealized: "0", net: "0" }];
    alpha.exposure = [{ currency: "USDT", value: "0" }];
    const item = readAlphaResourceItem(alpha)!;
    expect(item.updatedAt).toBeNull();
    expect(item.deployments[0]).toMatchObject({ positionFactCount: 0, netPnl: "0", exposure: "0", updatedAt: null });
    expect(item.positionPnl[0].net).toBe("0");
    expect(item.exposure[0].value).toBe("0");
  });

  it("rejects invalid availability pairs without widening the fleet-list reader", () => {
    const alpha = structuredClone(cases("execution-alpha-resource.v1.synthetic")[0]!.value.data.alpha);
    expect(readAlphaFleetItem(alpha)).toBeNull(); // fleet-list v2 keeps its own strict contract
    const mutations = [
      (v: Any) => { v.deployments[0].position_count_availability = "UNAVAILABLE"; },
      (v: Any) => { v.deployments[0].position_count_reason_code = "invented"; },
      (v: Any) => { v.deployments[0].net_pnl = "0"; },
      (v: Any) => { delete v.deployments[0].position_metrics_reason_code; },
      (v: Any) => { v.position_pnl[0].reason_code = "invented"; },
      (v: Any) => { v.exposure[0].state = "AVAILABLE"; },
      (v: Any) => { delete v.exposure[0].reason_code; },
    ];
    for (const mutate of mutations) {
      const bad = structuredClone(alpha); mutate(bad);
      expect(readAlphaResourceItem(bad)).toBeNull();
    }
  });

  it("keeps the Alpha visible with the source's unavailable reason instead of a fabricated zero", () => {
    const body = cases("execution-alpha-resource.v1.synthetic")[0]!.value;
    const envelope = readProfileEnvelope(body)!;
    const view = alphaViewOf(legacyResource(envelope), "alpha_btc_trend");
    expect(view.present).toBe(true);
    expect(view.rows[0]).toMatchObject({ id: "dep_live_01", netPnl: null, exposure: null, health: "UNKNOWN" });
    expect(view.money).toEqual({ published: false, reason: "POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED" });
    expect(legacyResource({ ...envelope, schemaVersion: "execution.alpha-resource.v2" })).toMatchObject({
      variant: "legacy",
      item: null,
    });
  });

  it("keeps a qualified deployment amount visible even when its aggregate is unavailable", () => {
    const body = structuredClone(cases("execution-alpha-resource.v1.synthetic")[0]!.value);
    const d = body.data.alpha.deployments[0];
    delete d.position_metrics_availability; delete d.position_metrics_reason_code;
    Object.assign(d, { realized_pnl: "0", unrealized_pnl: "0", net_pnl: "0", exposure: "5" });
    const view = alphaViewOf(legacyResource(readProfileEnvelope(body)!), "alpha_btc_trend");
    expect(view.rows[0]).toMatchObject({ netPnl: "0", exposure: "5" });
    expect(view.money.published).toBe(true);
  });

  it("retains an unqualified observation but does not promote it into a displayed aggregate", () => {
    const body = structuredClone(cases("execution-alpha-resource.v1.synthetic")[0]!.value);
    body.data.alpha.exposure[0].value = "42"; // a known component, not a qualified aggregate
    body.data.alpha.balances[0] = { currency: "USDT", total: "10", free: null, locked: "10",
      state: "UNAVAILABLE", reason_code: "FINANCIAL_AGGREGATE_SOURCE_NOT_QUALIFIED" };
    body.data.alpha.portfolios[0].portfolio_id = null;
    expect(validateAgainst("execution-alpha-resource.v1", "", body)).toEqual([]);
    const envelope = readProfileEnvelope(body)!;
    const item = readAlphaResourceItem(envelope.objects.alpha)!;
    expect(item.exposure[0]).toMatchObject({ value: "42", state: "UNAVAILABLE" });
    expect(item.balances[0]).toMatchObject({ total: "10", free: null, state: "UNAVAILABLE" });
    const view = alphaViewOf(legacyResource(envelope), "alpha_btc_trend");
    expect(view.money.published).toBe(false);
    expect(view.portfolioNameById.size).toBe(0);
  });
});

describe("subject records (portal.execution.subject-records.v1)", () => {
  it.each(cases("execution-subject-records.v1.synthetic").map((c) => [c.name, c] as const))("%s validates and reads", (_name, c) => {
    expect(validateAgainst("execution-subject-records.v1", "", c.value)).toEqual([]);
    const page = readSubjectActivity(c.value);
    expect(page, JSON.stringify(c.value.projection)).not.toBeNull();
    expect(page!.records).toHaveLength(c.value.records.length);
    expect(page!.page.nextCursor).toBe(c.value.page.next_cursor);
    expect(page!.page.hasMore).toBe(c.value.page.has_more);
    // the producer's projection has no `completeness`; a reader that needed one would never have read a real page
    expect(page!.projection.completeness).toBeNull();
    expect(page!.projection.lastRefreshMs).toBe(c.value.projection.last_successful_refresh_at_ms);
  });
});

describe("observed timeline (portal.execution.observed-timeline-bff.v1)", () => {
  it.each(cases("execution-observed-timeline.v1.synthetic").map((c) => [c.name, c] as const))("%s validates and reads", (_name, c) => {
    expect(validateAgainst("execution-observed-timeline.v1", "", c.value)).toEqual([]);
    const timeline = readObservedTimeline(c.value);
    expect(timeline).not.toBeNull();
    expect(timeline!.timeline.entries).toHaveLength(c.value.observed_timeline.data?.entries.length ?? 0);
    // the panel's clocks are the producer's `clocks` object (a `freshness` member does not exist on the real body)
    expect(timeline!.timeline.asOfMs).toBe(c.value.observed_timeline.clocks.as_of_ms);
    expect(timeline!.timeline.readAtMs).toBe(c.value.observed_timeline.clocks.read_at_ms);
    expect(timeline!.page.nextCursor).toBe(c.value.page.next_cursor);
  });
});

describe("venue candles (portal.execution.market-candles.v1)", () => {
  it.each(cases("execution-market-candles.v1.synthetic").map((c) => [c.name, c] as const))("%s validates and reads", (_name, c) => {
    expect(validateAgainst("execution-market-candles.v1", "", c.value)).toEqual([]);
    const payload = readMarketCandles(c.value);
    expect(payload, c.name).not.toBeNull();
    expect(payload!.candles).toHaveLength(c.value.candles.length);
  });
});

describe("financial chart (portal.execution.financial-chart.v1)", () => {
  it.each(cases("execution-financial-chart.synthetic").map((c) => [c.name, c] as const))("%s validates and reads", (_name, c) => {
    expect(validateAgainst("execution-financial-chart.v1", "", c.value)).toEqual([]);
    const payload = readFinancialChart(c.value);
    expect(payload, c.name).not.toBeNull();
  });
});
