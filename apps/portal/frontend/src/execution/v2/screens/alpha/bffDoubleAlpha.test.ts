/**
 * The Alpha 360 e2e double, proved through the product's own HTTP client and
 * readers: if a body here stops parsing, the Playwright run would have shown a
 * blank screen instead of a failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID, answerAlpha } from "../../../../../e2e/bffDoubleAlpha";
import { alphaHttpApi, serveAlphaDouble } from "./testApi";

afterEach(() => vi.unstubAllGlobals());

const q = (text: string) => new URLSearchParams(text);

describe("answerAlpha routing", () => {
  it("answers only GET and only its own paths, with or without the API prefix", () => {
    expect(answerAlpha("POST", "/resources/alphas/a", q(""))).toBeNull();
    expect(answerAlpha("GET", "/alphas", q(""))).toBeNull();
    expect(answerAlpha("GET", "/api/v1/execution/resources/alphas/a", q(""))?.status).toBe(200);
    expect(answerAlpha("GET", "/resources/alphas/a", q(""))?.status).toBe(200);
  });

  it("leaves the Trading System market-context candles unanswered", () => {
    expect(answerAlpha("GET", "/market/candles", q("environment=live&venue=BINANCE&instrument=BTCUSDT&interval=1h&from_ms=1&to_ms=2"))).toBeNull();
  });

  it("answers the three resource states and the error cases", () => {
    expect(answerAlpha("GET", "/resources/alphas/alpha_denied", q(""))?.status).toBe(403);
    expect(answerAlpha("GET", "/resources/alphas/alpha_down", q(""))?.status).toBe(503);
    const empty = answerAlpha("GET", "/resources/alphas/alpha_empty", q(""))!.body as { state: string };
    expect(empty.state).toBe("empty");
    expect(answerAlpha("GET", "/views/equity-chart", q("environment=sandbox&subject_kind=alpha&subject_id=a"))?.status).toBe(503);
  });
});

describe("through createHttpApi", () => {
  it("reads the resource: four deployments across paper, sandbox, canary and live, stage LIVE", async () => {
    serveAlphaDouble();
    const result = await alphaHttpApi().getAlpha360Resource(ALPHA_DOUBLE_ID);
    if (!result.ok) throw new Error(result.reason);
    const alpha = result.value.objects.alpha as { stage: string; stages: string[]; deployments: { stage: string }[] };
    expect(alpha.stage).toBe("LIVE");
    expect(alpha.deployments.map((d) => d.stage)).toEqual(["LIVE", "PAPER", "CANARY", "SANDBOX"]);
    expect(result.value.data.positions).toHaveLength(2);
    expect(result.value.data.reconciliation).toHaveLength(2);
  });

  it("serves orders in two pages and every order state the screens must keep apart", async () => {
    serveAlphaDouble();
    const api = alphaHttpApi();
    const first = await api.getSubjectActivity({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID, relation: "orders" });
    if (!first.ok) throw new Error(first.reason);
    expect(first.value.page.hasMore).toBe(true);
    const second = await api.getSubjectActivity({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID, relation: "orders", after: first.value.page.nextCursor });
    if (!second.ok) throw new Error(second.reason);
    expect(second.value.page.hasMore).toBe(false);
    const statuses = [...first.value.records, ...second.value.records].map((r) => r.values.status);
    expect(statuses).toEqual(["FILLED", "NEW", "NEW", "PARTIALLY_FILLED", "REJECTED", "UNKNOWN", "NEW", "CANCELED"]);
    const fills = await api.getSubjectActivity({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID, relation: "fills" });
    if (!fills.ok) throw new Error(fills.reason);
    expect(fills.value.records.map((r) => r.values.commission)).toEqual(["5.38", "4.18", null]);
  });

  it("serves a stage drift with a gap in the paper path", async () => {
    serveAlphaDouble();
    const result = await alphaHttpApi().getStageDrift(ALPHA_DOUBLE_ID);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.stages.paper.series[4]).toBeNull();
    expect(result.value.stages.live.series.filter((v) => v !== null)).toHaveLength(5);
    expect(result.value.researchReason).toBe("RESEARCH_RUN_NOT_BOUND");
  });

  it("serves 12 observations over two pages including a command-journal row", async () => {
    serveAlphaDouble();
    const api = alphaHttpApi();
    const first = await api.getObservedTimeline({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID });
    if (!first.ok) throw new Error(first.reason);
    expect(first.value.timeline.entries).toHaveLength(8);
    expect(first.value.page.hasMore).toBe(true);
    const second = await api.getObservedTimeline({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID, after: first.value.page.nextCursor });
    if (!second.ok) throw new Error(second.reason);
    expect(second.value.timeline.entries).toHaveLength(4);
    expect(second.value.page.hasMore).toBe(false);
    const types = [...first.value.timeline.entries, ...second.value.timeline.entries].map((e) => e.observationType);
    expect(types.filter((t) => t === "COMMAND_JOURNAL_ROW_OBSERVED")).toHaveLength(2);
  });

  it("serves an equity series with no gap (the server never publishes one) and the real series id, and a 503 for sandbox", async () => {
    serveAlphaDouble();
    const api = alphaHttpApi();
    const live = await api.getFinancialChart({ environment: "live", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID, metric: "equity" });
    if (!live.ok) throw new Error(live.reason);
    expect(live.value.coverage.gaps).toEqual([]);
    expect(live.value.sampling?.preservesGaps).toBe(false);
    expect(live.value.series[0].id).toBe("account:acct_binance_02:currency:USDT");
    expect(live.value.series[0].currency).toBe("USDT");
    expect(live.value.series[0].points.every(([, v]) => typeof v === "string")).toBe(true);
    const sandbox = await api.getFinancialChart({ environment: "sandbox", subjectKind: "alpha", subjectId: ALPHA_DOUBLE_ID, metric: "equity" });
    expect(sandbox.ok).toBe(false);
  });

  it("serves venue candles for BTCUSDT and a typed absence for ETHUSDT; the context read fails", async () => {
    serveAlphaDouble();
    const api = alphaHttpApi();
    const base = { environment: "live" as const, venue: "BINANCE" as const, interval: "1h" as const, fromMs: Date.UTC(2026, 9, 16, 8), toMs: Date.UTC(2026, 9, 17, 8), limit: 100 };
    const btc = await api.getMarketCandles({ ...base, symbol: "BTCUSDT" });
    if (!btc.ok) throw new Error(btc.reason);
    expect(btc.value.state).toBe("READY");
    expect(btc.value.candles.length).toBeGreaterThan(20);
    const eth = await api.getMarketCandles({ ...base, symbol: "ETHUSDT" });
    if (!eth.ok) throw new Error(eth.reason);
    expect(eth.value.state).toBe("UNAVAILABLE");
    expect(eth.value.candles).toEqual([]);
    const context = await api.getMarketContextCandles({ environment: "live", venue: "BINANCE", instrument: "BTCUSDT", interval: "1h", fromMs: 1, toMs: 2 });
    expect(context.ok).toBe(false);
  });

  it("reads the activity rollup with exact population strings", async () => {
    serveAlphaDouble();
    const result = await alphaHttpApi().getAlphaActivity(ALPHA_DOUBLE_ID, "live");
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.data.orderPopulation).toBe("8");
    expect(result.value.data.orderStatusCounts.UNKNOWN).toBe("1");
  });
});
