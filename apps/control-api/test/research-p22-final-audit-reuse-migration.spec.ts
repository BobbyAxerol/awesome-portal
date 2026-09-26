import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ResearchReleaseCandidatePublicationRepository } from "../src/research/release-candidate-publication.repository";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = "portal_p22_reuse_" + randomUUID().replaceAll("-", "");
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = "/" + name;
  return url.toString();
};

describe("P22 retained same-run final-audit reuse on disposable PostgreSQL", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query("CREATE DATABASE " + databaseName); } finally { await admin.end(); }
    await migrateTestDatabase(urlFor(databaseName));
  });
  afterAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)"); } finally { await admin.end(); }
  });

  it("accepts only a READY rrun_ whose immutable pack proves same-run replay reuse", async () => {
    const database = new Pool({ connectionString: urlFor(databaseName) });
    try {
      await database.query(`
        SET session_replication_role = replica;
        INSERT INTO portal_users
          (user_id, username, display_name, role, status, must_change_password)
        VALUES ('usr_p22_reuse', 'p22-reuse', 'P22 reuse', 'ADMIN', 'ACTIVE', false);
        INSERT INTO workspaces (workspace_id, name, owner_user_id)
        VALUES ('ws_p22_reuse', 'P22 reuse workspace', 'usr_p22_reuse');
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ('ws_p22_reuse', 'usr_p22_reuse', 'OWNER');
        INSERT INTO research.attempts
          (workspace_id, attempt_id, client_intent_id, request_payload_digest,
           intent_kind, state, created_by_user_id)
        VALUES ('ws_p22_reuse', 'att_p22_reuse', 'intent-p22-reuse',
          repeat('a',64), 'NEW', 'READY', 'usr_p22_reuse');
        INSERT INTO research.runs
          (workspace_id, run_id, attempt_id, run_kind, relationship_kind,
           logical_run_key, request_spec_digest, effective_spec_digest,
           engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
        VALUES
          ('ws_p22_reuse', 'rrun_p22_reuse', 'att_p22_reuse', 'PRIMARY', 'PRIMARY',
           'p22-reuse', repeat('a',64), repeat('a',64), 'er_quantbt_111',
           repeat('b',64), 'READY', 'usr_p22_reuse'),
          ('ws_p22_reuse', 'rrun_p22_unproven', 'att_p22_reuse', 'PRIMARY', 'PRIMARY',
           'p22-unproven', repeat('a',64), repeat('a',64), 'er_quantbt_111',
           repeat('b',64), 'READY', 'usr_p22_reuse');
        INSERT INTO research.artifacts
          (workspace_id, artifact_id, run_id, table_kind, schema_version, manifest_digest,
           state, retention_class, storage_locator)
        VALUES ('ws_p22_reuse', 'rart_p22_reuse', 'rrun_p22_reuse', 'research_bundle',
          'research.artifact-manifest.v1', repeat('c',64), 'SEALED',
          'RESEARCH_EVIDENCE', 'artifacts/rart_p22_reuse');
        INSERT INTO research.release_candidates
          (workspace_id, release_candidate_id, run_id, final_audit_run_id,
           manifest_digest, schema_version, lifecycle_state)
        VALUES ('ws_p22_reuse', 'rc_11111111111111111111111111',
          'rrun_p22_reuse', 'rrun_p22_reuse', repeat('c',64),
          'research.release-candidate.v1', 'SEALED');
        INSERT INTO research.release_candidate_drafts_v1
          (workspace_id, run_id, actor_user_id, draft_id, source_fingerprint,
           known_limitations, proposed_use_restrictions)
        VALUES ('ws_p22_reuse', 'rrun_p22_reuse', 'usr_p22_reuse',
          'rcd_BBBBBBBBBBBBBBBBBBBBBBBBBB', repeat('d',64),
          'Research only', 'Paper first');
        INSERT INTO research.release_candidate_packs_v1
          (workspace_id, release_candidate_id, run_id, draft_id, pack_digest,
           source_fingerprint, schema_version, frozen_core, sealed_by_user_id)
        VALUES ('ws_p22_reuse', 'rc_11111111111111111111111111',
          'rrun_p22_reuse', 'rcd_BBBBBBBBBBBBBBBBBBBBBBBBBB',
          repeat('c',64), repeat('d',64), 'research.release-candidate-pack.v1',
          jsonb_build_object(
            'fields', jsonb_build_array(jsonb_build_object(
              'key','final_audit_run_id','value','rrun_p22_reuse',
              'availability',jsonb_build_object('state','AVAILABLE','reason_code',NULL)
            )),
            'pack', jsonb_build_array(jsonb_build_object(
              'key','FINAL_AUDIT_REPLAY','status','COMPLETE',
              'availability',jsonb_build_object('state','AVAILABLE','reason_code',NULL)
            ))
          ), 'usr_p22_reuse');
        SET session_replication_role = origin;
      `);

      const eligible = await database.query(`SELECT
        research.p22_final_audit_source_eligible(
          'ws_p22_reuse','rc_11111111111111111111111111','rrun_p22_reuse'
        ) AS reuse,
        research.p22_final_audit_source_eligible(
          'ws_p22_reuse','rc_11111111111111111111111111','rrun_p22_unproven'
        ) AS unproven,
        has_function_privilege(
          'portal_research_runtime',
          'research.p22_final_audit_source_eligible(text,text,text)',
          'EXECUTE'
        ) AS runtime_execute,
        has_function_privilege(
          'portal_research_runtime',
          'research.p22_record_run_read_model_bridge(text,text,text,text,text,text,text,text,text,text,text,text[],text,text,text,text)',
          'EXECUTE'
        ) AS bridge_writer_execute`);
      expect(eligible.rows[0]).toEqual({ reuse: true, unproven: false, runtime_execute: true, bridge_writer_execute: true });

      await database.query(`BEGIN; SET LOCAL ROLE portal_research_runtime;
        SELECT research.p22_record_run_read_model_bridge(
          'ws_p22_reuse','rc_11111111111111111111111111','rrun_p22_reuse','COMPLETED',
          'RESEARCH_P22_FINAL_AUDIT','alpha_p22_reuse',repeat('b',64),NULL,
          'sha256:'||repeat('c',64),'research.artifact-manifest.v1',
          'usr_p22_reuse',ARRAY['claim:p22:reuse'],repeat('c',64),repeat('d',64),
          repeat('e',64),'usr_p22_reuse'
        ); COMMIT;`);
      const readModel = await database.query(`SELECT run_id, workspace_id, status,
        protocol, artifact_sha256, methodology_claim_ids
        FROM run_read_models WHERE run_id='rrun_p22_reuse'`);
      expect(readModel.rows[0]).toEqual({
        run_id: "rrun_p22_reuse",
        workspace_id: "ws_p22_reuse",
        status: "COMPLETED",
        protocol: "RESEARCH_P22_FINAL_AUDIT",
        artifact_sha256: "sha256:" + "c".repeat(64),
        methodology_claim_ids: ["claim:p22:reuse"],
      });
      const bridge = await database.query(`SELECT release_candidate_id, source_pack_digest,
        source_fingerprint, artifact_sha256, methodology_claim_ids, materialization_digest
        FROM research.p22_run_read_model_bridges_v1 WHERE workspace_id='ws_p22_reuse'`);
      expect(bridge.rows[0]).toEqual({
        release_candidate_id: "rc_11111111111111111111111111",
        source_pack_digest: "c".repeat(64), source_fingerprint: "d".repeat(64),
        artifact_sha256: "sha256:" + "c".repeat(64),
        methodology_claim_ids: ["claim:p22:reuse"], materialization_digest: "e".repeat(64),
      });
      const publicationRepository = new ResearchReleaseCandidatePublicationRepository(database);
      const begun = await publicationRepository.begin(
        { workspaceId: "ws_p22_reuse", actorUserId: "usr_p22_reuse" },
        {
          releaseCandidateId: "rc_11111111111111111111111111", runId: "rrun_p22_reuse",
          alphaId: "alpha_p22_reuse", alphaVersionId: "av_p22_reuse", actorUsername: "p22-reuse",
          requestKey: "p22:runtime:begin", payloadDigest: "f".repeat(64), requestPayload: {},
          packDigest: "c".repeat(64), sourceFingerprint: "d".repeat(64),
          legacyArtifactSha256: "sha256:" + "c".repeat(64),
          artifactSchemaVersion: "research.artifact-manifest.v1", methodologyClaimId: "claim:p22:reuse",
        },
      );
      expect(begun).toMatchObject({ replayed: false, intent: { state: "PENDING", requestKey: "p22:runtime:begin" } });
      await expect(database.query(`SELECT research.p22_materialize_run_read_model(
        'ws_p22_reuse','rrun_p22_unproven','COMPLETED',
        'RESEARCH_P22_FINAL_AUDIT','alpha_p22_reuse',repeat('b',64),NULL,
        'sha256:'||repeat('c',64),'research.artifact-manifest.v1',
        'usr_p22_reuse',ARRAY['claim:p22:reuse']
      )`)).rejects.toMatchObject({ code: "23514" });
    } finally {
      await database.end();
    }
  });
});
