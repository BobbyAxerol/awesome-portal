import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { AuthSession, PortalUser } from "../src/domain";
import { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
import { ManagerListsRepository } from "../src/manager-lists/manager-lists.repository";
import { ManagerListsService } from "../src/manager-lists/manager-lists.service";
import { AlphaFleetQuerySchema, BindingsQuerySchema } from "../src/manager-lists/contracts";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const user: PortalUser = {
  userId: "usr_bobby", username: "bobby", displayName: "Bobby", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-08-31T00:00:00Z"), updatedAt: new Date("2026-08-31T00:00:00Z"), disabledAt: null,
};
const session: AuthSession = {
  sessionId: "ses_bobby", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-08-31T00:00:00Z"),
  idleExpiresAt: new Date("2026-09-01T00:00:00Z"), absoluteExpiresAt: new Date("2026-09-01T08:00:00Z"),
};

type Scalar = string | number | boolean | null;

class FakeSource {
  readonly calls: string[] = [];
  readonly rows: Record<string, Array<Record<string, Scalar>>> = {
    strategies: [
      { strategy_id: "str_a", alpha_id: "alpha_a", label: "Carry A", version: "3.2", state: "READY", updated_at: "2026-08-31T09:00:00Z", secret_token: "never" },
      { strategy_id: "str_b", alpha_id: "alpha_b", label: "Breakout B", version: "1.1", state: "READY", updated_at: "2026-08-31T08:00:00Z" },
    ],
    strategy_deployments: [
      { deployment_id: "dep_a", strategy_id: "str_a", account_id: "acc_a", mode: "paper", venue: "BINANCE", state: "READY", updated_at: "2026-08-31T10:00:00Z" },
      { deployment_id: "dep_b", strategy_id: "str_b", account_id: "acc_b", mode: "paper", venue: "BYBIT", state: "READY", updated_at: "2026-08-31T08:30:00Z" },
    ],
    accounts: [
      { account_id: "acc_a", mode: "paper", venue: "BINANCE", external_account_ref: "ext_a", active: true, updated_at: "2026-08-31T09:30:00Z" },
      { account_id: "acc_b", mode: "paper", venue: "BYBIT", external_account_ref: "ext_b", active: false, updated_at: "2026-08-31T08:30:00Z" },
    ],
    venue_accounts: [],
    broker_account_sync_effective: [
      { sync_id: "sync_a", external_account_ref: "ext_a", mode: "paper", venue: "BINANCE", status: "SYNCED", synced_at: "2026-08-31T09:31:00Z" },
    ],
  };

  async relation(
    _principal: unknown, environment: string, screenId: string, _sourceId: string,
    relation: string, query: { cursor?: string },
  ) {
    this.calls.push(`${environment}:${screenId}:${relation}`);
    const all = this.rows[relation] ?? [];
    const start = query.cursor ? Number(query.cursor) : 0;
    const slice = all.slice(start, start + 1);
    const next = start + 1 < all.length ? String(start + 1) : null;
    return managerResponse(environment, relation, slice, next);
  }
}

function tagged(value: Scalar) {
  if (value === null) return { kind: "NULL", value };
  if (typeof value === "boolean") return { kind: "BOOLEAN", value };
  if (typeof value === "number") return { kind: "INTEGER", value };
  return { kind: value.includes("T") && value.endsWith("Z") ? "TIMESTAMP" : "TEXT", value };
}

function managerResponse(environment: string, relation: string, rows: Array<Record<string, Scalar>>, next: string | null) {
  const profileId = `${environment.toUpperCase()}_BINANCE_USDM`;
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    source_environment: environment,
    profile_id: profileId,
    source: {
      authority: "EXECUTION_CELL", profile_id: profileId, availability: "AVAILABLE",
      freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-08-31T10:00:00Z",
      data: {
        relation: { schema: "public", relation },
        items: rows.map((fields) => ({
          relation: { schema: "public", relation }, record_key: "opaque-source-key",
          fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, tagged(value)])),
        })),
        next_cursor: next,
      },
    },
  };
}

