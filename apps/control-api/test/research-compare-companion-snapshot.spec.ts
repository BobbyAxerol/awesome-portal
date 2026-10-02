import { describe, expect, it, vi } from "vitest";
import { ResearchCompareRepository } from "../src/research/compare.repository";

describe("Compare source-bound companion snapshot", () => {
  it("keeps enrichment inside the authenticated bounded repeatable-read query with no extra per-run read", async () => {
    const queries: Array<{ sql: string; parameters: unknown[] | undefined }> = [];
    const companion = { run_id: "rrun_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", enriched_analysis: {}, enriched_digest: "a".repeat(64) };
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string, parameters?: unknown[]) => {
        queries.push({ sql, parameters });
        if (sql.includes("FROM workspace_members")) return { rowCount: 1, rows: [{}] };
        if (sql.includes("transaction_timestamp()")) return { rows: [{ as_of_utc_ms: 1790000000000 }] };
        if (sql.startsWith("SELECT alpha_id, name")) return { rows: [{ alpha_id: "alpha-p20", name: "P20" }] };
        if (sql.startsWith("SELECT bounded_runs.*")) return { rows: [companion] };
        if (sql.includes("count(*)::bigint AS count")) return { rows: [{ count: "1" }] };
        return { rows: [] };
      }),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const snapshot = await new ResearchCompareRepository(pool as never).snapshot({ workspaceId: "ws-p20", actorUserId: "usr-p20" }, "alpha-p20", [], 128);
    expect(snapshot?.runs).toEqual([companion]);
    const source = queries.find(({ sql }) => sql.startsWith("SELECT bounded_runs.*"))!;
    expect(source.parameters).toEqual(["ws-p20", "alpha-p20", [], 129]);
    expect(source.sql).toContain("enrichment.enriched AS enriched_analysis, enrichment.enriched_digest");
    expect(source.sql).toContain("enrichment.workspace_id=companion_scope.workspace_id AND enrichment.run_id=bounded_runs.run_id");
    expect(source.sql).toContain("seal.retained_import_digest=enrichment.source_digest");
    expect(source.sql).toContain("projection.source_evidence_digest=enrichment.source_digest");
    expect(source.sql).toContain("producer.worker_attempt_id=projection.worker_attempt_id");
    expect(source.sql).toContain("LIMIT $4");
    expect(source.sql.indexOf("LIMIT $4")).toBeLessThan(source.sql.indexOf("SELECT enrichment.enriched, enrichment.enriched_digest"));
    expect(queries.filter(({ sql }) => sql.startsWith("SELECT bounded_runs.*"))).toHaveLength(1);
    expect(queries[0]!.sql).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(queries.some(({ sql }) => /\b(?:INSERT|UPDATE|DELETE)\b/.test(sql))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
