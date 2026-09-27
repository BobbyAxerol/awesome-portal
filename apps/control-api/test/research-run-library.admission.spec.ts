import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE } from "../src/research/contracts";
import { ResearchRunLibraryRepository, RUN_LIBRARY_READ_LIMITS } from "../src/research/run-library.repository";
import { ResearchRunLibraryQuerySchema } from "../src/research/run-library.contract";

const scope = { workspaceId: "p23-owned-workspace", actorUserId: "p23-owned-reader" };

function cell(member = true) {
  let unblock!: () => void;
  const hold = new Promise<void>((resolve) => { unblock = resolve; });
  let live = 0, peak = 0;
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const clients: Array<{ query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> = [];
  const connect = vi.fn(async () => {
    live += 1; peak = Math.max(peak, live);
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        statements.push({ sql, values });
        if (sql.includes("FROM unnest")) await hold;
        return { rows: [], rowCount: sql.startsWith("SELECT 1 FROM workspace_members") ? Number(member) : 0 };
      }),
      release: vi.fn(() => { live -= 1; }),
    };
    clients.push(client);
    return client;
  });
  return { pool: { connect } as unknown as Pool, connect, clients, statements, unblock,
    live: () => live, peak: () => peak };
}

afterEach(() => vi.useRealTimers());

