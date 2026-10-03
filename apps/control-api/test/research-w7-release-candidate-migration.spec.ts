/**
 * W7 · P21 retained lane on a disposable PostgreSQL (the hook's database).
 *
 * Seeds one Delta WFO run the way P10/P11/RS-02/W6a leave it — a P10
 * producer with the locked WFO profile, the RS-02 seal (W5b real summary and
 * FOLD rows), its batch receipts, the SEALED P05 artifact and parts the seal's
 * manifest names, the progress claim, and a report v2 sealed from the same
 * retained revision — then composes and locally seals it through the real
 * repository under the runtime role. The preflight manifest in run_producers
 * is deliberately a different identity from the retained manifest.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { currentSourceImportDigest } from "../src/research/current-source.repository";
import { currentSourceSealDigest } from "../src/research/current-source.service";
import { DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_PROFILE_ID } from "../src/research/delta-wfo.profile";
import { canonicalResearchJson } from "../src/research/preflight.service";
import { releaseCandidateSourceFingerprint, ResearchReleaseCandidateRepository } from "../src/research/release-candidate.repository";
import { ResearchReleaseCandidateService } from "../src/research/release-candidate.service";
import { migrateTestDatabase } from "./harness";

type Json = Record<string, any>;
const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = "portal_w7_" + randomUUID().replaceAll("-", "");
const gz = (name: string) => JSON.parse(gunzipSync(readFileSync(join(__dirname, name))).toString("utf8")) as Json;
const preview = gz("research-w7-real-wfo-preview.fixture.json.gz");
const w5b = gz("research-w5b-real-replay.fixture.json.gz");
const sha = (value: unknown) => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
const hex = (label: string) => createHash("sha256").update(label, "utf8").digest("hex");
const provenance = preview.evidence.provenance;

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/" + name;
  return url.toString();
}

const W = "ws_w7";
const U = "usr_w7";
const RUN = "rrun_w7_wfo";
const ALPHA = "delta-rsi-polynomial-alpha";
const VERSION = "av_w7";
const ARTIFACT = "rart_w7";

async function seed(database: Pool) {
  const client = await database.connect();
  const batches = [
    { table_kind: "FOLD" as const, batch_ordinal: 0, batch_digest: hex("fold-batch"), row_count: 2 },
    { table_kind: "OBSERVATION" as const, batch_ordinal: 0, batch_digest: hex("observation-batch"), row_count: 200 },
  ];
  const importDigest = currentSourceImportDigest(batches);
  const tableRows = w5b.table_rows;
  const sealDigest = currentSourceSealDigest({
    artifactRevision: 1, manifestDigest: provenance.source_manifest_digest, sourceTransformDigest: provenance.source_transform_digest,
    retainedImportDigest: importDigest, tableRows, summary: w5b.summary,
  });
  const core = JSON.parse(JSON.stringify(preview.report.frozen_core));
  core.identity.find((item: Json) => item.key === "run_id").value = RUN;
  core.source_revisions.evidence_revision = "rs02_evidence_" + sealDigest;
  const coreDigest = sha(core);
  try {
    await client.query("SET session_replication_role = replica");
    await client.query("INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password) VALUES ($1, 'w7-owner', 'W7 owner', 'ADMIN', 'ACTIVE', false)", [U]);
    await client.query("INSERT INTO workspaces (workspace_id, name, owner_user_id) VALUES ($1, 'W7 disposable workspace', $2)", [W, U]);
    await client.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')", [W, U]);
    await client.query("INSERT INTO research.alphas (workspace_id, alpha_id, name, owner_user_id, execution_subject_id) VALUES ($1, $2, 'Delta-RSI Polynomial Alpha', $3, 'research.w7')", [W, ALPHA, U]);
    await client.query(`INSERT INTO research.alpha_versions
      (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint, dependency_ref, declared_contract, lifecycle_state, registered_by_user_id)
      VALUES ($1, $2, $3, $4, 'strategy.delta_rsi:generate_signals', 'quantbt@1.1.1', $5::jsonb, 'ACTIVE', $6)`,
    [W, VERSION, ALPHA, hex("alpha-code"), JSON.stringify({ execution: { execution_route: "signal_notional" } }), U]);
    await client.query(`INSERT INTO research.attempts
      (workspace_id, attempt_id, alpha_version_id, client_intent_id, request_payload_digest, intent_kind, state, created_by_user_id)
      VALUES ($1, 'att_w7', $2, 'intent-w7', $3, 'NEW', 'READY', $4)`, [W, VERSION, hex("request"), U]);
    await client.query(`INSERT INTO research.runs
      (workspace_id, run_id, attempt_id, run_kind, relationship_kind, logical_run_key, request_spec_digest, effective_spec_digest,
       engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
      VALUES ($1, $2, 'att_w7', 'PRIMARY', 'PRIMARY', 'w7-primary', $3, $4, 'er_quantbt_111', $5, 'READY', $6)`,
    [W, RUN, provenance.requested_spec_digest, provenance.effective_spec_digest, provenance.dataset_binding_digest, U]);
    await client.query(`INSERT INTO research.run_producers
      (workspace_id, run_id, attempt_id, job_id, actor_user_id, client_intent_id, intent_kind, preflight_token, alpha_id, alpha_version_id,
       execution_adapter_id, adapter_contract_digest, requested_spec_digest, effective_spec_digest, dataset_binding_digest, manifest_digest,
       snapshot_id, snapshot_content_hash, work_digest, legacy_request, execution_profile_id, execution_profile_digest, worker_attempt_id, lease_epoch)
      VALUES ($1, $2, 'att_w7', 'job_w7', $3, 'intent-w7', 'NEW', 'rpft_w7', $4, $5, 'p04.delta-rsi.v1', $6, $7, $8, $9, $10,
              $11, $12, $13, $14::jsonb, $15, $16, 'rwa_w7', 1)`,
    [W, RUN, U, ALPHA, VERSION, hex("adapter"), provenance.requested_spec_digest, provenance.effective_spec_digest,
      provenance.dataset_binding_digest, preview.p16_provenance.manifest_digest, "dss_" + "a".repeat(32), hex("snapshot"), hex("work"),
      JSON.stringify({}), DELTA_WFO_PROFILE_ID, DELTA_WFO_PROFILE_DIGEST]);
    await client.query(`INSERT INTO research.artifacts
      (workspace_id, artifact_id, run_id, table_kind, schema_version, manifest_digest, state, retention_class,
       storage_locator, artifact_revision, worker_attempt_id, lease_epoch, manifest_schema_version, total_rows, total_bytes, sealed_at)
      VALUES ($1, $2, $3, 'research_bundle', 'research.artifact-manifest.v1', $4, 'SEALED', 'RESEARCH_EVIDENCE',
              'artifacts/rart_w7', 1, 'rwa_w7', 1, 'research.artifact-manifest.v1', 1063, 163826, now())`,
    [W, ARTIFACT, RUN, provenance.source_manifest_digest]);
    for (const kind of ["folds", "trials"]) {
      await client.query(`INSERT INTO research.artifact_parts
        (workspace_id, artifact_id, table_kind, part_ordinal, schema_version, relative_path, part_digest, row_count, byte_count)
        VALUES ($1, $2, $3, 1, 'research.artifact-part.v1', $4, $5, 2, 100)`,
      [W, ARTIFACT, kind, "tables/" + kind + "/part-000001.parquet", hex("part-" + kind)]);
    }
    await client.query(`INSERT INTO research.current_source_seals_v1
      (workspace_id, run_id, artifact_revision, source_adapter_id, profile_id, manifest_digest, source_transform_digest,
       requested_spec_digest, effective_spec_digest, dataset_binding_digest, retained_import_digest, table_rows, total_rows, summary)
      VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, 1063, $12::jsonb)`,
    [W, RUN, provenance.source_adapter_id, provenance.profile_id, provenance.source_manifest_digest, provenance.source_transform_digest,
      provenance.requested_spec_digest, provenance.effective_spec_digest, provenance.dataset_binding_digest, importDigest,
      JSON.stringify(tableRows), JSON.stringify(w5b.summary)]);
    for (const batch of batches) {
      await client.query(`INSERT INTO research.current_source_import_batches_v1
        (workspace_id, run_id, artifact_revision, manifest_digest, source_transform_digest, table_kind, batch_ordinal, batch_digest, row_count)
        VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8)`,
      [W, RUN, provenance.source_manifest_digest, provenance.source_transform_digest, batch.table_kind, batch.batch_ordinal, batch.batch_digest, batch.row_count]);
    }
    for (const row of w5b.rows.FOLD as Json[]) {
      await client.query(`INSERT INTO research.current_source_rows_v1
        (workspace_id, run_id, artifact_revision, table_kind, source_ordinal, source_id, occurred_at_utc_ms, payload)
        VALUES ($1, $2, 1, 'FOLD', $3, $4, NULL, $5::jsonb)`, [W, RUN, row.sourceOrdinal, row.sourceId, JSON.stringify(row.payload)]);
    }
    const snapshot = { claim: preview.progress.claim };
    await client.query(`INSERT INTO research.run_progress_snapshots
      (workspace_id, run_id, worker_attempt_id, lease_epoch, source_latest_sequence, retention_floor_sequence, snapshot, snapshot_digest)
      VALUES ($1, $2, 'rwa_w7', 1, 10, 0, $3::jsonb, $4)`, [W, RUN, JSON.stringify(snapshot), sha(snapshot)]);
    await client.query(`INSERT INTO research.run_report_manifests_v1 (workspace_id, run_id, report_revision, frozen_core_digest, frozen_core)
      VALUES ($1, $2, $3, $4, $5::jsonb)`, [W, RUN, "p18r1_" + coreDigest, coreDigest, canonicalResearchJson(core)]);
    await client.query("SET session_replication_role = origin");
  } finally {
    client.release();
  }
  return { sealDigest, importDigest, coreDigest };
}

describe("W7 · P21 retained lane on disposable PostgreSQL", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query("CREATE DATABASE " + databaseName); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrlFor(databaseName));
  });

  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)"); } finally { await admin.end(); }
  });

  it("joins the retained facts under the runtime role, composes without MISSING rows and seals SEALED_LOCAL · NOT_DELIVERED · NOT_APPROVED", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const seeded = await seed(database);
      const scope = { workspaceId: W, actorUserId: U };
      const repository = new ResearchReleaseCandidateRepository(database);
      const source = await repository.snapshot(scope, RUN);
      expect(source!.wfo).toMatchObject({
        executionProfileId: DELTA_WFO_PROFILE_ID,
        executionProfileDigest: DELTA_WFO_PROFILE_DIGEST,
        producerDatasetBindingDigest: provenance.dataset_binding_digest,
        sealedArtifactId: ARTIFACT,
        partDigests: [hex("part-folds"), hex("part-trials")],
        observedImportDigest: seeded.importDigest,
        claimState: "NOT_ISSUED",
        handoffParamsDigest: preview.progress.claim.handoff_cursor.params_digest,
      });
      expect(source!.wfo!.seal).toMatchObject({ artifactRevision: 1, manifestDigest: provenance.source_manifest_digest, tableRows: w5b.table_rows });
      expect(source!.wfo!.folds.map((fold) => fold.sourceId)).toEqual(["0", "1"]);

      const service = new ResearchReleaseCandidateService(repository, { FEATURE_RESEARCH_RELEASE_CANDIDATES: "true" } as never);
      const composed = await service.detail(scope, RUN);
      // A report alone cannot complete a producer: this seed deliberately
      // has no terminal head/checkpoint, so lifecycle stays FINISHING.
      expect(composed).toMatchObject({ run_status: "FINISHING", report_sealed: true });
      expect(composed.availability).toEqual({ state: "AVAILABLE", reason_code: null });
      expect(composed.pack_counts).toEqual({ complete: 8, degraded: 2, input: 2, missing: 0 });
      expect(Object.fromEntries(composed.fields.map((item) => [item.key, item.value]))).toMatchObject({
        final_audit_run_id: RUN,
        manifest_digest: provenance.source_manifest_digest,
        evidence_revision: "rs02_evidence_" + seeded.sealDigest,
        parameter_bundle_digest: preview.progress.claim.handoff_cursor.params_digest,
        report_revision: "p18r1_" + seeded.coreDigest,
      });

      const patched = await service.patchDraft(scope, RUN, {
        expected_revision: 0, expected_source_fingerprint: composed.source_fingerprint,
        known_limitations: "Selection saw the outer test windows; no untouched holdout.",
        proposed_use_restrictions: "Research and Paper evaluation only.",
      });
      expect(patched.actions).toMatchObject({ may_seal: true, seal_blocked_reason: null });
      const sealed = await service.seal(scope, RUN, {
        draft_id: patched.draft.draft_id!, expected_draft_revision: patched.draft.revision, expected_source_fingerprint: patched.source_fingerprint,
      });
      expect(sealed).toMatchObject({ delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED" });
      const after = await service.detail(scope, RUN);
      expect(after.local_seal).toMatchObject({ state: "SEALED_LOCAL", release_candidate_id: sealed.release_candidate_id, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED" });
      // X1: publication intake is its own flag; dark by default, the seal alone does not open it.
      expect(after.actions.publish).toEqual({ enabled: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" });
      expect(after.source_absences.approval_mirror).toEqual({ state: "NOT_PUBLISHED", reason_code: "P22_NOT_PUBLISHED" });
      expect(after.published_comparison).toEqual({ last_release_candidate_id: null, availability: { state: "NOT_PUBLISHED", reason_code: "P22_NO_PUBLISHED_PREDECESSOR" } });
      const intakeOpen = new ResearchReleaseCandidateService(repository, {
        FEATURE_RESEARCH_RELEASE_CANDIDATES: "true", FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION: "true",
      } as never);
      expect((await intakeOpen.detail(scope, RUN)).actions.publish).toEqual({ enabled: true, blocked_reason: null });
      // B2 read under the runtime role: a recorded intent for this candidate is printed as such (reconcilable with intake dark).
      await database.query(`INSERT INTO research.release_candidate_publications_v1
        (workspace_id, release_candidate_id, run_id, alpha_id, alpha_version_id, actor_user_id, actor_username,
         request_key, payload_digest, request_payload, pack_digest, source_fingerprint, legacy_artifact_sha256,
         artifact_schema_version, methodology_claim_id)
        VALUES ($1, $2, $3, $4, $5, $6, 'researcher', $7, $8, '{}'::jsonb, $9, $10, $11, 'quantbt.selected-params.v1', 'claim:w7')`,
      [W, sealed.release_candidate_id, RUN, ALPHA, VERSION, U, "rcpub:" + sealed.release_candidate_id, hex("payload"),
        sealed.pack_digest, after.source_fingerprint, "sha256:" + hex("legacy")]);
      const pending = await service.detail(scope, RUN);
      expect(pending.source_absences.approval_mirror).toEqual({ state: "NOT_PUBLISHED", reason_code: "P22_PUBLICATION_PENDING" });
      expect(pending.actions.publish).toEqual({ enabled: true, blocked_reason: null });
      const pack = await service.pack(scope, sealed.release_candidate_id);
      expect(pack.frozen_core.pack.filter((item) => item.status === "MISSING")).toEqual([]);

      const pins = await database.query(
        "SELECT pin_kind, source_ref, source_digest FROM research.release_candidate_retention_pins_v1 WHERE workspace_id = $1 ORDER BY pin_kind, source_ref", [W]);
      // The immutable seal/import and frozen Report stay pinned unchanged;
      // Search/Split read refs additionally identify the W1 display revision.
      const presentedReadDigest = sha({ seal_digest: seeded.sealDigest, presentation_revision: "W1_SELECTED_TRIAL_ORDINAL_V1" });
      expect(pins.rows).toEqual([
        { pin_kind: "ALPHA_VERSION", source_ref: VERSION, source_digest: hex("alpha-code") },
        { pin_kind: "ARTIFACT", source_ref: ARTIFACT, source_digest: provenance.source_manifest_digest },
        { pin_kind: "CURRENT_SOURCE", source_ref: "artifact-revision-1", source_digest: seeded.importDigest },
        { pin_kind: "EVIDENCE", source_ref: "rs02_evidence_" + seeded.sealDigest, source_digest: seeded.sealDigest },
        { pin_kind: "REPORT", source_ref: "p18r1_" + seeded.coreDigest, source_digest: seeded.coreDigest },
        { pin_kind: "RUN", source_ref: RUN, source_digest: provenance.effective_spec_digest },
        { pin_kind: "SELECTION", source_ref: "rs02_search_" + presentedReadDigest, source_digest: preview.progress.claim.handoff_cursor.params_digest },
        { pin_kind: "SPLIT", source_ref: "rs02_split_" + presentedReadDigest, source_digest: seeded.sealDigest },
      ]);
      const candidate = await database.query("SELECT selection_id, final_audit_run_id FROM research.release_candidates WHERE workspace_id = $1", [W]);
      expect(candidate.rows).toEqual([{ selection_id: null, final_audit_run_id: RUN }]);

      // A batch receipt added behind the seal (triggers bypassed, as tampering would) fails the next composition closed.
      await database.query("ALTER TABLE research.current_source_import_batches_v1 DISABLE TRIGGER USER");
      await database.query(`INSERT INTO research.current_source_import_batches_v1
        (workspace_id, run_id, artifact_revision, manifest_digest, source_transform_digest, table_kind, batch_ordinal, batch_digest, row_count)
        VALUES ($1, $2, 1, $3, $4, 'TRIAL', 0, $5, 3)`, [W, RUN, provenance.source_manifest_digest, provenance.source_transform_digest, hex("late-batch")]);
      await database.query("ALTER TABLE research.current_source_import_batches_v1 ENABLE TRIGGER USER");
      const drifted = await service.detail(scope, RUN);
      expect(drifted.availability).toEqual({ state: "PARTIAL", reason_code: "P21_REFERENCED_SOURCE_INTEGRITY_FAILED" });
      expect(releaseCandidateSourceFingerprint((await repository.snapshot(scope, RUN))!)).not.toBe(after.source_fingerprint);
    } finally {
      await database.end();
    }
  });
});
