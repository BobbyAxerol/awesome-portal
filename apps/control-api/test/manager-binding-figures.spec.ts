import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { ManagerListsRepository, type BindingProjectionRecord } from "../src/manager-lists/manager-lists.repository";
import { ManagerListsService } from "../src/manager-lists/manager-lists.service";
import { bindingsResource } from "../src/manager-lists/contracts";
import { ControlPlaneQueryService, KeysetCursorCodec } from "../src/query";
import { querySigningKeys } from "../src/config";
import { type ExecutionProductReadSource } from "../src/execution/product-read-source";
import { migrateTestDatabase, testConfig } from "./harness";

const url = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const at = new Date("2026-10-23T12:00:00Z");
const amount = (value: string, currency = "USDT") => ({ currency, value,
  observed_at: at.toISOString(), coverage: "COMPLETE" as const });
const binding = (id: string, figures = true): BindingProjectionRecord => ({ bindingId: id, accountId: `acc_${id}`,
  venue: "BINANCE", state: "ACTIVE", credentialState: "SYNC_SYNCED", updatedAt: at,
  ...(figures ? { listFigures: { native_equity: [amount("414010.400000000000000001")],
    virtual_used: [amount("10.01", "USDC"), amount("0")], virtual_headroom: null,
    sleeve_count: { count: 0, observed_at: at.toISOString(), coverage: "COMPLETE" as const } } } : {}) });

describe("Accounts list committed figures and authorized snapshot counts", () => {
  const pool = new Pool({ connectionString: url }), repository = new ManagerListsRepository(pool);
  const config = testConfig();
  const query = new ControlPlaneQueryService(pool, new KeysetCursorCodec({
    activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID, keys: querySigningKeys(config), ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
  }));
  const write = (rows: BindingProjectionRecord[], workspaceId = "ws_accounts", environment: "paper" | "live" = "paper") =>
    repository.replaceBindings({ workspaceId, environment, sourceAsOf: at, completeness: "COMPLETE", rows });
  const actor = { actorId: "usr_bobby", role: "ADMIN", workspaceId: "ws_accounts:paper" };
  beforeAll(async () => migrateTestDatabase(url));
  // This isolated repository suite writes only these two projection tables.
  // Avoid truncating the entire application schema between every tiny case.
  beforeEach(async () => { await pool.query("TRUNCATE execution_binding_projection, execution_manager_projection_snapshots"); });
  afterAll(async () => pool.end());

  it("serves figures from one projection page; counts are pre-pagination and never read other profile/workspace", async () => {
    await write([binding("a"), binding("b", false)]);
    await write([binding("hidden_live")], "ws_accounts", "live");
    await write([binding("hidden_workspace")], "ws_other");
    const source = { relation: vi.fn(() => { throw new Error("unexpected source fanout"); }) };
    const service = new ManagerListsService(repository, source as unknown as ExecutionProductReadSource, config);
    const result = await service.bindings({ workspaceId: "ws_accounts", user: { userId: "usr_bobby", role: "ADMIN" },
      session: { sessionId: "ses_bobby" } } as any, { environment: "paper", limit: 1, sort: "binding_id:asc" }) as any;
    expect(result.page.total_count).toBe(2);
    expect(result.page.rows).toHaveLength(1);
    expect(result.page.rows[0].figures).toEqual(binding("a").listFigures);
    expect(result.counts).toEqual({ basis: "AUTHORIZED_SNAPSHOT", observed_at: at.toISOString(),
      coverage: "PARTIAL", all: null, issues: null, by_environment: { paper: 2, sandbox: null, live: null } });
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(source.relation).not.toHaveBeenCalled();
  });

  it("holds metadata/counts/figures on the same repeatable-read snapshot during concurrent replacement", async () => {
    await write([binding("a"), binding("b")]);
    const result = await query.listWithSnapshot(bindingsResource(), actor, { limit: 1, sort: "binding_id:asc" }, async reader => {
      await write([binding("new")]);
      return repository.bindingListSnapshot(reader, "ws_accounts", "paper");
    });
    expect(result.page.rows[0].binding_id).toBe("a");
    expect(result.page.total_count).toBe(2);
    expect(result.snapshot!.counts!.by_environment.paper).toBe(2);
    const next = await query.listWithSnapshot(bindingsResource(), actor, {}, reader =>
      repository.bindingListSnapshot(reader, "ws_accounts", "paper"));
    expect(next.page.rows[0].binding_id).toBe("new");
    expect(next.snapshot!.counts!.by_environment.paper).toBe(1);
  });

  it("preserves old rows without figures, explicit null/zero, and sanitizes non-contract financial keys", async () => {
    const unknown = binding("new");
    unknown.listFigures = { native_equity: null, virtual_used: [amount("0")],
      wallet_balance: [amount("999999")] } as any;
    await write([binding("old", false), unknown]);
    const result = await query.list(bindingsResource(), actor, {});
    expect(result.rows.find(row => row.binding_id === "old")).not.toHaveProperty("figures");
    expect(result.rows.find(row => row.binding_id === "new")!.figures).toEqual({ native_equity: null,
      virtual_used: [amount("0")] });
    expect(JSON.stringify(result)).not.toContain("999999");
  });

  it("rejects invalid roles before any snapshot callback and publishes no invented observation clock", async () => {
    const read = vi.fn(reader => repository.bindingListSnapshot(reader, "ws_accounts", "paper"));
    await expect(query.listWithSnapshot(bindingsResource(), { ...actor, role: "UNTRUSTED" }, {}, read))
      .rejects.toMatchObject({ code: "QUERY_FORBIDDEN" });
    expect(read).not.toHaveBeenCalled();
    await repository.replaceBindings({ workspaceId: "ws_accounts", environment: "paper", sourceAsOf: null,
      completeness: "UNKNOWN", rows: [] });
    const result = await query.listWithSnapshot(bindingsResource(), actor, {}, read);
    expect(result.snapshot!.counts).toBeUndefined();
  });
});
