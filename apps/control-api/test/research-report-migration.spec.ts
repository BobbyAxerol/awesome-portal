import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

import { ResearchReportFrozenCoreSchema } from "../src/research/report.contract";
import { ResearchReportRepository } from "../src/research/report.repository";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_p18_${randomUUID().replaceAll("-", "")}`;

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const digest = "a".repeat(64);

async function seedRun(database: Pool, suffix = ""): Promise<{ workspaceId: string; actorUserId: string; runId: string }> {
  const userId = `usr_p18${suffix}`;
  const workspaceId = `ws_p18${suffix}`;
  const alphaId = `alpha_p18${suffix}`;
  const alphaVersionId = `av_p18${suffix}`;
  const attemptId = `attempt_p18${suffix}`;
  const runId = `run_p18${suffix}`;
  await database.query(`INSERT INTO portal_users
    (user_id, username, display_name, role, status, must_change_password)
    VALUES ($1, $2, 'P18 owner', 'ADMIN', 'ACTIVE', false)`, [userId, `p18-owner${suffix}`]);
  await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id)
    VALUES ($1, 'P18 disposable workspace', $2)`, [workspaceId, userId]);
  await database.query(`INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES ($1, $2, 'OWNER')`, [workspaceId, userId]);
  await database.query(`INSERT INTO research.alphas
    (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
    VALUES ($1, $2, 'P18 alpha', $3, $4)`, [workspaceId, alphaId, userId, `research.p18${suffix}`]);
  await database.query(`INSERT INTO research.alpha_versions
    (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint,
     dependency_ref, declared_contract, lifecycle_state, registered_by_user_id)
    VALUES ($1, $2, $3, $4, 'strategy:main',
            'quantbt@1.1.1', '{}'::jsonb, 'ACTIVE', $5)`, [workspaceId, alphaVersionId, alphaId, digest, userId]);
  await database.query(`INSERT INTO research.attempts
    (workspace_id, attempt_id, alpha_version_id, client_intent_id,
     request_payload_digest, intent_kind, state, created_by_user_id)
    VALUES ($1, $2, $3, $4,
            $5, 'NEW', 'QUEUED', $6)`, [workspaceId, attemptId, alphaVersionId, `intent-p18${suffix}`, digest, userId]);
  await database.query(`INSERT INTO research.runs
    (workspace_id, run_id, attempt_id, run_kind, relationship_kind,
     logical_run_key, request_spec_digest, effective_spec_digest,
     engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
    VALUES ($1, $2, $3, 'PRIMARY', 'PRIMARY',
            $4, $5, $5, 'quantbt-1.1.1', $5, 'READY', $6)`, [workspaceId, runId, attemptId, `logical-p18${suffix}`, digest, userId]);
  return { workspaceId, actorUserId: userId, runId };
}

