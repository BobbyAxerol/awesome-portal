/**
 * BE-P15 on real PostgreSQL (PG gate - NOT run by the author, no Docker was started): the record-detail members survive the
 * stored JSON, the SQL tuple predicate and the page keyset of the REAL durable-mirror repository, end to end through the REAL
 * ExecutionSubjectActivityService and the REAL scope evaluator (synthetic authority from the shared product-read fixture).
 * Everything is TEST_ONLY; nothing here is a qualified source receipt.
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productReadFixture, OWN, PEER, FIELDS } from "./elp2-product-read.fixture";
import { testConfig } from "./harness";
import { migrateExecutionStore } from "../src/execution/store-schema";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { ExecutionSubjectActivityService } from "../src/execution/subject-activity.service";
import { scopedSubjectActivitySchema } from "../src/execution-v2/subject-activity.contract";
import type { ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";

describe.skipIf(!process.env.TEST_DATABASE_URL)("BE-P15 subject records through the real durable mirror / TEST_ONLY", () => {
  const base = process.env.TEST_DATABASE_URL ?? testConfig().DATABASE_URL;
  const name = "be_p15_domain_" + randomUUID().replaceAll("-", "");
  const url = (database: string) => { const value = new URL(base); value.pathname = "/" + database; return value.toString(); };
  let domain: Pool;
  // A researcher scope: the SQL tuple predicate then admits ONLY the own tuple, so the peer rows prove the predicate, and the reviewed artifact
  // lists exactly the detail names this test expects to see.
  const f = productReadFixture({ fields: [...FIELDS, "timestamp_ms", "occurred_at_ms", "price", "submitted_at_ms", "client_order_id", "order_type",
    "commission", "commission_currency", "liquidity_side"] });
  const WS = f.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!, PROFILE = f.config.EXECUTION_EDGE_PAPER_PROFILE_ID!;
  const insert = (relation: string, rowId: string, ts: string, fields: Record<string, unknown>) => domain.query(
    `INSERT INTO execution_timeseries_history(workspace_id,environment,profile_id,relation_key,row_id,ts,fields,first_seen_at)
     VALUES($1,'paper',$2,$3,$4,$5,$6::jsonb,'2026-10-01')`, [WS, PROFILE, relation, rowId, ts, JSON.stringify(fields)]);

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    domain = new Pool({ connectionString: url(name), max: 2 });
    await migrateExecutionStore(domain);
    const tuple = { ...OWN, strategy_id: "strategy-own" };
    await insert("manager.orders:orders", "o-own", "2026-10-01T00:00:02.123456Z", { ...tuple, order_id: "o-own", status: "FILLED", side: "BUY", quantity: "10.5",
      price: "100.1234567890123456789", submitted_at: "2026-10-01T00:00:00.123456Z", updated_at: "2026-10-01T00:00:02.123456Z", client_order_id: "client-entry",
      order_type: "LIMIT", venue_order_id: "NEVER_RETURN", error_message: "NEVER_RETURN" });
    await insert("manager.orders:orders", "o-peer", "2026-10-01T00:00:03Z", { ...PEER, strategy_id: "strategy-peer", order_id: "o-peer", client_order_id: "PEER_HIDDEN", submitted_at: "2026-10-01T00:00:00Z" });
    await insert("manager.fills:fills", "f-own", "2026-10-01T00:00:01.456Z", { ...tuple, fill_id: "f-own", side: "BUY", price: "100.1234567890123456789", quantity: "10.5",
      trade_time: "2026-10-01T00:00:01.456Z", client_order_id: "client-entry", commission: "0.0000000000000000001", commission_currency: "USDT", liquidity_side: "MAKER", trade_id: "NEVER_RETURN" });
    await insert("manager.fills:fills", "f-peer", "2026-10-01T00:00:04Z", { ...PEER, strategy_id: "strategy-peer", fill_id: "f-peer", commission: "999", trade_time: "2026-10-01T00:00:04Z" });
  }, 90_000);
  afterAll(async () => {
    await domain?.end();
    const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); } finally { await admin.end(); }
  });

  function service() {
    f.snapshot.document.relations["manager.fills:fills"] = { ...f.snapshot.document.relations["manager.orders:orders"], relation: "fills", items: [] };
    const config = { ...f.config, FEATURE_EXECUTION_DURABLE_MIRROR: "true", FEATURE_EXECUTION_DURABLE_MIRROR_READS: "true",
      QUERY_CURSOR_ACTIVE_KEY_ID: "k1", QUERY_CURSOR_KEYS_JSON: JSON.stringify({ k1: "01234567890123456789012345678901" }), QUERY_CURSOR_TTL_SECONDS: 900 };
    const mirror = new ExecutionDurableMirrorRepository(config as never, domain);
    return new ExecutionSubjectActivityService(config as never, f.repository as unknown as ExecutionProfileProjectionRepository, mirror, f.scopes);
  }
  const read = (relation: "orders" | "fills") => service().readAuthorized(f.principal as ReadScopePrincipal,
    { environment: "paper", subjectKind: "alpha", subjectId: OWN.alpha_id, relation }) as Promise<any>;

  it("orders: submission instant, client id and order type come out of the stored JSON; the peer's row and the private columns do not", async () => {
    const page = await read("orders");
    expect(page.time_unit).toBe("UTC_EPOCH_MS");
    expect(page.observed_at_basis).toBe("ORDER_UPDATED_AT");
    expect(page.records).toHaveLength(1);
    expect(page.records[0].values).toMatchObject({ order_id: "o-own", client_order_id: "client-entry", order_type: "LIMIT", submitted_at_ms: 1790812800123,
      updated_at: 1790812802123, price: "100.1234567890123456789" });
    expect(JSON.stringify(page)).not.toMatch(/PEER_HIDDEN|NEVER_RETURN/);
    expect(scopedSubjectActivitySchema.safeParse(page).success).toBe(true);
  });
  it("fills: exact fee, fee currency, liquidity and the trade instant survive the SQL scope predicate; the peer's fee never appears", async () => {
    const page = await read("fills");
    expect(page.observed_at_basis).toBe("FILL_TRADE_TIME");
    expect(page.records).toHaveLength(1);
    expect(page.records[0].record_id).toContain("f-own");   // the fill id is the record identity, not a value member
    expect(page.records[0].values).toMatchObject({ client_order_id: "client-entry", commission: "0.0000000000000000001", commission_currency: "USDT",
      liquidity_side: "MAKER", occurred_at_ms: 1790812801456 });
    expect(JSON.stringify(page)).not.toMatch(/999|NEVER_RETURN/);
    expect(scopedSubjectActivitySchema.safeParse(page).success).toBe(true);
  });
});
