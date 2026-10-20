/**
 * S3-U2 (BE-P3), part 2 of 2 (part 1: be-p3-serving-reads.spec.ts = venue candles). The three reads Alpha 360 and the
 * Trade Replay depend on, run through their REAL producers with fakes in place of PostgreSQL. Each output is validated
 * against the published schema and equal to the canonical fixture; `BE_P3_WRITE_FIXTURES=1` rewrites the fixtures.
 *
 *   execution.alpha-resource.v1                 GET /resources/alphas/{id}              (ResourceReadService, LEGACY path)
 *   portal.execution.subject-records.v1         GET /resources/alphas/{id}/orders|fills (ExecutionSubjectActivityService.read)
 *   portal.execution.observed-timeline-bff.v1   GET /views/observed-timeline            (LocalQueryAnalyticsService)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceReadService } from "../src/resource-read/resource-read.service";
import { ExecutionSubjectActivityService } from "../src/execution/subject-activity.service";
import { LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
import { testConfig } from "./harness";

const contracts = resolve(__dirname, "../../../packages/contracts");
const WRITE = process.env.BE_P3_WRITE_FIXTURES === "1";
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const schemaOf = (file: string) => { const s = JSON.parse(readFileSync(resolve(contracts, `schemas/${file}`), "utf8")); ajv.addSchema(s); return ajv.getSchema(s.$id)!; };
const T0 = Date.UTC(2026, 9, 17, 12, 4, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const user = { userId: "usr_asmith", username: "asmith", role: "USER" };

function canonical(file: string, cases: Array<{ name: string; value: unknown }>) {
  const path = resolve(contracts, `fixtures/${file}`);
  const body = { lane: "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT", producer_run: true, cases };
  if (WRITE) writeFileSync(path, JSON.stringify(body, null, 2) + "\n");
  else expect(JSON.parse(JSON.stringify(body))).toEqual(JSON.parse(readFileSync(path, "utf8")));
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0 + 1000); });
afterEach(() => vi.useRealTimers());

type Row = Record<string, string | number | boolean | null>;
const WS = "workspace_execution_manager";
const PROFILE = { paper: "PAPER_BINANCE_USDM", sandbox: "SANDBOX_BINANCE_USDM", live: "LIVE_BINANCE_USDM" } as const;
const lineage = (profile: string) => ({ workspace_id: WS, profile_id: profile, source_contract_revision: "manager-v2.current.v1" });
const relation = (source_id: string, name: string, rows: Row[], completeness: "COMPLETE" | "PARTIAL" = "COMPLETE", profile: string = PROFILE.live) => ({
  source_id, relation: name, availability: "AVAILABLE" as const, reason_code: null, as_of: iso(T0), freshness: "FRESH" as const, completeness,
  items: rows.map(fields => ({ lineage: lineage(profile), fields })) });
function snapshotFor(environment: "paper" | "sandbox" | "live", relations: Record<string, ReturnType<typeof relation>>) {
  return { document: { schema_version: "portal.execution.profile-projection.v1", workspace_id: WS, environment, profile_id: PROFILE[environment],
    source_contract_revision: "manager-v2.current.v1", relations }, sourceEpoch: "src-epoch", sourceCursor: "opaque-must-not-leak",
    sourceAsOf: new Date(T0), receivedAt: new Date(T0 + 500), lastSuccessfulRefreshAt: new Date(T0 + 500), completeness: "COMPLETE" as const,
    projectionEpoch: "alpha-live", projectionSequence: 7, payloadDigest: `sha256:${"a".repeat(64)}` };
}
const A = "alpha_btc_trend";
const liveRelations = (): Record<string, ReturnType<typeof relation>> => ({
  "manager.strategies:strategies": relation("manager.strategies", "strategies", [{ strategy_id: A, trader_id: "asmith", active: true }]),
  "manager.deployments:strategy_deployments": relation("manager.deployments", "strategy_deployments", [
    { deployment_id: "dep_live_01", strategy_id: A, account_id: "acct_binance_02", mode: "live", venue: "BINANCE", currency: "USDT", portfolio_id: "pf_core", state: "ACTIVE", active: true, updated_at: iso(T0 - 120000) }]),
  "manager.accounts:accounts": relation("manager.accounts", "accounts", [{ account_id: "acct_binance_02", strategy_id: A, mode: "live", venue: "BINANCE", base_currency: "USDT", account_type: "FUTURES" }]),
  "manager.accounts:account_balances": relation("manager.accounts", "account_balances", [{ account_id: "acct_binance_02", currency: "USDT", total: "41230.55", free: "38900.10", locked: "2330.45" }]),
  "manager.portfolios:portfolios": relation("manager.portfolios", "portfolios", [{ portfolio_id: "pf_core", name: "Core", base_currency: "USDT", owner: "asmith" }]),
  "manager.portfolios:portfolio_allocations": relation("manager.portfolios", "portfolio_allocations", [{ portfolio_id: "pf_core", strategy_id: A, deployment_id: "dep_live_01", account_id: "acct_binance_02", allocated_capital: "40000.00", currency: "USDT" }]),
  "manager.positions:positions_v2": relation("manager.positions", "positions_v2", [{ position_id: "pos_btc_long", strategy_id: A, account_id: "acct_binance_02", mode: "live", venue: "BINANCE", instrument_id: "BTCUSDT", side: "LONG", quantity: "0.91", notional: "61343.10", realized_pnl: "980.40", unrealized_pnl: "41.67", updated_at: iso(T0) }]),
  "manager.reconciliation:reconciliation_findings": relation("manager.reconciliation", "reconciliation_findings", [{ finding_id: "rec_002", account_id: "acct_binance_02", strategy_id: A, mode: "live", status: "OPEN", created_at: iso(T0 - 3600000) }]),
});

describe("alpha resource (legacy v1)", () => {
  const validate = schemaOf("execution-alpha-resource.v1.schema.json");
  const config = { ...testConfig(), FEATURE_EXECUTION_LOCAL_PROJECTION: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS,
    EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE.paper, EXECUTION_EDGE_SANDBOX_PROFILE_ID: PROFILE.sandbox, EXECUTION_EDGE_LIVE_PROFILE_ID: PROFILE.live,
    EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 600_000 } as ReturnType<typeof testConfig>;
  const read = (live: Record<string, ReturnType<typeof relation>> | null, id = A) => {
    const repo = { snapshot: async (_w: string, env: "paper" | "sandbox" | "live") => (env === "live" && live ? snapshotFor("live", live) : null) };
    return new ResourceReadService(config, repo as never).read({ user, session: {}, workspaceId: WS } as never, "ALPHA", id, "live");
  };
  it("producer output equals the canonical cases and the schema", async () => {
    const cases = [
      { name: "ready", value: await read(liveRelations()) },
      { name: "alpha_not_in_projection", value: await read(liveRelations(), "alpha_unknown") },
      { name: "projection_not_ready", value: await read(null) },
    ];
    for (const item of cases) expect(validate(item.value), `${item.name} ${JSON.stringify(validate.errors?.slice(0, 4))}`).toBe(true);
    canonical("execution-alpha-resource.v1.synthetic.valid.json", cases);
  });
});

describe("subject records (legacy v1)", () => {
  const validate = schemaOf("execution-subject-records.v1.schema.json");
  const config = { ...testConfig(), FEATURE_EXECUTION_LOCAL_PROJECTION: "true", FEATURE_EXECUTION_DURABLE_MIRROR: "true", FEATURE_EXECUTION_DURABLE_MIRROR_READS: "true",
    FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS, EXECUTION_EDGE_LIVE_PROFILE_ID: PROFILE.live,
    EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 600_000 } as ReturnType<typeof testConfig>;
  const order = (n: number, status: string): Row => ({ order_id: `ord_00${n}`, client_order_id: `bt3-00${n}`, strategy_id: A, account_id: "acct_binance_02", mode: "live", instrument_id: "BTCUSDT", side: "BUY", status, quantity: "0.40", price: "67200.50", submitted_at: iso(T0 - n * 3600000) });
  function service(rows: Row[], opts: { hasMore?: boolean; unavailable?: boolean } = {}) {
    const relations = liveRelations();
    relations["manager.orders:orders"] = { ...relation("manager.orders", "orders", []), ...(opts.unavailable ? { availability: "UNAVAILABLE" as never } : {}) };
    relations["manager.fills:fills"] = relation("manager.fills", "fills", []);
    const repository = { snapshot: async () => snapshotFor("live", relations) };
    const mirror = {
      subjectRows: async () => ({ rows: rows.map((fields, i) => ({ rowId: String(fields.order_id ?? fields.fill_id), ts: iso(T0 - i * 3600000), fields })), hasMore: opts.hasMore ?? false }),
      subjectCoverage: async () => ({ rowCount: rows.length, oldestTs: rows.length ? iso(T0 - (rows.length - 1) * 3600000) : null, newestTs: rows.length ? iso(T0) : null }),
    };
    return new ExecutionSubjectActivityService(config, repository as never, mirror as never);
  }
  const principal = { workspaceId: WS, userId: user.userId };
  const request = { environment: "live" as const, subjectKind: "alpha" as const, subjectId: A, relation: "orders" as const, limit: 2 };
  it("producer output equals the canonical cases and the schema", async () => {
    const first = await service([order(1, "FILLED"), order(2, "PARTIALLY_FILLED")], { hasMore: true }).read(principal, request);
    const last = await service([order(3, "CANCELED")]).read(principal, { ...request, limit: 200 });
    const fills = await service([{ fill_id: "fill_001", client_order_id: "bt3-001", strategy_id: A, account_id: "acct_binance_02", instrument_id: "BTCUSDT", side: "BUY", price: "67200.50", quantity: "0.40", commission: null, trade_time: iso(T0 - 3600000) }])
      .read(principal, { ...request, relation: "fills", limit: 200 });
    const empty = await service([]).read(principal, { ...request, limit: 200 });
    const unavailable = await service([], { unavailable: true }).read(principal, { ...request, limit: 200 });
    const cases = [
      { name: "orders_first_page_has_more", value: first }, { name: "orders_last_page", value: last }, { name: "fills_one_page", value: fills },
      { name: "authoritative_empty", value: empty }, { name: "relation_unavailable", value: unavailable },
    ];
    for (const item of cases) expect(validate(item.value), `${item.name} ${JSON.stringify(validate.errors?.slice(0, 4))}`).toBe(true);
    expect(cases.map(c => (c.value as { state: string }).state)).toEqual(["AVAILABLE", "AVAILABLE", "AVAILABLE", "AUTHORITATIVE_EMPTY", "UNAVAILABLE"]);
    canonical("execution-subject-records.v1.synthetic.valid.json", cases);
  });
});

describe("observed timeline", () => {
  const validate = schemaOf("execution-observed-timeline.v1.schema.json");
  const config = { ...testConfig(), FEATURE_EXECUTION_LOCAL_PROJECTION: "true", FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS,
    EXECUTION_EDGE_LIVE_PROFILE_ID: PROFILE.live, EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS: 600_000 } as ReturnType<typeof testConfig>;
  const build = (mode: "full" | "empty") => {
    const relations = liveRelations();
    const own = { strategy_id: A, account_id: "acct_binance_02", deployment_id: "dep_live_01", instrument_id: "BTCUSDT" };
    relations["manager.orders:orders"] = relation("manager.orders", "orders", mode === "empty" ? [] : [
      { order_id: "ord_001", ...own, status: "FILLED", price: "67200.50", quantity: "0.40", submitted_at: iso(T0 - 7200000), updated_at: iso(T0 - 7190000) },
      { order_id: "ord_002", ...own, status: "NEW", quantity: "0.52", submitted_at: iso(T0 - 3600000) }]);
    relations["manager.fills:fills"] = relation("manager.fills", "fills", mode === "empty" ? [] : [{ fill_id: "fill_001", ...own, price: "67200.50", quantity: "0.40", realized_pnl: "0", trade_time: iso(T0 - 7188000) }]);
    relations["manager.sessions:execution_sessions"] = relation("manager.sessions", "execution_sessions", mode === "empty" ? [] : [{ execution_session_id: "session_live_01", ...own, started_at: iso(T0 - 7300000), updated_at: iso(T0 - 100000) }]);
    return new LocalQueryAnalyticsService(config as never, { snapshot: async () => snapshotFor("live", relations) } as never);
  };
  const principal = { workspaceId: WS } as never;
  it("producer output equals the canonical cases and the schema", async () => {
    const request = { environment: "live" as const, subjectKind: "alpha" as const, subjectId: A };
    const cases = [
      { name: "one_page", value: await build("full").observedTimeline(principal, { ...request, limit: 100 }) },
      { name: "first_page_has_more", value: await build("full").observedTimeline(principal, { ...request, limit: 2 }) },
      { name: "empty", value: await build("empty").observedTimeline(principal, { ...request, limit: 100 }) },
    ];
    for (const item of cases) expect(validate(item.value), `${item.name} ${JSON.stringify(validate.errors?.slice(0, 4))}`).toBe(true);
    canonical("execution-observed-timeline.v1.synthetic.valid.json", cases);
  });
});