function sealedCore() {
  const available = { state: "AVAILABLE", reason_code: null } as const;
  const unavailable = { state: "NOT_PUBLISHED", reason_code: "P18_FIXTURE_NOT_PUBLISHED" } as const;
  const reportFact = { state: "AVAILABLE", text: "published", reason_code: null, availability: available } as const;
  const identityKeys = [
    "run_id", "source_adapter", "engine_version", "input_scope", "dataset_id", "symbol",
    "timeframe", "evidence_revision", "split_revision", "search_revision", "freeze_revision", "replay_revision",
  ];
  const metricKeys = [
    "INITIAL_EQUITY", "FINAL_EQUITY", "NET_RETURN_FRACTION", "MAX_DRAWDOWN_FRACTION",
    "TRADE_COUNT", "BARS_PROCESSED", "BENCHMARK_RETURN_FRACTION", "FUNDING_TOTAL",
  ];
  return ResearchReportFrozenCoreSchema.parse({
    schema_version: "research.report-frozen-core.v1",
    report_source: "P13_P17_FIXED_PROFILE",
    source_revisions: {
      evidence_revision: `p13r1_${digest}`, split_revision: `p14r1_${digest}`,
      search_revision: `p15r1_${digest}`, freeze_revision: `p16r1_${digest}`,
      replay_revision: `p17r1_${digest}`,
    },
    source_digests: {
      source_transform_digest: digest, requested_spec_digest: digest, effective_spec_digest: digest,
      dataset_binding_digest: digest, manifest_digest: digest,
    },
    passport: Array.from({ length: 6 }, () => reportFact),
    identity: identityKeys.map((key) => ({ key, label: key, value: key, availability: available })),
    metrics: metricKeys.map((key, index) => ({
      key, label: key, unit: index < 2 ? "CURRENCY" : index === 4 || index === 5 ? "COUNT" : "FRACTION",
      scope: "OOS", origin: "ENGINE_DIRECT", definition_id: `research.metric.v1.metric_${index}`, value: "1", availability: available,
    })),
    headline: ["OOS_SHARPE", "DECAY_MEAN", "MAX_DRAWDOWN", "TRADES", "WIN_RATE", "FUNDING"].map((key) => ({ key, label: key, value: "1", availability: available })),
    headline_footnote: "P18 disposable retained report fixture.",
    equity: {
      state: "AVAILABLE", source_observation_count: 1, emitted_point_count: 1, sampling: "FULL",
      points: [{ at_utc_ms: 1_727_000_000_000, equity: "100", drawdown_fraction: "0" }], availability: available,
    },
    folds: { state: "NOT_PUBLISHED", reason_code: "P18_FIXTURE_NOT_PUBLISHED", rows: [], availability: unavailable },
    stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({ key, state: "DONE", started_at_utc_ms: 1_727_000_000_000, completed_at_utc_ms: 1_727_000_001_000 })),
    artifacts: ["RUN_SPEC", "SELECTION_TRACE", "FOLD_PLAN", "FILL_LEDGER", "METRICS_SUMMARY", "CLAIM", "BUNDLE"].map((key) => ({ key, digest: null, state: "NOT_PUBLISHED", availability: unavailable })),
    warnings: [],
    promotion: { state: "NOT_PUBLISHED", line: "Not published.", availability: unavailable },
    provenance: { line: "P18 disposable test provenance.", metric_registry_version: "research.metric-registry.v2", data_signature: digest, read_model_revision: "research.report-read-model.v1", verdict_rule_revision: "research.report-verdict-rule.v1" },
    source_absences: {},
  });
}

