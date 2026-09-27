/**
 * W5a · migration 064 on real PostgreSQL (A10a receipts; A10c what-if lane).
 *
 * Runs only against a disposable database (TEST_DATABASE_URL), like the
 * other Research migration proofs.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { ResearchArtifactVerifyRepository } from "../src/research/artifact-verify.repository";
import { compareArtifactBytes } from "../src/research/artifact-verify.service";
import { notYet } from "../src/research/artifact-verify.contract";
import { ResearchP04DeltaBindingService } from "../src/research/p04-delta-binding.service";
import { ResearchMetadataRepository } from "../src/research/repository";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import { buildWhatIfGrid } from "../src/research/whatif.grid";
import { ResearchWhatIfRepository } from "../src/research/whatif.repository";
import { ResearchWhatIfService } from "../src/research/whatif.service";
import { migrateTestDatabase } from "./harness";
import { flagConfig, manifestFor, w1Admin, wfoRequested } from "./research-w1-wfo.fixture";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_w5a_${randomUUID().replaceAll("-", "")}`;

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

const databaseUrl = databaseUrlFor(databaseName);
const scope = { workspaceId: "ws_w5a", actorUserId: "usr_w5a" };
const MANIFEST = "1".repeat(64);
const PART = "a".repeat(64);
const WRONG = "e".repeat(64);

describe("W5a migration 064 · A10a byte receipts on PostgreSQL", () => {
  let database: Pool;

  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrl);
    database = new Pool({ connectionString: databaseUrl });
    await database.query(`INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
      VALUES ('usr_w5a', 'w5a-owner', 'W5a owner', 'ADMIN', 'ACTIVE', false)`);
    await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ('ws_w5a', 'W5a', 'usr_w5a')`);
    await database.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('ws_w5a', 'usr_w5a', 'OWNER')
      ON CONFLICT DO NOTHING`);
    const client = await database.connect();
    try {
      await client.query("SET session_replication_role = replica");
      await client.query(`INSERT INTO research.runs
        (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key, request_spec_digest,
         effective_spec_digest, engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
        VALUES ('ws_w5a', 'rrun_w5a', 'ratt_w5a', 'PRIMARY', 'PRIMARY', 'primary', $1, $1, 'er_quantbt_111', $1, 'READY', 'usr_w5a')`,
      [MANIFEST]);
      await client.query(`INSERT INTO research.artifacts
        (workspace_id, artifact_id, run_id, table_kind, schema_version, manifest_digest, state, retention_class,
         storage_locator, artifact_revision, worker_attempt_id, lease_epoch, manifest_schema_version, total_rows, total_bytes, sealed_at)
        VALUES ('ws_w5a', 'rart_w5a', 'rrun_w5a', 'research_bundle', 'research.artifact-manifest.v1', $1, 'SEALED',
                'RESEARCH_EVIDENCE', 'artifacts/rart_w5a', 1, 'rwa_w5a', 3, 'research.artifact-manifest.v1', 9, 900, now())`,
      [MANIFEST]);
      await client.query(`INSERT INTO research.artifact_parts
        (workspace_id, artifact_id, table_kind, part_ordinal, schema_version, relative_path, part_digest, row_count, byte_count)
        VALUES ('ws_w5a', 'rart_w5a', 'trials', 1, 'research.parquet-part.v1', 'tables/trials/part-00001.parquet', $1, 3, 300)`,
      [PART]);
      await client.query("SET session_replication_role = origin");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await database?.end();
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("installs an append-only receipt table the runtime role can read and append, never update", async () => {
    const result = await database.query<Record<string, boolean>>(`SELECT
      to_regclass('research.artifact_byte_receipts_v1') IS NOT NULL AS receipts,
      has_table_privilege('portal_research_runtime', 'research.artifact_byte_receipts_v1', 'SELECT') AS runtime_select,
      has_table_privilege('portal_research_runtime', 'research.artifact_byte_receipts_v1', 'INSERT') AS runtime_insert,
      has_table_privilege('portal_research_runtime', 'research.artifact_byte_receipts_v1', 'UPDATE') AS runtime_update,
      has_table_privilege('portal_research_runtime', 'research.artifact_byte_receipts_v1', 'DELETE') AS runtime_delete`);
    expect(result.rows[0]).toEqual({ receipts: true, runtime_select: true, runtime_insert: true, runtime_update: false, runtime_delete: false });
  });

  it("P16-T03/T04 on PostgreSQL: corrupt bytes are a MISMATCH receipt; the sealed expectation never moves", async () => {
    const repository = new ResearchArtifactVerifyRepository(database);
    const expectation = await repository.expectation(scope, "rrun_w5a");
    expect(expectation).toMatchObject({ artifactId: "rart_w5a", artifactRevision: 1, expectedManifestDigest: MANIFEST });
    const observation = (partDigest: string) => ({
      schema_version: "research.artifact-byte-observation.v1" as const,
      artifact_id: "rart_w5a",
      manifest_state: "PRESENT" as const,
      manifest_digest: MANIFEST,
      manifest_artifact_revision: 1,
      parts: [{ relative_path: "tables/trials/part-00001.parquet", observed_digest: partDigest, observed_bytes: 300 }],
      documents: [],
    });
    const bad = compareArtifactBytes(expectation!, observation(WRONG));
    const first = await repository.record(scope, { runId: "rrun_w5a", artifactId: "rart_w5a", artifactRevision: 1, expectedManifestDigest: MANIFEST, ...bad });
    const again = await repository.record(scope, { runId: "rrun_w5a", artifactId: "rart_w5a", artifactRevision: 1, expectedManifestDigest: MANIFEST, ...bad });
    expect([first.state, again.state]).toEqual(["MISMATCH", "MISMATCH"]);
    // The seal record is untouched by either verify.
    const sealed = await database.query(`SELECT manifest_digest, state FROM research.artifacts WHERE artifact_id = 'rart_w5a'`);
    expect(sealed.rows[0]).toEqual({ manifest_digest: MANIFEST, state: "SEALED" });
    const part = await database.query(`SELECT part_digest FROM research.artifact_parts WHERE artifact_id = 'rart_w5a'`);
    expect(part.rows[0]).toEqual({ part_digest: PART });
    expect((await repository.latest(scope, "rrun_w5a"))?.receipt_id).toBe(again.receipt_id);
    // Restoring the original bytes is the only way back.
    const good = compareArtifactBytes(expectation!, observation(PART));
    const restored = await repository.record(scope, { runId: "rrun_w5a", artifactId: "rart_w5a", artifactRevision: 1, expectedManifestDigest: MANIFEST, ...good });
    expect(restored.state).toBe("MATCH");
    expect((await repository.latest(scope, "rrun_w5a"))?.state).toBe("MATCH");
  });

  it("A10c on PostgreSQL: one DIAGNOSTIC job per grid key; the frozen parent is never written; a sealed grid fills its cells", async () => {
    const owner = { ...w1Admin, userId: "usr_w5a" };
    const repository = new ResearchMetadataRepository(database);
    await new ResearchP04DeltaBindingService(repository).install(owner, scope);
    const spec = wfoRequested();
    const manifest = manifestFor(spec, { token: "rpft_w5a_parent" });
    await repository.storePreflightManifest(scope, { ...manifest, expiresAt: new Date(Date.now() + 60_000) }, 4);
    const calls: Array<Record<string, unknown>> = [];
    const proxy = {
      handleWrite: async (input: Record<string, unknown>) => {
        calls.push(input);
        const body = JSON.parse(String(input.body)) as { run_id: string };
        return { status: 202, body: { run_id: body.run_id }, idempotencyKey: input.idempotencyKey, replayed: false };
      },
    };
    const config = { ...flagConfig(true), FEATURE_RESEARCH_WHATIF: "true" } as never;
    const created = await new ResearchRunCreateService(repository, new ResearchRunAdmissionService(repository, config), proxy as never, config)
      .create(owner, scope, {
        schema_version: "research.run-create.v1", client_intent_id: "w5a-parent-intent",
        preflight_token: "rpft_w5a_parent", requested_spec: spec, intent_kind: "NEW",
      }, "w5a-parent");
    const parentRunId = created.run_id;
    const snapshotParent = async () => (await database.query(
      `SELECT run.state AS run_state, run.state_version, attempt.state AS attempt_state, producer.work_digest,
              producer.dispatch_state, producer.legacy_request::text AS legacy
         FROM research.runs run
         JOIN research.attempts attempt ON attempt.workspace_id = run.workspace_id AND attempt.attempt_id = run.attempt_id
         JOIN research.run_producers producer ON producer.workspace_id = run.workspace_id AND producer.run_id = run.run_id
        WHERE run.workspace_id = 'ws_w5a' AND run.run_id = $1`, [parentRunId])).rows[0];
    const before = await snapshotParent();

    const theta = { window: "34", rsi_l: "30", signalLength: "16", len_atr1: "14", len_atr2: "30", rvol: "1.2", len_vol: "8", slpercent: "2.3" };
    const basis = {
      runId: parentRunId,
      frozen: theta,
      trials: [{ trialId: "0", state: "COMPLETE", objective: "-1.4435308120735202", parameters: theta }],
      bytes: notYet("NOT_VERIFIED", "P16_ARTIFACT_BYTES_NOT_VERIFIED_YET"),
    };
    const whatIfRepository = new ResearchWhatIfRepository(database);
    const whatIf = new ResearchWhatIfService(whatIfRepository, repository, proxy as never, config);
    const read = await whatIf.read(scope, basis);
    expect(read.coverage).toMatchObject({ evaluated_cells: 1, unique_evaluations: 49 });
    const gridKey = read.grid!.grid_key;
    const first = await whatIf.evaluate(owner, scope, basis, gridKey, "w5a-eval-1");
    expect(first).toMatchObject({ outcome: "ADMITTED", job: { evaluations: 48, state: "RUNNING" } });
    const again = await whatIf.evaluate(owner, scope, basis, gridKey, "w5a-eval-2");
    expect(again).toMatchObject({ outcome: "REPLAYED", job: { run_id: first.job!.run_id } });
    expect(calls.filter((call) => String(call.idempotencyKey).startsWith("research-whatif:"))).toHaveLength(1);

    const diagnostic = (await database.query(
      `SELECT run.run_kind, run.relationship_kind, run.parent_run_id, attempt.intent_kind, attempt.parent_attempt_id,
              parent.attempt_id AS parent_attempt, job.job_kind, job.queue_class, producer.execution_profile_id,
              producer.intent_kind AS producer_intent, producer.actor_user_id
         FROM research.runs run
         JOIN research.attempts attempt ON attempt.workspace_id = run.workspace_id AND attempt.attempt_id = run.attempt_id
         JOIN research.runs parent ON parent.workspace_id = run.workspace_id AND parent.run_id = run.parent_run_id
         JOIN research.jobs job ON job.workspace_id = run.workspace_id AND job.run_id = run.run_id
         JOIN research.run_producers producer ON producer.workspace_id = run.workspace_id AND producer.run_id = run.run_id
        WHERE run.workspace_id = 'ws_w5a' AND run.run_id = $1`, [first.job!.run_id])).rows[0];
    expect(diagnostic).toMatchObject({
      run_kind: "DIAGNOSTIC", relationship_kind: "DIAGNOSTIC_OF_RUN", parent_run_id: parentRunId,
      intent_kind: "DIAGNOSTIC", job_kind: "DIAGNOSTIC", queue_class: "BACKGROUND",
      execution_profile_id: "p16.delta-whatif-grid.v1", producer_intent: "DIAGNOSTIC",
    });
    expect(diagnostic.parent_attempt_id).toBe(diagnostic.parent_attempt);
    // The frozen parent: same run/attempt state, same producer bytes.
    expect(await snapshotParent()).toEqual(before);
    // The DB refuses a DIAGNOSTIC intent that is not the what-if profile, and vice versa.
    await expect(database.query(
      `UPDATE research.run_producers SET intent_kind = 'NEW' WHERE workspace_id = 'ws_w5a' AND run_id = $1`, [first.job!.run_id],
    )).rejects.toBeTruthy();

    // The worker seals its P05 artifact, then the WHATIF_GRID relation.
    const grid = buildWhatIfGrid(parentRunId, theta, {
      rvol: { minimum: "1", maximum: "2.5", step: "0.1" }, slpercent: { minimum: "0.7", maximum: "2.5", step: "0.1" },
    }, { dataset_binding_digest: manifest.datasetBindingDigest, requested_spec_digest: manifest.requestedSpecDigest, engine_release_id: "er_quantbt_111", random_seed: 42 });
    expect(grid.grid_key).toBe(gridKey);
    const admitted = (await database.query(`SELECT evaluations FROM research.whatif_jobs_v1 WHERE diagnostic_run_id = $1`, [first.job!.run_id])).rows[0].evaluations as { evaluation_key: string }[];
    const client = await database.connect();
    try {
      await client.query("SET session_replication_role = replica");
      await client.query(`INSERT INTO research.artifacts
        (workspace_id, artifact_id, run_id, table_kind, schema_version, manifest_digest, state, retention_class,
         storage_locator, artifact_revision, worker_attempt_id, lease_epoch, manifest_schema_version, total_rows, total_bytes, sealed_at)
        VALUES ('ws_w5a', 'rart_w5a_diag', $1, 'research_bundle', 'research.artifact-manifest.v1', $2, 'SEALED',
                'RESEARCH_EVIDENCE', 'artifacts/rart_w5a_diag', 1, 'rwa_w5a_diag', 1, 'research.artifact-manifest.v1', 48, 4800, now())`,
      [first.job!.run_id, MANIFEST]);
      await client.query("SET session_replication_role = origin");
    } finally {
      client.release();
    }
    const results = admitted.map((entry, index) => ({
      evaluation_key: entry.evaluation_key, trial_id: String(index),
      state: index === 0 ? "PRUNED" as const : "COMPLETE" as const, objective: index === 0 ? null : `-1.${index}`,
    }));
    const seal = {
      schema_version: "research.whatif-grid-seal.v1" as const, workspace_id: "ws_w5a", run_id: first.job!.run_id,
      job_id: "unused", worker_attempt_id: "unused", lease_epoch: 1, artifact_id: "rart_w5a_diag", artifact_revision: 1,
      manifest_digest: MANIFEST, grid_key: gridKey, results,
    };
    await expect(whatIfRepository.sealGrid({ workspaceId: "ws_w5a", actorUserId: "usr_w5a" }, { ...seal, results: results.slice(1) }))
      .rejects.toMatchObject({ code: "RESEARCH_WHATIF_CONFLICT" });
    await expect(whatIfRepository.sealGrid({ workspaceId: "ws_w5a", actorUserId: "usr_w5a" }, seal)).resolves.toEqual({ replayed: false });
    await expect(whatIfRepository.sealGrid({ workspaceId: "ws_w5a", actorUserId: "usr_w5a" }, seal)).resolves.toEqual({ replayed: true });
    await expect(database.query(`UPDATE research.whatif_grids_v1 SET result_count = 1`)).rejects.toMatchObject({ code: "55000" });

    const after = await whatIf.read(scope, basis);
    expect(after.coverage?.evaluated_unique).toBe(48); // θ* + 47 COMPLETE; the PRUNED one stays NOT_DEFINED
    expect(after.grid!.cells.some((cell) => cell.state === "NOT_DEFINED")).toBe(true);
    expect(after.grid!.cells.filter((cell) => cell.state === "MISSING")).toHaveLength(0);
    expect(after.job).toMatchObject({ run_id: first.job!.run_id, sealed: true });
    expect(await snapshotParent()).toEqual(before);

    // P16-T08: "create sibling attempt →" at x6y4 is a NEW intent (own
    // preflight, own config_hash) whose attempt is SIBLING_OF the parent.
    const siblingSpec = wfoRequested({ parameter_space_overrides: [
      { name: "rvol", kind: "pin", value: 1.4 }, { name: "slpercent", kind: "pin", value: 2.3 },
    ] });
    const siblingManifest = manifestFor(siblingSpec, { token: "rpft_w5a_sibling" });
    await repository.storePreflightManifest(scope, { ...siblingManifest, expiresAt: new Date(Date.now() + 60_000) }, 4);
    const sibling = await new ResearchRunCreateService(repository, new ResearchRunAdmissionService(repository, config), proxy as never, config)
      .create(owner, scope, {
        schema_version: "research.run-create.v1", client_intent_id: "w5a-sibling-intent",
        preflight_token: "rpft_w5a_sibling", requested_spec: siblingSpec, intent_kind: "NEW",
        lineage: { relation: "SIBLING_OF", parent_run_id: parentRunId, what_if_cell_id: "x6y4" },
      }, "w5a-sibling");
    expect(sibling.run_id).not.toBe(parentRunId);
    expect(sibling.requested_spec_digest).not.toBe(created.requested_spec_digest);
    const siblingAttempt = (await database.query(
      `SELECT attempt.intent_kind, attempt.relation_kind, attempt.parent_attempt_id, attempt.reason, parent.attempt_id AS parent_attempt
         FROM research.runs run
         JOIN research.attempts attempt ON attempt.workspace_id = run.workspace_id AND attempt.attempt_id = run.attempt_id
         JOIN research.runs parent ON parent.workspace_id = run.workspace_id AND parent.run_id = $2
        WHERE run.workspace_id = 'ws_w5a' AND run.run_id = $1`, [sibling.run_id, parentRunId])).rows[0];
    expect(siblingAttempt).toMatchObject({ intent_kind: "CLONE_FOR_EXPERIMENT", relation_kind: "SIBLING_OF" });
    expect(siblingAttempt.parent_attempt_id).toBe(siblingAttempt.parent_attempt);
    expect(siblingAttempt.reason).toBe(`what-if fork of ${parentRunId} at x6y4`);
    expect(await snapshotParent()).toEqual(before);
    // The DB refuses SIBLING_OF without a parent.
    await expect(database.query(`UPDATE research.attempts SET parent_attempt_id = NULL WHERE workspace_id = 'ws_w5a' AND relation_kind = 'SIBLING_OF'`))
      .rejects.toBeTruthy();

    /*
     * E13 · P19: the plain `?from=<run>` clone records its parent too.
     *
     * Before this, `?from=` declared nothing: the new attempt landed with a
     * NULL `parent_attempt_id`, so all 33 attempts on the preview read
     * `parent_state: ROOT`, Screen 10's tree never nested and "diff vs
     * parent" was always "Root attempt". A clone is not a what-if node, so
     * it stores no `relation_kind` — the DB CHECK reserves SIBLING_OF for a
     * fork, and the lineage read prints "parent <id>" for a plain edge.
     */
    const cloneSpec = wfoRequested({ parameter_space_overrides: [
      { name: "rvol", kind: "pin", value: 1.9 }, { name: "slpercent", kind: "pin", value: 2.1 },
    ] });
    const cloneManifest = manifestFor(cloneSpec, { token: "rpft_e13_clone" });
    await repository.storePreflightManifest(scope, { ...cloneManifest, expiresAt: new Date(Date.now() + 60_000) }, 5);
    const clone = await new ResearchRunCreateService(repository, new ResearchRunAdmissionService(repository, config), proxy as never, config)
      .create(owner, scope, {
        schema_version: "research.run-create.v1", client_intent_id: "e13-clone-intent",
        preflight_token: "rpft_e13_clone", requested_spec: cloneSpec, intent_kind: "NEW",
        lineage: { relation: "CLONE_OF", parent_run_id: parentRunId },
      }, "e13-clone");
    expect(clone.run_id).not.toBe(parentRunId);
    const cloneAttempt = (await database.query(
      `SELECT attempt.intent_kind, attempt.relation_kind, attempt.parent_attempt_id, attempt.reason, parent.attempt_id AS parent_attempt
         FROM research.runs run
         JOIN research.attempts attempt ON attempt.workspace_id = run.workspace_id AND attempt.attempt_id = run.attempt_id
         JOIN research.runs parent ON parent.workspace_id = run.workspace_id AND parent.run_id = $2
        WHERE run.workspace_id = 'ws_w5a' AND run.run_id = $1`, [clone.run_id, parentRunId])).rows[0];
    expect(cloneAttempt).toMatchObject({ intent_kind: "CLONE_FOR_EXPERIMENT", relation_kind: null });
    expect(cloneAttempt.parent_attempt_id).toBe(cloneAttempt.parent_attempt);
    expect(cloneAttempt.reason).toBe(`clone of ${parentRunId}`);
    // Recording the edge changes nothing about the parent run itself.
    expect(await snapshotParent()).toEqual(before);

    // A clone of a run this workspace does not have is a typed 404, not a
    // silent root — the browser only ever sends an id a read just returned.
    await expect(new ResearchRunCreateService(repository, new ResearchRunAdmissionService(repository, config), proxy as never, config)
      .create(owner, scope, {
        schema_version: "research.run-create.v1", client_intent_id: "e13-clone-missing",
        preflight_token: "rpft_e13_clone", requested_spec: cloneSpec, intent_kind: "NEW",
        lineage: { relation: "CLONE_OF", parent_run_id: "rrun_not_in_this_workspace" },
      }, "e13-clone-missing")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a receipt that names a different expectation, a MATCH without matching digests, and any mutation", async () => {
    const insert = (state: string, expected: string, observed: string | null, mismatched = 0) => database.query(
      `INSERT INTO research.artifact_byte_receipts_v1
        (workspace_id, receipt_id, run_id, artifact_id, artifact_revision, state, expected_manifest_digest,
         observed_manifest_digest, parts_checked, parts_mismatched, documents_checked, mismatches, requested_by_user_id)
       VALUES ('ws_w5a', $1, 'rrun_w5a', 'rart_w5a', 1, $2, $3, $4, 1, $5, 0, '[]'::jsonb, 'usr_w5a')`,
      [`rabv_${randomUUID().replaceAll("-", "")}`, state, expected, observed, mismatched],
    );
    await expect(insert("MISMATCH", WRONG, WRONG, 1)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("MATCH", MANIFEST, WRONG)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("MATCH", MANIFEST, MANIFEST, 1)).rejects.toMatchObject({ code: "23514" });
    await expect(database.query(`UPDATE research.artifact_byte_receipts_v1 SET state = 'MATCH' WHERE workspace_id = 'ws_w5a'`))
      .rejects.toMatchObject({ code: "55000" });
    await expect(database.query(`DELETE FROM research.artifact_byte_receipts_v1 WHERE workspace_id = 'ws_w5a'`))
      .rejects.toMatchObject({ code: "55000" });
  });
});
