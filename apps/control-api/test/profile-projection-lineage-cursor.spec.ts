/** Real projection worker with an in-memory repository and synthetic source.
 * This checks its commit inputs, not PostgreSQL or connected-source acceptance. */
import { describe, expect, it, vi } from "vitest";
import { ExecutionProfileProjectionWorker } from "../src/execution/profile-projection.worker";
import { testConfig } from "./harness";

const EQUITY_KEY = "manager.performance:account_equity_snapshots";

describe("profile projection lineage and source cursor", () => {
  it.each([null, "TEST_ONLY-before"])("re-reads an unaccounted child from original cursor %s", async originalCursor => {
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
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "TEST_ONLY-lineage",
    });
    let parentReady = false;
    const readCursors: Array<string | undefined> = [];
    const stamp = new Date().toISOString();
    const source = { relationForProjection: vi.fn(async (_workspace: string, environment: string, _screen: string,
      _source: string, relation: string, query: { cursor?: string }) => {
      const target = relation === "account_equity_snapshots";
      if (target) readCursors.push(query.cursor);
      const firstPage = !query.cursor || query.cursor === originalCursor;
      const fields = relation === "accounts" && parentReady ? {
        account_id: { kind: "TEXT", value: "TEST_ONLY-account" },
        mode: { kind: "TEXT", value: environment },
      } : target && firstPage ? {
        id: { kind: "TEXT", value: "TEST_ONLY-equity" },
        account_id: { kind: "TEXT", value: "TEST_ONLY-account" },
        mode: { kind: "TEXT", value: environment },
        ts: { kind: "TIMESTAMP", value: stamp },
        equity: { kind: "DECIMAL", value: "10" },
      } : null;
      return { profile_id: "PAPER_BINANCE_USDM", source_environment: environment,
        source: { profile_id: "PAPER_BINANCE_USDM", authority: "EXECUTION_CELL", availability: "AVAILABLE",
          freshness: "FRESH", completeness: relation === "accounts" && !parentReady ? "PARTIAL" : "COMPLETE", as_of: stamp,
          data: { relation: { schema: "public", relation }, items: fields
            ? [{ relation: { schema: "public", relation }, fields }] : [],
          next_cursor: target && firstPage ? "TEST_ONLY-next" : null } } };
    }) };
    const cursors = new Map<string, string | null>();
    if (originalCursor) cursors.set(EQUITY_KEY, originalCursor);
    const commits: Array<{ document: any; input: any }> = [];
    const repository = {
      refreshHealth: vi.fn(async () => ({ state: "READY", retryNotBefore: null })),
      tryAcquireLease: vi.fn(async () => true),
      releaseLease: vi.fn(async () => undefined),
      snapshot: vi.fn(async () => null),
      relationCursor: vi.fn(async (_w: string, _e: string, _p: string, key: string) => cursors.get(key) ?? null),
      saveRelationCursor: vi.fn(async () => undefined),
      appendTimeSeriesHistory: vi.fn(async () => undefined),
      confirmRefreshHealthy: vi.fn(async () => undefined),
      commit: vi.fn(async (document: any, input: any) => {
        commits.push({ document, input });
        for (const cursor of input.relationCursors) cursors.set(cursor.relationKey, cursor.sourceCursor);
        return { outcome: "COMMITTED" };
      }),
    };
    const worker = new ExecutionProfileProjectionWorker(config, source as never, repository as never);
    try {
      await worker.runOnce();
      expect(commits[0].document.relations[EQUITY_KEY]).toMatchObject({ completeness: "PARTIAL",
        lineage_rejects: { account: 1 }, items: [] });
      expect(cursors.get(EQUITY_KEY)).toBe(originalCursor);
      parentReady = true;
      await worker.runOnce();
      expect(readCursors).toEqual([originalCursor ?? undefined, "TEST_ONLY-next", originalCursor ?? undefined, "TEST_ONLY-next"]);
      expect(commits[1].document.relations[EQUITY_KEY].items).toEqual([
        expect.objectContaining({ fields: expect.objectContaining({ id: "TEST_ONLY-equity", equity: "10" }) }),
      ]);
      expect(cursors.get(EQUITY_KEY)).toBe("TEST_ONLY-next");
    } finally { await worker.onApplicationShutdown(); }
  });
});
