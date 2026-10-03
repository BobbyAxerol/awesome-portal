import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrateTestDatabase } from "./harness";
import { ResearchLineageRepository } from "../src/research/lineage.repository";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = "portal_p22_settle_" + randomUUID().replaceAll("-", "");
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = "/" + name;
  return url.toString();
};

describe("P22 approval-version settlement on disposable PostgreSQL", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query("CREATE DATABASE " + databaseName); } finally { await admin.end(); }
    await migrateTestDatabase(urlFor(databaseName));
  });
  afterAll(async () => {
    const admin = new Pool({ connectionString: urlFor("postgres") });
    try { await admin.query("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)"); } finally { await admin.end(); }
  });

  it("OL-03 appends one exact settlement and writes P19 only after R1 approval", async () => {
    const database = new Pool({ connectionString: urlFor(databaseName) });
    try {
      await database.query(`
        SET session_replication_role = replica;
        INSERT INTO portal_users
          (user_id, username, display_name, role, status, must_change_password)
        VALUES ('usr_p22_settle', 'p22-settle', 'P22 settle', 'ADMIN', 'ACTIVE', false),
               ('usr_p22_reviewer', 'p22-reviewer', 'P22 reviewer', 'ADMIN', 'ACTIVE', false);
        INSERT INTO workspaces (workspace_id, name, owner_user_id)
          VALUES ('ws_p22_settle', 'P22 settlement workspace', 'usr_p22_settle');
        INSERT INTO workspace_members (workspace_id, user_id, role)
          VALUES ('ws_p22_settle', 'usr_p22_settle', 'OWNER'),
                 ('ws_p22_settle', 'usr_p22_reviewer', 'MEMBER');
        INSERT INTO research.alphas
          (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
          VALUES ('ws_p22_settle', 'alpha_p22_settle', 'P22 Alpha',
                  'usr_p22_settle', 'research.p22.settle');
        INSERT INTO research.alpha_versions
          (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint,
           dependency_ref, declared_contract, lifecycle_state, registered_by_user_id)
          VALUES ('ws_p22_settle', 'av_p22_settle', 'alpha_p22_settle', repeat('a',64),
            'strategy:p22', 'quantbt@1.1.1',
            '{"execution":{"execution_route":"signal_notional"}}', 'ACTIVE', 'usr_p22_settle');
        INSERT INTO research.attempts
          (workspace_id, attempt_id, alpha_version_id, client_intent_id,
           request_payload_digest, intent_kind, state, created_by_user_id)
          VALUES ('ws_p22_settle', 'att_p22_settle', 'av_p22_settle',
            'intent-p22-settle', repeat('a',64), 'NEW', 'READY', 'usr_p22_settle');
        INSERT INTO research.runs
          (workspace_id, run_id, attempt_id, run_kind, relationship_kind,
           logical_run_key, parent_run_id, request_spec_digest, effective_spec_digest,
           engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
          VALUES
            ('ws_p22_settle', 'run_p22_parent', 'att_p22_settle', 'PRIMARY', 'PRIMARY',
             'p22-parent', NULL, repeat('a',64), repeat('a',64), 'quantbt-1.1.1',
             repeat('a',64), 'READY', 'usr_p22_settle'),
            ('ws_p22_settle', 'rrun_p22_audit', 'att_p22_settle', 'AUDIT', 'AUDIT_OF_SELECTION',
             'p22-audit', 'run_p22_parent', repeat('a',64), repeat('a',64), 'quantbt-1.1.1',
             repeat('a',64), 'READY', 'usr_p22_settle');
        INSERT INTO research.release_candidates
          (workspace_id, release_candidate_id, run_id, final_audit_run_id,
           manifest_digest, schema_version, lifecycle_state)
          VALUES ('ws_p22_settle', 'rc_00000000000000000000000000', 'rrun_p22_audit',
            'rrun_p22_audit', repeat('a',64), 'research.release-candidate.v1', 'SEALED');
        INSERT INTO research.release_candidate_drafts_v1
          (workspace_id, run_id, actor_user_id, draft_id, source_fingerprint, known_limitations)
          VALUES ('ws_p22_settle', 'rrun_p22_audit', 'usr_p22_settle',
            'rcd_AAAAAAAAAAAAAAAAAAAAAAAAAA', repeat('b',64), 'Research only');
        INSERT INTO research.release_candidate_packs_v1
          (workspace_id, release_candidate_id, run_id, draft_id, pack_digest,
           source_fingerprint, schema_version, frozen_core, sealed_by_user_id)
          VALUES ('ws_p22_settle', 'rc_00000000000000000000000000', 'rrun_p22_audit',
            'rcd_AAAAAAAAAAAAAAAAAAAAAAAAAA', repeat('a',64), repeat('b',64),
            'research.release-candidate-pack.v1',
            '{"fields":[{"key":"final_audit_run_id","value":"rrun_p22_audit","availability":{"state":"AVAILABLE"}}],"pack":[{"key":"FINAL_AUDIT_REPLAY","status":"COMPLETE","availability":{"state":"AVAILABLE"}}]}'::jsonb,
            'usr_p22_settle');
        INSERT INTO governance_approval_requests
          (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
           environment, target_label, requester_user_id, requester_username,
           artifact_creator_user_id, artifact_creator_username, status, policy_version,
           quorum_required, evidence_set_hash, evidence_complete, blocker_count,
           sla_due_at, expires_at)
          VALUES ('apr_p22_settle', 'ws_p22_settle', 'R1', 'ALPHA_VERSION',
            'alpha_p22_settle', 'P22 Alpha', 'RESEARCH', 'Paper',
            'usr_p22_settle', 'p22-settle', 'usr_p22_settle', 'p22-settle',
            'PENDING', 'p22.v1', 1, 'sha256:'||repeat('c',64), true, 0,
            now()+interval '1 day', now()+interval '2 days');
        INSERT INTO research.release_candidate_delivery_states_v1
          (workspace_id, release_candidate_id, delivery_state, approval_state,
           downstream_receipt_digest, downstream_updated_at, approval_id)
          VALUES ('ws_p22_settle', 'rc_00000000000000000000000000',
            'DELIVERED', 'PENDING', repeat('b',64), now(), 'apr_p22_settle');
        INSERT INTO research.release_candidate_publications_v1
          (workspace_id, release_candidate_id, run_id, alpha_id, alpha_version_id,
           actor_user_id, actor_username, request_key, payload_digest, request_payload,
           pack_digest, source_fingerprint, legacy_artifact_sha256, artifact_schema_version,
           methodology_claim_id, state, approval_id, evidence_set_hash, receipt_digest,
           receipt_json, published_at)
          VALUES ('ws_p22_settle', 'rc_00000000000000000000000000', 'rrun_p22_audit',
            'alpha_p22_settle', 'av_p22_settle', 'usr_p22_settle', 'p22-settle',
            'rcpub:p22-settle', repeat('a',64), '{}'::jsonb, repeat('a',64),
            repeat('b',64), 'sha256:'||repeat('b',64), 'quantbt.selected-params.v1',
            'claim:oos', 'DELIVERED', 'apr_p22_settle', 'sha256:'||repeat('c',64),
            repeat('b',64), '{}'::jsonb, now());
        SET session_replication_role = origin;
      `);

      // This settlement fixture uses sealed same-run replay authority.
      // AUDIT_OF_SELECTION is a relationship label, not a verified-child
      // proof; the pinned-audit migration suite covers that refusal separately.
      expect((await database.query(`SELECT research.p22_final_audit_source_eligible(
        'ws_p22_settle','rc_00000000000000000000000000','rrun_p22_audit') AS eligible`))
        .rows[0].eligible).toBe(true);
      await database.query(`SELECT research.p22_record_promotion_pick(
        'ws_p22_settle','rc_00000000000000000000000000','apr_p22_settle',
        'av_p22_settle','att_p22_settle','rrun_p22_audit',NULL,NULL,'[]'::jsonb,
        NULL,NULL,repeat('a',64),'sha256:'||repeat('c',64),'PENDING',
        repeat('c',64),'usr_p22_settle')`);
      expect((await database.query(`SELECT count(*)::integer AS n
        FROM research.attempt_promotion_pick_facts_v1
        WHERE workspace_id='ws_p22_settle'`)).rows[0].n).toBe(0);

      await database.query(`UPDATE governance_approval_requests
        SET status='APPROVED', quorum_met=1, approval_version=2,
            decided_at=now(), decided_by_user_id='usr_p22_reviewer', updated_at=now()
        WHERE workspace_id='ws_p22_settle' AND approval_id='apr_p22_settle'`);

      const settled = await database.query(`SELECT
        (SELECT count(*)::integer FROM research.p22_approval_settlements_v1
          WHERE workspace_id='ws_p22_settle') AS settlements,
        (SELECT approval_status FROM research.p22_approval_settlements_v1
          WHERE workspace_id='ws_p22_settle' ORDER BY approval_version DESC LIMIT 1) AS approval_status,
        (SELECT approval_version FROM research.p22_approval_settlements_v1
          WHERE workspace_id='ws_p22_settle' ORDER BY approval_version DESC LIMIT 1) AS approval_version,
        (SELECT approval_state FROM research.release_candidate_delivery_states_v1
          WHERE workspace_id='ws_p22_settle') AS delivery_approval,
        (SELECT count(*)::integer FROM research.attempt_promotion_pick_facts_v1
          WHERE workspace_id='ws_p22_settle' AND alpha_version_id='av_p22_settle') AS p19_facts`);
      expect(settled.rows[0]).toEqual({
        settlements: 2, approval_status: "APPROVED", approval_version: 2,
        delivery_approval: "APPROVED", p19_facts: 1,
      });
      const lineage = await new ResearchLineageRepository(database).read(
        { workspaceId: "ws_p22_settle", actorUserId: "usr_p22_settle" },
        "alpha_p22_settle", 128,
      );
      expect(lineage?.versions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          alpha_version_id: "av_p22_settle",
          promotion_receipt_count: 1,
          promotion_selected_trial_id: null,
          promotion_selected_params_digest: null,
        }),
      ]));
      await expect(database.query(`UPDATE research.p22_approval_settlements_v1
        SET approval_status='DENIED' WHERE workspace_id='ws_p22_settle'`))
        .rejects.toMatchObject({ code: "55000" });
    } finally {
      await database.end();
    }
  });
});
