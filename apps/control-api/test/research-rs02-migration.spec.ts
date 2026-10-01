import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { runner as migrate } from "node-pg-migrate";
import { Pool, type PoolClient } from "pg";

import {
  CURRENT_SOURCE_RUN_STATE_SQL,
  ResearchCurrentSourceRepository,
  currentSourceBatchDigest,
  currentSourceImportDigest,
  type CurrentSourceRowInput,
} from "../src/research/current-source.repository";
import { ResearchCurrentSourceIngestService } from "../src/research/current-source-ingest.service";
import { RESEARCH_DB_RUNTIME_ROLE } from "../src/research/contracts";
import { DELTA_WFO_PROFILE_DIGEST } from "../src/research/delta-wfo.profile";
import { ResearchP04DeltaBindingService } from "../src/research/p04-delta-binding.service";
import { ResearchMetadataRepository } from "../src/research/repository";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import { migrateTestDatabase } from "./harness";
import { flagConfig, manifestFor, w1Admin, wfoRequested } from "./research-w1-wfo.fixture";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_rs02_${randomUUID().replaceAll("-", "")}`;

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const databaseUrl = databaseUrlFor(databaseName);

describe("RS-02 disposable PostgreSQL retained-current-source proof", () => {
  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("installs append-only current-source custody, immutable seal guards and restricted runtime grants", async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl);
    const database = new Pool({ connectionString: databaseUrl });
    try {
      const result = await database.query<{
        batches: boolean; rows: boolean; seals: boolean; retained_import_digest: boolean; append_guard: boolean; immutable_guard: boolean;
        runtime_select: boolean; runtime_insert: boolean; runtime_update: boolean;
      }>(`
        SELECT
          to_regclass('research.current_source_import_batches_v1') IS NOT NULL AS batches,
          to_regclass('research.current_source_rows_v1') IS NOT NULL AS rows,
          to_regclass('research.current_source_seals_v1') IS NOT NULL AS seals,
          EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'research' AND table_name = 'current_source_seals_v1'
               AND column_name = 'retained_import_digest' AND is_nullable = 'NO'
          ) AS retained_import_digest,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'current_source_rows_v1_seal_guard' AND NOT tgisinternal) AS append_guard,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'current_source_seals_v1_immutable_guard' AND NOT tgisinternal) AS immutable_guard,
          has_table_privilege('portal_research_runtime', 'research.current_source_rows_v1', 'SELECT') AS runtime_select,
          has_table_privilege('portal_research_runtime', 'research.current_source_rows_v1', 'INSERT') AS runtime_insert,
          has_table_privilege('portal_research_runtime', 'research.current_source_rows_v1', 'UPDATE') AS runtime_update
      `);
      expect(result.rows[0]).toEqual({
        batches: true, rows: true, seals: true, retained_import_digest: true, append_guard: true, immutable_guard: true,
        runtime_select: true, runtime_insert: true, runtime_update: false,
      });
    } finally {
      await database.end();
    }
  });

  it("rejects a mutation of retained rows and every append after a seal", async () => {
    const database = new Pool({ connectionString: databaseUrl });
    const digest = "a".repeat(64);
    try {
      await database.query(`INSERT INTO portal_users
        (user_id, username, display_name, role, status, must_change_password)
        VALUES ('usr_rs02', 'rs02-owner', 'RS-02 owner', 'ADMIN', 'ACTIVE', false)`);
      await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id)
        VALUES ('ws_rs02', 'RS-02 disposable workspace', 'usr_rs02')`);
      await database.query(`INSERT INTO research.current_source_import_batches_v1
        (workspace_id, run_id, artifact_revision, manifest_digest, source_transform_digest,
         table_kind, batch_ordinal, batch_digest, row_count)
        VALUES ('ws_rs02', 'run_rs02', 1, $1, $1, 'OBSERVATION', 0, $1, 1)`, [digest]);
      await database.query(`INSERT INTO research.current_source_rows_v1
        (workspace_id, run_id, artifact_revision, table_kind, source_ordinal, source_id, occurred_at_utc_ms, payload)
        VALUES ('ws_rs02', 'run_rs02', 1, 'OBSERVATION', 0, 'observation-0', 1704067200000, '{"equity":"100"}'::jsonb)`);

      await expect(database.query(`UPDATE research.current_source_rows_v1
        SET source_id = 'mutated-observation'
        WHERE workspace_id = 'ws_rs02' AND run_id = 'run_rs02' AND artifact_revision = 1`))
        .rejects.toMatchObject({ code: "55000" });

      await database.query(`INSERT INTO research.current_source_seals_v1
        (workspace_id, run_id, artifact_revision, source_adapter_id, profile_id, manifest_digest,
         source_transform_digest, requested_spec_digest, effective_spec_digest, dataset_binding_digest,
         retained_import_digest, table_rows, total_rows, summary)
        VALUES ('ws_rs02', 'run_rs02', 1, 'rs02.quantbt-advanced-wfo.v1', 'rs02.delta-wfo-global.v1',
                $1, $1, $1, $1, $1, $1, '{"OBSERVATION":1,"FOLD":2,"TRIAL":2,"CANDIDATE":1,"SELECTION":1}'::jsonb, 7, '{}'::jsonb)`, [digest]);
      const sidecarPrivilege = await database.query<{ can_read: boolean; can_write: boolean }>(
        `SELECT has_table_privilege('portal_research_runtime', 'research.current_source_analytics_sidecars_v2', 'SELECT') AS can_read,
                has_table_privilege('portal_research_runtime', 'research.current_source_analytics_sidecars_v2', 'INSERT') AS can_write`,
      );
      expect(sidecarPrivilege.rows[0]).toEqual({ can_read: true, can_write: false });
      await database.query(`INSERT INTO research.current_source_analytics_sidecars_v2
        (workspace_id, run_id, artifact_revision, retained_import_digest, source_rows_digest, analytics_digest, analytics)
        VALUES ('ws_rs02', 'run_rs02', 1, $1, $1, $1, '{}'::jsonb)`, [digest]);
      await expect(database.query(`UPDATE research.current_source_analytics_sidecars_v2
        SET analytics = '{"changed":true}'::jsonb
        WHERE workspace_id = 'ws_rs02' AND run_id = 'run_rs02'`))
        .rejects.toMatchObject({ code: "55000" });
      await expect(database.query(`INSERT INTO research.current_source_import_batches_v1
        (workspace_id, run_id, artifact_revision, manifest_digest, source_transform_digest,
         table_kind, batch_ordinal, batch_digest, row_count)
        VALUES ('ws_rs02', 'run_rs02', 1, $1, $1, 'FOLD', 0, $1, 1)`, [digest]))
        .rejects.toMatchObject({ code: "23505" });
    } finally {
      await database.end();
    }
  });

  it("runs the no-seal run-state join as the runtime role (library view + P10 binding)", async () => {
    const database = new Pool({ connectionString: databaseUrl });
    const client = await database.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query("SELECT set_config('research.workspace_id', $1, true)", [randomUUID()]);
      const result = await client.query(CURRENT_SOURCE_RUN_STATE_SQL, [randomUUID(), "rrun_absent"]);
      expect(result.rowCount).toBe(0);
      expect(result.fields.map((field) => field.name)).toEqual([
        "source_kind", "effective_status", "adapter_contract_digest", "execution_profile_id",
      ]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await database.end();
    }
  });
});

