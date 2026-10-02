import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { DELTA_CAUSAL_INNER_PROFILE } from "../src/research/delta-causal-inner.profile";
import { ResearchRunLibraryRepository } from "../src/research/run-library.repository";

const scope = { workspaceId: "library-causal-unit-workspace", actorUserId: "library-causal-unit-reader" };
const pair = DELTA_CAUSAL_INNER_PROFILE.current_source;
const compact = (sql: string) => sql.replace(/\s+/g, " ");
function exactCausalExclusion(alias: string) {
  // IS DISTINCT FROM preserves historical/unknown (including NULL) aliases;
  // only both exact causal identifiers make this candidate lookup ineligible.
  return `AND (${alias}.source_adapter_id IS DISTINCT FROM '${pair.source_adapter_id}' OR ${alias}.profile_id IS DISTINCT FROM '${pair.profile_id}')`;
}

describe("Library causal-inner selected-candidate scope boundary", () => {
  it("retainedFacts excludes inner candidate metrics on the exact causal pair without filtering the seal or v2 analytics", async () => {
    const analytics = { schema_version: "synthetic-unit-analytics-v2", marker: "unaltered" };
    const row = { run_id: "library-causal-unit-run", artifact_revision: "1", metrics: null, analytics_v2: analytics,
      analytics_v2_digest: "a".repeat(64), fold_count: "2", trade_fold_count: "0", trade_sum: null, observation_count: "336" };
    const statements: Array<{ sql: string; values?: unknown[] }> = [];
    const client = { release: vi.fn(), query: vi.fn(async (sql: string, values?: unknown[]) => {
      statements.push({ sql, values });
      if (sql.startsWith("SELECT 1 FROM workspace_members")) return { rows: [{}], rowCount: 1 };
      if (sql.startsWith("SELECT seal.run_id")) return { rows: [row], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }) };
    const repository = new ResearchRunLibraryRepository({ connect: vi.fn().mockResolvedValue(client) } as unknown as Pool);
    const facts = await repository.retainedFacts(scope, [row.run_id]);
    const statement = statements.find(item => item.sql.startsWith("SELECT seal.run_id"))!;
    const sql = compact(statement.sql);
    const candidateStart = sql.indexOf("LEFT JOIN LATERAL ( SELECT row.payload");
    const candidateEnd = sql.indexOf(") candidate ON TRUE", candidateStart);
    expect(sql.slice(candidateStart, candidateEnd)).toContain(exactCausalExclusion("seal"));
    expect(sql.slice(0, candidateStart)).not.toContain("IS DISTINCT FROM");
    expect(sql).toContain("source.source_adapter_id, source.profile_id");
    expect(sql).toContain("COALESCE(seal.summary->'summary_analytics_v2', sidecar.analytics) AS analytics_v2");
    expect(sql).toContain("sidecar.retained_import_digest = seal.retained_import_digest");
    expect(statement.values).toEqual([scope.workspaceId, [row.run_id]]);
    expect(facts[0]).toMatchObject({ metrics: null, analytics_v2: analytics, analytics_v2_digest: row.analytics_v2_digest });
    expect(statements.some(item => item.sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")).toBe(true);
    expect(statements.some(item => item.sql === "COMMIT")).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("the shared Library/Lineage page lateral nulls the same exact causal candidate metrics while retaining analytics custody", () => {
    for (const includeActorDraft of [true, false]) {
      const joins = compact(ResearchRunLibraryRepository.pageJoins(includeActorDraft));
      const candidateStart = joins.indexOf("LEFT JOIN LATERAL ( SELECT row.payload->'trial_facts'->'metrics' AS metrics");
      const candidateEnd = joins.indexOf(") retained_selected ON true", candidateStart);
      expect(joins.slice(candidateStart, candidateEnd)).toContain(exactCausalExclusion("retained"));
      expect(joins.slice(0, candidateStart)).not.toContain("IS DISTINCT FROM");
      expect(joins).toContain("seal.source_adapter_id, seal.profile_id");
      expect(joins).toContain("seal.summary->'summary_analytics_v2' AS analytics_v2");
      expect(joins).toContain("retained_sidecar.retained_import_digest = retained.retained_import_digest");
      const columns = compact(ResearchRunLibraryRepository.selectColumns(includeActorDraft));
      expect(columns).toContain("'metrics', retained_selected.metrics");
      expect(columns).toContain("'analytics_v2', COALESCE(retained.analytics_v2, retained_sidecar.analytics)");
      expect(columns).toContain("'analytics_v2_digest', retained_sidecar.analytics_digest");
    }
  });
});
