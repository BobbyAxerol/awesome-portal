import { describe, expect, it, vi } from "vitest";

import { RESEARCH_DB_BUDGET } from "../src/research/contracts";
import { ResearchEvidenceRepository } from "../src/research/evidence.repository";

const scope = { workspaceId: "ws-evidence", actorUserId: "usr-evidence" };

function harness(member: boolean) {
  const calls: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("FROM workspace_members")) return { rows: member ? [{ one: 1 }] : [], rowCount: member ? 1 : 0 };
      if (sql.includes("transaction_timestamp()")) return { rows: [{ as_of_utc_ms: "1" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client) };
  return { repository: new ResearchEvidenceRepository(pool as never), client, calls };
}

describe("P23 W06 · Evidence transaction setup", () => {
  it("keeps five RLS/time budget values transaction-local in one parameterized round trip", async () => {
    const { repository, client, calls } = harness(true);
    await expect(repository.hub(scope, "rrun-evidence")).resolves.toBeNull();

    const setup = calls.filter(({ sql }) => sql.includes("set_config("));
    expect(setup).toHaveLength(1);
    expect(setup[0]?.values).toEqual([
      String(RESEARCH_DB_BUDGET.statementTimeoutMs) + "ms",
      String(RESEARCH_DB_BUDGET.lockTimeoutMs) + "ms",
      String(RESEARCH_DB_BUDGET.idleTransactionTimeoutMs) + "ms",
      scope.workspaceId,
      scope.actorUserId,
    ]);
    expect(setup[0]?.sql.match(/set_config\(/g)).toHaveLength(5);
    expect(setup[0]?.sql.match(/, true\)/g)).toHaveLength(5);
    expect(calls[0]?.sql).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(calls[1]?.sql).toContain("SET LOCAL ROLE");
    expect(calls.indexOf(setup[0]!)).toBeLessThan(calls.findIndex(({ sql }) => sql.includes("FROM workspace_members")));
    expect(calls.at(-1)?.sql).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("still denies nonmembers before reading a run and rolls back", async () => {
    const { repository, client, calls } = harness(false);
    await expect(repository.hub(scope, "rrun-evidence")).rejects.toMatchObject({
      code: "RESEARCH_EVIDENCE_FORBIDDEN", status: 403,
    });
    expect(calls.some(({ sql }) => sql.includes("FROM research.run_producers producer"))).toBe(false);
    expect(calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