const w1DatabaseName = `portal_w1_${randomUUID().replaceAll("-", "")}`;
const w1DatabaseUrl = databaseUrlFor(w1DatabaseName);
const W1_MIGRATION = "1723680000062_research-delta-wfo-profile-v1.sql";
const digestA = "a".repeat(64);
const w1Summary = {
  schema_version: "research.current-source-summary.v1",
  metrics: { initial_equity: "100", final_equity: "101", net_return_fraction: "0.01", max_drawdown_fraction: "0" },
  selection: { trial_id: "0", objective: "0.4", parameters: { window: "32" } },
  data_use: {
    warmup: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_WARMUP" },
    purge: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_PURGE" },
    embargo: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_EMBARGO" },
    strict_outer_oos_selection: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_STRICT_OOS" },
  },
  derived: {
    monthly_returns: {
      source_observation_count: 2, emitted_point_count: 0, total_period_count: 1,
      omitted_leading_period_count: 1, omitted_transport_period_count: 0, sampling: "FULL", values: [],
    },
    rolling_returns_20: { source_observation_count: 2, emitted_point_count: 0, window_observations: 20, sampling: "NOT_APPLICABLE", values: [] },
    return_distribution: {
      state: "NOT_APPLICABLE", reason_code: "QUANTBT_ADVANCED_WFO_RETURN_DISTRIBUTION_ZERO_VARIANCE",
      source_observation_count: 2, emitted_point_count: 0, sampling: "NOT_APPLICABLE", values: [],
    },
  },
};

