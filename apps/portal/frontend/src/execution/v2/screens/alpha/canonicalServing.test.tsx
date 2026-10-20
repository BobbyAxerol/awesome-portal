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
import { readAlphaFleetItem, readProfileEnvelope } from "../../../api/profileRead";
import { readSubjectActivity } from "../../../api/subjectActivity";
import { loadCanonical } from "../../testkit/loadCanonical";
import { alphaName, alphaTitle, alphaVersion, deploymentRows } from "./model";
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
    const item = readAlphaFleetItem(envelope.objects.alpha ?? ready.data.alpha);
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
    expect(item!.health).toBe("READY");
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
