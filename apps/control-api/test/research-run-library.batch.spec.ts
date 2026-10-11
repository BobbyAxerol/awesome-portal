import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { ResearchRunLibraryRepository, RUN_LIBRARY_PAGE_BATCH_WAIT_MS } from "../src/research/run-library.repository";
import { ResearchRunLibraryQuerySchema } from "../src/research/run-library.contract";

const workspaceId = "workspace-batch";
const query = ResearchRunLibraryQuerySchema.parse({ limit: 20 });
const scope = (actorUserId: string) => ({ workspaceId, actorUserId });
const counters = Object.fromEntries([
  "total_rows", "filtered_rows", "logical_runs", "worker_children", "technical_retries",
  "legacy_metadata_rows", "issued", "not_issued", "pending_source", "failed",
  "cancelled_before_source", "legacy_metadata_only", "completed", "running", "queued",
  "draft", "cancelled", "recovery_required",
].map((key) => [key, "0"]));

describe("P12 bounded in-flight page coalescing", () => {
  it("bounds the measured stagger window at40ms without caching a settled page", async () => {
    vi.useFakeTimers();
    try {
      const client={release:vi.fn(),query:vi.fn(async(input:string|{text:string})=>{
        const sql=typeof input==='string'?input:input.text;
        if(sql.startsWith('SELECT 1 FROM workspace_members'))return {rows:[{}],rowCount:1};
        if(sql.startsWith('SELECT user_id FROM workspace_members'))return {rows:[{user_id:'a'},{user_id:'b'}],rowCount:2};
        if(sql.includes('AS filtered_rows'))return {rows:[{...counters,as_of_utc_ms:'1790000000000',alphas:[],modes:[]}],rowCount:1};
        return {rows:[],rowCount:0};
      })};
      const connect=vi.fn(async()=>client),repo=new ResearchRunLibraryRepository({connect} as unknown as Pool);
      expect(RUN_LIBRARY_PAGE_BATCH_WAIT_MS).toBe(40);
      const a=repo.list(scope('a'),query,null);
      await vi.advanceTimersByTimeAsync(30);expect(connect).not.toHaveBeenCalled();
      const b=repo.list(scope('b'),query,null);
      await vi.advanceTimersByTimeAsync(9);expect(connect).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);await Promise.all([a,b]);expect(connect).toHaveBeenCalledTimes(1);
      const fresh=repo.list(scope('a'),query,null);
      await vi.advanceTimersByTimeAsync(40);await fresh;expect(connect).toHaveBeenCalledTimes(2);
    }finally{vi.useRealTimers();}
  });
  it("shares one exact snapshot but returns only each authorized actor's draft", async () => {
    const statements: string[] = [];
    const release = vi.fn();
    const client = { release, query: vi.fn(async (input: string | { text: string }, values?: unknown[]) => {
      const sql = typeof input === "string" ? input : input.text;
      statements.push(sql);
      if (sql.startsWith("SELECT 1 FROM workspace_members")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("WITH library_page AS MATERIALIZED")) return {
        rows: [{ run_id: "rrun_shared", rc_draft_id: "rcd_leader_must_not_leak", retained_card_facts: null }],
        rowCount: 1,
      };
      if (sql.includes("AS filtered_rows")) return {
        rows: [{ ...counters, as_of_utc_ms: "1790000000000", alphas: [], modes: [], scratch_available: false }],
        rowCount: 1,
      };
      if (sql.startsWith("SELECT user_id FROM workspace_members")) return {
        rows: [{ user_id: "reader-a" }, { user_id: "reader-b" }], rowCount: 2,
      };
      if (sql.includes("FROM research.release_candidate_drafts_v1")) {
        expect(values?.[1]).toEqual(["reader-a", "reader-b"]);
        return { rows: [{ actor_user_id: "reader-a", run_id: "rrun_shared", draft_id: "rcd_actor_a" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) };
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const repository = new ResearchRunLibraryRepository(pool);
    const results = await Promise.allSettled([
      repository.list(scope("reader-a"), query, null),
      repository.list(scope("reader-b"), query, null),
      repository.list(scope("denied"), query, null),
    ]);
    expect(results[0]).toMatchObject({ status: "fulfilled", value: {
      asOfUtcMs: 1790000000000, rows: [{ rc_draft_id: "rcd_actor_a" }],
    } });
    expect(results[1]).toMatchObject({ status: "fulfilled", value: {
      asOfUtcMs: 1790000000000, rows: [{ rc_draft_id: null }],
    } });
    expect(results[2]).toMatchObject({ status: "rejected", reason: {
      code: "RESEARCH_RUN_LIBRARY_FORBIDDEN", status: 403,
    } });
    expect(statements.filter((sql) => sql.includes("WITH library_page AS MATERIALIZED"))).toHaveLength(1);
    expect(statements.filter((sql) => sql.includes("AS filtered_rows"))).toHaveLength(1);
    expect(release).toHaveBeenCalledTimes(1);
    const pageSql = statements.find((sql) => sql.includes("WITH library_page AS MATERIALIZED"))!;
    expect(pageSql).not.toContain("current_setting('research.actor_user_id'");
    expect(pageSql).not.toContain("rc_draft ON true");
    expect(pageSql).toContain("NULL::text AS rc_draft_id");
    expect(ResearchRunLibraryRepository.pageJoins()).toContain("rc_draft ON true");
    expect(ResearchRunLibraryRepository.selectColumns()).toContain("rc_draft.draft_id AS rc_draft_id");
    // AN-29 must use this production fast path too, not only retainedFacts().
    expect(pageSql).toContain("research.current_source_analytics_sidecars_v2 retained_sidecar");
    expect(pageSql).toContain("retained_sidecar.retained_import_digest = retained.retained_import_digest");
    expect(pageSql).toContain("'analytics_v2', COALESCE(retained.analytics_v2, retained_sidecar.analytics)");
    expect(pageSql).toContain("'analytics_v2_digest', retained_sidecar.analytics_digest");
    expect(pageSql).toContain("'summary_analytics_v2', projection.projection->'summary_analytics_v2'");
  });

  it("preserves the twenty-reader cap even when all page queries are identical", async () => {
    let unblock!: () => void;
    const held = new Promise<void>((resolve) => { unblock = resolve; });
    const client = { release: vi.fn(), query: vi.fn(async (input: string | { text: string }) => {
      const sql = typeof input === "string" ? input : input.text;
      if (sql.startsWith("SELECT 1 FROM workspace_members")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("WITH library_page AS MATERIALIZED")) { await held; return { rows: [], rowCount: 0 }; }
      if (sql.includes("AS filtered_rows")) return {
        rows: [{ ...counters, as_of_utc_ms: "1790000000000", alphas: [], modes: [] }], rowCount: 1,
      };
      if (sql.startsWith("SELECT user_id FROM workspace_members")) {
        return { rows: Array.from({ length: 20 }, (_, index) => ({ user_id: `reader-${index}` })), rowCount: 20 };
      }
      return { rows: [], rowCount: 0 };
    }) };
    const repository = new ResearchRunLibraryRepository({ connect: vi.fn(async () => client) } as unknown as Pool);
    const reads = Array.from({ length: 20 }, (_, index) => repository.list(scope(`reader-${index}`), query, null));
    await expect(repository.list(scope("reader-overflow"), query, null)).rejects.toMatchObject({
      code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE", status: 503,
    });
    unblock();
    await expect(Promise.all(reads)).resolves.toHaveLength(20);
    expect(client.release).toHaveBeenCalledTimes(1);
    await expect(repository.list(scope("reader-0"), query, null)).resolves.toMatchObject({ rows: [] });
  });
});
