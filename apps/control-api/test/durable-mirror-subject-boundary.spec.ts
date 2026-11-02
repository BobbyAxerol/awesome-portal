/** Synthetic SQL-boundary tests; they do not qualify a live Edge source. */
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { testConfig } from "./harness";

const scope = { workspaceId: "TEST_ONLY-workspace", environment: "paper" as const, profileId: "PAPER_TEST_ONLY" };
const relation = "manager.orders:orders";

function fixture(retained = false) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT count")
    ? [{ row_count: "0", oldest_ts: null, newest_ts: null }] : [] }));
  const config = testConfig();
  if (retained) config.EXECUTION_READ_PROFILE = "retained_review_v1";
  return { query, mirror: new ExecutionDurableMirrorRepository(config, { query } as unknown as Pool) };
}

describe("durable mirror subject filter boundary", () => {
  it.each(["order_id", "unknown", "toString", "constructor", "__proto__", ""])
    ("refuses unknown entity field %s before querying page or coverage", async field => {
      const { mirror, query } = fixture(), entity = { field, value: "TEST_ONLY-id" };
      await expect(mirror.subjectRows(scope, relation, { entity, limit: 5 }))
        .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
      await expect(mirror.subjectCoverage(scope, relation, entity))
        .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
      expect(query).not.toHaveBeenCalled();
    });
  it("refuses a supported field with a non-string value before querying", async () => {
    const { mirror, query } = fixture(), entity = { field: "account_id", value: 123 as unknown as string };
    await expect(mirror.subjectRows(scope, relation, { entity, limit: 5 }))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    await expect(mirror.subjectCoverage(scope, relation, entity))
      .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    { key: "manager.orders:orders", field: "strategy_id", retained: false },
    { key: "manager.fills:fills", field: "account_id", retained: false },
    { key: "manager.orders:orders", field: "account_id", retained: true },
    { key: "manager.fills:fills", field: "strategy_id", retained: true },
  ])("keeps $field bound for $key in page and coverage (retained=$retained)", async ({ key, field, retained }) => {
    const { mirror, query } = fixture(retained), entity = { field, value: "TEST_ONLY-subject" };
    await mirror.subjectRows(scope, key, { entity, limit: 5 });
    await mirror.subjectCoverage(scope, key, entity);
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql, values] of query.mock.calls as unknown as [string, unknown[]][]) {
      expect(sql).toContain(retained ? `fields->>'${field}' = $5` : `${field} = $5`);
      expect(values[4]).toBe(entity.value);
      expect(sql).not.toContain(entity.value);
    }
  });
});
