import { describe, expect, it, vi } from "vitest";

import { ResearchUtilitySaturated, assertUtilityCapacity } from "../src/research/utility-admission";
import { ResearchUtilityVerifyAdmissionService } from "../src/research/utility-verify-admission.service";

function counter(total: string, actor: string) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => sql.includes("SELECT count(*)::text")
    ? { rows: [{ total, actor }] } : { rows: [], rowCount: 0 });
  return { query };
}

describe("P23 shared utility admission", () => {
  it("serializes before counting and admits below both actor and workspace caps", async () => {
    const client = counter("3", "1");
    await expect(assertUtilityCapacity(client as never, "ws", "actor")).resolves.toBeUndefined();
    expect(client.query.mock.calls.map(([sql]) => String(sql))).toEqual([
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      expect.stringContaining("FROM research.run_report_export_jobs_v1"),
    ]);
    expect(client.query.mock.calls[0]?.[1]).toEqual(["research-utility:ws"]);
    expect(client.query.mock.calls[1]?.[1]).toEqual(["ws", "actor"]);
  });

  it.each([["4", "0"], ["2", "2"]])("refuses workspace/actor saturation (%s/%s)", async (total, actor) => {
    await expect(assertUtilityCapacity(counter(total, actor) as never, "ws", "actor"))
      .rejects.toBeInstanceOf(ResearchUtilitySaturated);
  });

  it("holds an exact expiring slot until observer completion and releases it on failure", async () => {
    const sql: string[] = [];
    const client = {
      query: vi.fn(async (statement: string) => {
        sql.push(statement);
        if (statement.includes("FROM workspace_members")) return { rows: [{ one: 1 }], rowCount: 1 };
        if (statement.includes("SELECT count(*)::text")) return { rows: [{ total: "0", actor: "0" }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const service = new ResearchUtilityVerifyAdmissionService(pool as never);
    const scope = { workspaceId: "ws", actorUserId: "actor" };
    await expect(service.withSlot(scope, "rrun_test", async () => {
      expect(sql.some((line) => line.includes("INSERT INTO research.utility_verify_slots_v1"))).toBe(true);
      expect(sql.some((line) => line.includes("DELETE FROM research.utility_verify_slots_v1 WHERE workspace_id = $1 AND slot_id = $2"))).toBe(false);
      throw new Error("observer failure");
    })).rejects.toThrow("observer failure");
    expect(sql.some((line) => line.includes("DELETE FROM research.utility_verify_slots_v1 WHERE workspace_id = $1 AND slot_id = $2"))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(2);
  });
});
