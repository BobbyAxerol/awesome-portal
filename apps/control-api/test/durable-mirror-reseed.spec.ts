import { describe, expect, it } from "vitest";
import { reseedDurableMirrorCursors } from "../src/execution/durable-mirror-reseed";
import { testConfig } from "./harness";

const config = (overrides: Partial<Record<string, string>> = {}) => testConfig({
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_reseed",
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
  FEATURE_EXECUTION_DURABLE_MIRROR: "true",
  FEATURE_EXECUTION_DURABLE_MIRROR_READS: "false",
  ...overrides,
});

function fakePool() {
  const queries: Array<{ sql: string; params?: readonly unknown[] }> = [];
  const client = {
    query: async <T>(sql: string, params?: readonly unknown[]) => {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT pg_try_advisory")) return { rows: [{ locked: true }] } as { rows: T[]; rowCount: number };
      if (sql.includes("count(*)::text AS row_count")) {
        return { rows: [{ row_count: "7", oldest_ts: "2026-09-09T00:00:00.000Z", newest_ts: "2026-09-14T00:00:00.000Z" }] } as { rows: T[]; rowCount: number };
      }
      if (sql.includes("SELECT count(*)::text AS count")) return { rows: [{ count: "3" }] } as { rows: T[]; rowCount: number };
      return { rows: [], rowCount: sql.startsWith("UPDATE execution_profile_relation_cursors") ? 3 : 0 } as { rows: T[]; rowCount: number };
    },
    release: () => undefined,
  };
  return { pool: { connect: async () => client }, queries };
}

describe("durable mirror cursor reseed", () => {
  it("dry-runs only aggregate Portal state and leaves cursor rows intact", async () => {
    const { pool, queries } = fakePool();
    const result = await reseedDurableMirrorCursors(pool as never, config(), {
      mode: "DRY_RUN", runId: "prod-mirror-warmup-20260914",
    });
    expect(result).toMatchObject({
      mode: "DRY_RUN",
      durable_mirror_mode: "DUAL_WRITE_WARMUP",
      source_read_performed: false,
      business_rows_emitted: false,
    });
    expect(result.scopes[0]?.legacy_before.row_count).toBe("7");
    expect(queries.some((entry) => entry.sql.startsWith("UPDATE execution_profile_relation_cursors"))).toBe(false);
    expect(queries.some((entry) => /DELETE\s+FROM|execution_durable_mirror_range_rows\s+SET/i.test(entry.sql))).toBe(false);
    expect(queries.map((entry) => entry.sql)).toContain("ROLLBACK");
  });

  it("resets only Portal-owned ladder cursor checkpoints during APPLY", async () => {
    const { pool, queries } = fakePool();
    const result = await reseedDurableMirrorCursors(pool as never, config(), {
      mode: "APPLY", runId: "prod-mirror-warmup-20260914",
    });
    expect(result.scopes[0]?.cursors_reset).toBe(3);
    const update = queries.find((entry) => entry.sql.startsWith("UPDATE execution_profile_relation_cursors"));
    expect(update?.sql).toContain("SET source_cursor=NULL");
    expect(update?.sql).not.toContain("DELETE");
    expect(queries.map((entry) => entry.sql)).toContain("COMMIT");
  });

  it("refuses a reseed once mirror reads are active", async () => {
    const { pool } = fakePool();
    await expect(reseedDurableMirrorCursors(pool as never, config({
      FEATURE_EXECUTION_DURABLE_MIRROR_READS: "true",
    }), { mode: "DRY_RUN", runId: "prod-mirror-warmup-20260914" }))
      .rejects.toMatchObject({ code: "DURABLE_MIRROR_RESEED_REQUIRES_WRITE_ONLY_WARMUP" });
  });
});