/**
 * Insert one producer row without its FK parents. `replica` disables FK and
 * user triggers for this statement only; the CHECK constraints under test
 * still apply. The identity trigger is re-enabled before any UPDATE.
 */
async function insertProducer(client: PoolClient, runId: string, profile: { id?: string; digest?: string | null } = {}) {
  await client.query("SET session_replication_role = replica");
  try {
    const columns = profile.id === undefined ? "" : ", execution_profile_id, execution_profile_digest";
    const values = profile.id === undefined ? "" : ", $3, $4";
    await client.query(
      `INSERT INTO research.run_producers
         (workspace_id, run_id, attempt_id, job_id, actor_user_id, client_intent_id, intent_kind, preflight_token,
          alpha_id, alpha_version_id, execution_adapter_id, adapter_contract_digest, requested_spec_digest,
          effective_spec_digest, dataset_binding_digest, manifest_digest, snapshot_id, snapshot_content_hash,
          work_digest, legacy_request, dispatch_state, worker_attempt_id, lease_epoch, portal_receipt${columns})
       VALUES ('ws_w1', $1, 'att_' || $1, 'job_' || $1, 'usr_w1', 'intent-' || $1, 'NEW', 'rpft_' || $1,
               'delta-rsi-polynomial-alpha', 'av_delta_rsi_polynomial_alpha_1_0_0', 'p04.delta-rsi.v1', $2,
               '${"1".repeat(64)}', '${"2".repeat(64)}', '${"3".repeat(64)}', $2, 'dss_0123456789abcdef0123456789abcdef', $2,
               $2, '{}'::jsonb, 'DISPATCHED', 'rwa_' || $1, 3, '{}'::jsonb${values})`,
      profile.id === undefined ? [runId, digestA] : [runId, digestA, profile.id, profile.digest ?? null],
    );
  } finally {
    await client.query("SET session_replication_role = origin");
  }
}

