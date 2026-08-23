import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { SANDBOX_CERTIFICATION_STEPS, SandboxCertificationStep } from "../src/sandbox/contracts";
import { SandboxCertificationRepository } from "../src/sandbox/sandbox-certification.repository";
import { evaluateSandboxCertification } from "../src/sandbox/sandbox-certification.service";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";

interface Actor {
  userId: string;
  username: string;
  cookie: string;
  csrf: string;
}

function cookies(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0])
    .join("; ");
}

function csrfCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = (Array.isArray(raw) ? raw : [raw]).find(
    (item): item is string => typeof item === "string" && item.startsWith("__Host-portal_csrf="),
  );
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1];
}

describe("EX-BE-05b/F2 Portal Sandbox Certification", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let bobby: Actor;
  let approver: Actor;
  let reader: Actor;
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
    bobby = await createActor("sandbox-bobby", "ADMIN");
    approver = await createActor("sandbox-approver", "ADMIN");
    reader = await createActor("sandbox-reader", "USER");
    const workspaces = await inject(bobby, "/api/workspaces");
    workspaceId = workspaces.json().workspaces[0].workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'MEMBER'), ($1, $3, 'MEMBER')`,
      [workspaceId, approver.userId, reader.userId],
    );
  }, 30_000);

  afterAll(async () => teardownApp(ctx));

  beforeEach(async () => {
    await ctx.pool.query(
      `TRUNCATE governance_sandbox_promotion_plans,
                governance_sandbox_certification_events,
                governance_sandbox_findings,
                governance_sandbox_step_evidence,
                governance_sandbox_certifications,
                governance_promotion_authority_grants,
                governance_paper_exit_decisions,
                governance_paper_exit_decision_plans,
                governance_paper_exit_findings,
                governance_paper_exit_panels,
                governance_paper_exit_lineage,
                governance_paper_exit_reviews,
                governance_approval_findings,
                governance_approval_evidence,
                governance_approval_decisions,
                governance_decision_plans,
                governance_approval_requests,
                product_audit_events,
                outbox_messages CASCADE`,
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

  async function mutation(actor: Actor, url: string, payload: unknown) {
    return inject(actor, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-portal-csrf": actor.csrf,
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
      },
      payload,
    });
  }

  async function createActor(username: string, role: "ADMIN" | "USER"): Promise<Actor> {
    await admin.createUser({ username, displayName: username, role });
    const portalUser = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(portalUser!.userId);
    const activated = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const initialCsrf = csrfCookie(activated);
    const password = `cedar-river-${username}-execution-safe`;
    expect((await rawInject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(activated),
        "x-portal-csrf": initialCsrf,
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: { current_password: activationToken, new_password: password },
    })).statusCode).toBe(201);
    const loggedIn = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: password },
    });
    return { userId: portalUser!.userId, username, cookie: cookies(loggedIn), csrf: csrfCookie(loggedIn) };
  }

  async function seedGrant(suffix: string) {
    const reviewId = `PX-${suffix}`;
    const deploymentId = `dep_${suffix}`;
    const grantId = `grant_${suffix}`;
    const hash = `sha256:${"a".repeat(64)}`;
    await ctx.pool.query(
      `INSERT INTO governance_approval_requests
         (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
          environment, target_label, requester_user_id, requester_username,
          artifact_creator_user_id, artifact_creator_username, status, policy_version,
          quorum_required, quorum_met, decision_actor_ids, evidence_set_hash,
          evidence_complete, blocker_count, sla_due_at, expires_at, decided_at, decided_by_user_id)
       VALUES ($1, $2, 'PAPER_EXIT', 'EXIT_REVIEW', $3, $3, 'PAPER', 'SANDBOX_VALIDATION',
               $4, $5, $4, $5, 'APPROVED', 'paper-exit.v1', 1, 1, ARRAY[$4],
               $6, true, 0, now() + interval '1 hour', now() + interval '2 hours', now(), $4)`,
      [reviewId, workspaceId, deploymentId, bobby.userId, bobby.username, hash],
    );
    await ctx.pool.query(
      `INSERT INTO governance_paper_exit_reviews
         (review_id, workspace_id, deployment_id, portfolio_id, venue, artifact_digest,
          r1_approval_id, r2_approval_id, observation_policy_id, observation_policy_version,
          observation_policy_digest, evidence_pack_id, evidence_pack_digest,
          evaluation_policy_version, evaluation_formula_version, source_snapshot_hash,
          observation_summary, recommendation, review_state)
       VALUES ($1, $2, $3, $4, 'OKX', $5, $6, $7, 'paper-observation', 'v1',
               $5, $8, $5, 'sandbox-certification.v1', 'sandbox-certification.v1', $5,
               'Paper observation was approved for sandbox certification.',
               'Proceed to a source-gated sandbox certification.', 'PROMOTION_AUTHORIZED')`,
      [reviewId, workspaceId, deploymentId, `pf_${suffix}`, hash, `AP-R1-${suffix}`, `AP-R2-${suffix}`, `pack_${suffix}`],
    );
    await ctx.pool.query(
      `INSERT INTO governance_promotion_authority_grants
         (grant_id, workspace_id, review_id, deployment_id, target_stage, grant_state,
          evidence_set_hash, source_snapshot_hash, policy_version, created_by_user_id)
       VALUES ($1, $2, $3, $4, 'SANDBOX_VALIDATION', 'AVAILABLE', $5, $5,
               'sandbox-certification.v1', $6)`,
      [grantId, workspaceId, reviewId, deploymentId, hash, bobby.userId],
    );
    return { reviewId, deploymentId, grantId, hash };
  }

  function createPayload(grant: Awaited<ReturnType<typeof seedGrant>>, requestKey: string) {
    return {
      schema_version: "governance.sandbox-certification-create-request.v1",
      workspace_id: workspaceId,
      request_key: requestKey,
      deployment_id: grant.deploymentId,
      promotion_grant_id: grant.grantId,
      account_binding: {
        account_id: `acct_${grant.deploymentId}`,
        external_account_ref: `okx_testnet_${grant.deploymentId}`,
      },
    };
  }

  async function seedShadowCertification(suffix: string, staleStep?: SandboxCertificationStep) {
    const grant = await seedGrant(suffix);
    const certificationId = `scert_${suffix}`;
    await ctx.pool.query(
      `INSERT INTO governance_sandbox_certifications
         (certification_id, workspace_id, deployment_id, promotion_grant_id,
          paper_exit_review_id, portfolio_id, venue, account_id, external_account_ref,
          artifact_digest, r1_approval_id, r2_approval_id, policy_version, formula_version,
          source_integration_state, delivery_profile, created_by_user_id)
       SELECT $1, $2, $3, $4, r.review_id, r.portfolio_id, r.venue, $5, $6,
              r.artifact_digest, r.r1_approval_id, r.r2_approval_id,
              'sandbox-certification.v1', 'sandbox-certification.v1', 'SHADOW', 'shadow', $7
       FROM governance_paper_exit_reviews r WHERE r.review_id = $8`,
      [certificationId, workspaceId, grant.deploymentId, grant.grantId,
        `acct_${suffix}`, `okx_testnet_${suffix}`, bobby.userId, grant.reviewId],
    );
    const authority: Record<SandboxCertificationStep, string> = {
      CONNECT: "BROKER", SYNC: "BROKER", ORDER_TYPES: "BROKER",
      RECONCILIATION: "DERIVED", TIMEBOXED_RUN: "EXECUTION",
      CLEANUP: "DERIVED", EXIT_REVIEW: "PORTAL",
    };
    for (const [ordinal, step] of SANDBOX_CERTIFICATION_STEPS.entries()) {
      const stale = step === staleStep;
      await ctx.pool.query(
        `INSERT INTO governance_sandbox_step_evidence
           (evidence_id, certification_id, workspace_id, step_key, source_authority,
            evaluation_state, evidence_hash, evidence_schema_version,
            source_verification_state, summary, as_of, expires_at,
            capability_snapshot_id, source_cursor, projection_epoch, projection_sequence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'sandbox-step.v1', 'VERIFIED',
                 $8, now() - interval '1 minute',
                 CASE WHEN $9 THEN now() - interval '1 second' ELSE now() + interval '1 hour' END,
                 'caps-shadow-1', 'cursor-shadow-1', 'epoch-shadow-1', $10)`,
        [`sev_${suffix}_${ordinal}`, certificationId, workspaceId, step, authority[step],
          stale ? "STALE" : "PASS", `sha256:${String(ordinal + 1).repeat(64)}`,
          `Verified ${step.toLowerCase()} evidence for the bounded sandbox test.`, stale, ordinal + 1],
      );
    }
    return { ...grant, certificationId };
  }

  it("creates one source-dark certification idempotently and never invents source truth", async () => {
    const grant = await seedGrant("dark");
    const payload = createPayload(grant, "sandbox:create:dark");
    expect((await rawInject(`/api/v1/execution/deployments/${grant.deploymentId}/certification`)).statusCode)
      .toBe(401);
    const denied = await mutation(reader, "/api/v1/execution/governance/sandbox-certifications", payload);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("ADMIN_ROLE_REQUIRED");

    const first = await mutation(bobby, "/api/v1/execution/governance/sandbox-certifications", payload);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      replayed: false,
      certification: { workflow_state: "DRAFT", workflow_version: 1, runtime_state: null },
      progress: { passed_count: 0, total_count: 7, eligible: false },
    });
    expect(first.json().steps).toHaveLength(7);
    expect(first.json().steps.every((step: { evaluation_state: string }) => step.evaluation_state === "UNAVAILABLE"))
      .toBe(true);
    expect(first.json().source_panels).toHaveLength(3);
    expect(first.json().source_panels.every((panel: { panel_state: string; data: unknown }) =>
      panel.panel_state === "unavailable" && panel.data === null)).toBe(true);

    const replay = await mutation(bobby, "/api/v1/execution/governance/sandbox-certifications", payload);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().certification.certification_id).toBe(first.json().certification.certification_id);
    expect(replay.json().replayed).toBe(true);
    const conflict = await mutation(bobby, "/api/v1/execution/governance/sandbox-certifications", {
      ...payload,
      account_binding: { ...payload.account_binding, account_id: "acct_payload_drift" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("REQUEST_KEY_SANDBOX_CERTIFICATION_CONFLICT");

    const submit = await mutation(
      bobby,
      `/api/v1/execution/governance/sandbox-certifications/${first.json().certification.certification_id}/submit`,
      {
        schema_version: "governance.sandbox-certification-submit-request.v1",
        workspace_id: workspaceId,
        request_key: "sandbox:submit:dark",
        expected_workflow_version: 1,
        expected_evidence_set_hash: first.json().progress.evidence_set_hash,
      },
    );
    expect(submit.statusCode).toBe(409);
    expect(submit.json().error.code).toBe("SANDBOX_CERTIFICATION_SUBMIT_BLOCKED");
    expect(submit.json().details.blockers).toHaveLength(7);

    const counts = await ctx.pool.query<{ events: string; audits: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM governance_sandbox_certification_events)::text AS events,
         (SELECT count(*) FROM product_audit_events WHERE aggregate_type = 'sandbox_certification')::text AS audits,
         (SELECT count(*) FROM outbox_messages)::text AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ events: "1", audits: "1", outbox: "0" });
  });

  it("enforces 7/7 freshness, separation of duties and a blocked no-side-effect promotion plan", async () => {
    const seeded = await seedShadowCertification("ready");
    const detail = await inject(bobby, `/api/v1/execution/deployments/${seeded.deploymentId}/certification`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      delivery_profile: "shadow",
      source_integration_state: "SHADOW",
      progress: { passed_count: 7, total_count: 7, eligible: true, blocker_codes: [] },
    });
    const evidenceHash = detail.json().progress.evidence_set_hash;
    const base = {
      workspace_id: workspaceId,
      expected_evidence_set_hash: evidenceHash,
    };
    const submitPayload = {
      schema_version: "governance.sandbox-certification-submit-request.v1",
      ...base,
      request_key: "sandbox:submit:ready",
      expected_workflow_version: 1,
    };
    const submitted = await mutation(
      bobby,
      `/api/v1/execution/governance/sandbox-certifications/${seeded.certificationId}/submit`,
      submitPayload,
    );
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json().certification).toMatchObject({
      workflow_state: "IN_REVIEW",
      workflow_version: 2,
      submitted_evidence_set_hash: evidenceHash,
    });
    const submitReplay = await mutation(
      bobby,
      `/api/v1/execution/governance/sandbox-certifications/${seeded.certificationId}/submit`,
      submitPayload,
    );
    expect(submitReplay.statusCode).toBe(201);
    expect(submitReplay.json().replayed).toBe(true);

    const decisionPayload = {
      schema_version: "governance.sandbox-certification-decision-request.v1",
      ...base,
      request_key: "sandbox:approve:ready",
      expected_workflow_version: 2,
      decision: "APPROVE",
      reason: "All seven current evidence steps passed independent review.",
    };
    const sod = await mutation(
      bobby,
      `/api/v1/execution/governance/sandbox-certifications/${seeded.certificationId}/decisions`,
      decisionPayload,
    );
    expect(sod.statusCode).toBe(403);
    expect(sod.json().error.code).toBe("SANDBOX_CERTIFICATION_SOD_VIOLATION");

    const approved = await mutation(
      approver,
      `/api/v1/execution/governance/sandbox-certifications/${seeded.certificationId}/decisions`,
      decisionPayload,
    );
    expect(approved.statusCode).toBe(201);
    expect(approved.json().certification).toMatchObject({
      workflow_state: "APPROVED",
      workflow_version: 3,
      decided_evidence_set_hash: evidenceHash,
    });

    const planned = await mutation(
      approver,
      `/api/v1/execution/governance/sandbox-certifications/${seeded.certificationId}/promotion-plans`,
      {
        schema_version: "governance.sandbox-promotion-plan-request.v1",
        ...base,
        request_key: "sandbox:plan-canary:ready",
        expected_workflow_version: 3,
        target_stage: "CANARY",
        reason: "Record a canary intent while the production command path remains disabled.",
      },
    );
    expect(planned.statusCode).toBe(201);
    expect(planned.json()).toMatchObject({
      status: "BLOCKED",
      blocker_codes: ["PRODUCTION_COMMAND_INACTIVE", "CANARY_OWNER_GATE_REQUIRED"],
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
    });
    const counts = await ctx.pool.query<{ events: string; audits: string; plans: string; outbox: string }>(
      `SELECT
         (SELECT count(*) FROM governance_sandbox_certification_events)::text AS events,
         (SELECT count(*) FROM product_audit_events WHERE aggregate_type = 'sandbox_certification')::text AS audits,
         (SELECT count(*) FROM governance_sandbox_promotion_plans)::text AS plans,
         (SELECT count(*) FROM outbox_messages)::text AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ events: "3", audits: "3", plans: "1", outbox: "0" });
  });

  it("rejects stale evidence deterministically and keeps immutable source evidence append-only", async () => {
    const seeded = await seedShadowCertification("stale", "SYNC");
    const repository = new SandboxCertificationRepository(ctx.pool);
    const detail = await repository.detailById(workspaceId, seeded.certificationId);
    const first = evaluateSandboxCertification(detail, new Date());
    const second = evaluateSandboxCertification(detail, new Date());
    expect(first).toEqual(second);
    expect(first).toMatchObject({ eligible: false, passedCount: 6 });
    expect(first.blockerCodes).toEqual(["SANDBOX_STEP_SYNC_STALE"]);

    const submit = await mutation(
      bobby,
      `/api/v1/execution/governance/sandbox-certifications/${seeded.certificationId}/submit`,
      {
        schema_version: "governance.sandbox-certification-submit-request.v1",
        workspace_id: workspaceId,
        request_key: "sandbox:submit:stale",
        expected_workflow_version: 1,
        expected_evidence_set_hash: first.evidenceSetHash,
      },
    );
    expect(submit.statusCode).toBe(409);
    expect(submit.json().details.blockers).toEqual(["SANDBOX_STEP_SYNC_STALE"]);
    await expect(ctx.pool.query(
      `UPDATE governance_sandbox_step_evidence SET summary = 'forbidden mutation'
       WHERE certification_id = $1`,
      [seeded.certificationId],
    )).rejects.toMatchObject({ code: "55000" });
  });

  it("serializes equal concurrent creates into one certification and one replay", async () => {
    const grant = await seedGrant("race");
    const payload = createPayload(grant, "sandbox:create:race");
    const [first, second] = await Promise.all([
      mutation(bobby, "/api/v1/execution/governance/sandbox-certifications", payload),
      mutation(bobby, "/api/v1/execution/governance/sandbox-certifications", payload),
    ]);
    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(first.json().certification.certification_id).toBe(second.json().certification.certification_id);
    expect([first.json().replayed, second.json().replayed].sort()).toEqual([false, true]);
    const counts = await ctx.pool.query<{ certifications: string; events: string; audits: string }>(
      `SELECT
         (SELECT count(*) FROM governance_sandbox_certifications)::text AS certifications,
         (SELECT count(*) FROM governance_sandbox_certification_events)::text AS events,
         (SELECT count(*) FROM product_audit_events WHERE aggregate_type = 'sandbox_certification')::text AS audits`,
    );
    expect(counts.rows[0]).toEqual({ certifications: "1", events: "1", audits: "1" });
  });
});
