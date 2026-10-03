import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  releaseCandidateSourceFingerprint,
  ResearchReleaseCandidateRepository,
} from "../src/research/release-candidate.repository";
import { canonicalResearchJson } from "../src/research/preflight.service";
import { migrateTestDatabase } from "./harness";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const databaseName = `portal_p21_${randomUUID().replaceAll("-", "")}`;
const sha = (value: unknown) => createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
const digest = (label: string) => createHash("sha256").update(label, "utf8").digest("hex");

function databaseUrlFor(name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function seed(database: Pool): Promise<{ workspaceId: string; actorUserId: string; runId: string }> {
  const workspaceId = "ws_p21";
  const actorUserId = "usr_p21";
  const alphaId = "alpha_p21";
  const alphaVersionId = "av_p21";
  const attemptId = "att_p21";
  const runId = "run_p21";
  await database.query(`INSERT INTO portal_users
    (user_id, username, display_name, role, status, must_change_password)
    VALUES ($1, 'p21-owner', 'P21 owner', 'ADMIN', 'ACTIVE', false)`, [actorUserId]);
  await database.query(`INSERT INTO workspaces (workspace_id, name, owner_user_id)
    VALUES ($1, 'P21 disposable workspace', $2)`, [workspaceId, actorUserId]);
  await database.query(`INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES ($1, $2, 'OWNER')`, [workspaceId, actorUserId]);
  await database.query(`INSERT INTO research.alphas
    (workspace_id, alpha_id, name, owner_user_id, execution_subject_id)
    VALUES ($1, $2, 'P21 Alpha', $3, 'research.p21')`, [workspaceId, alphaId, actorUserId]);
  await database.query(`INSERT INTO research.alpha_versions
    (workspace_id, alpha_version_id, alpha_id, code_digest, entrypoint,
     dependency_ref, declared_contract, lifecycle_state, registered_by_user_id)
    VALUES ($1, $2, $3, $4, 'strategy:p21', 'quantbt@1.1.1',
            '{"execution":{"execution_route":"signal_notional"}}'::jsonb, 'ACTIVE', $5)`,
  [workspaceId, alphaVersionId, alphaId, digest("alpha"), actorUserId]);
  await database.query(`INSERT INTO research.attempts
    (workspace_id, attempt_id, alpha_version_id, client_intent_id,
     request_payload_digest, intent_kind, state, created_by_user_id)
    VALUES ($1, $2, $3, 'intent-p21', $4, 'NEW', 'READY', $5)`,
  [workspaceId, attemptId, alphaVersionId, digest("request"), actorUserId]);
  await database.query(`INSERT INTO research.runs
    (workspace_id, run_id, attempt_id, run_kind, relationship_kind,
     logical_run_key, request_spec_digest, effective_spec_digest,
     engine_release_id, dataset_binding_digest, state, submitted_by_user_id)
    VALUES ($1, $2, $3, 'PRIMARY', 'PRIMARY', 'p21-primary',
            $4, $5, 'quantbt-1.1.1', $6, 'READY', $7)`,
  [workspaceId, runId, attemptId, digest("request"), digest("effective"), digest("dataset"), actorUserId]);
  return { workspaceId, actorUserId, runId };
}

describe("P21 disposable PostgreSQL immutable Release Candidate proof", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`CREATE DATABASE ${databaseName}`); } finally { await admin.end(); }
    await migrateTestDatabase(databaseUrlFor(databaseName));
  });

  afterAll(async () => {
    const admin = new Pool({ connectionString: databaseUrlFor("postgres") });
    try { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); } finally { await admin.end(); }
  });

  it("P21-T05/T07/T13 installs CAS drafts, immutable packs/pins, and a delivery plane that runtime cannot mutate", async () => {
    const database = new Pool({ connectionString: databaseUrlFor(databaseName) });
    try {
      const shape = await database.query<{
        drafts: boolean; packs: boolean; delivery: boolean; pins: boolean;
        draft_guard: boolean; pack_guard: boolean; delivery_guard: boolean; pin_guard: boolean;
        runtime_insert_draft: boolean; runtime_update_draft: boolean; runtime_insert_pack: boolean;
        runtime_insert_delivery: boolean; runtime_update_delivery: boolean; runtime_insert_pin: boolean;
      }>(`
        SELECT
          to_regclass('research.release_candidate_drafts_v1') IS NOT NULL AS drafts,
          to_regclass('research.release_candidate_packs_v1') IS NOT NULL AS packs,
          to_regclass('research.release_candidate_delivery_states_v1') IS NOT NULL AS delivery,
          to_regclass('research.release_candidate_retention_pins_v1') IS NOT NULL AS pins,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'research_release_candidate_drafts_v1_guard' AND NOT tgisinternal) AS draft_guard,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'research_release_candidate_packs_v1_immutable_guard' AND NOT tgisinternal) AS pack_guard,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'research_release_candidate_delivery_states_v1_guard' AND NOT tgisinternal) AS delivery_guard,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'research_release_candidate_retention_pins_v1_immutable_guard' AND NOT tgisinternal) AS pin_guard,
          has_table_privilege('portal_research_runtime', 'research.release_candidate_drafts_v1', 'INSERT') AS runtime_insert_draft,
          has_column_privilege('portal_research_runtime', 'research.release_candidate_drafts_v1', 'known_limitations', 'UPDATE') AS runtime_update_draft,
          has_table_privilege('portal_research_runtime', 'research.release_candidate_packs_v1', 'INSERT') AS runtime_insert_pack,
          has_table_privilege('portal_research_runtime', 'research.release_candidate_delivery_states_v1', 'INSERT') AS runtime_insert_delivery,
          has_table_privilege('portal_research_runtime', 'research.release_candidate_delivery_states_v1', 'UPDATE') AS runtime_update_delivery,
          has_table_privilege('portal_research_runtime', 'research.release_candidate_retention_pins_v1', 'INSERT') AS runtime_insert_pin
      `);
      expect(shape.rows[0]).toEqual({
        drafts: true, packs: true, delivery: true, pins: true,
        draft_guard: true, pack_guard: true, delivery_guard: true, pin_guard: true,
        runtime_insert_draft: true, runtime_update_draft: true, runtime_insert_pack: true,
        runtime_insert_delivery: true, runtime_update_delivery: false, runtime_insert_pin: true,
      });

      const scope = await seed(database);
      const repository = new ResearchReleaseCandidateRepository(database);
      const source = await repository.snapshot(scope, scope.runId);
      expect(source).not.toBeNull();
      const sourceFingerprint = releaseCandidateSourceFingerprint(source!);

      const draft = await repository.patchDraft(scope, scope.runId, {
        expectedRevision: 0,
        expectedSourceFingerprint: sourceFingerprint,
        knownLimitations: "P21 migration fixture limitation.",
        proposedUseRestrictions: "Research-only fixture restriction.",
      });
      await expect(repository.patchDraft(scope, scope.runId, {
        expectedRevision: 0,
        expectedSourceFingerprint: sourceFingerprint,
        knownLimitations: "Stale retry must not overwrite.",
        proposedUseRestrictions: null,
      })).rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_CONFLICT", status: 409 });

      const build = (_source: NonNullable<typeof source>, _draft: typeof draft.draft, releaseCandidateId: string) => {
        const frozenCore = {
          fields: [{ key: "release_candidate_id", value: releaseCandidateId }],
          pack: [{ key: "fixture" }],
          source_fingerprint: sourceFingerprint,
          draft: {
            known_limitations: _draft.knownLimitations,
            proposed_use_restrictions: _draft.proposedUseRestrictions,
          },
        };
        return {
          frozenCore,
          packDigest: sha(frozenCore),
          pins: [{ pinKind: "RUN" as const, sourceRef: scope.runId, sourceDigest: _source.effectiveSpecDigest }],
        };
      };
      const first = await repository.seal(scope, scope.runId, {
        draftId: draft.draft.draftId!, expectedDraftRevision: draft.draft.revision, expectedSourceFingerprint: sourceFingerprint,
      }, build);
      const retry = await repository.seal(scope, scope.runId, {
        draftId: draft.draft.draftId!, expectedDraftRevision: draft.draft.revision, expectedSourceFingerprint: sourceFingerprint,
      }, build);
      expect(retry.releaseCandidateId).toBe(first.releaseCandidateId);
      expect(retry.packDigest).toBe(first.packDigest);

      const retained = await database.query<{
        packs: number; pins: number; delivery_state: string; approval_state: string;
      }>(`
        SELECT
          (SELECT count(*)::integer FROM research.release_candidate_packs_v1) AS packs,
          (SELECT count(*)::integer FROM research.release_candidate_retention_pins_v1) AS pins,
          (SELECT delivery_state FROM research.release_candidate_delivery_states_v1) AS delivery_state,
          (SELECT approval_state FROM research.release_candidate_delivery_states_v1) AS approval_state
      `);
      expect(retained.rows[0]).toEqual({ packs: 1, pins: 1, delivery_state: "NOT_DELIVERED", approval_state: "NOT_APPROVED" });

      // A subsequent mutable source-row change can make a new composition
      // ineligible, but it must never rewrite the already sealed local pack.
      await database.query(`UPDATE research.runs SET effective_spec_digest = $1
        WHERE workspace_id = $2 AND run_id = $3`, [digest("effective-after-seal"), scope.workspaceId, scope.runId]);
      const changedSource = await repository.snapshot(scope, scope.runId);
      expect(releaseCandidateSourceFingerprint(changedSource!)).not.toBe(sourceFingerprint);
      const frozen = await repository.readPack(scope, first.releaseCandidateId);
      expect(frozen).toMatchObject({
        releaseCandidateId: first.releaseCandidateId,
        packDigest: first.packDigest,
        sourceFingerprint,
        deliveryState: "NOT_DELIVERED",
        approvalState: "NOT_APPROVED",
      });
      const composition = await repository.readComposition(scope, scope.runId);
      expect(releaseCandidateSourceFingerprint(composition!.source))
        .toBe(releaseCandidateSourceFingerprint(changedSource!));
      expect(composition!.draft).toEqual(await repository.draft(scope, scope.runId));
      expect(composition!.latestPack).toEqual(await repository.latestPack(scope, scope.runId));
      expect(composition!.publicationContext).toEqual(await repository.publicationContext(scope, {
        alphaId: changedSource!.alpha.alphaId, releaseCandidateId: first.releaseCandidateId,
      }));

      await expect(database.query(`UPDATE research.release_candidate_packs_v1
        SET pack_digest = $1 WHERE workspace_id = $2 AND release_candidate_id = $3`,
      [digest("mutated"), scope.workspaceId, first.releaseCandidateId]))
        .rejects.toMatchObject({ code: "55000" });
      await expect(database.query(`DELETE FROM research.release_candidate_drafts_v1
        WHERE workspace_id = $1 AND run_id = $2 AND actor_user_id = $3`,
      [scope.workspaceId, scope.runId, scope.actorUserId]))
        .rejects.toMatchObject({ code: "55000" });
    } finally {
      await database.end();
    }
  });
});