describe("P18 disposable PostgreSQL migration proof", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrlFor(databaseName));
  });

  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("installs immutable report cores, separate annotations and bounded export jobs with only scoped runtime grants", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const result = await database.query<{
        manifests: boolean; annotations: boolean; exports: boolean; manifest_guard: boolean; export_guard: boolean;
        runtime_insert_manifest: boolean; runtime_update_manifest: boolean; runtime_update_exports: boolean;
      }>(`
        SELECT
          to_regclass('research.run_report_manifests_v1') IS NOT NULL AS manifests,
          to_regclass('research.run_report_annotations_v1') IS NOT NULL AS annotations,
          to_regclass('research.run_report_export_jobs_v1') IS NOT NULL AS exports,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'research_run_report_manifests_v1_immutable_guard' AND NOT tgisinternal) AS manifest_guard,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'research_run_report_export_jobs_v1_guard' AND NOT tgisinternal) AS export_guard,
          has_table_privilege('portal_research_runtime', 'research.run_report_manifests_v1', 'INSERT') AS runtime_insert_manifest,
          has_table_privilege('portal_research_runtime', 'research.run_report_manifests_v1', 'UPDATE') AS runtime_update_manifest,
          has_table_privilege('portal_research_runtime', 'research.run_report_export_jobs_v1', 'UPDATE') AS runtime_update_exports
      `);
      expect(result.rows[0]).toEqual({
        manifests: true, annotations: true, exports: true, manifest_guard: true, export_guard: true,
        runtime_insert_manifest: true, runtime_update_manifest: false, runtime_update_exports: true,
      });
    } finally {
      await database.end();
    }
  });

  it("rejects report-core mutation, audit deletion and oversized export bytes", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      await seedRun(database);
      await database.query(`INSERT INTO research.run_report_manifests_v1
        (workspace_id, run_id, report_revision, frozen_core_digest, frozen_core)
        VALUES ('ws_p18', 'run_p18', $1, $2, '{"fixture":"p18"}'::jsonb)`, [`p18r1_${digest}`, digest]);

      await expect(database.query(`UPDATE research.run_report_manifests_v1
        SET frozen_core = '{"mutated":true}'::jsonb
        WHERE workspace_id = 'ws_p18' AND run_id = 'run_p18'`))
        .rejects.toMatchObject({ code: "55000" });

      await expect(database.query(`INSERT INTO research.run_report_export_jobs_v1
        (workspace_id, run_id, report_revision, job_id, format, requested_by_user_id,
         state, completed_at, output_bytes, output_sha256, content_type, filename)
        VALUES ('ws_p18', 'run_p18', $1, 'rpex_01J00000000000000000000000', 'REPORT_JSON', 'usr_p18',
                'READY', now(), $2, $3, 'application/json', $4)`, [
        `p18r1_${digest}`,
        Buffer.alloc(512 * 1024 + 1, 1),
        digest,
        `quantbt-run_p18-p18r1_${digest}.json`,
      ])).rejects.toMatchObject({ code: "23514" });

      await database.query(`INSERT INTO research.run_report_export_jobs_v1
        (workspace_id, run_id, report_revision, job_id, format, requested_by_user_id, state)
        VALUES ('ws_p18', 'run_p18', $1, 'rpex_01J00000000000000000000001', 'REPORT_CSV', 'usr_p18', 'QUEUED')`, [`p18r1_${digest}`]);
      await expect(database.query(`DELETE FROM research.run_report_export_jobs_v1
        WHERE workspace_id = 'ws_p18' AND job_id = 'rpex_01J00000000000000000000001'`))
        .rejects.toMatchObject({ code: "55000" });
      // Retain the audit row while taking it out of the global worker queue so
      // the following repository proof claims only its own fixture job.
      await database.query(`UPDATE research.run_report_export_jobs_v1
        SET state = 'FAILED', completed_at = now(), failure_code = 'P18_FIXTURE_FAILURE'
        WHERE workspace_id = 'ws_p18' AND job_id = 'rpex_01J00000000000000000000001'`);
    } finally {
      await database.end();
    }
  });

  it("persists, deduplicates, claims, completes and verifies one export without a source reread", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const scope = await seedRun(database, "_repo");
      const repository = new ResearchReportRepository(database);
      const core = sealedCore();
      const sealed = await repository.seal(scope, scope.runId, core);
      expect(sealed.frozenCore).toEqual(core);
      expect(sealed.frozenCoreDigest).toMatch(/^[0-9a-f]{64}$/);
      const storedCore = await database.query<{ frozen_core: unknown }>(
        "SELECT frozen_core FROM research.run_report_manifests_v1 WHERE workspace_id = $1 AND run_id = $2",
        [scope.workspaceId, scope.runId],
      );
      expect(ResearchReportFrozenCoreSchema.safeParse(storedCore.rows[0]!.frozen_core).success).toBe(true);

      const first = await repository.requestExport(scope, scope.runId, "REPORT_JSON");
      const duplicate = await repository.requestExport(scope, scope.runId, "REPORT_JSON");
      expect(duplicate.jobId).toBe(first.jobId);

      const claim = await repository.claimOne(60);
      expect(claim).toMatchObject({
        jobId: first.jobId, workspaceId: scope.workspaceId, runId: scope.runId,
        frozenCoreDigest: sealed.frozenCoreDigest, sealedAtUtcMs: sealed.sealedAtUtcMs,
      });
      const bytes = Buffer.from("{\"p18\":true}\n", "utf8");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const completed = await repository.completeClaim(claim!, {
        bytes, sha256, contentType: "application/json", filename: `quantbt-${scope.runId}-${sealed.reportRevision}.json`,
      });
      expect(completed).toMatchObject({ state: "READY", sha256, sizeBytes: bytes.byteLength });

      const downloaded = await repository.download(scope, scope.runId, first.jobId);
      expect(downloaded?.bytes).toEqual(bytes);
      await expect(repository.download({ ...scope, actorUserId: "unknown_p18" }, scope.runId, first.jobId))
        .rejects.toMatchObject({ code: "RESEARCH_REPORT_FORBIDDEN", status: 403 });
    } finally {
      await database.end();
    }
  });

  it("W6a: seals and re-reads a v2 core next to a v1 core, and reads the sealed P05 parts under the runtime role", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const scope = await seedRun(database, "_w6a");
      const repository = new ResearchReportRepository(database);
      const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
      const fixture = JSON.parse(readFileSync(resolve(contracts, "fixtures", "research-report.wfo-retained.valid.json"), "utf8"));
      const v1 = await repository.seal(scope, scope.runId, sealedCore());
      const v2 = await repository.seal(scope, scope.runId, fixture.frozen_core);
      expect(v2.frozenCore.schema_version).toBe("research.report-frozen-core.v2");
      expect(v2.reportRevision).not.toBe(v1.reportRevision);
      // The newest sealed core is the one served; the v1 row stays readable and unchanged.
      expect((await repository.read(scope, scope.runId))!.reportRevision).toBe(v2.reportRevision);

      expect(await repository.sealedArtifactParts(scope, scope.runId, null)).toBeNull();
      const manifest = "e".repeat(64);
      const client = await database.connect();
      try {
        await client.query("SET session_replication_role = replica");
        await client.query(`INSERT INTO research.artifacts
          (workspace_id, artifact_id, run_id, table_kind, schema_version, manifest_digest, state, retention_class,
           storage_locator, artifact_revision, worker_attempt_id, lease_epoch, manifest_schema_version, total_rows, total_bytes, sealed_at)
          VALUES ($1, 'rart_w6a', $2, 'research_bundle', 'research.artifact-manifest.v1', $3, 'SEALED',
                  'RESEARCH_EVIDENCE', 'artifacts/rart_w6a', 1, 'rwa_w6a', 1, 'research.artifact-manifest.v1', 2, 200, now())`,
        [scope.workspaceId, scope.runId, manifest]);
        for (const [tableKind, partDigest] of [["folds", "1".repeat(64)], ["selection", "2".repeat(64)]] as const) {
          await client.query(`INSERT INTO research.artifact_parts
            (workspace_id, artifact_id, table_kind, part_ordinal, schema_version, relative_path, part_digest, row_count, byte_count)
            VALUES ($1, 'rart_w6a', $2, 1, 'research.parquet-part.v1', 'tables/' || $2 || '/part-000001.parquet', $3, 1, 100)`,
          [scope.workspaceId, tableKind, partDigest]);
        }
      } finally {
        await client.query("SET session_replication_role = DEFAULT").catch(() => undefined);
        client.release();
      }
      const parts = await repository.sealedArtifactParts(scope, scope.runId, null);
      expect(parts).toEqual({
        artifactRevision: 1,
        manifestDigest: manifest,
        parts: [
          { tableKind: "folds", partOrdinal: 1, relativePath: "tables/folds/part-000001.parquet", partDigest: "1".repeat(64) },
          { tableKind: "selection", partOrdinal: 1, relativePath: "tables/selection/part-000001.parquet", partDigest: "2".repeat(64) },
        ],
      });
      expect(await repository.sealedArtifactParts(scope, scope.runId, 2)).toBeNull();
      await expect(repository.sealedArtifactParts({ ...scope, actorUserId: "unknown_w6a" }, scope.runId, null))
        .rejects.toMatchObject({ code: "RESEARCH_REPORT_FORBIDDEN", status: 403 });
    } finally {
      await database.end();
    }
  });
});
