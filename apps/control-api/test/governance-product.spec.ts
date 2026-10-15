import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { projectionDigest } from "../src/execution/profile-projection.repository";
import { assertCaptureContract, assertReviewContextContract } from "./contract-validator";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { GovernanceGrantsRepository } from "../src/repos/governance-grants";
import { GovernanceReviewCaptureService } from "../src/governance/review-capture.service";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const ARTIFACT_HASH = `sha256:${"a".repeat(64)}`;

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
    (item): item is string =>
      typeof item === "string" && item.startsWith("__Host-portal_csrf="),
  );
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1];
}

describe("N29 governance product closeout", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let bobby: Actor;
  let lan: Actor;
  let stan: Actor;
  let workspaceId: string;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    ctx = await setupApp({
      AUTH_MODE: "dev",
      FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT: "true",
    });
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
    bobby = await createActor("bobby-n29", "ADMIN");
    lan = await createActor("lan-n29", "ADMIN");
    stan = await createActor("stan-n29", "USER");
    /*
     * A4-3 · the R1/R2 gates are capabilities now, not roles.
     *
     * Before this, every ADMIN could read and decide every approval in every
     * workspace. §20.2 rule 3 narrows that to the owner plus whoever the owner
     * explicitly delegated, so this cast has to say which each actor is.
     *
     * `lan` is the case the phase exists for: an ADMIN whose authority to
     * decide now comes from a grant rather than from the role. `stan` stays
     * ungranted, so every "USER is read-only" assertion below keeps testing
     * what it always tested.
     */
    // The anchor is a singleton and specs share a database: clear it first so
    // this file's owner is this file's owner, whichever spec ran before it.
    await ctx.pool.query("DELETE FROM portal_owner_anchor");
    await new OwnerAccessRepository(ctx.pool).claimOwner({
      userId: bobby.userId,
      claimedBy: "governance-product-spec",
    });
    const __grants = new GovernanceGrantsRepository(ctx.pool);
    for (const capability of ["governance.r1.decide", "governance.r2.decide"] as const) {
      await __grants.insertGrant({
        grantId: `grn_governance-product-spec_${capability.replaceAll(".", "_")}`,
        granteeUserId: lan.userId,
        capability,
        workspaceId: null,
        issuedBy: bobby.userId,
      });
    }
    const workspaces = await request(bobby, "/api/workspaces");
    workspaceId = workspaces.json().workspaces[0].workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'MEMBER'), ($1, $3, 'MEMBER')`,
      [workspaceId, lan.userId, stan.userId],
    );
  }, 30_000);

  afterAll(async () => teardownApp(ctx));

  beforeEach(async () => {
    await ctx.pool.query(
      `TRUNCATE governance_review_captures, governance_approval_decisions, governance_decision_plans,
                governance_approval_known_limitations, governance_approval_findings,
                governance_approval_evidence, governance_approval_requests,
                run_read_models, outbox_messages, product_audit_events CASCADE`,
    );
    await ctx.pool.query(
      `INSERT INTO run_read_models
         (run_id, workspace_id, owner_user_id, status, protocol, strategy_id,
          dataset_id, source_cursor, artifact_sha256, artifact_schema_version,
          artifact_creator_user_id, methodology_claim_ids, updated_at)
       VALUES ('run_n29', $1, $2, 'COMPLETED', 'BACKTEST', 'alpha_n29',
               'dataset_n29', 'cursor_n29', $3, 'quant.run-artifact.v1', $2,
               ARRAY['claim_n29'], '2026-08-30T12:00:00Z')`,
      [workspaceId, stan.userId, ARTIFACT_HASH],
    );
  });

  async function raw(url: string, options: Record<string, unknown> = {}) {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) headers["x-dev-access-email"] = "dev@azdag.com";
    // A browser attaches `Origin` to every non-GET request; so does this.
    const requestMethod = String(options.method ?? "GET").toUpperCase();
    if (requestMethod !== "GET" && requestMethod !== "HEAD" && !("origin" in headers)) {
      headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
    }
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url, ...options, headers });
  }

  async function request(actor: Actor, url: string, options: Record<string, unknown> = {}) {
    return raw(url, {
      ...options,
      headers: {
        cookie: actor.cookie,
        "x-dev-access-email": `${actor.username}@azdag.com`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  }

  async function mutation(actor: Actor, url: string, payload: unknown) {
    return request(actor, url, {
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
    const user = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(user!.userId);
    const first = await raw("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const changed = await raw("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(first),
        "x-portal-csrf": csrfCookie(first),
        "x-dev-access-email": `${username}@azdag.com`,
      },
      payload: {
        current_password: activationToken,
        new_password: `cedar-river-${username}-governance-safe`,
      },
    });
    expect(changed.statusCode).toBe(201);
    const login = await raw("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: `cedar-river-${username}-governance-safe` },
    });
    expect(login.statusCode).toBe(201);
    return { userId: user!.userId, username, cookie: cookies(login), csrf: csrfCookie(login) };
  }

  async function withConcurrentApprovalInsertDelay<T>(run: () => Promise<T>): Promise<T> {
    await ctx.pool.query(`
      CREATE OR REPLACE FUNCTION test_governance_approval_insert_delay() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.15);
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER test_governance_approval_insert_delay
      BEFORE INSERT ON governance_approval_requests
      FOR EACH ROW EXECUTE FUNCTION test_governance_approval_insert_delay();
    `);
    try {
      return await run();
    } finally {
      await ctx.pool.query(`
        DROP TRIGGER IF EXISTS test_governance_approval_insert_delay
          ON governance_approval_requests;
        DROP FUNCTION IF EXISTS test_governance_approval_insert_delay();
      `);
    }
  }

  function createPayload(requestKey = "n29-create-1", summary = "Ready for independent R1 review.") {
    return {
      schema_version: "governance.approval-create-request.v1",
      workspace_id: workspaceId,
      request_key: requestKey,
      gate: "R1",
      alpha_id: "alpha_n29",
      evidence_run_id: "run_n29",
      methodology_claim_id: "claim_n29",
      summary,
    };
  }

  it.each([
    ["role", "ADMIN_ROLE_REQUIRED", 403],
    ["grant", "GOVERNANCE_CAPABILITY_REQUIRED", 403],
    ["session", "SESSION_REQUIRED", 401],
    ["workspace", "WORKSPACE_ACCESS_DENIED", 403],
  ] as const)("rechecks capture %s inside its transaction even when the HTTP actor was loaded earlier", async (change, code, status) => {
    const actor = await createActor(`capture-fresh-${change}`, "ADMIN");
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'MEMBER')", [workspaceId, actor.userId]);
    const grants = new GovernanceGrantsRepository(ctx.pool);
    for (const gate of ["r1", "r2"] as const) await grants.insertGrant({
      grantId: `grn_capture_fresh_${change}_${gate}`, granteeUserId: actor.userId,
      capability: `governance.${gate}.read`, workspaceId, issuedBy: bobby.userId,
    });
    const stale = (await auth.users.findById(actor.userId))!;
    if (change === "role") await ctx.pool.query("UPDATE portal_users SET role='USER' WHERE user_id=$1", [actor.userId]);
    if (change === "grant") await ctx.pool.query("DELETE FROM portal_capability_grants WHERE grantee_user_id=$1", [actor.userId]);
    if (change === "session") await ctx.pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [actor.userId]);
    if (change === "workspace") await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspaceId, actor.userId]);
    const captures = ctx.app.get(GovernanceReviewCaptureService);
    await expect(captures.createR2(stale, {
      workspace_id: workspaceId, request_key: `capture-stale-${change}`,
      summary: "Technical negative authority regression; no source capture.",
      r1_approval_id: "apr_not_read", expected_r1_version: 1, portfolio_id: "pf_not_read",
      currency: "USDT", deployment_id: "dep_not_read", risk_grant_id: "risk_not_read",
      expected_projection_digest: ARTIFACT_HASH,
    }, `capture-stale-${change}`)).rejects.toMatchObject({ code, status });
    expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM governance_review_captures WHERE actor_user_id=$1", [actor.userId])).rows[0].count).toBe(0);
  });

  it("pins server-owned evidence, is idempotent and rejects duplicate open work", async () => {
    const missingCsrf = await request(stan, "/api/v1/execution/governance/approvals", {
      method: "POST",
      payload: createPayload(),
    });
    expect(missingCsrf.statusCode).toBe(403);

    const created = await mutation(stan, "/api/v1/execution/governance/approvals", createPayload());
    expect(created.statusCode).toBe(201);
    expect(created.json().replayed).toBe(false);
    expect(created.json().approval.requester.user_id).toBe(stan.userId);
    expect(created.json().approval.creator.user_id).toBe(stan.userId);
    expect(created.json().approval.evidence_complete).toBe(true);

    const replayed = await mutation(stan, "/api/v1/execution/governance/approvals", createPayload());
    expect(replayed.statusCode).toBe(201);
    expect(replayed.json().replayed).toBe(true);
    expect(replayed.json().approval.approval_id).toBe(created.json().approval.approval_id);

    const keyConflict = await mutation(
      stan,
      "/api/v1/execution/governance/approvals",
      createPayload("n29-create-1", "A materially different approval request summary."),
    );
    expect(keyConflict.statusCode).toBe(409);
    expect(keyConflict.json().error.code).toBe("REQUEST_KEY_PAYLOAD_CONFLICT");

    const duplicate = await mutation(
      stan,
      "/api/v1/execution/governance/approvals",
      createPayload("n29-create-2"),
    );
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("DUPLICATE_OPEN_APPROVAL");
    expect(duplicate.json().details.approval_id).toBe(created.json().approval.approval_id);

    const stored = await ctx.pool.query(
      `SELECT request.source_run_id, request.methodology_claim_id, evidence.sha256,
              evidence.source_reference, audit.event_type
         FROM governance_approval_requests request
         JOIN governance_approval_evidence evidence USING (approval_id)
         JOIN product_audit_events audit ON audit.aggregate_id = request.approval_id`,
    );
    expect(stored.rows).toEqual([
      expect.objectContaining({
        source_run_id: "run_n29",
        methodology_claim_id: "claim_n29",
        sha256: ARTIFACT_HASH,
        source_reference: "run_n29",
        event_type: "governance.r1_request.created",
      }),
    ]);
  });

  it("creates and independently decides Portal-local R2 before Paper Exit, without fabricating source evidence or executing upstream", async () => {
    const created = await mutation(stan,"/api/v1/execution/governance/approvals",createPayload("ar06-r1"));
    expect(created.statusCode,JSON.stringify(created.json())).toBe(201);
    const r1Id=created.json().approval.approval_id;
    const initial = await request(lan, `/api/v1/execution/governance/approvals/${r1Id}/r1?workspace_id=${workspaceId}`);
    expect(initial.statusCode).toBe(200);
    const decision = initial.json().data.decision_context;
    assertReviewContextContract(decision, "DecisionContext");
    expect(decision).toMatchObject({ workspace_id: workspaceId, approval_id: r1Id, expected_approval_version: 1,
      evidence_hashes: [ARTIFACT_HASH], availability: { state: "AVAILABLE", reason_code: null } });
    const decisionInput = {
      schema_version:decision.request_schema_version,workspace_id:decision.workspace_id,request_key:"ar06-r1-plan",
      command_type:decision.command_type,command_version:1,target:{ approval_id:decision.approval_id },expected_approval_version:decision.expected_approval_version,
      payload:{ decision:"APPROVE",reason:"Independent accepted research evidence review.",conditions:[],evidence_hashes:decision.evidence_hashes },
    };
    const missingHashes = await mutation(lan, decision.plan_path, { ...decisionInput, request_key: "ar06-empty-hashes",
      payload: { ...decisionInput.payload, evidence_hashes: [] } });
    expect(missingHashes.statusCode).toBe(201);
    expect(missingHashes.json().blockers).toContainEqual({ code: "EVIDENCE_HASH_MISMATCH" });
    const planned=await mutation(lan,decision.plan_path,decisionInput);
    expect(planned.statusCode,JSON.stringify(planned.json())).toBe(201);
    expect(planned.json().blockers).toEqual([]);
    const applied=await mutation(lan,`/api/v1/execution/operations/${planned.json().operation_id}/apply`,{
      schema_version:"governance.r1-decision-apply-request.v1",workspace_id:workspaceId,apply_token:planned.json().apply_token,
    });
    expect(applied.statusCode,JSON.stringify(applied.json())).toBe(202);

    // Trusted fixture input is an admitted source projection, not INSERTs of
    // governance workflow rows. Every review/finding/lineage is produced by HTTP.
    const relation=(fields:Record<string,string>[])=>({ availability:"AVAILABLE",freshness:"FRESH",completeness:"COMPLETE",
      as_of:new Date().toISOString(),items:fields.map(fields=>({ fields,lineage:{ workspace_id:workspaceId,profile_id:"PAPER_BINANCE_USDM",source_contract_revision:"accepted-test-v1" } })) });
    const document={ schema_version:"portal.execution.profile-projection.v1",workspace_id:workspaceId,environment:"paper",
      profile_id:"PAPER_BINANCE_USDM",source_contract_revision:"accepted-test-v1",relations:{
        "manager.deployments:strategy_deployments":relation([{ deployment_id:"dep_ar06",strategy_id:"alpha_n29",portfolio_id:"pf_ar06",account_id:"acc_ar06",venue:"BINANCE" }]),
        "manager.risk:risk_grants":relation([{ risk_grant_id:"risk_ar06",strategy_id:"alpha_n29",account_id:"acc_ar06" }]),
        "manager.portfolios:portfolios":relation([{ portfolio_id:"pf_ar06" }]),
      } };
    const digest=projectionDigest(document);
    Object.assign(ctx.config,{ FEATURE_EXECUTION_LOCAL_PROJECTION:"true",FEATURE_EXECUTION_CURRENT_SOURCE_PAPER:"true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:workspaceId,EXECUTION_EDGE_PAPER_PROFILE_ID:"PAPER_BINANCE_USDM" });
    await ctx.pool.query(`INSERT INTO execution_profile_projection_snapshots
      (workspace_id,environment,profile_id,source_contract_revision,source_epoch,source_cursor,source_as_of,received_at,last_successful_refresh_at,
       completeness,projection_epoch,projection_sequence,payload_digest,payload)
      VALUES ($1,'paper','PAPER_BINANCE_USDM','accepted-test-v1','epoch','cursor',now(),now(),now(),'COMPLETE',
       '00000000-0000-4000-8000-000000000086',1,$2,$3)`,[workspaceId,digest,JSON.stringify(document)]);
    const accepted = await request(bobby, `/api/v1/execution/governance/approvals/${r1Id}/r1?workspace_id=${workspaceId}`);
    expect(accepted.statusCode).toBe(200);
    const captureContext = accepted.json().data.capture_context;
    assertReviewContextContract(captureContext, "CaptureContext");
    expect(captureContext).toMatchObject({ action: "R2_CREATE", parent_approval_id: r1Id, expected_parent_version: 2,
      expected_projection_digest: digest, availability: { state: "AVAILABLE", reason_code: null },
      candidates: [{ deployment_id: "dep_ar06", portfolio_id: "pf_ar06", risk_grant_id: "risk_ar06", currency: null }] });
    const candidate = captureContext.candidates[0];
    const r2Input={ workspace_id:captureContext.workspace_id,request_key:"ar06-r2",summary:"Capture Portal review; no source verdict asserted.",
      r1_approval_id:captureContext.parent_approval_id,expected_r1_version:captureContext.expected_parent_version,
      portfolio_id:candidate.portfolio_id,currency:"USDT",deployment_id:candidate.deployment_id,risk_grant_id:candidate.risk_grant_id,
      expected_projection_digest:captureContext.expected_projection_digest };
    const ungrantedAdmin = await createActor("ungranted-capture-admin", "ADMIN");
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'MEMBER')", [workspaceId, ungrantedAdmin.userId]);
    expect((await mutation(ungrantedAdmin, "/api/v1/execution/governance/r2/capture", { ...r2Input, request_key: "ar06-ungranted-admin" })).statusCode).toBe(403);
    await new GovernanceGrantsRepository(ctx.pool).insertGrant({ grantId: "grn_capture_r1_read_only", granteeUserId: ungrantedAdmin.userId,
      capability: "governance.r1.read", workspaceId, issuedBy: bobby.userId });
    const readOnlyParent = await request(ungrantedAdmin, `/api/v1/execution/governance/approvals/${r1Id}/r1?workspace_id=${workspaceId}`);
    expect(readOnlyParent.statusCode).toBe(200);
    expect(readOnlyParent.json().data.capture_context.availability.reason_code).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
    expect((await mutation(ungrantedAdmin, "/api/v1/execution/governance/r2/capture", { ...r2Input, request_key: "ar06-parent-read-only" })).statusCode).toBe(403);
    expect((await mutation(stan,"/api/v1/execution/governance/r2/capture",r2Input)).statusCode).toBe(403);
    expect((await mutation(bobby,"/api/v1/execution/governance/r2/capture",{ ...r2Input,workspace_id:"no-access" })).statusCode).toBe(404);
    expect((await mutation(bobby,"/api/v1/execution/governance/r2/capture",{ ...r2Input,risk_grant_id:"wrong-account" })).statusCode).toBe(422);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM governance_review_captures")).rows[0].n).toBe(0);
    // A late audit failure must roll back the review and every child row,
    // leaving the same idempotency key usable for the successful retry.
    await ctx.pool.query(`CREATE FUNCTION test_capture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='governance.review.captured' THEN RAISE EXCEPTION 'test audit unavailable'; END IF;
      RETURN NEW; END; $$;
      CREATE TRIGGER test_capture_audit_failure BEFORE INSERT ON product_audit_events
      FOR EACH ROW EXECUTE FUNCTION test_capture_audit_failure()`);
    try {
      expect((await mutation(bobby,"/api/v1/execution/governance/r2/capture",r2Input)).statusCode).toBe(500);
      expect((await ctx.pool.query("SELECT count(*)::int n FROM governance_approval_requests WHERE gate='R2'")).rows[0].n).toBe(0);
      expect((await ctx.pool.query("SELECT count(*)::int n FROM governance_review_captures")).rows[0].n).toBe(0);
      expect((await ctx.pool.query("SELECT count(*)::int n FROM governance_r2_lineage")).rows[0].n).toBe(0);
    } finally {
      await ctx.pool.query("DROP TRIGGER test_capture_audit_failure ON product_audit_events; DROP FUNCTION test_capture_audit_failure()");
    }
    const parallel=await Promise.all(Array.from({ length:4 },()=>mutation(bobby,"/api/v1/execution/governance/r2/capture",r2Input)));
    for (const result of parallel) expect(result.statusCode,JSON.stringify(result.json())).toBe(201);
    expect(new Set(parallel.map(item=>item.json().approval_id)).size).toBe(1);
    expect(parallel.filter(item=>!item.json().replayed)).toHaveLength(1);
    const r2=parallel[0].json();
    assertCaptureContract(r2);
    const r2Review = await request(bobby,`${r2.read_path}?workspace_id=${workspaceId}`);
    expect(r2Review.statusCode).toBe(200);
    const r2Data = r2Review.json().data;
    assertReviewContextContract(r2Data.decision_context, "DecisionContext");
    assertReviewContextContract(r2Data.capture_context, "CaptureContext");
    expect(r2Data.decision_context).toMatchObject({ command_type: "GOVERNANCE_R2_DECISION",
      request_schema_version: "governance.r2-decision-plan-request.v1",
      evidence_hashes: [ARTIFACT_HASH], source_side_effect_requested: false });
    // Bobby captured this review: owner authority does not waive its SoD.
    expect(r2Data.eligibility).toMatchObject({ can_approve: false, can_approve_with_condition: false,
      can_deny: true, can_request_changes: false, locks: expect.arrayContaining(["SELF_APPROVAL"]) });
    expect(r2Data.approval).toMatchObject({ evidence_complete: true, blocker_count: 0, status: "PENDING" });
    expect(r2Data.capture_context.availability).toEqual({ state: "BLOCKED", reason_code: "R2_APPROVAL_REQUIRED" });
    expect(r2Data.r1_reference.href).toBe(`/governance/approvals/${r1Id}/r1?workspace_id=${workspaceId}`);
    expect(r2Data.decision_evidence_manifest.manifest_hash).toBe(r2Data.approval.evidence_set_hash);
    expect(r2Data.decision_evidence_manifest.manifest_hash).not.toBe(r2Data.r1_reference.digest);
    const mismatch = await mutation(bobby, "/api/v1/execution/commands/plans", {
      ...decisionInput, request_key: "ar06-no-r1-alias", target: { approval_id: r2.approval_id }, expected_approval_version: 1,
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().error.code).toBe("GOVERNANCE_DECISION_GATE_MISMATCH");
    expect((await mutation(bobby,"/api/v1/execution/governance/r2/capture",{ ...r2Input,summary:"Changed intent must not replay previous result." })).statusCode).toBe(409);
    const premature = await mutation(bobby, "/api/v1/execution/governance/paper-exit/create", {
      workspace_id: workspaceId, request_key: "ar06-premature-exit", summary: "A pending R2 is not an accepted capital review.",
      r2_approval_id: r2.approval_id, expected_r2_version: 1,
      deployment_id: candidate.deployment_id, expected_projection_digest: digest,
    });
    expect(premature.statusCode).toBe(422);
    expect(premature.json().error.code).toBe("R2_APPROVAL_REQUIRED");

    // Use the independent reviewer's same-read command pins, not R1 command
    // aliases or SQL transitions. This records Portal approval only.
    const independent = await request(lan, `${r2.read_path}?workspace_id=${workspaceId}`);
    expect(independent.statusCode).toBe(200);
    expect(independent.json().data.eligibility).toMatchObject({ can_approve: true, locks: [] });
    const r2Decision = independent.json().data.decision_context;
    assertReviewContextContract(r2Decision, "DecisionContext");
    const r2Plan = await mutation(lan, r2Decision.plan_path, {
      schema_version: r2Decision.request_schema_version, workspace_id: r2Decision.workspace_id,
      request_key: "ar06-r2-approve", command_type: r2Decision.command_type, command_version: 1,
      target: { approval_id: r2Decision.approval_id }, expected_approval_version: r2Decision.expected_approval_version,
      payload: { decision: "APPROVE", reason: "Independent Portal review accepts the immutable source references.",
        conditions: [], evidence_hashes: r2Decision.evidence_hashes },
    });
    expect(r2Plan.statusCode, JSON.stringify(r2Plan.json())).toBe(201);
    expect(r2Plan.json()).toMatchObject({ command_type: "GOVERNANCE_R2_DECISION", blockers: [] });
    const r2Apply = await mutation(lan, `/api/v1/execution/operations/${r2Plan.json().operation_id}/apply`, {
      schema_version: "governance.r2-decision-apply-request.v1", workspace_id: workspaceId,
      apply_token: r2Plan.json().apply_token,
    });
    expect(r2Apply.statusCode, JSON.stringify(r2Apply.json())).toBe(202);
    const acceptedR2 = await request(bobby, `${r2.read_path}?workspace_id=${workspaceId}`);
    expect(acceptedR2.statusCode).toBe(200);
    expect(acceptedR2.json().data.approval).toMatchObject({ status: "APPROVED", approval_version: 2 });
    const exitContext = acceptedR2.json().data.capture_context;
    assertReviewContextContract(exitContext, "CaptureContext");
    expect(exitContext.availability).toEqual({ state: "AVAILABLE", reason_code: null });
    const exitInput={ workspace_id:exitContext.workspace_id,request_key:"ar06-exit",summary:"Insufficient accepted source evidence; record review, not promotion.",
      r2_approval_id:exitContext.parent_approval_id,expected_r2_version:exitContext.expected_parent_version,
      deployment_id:exitContext.candidates[0].deployment_id,expected_projection_digest:exitContext.expected_projection_digest };
    const exit=await mutation(bobby,"/api/v1/execution/governance/paper-exit/create",exitInput);
    expect(exit.statusCode,JSON.stringify(exit.json())).toBe(201);
    assertCaptureContract(exit.json());
    const review=await request(lan,`${exit.json().read_path}?workspace_id=${workspaceId}`);
    expect(review.statusCode,JSON.stringify(review.json())).toBe(200);
    expect(review.json().data.gate_met).toBe(false);
    expect(review.json().data.evaluation_state).toBe("UNAVAILABLE");
    expect(review.json().data.eligibility.can_approve).toBe(false);
    const reject=await mutation(lan,"/api/v1/execution/commands/plans",{
      schema_version:"governance.paper-exit-decision-plan-request.v1",workspace_id:workspaceId,request_key:"ar06-exit-reject",
      command_type:"GOVERNANCE_PAPER_EXIT_DECISION",command_version:1,target:{ review_id:exit.json().review_id },expected_review_version:1,
      payload:{ decision:"REJECT",reason:"Do not promote without accepted source policy evidence.",evidence_hashes:[ARTIFACT_HASH] },
    });
    expect(reject.statusCode,JSON.stringify(reject.json())).toBe(201);
    expect(reject.json().blockers).toEqual([]);
    const rejected=await mutation(lan,`/api/v1/execution/operations/${reject.json().operation_id}/apply`,{
      schema_version:"governance.paper-exit-decision-apply-request.v1",workspace_id:workspaceId,apply_token:reject.json().apply_token,
    });
    expect(rejected.statusCode,JSON.stringify(rejected.json())).toBe(202);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM governance_promotion_authority_grants")).rows[0].n).toBe(0);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM governance_approval_decisions WHERE approval_id=$1", [r2.approval_id])).rows[0].n).toBe(1);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM product_audit_events WHERE event_type='governance.review.captured'")).rows[0].n).toBe(2);
    await expect(ctx.pool.query("UPDATE governance_paper_exit_lineage SET label='tamper'")).rejects.toMatchObject({ code:"55000" });
    Object.assign(ctx.config,{ FEATURE_EXECUTION_LOCAL_PROJECTION:"false",FEATURE_EXECUTION_CURRENT_SOURCE_PAPER:"false" });
  });

  it("fails closed for missing/ineligible evidence and workspace scope", async () => {
    const missing = await mutation(stan, "/api/v1/execution/governance/approvals", {
      ...createPayload(),
      request_key: "missing-run",
      evidence_run_id: "run_missing",
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe("EVIDENCE_RUN_NOT_FOUND");

    await ctx.pool.query("UPDATE run_read_models SET status = 'RUNNING' WHERE run_id = 'run_n29'");
    const ineligible = await mutation(
      stan,
      "/api/v1/execution/governance/approvals",
      createPayload("ineligible-run"),
    );
    expect(ineligible.statusCode).toBe(422);
    expect(ineligible.json().error.code).toBe("EVIDENCE_RUN_NOT_ELIGIBLE");

    const crossWorkspace = await mutation(stan, "/api/v1/execution/governance/approvals", {
      ...createPayload("cross-workspace"),
      workspace_id: "ws_not_visible",
    });
    expect(crossWorkspace.statusCode).toBe(404);
  });

  it("serializes concurrent retries and duplicate alpha/run intents", async () => {
    await withConcurrentApprovalInsertDelay(async () => {
      const sameKey = await Promise.all(
        Array.from({ length: 4 }, () =>
          mutation(stan, "/api/v1/execution/governance/approvals", createPayload("n29-race-same")),
        ),
      );
      expect(sameKey.map((item) => item.statusCode)).toEqual([201, 201, 201, 201]);
      expect(new Set(sameKey.map((item) => item.json().approval.approval_id)).size).toBe(1);
      expect(sameKey.map((item) => item.json().replayed).sort()).toEqual([false, true, true, true]);
    });
    expect((await ctx.pool.query("SELECT 1 FROM governance_approval_requests")).rowCount).toBe(1);

    await ctx.pool.query(
      `TRUNCATE governance_approval_decisions, governance_decision_plans,
                governance_approval_known_limitations, governance_approval_findings,
                governance_approval_evidence, governance_approval_requests,
                outbox_messages, product_audit_events CASCADE`,
    );
    const distinctKeys = await Promise.all([
      mutation(stan, "/api/v1/execution/governance/approvals", createPayload("n29-race-a")),
      mutation(stan, "/api/v1/execution/governance/approvals", createPayload("n29-race-b")),
    ]);
    expect(distinctKeys.map((item) => item.statusCode).sort()).toEqual([201, 409]);
    expect(distinctKeys.find((item) => item.statusCode === 409)?.json().error.code)
      .toBe("DUPLICATE_OPEN_APPROVAL");
  });

  it("separates empty request scope, policy block and unavailable external panels", async () => {
    const emptyInbox = await request(
      bobby,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&view=ALL`,
    );
    expect(emptyInbox.statusCode).toBe(200);
    expect(emptyInbox.json().read_truth).toEqual({
      state: "EMPTY",
      reason_code: "NO_MATCHING_PORTAL_GOVERNANCE_RECORDS",
      scope: "REQUEST",
    });
    const emptyHistory = await request(
      bobby,
      `/api/v1/execution/governance/approvals/history?workspace_id=${workspaceId}`,
    );
    expect(emptyHistory.json().read_truth).toEqual(emptyInbox.json().read_truth);
    const emptyConditions = await request(
      bobby,
      `/api/v1/execution/governance/waivers?workspace_id=${workspaceId}`,
    );
    expect(emptyConditions.json().read_truth).toEqual(emptyInbox.json().read_truth);

    const created = await mutation(stan, "/api/v1/execution/governance/approvals", createPayload());
    expect(created.statusCode).toBe(201);
    const approvalId = created.json().approval.approval_id as string;
    await ctx.pool.query(
      `UPDATE governance_approval_requests
          SET evidence_complete = false, blocker_count = 1,
              blocker_summary = 'Evidence review is incomplete.'
        WHERE approval_id = $1`,
      [approvalId],
    );
    const blockedList = await request(
      lan,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&view=ALL`,
    );
    expect(blockedList.json()).toMatchObject({
      read_truth: { state: "AVAILABLE", reason_code: null, scope: "REQUEST" },
      page: { rows: [expect.objectContaining({ id: approvalId, inert: "BLOCKED" })] },
    });
    const detail = await request(
      lan,
      `/api/v1/execution/governance/approvals/${approvalId}/r1?workspace_id=${workspaceId}`,
    );
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.eligibility.locks).toContain("BLOCKING_FINDINGS");
    expect(detail.json().data.linked_panels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        panel_state: "unavailable",
        warnings: [expect.objectContaining({ code: "EXTERNAL_PROJECTION_NOT_COMMISSIONED" })],
      }),
    ]));
  });

  it("persists decision conditions and serves exact stateful keyset rows", async () => {
    const created = await mutation(stan, "/api/v1/execution/governance/approvals", createPayload());
    const approvalId = created.json().approval.approval_id as string;
    const plan = await mutation(lan, "/api/v1/execution/commands/plans", {
      schema_version: "governance.r1-decision-plan-request.v1",
      workspace_id: workspaceId,
      request_key: "n29-condition-plan",
      command_type: "GOVERNANCE_R1_DECISION",
      command_version: 1,
      target: { approval_id: approvalId },
      expected_approval_version: 1,
      payload: {
        decision: "APPROVE_WITH_CONDITION",
        reason: "Accept with a time-bounded operating condition.",
        conditions: [{
          text: "Keep paper exposure below the certified envelope.",
          owner: "risk-team",
          deadline: null,
          expires_at: "2099-09-03",
          blocking: true,
        }],
        evidence_hashes: [ARTIFACT_HASH],
      },
    });
    expect(plan.statusCode).toBe(201);
    expect(plan.json().blockers).toEqual([]);
    const applied = await mutation(
      lan,
      `/api/v1/execution/operations/${plan.json().operation_id}/apply`,
      {
        schema_version: "governance.r1-decision-apply-request.v1",
        workspace_id: workspaceId,
        apply_token: plan.json().apply_token,
      },
    );
    expect(applied.statusCode).toBe(202);

    const waiver = await request(
      bobby,
      `/api/v1/execution/governance/waivers?workspace_id=${workspaceId}&kind=WAIVER&limit=1`,
    );
    expect(waiver.statusCode).toBe(200);
    expect(waiver.json().schema_version).toBe("governance.conditions-register.v1");
    expect(waiver.json().page.total_count).toBe(1);
    expect(waiver.json().page.filtered_count).toBe(1);
    expect(waiver.json().page.rows[0]).toEqual(expect.objectContaining({
      approval_id: approvalId,
      kind: "WAIVER",
      state: "WAIVED",
      blocking: false,
    }));

    await ctx.pool.query(
      `INSERT INTO governance_approval_known_limitations
         (limitation_id, approval_id, ordinal, kind, label, statement, expires_at)
       VALUES ('lim_lapsed', $1, 1, 'RESTRICTION', 'Expired control',
               'This control is deliberately expired for the state transition test.',
               now() - interval '1 day')`,
      [approvalId],
    );
    const lapsed = await request(
      bobby,
      `/api/v1/execution/governance/waivers?workspace_id=${workspaceId}&state=LAPSED`,
    );
    expect(lapsed.statusCode).toBe(200);
    expect(lapsed.json().page.total_count).toBe(2);
    expect(lapsed.json().page.filtered_count).toBe(1);
    expect(lapsed.json().page.rows[0]).toEqual(expect.objectContaining({
      condition_id: "lim_lapsed",
      state: "LAPSED",
      blocking: true,
    }));
    // Membership/requester identity is not a Governance read grant. Command
    // Center must enforce the same condition visibility as the register.
    const ungrantedConditions = await request(
      stan,
      `/api/v1/execution/governance/waivers?workspace_id=${workspaceId}`,
    );
    // The existing list contract is a scoped empty page, not the 403 used
    // by an individual R1 detail read. Counts must hide the records too.
    expect(ungrantedConditions.statusCode).toBe(200);
    expect(ungrantedConditions.json().page.rows).toEqual([]);
    expect(ungrantedConditions.json().page.total_count).toBe(0);
    expect(ungrantedConditions.json().page.filtered_count).toBe(0);
    const ungrantedCommandCenter = await request(
      stan,
      `/api/v1/execution/command-center?workspace_id=${workspaceId}`,
    );
    expect(ungrantedCommandCenter.statusCode).toBe(200);
    expect(ungrantedCommandCenter.json().panels.today.items).not.toContainEqual(
      expect.objectContaining({ id: "condition:lim_lapsed" }),
    );
    for (const reader of [bobby, lan]) {
      const commandCenter = await request(
        reader,
        `/api/v1/execution/command-center?workspace_id=${workspaceId}`,
      );
      expect(commandCenter.statusCode).toBe(200);
      expect(commandCenter.json().panels.today.items).toContainEqual(expect.objectContaining({
        id: "condition:lim_lapsed",
        kind: "CONDITION_EXPIRY",
        href: "/governance/waivers",
      }));
    }
  });
});