describe("BR-EX-72 manager list repository and API contracts", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let source: FakeSource;
  let service: ManagerListsService;

  beforeAll(async () => migrateTestDatabase(DATABASE_URL));
  beforeEach(async () => {
    await truncateAll(pool);
    source = new FakeSource();
    service = new ManagerListsService(
      new ManagerListsRepository(pool),
      source as unknown as ExecutionCurrentSourceProxy,
      testConfig(),
    );
  });
  afterAll(async () => pool.end());

  const principal = (workspaceId = "ws_primary") => ({ user, session, workspaceId });

  it("projects the complete Fleet source, returns exact filtered counts, and never exposes source secrets", async () => {
    const full = await service.fleet(principal(), { environment: "paper", limit: 1 }) as Record<string, any>;
    expect(full).toMatchObject({
      schema_version: "execution.alpha-fleet-list.v1", record_authority: "PORTAL_PROJECTION",
      source_authority: "TRADING_SYSTEM", environment: "paper", freshness: "FRESH", completeness: "COMPLETE",
    });
    expect(full.page.total_count).toBe(2);
    expect(full.page.rows).toHaveLength(1);
    expect(full.page.next_cursor).toMatch(/^kc1\./);
    expect(JSON.stringify(full)).not.toContain("secret_token");
    expect(JSON.stringify(full)).not.toContain("opaque-source-key");

    const filtered = await service.fleet(principal(), {
      environment: "paper", limit: 10, search: "Carry", stage: "PAPER",
    }) as Record<string, any>;
    expect(filtered.page.total_count).toBe(2);
    expect(filtered.page.filtered_count).toBe(1);
    expect(filtered.page.rows[0]).toMatchObject({
      alpha_id: "alpha_a", alpha_label: "Carry A", version: "3.2", stage: "PAPER",
      deployments: [{ deployment_id: "dep_a", stage: "PAPER", venue: "BINANCE" }],
    });
  });

  it("publishes list/detail bindings without credentials and isolates workspaces", async () => {
    const primary = await service.bindings(principal(), { environment: "paper", limit: 10 }) as Record<string, any>;
    expect(primary.page.total_count).toBe(2);
    expect(primary.page.rows).toContainEqual(expect.objectContaining({
      binding_id: "acc_a@BINANCE", account_id: "acc_a", venue: "BINANCE",
      state: "ACTIVE", credential_state: "SYNC_SYNCED",
    }));
    expect(JSON.stringify(primary)).not.toContain("external_account_ref");
    expect(source.calls.some((call) => call.endsWith(":venue_credentials"))).toBe(false);

    const detail = await service.binding(principal(), "paper", "acc_a@BINANCE") as Record<string, any>;
    expect(detail).toMatchObject({ schema_version: "execution.binding-detail.v1", item: { binding_id: "acc_a@BINANCE" } });

    source.rows.accounts = [{ account_id: "acc_other", mode: "paper", venue: "OKX", active: true, updated_at: "2026-08-31T11:00:00Z" }];
    source.rows.broker_account_sync_effective = [];
    const other = await service.bindings(principal("ws_other"), { environment: "paper", limit: 10 }) as Record<string, any>;
    expect(other.page.rows.map((item: any) => item.account_id)).toEqual(["acc_other"]);
    const primaryAgain = await service.bindings(principal(), { environment: "paper", limit: 10 }) as Record<string, any>;
    expect(primaryAgain.page.rows.map((item: any) => item.account_id).sort()).toEqual(["acc_a", "acc_b"]);
  });

  it("keeps cursor pages pinned to the committed projection instead of refreshing mid-walk", async () => {
    const first = await service.fleet(principal(), { environment: "paper", limit: 1 }) as Record<string, any>;
    source.rows.strategies = [];
    source.rows.strategy_deployments = [];
    const second = await service.fleet(principal(), {
      environment: "paper", limit: 1, after: first.page.next_cursor,
    }) as Record<string, any>;
    expect(second.page.rows).toHaveLength(1);
    expect(second.page.total_count).toBe(2);
  });

  it("rejects page sizes above the published BR-EX-72 bound", () => {
    expect(AlphaFleetQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(BindingsQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});