describe("P23 bounded Run Library admission", () => {
  it("reads exact card metrics, not unused full fold/candle payloads", () => {
    const joins = ResearchRunLibraryRepository.pageJoins();
    expect(joins).not.toContain("retained_fold_rows");
    expect(joins).not.toContain("jsonb_agg(bounded.payload");
    for (const key of ["metric_registry_version", "metrics", "direct", "derived", "oos_analytics"]) {
      expect(joins).toContain(`projection.projection->'${key}'`);
    }
    expect(joins).toContain("AS trade_sum");
    expect(joins).not.toContain("projection.projection->'candle_overview'");
    // Sealed WFO summaries include full fold/chart history (60 KiB in the
    // measured cell), but neither Library nor P19's card mapper uses it.
    // Select only the exact selection keys and metrics; no query/data cache.
    expect(joins).toContain("seal.summary->'selection' AS selection");
    expect(joins).toContain("row.payload->'trial_facts'->'metrics' AS metrics");
    expect(joins).toContain("retained.selection->>'trial_id'");
    const columns = ResearchRunLibraryRepository.selectColumns();
    expect(columns).toContain("'metrics', retained_selected.metrics");
    for (const payload of ["retained.summary AS retained_summary", "retained_selected.candidate", "AS retained_revision"]) {
      expect(columns).not.toContain(payload);
    }
  });
  it("bounds filtered keyset metadata before hydrating rich cards, in both directions", async () => {
    const queries: Array<{ sql: string; values?: unknown[]; name?: string }> = [];
    const counters = Object.fromEntries([
      "total_rows", "filtered_rows", "logical_runs", "worker_children", "technical_retries",
      "legacy_metadata_rows", "issued", "not_issued", "pending_source", "failed",
      "cancelled_before_source", "legacy_metadata_only", "completed", "running", "queued",
      "draft", "cancelled", "recovery_required",
    ].map(key => [key, "0"]));
    const client = { release: vi.fn(), query: vi.fn(async (input: string | { name: string; text: string; values: unknown[] }, rawValues?: unknown[]) => {
      const sql = typeof input === "string" ? input : input.text;
      const values = typeof input === "string" ? rawValues : input.values;
      if (typeof input !== "string") expect(input.name).toMatch(/^research_p12_v2_[a-f0-9]{32}$/);
      queries.push({ sql, values, name: typeof input === "string" ? undefined : input.name });
      if (sql.startsWith("SELECT 1 FROM workspace_members")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("AS filtered_rows")) return { rows: [{ ...counters, as_of_utc_ms: "1790000000000" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }) };
    const repository = new ResearchRunLibraryRepository({ connect: vi.fn(async () => client) } as unknown as Pool);
    for (const direction of ["after", "before"] as const) {
      const page = await repository.list(scope, ResearchRunLibraryQuerySchema.parse({ q: "Delta", limit: 5 }), {
        createdAt: "2026-09-27T00:00:00.123456Z", runId: "rrun_owned", direction,
      });
      expect(page.retainedFacts).toEqual([]);
    }
    const pages = queries.filter(query => query.sql.includes("WITH library_page AS MATERIALIZED"));
    expect(pages).toHaveLength(2);
    for (const [index, page] of pages.entries()) {
      const metadata = page.sql.slice(0, page.sql.indexOf("FROM library_page library"));
      expect(metadata).toContain("JOIN research.run_library_rows_v1 library");
      expect(metadata).toContain("search.search_document ILIKE");
      expect(metadata).toContain("LIMIT $5");
      expect(metadata).toContain(index ? "library.created_at > $3::timestamptz" : "library.created_at < $3::timestamptz");
      expect(page.sql.indexOf("LIMIT $5")).toBeLessThan(page.sql.indexOf("LEFT JOIN LATERAL"));
      expect(page.values).toEqual([scope.workspaceId, "%Delta%", "2026-09-27T00:00:00.123456Z", "rrun_owned", 6]);
    }
    expect(client.release).toHaveBeenCalledTimes(2);
    await repository.list({ workspaceId: "other-owned-workspace", actorUserId: "other-owned-reader" },
      ResearchRunLibraryQuerySchema.parse({ q: "Delta", limit: 5 }), {
        createdAt: "2026-09-27T00:00:00.123456Z", runId: "rrun_owned", direction: "after",
      });
    const other = queries.filter(query => query.sql.includes("WITH library_page AS MATERIALIZED"))[2];
    // Reuse a SQL plan, never the first caller's values, authority or rows.
    expect(other.name).toBe(pages[0].name);
    expect(other.values?.[0]).toBe("other-owned-workspace");
    expect(queries.filter(query => query.sql.startsWith("SELECT 1 FROM workspace_members")).at(-1)?.values)
      .toEqual(["other-owned-workspace", "other-owned-reader"]);
    expect(other.name).not.toContain(scope.workspaceId);
    expect(client.release).toHaveBeenCalledTimes(3);
  });

  it("admits twenty reads with only four DB clients and rejects the twenty-first", async () => {
    const fixture = cell();
    const repository = new ResearchRunLibraryRepository(fixture.pool);
    const reads = Array.from({ length: 20 }, () => repository.retainedFacts(scope, ["rrun_owned"]));
    await vi.waitFor(() => expect(fixture.statements.filter(s => s.sql.includes("FROM unnest"))).toHaveLength(4));
    await expect(repository.retainedFacts(scope, ["rrun_overflow"])).rejects.toMatchObject({
      code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE", status: 503,
    });
    expect(RUN_LIBRARY_READ_LIMITS).toEqual({ maximumActive: 4, maximumQueued: 16 });
    fixture.unblock();
    await expect(Promise.all(reads)).resolves.toHaveLength(20);
    expect(fixture.peak()).toBe(4);
    expect(fixture.live()).toBe(0);
    expect(fixture.clients.every(c => c.release.mock.calls.length === 1)).toBe(true);
    const settings = fixture.statements.filter(s => s.sql.includes("set_config"));
    expect(settings).toHaveLength(20);
    expect(settings.every(s => s.values?.join("|") ===
      `${RESEARCH_DB_BUDGET.statementTimeoutMs}ms|${RESEARCH_DB_BUDGET.lockTimeoutMs}ms|${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms|${scope.workspaceId}|${scope.actorUserId}`)).toBe(true);
    expect(fixture.statements.filter(s => s.sql === `SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`)).toHaveLength(20);
  });

  it("expires queued requests without launching their DB work or losing slots", async () => {
    vi.useFakeTimers();
    const fixture = cell();
    const repository = new ResearchRunLibraryRepository(fixture.pool);
    const active = Array.from({ length: 4 }, () => repository.retainedFacts(scope, ["rrun_active"]));
    const waiting = Promise.allSettled(Array.from({ length: 16 }, () => repository.retainedFacts(scope, ["rrun_queued"])));
    await vi.advanceTimersByTimeAsync(RESEARCH_DB_BUDGET.boundedReadQueueWaitMs + 1);
    expect((await waiting).every(result => result.status === "rejected")).toBe(true);
    expect(fixture.connect).toHaveBeenCalledTimes(4);
    fixture.unblock(); await Promise.all(active);
    await expect(repository.retainedFacts(scope, ["rrun_next"])).resolves.toEqual([]);
    expect(fixture.live()).toBe(0);
  });

  it("times out shared-pool acquisition and releases a late client exactly once", async () => {
    vi.useFakeTimers();
    let resolveClient!: (client: unknown) => void;
    const release = vi.fn();
    const pool = { connect: vi.fn(() => new Promise(resolve => { resolveClient = resolve; })) };
    const repository = new ResearchRunLibraryRepository(pool as unknown as Pool);
    const read = repository.retainedFacts(scope, ["rrun_late"]);
    const checked = expect(read).rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE", status: 503 });
    await vi.advanceTimersByTimeAsync(RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs + 1);
    await checked;
    resolveClient({ release }); await Promise.resolve(); await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("still checks exact workspace membership before reading retained rows", async () => {
    const fixture = cell(false);
    const repository = new ResearchRunLibraryRepository(fixture.pool);
    await expect(repository.retainedFacts(scope, ["rrun_forbidden"])).rejects.toMatchObject({
      code: "RESEARCH_RUN_LIBRARY_FORBIDDEN", status: 403,
    });
    expect(fixture.statements.some(s => s.sql.includes("FROM unnest"))).toBe(false);
    expect(fixture.statements.some(s => s.sql === "ROLLBACK")).toBe(true);
    expect(fixture.live()).toBe(0);
  });
});