describe("W1 migration 062 on 061 · run execution profile + paired RS-02 lane", () => {
  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${w1DatabaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("applies forward on a populated 061 database, backfills P04 and replaces the single-value seal checks", async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${w1DatabaseName}`); } finally { await admin.end(); }
    const migrationsDir = join(__dirname, "..", "migrations");
    const before = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
      .filter((name) => name < W1_MIGRATION).length;
    await migrate({
      databaseUrl: w1DatabaseUrl, dir: migrationsDir, direction: "up", migrationsTable: "pgmigrations",
      count: before, noLock: true, log: () => {},
    });
    const database = new Pool({ connectionString: w1DatabaseUrl });
    const client = await database.connect();
    try {
      const columns061 = await client.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'research' AND table_name = 'run_producers' AND column_name LIKE 'execution_profile%'`);
      expect(columns061.rowCount).toBe(0);
      await client.query(`INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
        VALUES ('usr_w1', 'w1-owner', 'W1 owner', 'ADMIN', 'ACTIVE', false)`);
      await client.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ('ws_w1', 'W1 workspace', 'usr_w1')`);
      await client.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('ws_w1', 'usr_w1', 'OWNER')`);
      await insertProducer(client, "rrun_w1_p04_legacy");
      await client.query(`INSERT INTO research.current_source_seals_v1
        (workspace_id, run_id, artifact_revision, source_adapter_id, profile_id, manifest_digest, source_transform_digest,
         requested_spec_digest, effective_spec_digest, dataset_binding_digest, retained_import_digest, table_rows, total_rows, summary)
        VALUES ('ws_w1', 'rrun_w1_legacy_seal', 1, 'rs02.quantbt-advanced-wfo.v1', 'rs02.delta-wfo-global.v1',
                $1, $1, $1, $1, $1, $1, '{"OBSERVATION":1,"FOLD":1,"TRIAL":2,"CANDIDATE":1,"SELECTION":1}'::jsonb, 6, '{}'::jsonb)`, [digestA]);
    } finally {
      client.release();
      await database.end();
    }

    await migrateTestDatabase(w1DatabaseUrl);
    const after = new Pool({ connectionString: w1DatabaseUrl });
    try {
      const producer = await after.query(`SELECT execution_profile_id, execution_profile_digest
        FROM research.run_producers WHERE run_id = 'rrun_w1_p04_legacy'`);
      expect(producer.rows).toEqual([{ execution_profile_id: "p04.fixed-qualification.v1", execution_profile_digest: null }]);
      const constraints = await after.query<{ conname: string }>(`SELECT conname FROM pg_constraint
        WHERE conrelid IN ('research.current_source_seals_v1'::regclass, 'research.run_producers'::regclass)
          AND conname IN ('current_source_seals_v1_source_adapter_id_check', 'current_source_seals_v1_profile_id_check',
                          'current_source_seals_v1_source_profile_pair_check', 'run_producers_execution_profile_id_check',
                          'run_producers_execution_profile_digest_check')
        ORDER BY conname`);
      expect(constraints.rows.map((row) => row.conname)).toEqual([
        "current_source_seals_v1_source_profile_pair_check",
        "run_producers_execution_profile_digest_check",
        "run_producers_execution_profile_id_check",
      ]);
      const legacySeal = await after.query(`SELECT profile_id FROM research.current_source_seals_v1 WHERE run_id = 'rrun_w1_legacy_seal'`);
      expect(legacySeal.rows).toEqual([{ profile_id: "rs02.delta-wfo-global.v1" }]);
    } finally {
      await after.end();
    }
  });

  it("rejects a mixed seal pair and admits the signal-notional pair", async () => {
    const database = new Pool({ connectionString: w1DatabaseUrl });
    const insertSeal = (runId: string, adapter: string, profile: string) => database.query(`INSERT INTO research.current_source_seals_v1
      (workspace_id, run_id, artifact_revision, source_adapter_id, profile_id, manifest_digest, source_transform_digest,
       requested_spec_digest, effective_spec_digest, dataset_binding_digest, retained_import_digest, table_rows, total_rows, summary)
      VALUES ('ws_w1', $1, 1, $2, $3, $4, $4, $4, $4, $4, $4, '{"OBSERVATION":1,"FOLD":1,"TRIAL":2,"CANDIDATE":1,"SELECTION":1}'::jsonb, 6, '{}'::jsonb)`,
    [runId, adapter, profile, digestA]);
    try {
      await expect(insertSeal("rrun_w1_mixed_a", "rs02.quantbt-advanced-wfo.v1", "rs02.delta-signal-notional-wfo.v1"))
        .rejects.toMatchObject({ code: "23514" });
      await expect(insertSeal("rrun_w1_mixed_b", "rs02.quantbt-signal-notional-wfo.v1", "rs02.delta-wfo-global.v1"))
        .rejects.toMatchObject({ code: "23514" });
      await expect(insertSeal("rrun_w1_unknown", "rs02.other.v1", "rs02.other.v1")).rejects.toMatchObject({ code: "23514" });
      await expect(insertSeal("rrun_w1_sn", "rs02.quantbt-signal-notional-wfo.v1", "rs02.delta-signal-notional-wfo.v1"))
        .resolves.toMatchObject({ rowCount: 1 });
    } finally {
      await database.end();
    }
  });

  it("checks the profile/digest pair and freezes both columns in the producer identity", async () => {
    const database = new Pool({ connectionString: w1DatabaseUrl });
    const client = await database.connect();
    try {
      await expect(insertProducer(client, "rrun_w1_bad_a", { id: "p10.delta-signal-notional-wfo.v1", digest: null }))
        .rejects.toMatchObject({ code: "23514" });
      await expect(insertProducer(client, "rrun_w1_bad_b", { id: "p04.fixed-qualification.v1", digest: DELTA_WFO_PROFILE_DIGEST }))
        .rejects.toMatchObject({ code: "23514" });
      await expect(insertProducer(client, "rrun_w1_bad_c", { id: "p10.delta-signal-notional-wfo.v1", digest: "0".repeat(64) }))
        .rejects.toMatchObject({ code: "23514" });
      await expect(insertProducer(client, "rrun_w1_bad_d", { id: "p99.other.v1", digest: null }))
        .rejects.toMatchObject({ code: "23514" });
      await insertProducer(client, "rrun_w1_wfo", { id: "p10.delta-signal-notional-wfo.v1", digest: DELTA_WFO_PROFILE_DIGEST });
      await expect(client.query(`UPDATE research.run_producers SET execution_profile_id = 'p04.fixed-qualification.v1',
        execution_profile_digest = NULL WHERE run_id = 'rrun_w1_wfo'`)).rejects.toMatchObject({ code: "23514" });
      await expect(client.query(`UPDATE research.run_producers SET execution_profile_id = 'p10.delta-signal-notional-wfo.v1',
        execution_profile_digest = $1 WHERE run_id = 'rrun_w1_p04_legacy'`, [DELTA_WFO_PROFILE_DIGEST]))
        .rejects.toMatchObject({ message: expect.stringContaining("identity is immutable") });
      // Lifecycle columns stay updatable; the identity trigger allows them.
      await expect(client.query(`UPDATE research.run_producers SET updated_at = now() WHERE run_id = 'rrun_w1_wfo'`))
        .resolves.toMatchObject({ rowCount: 1 });
    } finally {
      client.release();
      await database.end();
    }
  });

  it("runs the private ingest end to end: P05 seal → batches → replay/conflict → seal → sealForRead", async () => {
    const database = new Pool({ connectionString: w1DatabaseUrl });
    const client = await database.connect();
    try {
      await client.query("SET session_replication_role = replica");
      for (const runId of ["rrun_w1_wfo", "rrun_w1_p04_legacy"]) {
        await client.query(`INSERT INTO research.artifacts
          (workspace_id, artifact_id, run_id, table_kind, schema_version, manifest_digest, state, retention_class,
           storage_locator, artifact_revision, worker_attempt_id, lease_epoch, manifest_schema_version, total_rows, total_bytes, sealed_at)
          VALUES ('ws_w1', 'rart_' || $1, $1, 'research_bundle', 'research.artifact-manifest.v1', $2, 'SEALED',
                  'RESEARCH_EVIDENCE', 'artifacts/rart_' || $1, 1, 'rwa_' || $1, 3, 'research.artifact-manifest.v1', 9, 900, now())`,
        [runId, digestA]);
      }
      await client.query("SET session_replication_role = origin");
    } finally {
      client.release();
    }
    const repository = new ResearchCurrentSourceRepository(database);
    const service = new ResearchCurrentSourceIngestService(repository);
    const lease = { workspaceId: "ws_w1", actorUserId: "usr_w1", jobId: "job_rrun_w1_wfo", workerAttemptId: "rwa_rrun_w1_wfo", leaseEpoch: 3 };
    const common = {
      workspace_id: "ws_w1", run_id: "rrun_w1_wfo", job_id: "job_rrun_w1_wfo", worker_attempt_id: "rwa_rrun_w1_wfo",
      lease_epoch: 3, artifact_id: "rart_rrun_w1_wfo", artifact_revision: 1, manifest_digest: digestA,
      source_transform_digest: "b".repeat(64),
    };
    const tables: Record<string, CurrentSourceRowInput[]> = {
      OBSERVATION: [0, 1].map((ordinal) => ({
        sourceOrdinal: ordinal, sourceId: `2026-07-0${ordinal + 1}T00:00:00Z`,
        occurredAtUtcMs: Date.parse(`2026-07-0${ordinal + 1}T00:00:00Z`),
        payload: {
          source_index_utc: `2026-07-0${ordinal + 1}T00:00:00Z`, at_utc_ms: Date.parse(`2026-07-0${ordinal + 1}T00:00:00Z`),
          equity: String(100 + ordinal), return_fraction: ordinal ? "0.01" : "0", accepted_position: "0.5",
          drawdown_fraction: "0", signal_target: null,
        },
      })),
      FOLD: [0, 1].map((ordinal) => ({
        sourceOrdinal: ordinal, sourceId: `fold_${ordinal}`, occurredAtUtcMs: null,
        payload: { fold_id: `fold_${ordinal}`, train_start_utc_ms: 1, train_end_utc_ms: 2, test_start_utc_ms: 3, test_end_utc_ms: 4 },
      })),
      TRIAL: [0, 1, 2].map((ordinal) => ({
        sourceOrdinal: ordinal, sourceId: String(ordinal), occurredAtUtcMs: null,
        payload: { trial_id: String(ordinal), state: "COMPLETE", objective: "0.4", parameters: { window: "32" } },
      })),
      CANDIDATE: [{ sourceOrdinal: 0, sourceId: "c0", occurredAtUtcMs: null, payload: { candidate_id: "c0", objective: "0.4", parameters: { window: "32" } } }],
      SELECTION: [{ sourceOrdinal: 0, sourceId: "global", occurredAtUtcMs: null, payload: { selection_role: "global", trial_id: "0", objective: "0.4", parameters: { window: "32" } } }],
    };
    try {
      // A P04-profile run never enters the lane, even with a sealed P05 artifact.
      await expect(service.appendBatch({ ...lease, jobId: "job_rrun_w1_p04_legacy", workerAttemptId: "rwa_rrun_w1_p04_legacy" }, {
        ...common, run_id: "rrun_w1_p04_legacy", job_id: "job_rrun_w1_p04_legacy", worker_attempt_id: "rwa_rrun_w1_p04_legacy",
        artifact_id: "rart_rrun_w1_p04_legacy", schema_version: "research.current-source-batch.v1", table_kind: "FOLD",
        batch_ordinal: 0, batch_digest: currentSourceBatchDigest(tables.FOLD!), rows: tables.FOLD!,
      } as never)).rejects.toMatchObject({ status: 409 });
      const receipts = [];
      for (const [kind, rows] of Object.entries(tables)) {
        const body = {
          ...common, schema_version: "research.current-source-batch.v1", table_kind: kind, batch_ordinal: 0,
          batch_digest: currentSourceBatchDigest(rows), rows,
        } as never;
        await expect(service.appendBatch(lease, body)).resolves.toMatchObject({ replayed: false });
        await expect(service.appendBatch(lease, body)).resolves.toMatchObject({ replayed: true });
        receipts.push({ table_kind: kind, batch_ordinal: 0, batch_digest: currentSourceBatchDigest(rows), row_count: rows.length });
      }
      const conflicting = [{ ...tables.TRIAL![0]!, payload: { ...tables.TRIAL![0]!.payload, objective: "0.9" } }, ...tables.TRIAL!.slice(1)];
      await expect(service.appendBatch(lease, {
        ...common, schema_version: "research.current-source-batch.v1", table_kind: "TRIAL", batch_ordinal: 0,
        batch_digest: currentSourceBatchDigest(conflicting), rows: conflicting,
      } as never)).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_CONFLICT", status: 409 });
      const expectedImport = currentSourceImportDigest(receipts as never);
      const seal = {
        ...common, schema_version: "research.current-source-seal.v1",
        source_adapter_id: "rs02.quantbt-signal-notional-wfo.v1", profile_id: "rs02.delta-signal-notional-wfo.v1",
        retained_import_digest: expectedImport,
        table_rows: { OBSERVATION: 2, FOLD: 2, TRIAL: 3, CANDIDATE: 1, SELECTION: 1 }, total_rows: 9, summary: w1Summary,
      };
      await expect(service.seal(lease, seal as never)).resolves.toMatchObject({ replayed: false, retained_import_digest: expectedImport });
      await expect(service.seal(lease, seal as never)).resolves.toMatchObject({ replayed: true });
      const sealed = await repository.sealForRead({ workspaceId: "ws_w1", actorUserId: "usr_w1" }, "rrun_w1_wfo");
      expect(sealed).toMatchObject({
        sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
        profileId: "rs02.delta-signal-notional-wfo.v1",
        retainedImportDigest: expectedImport,
        // Copied from run_producers, not from the worker body.
        requestedSpecDigest: "1".repeat(64),
        effectiveSpecDigest: "2".repeat(64),
        datasetBindingDigest: "3".repeat(64),
        totalRows: 9,
      });
      await expect(service.appendBatch(lease, {
        ...common, schema_version: "research.current-source-batch.v1", table_kind: "OBSERVATION", batch_ordinal: 1,
        batch_digest: currentSourceBatchDigest(tables.OBSERVATION!), rows: tables.OBSERVATION!,
      } as never)).rejects.toBeTruthy();
    } finally {
      await database.end();
    }
  });

  it("W3 · A12 P13-T03: the observation series downsample keeps net return, max drawdown and the equity range", async () => {
    const database = new Pool({ connectionString: w1DatabaseUrl });
    const scope = { workspaceId: "ws_w1", actorUserId: "usr_w1" };
    const start = Date.parse("2026-01-01T00:00:00Z");
    // Deterministic path with its extrema in the middle of buckets.
    const equities = Array.from({ length: 5_000 }, (_, index) => 10_000 + 400 * Math.sin(index / 97) + 3 * index
      + (index === 1_234 ? -2_500 : 0) + (index === 3_777 ? 4_000 : 0));
    let peak = -Infinity;
    const drawdowns = equities.map((equity) => { peak = Math.max(peak, equity); return equity / peak - 1; });
    const client = await database.connect();
    try {
      await client.query("SET session_replication_role = replica");
      for (const [runId, count] of [["rrun_w3_series", 5_000], ["rrun_w3_series_small", 300]] as const) {
        const values: string[] = [];
        const params: unknown[] = [];
        for (let ordinal = 0; ordinal < count; ordinal += 1) {
          const at = start + ordinal * 3_600_000;
          const iso = new Date(at).toISOString().replace(".000Z", "Z");
          params.push(ordinal, iso, at, JSON.stringify({
            source_index_utc: iso, at_utc_ms: at, equity: String(equities[ordinal]), return_fraction: "0",
            accepted_position: "0", drawdown_fraction: String(drawdowns[ordinal]), signal_target: null,
          }));
          const base = params.length - 4;
          values.push(`('ws_w1', '${runId}', 1, 'OBSERVATION', $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb)`);
          if (values.length === 500 || ordinal === count - 1) {
            await client.query(`INSERT INTO research.current_source_rows_v1
              (workspace_id, run_id, artifact_revision, table_kind, source_ordinal, source_id, occurred_at_utc_ms, payload)
              VALUES ${values.join(", ")}`, params);
            values.length = 0;
            params.length = 0;
          }
        }
      }
      await client.query("SET session_replication_role = origin");
    } finally {
      client.release();
    }
    const repository = new ResearchCurrentSourceRepository(database);
    try {
      const sampled = await repository.observationSeries(scope, "rrun_w3_series", 1, 5_000, 2_000);
      expect(sampled.sampling).toBe("OBSERVATION_EXTREMA_BUCKET_V2");
      expect(sampled.rows.length).toBeLessThanOrEqual(2_000);
      expect(sampled.rows.length).toBeGreaterThan(400);
      const ordinals = sampled.rows.map((row) => row.sourceOrdinal);
      expect(ordinals).toEqual([...ordinals].sort((left, right) => left - right));
      const served = sampled.rows.map((row) => ({ equity: Number(row.payload.equity), drawdown: Number(row.payload.drawdown_fraction) }));
      // Net return: both endpoints survive.
      expect(ordinals[0]).toBe(0);
      expect(ordinals.at(-1)).toBe(4_999);
      expect(served[served.length - 1]!.equity / served[0]!.equity - 1).toBe(equities[4_999]! / equities[0]! - 1);
      // Max drawdown and the equity range are the full relation's.
      expect(Math.min(...served.map((row) => row.drawdown))).toBe(Math.min(...drawdowns));
      expect(Math.min(...served.map((row) => row.equity))).toBe(Math.min(...equities));
      expect(Math.max(...served.map((row) => row.equity))).toBe(Math.max(...equities));
      expect(ordinals).toContain(1_234);
      expect(ordinals).toContain(3_777);

      const full = await repository.observationSeries(scope, "rrun_w3_series_small", 1, 300, 2_000);
      expect(full.sampling).toBe("FULL");
      expect(full.rows.map((row) => row.sourceOrdinal)).toEqual(Array.from({ length: 300 }, (_, index) => index));
      await expect(repository.observationSeries(scope, "rrun_w3_series_small", 1, 301, 2_000))
        .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE" });
    } finally {
      await database.end();
    }
  });

  it("P10 on PostgreSQL: a WFO intent persists its profile, versioned job cost and replays against the same identity", async () => {
    const database = new Pool({ connectionString: w1DatabaseUrl });
    const scope = { workspaceId: "ws_w1", actorUserId: "usr_w1" };
    const admin = { ...w1Admin, userId: "usr_w1" };
    try {
      const repository = new ResearchMetadataRepository(database);
      await new ResearchP04DeltaBindingService(repository).install(admin, scope);
      const spec = wfoRequested();
      const manifest = manifestFor(spec, { token: "rpft_w1_pg_wfo" });
      await repository.storePreflightManifest(scope, { ...manifest, expiresAt: new Date(Date.now() + 60_000) }, 4);
      const calls: Array<Record<string, unknown>> = [];
      const proxy = {
        handleWrite: async (input: Record<string, unknown>) => {
          calls.push(input);
          const body = JSON.parse(String(input.body)) as { run_id: string };
          return { status: 202, body: { run_id: body.run_id }, idempotencyKey: input.idempotencyKey, replayed: false };
        },
      };
      const config = { ...flagConfig(true) } as never;
      const service = new ResearchRunCreateService(repository, new ResearchRunAdmissionService(repository, config), proxy as never, config);
      const input = {
        schema_version: "research.run-create.v1" as const, client_intent_id: "w1-pg-wfo-intent",
        preflight_token: "rpft_w1_pg_wfo", requested_spec: spec, intent_kind: "NEW" as const,
      };
      const accepted = await service.create(admin, scope, input, "w1-pg-a");
      await expect(service.create(admin, scope, input, "w1-pg-b")).resolves.toMatchObject({ run_id: accepted.run_id, replayed: true });
      expect(calls).toHaveLength(1);
      const privateBody = JSON.parse(String(calls[0]!.body)) as { research: Record<string, unknown>; protocol: string };
      expect(privateBody.protocol).toBe("advanced");
      expect(privateBody.research).toMatchObject({
        execution_profile_id: "p10.delta-signal-notional-wfo.v1", execution_profile_digest: DELTA_WFO_PROFILE_DIGEST,
      });
      expect(privateBody.research).not.toHaveProperty("p04_parameters");
      const durable = await database.query(`SELECT producer.execution_profile_id, producer.execution_profile_digest,
               job.resource_class, job.cost_estimate
          FROM research.run_producers producer
          JOIN research.jobs job ON job.workspace_id = producer.workspace_id AND job.job_id = producer.job_id
         WHERE producer.workspace_id = 'ws_w1' AND producer.run_id = $1`, [accepted.run_id]);
      expect(durable.rows).toHaveLength(1);
      expect(durable.rows[0]).toMatchObject({
        execution_profile_id: "p10.delta-signal-notional-wfo.v1",
        execution_profile_digest: DELTA_WFO_PROFILE_DIGEST,
        resource_class: "p10-delta-wfo-v1",
      });
      expect(JSON.stringify(durable.rows[0].cost_estimate)).toContain("120");
    } finally {
      await database.end();
    }
  });
});
