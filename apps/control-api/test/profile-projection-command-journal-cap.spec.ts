/** Real projection worker with an in-memory repository and a synthetic Edge facade
 * (ascending-PK pages of <=200, limit+cursor only). Checks commit inputs, not PostgreSQL. */
import { describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { ExecutionProfileProjectionWorker, COMMAND_JOURNAL_PAGE_CAP_REASON, sortJournalNewestFirst } from "../src/execution/profile-projection.worker";
import { documentInvalidReason } from "../src/execution/profile-projection.repository";
import { testConfig } from "./harness";
import { edgeSealFor } from "./edge-seal-fixture";

const JOURNAL_KEY = "manager.command-journal:command_journal";
const PAGE = 200;

function journalRows(total: number) {
  // Facade order is the (random UUIDv4) PK, so accepted_at is deliberately scrambled.
  return Array.from({ length: total }, (_, index) => ({
    command_id: `TEST_ONLY-cmd-${String(index).padStart(6, "0")}`,
    accepted_at: new Date(Date.UTC(2026, 10, 7) + ((index * 7919) % total) * 60_000).toISOString(),
  }));
}

type Declared = "EDGE" | "COMPLETE" | "PARTIAL";
/** EDGE mimics manager_facade.py: a page is PARTIAL while it has a next_cursor, COMPLETE on the last one. */
async function run(total: number, declared: Declared = "EDGE", options: { relation?: string; foreignEvery?: number } = {}) {
  const target = options.relation ?? "command_journal";
  const config = testConfig({
    FEATURE_EXECUTION_EDGE: "true",
    EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
    EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
    EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
    EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
    FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
    EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.invalid",
    EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
    EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
    FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "TEST_ONLY-journal",
  });
  const rows = journalRows(total);
  const stamp = new Date().toISOString();
  let journalPages = 0;
  const source = { relationForProjection: vi.fn(async (_w: string, environment: string, _s: string,
    _source: string, relation: string, query: { limit?: number; cursor?: string }) => {
    let fieldsList: Array<Record<string, unknown>> = [];
    let next: string | null = null;
    if (relation === target) {
      journalPages += 1;
      expect(query.limit).toBe(PAGE);
      const start = query.cursor ? Number(query.cursor.replace("TEST_ONLY-p", "")) : 0;
      fieldsList = rows.slice(start, start + PAGE).map((row, offset) => {
        const account = options.foreignEvery && (start + offset) % options.foreignEvery === 0 ? "TEST_ONLY-other" : "TEST_ONLY-account";
        return target === "orders" ? {
          order_id: { kind: "TEXT", value: row.command_id }, account_id: { kind: "TEXT", value: account },
          updated_at: { kind: "TIMESTAMP", value: new Date().toISOString() },
        } : {
          command_id: { kind: "TEXT", value: row.command_id },
          account_id: { kind: "TEXT", value: account },
          accepted_at: { kind: "TIMESTAMP", value: row.accepted_at },
        };
      });
      next = start + PAGE < rows.length ? `TEST_ONLY-p${start + PAGE}` : null;
    } else if (relation === "accounts") {
      fieldsList = [{ account_id: { kind: "TEXT", value: "TEST_ONLY-account" }, mode: { kind: "TEXT", value: environment } }];
    }
    return { profile_id: "PAPER_BINANCE_USDM", source_environment: environment,
      source: { profile_id: "PAPER_BINANCE_USDM", catalogue_sha256: edgeSealFor("PAPER_BINANCE_USDM"), authority: "EXECUTION_CELL",
        availability: "AVAILABLE", freshness: "FRESH", completeness: relation === target ? (declared === "EDGE" ? (next ? "PARTIAL" : "COMPLETE") : declared) : "COMPLETE", as_of: stamp,
        data: { relation: { schema: "public", relation }, items: fieldsList.map((fields) => ({ relation: { schema: "public", relation }, fields })),
          next_cursor: next } } };
  }) };
  const commits: Array<{ document: any; input: any }> = [];
  const repository = {
    refreshHealth: vi.fn(async () => ({ state: "READY", retryNotBefore: null })),
    tryAcquireLease: vi.fn(async () => true),
    releaseLease: vi.fn(async () => undefined),
    snapshot: vi.fn(async () => null),
    relationCursor: vi.fn(async () => null),
    saveRelationCursor: vi.fn(async () => undefined),
    appendTimeSeriesHistory: vi.fn(async () => undefined),
    confirmRefreshHealthy: vi.fn(async () => undefined),
    commit: vi.fn(async (document: any, input: any) => { commits.push({ document, input }); return { outcome: "COMMITTED" }; }),
  };
  await new ExecutionProfileProjectionWorker(config, source as never, repository as never).runOnce();
  return { commits, journalPages: () => journalPages };
}

describe("command_journal page cap", () => {
  it("keeps all 5,497 rows across 28 pages, newest first, COMPLETE", async () => {
    const { commits, journalPages } = await run(5_497);
    const relation = commits[0].document.relations[JOURNAL_KEY];
    expect(journalPages()).toBe(28);
    expect(relation.items).toHaveLength(5_497);
    expect(relation.completeness).toBe("COMPLETE");
    expect(relation.reason_code).toBeNull();
    const stamps = relation.items.map((row: any) => Date.parse(row.fields.accepted_at));
    expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
    expect(new Set(relation.items.map((row: any) => row.fields.command_id)).size).toBe(5_497);
    expect(documentInvalidReason(commits[0].document)).toBeNull();
  });

  it("stays PARTIAL with a named reason when the source has more than the 8,000-row cap", async () => {
    const { commits, journalPages } = await run(8_450);
    const relation = commits[0].document.relations[JOURNAL_KEY];
    expect(journalPages()).toBe(40);
    expect(relation.items).toHaveLength(8_000);
    expect(relation.completeness).toBe("PARTIAL");
    expect(relation.reason_code).toBe(COMMAND_JOURNAL_PAGE_CAP_REASON);
    expect(commits[0].document.relations[JOURNAL_KEY].items[0].fields.accepted_at >=
      relation.items.at(-1).fields.accepted_at).toBe(true);
    expect(documentInvalidReason(commits[0].document)).toBeNull();
  });

  it("keeps a fully walked journal PARTIAL when Edge declares it so, and logs the walk facts", async () => {
    const log = vi.spyOn(Logger.prototype, "log");
    const { commits } = await run(5_226, "PARTIAL");
    const relation = commits[0].document.relations[JOURNAL_KEY];
    expect(relation.items).toHaveLength(5_226);
    expect(relation.completeness).toBe("PARTIAL");
    expect(relation.reason_code).toBe("SOURCE_PARTIAL");
    const walk = log.mock.calls.map(([line]) => String(line)).find((line) => line.includes("journal_walk"))!;
    expect(JSON.parse(walk)).toMatchObject({ outcome: "DRAINED", pages: 27, rows: 5_226,
      declared_completeness: { PARTIAL: 27 }, source_projected_total: null });
    log.mockRestore();
  });

  it("is COMPLETE when Edge's pages are [PARTIAL, PARTIAL, COMPLETE] (walked to the end)", async () => {
    const { commits, journalPages } = await run(450);
    const relation = commits[0].document.relations[JOURNAL_KEY];
    expect(journalPages()).toBe(3);
    expect(relation).toMatchObject({ completeness: "COMPLETE", reason_code: null });
    expect(relation.items).toHaveLength(450);
  });

  it("is COMPLETE for a single COMPLETE page", async () => {
    const { commits } = await run(10);
    expect(commits[0].document.relations[JOURNAL_KEY]).toMatchObject({ completeness: "COMPLETE", reason_code: null });
  });

  it("does not treat scoped-out rows as partial", async () => {
    const { commits } = await run(450, "EDGE", { foreignEvery: 3 });
    const relation = commits[0].document.relations[JOURNAL_KEY];
    expect(relation.lineage_scoped_out).toEqual({ account: 150 });
    expect(relation.items).toHaveLength(300);
    expect(relation).toMatchObject({ completeness: "COMPLETE", reason_code: null });
  });

  it("keeps the worst-of-pages merge for a ladder relation (orders), unchanged", async () => {
    const { commits } = await run(450, "EDGE", { relation: "orders" });
    const relation = commits[0].document.relations["manager.orders:orders"];
    expect(relation.items).toHaveLength(450);
    expect(relation).toMatchObject({ completeness: "PARTIAL", reason_code: "SOURCE_PARTIAL" });
  });

  it("sorts unparseable timestamps last and breaks ties by command_id", () => {
    const rows = [{ command_id: "b", accepted_at: null }, { command_id: "z", accepted_at: "2026-11-02T00:00:00Z" },
      { command_id: "a", accepted_at: "2026-11-02T00:00:00Z" }, { command_id: "n", accepted_at: "2026-11-03T00:00:00Z" }] as never;
    expect(sortJournalNewestFirst(rows).map((row) => row.command_id)).toEqual(["n", "a", "z", "b"]);
  });
});
