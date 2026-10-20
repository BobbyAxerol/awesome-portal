/**
 * S3-U2 (BE-P3): the four reads Alpha 360 and Trade Replay depend on, run through their REAL producers with fakes in
 * place of PostgreSQL / the venue. Each output is (1) validated against the published schema and (2) equal to the
 * canonical fixture. `BE_P3_WRITE_FIXTURES=1` rewrites the fixtures from the producers; the default run only compares.
 *
 *   execution.alpha-resource.v1                 GET /resources/alphas/{id}            (ResourceReadService, LEGACY path)
 *   portal.execution.subject-records.v1         GET /resources/alphas/{id}/orders|fills (ExecutionSubjectActivityService.read)
 *   portal.execution.observed-timeline-bff.v1   GET /views/observed-timeline          (LocalQueryAnalyticsService)
 *   portal.execution.market-candles.v1          GET /market/venue-candles             (ExecutionMarketCandlesService)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceReadService } from "../src/resource-read/resource-read.service";
import { ExecutionSubjectActivityService } from "../src/execution/subject-activity.service";
import { LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
import {
  dataLayerUnavailable, ExecutionMarketCandlesService, marketContextToCandlesEnvelope,
} from "../src/execution/market-candles.service";
import { testConfig } from "./harness";

const contracts = resolve(__dirname, "../../../packages/contracts");
const WRITE = process.env.BE_P3_WRITE_FIXTURES === "1";
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const schemaOf = (file: string) => { const s = JSON.parse(readFileSync(resolve(contracts, `schemas/${file}`), "utf8")); ajv.addSchema(s); return ajv.getSchema(s.$id)!; };
const T0 = Date.UTC(2026, 9, 17, 12, 4, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const user = { userId: "usr_asmith", username: "asmith", role: "USER" };

/** Compare with, or rewrite, a canonical fixture file (`{lane, cases:[{name,value}]}`). */
function canonical(file: string, cases: Array<{ name: string; value: unknown }>) {
  const path = resolve(contracts, `fixtures/${file}`);
  const body = { lane: "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT", producer_run: true, cases };
  if (WRITE) writeFileSync(path, JSON.stringify(body, null, 2) + "\n");
  else expect(JSON.parse(JSON.stringify(body))).toEqual(JSON.parse(readFileSync(path, "utf8")));
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0 + 1000); });
afterEach(() => vi.useRealTimers());

/* ── market candles ─────────────────────────────────────────────────────────── */
describe("venue-candles", () => {
  const validate = schemaOf("execution-market-candles.v1.schema.json");
  const kline = (t: number, o: string, h: string, l: string, c: string) => [t, o, h, l, c, "12.5", t + 3_599_999, "31250.0", 42, "6.1", "15200.0", "0"];
  const H = 3_600_000, FROM = T0 - 3 * H;
  const query = { venue: "BINANCE" as const, symbol: "BTCUSDT", interval: "1h" as const, fromMs: FROM, toMs: T0, limit: 500 };

  it("producer output equals the canonical cases and the schema", async () => {
    const on = { ...testConfig(), FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES: "true", EXECUTION_MARKET_CANDLES_SOURCE: "venue_public" } as ReturnType<typeof testConfig>;
    const make = (config = on) => new ExecutionMarketCandlesService(config);
    const ready = make(); ready.setFetch((async () => ({ ok: true, status: 200, json: async () => [kline(FROM, "67200.50", "67410.00", "67100.00", "67364.21"), kline(FROM + H, "67364.21", "67500.00", "67300.00", "67410.55")] })) as never);
    const empty = make(); empty.setFetch((async () => ({ ok: true, status: 200, json: async () => [] })) as never);
    const unknown = make(); unknown.setFetch((async () => ({ ok: false, status: 400, json: async () => ({ code: -1121 }) })) as never);
    const limited = make(); limited.setFetch((async () => ({ ok: false, status: 429, json: async () => ({}) })) as never);
    const malformed = make(); malformed.setFetch((async () => ({ ok: true, status: 200, json: async () => ({ not: "klines" }) })) as never);
    const okx = make(); okx.setFetch((async () => ({ ok: true, status: 200, json: async () => ({ code: "0", data: [[String(FROM + H), "1.0", "1.2", "0.9", "1.1", "10", "10", "10", "1"], [String(FROM), "0.9", "1.0", "0.8", "1.0", "10", "10", "10", "1"]] }) })) as never);
    const disabled = make({ ...on, FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES: "false" } as never);
    const notWired = make({ ...on, EXECUTION_MARKET_CANDLES_SOURCE: "data_layer" } as never);
    const now = T0 + 1000;
    const context = marketContextToCandlesEnvelope(query, { schema_version: "portal.execution.market-context.candles.v1", logical_operation_id: "managerMarketContextCandlesV1",
      environment: "paper", range: { venue: "BINANCE", instrument: "BTCUSDT", interval: "1h" }, state: "POPULATED", coverage: "COMPLETE", source_health: { as_of_ms: T0 },
      candles: [{ open_ms: FROM, close_ms: FROM + H - 1, open: "67200.50", high: "67410.00", low: "67100.00", close: "67364.21", volume: "12.5" }] }, now);
    const cases = [
      { name: "venue_public_ready", value: await ready.candles(query, now) },
      { name: "venue_public_empty_window", value: await empty.candles(query, now) },
      { name: "venue_public_symbol_unknown", value: await unknown.candles({ ...query, symbol: "NOPEUSDT" }, now) },
      { name: "venue_public_rate_limited", value: await limited.candles(query, now) },
      { name: "venue_public_malformed", value: await malformed.candles(query, now) },
      { name: "okx_swap_ready", value: await okx.candles({ ...query, venue: "OKX", symbol: "ETHUSDT", toMs: FROM + 2 * H, limit: 100 }, now) },
      { name: "feature_disabled", value: await disabled.candles(query, now) },
      { name: "data_layer_source_not_wired", value: await notWired.candles(query, now) },
      { name: "data_layer_via_market_context_ready", value: context },
      { name: "data_layer_range_required", value: dataLayerUnavailable({ ...query, fromMs: null, toMs: null }, now, "MARKET_CONTEXT_RANGE_REQUIRED") },
    ];
    for (const item of cases) expect(validate(item.value), `${item.name} ${JSON.stringify(validate.errors)}`).toBe(true);
    expect(cases.map(c => (c.value as { state: string }).state)).toEqual(["READY", "EMPTY", "EMPTY", "UNAVAILABLE", "UNAVAILABLE", "READY", "UNAVAILABLE", "UNAVAILABLE", "READY", "UNAVAILABLE"]);
    canonical("execution-market-candles.v1.synthetic.valid.json", cases);
  });
});
