import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import { DurableMirrorWriter } from "../src/execution/durable-mirror.contract";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionDocument,
  ProjectionCommitInput,
} from "../src/execution/profile-projection.repository";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const workspaceId = "ws_eds06";
const profileId = "PAPER_BINANCE_USDM";
const currentKey = "manager.strategies:strategies";
const rangeKey = "manager.performance:performance_snapshots";

const config = testConfig({
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: profileId,
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
  FEATURE_EXECUTION_DURABLE_MIRROR: "true",
});

let pool: Pool;
let mirror: ExecutionDurableMirrorRepository;
let repository: ExecutionProfileProjectionRepository;

beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL);
  pool = buildPool(config.DATABASE_URL);
  mirror = new ExecutionDurableMirrorRepository(config, pool);
  repository = new ExecutionProfileProjectionRepository(pool, mirror);
});

beforeEach(async () => truncateAll(pool));
afterAll(async () => pool.end());

describe("EDS-06 durable current/range mirror", () => {
  it("is dark by default and rejects a read cutover without a write mirror", () => {
    expect(testConfig().FEATURE_EXECUTION_DURABLE_MIRROR).toBe("false");
    expect(testConfig().FEATURE_EXECUTION_DURABLE_MIRROR_READS).toBe("false");
    expect(() => testConfig({ FEATURE_EXECUTION_DURABLE_MIRROR_READS: "true" }))
      .toThrow(/FEATURE_EXECUTION_DURABLE_MIRROR=true/);
  });

  it("commits current/range rows, opaque server-only continuation and one exact revision atomically", async () => {
    const document = projectionDocument();
    const receipt = await commit(document, "source-cursor-secret-1");
    expect(receipt).toMatchObject({ changed: true, projectionSequence: 1 });

    const state = await pool.query<{
      batch_state: string;
      revision_state: string;
      is_current: boolean;
      continuation_authority: string;
      continuation_digest: string;
    }>(
      `SELECT b.state AS batch_state,r.state AS revision_state,r.is_current,
              c.continuation_authority,c.continuation_digest
         FROM execution_durable_mirror_batches b
         JOIN execution_durable_mirror_revisions r ON r.batch_id=b.batch_id
         JOIN execution_durable_mirror_continuations c ON c.last_batch_id=b.batch_id
        WHERE b.workspace_id=$1 AND c.relation_key=$2`,
      [workspaceId, rangeKey],
    );
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      batch_state: "COMMITTED",
      revision_state: "COMMITTED",
      is_current: true,
      continuation_authority: "SERVER_ONLY_LEGACY_COORDINATOR",
    });
    expect(state.rows[0]!.continuation_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(state.rows[0]!.continuation_digest).not.toContain("source-cursor-secret-1");

    const current = await mirror.currentPage({
      workspaceId,
      environment: "paper",
      profileId,
      relationKey: currentKey,
      limit: 1,
    });
    expect(current).toMatchObject({ state: "AVAILABLE", rows: [{ fields: { strategy_id: "alpha_1" } }] });
    expect(current.revision?.projection_sequence).toBe(1);

    const range = await mirror.rangePage({
      workspaceId,
      environment: "paper",
      profileId,
      relationKey: rangeKey,
      resource: { kind: "strategy", id: "alpha_1" },
      limit: 1,
    });
    expect(range).toMatchObject({
      state: "AVAILABLE",
      rows: [{ row_id: "perf_1", fields: { equity: "100.25" } }],
    });
    expect(await mirror.compareCurrentDocument({ document })).toEqual({ state: "MATCH", relation_keys: [] });

    const rawCursorColumns = await pool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name LIKE 'execution_durable_mirror_%'
          AND column_name='source_cursor'`,
    );
    expect(rawCursorColumns.rows).toEqual([]);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL enable_seqscan=off");
      const plan = await client.query<{ "QUERY PLAN": string }>(
        `EXPLAIN (COSTS OFF)
         SELECT row_id FROM execution_durable_mirror_range_rows
          WHERE workspace_id=$1 AND environment='paper' AND profile_id=$2 AND relation_key=$3
            AND strategy_id=$4 AND ts >= $5::timestamptz
          ORDER BY ts ASC, row_id ASC LIMIT 200`,
        [workspaceId, profileId, rangeKey, "alpha_1", "2026-09-01T00:00:00.000Z"],
      );
      expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n"))
        .toContain("execution_durable_mirror_range_rows_strategy_time_idx");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("deduplicates a repeated accepted page and quarantines a same-key/different-digest range conflict", async () => {
    const document = projectionDocument();
    await commit(document, "source-cursor-secret-1");
    const repeated = await commit(document, "source-cursor-secret-2");
    expect(repeated.changed).toBe(false);
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_durable_mirror_range_rows")).rows[0]?.n).toBe(1);

    const conflictingRows = [{
      lineage: document.relations[rangeKey]!.items[0]!.lineage,
      fields: { ...document.relations[rangeKey]!.items[0]!.fields, equity: "100.26" },
    }];
    await repository.commit(document, commitInput("source-cursor-secret-3", {
      [rangeKey]: conflictingRows,
    }));

    const range = await pool.query<{ fields: { equity: string } }>(
      `SELECT fields FROM execution_durable_mirror_range_rows
        WHERE workspace_id=$1 AND environment='paper' AND profile_id=$2 AND relation_key=$3 AND row_id='perf_1'`,
      [workspaceId, profileId, rangeKey],
    );
    expect(range.rows[0]?.fields.equity).toBe("100.25");
    const quarantined = await pool.query<{ batches: number; revisions: number; conflicts: number }>(
      `SELECT
         (SELECT count(*)::int FROM execution_durable_mirror_batches WHERE state='QUARANTINED') AS batches,
         (SELECT count(*)::int FROM execution_durable_mirror_revisions WHERE state='QUARANTINED') AS revisions,
         (SELECT count(*)::int FROM execution_durable_mirror_conflicts) AS conflicts`,
    );
    expect(quarantined.rows[0]).toEqual({ batches: 1, revisions: 1, conflicts: 1 });
    expect(await mirror.compareCurrentDocument({ document })).toEqual({ state: "MATCH", relation_keys: [] });
  });

  it("pins a partial current page to its one committed revision without mixing earlier entities", async () => {
    await commit(projectionDocument({ strategyIds: ["alpha_1", "alpha_2"] }), "source-cursor-secret-1");
    const partial = projectionDocument({ strategyIds: ["alpha_2"] });
    partial.relations[currentKey]!.completeness = "PARTIAL";
    await commit(partial, "source-cursor-secret-2");

    const page = await mirror.currentPage({
      workspaceId, environment: "paper", profileId, relationKey: currentKey, limit: 200,
    });
    expect(page.state).toBe("PARTIAL");
    expect(page.reason_code).toBe("EDS06_CURRENT_RELATION_PARTIAL");
    expect(page.revision?.projection_sequence).toBe(2);
    expect(page.rows.map((row) => row.fields.strategy_id)).toEqual(["alpha_2"]);
  });

  it("uses relation-bound signed keysets, keeps profiles isolated, and rolls back snapshot/cursor on a mirror fault", async () => {
    const document = projectionDocument({ strategyIds: ["alpha_1", "alpha_2"] });
    await commit(document, "source-cursor-secret-1");
    const first = await mirror.currentPage({
      workspaceId,
      environment: "paper",
      profileId,
      relationKey: currentKey,
      limit: 1,
    });
    expect(first.next_cursor).toBeTruthy();
    const second = await mirror.currentPage({
      workspaceId,
      environment: "paper",
      profileId,
      relationKey: currentKey,
      limit: 1,
      after: first.next_cursor,
    });
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0]?.fields.strategy_id).toBe("alpha_2");
    const isolated = projectionDocument({ workspace: "ws_other", strategyIds: ["other_alpha"] });
    await repository.commit(isolated, commitInput("other-cursor"));
    expect((await mirror.currentPage({
      workspaceId: "ws_other", environment: "paper", profileId, relationKey: currentKey,
    })).rows[0]?.fields.strategy_id).toBe("other_alpha");
    await expect(mirror.currentPage({
      workspaceId: "ws_other",
      environment: "paper",
      profileId,
      relationKey: currentKey,
      limit: 1,
      after: first.next_cursor,
    })).rejects.toThrow(/Query cursor does not match/);

    const failing: DurableMirrorWriter = {
      commitAcceptedProjection: async () => { throw new Error("EDS06_TEST_MIRROR_FAULT"); },
    };
    const faultRepository = new ExecutionProfileProjectionRepository(pool, failing);
    const faultDocument = projectionDocument({ workspace: "ws_fault", strategyIds: ["fault_alpha"] });
    await expect(faultRepository.commit(faultDocument, commitInput("fault-cursor", {}, [{
      relationKey: rangeKey,
      sourceCursor: "raw-server-only-cursor",
    }]))).rejects.toThrow("EDS06_TEST_MIRROR_FAULT");
    expect(await faultRepository.snapshot("ws_fault", "paper", profileId)).toBeNull();
    expect((await pool.query(
      `SELECT count(*)::int AS n FROM execution_profile_relation_cursors WHERE workspace_id='ws_fault'`,
    )).rows[0]?.n).toBe(0);
  });
});

async function commit(document: ProfileProjectionDocument, sourceCursor: string) {
  return repository.commit(document, commitInput(sourceCursor));
}

function commitInput(
  sourceCursor: string,
  retainedRangeRows: ProjectionCommitInput["retainedRangeRows"] = {},
  relationCursors: ProjectionCommitInput["relationCursors"] = [{ relationKey: rangeKey, sourceCursor: "raw-server-only-cursor" }],
): ProjectionCommitInput {
  return {
    sourceEpoch: "manager-v2:PAPER_BINANCE_USDM:runtime.v1",
    sourceCursor,
    sourceAsOf: new Date("2026-09-05T08:00:00.000Z"),
    receivedAt: new Date("2026-09-05T08:00:01.000Z"),
    completeness: "COMPLETE",
    retentionSeconds: 3600,
    maximumJournalEntries: 100,
    relationCursors,
    retainedRangeRows,
  };
}

function projectionDocument(input: {
  workspace?: string;
  strategyIds?: readonly string[];
} = {}): ProfileProjectionDocument {
  const workspace = input.workspace ?? workspaceId;
  const strategies = (input.strategyIds ?? ["alpha_1"]).map((strategyId) => ({
    lineage: {
      workspace_id: workspace,
      profile_id: profileId,
      source_contract_revision: "trading-system.portal-execution.manager-v2.runtime.v1",
    },
    fields: { strategy_id: strategyId, alpha_id: strategyId, name: strategyId, mode: "paper", active: true },
  }));
  const performance = {
    lineage: {
      workspace_id: workspace,
      profile_id: profileId,
      source_contract_revision: "trading-system.portal-execution.manager-v2.runtime.v1",
    },
    fields: {
      id: "perf_1",
      ts: "2026-09-05T08:00:00.000Z",
      strategy_id: "alpha_1",
      deployment_id: "dep_1",
      account_id: "acc_1",
      currency: "USDT",
      equity: "100.25",
    },
  };
  return {
    schema_version: "portal.execution.profile-projection.v1",
    workspace_id: workspace,
    environment: "paper",
    profile_id: profileId,
    source_contract_revision: "trading-system.portal-execution.manager-v2.runtime.v1",
    relations: {
      [currentKey]: {
        source_id: "manager.strategies",
        relation: "strategies",
        availability: "AVAILABLE",
        reason_code: null,
        as_of: "2026-09-05T08:00:00.000Z",
        freshness: "FRESH",
        completeness: "COMPLETE",
        items: strategies,
      },
      [rangeKey]: {
        source_id: "manager.performance",
        relation: "performance_snapshots",
        availability: "AVAILABLE",
        reason_code: null,
        as_of: "2026-09-05T08:00:00.000Z",
        freshness: "FRESH",
        completeness: "COMPLETE",
        items: [performance],
      },
    },
  };
}
