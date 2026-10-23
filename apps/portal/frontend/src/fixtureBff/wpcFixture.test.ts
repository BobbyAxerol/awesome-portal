// @vitest-environment node
/**
 * WP-C section of the review lane (`fixture-bff/review-manager.ts`, `// ===== WP-C`): the native subjects a person opens from the
 * Fleet and Portfolios answer through the same routes with figures; the series end on the dataset's own figure; the lifecycle and
 * event keys are open partition keys (register 2c-wpc). FIXTURE_LAB: nothing here is acceptance evidence.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { answerReviewManager } from "../../../fixture-bff/review-manager";
import { scaled, setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";

const NOW = "2026-10-22T12:00:00Z";
const DAY = 86_400_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const ask = (path: string, environment: string, extra: Record<string, string> = {}): { status: number; body: Body } => {
  setFixtureScale("medium");
  setFixtureNow(NOW);
  return answerReviewManager("GET", path, new URLSearchParams({ environment, window: JSON.stringify("30D"), ...extra }), "populated") as { status: number; body: Body };
};
afterEach(() => { setFixtureScale("small"); setFixtureNow("2026-08-22T13:00:00Z"); });
afterAll(disposeSchemaCheck);

describe("the native ids answer at medium scale (they were a 404 before)", () => {
  it.each([["alphas/alpha_a"], ["alphas/alpha_btc_trend"], ["alphas/alpha_b"], ["portfolios/pf_TEST_ONLY_core"], ["portfolios/pf_TEST_ONLY_satellite"]])("%s: live book has rows with exact figures and a valid dataset body", (target) => {
    const result = ask(`/manager/${target}/overview`, "live");
    expect(result.status).toBe(200);
    expect(violationsOf({ file: "execution-manager-dataset.v1", ptr: "" }, result.body).violations).toEqual([]);
    expect(result.body.items.length).toBeGreaterThan(0);
    const metrics = result.body.items[0].economic_partitions[0].metrics;
    expect(metrics.net_pnl.availability).toBe("AVAILABLE");
    expect(metrics.return_30d_pct.unit).toBe("PERCENT");
    expect(metrics.max_drawdown_pct.unit).toBe("PERCENT");
  });

  it("alpha_a keeps its own figures in every book (the first row of an environment is the fixture's true zero, and it is not alpha_a)", () => {
    const live = ask("/manager/alphas/alpha_a/overview", "live").body.items[0].economic_partitions[0].metrics;
    expect(live.net_pnl.value).toBe("980.40");
    expect(live.allocation.value).toBe("40000.00");
    const paper = ask("/manager/alphas/alpha_a/overview", "paper").body.items[0].economic_partitions[0].metrics;
    expect(paper.net_pnl.value).toBe("-84.20");
    expect(ask("/manager/alphas/alpha_a/overview", "sandbox").body.items).toHaveLength(1);
  });

  it("an environment where the subject has no deployment is a 200 with no rows, never a 404; an id nobody published still is a 404", () => {
    expect(ask("/manager/alphas/alpha_b/overview", "paper")).toMatchObject({ status: 200, body: { items: [] } });
    expect(ask("/manager/portfolios/pf_TEST_ONLY_empty/overview", "live")).toMatchObject({ status: 200, body: { items: [] } });
    expect(ask("/manager/alphas/alpha_nobody/overview", "live").status).toBe(404);
    expect(ask("/manager/portfolios/pf_TEST_ONLY_nobody/overview", "live").status).toBe(404);
  });

  it("the small scale keeps its pinned SUITE answer (pf_core), the lane the Playwright specs read", () => {
    setFixtureScale("small");
    setFixtureNow(NOW);
    const result = answerReviewManager("GET", "/manager/alphas/alpha_btc_trend/overview", new URLSearchParams({ environment: "live" }), "populated") as { status: number; body: Body };
    expect(result.body.items[0].portfolio_id).toBe("pf_core");
  });
});

describe("series for the native portfolios", () => {
  const seriesOf = (metric: string, ids: string[], environment = "live") => ask("/manager/series", environment, {
    metric, subjects: JSON.stringify(ids.map((id) => ({ subject_type: "PORTFOLIO", subject_id: id }))),
  });

  it("two comparable USDT books in one environment are ALIGNED, schema-valid, and different from each other", () => {
    for (const metric of ["NAV", "NET_PNL", "RETURN"]) {
      const result = seriesOf(metric, ["pf_TEST_ONLY_satellite", "pf_scale_006"]);
      expect(result.status).toBe(200);
      expect(violationsOf({ file: "execution-manager-series.v1", ptr: "" }, result.body).violations).toEqual([]);
      expect(result.body.comparison.state).toBe("ALIGNED");
      const [a, b] = result.body.series;
      expect(a.points.map((p: Body) => p.value)).not.toEqual(b.points.map((p: Body) => p.value));
      expect(new Set(a.points.map((p: Body) => p.value)).size).toBeGreaterThan(20);
    }
  });

  it("each series ENDS on the figure the dataset prints for the same subject and window (NAV = current_nav, Net PnL = net_pnl)", () => {
    const dataset = ask("/manager/portfolios/pf_TEST_ONLY_satellite/overview", "live", { group_by: "portfolio_id" });
    const group = dataset.body.groups[0].economic_partitions.find((entry: Body) => entry.partition.currency === "USDT");
    const nav = seriesOf("NAV", ["pf_TEST_ONLY_satellite", "pf_scale_006"]).body.series[0].points.at(-1).value;
    const pnl = seriesOf("NET_PNL", ["pf_TEST_ONLY_satellite", "pf_scale_006"]).body.series[0].points.at(-1).value;
    expect(nav).toBe(group.metrics.current_nav.value);
    expect(pnl).toBe(group.metrics.net_pnl.value);
  });

  it("a subject with no member in the environment is typed UNAVAILABLE (Canary holds only a sandbox book), and a JPY book is INCOMPARABLE with USDT", () => {
    const canary = seriesOf("NAV", ["pf_TEST_ONLY_satellite", "pf_TEST_ONLY_canary"]);
    expect(canary.body.series[1]).toMatchObject({ state: "UNAVAILABLE", reason_code: "SUBJECT_HAS_NO_ACTIVE_MEMBERS" });
    const jpy = scaled().portfolios.find((entry) => entry.base === "JPY");
    expect(jpy).toBeDefined();
    const mixed = seriesOf("NAV", ["pf_TEST_ONLY_satellite", jpy!.id]);
    expect(mixed.body.comparison).toMatchObject({ state: "INCOMPARABLE", reason_code: "CURRENCY_MIXED" });
  });
});

describe("lifecycle, events and regime fit (open partition keys, register 2c-wpc)", () => {
  const metricsOf = (alpha: string) => ask(`/manager/alphas/${alpha}/overview`, "live").body.items[0].economic_partitions[0].metrics as Record<string, Body>;

  it("the exit instants chain R1 < R2 < paper < sandbox < canary < now and the day counts agree with them", () => {
    const m = metricsOf("alpha_a");
    const at = (key: string): number => Number(m[key].value);
    const anchor = Date.UTC(2026, 9, 17, 12, 4); // the alpha doubles' own "now", whatever FIXTURE_NOW is
    const chain = ["life_r1_exit_ms", "life_r2_exit_ms", "life_paper_exit_ms", "life_sandbox_exit_ms", "life_canary_exit_ms"].map(at);
    expect([...chain].sort((a, b) => a - b)).toEqual(chain);
    expect(anchor - chain[4]!).toBe(Number(m.life_live_days.value) * DAY);
    expect(chain[4]! - chain[3]!).toBe(Number(m.life_canary_days.value) * DAY);
    expect(chain[3]! - chain[2]!).toBe(Number(m.life_sandbox_days.value) * DAY);
    expect(m.life_paper_criteria_met.value).toBe(m.life_paper_criteria_total.value);
    expect(m.life_live_decider.reason_code).toBe("Manager");
    expect(m.life_r1_exit_ms.reason_code).toMatch(/^\w+$/);
  });

  it("every alpha publishes 4 stage, 6 decision, 3 incident, 1 recall and 2 flow events as `Title|actor`, and no event is in the future", () => {
    const m = metricsOf("alpha_scale_001");
    const kinds = new Map<string, number>();
    for (const [key, metric] of Object.entries(m)) {
      const match = /^evt_(\w+)_\d+_ms$/.exec(key);
      if (!match) continue;
      kinds.set(match[1]!, (kinds.get(match[1]!) ?? 0) + 1);
      expect(metric.reason_code).toMatch(/^[^|]+\|[^|]+$/);
      expect(Number(metric.value)).toBeLessThanOrEqual(Date.parse(NOW));
    }
    expect(Object.fromEntries(kinds)).toEqual({ stage: 4, decision: 6, incident: 3, recall: 1, flow: 2 });
  });

  it("regime fit is a ratio for two alphas in three and a typed absence (INSUFFICIENT_DATA) for the rest; lists and groups do not carry the keys", () => {
    const seen = new Set<string>();
    const generated = [...new Set((ask("/manager/fleet", "live").body.items as Body[]).map((row) => row.alpha_id as string))].slice(0, 5);
    for (const alpha of ["alpha_a", "alpha_b", "alpha_c", "alpha_btc_trend", ...generated]) {
      const metric = metricsOf(alpha).regime_fit;
      expect(metric).toBeDefined();
      seen.add(metric.availability);
      if (metric.availability === "AVAILABLE") expect(metric.value).toMatch(/^0\.\d{4}$/);
      else expect(metric).toMatchObject({ value: null, reason_code: "INSUFFICIENT_DATA" });
    }
    expect(seen).toEqual(new Set(["AVAILABLE", "UNAVAILABLE"]));
    const fleet = ask("/manager/fleet", "live").body.items[0].economic_partitions[0].metrics;
    expect(Object.keys(fleet).some((key) => key.startsWith("life_") || key.startsWith("evt_"))).toBe(false);
  });
});

describe("replay candles and the alpha equity line (review lane only)", () => {
  it("the candles wander around the band the trades print in, so a fill sits on its candle", () => {
    const result = ask("/market/venue-candles", "live", { symbol: "BTCUSDT", interval: "1h", from_ms: String(Date.parse(NOW) - 8 * DAY), to_ms: String(Date.parse(NOW) - 4 * DAY), limit: "100" });
    expect(result.status).toBe(200);
    const closes = (result.body.candles as Body[]).map((candle) => Number(candle.c));
    expect(closes.length).toBeGreaterThan(50);
    expect(Math.min(...closes)).toBeGreaterThan(66_900);
    expect(Math.max(...closes)).toBeLessThan(67_700);
    // Every bar's high is above its low, and a fill price of 67,410 lies between the lowest low and the highest high.
    expect((result.body.candles as Body[]).every((candle) => Number(candle.h) > Number(candle.l))).toBe(true);
    expect(Math.max(...(result.body.candles as Body[]).map((candle) => Number(candle.h)))).toBeGreaterThan(67_411);
  });

  it("the alpha equity chart is 120 daily closes that keep the double's start and end values", () => {
    const result = ask("/views/equity-chart", "live", { subject_kind: "alpha", subject_id: "alpha_a" });
    expect(result.status).toBe(200);
    const points = result.body.panel.data.series[0].points as [number, string][];
    expect(points).toHaveLength(120);
    expect(points[0]![1]).toBe("40000.00");
    expect(points.at(-1)![1]).toBe("40812.00");
    expect(points.every(([t], i) => i === 0 || t - points[i - 1]![0] === DAY)).toBe(true);
  });
});
