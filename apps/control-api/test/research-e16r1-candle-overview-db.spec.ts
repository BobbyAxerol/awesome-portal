/**
 * E16-R1 · migration 068 and the retained OHLC overview on real PostgreSQL.
 *
 * The overview is the only Research fact that cannot be recovered after the
 * fact: the P10 producer deletes the derived tape before the artifact bundle
 * is written, so whatever the confined child summarised is all there will
 * ever be. This proof therefore uses the real receipt, the real ingest, real
 * jsonb storage and the real replay read — an in-memory double would not show
 * a decimal that PostgreSQL round-tripped differently, and it would not show
 * the row bound the migration installs.
 *
 * Runs only against a disposable database (TEST_DATABASE_URL), like the other
 * Research migration proofs.
 */

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ResearchEvidenceRepository } from "../src/research/evidence.repository";
import { ResearchEvidenceService } from "../src/research/evidence.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import type { ResearchProgressIngress } from "../src/research/progress.contract";
import { ResearchReplayService } from "../src/research/replay.service";
import { migrateTestDatabase } from "./harness";
import { p13RealReceiptFixture } from "./research-evidence.fixture";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_e16r1_${randomUUID().replaceAll("-", "")}`;

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const databaseUrl = databaseUrlFor(databaseName);
const W = "ws_e16r1";
const U = "usr_e16r1";
const RETAINED_RUN = "rrun_e16r1_retained";
const LEGACY_RUN = "rrun_e16r1_legacy";
const DIGEST = "a".repeat(64);
const scope = { workspaceId: W, actorUserId: U };

const replayConfig = {
  FEATURE_RESEARCH_REPLAY: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"research-e16r1-test-signing-key-at-least-thirty-two-bytes"}',
  QUERY_CURSOR_TTL_SECONDS: 900,
} as never;

/** One run with every parent the evidence write path dereferences. */
async function seedRun(database: Pool, runId: string): Promise<void> {
  const client = await database.connect();
  try {
    await client.query("SET session_replication_role = replica");
    await client.query(`INSERT INTO research.runs
      (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key, request_spec_digest,
       effective_spec_digest, engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
      VALUES ($1, $2, 'att_' || $2, 'PRIMARY', 'PRIMARY', $2, $3, $3, 'er_quantbt_111', $3, 'READY', $4)`,
    [W, runId, DIGEST, U]);
    await client.query(`INSERT INTO research.jobs
      (workspace_id, job_id, run_id, command_id, logical_work_key, job_kind, queue_class, cost_estimate,
       resource_class, state, requested_by_user_id)
      VALUES ($1, 'job_' || $2, $2, 'cmd_' || $2, 'work_' || $2, 'PRIMARY', 'HEAVY', '{}'::jsonb,
              'standard', 'SUCCEEDED', $3)`,
    [W, runId, U]);
    await client.query(`INSERT INTO research.worker_attempts
      (workspace_id, worker_attempt_id, job_id, ordinal, worker_id, lease_epoch, expires_at, state)
      VALUES ($1, 'rwa_' || $2, 'job_' || $2, 1, 'worker-e16r1', 1, now() + interval '1 hour', 'SUCCEEDED')`,
    [W, runId]);
    await client.query(`INSERT INTO research.run_producers
      (workspace_id, run_id, attempt_id, job_id, actor_user_id, client_intent_id, intent_kind, preflight_token,
       alpha_id, alpha_version_id, execution_adapter_id, adapter_contract_digest, requested_spec_digest,
       effective_spec_digest, dataset_binding_digest, manifest_digest, snapshot_id, snapshot_content_hash,
       work_digest, legacy_request, dispatch_state, worker_attempt_id, lease_epoch, portal_receipt)
      VALUES ($1, $2, 'att_' || $2, 'job_' || $2, $3, 'intent-' || $2, 'NEW', 'rpft_' || $2,
              'delta-rsi-polynomial-alpha', 'av_e16r1', 'p04.delta-rsi.v1', $4, $4, $4, $4, $4,
              'dss_0123456789abcdef0123456789abcdef', $4, $4, '{}'::jsonb, 'DISPATCHED', 'rwa_' || $2, 1, '{}'::jsonb)`,
    [W, runId, U, DIGEST]);
  } finally {
    await client.query("SET session_replication_role = origin");
    client.release();
  }
}

async function ingest(database: Pool, runId: string, receipt: Record<string, unknown>): Promise<void> {
  const evidence = new ResearchEvidenceService(
    new ResearchEvidenceRepository(database),
    { FEATURE_RESEARCH_EVIDENCE: "true" } as never,
  );
  await evidence.ingest(
    { ...scope, jobId: `job_${runId}`, workerAttemptId: `rwa_${runId}`, leaseEpoch: 1 },
    {
      run_id: runId,
      event: { event_type: "run_completed", sequence: 9, payload: { evidence_digest: sha256ResearchJson(receipt) } },
      evidence: receipt,
    } as unknown as ResearchProgressIngress,
  );
}

function replayService(database: Pool): ResearchReplayService {
  const evidence = new ResearchEvidenceService(
    new ResearchEvidenceRepository(database),
    { FEATURE_RESEARCH_EVIDENCE: "true" } as never,
  );
  return new ResearchReplayService(evidence, replayConfig);
}

describe("E16-R1 migration 068 · the retained OHLC overview on PostgreSQL", () => {
  let database: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl);
    database = new Pool({ connectionString: databaseUrl });
    await database.query(`INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
      VALUES ($1, 'e16r1-owner', 'E16R1 owner', 'ADMIN', 'ACTIVE', false)`, [U]);
    await database.query("INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'E16R1', $2)", [W, U]);
    await database.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')
      ON CONFLICT DO NOTHING`, [W, U]);
    await seedRun(database, RETAINED_RUN);
    await seedRun(database, LEGACY_RUN);
  }, 120_000);

  afterAll(async () => {
    await database?.end();
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("installs a row bound on the retained overview and keeps the store's 'not a raw OHLCV store' description true", async () => {
    const result = await database.query<{ bound: string | null; constraint_comment: string | null; table_comment: string | null }>(`
      SELECT (SELECT pg_get_constraintdef(oid) FROM pg_constraint
                WHERE conname = 'run_evidence_projections_v1_candle_overview_bound_check') AS bound,
             (SELECT obj_description(oid, 'pg_constraint') FROM pg_constraint
                WHERE conname = 'run_evidence_projections_v1_candle_overview_bound_check') AS constraint_comment,
             obj_description('research.run_evidence_projections_v1'::regclass, 'pg_class') AS table_comment`);
    const row = result.rows[0]!;
    expect(row.bound).toContain("jsonb_array_length");
    expect(row.bound).toContain("48");
    expect(row.constraint_comment).toContain("never a raw OHLCV");
    expect(row.table_comment).toContain("bounded OHLC overview");
    // The evidence store stays append-only for the runtime role.
    const grants = await database.query<Record<string, boolean>>(`SELECT
      has_table_privilege('portal_research_runtime', 'research.run_evidence_projections_v1', 'INSERT') AS can_insert,
      has_table_privilege('portal_research_runtime', 'research.run_evidence_projections_v1', 'UPDATE') AS can_update`);
    expect(grants.rows[0]).toEqual({ can_insert: true, can_update: false });
  });

  it("refuses a projection whose overview grows past its declared bound", async () => {
    const bucket = {
      first_ordinal: 0, last_ordinal: 0, open_utc_ms: 1_775_001_600_000, close_utc_ms: 1_775_001_600_000,
      open: "1", high: "2", low: "0.5", close: "1.5", volume: null, transitions: null,
    };
    const projection = (count: number) => JSON.stringify({
      schema_version: "research.evidence-projection.v1",
      candle_overview: { state: "AVAILABLE", values: Array.from({ length: count }, () => bucket) },
    });
    const insert = async (count: number, revisionSeed: string) => {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL session_replication_role = replica");
        await client.query(`INSERT INTO research.run_evidence_projections_v1
          (workspace_id, run_id, worker_attempt_id, projection_revision, source_event_sequence, source_evidence_digest,
           projection_version, projection_digest, readiness, projection)
          VALUES ($1, 'rrun_bound', 'rwa_bound', $2, 1, $3, 'research.evidence-projection.v1', $3, 'PARTIAL', $4::jsonb)`,
        [W, `p13r1_${revisionSeed.repeat(64).slice(0, 64)}`, DIGEST, projection(count)]);
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };
    await expect(insert(48, "b")).resolves.toBeUndefined();
    await expect(insert(49, "c")).rejects.toThrow(/candle_overview_bound_check/);
  });

  it("keeps every retained bucket byte-identical through jsonb and serves it on the P04 replay read", async () => {
    const receipt = p13RealReceiptFixture("four_month_oos");
    const source = receipt.candle_overview as Record<string, any>;
    expect(source.state).toBe("AVAILABLE");
    await ingest(database, RETAINED_RUN, receipt);

    const replay = await replayService(database).detail(scope, RETAINED_RUN, { limit: 50 });
    const overview = replay.candle_overview;
    expect(overview.state).toBe("AVAILABLE");
    expect(overview.scope).toBe("OOS_EQUITY_WINDOW");
    // Exact decimal strings, not numbers PostgreSQL re-rendered.
    expect(overview.values).toEqual(source.values);
    expect(overview.envelope).toEqual(source.envelope);
    expect(overview.bucket_bars).toBe(source.bucket_bars);
    expect(overview.emitted_bucket_count).toBe(source.emitted_bucket_count);
    // The overview covers exactly the OOS window the equity samples came from.
    expect(overview.source_bar_count).toBe(replay.equity_replay.source_observation_count);

    // The downsample keeps the run's true extremes.
    const highs = overview.values.map((bucket) => Number(bucket.high));
    const lows = overview.values.map((bucket) => Number(bucket.low));
    expect(Number(overview.envelope!.max_high)).toBe(Math.max(...highs));
    expect(Number(overview.envelope!.min_low)).toBe(Math.min(...lows));

    // A summary is not a bar ledger: the per-bar absence is untouched.
    expect(replay.route_capabilities.candle_windows.state).toBe("NOT_PUBLISHED");
    expect(replay.source_absences.candles.state).toBe("NOT_PUBLISHED");

    // What the row actually costs, asserted rather than estimated.
    const stored = await database.query<{ projection_bytes: string; overview_bytes: string }>(
      `SELECT octet_length(projection::text)::text AS projection_bytes,
              octet_length((projection -> 'candle_overview')::text)::text AS overview_bytes
         FROM research.run_evidence_projections_v1 WHERE workspace_id = $1 AND run_id = $2`,
      [W, RETAINED_RUN],
    );
    const projectionBytes = Number(stored.rows[0]!.projection_bytes);
    const overviewBytes = Number(stored.rows[0]!.overview_bytes);
    expect(overviewBytes).toBeGreaterThan(8_000);
    expect(overviewBytes).toBeLessThan(12_000);
    // The whole projection still fits well inside its 32 KiB row CHECK.
    expect(projectionBytes).toBeLessThan(32_768);
  }, 60_000);

  it("a run sealed before the producer retained an overview reads as its own typed absence, never a backfill", async () => {
    const receipt = p13RealReceiptFixture("one_month_oos");
    delete receipt.candle_overview;
    await ingest(database, LEGACY_RUN, receipt);

    const replay = await replayService(database).detail(scope, LEGACY_RUN, { limit: 50 });
    expect(replay.candle_overview).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW",
      scope: null,
      source_bar_count: null,
      emitted_bucket_count: null,
      bucket_bars: null,
      sampling: null,
      envelope: null,
      values: [],
    });
    // Everything else about the run still reads.
    expect(replay.equity_replay.state).toBe("AVAILABLE");
    expect(replay.equity_replay.items.length).toBeGreaterThan(0);
    // And nothing was written into the row for it.
    const stored = await database.query<{ present: boolean }>(
      `SELECT (projection ? 'candle_overview') AS present
         FROM research.run_evidence_projections_v1 WHERE workspace_id = $1 AND run_id = $2`,
      [W, LEGACY_RUN],
    );
    expect(stored.rows[0]).toEqual({ present: false });
  }, 60_000);
});
