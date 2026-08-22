import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { EvidenceRecord } from "../src/governance/governance.repository";
import { computeEvidenceManifestHash } from "../src/governance/governance.service";
import { PaperExitRepository } from "../src/governance/paper-exit.repository";
import {
  computePaperExitSourceSnapshotHash,
  evaluatePaperExit,
} from "../src/governance/paper-exit.service";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const HASHES = ["a", "b", "c", "d"].map((value) => `sha256:${value.repeat(64)}`);

interface Actor {
  userId: string;
  username: string;
  cookie: string;
  csrf: string;
}

function cookies(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0]).join("; ");
}

function csrfCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const values = Array.isArray(raw) ? raw : [raw];
  const value = values.find((item): item is string =>
    typeof item === "string" && item.startsWith("__Host-portal_csrf="));
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1];
}

describe("PRE-IAM-02 Paper Exit Review", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let reviewer: Actor;
  let owner: Actor;
  let member: Actor;
  let workspaceId: string;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    ctx = await setupApp({ AUTH_MODE: "dev" });
    auth = new AuthService(
      ctx.pool,
      ctx.config,
      new Argon2CredentialService({
        memoryKib: ctx.config.ARGON2_MEMORY_KIB,
        iterations: ctx.config.ARGON2_ITERATIONS,
        parallelism: ctx.config.ARGON2_PARALLELISM,
      }),
    );
    admin = new AdminService(ctx.pool, ctx.config, auth);
    reviewer = await createActor("paperreviewer", "ADMIN");
    owner = await createActor("paperowner", "ADMIN");
    member = await createActor("papermember", "USER");
    const workspaces = await inject(reviewer, "/api/workspaces");
    workspaceId = workspaces.json().workspaces[0].workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'MEMBER'), ($1, $3, 'MEMBER')`,
      [workspaceId, owner.userId, member.userId],
    );
  }, 30_000);

  afterAll(async () => teardownApp(ctx));

  beforeEach(async () => {
    await ctx.pool.query(
      `TRUNCATE governance_approval_requests, outbox_messages, product_audit_events CASCADE`,
    );
  });

  async function rawInject(url: string, options: Record<string, unknown> = {}) {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) headers["x-dev-access-email"] = "dev@azdag.com";
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url, ...options, headers });
  }

  async function inject(actor: Actor, url: string, options: Record<string, unknown> = {}) {
    return rawInject(url, {
      ...options,
      headers: {
        cookie: actor.cookie,
        "x-dev-access-email": `${actor.username}@azdag.com`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  }

  async function mutation(actor: Actor, url: string, payload: unknown, headers: Record<string, string> = {}) {
    return inject(actor, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-portal-csrf": actor.csrf,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        ...headers,
      },
      payload,
    });
  }

  async function createActor(username: string, role: "ADMIN" | "USER"): Promise<Actor> {
    await admin.createUser({ username, displayName: username, role });
    const user = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(user!.userId);
    const first = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const firstCsrf = csrfCookie(first);
    const password = `cedar-river-${username}-paper-exit-safe-2026`;
    const changed = await rawInject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(first), "x-portal-csrf": firstCsrf,
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: { current_password: activationToken, new_password: password },
    });
    expect(changed.statusCode).toBe(201);
    const final = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    expect(final.statusCode).toBe(201);
    return { userId: user!.userId, username, cookie: cookies(final), csrf: csrfCookie(final) };
  }

  async function seedExitReview(input: {
    reviewId: string;
    requester?: Actor;
    creator?: Actor;
    panelState?: "OK" | "PARTIAL" | "STALE" | "UNAVAILABLE" | "ERROR";
    omitPanel?: string;
    missingFindingSource?: boolean;
    blocking?: boolean;
    evidenceComplete?: boolean;
    quorumRequired?: number;
  }) {
    const requester = input.requester ?? owner;
    const creator = input.creator ?? owner;
    const capturedAt = new Date("2026-08-21T10:00:00.000Z");
    const evidence: EvidenceRecord[] = HASHES.map((sha256, index) => ({
      evidenceId: `${input.reviewId}-ev-${index + 1}`,
      ordinal: index,
      kind: ["OBSERVATION", "DRIFT", "LIMITS", "PORTFOLIO_FIT"][index],
      label: `paper evidence ${index + 1}`,
      displayValue: `snapshot ${index + 1}`,
      note: null,
      verification: "PASS",
      artifactId: `${input.reviewId}-artifact-${index + 1}`,
      sha256,
      sizeBytes: `${2048 + index}`,
      mediaType: "application/json",
      schemaVersion: "paper-exit-evidence.v1",
      sourceAuthority: ["EXECUTION", "DERIVED", "EXECUTION", "DERIVED"][index],
      sourceReference: `source-${index + 1}`,
      required: true,
      capturedAt,
      retentionClass: "GOVERNANCE_LONG_TERM",
      accessPolicy: "WORKSPACE_APPROVER",
    }));
    const evidenceSetHash = computeEvidenceManifestHash(evidence);
    await ctx.pool.query(
      `INSERT INTO governance_approval_requests
         (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
          environment, target_label, requester_user_id, requester_username,
          artifact_creator_user_id, artifact_creator_username, status, policy_version,
          quorum_required, evidence_set_hash, evidence_complete, blocker_count,
          sla_due_at, expires_at, created_at, updated_at)
       VALUES ($1, $2, 'PAPER_EXIT', 'EXIT_REVIEW', $3, $4, 'PAPER',
               'Sandbox validation', $5, $6, $7, $8, 'PENDING', 'paper-exit.v1',
               $9, $10, $11, 0, now() + interval '24 hours', now() + interval '72 hours',
               now() - interval '4 hours', now())`,
      [input.reviewId, workspaceId, `dep-${input.reviewId}`, `Grid v2.1 · ${input.reviewId}`,
        requester.userId, requester.username, creator.userId, creator.username,
        input.quorumRequired ?? 1, evidenceSetHash, input.evidenceComplete ?? true],
    );
    for (const item of evidence) {
      await ctx.pool.query(
        `INSERT INTO governance_approval_evidence
           (evidence_id, approval_id, ordinal, kind, label, display_value, note,
            verification, artifact_id, sha256, size_bytes, media_type, schema_version,
            source_authority, source_reference, required, captured_at, retention_class, access_policy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19)`,
        [item.evidenceId, input.reviewId, item.ordinal, item.kind, item.label,
          item.displayValue, item.note, item.verification, item.artifactId, item.sha256,
          item.sizeBytes, item.mediaType, item.schemaVersion, item.sourceAuthority,
          item.sourceReference, item.required, item.capturedAt, item.retentionClass, item.accessPolicy],
      );
    }
    const placeholder = `sha256:${"0".repeat(64)}`;
    await ctx.pool.query(
      `INSERT INTO governance_paper_exit_reviews
         (review_id, workspace_id, deployment_id, portfolio_id, venue, artifact_digest,
          r1_approval_id, r2_approval_id, observation_policy_id, observation_policy_version,
          observation_policy_digest, evidence_pack_id, evidence_pack_digest,
          evaluation_policy_version, evaluation_formula_version, source_snapshot_hash,
          observation_summary, recommendation)
       VALUES ($1, $2, $3, 'PF_MAIN', 'DERIBIT', $4, 'AP-118', 'AP-152',
               'obs_29', 'observation.v3', $5, 'ep_4471', $6,
               'paper-exit.v1', 'paper-exit-eval.v1', $7,
               '30 / 30 days · 312 / 300 trades · 2 / 2 restart cycles',
               'Approve promotion with carried slippage evidence.')`,
      [input.reviewId, workspaceId, `dep-${input.reviewId}`, HASHES[0], HASHES[1], HASHES[2], placeholder],
    );
    const lineage = [
      ["ARTIFACT", "artifact", HASHES[0], "/research/artifacts/artifact-1", HASHES[0], "RESEARCH"],
      ["R1_APPROVAL", "R1", "AP-118", "/governance/approvals/AP-118/r1", null, "PORTAL"],
      ["R2_APPROVAL", "R2", "AP-152", "/governance/approvals/AP-152/r2", null, "PORTAL"],
      ["OBSERVATION_POLICY", "observation policy", "obs_29", "/policies/obs_29", HASHES[1], "PORTAL"],
      ["EVIDENCE_PACK", "evidence pack", "ep_4471", "/evidence/ep_4471", HASHES[2], "DERIVED"],
    ];
    for (const [index, row] of lineage.entries()) {
      await ctx.pool.query(
        `INSERT INTO governance_paper_exit_lineage
           (lineage_id, review_id, ordinal, kind, label, value, href, digest, source_authority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [`${input.reviewId}-lineage-${index + 1}`, input.reviewId, index, ...row],
      );
    }
    const panelKinds = ["OBSERVATION_COVERAGE", "DRIFT", "LIMITS_HEALTH", "PORTFOLIO_FIT"];
    const panelTitles = ["Observation coverage", "Drift vs approved evidence", "Limits & operational health", "Portfolio fit — observed vs expected"];
    for (let index = 0; index < panelKinds.length; index += 1) {
      if (input.omitPanel === panelKinds[index]) continue;
      const panelState = index === 0 && input.panelState ? input.panelState : "OK";
      const freshness = panelState === "STALE" ? "STALE" : panelState === "OK" ? "OK" : "UNKNOWN";
      const reason = panelState === "OK" ? null : `${panelTitles[index]} is ${panelState.toLowerCase()}`;
      const panelId = `${input.reviewId}-panel-${index + 1}`;
      await ctx.pool.query(
        `INSERT INTO governance_paper_exit_panels
           (panel_id, review_id, ordinal, panel_kind, title, source_authority,
            source_reference, source_href, panel_state, reason, as_of,
            freshness_state, source_completeness, formula_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 'EVENT_SOURCED', 'paper-exit-eval.v1')`,
        [panelId, input.reviewId, index, panelKinds[index], panelTitles[index],
          index === 1 || index === 3 ? "DERIVED" : "EXECUTION", `source-${index + 1}`,
          `/sources/${index + 1}`, panelState, reason,
          panelState === "UNAVAILABLE" || panelState === "ERROR" ? null : capturedAt,
          freshness],
      );
      const blocking = input.blocking === true && index === 2;
      const insufficient = index === 1;
      await ctx.pool.query(
        `INSERT INTO governance_paper_exit_findings
           (finding_id, review_id, panel_id, ordinal, metric_key, label, outcome,
            blocking, required, carries_to, exact_value, unit, currency, threshold_value,
            source_label, source_href, evidence_hash, formula_version, as_of)
         VALUES ($1, $2, $3, 0, $4, $5, $6, $7, true, $8, $9, $10, $11, $12,
                 $13, $14, $15, 'paper-exit-eval.v1', $16)`,
        [`${input.reviewId}-finding-${index + 1}`, input.reviewId, panelId,
          `metric.${index + 1}`, blocking ? "max drawdown breached" : panelTitles[index],
          blocking ? "FAIL" : insufficient ? "INSUFFICIENT" : "PASS", blocking,
          insufficient ? "SANDBOX_CERTIFICATION" : null,
          index === 3 ? "1842.000000000000000001" : `${30 + index}`,
          index === 3 ? "CURRENCY" : "COUNT", index === 3 ? "USDC" : null,
          index === 2 ? "6.00" : null, input.missingFindingSource && index === 0 ? null : `source ${index + 1}`,
          input.missingFindingSource && index === 0 ? null : `/sources/${index + 1}`,
          input.missingFindingSource && index === 0 ? null : HASHES[index], capturedAt],
      );
    }
    const repository = new PaperExitRepository(ctx.pool);
    const snapshot = await repository.detail(workspaceId, input.reviewId);
    expect(snapshot).not.toBeNull();
    const sourceSnapshotHash = computePaperExitSourceSnapshotHash(snapshot!);
    await ctx.pool.query(
      `UPDATE governance_paper_exit_reviews SET source_snapshot_hash = $2 WHERE review_id = $1`,
      [input.reviewId, sourceSnapshotHash],
    );
    return { evidenceHashes: HASHES, evidenceSetHash, sourceSnapshotHash };
  }

  function planPayload(reviewId: string, decision: "PROMOTE" | "EXTEND_OBSERVATION" | "REJECT", overrides: Record<string, unknown> = {}) {
    return {
      schema_version: "governance.paper-exit-decision-plan-request.v1",
      workspace_id: workspaceId,
      request_key: `paper-exit:${reviewId}:${decision}`,
      command_type: "GOVERNANCE_PAPER_EXIT_DECISION",
      command_version: 1,
      target: { review_id: reviewId },
      expected_review_version: 1,
      payload: {
        decision,
        reason: `Independent Paper Exit review records ${decision} safely.`,
        ...(decision === "EXTEND_OBSERVATION" ? { extension_days: 14 } : {}),
        evidence_hashes: HASHES,
      },
      ...overrides,
    };
  }

  async function apply(actor: Actor, operationId: string, applyToken: string) {
    return mutation(actor, `/api/v1/execution/operations/${operationId}/apply`, {
      schema_version: "governance.paper-exit-decision-apply-request.v1",
      workspace_id: workspaceId,
      apply_token: applyToken,
    });
  }

  it("publishes all four source-linked panels, exact decimals and a server-only gate verdict", async () => {
    await seedExitReview({ reviewId: "EX-MET" });
    const response = await inject(reviewer, `/api/v1/execution/governance/exit-reviews/EX-MET?workspace_id=${workspaceId}`);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.schema_version).toBe("governance.paper-exit-review.v1");
    expect(body.data).toMatchObject({
      status: "ok", gate_met: true, evaluation_state: "MET",
      review: { stage: "PAPER_OBSERVATION", review_version: 1 },
      eligibility: { can_approve: true, can_extend_observation: true, can_reject: true },
      activation_plan: { mode: "PREVIEW_ONLY", external_side_effect_requested: false },
    });
    expect(body.data.panels).toHaveLength(4);
    expect(body.data.lineage.map((item: { kind: string }) => item.kind)).toEqual([
      "ARTIFACT", "R1_APPROVAL", "R2_APPROVAL", "OBSERVATION_POLICY", "EVIDENCE_PACK",
    ]);
    expect(JSON.stringify(body)).toContain("1842.000000000000000001");
    expect(body.data.evaluation.carried_finding_ids).toEqual(["EX-MET-finding-2"]);
    expect(body.data.evaluation.warnings).toContainEqual({ code: "INSUFFICIENT_DATA_CARRIED_FORWARD" });
  });

  it.each([
    ["PARTIAL", "partial", "PARTIAL"],
    ["STALE", "stale", "STALE"],
    ["UNAVAILABLE", "unavailable", "UNAVAILABLE"],
  ] as const)("fails promotion closed for a %s source panel", async (panelState, status, evaluationState) => {
    const reviewId = `EX-${panelState}`;
    await seedExitReview({ reviewId, panelState });
    const detail = await inject(reviewer, `/api/v1/execution/governance/exit-reviews/${reviewId}?workspace_id=${workspaceId}`);
    expect(detail.json().data).toMatchObject({
      status, gate_met: false, evaluation_state: evaluationState,
      eligibility: { can_approve: false, can_extend_observation: true, can_reject: true },
    });
    const planned = await mutation(reviewer, "/api/v1/execution/commands/plans", planPayload(reviewId, "PROMOTE"));
    expect(planned.statusCode).toBe(201);
    expect(planned.json().apply_token).toBeNull();
    expect(planned.json().blockers.length).toBeGreaterThan(0);
  });

  it("treats a missing panel and a finding without lineage as partial, never as zero/pass", async () => {
    await seedExitReview({ reviewId: "EX-MISSING", omitPanel: "PORTFOLIO_FIT", missingFindingSource: true });
    const response = await inject(reviewer, `/api/v1/execution/governance/exit-reviews/EX-MISSING?workspace_id=${workspaceId}`);
    const data = response.json().data;
    expect(data.evaluation_state).toBe("PARTIAL");
    expect(data.evaluation.missing_panel_kinds).toEqual(["PORTFOLIO_FIT"]);
    expect(data.evaluation.missing_evidence_finding_ids).toEqual(["EX-MISSING-finding-1"]);
    expect(data.gate_met).toBe(false);
  });

  it("records PROMOTE as a Portal grant only, idempotently, with no execution command", async () => {
    await seedExitReview({ reviewId: "EX-PROMOTE" });
    const payload = planPayload("EX-PROMOTE", "PROMOTE");
    const first = await mutation(reviewer, "/api/v1/execution/commands/plans", payload);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      command_type: "GOVERNANCE_PAPER_EXIT_DECISION",
      evaluation_state: "MET",
      blockers: [],
      external_side_effect_requested: false,
    });
    const replay = await mutation(reviewer, "/api/v1/execution/commands/plans", payload);
    expect(replay.json()).toMatchObject({ operation_id: first.json().operation_id, replayed: true });
    const applied = await apply(reviewer, first.json().operation_id, first.json().apply_token);
    expect(applied.statusCode).toBe(202);
    expect(applied.json()).toMatchObject({ status: "PENDING", external_side_effect_requested: false });
    const appliedReplay = await apply(reviewer, first.json().operation_id, first.json().apply_token);
    expect(appliedReplay.json().replayed).toBe(true);
    const operation = await inject(reviewer, `/api/v1/execution/operations/${first.json().operation_id}?workspace_id=${workspaceId}`);
    expect(operation.json()).toMatchObject({
      status: "SUCCEEDED", verification_result: "SUCCEEDED",
      receipt: {
        review_state: "PROMOTION_AUTHORIZED",
        next_eligible_action: "PLAN_SANDBOX_PROMOTION",
        external_side_effect_requested: false,
      },
    });
    const counts = await ctx.pool.query(
      `SELECT
        (SELECT count(*) FROM governance_paper_exit_decisions WHERE review_id = 'EX-PROMOTE') AS decisions,
        (SELECT count(*) FROM governance_promotion_authority_grants WHERE review_id = 'EX-PROMOTE') AS grants,
        (SELECT count(*) FROM product_audit_events WHERE aggregate_id = 'EX-PROMOTE' AND event_type = 'governance.paper_exit_decision.applied') AS audits,
        (SELECT count(*) FROM outbox_messages WHERE aggregate_id = 'EX-PROMOTE' AND event_type = 'governance.paper_exit_decision.applied') AS outbox,
        (SELECT count(*) FROM outbox_messages WHERE aggregate_id = 'EX-PROMOTE' AND event_type LIKE 'execution.%') AS execution_commands`,
    );
    expect(counts.rows[0]).toMatchObject({
      decisions: "1", grants: "1", audits: "1", outbox: "1", execution_commands: "0",
    });
  });

  it.each([
    ["EXTEND_OBSERVATION", "EXTENDED", "APPROVED_WITH_CONDITION", "CONTINUE_PAPER_OBSERVATION"],
    ["REJECT", "REJECTED_TO_PAPER_HELD", "DENIED", "RETURN_TO_PAPER_HELD"],
  ] as const)("writes the distinct %s consequence without a promotion grant", async (decision, reviewState, approvalStatus, nextAction) => {
    const reviewId = decision === "REJECT" ? "EX-REJECT" : "EX-EXTEND";
    await seedExitReview({ reviewId, panelState: "UNAVAILABLE" });
    const planned = await mutation(reviewer, "/api/v1/execution/commands/plans", planPayload(reviewId, decision));
    expect(planned.statusCode).toBe(201);
    expect(planned.json().blockers).toEqual([]);
    const applied = await apply(reviewer, planned.json().operation_id, planned.json().apply_token);
    expect(applied.statusCode).toBe(202);
    const operation = await inject(reviewer, `/api/v1/execution/operations/${planned.json().operation_id}?workspace_id=${workspaceId}`);
    expect(operation.json().receipt).toMatchObject({ review_state: reviewState, next_eligible_action: nextAction });
    const state = await ctx.pool.query(
      `SELECT review.review_state, request.status,
              (SELECT count(*) FROM governance_promotion_authority_grants authority_grant
                WHERE authority_grant.review_id = review.review_id) AS grants
         FROM governance_paper_exit_reviews review
         JOIN governance_approval_requests request ON request.approval_id = review.review_id
        WHERE review.review_id = $1`,
      [reviewId],
    );
    expect(state.rows[0]).toMatchObject({ review_state: reviewState, status: approvalStatus, grants: "0" });
    if (decision === "EXTEND_OBSERVATION") {
      expect((await ctx.pool.query(`SELECT extension_days, extended_until IS NOT NULL AS has_until FROM governance_paper_exit_reviews WHERE review_id = $1`, [reviewId])).rows[0])
        .toMatchObject({ extension_days: 14, has_until: true });
    }
  });

  it("enforces role, separation of duties, CSRF and request-key intent binding", async () => {
    await seedExitReview({ reviewId: "EX-SECURITY", requester: owner, creator: owner });
    const payload = planPayload("EX-SECURITY", "PROMOTE");
    const userPlan = await mutation(member, "/api/v1/execution/commands/plans", payload);
    expect(userPlan.statusCode).toBe(403);
    expect(userPlan.json().error.code).toBe("APPROVER_ROLE_REQUIRED");
    const selfPlan = await mutation(owner, "/api/v1/execution/commands/plans", payload);
    expect(selfPlan.statusCode).toBe(201);
    expect(selfPlan.json().blockers).toContainEqual({ code: "SELF_PROMOTION_PROHIBITED" });
    expect(selfPlan.json().apply_token).toBeNull();
    const missingCsrf = await inject(reviewer, "/api/v1/execution/commands/plans", {
      method: "POST", headers: { "content-type": "application/json", origin: ctx.config.PORTAL_PUBLIC_ORIGIN },
      payload,
    });
    expect(missingCsrf.statusCode).toBe(403);
    const first = await mutation(reviewer, "/api/v1/execution/commands/plans", payload);
    const conflict = await mutation(reviewer, "/api/v1/execution/commands/plans", {
      ...planPayload("EX-SECURITY", "REJECT"), request_key: payload.request_key,
    });
    expect(first.statusCode).toBe(201);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("REQUEST_KEY_PAYLOAD_CONFLICT");
  });

  it("detects evidence/source tampering and makes source facts and decisions append-only", async () => {
    await seedExitReview({ reviewId: "EX-INTEGRITY" });
    await expect(ctx.pool.query(
      `UPDATE governance_paper_exit_findings SET label = 'tampered' WHERE review_id = 'EX-INTEGRITY'`,
    )).rejects.toMatchObject({ code: "55000" });
    await ctx.pool.query(
      `UPDATE governance_paper_exit_reviews SET source_snapshot_hash = $2 WHERE review_id = $1`,
      ["EX-INTEGRITY", `sha256:${"f".repeat(64)}`],
    );
    const sourceTampered = await inject(reviewer, `/api/v1/execution/governance/exit-reviews/EX-INTEGRITY?workspace_id=${workspaceId}`);
    expect(sourceTampered.statusCode).toBe(409);
    expect(sourceTampered.json().error.code).toBe("SOURCE_SNAPSHOT_INTEGRITY_FAILED");

    await seedExitReview({ reviewId: "EX-EVIDENCE-INTEGRITY" });
    await ctx.pool.query(
      `UPDATE governance_approval_requests SET evidence_set_hash = $2 WHERE approval_id = $1`,
      ["EX-EVIDENCE-INTEGRITY", `sha256:${"e".repeat(64)}`],
    );
    const evidenceTampered = await inject(reviewer, `/api/v1/execution/governance/exit-reviews/EX-EVIDENCE-INTEGRITY?workspace_id=${workspaceId}`);
    expect(evidenceTampered.statusCode).toBe(409);
    expect(evidenceTampered.json().error.code).toBe("EVIDENCE_MANIFEST_INTEGRITY_FAILED");
  });

  it("keeps evaluation deterministic over the immutable snapshot", async () => {
    await seedExitReview({ reviewId: "EX-DETERMINISTIC", blocking: true });
    const repository = new PaperExitRepository(ctx.pool);
    const snapshot = await repository.detail(workspaceId, "EX-DETERMINISTIC");
    expect(snapshot).not.toBeNull();
    expect(evaluatePaperExit(snapshot!)).toEqual(evaluatePaperExit(snapshot!));
    expect(evaluatePaperExit(snapshot!)).toMatchObject({
      state: "UNMET", gateMet: false,
      blockingFindingIds: ["EX-DETERMINISTIC-finding-3"],
    });
    expect(computePaperExitSourceSnapshotHash(snapshot!)).toBe(snapshot!.review.sourceSnapshotHash);
  });
});
