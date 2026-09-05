import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { SANDBOX_CERTIFICATION_STEPS } from "../src/sandbox/contracts";
import { SandboxCertificationRepository } from "../src/sandbox/sandbox-certification.repository";
import { evaluateSandboxCertification } from "../src/sandbox/sandbox-certification.service";
import { ProfileReadService } from "../src/profile-read/profile-read.service";
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

describe("EX-BE-05b/F3 Canary Control Room source-dark", () => {
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
    bobby = await createActor("canary-bobby", "ADMIN");
    approver = await createActor("canary-approver", "ADMIN");
    reader = await createActor("canary-reader", "USER");
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
      `TRUNCATE governance_canary_envelopes,
                governance_sandbox_promotion_plans,
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

  async function mutation(actor: Actor, payload: unknown) {
    return inject(actor, "/api/v1/execution/governance/canary-envelopes", {
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

  async function seedApprovedLineage(suffix: string) {
    const deploymentId = `dep_${suffix}`;
    const reviewId = `PX-${suffix}`;
    const grantId = `grant_${suffix}`;
    const certificationId = `scert_${suffix}`;
    const planId = `splan_${suffix}`;
    const artifactHash = `sha256:${"a".repeat(64)}`;
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
      [reviewId, workspaceId, deploymentId, bobby.userId, bobby.username, artifactHash],
    );
    await ctx.pool.query(
      `INSERT INTO governance_paper_exit_reviews
         (review_id, workspace_id, deployment_id, portfolio_id, venue, artifact_digest,
          r1_approval_id, r2_approval_id, observation_policy_id, observation_policy_version,
          observation_policy_digest, evidence_pack_id, evidence_pack_digest,
          evaluation_policy_version, evaluation_formula_version, source_snapshot_hash,
          observation_summary, recommendation, review_state)
       VALUES ($1, $2, $3, $4, 'BINANCE', $5, $6, $7, 'paper-observation', 'v1',
               $5, $8, $5, 'sandbox-certification.v1', 'sandbox-certification.v1', $5,
               'Paper observation approved for sandbox certification.',
               'Proceed only through source-gated certification.', 'PROMOTION_AUTHORIZED')`,
      [reviewId, workspaceId, deploymentId, `pf_${suffix}`, artifactHash,
        `AP-R1-${suffix}`, `AP-R2-${suffix}`, `pack_${suffix}`],
    );
    await ctx.pool.query(
      `INSERT INTO governance_promotion_authority_grants
         (grant_id, workspace_id, review_id, deployment_id, target_stage, grant_state,
          evidence_set_hash, source_snapshot_hash, policy_version, created_by_user_id)
       VALUES ($1, $2, $3, $4, 'SANDBOX_VALIDATION', 'AVAILABLE', $5, $5,
               'sandbox-certification.v1', $6)`,
      [grantId, workspaceId, reviewId, deploymentId, artifactHash, bobby.userId],
    );
    await ctx.pool.query(
      `INSERT INTO governance_sandbox_certifications
         (certification_id, workspace_id, deployment_id, promotion_grant_id,
          paper_exit_review_id, portfolio_id, venue, account_id, external_account_ref,
          artifact_digest, r1_approval_id, r2_approval_id, policy_version,
          formula_version, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'BINANCE', $7, $8, $9, $10, $11,
               'sandbox-certification.v1', 'sandbox-certification.v1', $12)`,
      [certificationId, workspaceId, deploymentId, grantId, reviewId, `pf_${suffix}`,
        `acct_${suffix}`, `acct-canary-${suffix}`, artifactHash,
        `AP-R1-${suffix}`, `AP-R2-${suffix}`, bobby.userId],
    );
    const authorities: Record<string, string> = {
      CONNECT: "BROKER", SYNC: "BROKER", ORDER_TYPES: "BROKER",
      RECONCILIATION: "DERIVED", TIMEBOXED_RUN: "EXECUTION",
      CLEANUP: "DERIVED", EXIT_REVIEW: "PORTAL",
    };
    for (const [index, step] of SANDBOX_CERTIFICATION_STEPS.entries()) {
      await ctx.pool.query(
        `INSERT INTO governance_sandbox_step_evidence
           (evidence_id, certification_id, workspace_id, step_key, source_authority,
            evaluation_state, evidence_hash, evidence_schema_version,
            source_verification_state, summary, as_of, expires_at,
            capability_snapshot_id, source_cursor, projection_epoch, projection_sequence)
         VALUES ($1, $2, $3, $4, $5, 'PASS', $6, 'sandbox-step.v1', 'VERIFIED',
                 $7, now(), now() + interval '2 hours', $8, $9, $10, $11)`,
        [`evidence_${suffix}_${index}`, certificationId, workspaceId, step,
          authorities[step], `sha256:${String(index + 1).repeat(64)}`,
          `Verified ${step} evidence for canary planning.`, `cap_${suffix}`,
          `cursor_${suffix}_${index}`, `epoch_${suffix}`, index + 1],
      );
    }
    const repository = new SandboxCertificationRepository(ctx.pool);
    const evaluation = evaluateSandboxCertification(
      await repository.detailById(workspaceId, certificationId),
    );
    await ctx.pool.query(
      `UPDATE governance_sandbox_certifications
       SET workflow_state = 'APPROVED', workflow_version = 2,
           submitted_at = now(), submitted_by_user_id = $3,
           submitted_evidence_set_hash = $4,
           decided_at = now(), decided_by_user_id = $5,
           decided_evidence_set_hash = $4,
           decision_reason = 'Independent reviewer approved the complete evidence set.',
           updated_at = now()
       WHERE workspace_id = $1 AND certification_id = $2`,
      [workspaceId, certificationId, bobby.userId, evaluation.evidenceSetHash, approver.userId],
    );
    await ctx.pool.query(
      `INSERT INTO governance_sandbox_promotion_plans
         (plan_id, certification_id, workspace_id, actor_user_id, request_key,
          request_digest, expected_workflow_version, target_stage, evidence_set_hash,
          status, blocker_codes)
       VALUES ($1, $2, $3, $4, $5, $6, 2, 'CANARY', $7, 'BLOCKED', $8)`,
      [planId, certificationId, workspaceId, approver.userId, `plan-${suffix}`,
        `sha256:${"b".repeat(64)}`, evaluation.evidenceSetHash,
        ["PRODUCTION_COMMAND_INACTIVE", "CANARY_OWNER_GATE_REQUIRED"]],
    );
    return { deploymentId, certificationId, planId, evidenceSetHash: evaluation.evidenceSetHash };
  }

  function payload(
    lineage: Awaited<ReturnType<typeof seedApprovedLineage>>,
    requestKey: string,
    expectedLatestEnvelopeId: string | null = null,
  ) {
    return {
      schema_version: "governance.canary-envelope-create-request.v1",
      workspace_id: workspaceId,
      request_key: requestKey,
      deployment_id: lineage.deploymentId,
      certification_id: lineage.certificationId,
      promotion_plan_id: lineage.planId,
      expected_certification_workflow_version: 2,
      expected_evidence_set_hash: lineage.evidenceSetHash,
      expected_latest_envelope_id: expectedLatestEnvelopeId,
      base_risk_profile_revision: "risk-profile-rev-12",
      currency: "USDT",
      limits: {
        capital_cap: "5000.0000",
        gross_notional_cap: "10000.0000",
        daily_loss_cap: "250.0000",
        max_open_orders: 20,
        duration_days: 14,
      },
      reason: "Draft source-dark canary envelope for interface qualification.",
    };
  }

  it("creates an immutable source-dark envelope and exposes asymmetric command policy", async () => {
    const lineage = await seedApprovedLineage("dark");
    const created = await mutation(bobby, payload(lineage, "canary-dark-create"));
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      schema_version: "execution.canary-control-room.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      production_command_active: false,
      deployment: { declared_environment: "LIVE_CANARY", runtime_state: null },
      envelope: {
        revision: 1,
        status: "DRAFT",
        limits: { capital_cap: "5000", gross_notional_cap: "10000", daily_loss_cap: "250" },
      },
      command_policy: {
        guard_semantics: "BROKER_STALE_BLOCKS_SCALE_ONLY",
        protective: { visible: false, enabled: false, broker_sync_blocks: false },
        scale_up: { visible: false, enabled: false, broker_sync_blocks: true },
      },
    });
    expect(created.json().kpis).toHaveLength(5);
    expect(created.json().source_panels).toHaveLength(3);
    expect(created.json().source_panels.every((panel: { panel_state: string; data: unknown }) =>
      panel.panel_state === "unavailable" && panel.data === null)).toBe(true);
    const read = await inject(reader, `/api/v1/execution/deployments/${lineage.deploymentId}/canary?workspace_id=${workspaceId}`);
    expect(read.statusCode).toBe(200);
    expect(read.json().envelope.envelope_id).toBe(created.json().envelope.envelope_id);
    expect(read.json().actor.roles).toEqual(["USER"]);
    const counts = await ctx.pool.query<{ audit: string; outbox: string }>(
      `SELECT
         (SELECT count(*)::text FROM product_audit_events WHERE aggregate_type = 'canary_envelope') AS audit,
         (SELECT count(*)::text FROM outbox_messages) AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ audit: "1", outbox: "0" });
  });

  it("composes Live Full Operations as source-dark and suppresses every broker value", async () => {
    const lineage = await seedApprovedLineage("live-full");
    const created = await mutation(bobby, payload(lineage, "live-full-canary-predecessor"));
    expect(created.statusCode).toBe(201);

    const response = await inject(
      reader,
      `/api/v1/execution/deployments/${lineage.deploymentId}/live?workspace_id=${workspaceId}`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schema_version: "execution.live-full-operations.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      production_command_active: false,
      realtime_active: false,
      deployment: { declared_environment: "LIVE_FULL", runtime_state: null, activated_at: null },
      predecessor_canary_envelope: {
        envelope_id: created.json().envelope.envelope_id,
        active_for_live_full: false,
      },
      source_panels: {
        internal: { panel_state: "unavailable", data: null },
        broker: { panel_state: "suppressed", data: null },
        difference: { panel_state: "unavailable", data: null },
      },
      broker_consistency: {
        state: "UNAVAILABLE",
        mismatch_behavior: "SUPPRESS_ALL_BROKER_VALUES",
        broker_values_visible: false,
      },
      projection_continuity: { state: "UNAVAILABLE", gap_detected: null },
      command_policy: {
        guard_semantics: "BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4",
        protective: { visible: false, enabled: false, source_gap_blocks: false },
        risk_increasing: { visible: false, enabled: false, source_gap_blocks: true },
      },
    });
    expect(response.json().kpis).toHaveLength(5);
    expect(response.json().kpis.every((item: { value: unknown }) => item.value === null)).toBe(true);
    expect(response.json().positions.rows).toEqual([]);
    expect(response.json().orders.rows).toEqual([]);
    expect(response.json().open_order_footer.exact_open_order_count).toBeNull();
    const counts = await ctx.pool.query<{ audit: string; outbox: string }>(
      `SELECT
         (SELECT count(*)::text FROM product_audit_events WHERE aggregate_type = 'canary_envelope') AS audit,
         (SELECT count(*)::text FROM outbox_messages) AS outbox`,
    );
    expect(counts.rows[0]).toEqual({ audit: "1", outbox: "0" });
  });

  it("composes Canary and Live same-origin routes from bounded local-profile facts", async () => {
    const lineage = await seedApprovedLineage("source-backed");
    const created = await mutation(bobby, payload(lineage, "source-backed-canary-predecessor"));
    expect(created.statusCode).toBe(201);
    const profileReads = ctx.app.get(ProfileReadService);
    const profile = (brokerStatus: string) => ({
      schema_version: "execution.profile-read.v1",
      screen_id: "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      environment: "live",
      profile_id: "LIVE_BINANCE_USDM",
      delivery_profile: "LIVE_BINANCE_USDM",
      state: "ready",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of: "2026-09-02T08:00:00.000Z",
      read_at: "2026-09-02T08:00:01.000Z",
      source_side_effect_requested: false,
      capabilities: [
        "positions", "orders", "fills", "sessions", "account_balances",
        "margin_balances", "account_sync", "broker_sync", "reconciliation",
      ].map((key) => ({ capability_id: `source.${key}`, state: "AVAILABLE", reason_code: null })),
      unavailable_branches: [],
      data: {
        deployments: [{ deployment_id: lineage.deploymentId, account_id: "account_alpha", mode: "live" }],
        positions: [{ position_id: "pos_live", deployment_id: lineage.deploymentId, account_id: "account_alpha", notional: "6123.000000000000000001", realized_pnl: "5.1", unrealized_pnl: "0.000000000000000009" }],
        orders: [{ order_id: "ord_live", deployment_id: lineage.deploymentId, account_id: "account_alpha", status: "OPEN" }],
        fills: [{ fill_id: "fill_live", deployment_id: lineage.deploymentId, account_id: "account_alpha" }],
        sessions: [{ execution_session_id: "session_live", deployment_id: lineage.deploymentId, account_id: "account_alpha" }],
        account_balances: [{ account_id: "account_alpha", currency: "USDT", total: "10000.000000000000000001" }],
        margin_balances: [{ account_id: "account_alpha", initial: "500.000000000000000001" }],
        account_sync: [{ account_id: "account_alpha", status: "CURRENT" }],
        broker_sync: [{ account_id: "account_alpha", currency: "USDT", status: brokerStatus, buying_power: "9999.5", synced_at: "2026-09-02T08:00:00.000Z" }],
        reconciliation: [],
      },
      projection: {
        epoch: "epoch-live", sequence: 9, sourceCursor: "cursor-live",
        payloadDigest: `sha256:${"c".repeat(64)}`,
        lastSuccessfulRefreshAt: "2026-09-02T08:00:00.000Z",
      },
    });

    vi.spyOn(profileReads, "snapshot").mockResolvedValueOnce(profile("SYNCED") as never);
    const canary = await inject(
      reader,
      `/api/v1/execution/deployments/${lineage.deploymentId}/canary?workspace_id=${workspaceId}`,
    );
    expect(canary.statusCode).toBe(200);
    expect(canary.json()).toMatchObject({
      source_integration_state: "SOURCE_BACKED",
      positions: { exact_total: 1, returned_count: 1 },
      blotter: { exact_total: 1, returned_count: 1 },
      envelope_compliance: {
        consumed: { capital: "500.000000000000000001", gross_notional: "6123.000000000000000001", open_orders: 1 },
      },
    });

    vi.spyOn(profileReads, "snapshot").mockResolvedValueOnce(profile("STALE") as never);
    const live = await inject(
      reader,
      `/api/v1/execution/deployments/${lineage.deploymentId}/live?workspace_id=${workspaceId}`,
    );
    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({
      source_integration_state: "SOURCE_BACKED",
      positions: { exact_total: 1, returned_count: 1 },
      orders: { exact_total: 1, returned_count: 1 },
      broker_consistency: {
        state: "UNAVAILABLE",
        broker_values_visible: false,
        blocker_codes: ["BROKER_STATE_UNAVAILABLE"],
      },
      projection_continuity: { state: "CONTIGUOUS", epoch: "epoch-live", sequence: 9 },
    });
    expect(live.json().projection_continuity.cursor).toBeNull();
    expect(JSON.stringify(live.json())).not.toContain("cursor-live");
    expect(live.json().kpis.find((item: { key: string }) => item.key === "broker_equity").value)
      .toBeNull();

    // EDS-03: current Live source truth is useful before Portal-owned canary
    // governance exists.  It must preserve the rich Live screen, but must not
    // invent a position aggregate without published currency/mark lineage.
    const sourceOnlyDeploymentId = "dep_current_source_only";
    const sourceOnly = profile("SYNCED");
    sourceOnly.data = {
      ...sourceOnly.data,
      deployments: [{ deployment_id: sourceOnlyDeploymentId, account_id: "account_alpha", mode: "live" }],
      positions: [{ position_id: "pos_source_only", deployment_id: sourceOnlyDeploymentId, account_id: "account_alpha", notional: "17.000000000000000001" }],
      orders: [{ order_id: "ord_source_only", deployment_id: sourceOnlyDeploymentId, account_id: "account_alpha", status: "OPEN" }],
    };
    vi.spyOn(profileReads, "snapshot").mockResolvedValueOnce(sourceOnly as never);
    const withoutCanary = await inject(
      reader,
      `/api/v1/execution/deployments/${sourceOnlyDeploymentId}/live?workspace_id=${workspaceId}`,
    );
    expect(withoutCanary.statusCode).toBe(200);
    expect(withoutCanary.json()).toMatchObject({
      source_integration_state: "SOURCE_BACKED",
      predecessor_canary_envelope: null,
      deployment: { deployment_id: sourceOnlyDeploymentId },
      positions: { exact_total: 1, returned_count: 1 },
      orders: { exact_total: 1, returned_count: 1 },
      production_command_active: false,
    });
    expect(withoutCanary.json().kpis.find((item: { key: string }) => item.key === "gross_notional"))
      .toMatchObject({ value: null, qualification_reason_code: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED" });
  });

  it("rejects Live Full Operations without a canary predecessor or workspace access", async () => {
    const noPredecessor = await inject(
      reader,
      `/api/v1/execution/deployments/dep_missing_live/live?workspace_id=${workspaceId}`,
    );
    expect(noPredecessor.statusCode).toBe(404);
    expect(noPredecessor.json().error.code).toBe("CANARY_ENVELOPE_NOT_FOUND");
    const foreignWorkspace = await inject(
      reader,
      "/api/v1/execution/deployments/dep_missing_live/live?workspace_id=foreign-workspace",
    );
    expect(foreignWorkspace.statusCode).toBe(404);
    expect(foreignWorkspace.json().error.code).toBe("WORKSPACE_NOT_FOUND");
  });

  it("replays equal requests, rejects drift and appends an exact predecessor revision", async () => {
    const lineage = await seedApprovedLineage("revision");
    const firstPayload = payload(lineage, "canary-revision-one");
    const first = await mutation(bobby, firstPayload);
    expect(first.statusCode).toBe(201);
    const replay = await mutation(bobby, firstPayload);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toMatchObject({ replayed: true, envelope: { revision: 1 } });
    const drift = await mutation(bobby, {
      ...firstPayload,
      limits: { ...firstPayload.limits, capital_cap: "5001" },
    });
    expect(drift.statusCode).toBe(409);
    expect(drift.json().error.code).toBe("REQUEST_KEY_CANARY_ENVELOPE_CONFLICT");

    const second = await mutation(
      bobby,
      payload(lineage, "canary-revision-two", first.json().envelope.envelope_id),
    );
    expect(second.statusCode).toBe(201);
    expect(second.json()).toMatchObject({
      envelope: { revision: 2, previous_envelope_id: first.json().envelope.envelope_id },
    });
    const stalePredecessor = await mutation(bobby, payload(lineage, "canary-revision-three", null));
    expect(stalePredecessor.statusCode).toBe(409);
    expect(stalePredecessor.json().error.code).toBe("CANARY_ENVELOPE_PREDECESSOR_CONFLICT");
  });

  it("enforces role, CSRF, current evidence and exact decimal safety", async () => {
    const lineage = await seedApprovedLineage("guards");
    expect((await mutation(reader, payload(lineage, "canary-user-denied"))).statusCode).toBe(403);
    const missingCsrf = await inject(bobby, "/api/v1/execution/governance/canary-envelopes", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ctx.config.PORTAL_PUBLIC_ORIGIN },
      payload: payload(lineage, "canary-no-csrf"),
    });
    expect(missingCsrf.statusCode).toBe(403);
    const invalidLoss = payload(lineage, "canary-invalid-loss");
    invalidLoss.limits.daily_loss_cap = "5001";
    expect((await mutation(bobby, invalidLoss)).statusCode).toBe(400);

    await ctx.pool.query(
      `INSERT INTO governance_sandbox_step_evidence
         (evidence_id, certification_id, workspace_id, step_key, source_authority,
          evaluation_state, evidence_hash, evidence_schema_version,
          source_verification_state, summary, as_of, expires_at)
       VALUES ($1, $2, $3, 'SYNC', 'BROKER', 'PASS', $4, 'sandbox-step.v1',
               'VERIFIED', 'Newer evidence has already expired and invalidates approval.',
               now() - interval '2 hours', now() - interval '1 hour')`,
      [`evidence_${lineage.certificationId}_stale`, lineage.certificationId,
        workspaceId, `sha256:${"c".repeat(64)}`],
    );
    const stale = await mutation(bobby, payload(lineage, "canary-stale-evidence"));
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("CANARY_CERTIFICATION_EVIDENCE_STALE");
  });

  it("serializes concurrent equal creates and rejects mutation of stored envelopes", async () => {
    const lineage = await seedApprovedLineage("concurrent");
    const body = payload(lineage, "canary-concurrent-create");
    const [left, right] = await Promise.all([mutation(bobby, body), mutation(bobby, body)]);
    expect([left.statusCode, right.statusCode]).toEqual([201, 201]);
    expect([left.json().replayed, right.json().replayed].sort()).toEqual([false, true]);
    const rows = await ctx.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM governance_canary_envelopes
       WHERE workspace_id = $1 AND deployment_id = $2`,
      [workspaceId, lineage.deploymentId],
    );
    expect(rows.rows[0].count).toBe("1");
    await expect(ctx.pool.query(
      `UPDATE governance_canary_envelopes SET reason = 'Mutation must fail.'
       WHERE workspace_id = $1 AND deployment_id = $2`,
      [workspaceId, lineage.deploymentId],
    )).rejects.toThrow(/append-only|immutable/i);
  });
});
