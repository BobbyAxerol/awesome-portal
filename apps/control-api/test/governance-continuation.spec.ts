import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { type EvidenceRecord } from "../src/governance/governance.repository";
import { computeEvidenceManifestHash, GovernanceService } from "../src/governance/governance.service";
import { PaperExitRepository } from "../src/governance/paper-exit.repository";
import { computePaperExitSourceSnapshotHash, PaperExitService } from "../src/governance/paper-exit.service";
import { GovernanceGrantsRepository } from "../src/repos/governance-grants";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const HASHES = ["a", "b", "c", "d"].map((char) => `sha256:${char.repeat(64)}`);
type Actor = { userId: string; username: string; cookie: string; csrf: string };
type Response = { headers: Record<string, unknown> };

function cookieHeader(response: Response): string {
  const raw = response.headers["set-cookie"];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0]).join("; ");
}

function csrf(response: Response): string {
  const value = cookieHeader(response).split("; ")
    .find((item) => item.startsWith("__Host-portal_csrf="));
  if (!value) throw new Error("csrf cookie missing");
  return value.slice(value.indexOf("=") + 1);
}

/**
 * GOV-C1: real disposable PostgreSQL + authenticated HTTP. The evidence seeded
 * below is deliberately TECHNICAL_SYNTHETIC, not a source-backed capture or a
 * receipt that the shared retained preview can promote to execution authority.
 */
describe("GOV-C1 continuation: independent local decisions and fresh authority", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let owner: Actor;
  let reviewer: Actor;
  let author: Actor;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let grantId: string;
  let sequence = 0;

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    ctx = await setupApp({ AUTH_MODE: "dev" });
    auth = new AuthService(ctx.pool, ctx.config, new Argon2CredentialService({
      memoryKib: ctx.config.ARGON2_MEMORY_KIB,
      iterations: ctx.config.ARGON2_ITERATIONS,
      parallelism: ctx.config.ARGON2_PARALLELISM,
    }));
    admin = new AdminService(ctx.pool, ctx.config, auth);
    owner = await createActor("gov-cont-owner", "ADMIN");
    reviewer = await createActor("gov-cont-reviewer", "ADMIN");
    author = await createActor("gov-cont-author", "USER");
    await ctx.pool.query("DELETE FROM portal_owner_anchor");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.userId, claimedBy: "GOV-C1-technical-test" });
    workspaceId = (await request(owner, "/api/workspaces")).json().workspaces[0].workspace_id;
    otherWorkspaceId = (await request(reviewer, "/api/workspaces")).json().workspaces
      .find((row: { owner_user_id: string }) => row.owner_user_id === reviewer.userId).workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'MEMBER'), ($1, $3, 'MEMBER')`,
      [workspaceId, reviewer.userId, author.userId],
    );
  }, 30_000);

  beforeEach(async () => {
    await ctx.pool.query(`TRUNCATE governance_approval_requests, product_audit_events, outbox_messages CASCADE`);
    await ctx.pool.query("DELETE FROM portal_capability_grants WHERE grantee_user_id = $1", [reviewer.userId]);
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'MEMBER') ON CONFLICT DO NOTHING`, [workspaceId, reviewer.userId],
    );
    grantId = `grn_gov_cont_${++sequence}`;
    const grants = new GovernanceGrantsRepository(ctx.pool);
    await grants.insertGrant({
      grantId, granteeUserId: reviewer.userId, capability: "governance.r1.decide",
      workspaceId, issuedBy: owner.userId,
    });
    await grants.insertGrant({
      grantId: `${grantId}_read`, granteeUserId: reviewer.userId, capability: "governance.r1.read",
      workspaceId, issuedBy: owner.userId,
    });
    for (const capability of ["governance.r2.decide", "governance.live.decide"] as const) {
      await grants.insertGrant({ grantId: `${grantId}_${capability.replaceAll(".", "_")}`,
        granteeUserId: reviewer.userId, capability, workspaceId, issuedBy: owner.userId });
    }
  });

  afterAll(async () => { if (ctx) await teardownApp(ctx); });

  async function raw(url: string, options: Record<string, unknown> = {}) {
    const headers: Record<string, string> = {
      "x-dev-access-email": "technical-test@azdag.com",
      ...((options.headers as Record<string, string>) ?? {}),
    };
    const method = String(options.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") headers.origin ??= ctx.config.PORTAL_PUBLIC_ORIGIN;
    return ctx.app.getHttpAdapter().getInstance().inject({ method: "GET", url, ...options, headers });
  }

  function request(actor: Actor, url: string, options: Record<string, unknown> = {}) {
    return raw(url, {
      ...options,
      headers: { cookie: actor.cookie, "x-dev-access-email": `${actor.username}@azdag.com`,
        ...((options.headers as Record<string, string>) ?? {}) },
    });
  }

  function mutate(actor: Actor, url: string, payload: unknown) {
    return request(actor, url, { method: "POST", payload,
      headers: { "content-type": "application/json", "x-portal-csrf": actor.csrf } });
  }

  async function createActor(username: string, role: "ADMIN" | "USER"): Promise<Actor> {
    await admin.createUser({ username, displayName: username, role });
    const user = (await auth.users.findByUsername(username))!;
    const { activationToken } = await admin.resetCredential(user.userId);
    const first = await raw("/api/auth/login", { method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken } });
    expect(first.statusCode).toBe(201);
    const password = `cedar-river-${username}-continuation-2026-safe`;
    const changed = await raw("/api/auth/change-password", { method: "POST",
      headers: { cookie: cookieHeader(first), "x-portal-csrf": csrf(first),
        "x-dev-access-email": `${username}@azdag.com` },
      payload: { current_password: activationToken, new_password: password } });
    expect(changed.statusCode).toBe(201);
    const login = await raw("/api/auth/login", { method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` }, payload: { username, credential: password } });
    expect(login.statusCode).toBe(201);
    return { userId: user.userId, username, cookie: cookieHeader(login), csrf: csrf(login) };
  }

  async function seedApproval(id: string, options: {
    requester?: Actor; quorum?: number; paper?: boolean; gate?: "R1" | "R2" | "LIVE_GATE";
  } = {}) {
    const requester = options.requester ?? author;
    const capturedAt = new Date("2026-10-12T00:00:00.000Z");
    const evidence: EvidenceRecord[] = (options.paper ? HASHES : HASHES.slice(0, 2)).map((sha256, ordinal) => ({
      evidenceId: `${id}_ev_${ordinal}`, ordinal, kind: ordinal === 0 ? "REPORT" : "ALPHA_ARTIFACT",
      label: "TECHNICAL_SYNTHETIC", displayValue: "Not a real capture", note: null,
      verification: "PASS", artifactId: `${id}_artifact_${ordinal}`, sha256, sizeBytes: "128",
      mediaType: "application/json", schemaVersion: "technical.synthetic.v1", sourceAuthority: "RESEARCH",
      sourceReference: "run_5512", required: true, capturedAt, retentionClass: "GOVERNANCE_LONG_TERM",
      accessPolicy: "WORKSPACE_APPROVER",
    }));
    await ctx.pool.query(
      `INSERT INTO governance_approval_requests
        (approval_id, workspace_id, gate, subject_type, subject_id, subject_label, environment,
         target_label, requester_user_id, requester_username, artifact_creator_user_id,
         artifact_creator_username, status, policy_version, quorum_required, evidence_set_hash,
         evidence_complete, blocker_count, sla_due_at, expires_at)
       VALUES ($1,$2,$3,$4,'av_continuation','Technical test',$5,'Technical test',
         $6,$7,$6,$7,'PENDING','approval.v3',$8,$9,true,0,
         now() + interval '6 hours', now() + interval '48 hours')`,
      [id, workspaceId, options.paper ? "PAPER_EXIT" : options.gate ?? "R1", options.paper ? "EXIT_REVIEW" : "ALPHA_VERSION",
        options.paper ? "PAPER" : "RESEARCH", requester.userId, requester.username,
        options.quorum ?? 1, computeEvidenceManifestHash(evidence)],
    );
    for (const item of evidence) {
      await ctx.pool.query(
        `INSERT INTO governance_approval_evidence
          (evidence_id,approval_id,ordinal,kind,label,display_value,verification,artifact_id,
           sha256,size_bytes,media_type,schema_version,source_authority,source_reference,
           required,captured_at,retention_class,access_policy)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [item.evidenceId, id, item.ordinal, item.kind, item.label, item.displayValue, item.verification,
          item.artifactId, item.sha256, item.sizeBytes, item.mediaType, item.schemaVersion,
          item.sourceAuthority, item.sourceReference, item.required, item.capturedAt, item.retentionClass, item.accessPolicy],
      );
    }
    if (!options.paper) await ctx.pool.query(
      `INSERT INTO governance_approval_findings
        (finding_id,approval_id,ordinal,label,outcome,blocking,policy_version,formula_version,basis_hashes,evaluated_at)
       VALUES ($1,$2,0,'Technical source link','PASS',false,'approval.v3','technical.v1',$3,now())`,
      [`${id}_finding`, id, [HASHES[0]]],
    );
    return evidence.map((item) => item.sha256);
  }

  function planBody(id: string, evidenceHashes: string[], options: { key?: string; version?: number; decision?: string } = {}) {
    return { schema_version: "governance.r1-decision-plan-request.v1", workspace_id: workspaceId,
      request_key: options.key ?? `gov-cont:${id}`, command_type: "GOVERNANCE_R1_DECISION", command_version: 1,
      target: { approval_id: id }, expected_approval_version: options.version ?? 1,
      payload: { decision: options.decision ?? "APPROVE", reason: "Independent technical review; no upstream execution.",
        evidence_hashes: evidenceHashes } };
  }

  function plan(actor: Actor, body: unknown) { return mutate(actor, "/api/v1/execution/commands/plans", body); }
  function apply(actor: Actor, operation: { operation_id: string; apply_token: string }, workspace = workspaceId) {
    return mutate(actor, `/api/v1/execution/operations/${operation.operation_id}/apply`, {
      schema_version: "governance.r1-decision-apply-request.v1", workspace_id: workspace, apply_token: operation.apply_token,
    });
  }

  async function noDecision(id: string) {
    const count = await ctx.pool.query("SELECT count(*)::integer AS count FROM governance_approval_decisions WHERE approval_id = $1", [id]);
    expect(count.rows[0].count).toBe(0);
  }

  async function revokeReviewer() {
    const revoked = await new GovernanceGrantsRepository(ctx.pool).revokeGrant({
      grantId, expectedRevision: 1, revokedBy: owner.userId,
    });
    expect(revoked?.state).toBe("REVOKED");
  }

  it("pins the checklist/read manifest through independent plan/apply and one immutable receipt", async () => {
    const id = "GOV-C1-PINS";
    const hashes = await seedApproval(id);
    const read = await request(reviewer, `/api/v1/execution/governance/approvals/${id}/r1?workspace_id=${workspaceId}`);
    expect(read.statusCode).toBe(200);
    const data = read.json().data;
    expect(data.eligibility.can_approve).toBe(true);
    expect(data.checklist[0].evidence_ref).toEqual({ kind: "REPORT", id: `${id}_artifact_0`, run_id: "run_5512" });
    const pins = data.decision_context;
    expect(pins).toMatchObject({ workspace_id: workspaceId, approval_id: id, expected_approval_version: 1,
      evidence_hashes: hashes, availability: { state: "AVAILABLE", reason_code: null } });
    const input = planBody(id, pins.evidence_hashes);
    const first = await plan(reviewer, input);
    expect(first.statusCode).toBe(201);
    expect(first.json().blockers).toEqual([]);
    const retry = await plan(reviewer, input);
    expect(retry.json().operation_id).toBe(first.json().operation_id);
    expect((await apply(reviewer, first.json())).statusCode).toBe(202);
    const replay = await apply(reviewer, first.json());
    expect(replay.statusCode).toBe(202);
    expect(replay.json().replayed).toBe(true);
    for (const [table, clause] of [
      ["governance_approval_decisions", "approval_id = $1"],
      ["product_audit_events", "aggregate_id = $1 AND event_type = 'governance.r1_decision.applied'"],
      ["outbox_messages", "aggregate_id = $1 AND event_type = 'governance.r1_decision.applied'"],
    ]) {
      expect((await ctx.pool.query(`SELECT count(*)::integer AS count FROM ${table} WHERE ${clause}`, [id])).rows[0].count).toBe(1);
    }
    expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM outbox_messages WHERE event_type LIKE 'execution.%'")).rows[0].count).toBe(0);
  });

  it("refuses request-key payload drift and wrong-actor token use without a decision", async () => {
    const id = "GOV-C1-INTENT";
    const hashes = await seedApproval(id);
    const first = await plan(reviewer, planBody(id, hashes));
    const conflict = await plan(reviewer, planBody(id, hashes, { decision: "DENY" }));
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("REQUEST_KEY_PAYLOAD_CONFLICT");
    expect((await apply(owner, first.json())).statusCode).toBe(404);
    await noDecision(id);
  });

  it("does not let the owner bypass separation of duties", async () => {
    const id = "GOV-C1-SELF";
    const hashes = await seedApproval(id, { requester: owner });
    const blocked = await plan(owner, planBody(id, hashes));
    expect(blocked.json().blockers).toContainEqual({ code: "SELF_APPROVAL_PROHIBITED" });
    await noDecision(id);
    const deny = await plan(owner, planBody(id, hashes, { key: "gov-cont:self-deny", decision: "DENY" }));
    expect(deny.json().blockers).toEqual([]);
    expect((await apply(owner, deny.json())).statusCode).toBe(202);
  });

  it("refuses an expired approval even when its previously issued plan is unexpired", async () => {
    const id = "GOV-C1-EXPIRED-AFTER-PLAN";
    const planned = await plan(reviewer, planBody(id, await seedApproval(id)));
    expect(planned.json().blockers).toEqual([]);
    await ctx.pool.query(`UPDATE governance_approval_requests
      SET created_at = now() - interval '2 days', sla_due_at = now() - interval '1 day',
          expires_at = now() - interval '1 second' WHERE approval_id = $1`, [id]);
    const denied = await apply(reviewer, planned.json());
    expect(denied.statusCode).toBe(409);
    expect(denied.json().error.code).toBe("APPROVAL_EXPIRED");
    await noDecision(id);
  });

  it("revalidates manifest bytes after a post-plan append rather than trusting the old aggregate column", async () => {
    const id = "GOV-C1-MANIFEST-APPEND";
    const planned = await plan(reviewer, planBody(id, await seedApproval(id)));
    await ctx.pool.query(
      `INSERT INTO governance_approval_evidence
        (evidence_id,approval_id,ordinal,kind,label,display_value,verification,artifact_id,
         sha256,size_bytes,media_type,schema_version,source_authority,source_reference,
         required,captured_at,retention_class,access_policy)
       SELECT $2, approval_id, 2, kind, label, display_value, verification, artifact_id,
         $3, size_bytes, media_type, schema_version, source_authority, source_reference,
         required, captured_at, retention_class, access_policy
       FROM governance_approval_evidence WHERE approval_id = $1 AND ordinal = 0`,
      [id, `${id}_late_evidence`, HASHES[2]],
    );
    const read = await request(reviewer, `/api/v1/execution/governance/approvals/${id}/r1?workspace_id=${workspaceId}`);
    expect(read.statusCode).toBe(409);
    expect(read.json().error.code).toBe("EVIDENCE_MANIFEST_INTEGRITY_FAILED");
    const denied = await apply(reviewer, planned.json());
    expect(denied.statusCode).toBe(409);
    expect(denied.json().error.code).toBe("EVIDENCE_MANIFEST_INTEGRITY_FAILED");
    await noDecision(id);
  });

  it("rechecks the fresh decide grant before first apply", async () => {
    const id = "GOV-C1-REVOKE-BEFORE-APPLY";
    const planned = await plan(reviewer, planBody(id, await seedApproval(id)));
    await revokeReviewer();
    const denied = await apply(reviewer, planned.json());
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
    await noDecision(id);
  });

  it("does not replay an already applied operation after the decide grant is revoked", async () => {
    const id = "GOV-C1-REVOKE-REPLAY";
    const planned = await plan(reviewer, planBody(id, await seedApproval(id)));
    expect((await apply(reviewer, planned.json())).statusCode).toBe(202);
    await revokeReviewer();
    expect((await apply(reviewer, planned.json())).statusCode).toBe(403);
    expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM governance_approval_decisions WHERE approval_id = $1", [id])).rows[0].count).toBe(1);
  });

  it("removes workspace membership immediately and rejects cross-workspace apply", async () => {
    const id = "GOV-C1-WORKSPACE";
    const planned = await plan(reviewer, planBody(id, await seedApproval(id)));
    const wrongWorkspace = await apply(reviewer, planned.json(), otherWorkspaceId);
    expect([403, 404]).toContain(wrongWorkspace.statusCode);
    await ctx.pool.query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [workspaceId, reviewer.userId]);
    const removed = await apply(reviewer, planned.json());
    expect(removed.statusCode).toBe(404);
    expect(removed.json().error.code).toBe("WORKSPACE_NOT_FOUND");
    await noDecision(id);
  });

  it("keeps the second reviewer on a stale plan from satisfying quorum", async () => {
    const id = "GOV-C1-CAS";
    const hashes = await seedApproval(id, { quorum: 2 });
    const first = await plan(owner, planBody(id, hashes));
    const second = await plan(reviewer, planBody(id, hashes));
    expect((await apply(owner, first.json())).statusCode).toBe(202);
    const stale = await apply(reviewer, second.json());
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("APPROVAL_VERSION_CONFLICT");
    const state = await ctx.pool.query("SELECT status, quorum_met, approval_version FROM governance_approval_requests WHERE approval_id = $1", [id]);
    expect(state.rows[0]).toMatchObject({ status: "PENDING", quorum_met: 1, approval_version: 2 });
  });

  it("appends both independent reviewers' immutable conditions before satisfying quorum two", async () => {
    const id = "GOV-C1-CONDITIONAL-QUORUM";
    const hashes = await seedApproval(id, { quorum: 2 });
    const condition = (text: string, actor: Actor) => ({
      text, owner: actor.userId, deadline: null, expires_at: null, blocking: true,
    });
    const firstConditions = [
      condition("Keep notional within the first reviewed limit.", owner),
      condition("Keep the first review's observation requirement.", owner),
    ];
    const secondConditions = [condition("Retain the independent review's capacity limit.", reviewer)];
    const firstBody = planBody(id, hashes, { key: "gov-cont:conditional-owner", decision: "APPROVE_WITH_CONDITION" });
    const first = await plan(owner, { ...firstBody, payload: { ...firstBody.payload, conditions: firstConditions } });
    expect(first.statusCode).toBe(201);
    expect(first.json().blockers).toEqual([]);
    expect((await apply(owner, first.json())).statusCode).toBe(202);
    expect((await ctx.pool.query(
      "SELECT status, quorum_met, approval_version FROM governance_approval_requests WHERE approval_id = $1", [id],
    )).rows[0]).toMatchObject({ status: "PENDING", quorum_met: 1, approval_version: 2 });

    const secondBody = planBody(id, hashes, { key: "gov-cont:conditional-reviewer", version: 2, decision: "APPROVE_WITH_CONDITION" });
    const second = await plan(reviewer, { ...secondBody, payload: { ...secondBody.payload, conditions: secondConditions } });
    expect(second.statusCode).toBe(201);
    expect(second.json().blockers).toEqual([]);
    expect((await apply(reviewer, second.json())).statusCode).toBe(202);
    expect((await ctx.pool.query(
      "SELECT status, quorum_met, approval_version FROM governance_approval_requests WHERE approval_id = $1", [id],
    )).rows[0]).toMatchObject({ status: "APPROVED_WITH_CONDITION", quorum_met: 2, approval_version: 3 });
    expect((await ctx.pool.query(
      "SELECT ordinal, kind, statement FROM governance_approval_known_limitations WHERE approval_id = $1 ORDER BY ordinal", [id],
    )).rows).toEqual([...firstConditions, ...secondConditions].map((entry, ordinal) => ({
      ordinal, kind: "WAIVER", statement: entry.text,
    })));
    const decisions = (await ctx.pool.query(
      "SELECT actor_user_id, conditions FROM governance_approval_decisions WHERE approval_id = $1 ORDER BY approval_version_after", [id],
    )).rows;
    expect(decisions).toEqual([
      { actor_user_id: owner.userId, conditions: firstConditions },
      { actor_user_id: reviewer.userId, conditions: secondConditions },
    ]);
    expect((await apply(owner, first.json())).json().replayed).toBe(true);
    expect((await apply(reviewer, second.json())).json().replayed).toBe(true);
    expect((await ctx.pool.query(
      "SELECT count(*)::integer AS count FROM governance_approval_known_limitations WHERE approval_id = $1", [id],
    )).rows[0].count).toBe(3);
  });

  it("uses an independent R2 command, pins its approved R1 parent, and rejects R1 alias before and after apply", async () => {
    const parentId = "GOV-C1-R2-PARENT";
    const parent = await plan(owner, planBody(parentId, await seedApproval(parentId)));
    expect((await apply(owner, parent.json())).statusCode).toBe(202);
    const id = "GOV-C1-R2-CHILD";
    const hashes = await seedApproval(id, { gate: "R2" });
    await ctx.pool.query(
      `INSERT INTO governance_approval_analytics_scopes (approval_id,workspace_id,portfolio_id,currency)
       VALUES ($1,$2,'PF_TECHNICAL','USDT')`, [id, workspaceId],
    );
    await ctx.pool.query(
      `INSERT INTO governance_r2_lineage
        (r2_approval_id,workspace_id,r1_approval_id,grant_id,grant_name,approver_role,plan_author_user_id,plan_author_username)
       VALUES ($1,$2,$3,'grn_technical_r2','Portal review only','ADMIN',$4,$5)`,
      [id, workspaceId, parentId, author.userId, author.username],
    );
    const read = await request(reviewer, `/api/v1/execution/governance/approvals/${id}/r2?workspace_id=${workspaceId}`);
    expect(read.statusCode).toBe(200);
    expect(read.json().data.decision_context).toMatchObject({ gate: "R2", command_type: "GOVERNANCE_R2_DECISION",
      evidence_hashes: hashes, availability: { state: "AVAILABLE", reason_code: null } });
    const body = { ...planBody(id, hashes), schema_version: "governance.r2-decision-plan-request.v1",
      command_type: "GOVERNANCE_R2_DECISION" };
    const planned = await plan(reviewer, body);
    expect(planned.statusCode).toBe(201);
    expect(planned.json().blockers).toEqual([]);
    const pins = await ctx.pool.query(
      `SELECT command_type,parent_approval_id,parent_approval_version,parent_evidence_set_hash,policy_version
       FROM governance_decision_plans WHERE operation_id = $1`, [planned.json().operation_id],
    );
    expect(pins.rows[0]).toMatchObject({ command_type: "GOVERNANCE_R2_DECISION", parent_approval_id: parentId,
      parent_approval_version: 2, policy_version: "approval.v3" });
    const alias = await apply(reviewer, planned.json());
    expect(alias.statusCode).toBe(409);
    expect(alias.json().error.code).toBe("GOVERNANCE_DECISION_GATE_MISMATCH");
    const applyPath = `/api/v1/execution/operations/${planned.json().operation_id}/apply`;
    const applied = await mutate(reviewer, applyPath, {
      schema_version: "governance.r2-decision-apply-request.v1", workspace_id: workspaceId,
      apply_token: planned.json().apply_token,
    });
    expect(applied.statusCode).toBe(202);
    expect((await apply(reviewer, planned.json())).statusCode).toBe(409);
    const terminalRead = await request(reviewer, `/api/v1/execution/governance/approvals/${id}/r2?workspace_id=${workspaceId}`);
    expect(terminalRead.statusCode).toBe(200);
    expect(terminalRead.json().data.approval.status).toBe("APPROVED");
    expect((await ctx.pool.query(
      "SELECT count(*)::integer AS count FROM product_audit_events WHERE aggregate_id = $1 AND event_type = 'governance.r2_decision.applied'", [id],
    )).rows[0].count).toBe(1);
    expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM outbox_messages WHERE event_type LIKE 'execution.%'")).rows[0].count).toBe(0);
  });

  it("rejects demoted R2 reviewer replay without revoking historical read access", async () => {
    const parentId = "GOV-C1-R2-DEMOTE-PARENT";
    const parentPlan = await plan(owner, planBody(parentId, await seedApproval(parentId)));
    expect((await apply(owner, parentPlan.json())).statusCode).toBe(202);
    const id = "GOV-C1-R2-DEMOTE-CHILD";
    const hashes = await seedApproval(id, { gate: "R2" });
    await ctx.pool.query(
      `INSERT INTO governance_r2_lineage
        (r2_approval_id,workspace_id,r1_approval_id,grant_id,grant_name,approver_role,plan_author_user_id,plan_author_username)
       VALUES ($1,$2,$3,'grn_technical_demote','Portal review only','ADMIN',$4,$5)`,
      [id, workspaceId, parentId, author.userId, author.username],
    );
    const requestBody = { ...planBody(id, hashes), schema_version: "governance.r2-decision-plan-request.v1",
      command_type: "GOVERNANCE_R2_DECISION" };
    const planned = await plan(reviewer, requestBody);
    expect(planned.statusCode).toBe(201);
    expect(planned.json().blockers).toEqual([]);
    const applyPath = `/api/v1/execution/operations/${planned.json().operation_id}/apply`;
    const applyBody = { schema_version: "governance.r2-decision-apply-request.v1", workspace_id: workspaceId,
      apply_token: planned.json().apply_token };
    expect((await mutate(reviewer, applyPath, applyBody)).statusCode).toBe(202);
    const staleActor = (await auth.users.findByUsername(reviewer.username))!;
    const governance = ctx.app.get(GovernanceService);
    await ctx.pool.query("UPDATE portal_users SET role = 'USER' WHERE user_id = $1", [reviewer.userId]);
    try {
      // Keep the exact decide grant: role and capability are independent
      // required axes, and a stale HTTP-loaded actor cannot bypass either.
      await expect(governance.apply(staleActor, workspaceId, planned.json().operation_id,
        applyBody.apply_token, "gov-cont:r2-demoted-apply", "GOVERNANCE_R2_DECISION"))
        .rejects.toMatchObject({ code: "APPROVER_ROLE_REQUIRED", status: 403 });
      await expect(governance.plan(staleActor, {
        commandType: "GOVERNANCE_R2_DECISION", workspaceId, requestKey: requestBody.request_key,
        approvalId: id, expectedApprovalVersion: 1, decision: "APPROVE",
        reason: requestBody.payload.reason, conditions: [], evidenceHashes: hashes,
      }, "gov-cont:r2-demoted-plan"))
        .rejects.toMatchObject({ code: "APPROVER_ROLE_REQUIRED", status: 403 });
      await expect(governance.operation(staleActor, workspaceId, planned.json().operation_id))
        .rejects.toMatchObject({ code: "APPROVER_ROLE_REQUIRED", status: 403 });
      const historical = await request(reviewer, `/api/v1/execution/governance/approvals/${id}/r2?workspace_id=${workspaceId}`);
      expect(historical.statusCode).toBe(200);
      expect(historical.json().data.approval.status).toBe("APPROVED");
      expect((await ctx.pool.query(
        "SELECT count(*)::integer AS count FROM governance_approval_decisions WHERE approval_id = $1", [id],
      )).rows[0].count).toBe(1);
    } finally {
      await ctx.pool.query("UPDATE portal_users SET role = 'ADMIN' WHERE user_id = $1", [reviewer.userId]);
    }
  });

  it("reads a real LIVE_GATE row without R2 alias or analytics scope but refuses an unpublished parent policy", async () => {
    const id = "GOV-C1-LIVE";
    const hashes = await seedApproval(id, { gate: "LIVE_GATE" });
    const read = await request(reviewer, `/api/v1/execution/governance/approvals/${id}/live?workspace_id=${workspaceId}`);
    expect(read.statusCode).toBe(200);
    expect(read.json().governance_backbone.data.decision_context).toMatchObject({ gate: "LIVE_GATE",
      command_type: "GOVERNANCE_LIVE_DECISION", availability: { state: "BLOCKED", reason_code: "LIVE_PARENT_NOT_PUBLISHED" } });
    const planned = await plan(reviewer, { ...planBody(id, hashes),
      schema_version: "governance.live-decision-plan-request.v1", command_type: "GOVERNANCE_LIVE_DECISION" });
    expect(planned.statusCode).toBe(201);
    expect(planned.json().blockers).toContainEqual({ code: "LIVE_PARENT_NOT_PUBLISHED" });
    const denied = await mutate(reviewer, `/api/v1/execution/operations/${planned.json().operation_id}/apply`, {
      schema_version: "governance.live-decision-apply-request.v1", workspace_id: workspaceId,
      apply_token: planned.json().apply_token,
    });
    expect(denied.statusCode).toBe(409);
    await noDecision(id);
    const r2Id = "GOV-C1-NOT-LIVE";
    await seedApproval(r2Id, { gate: "R2" });
    expect((await request(reviewer, `/api/v1/execution/governance/approvals/${r2Id}/live?workspace_id=${workspaceId}`)).statusCode).toBe(404);
  });

  it.each(["SAFE_EXTENSION", "APPENDED_EVIDENCE", "ROLE_REMOVED_BEFORE_APPLY", "ROLE_REMOVED_AFTER_APPLY"] as const)(
    "keeps Paper Exit same-read pins and fresh authority: %s", async (scenario) => {
    const id = `GOV-C1-PAPER-${scenario}`;
    const hashes = await seedApproval(id, { paper: true });
    await ctx.pool.query(
      `INSERT INTO governance_paper_exit_reviews
        (review_id,workspace_id,deployment_id,portfolio_id,venue,artifact_digest,r1_approval_id,
         r2_approval_id,observation_policy_id,observation_policy_version,observation_policy_digest,
         evidence_pack_id,evidence_pack_digest,evaluation_policy_version,evaluation_formula_version,
         source_snapshot_hash,observation_summary,recommendation)
       VALUES ($1,$2,'dep_technical','pf_technical','TECHNICAL',$3,'apr_technical_r1','apr_technical_r2',
         'obs_technical','observation.v3',$4,'ep_technical',$5,'paper-exit.v1','paper-exit-eval.v1',$6,
         'TECHNICAL_SYNTHETIC: no execution source activated','Safe local extension only')`,
      [id, workspaceId, HASHES[0], HASHES[1], HASHES[2], `sha256:${"0".repeat(64)}`],
    );
    await ctx.pool.query(
      `INSERT INTO governance_paper_exit_lineage
        (lineage_id,review_id,ordinal,kind,label,value,digest,source_authority)
       VALUES ($1,$2,0,'ARTIFACT','Technical lineage','technical',$3,'RESEARCH')`,
      [`${id}_lineage`, id, HASHES[0]],
    );
    const snapshot = (await new PaperExitRepository(ctx.pool).detail(workspaceId, id))!;
    await ctx.pool.query("UPDATE governance_paper_exit_reviews SET source_snapshot_hash = $2 WHERE review_id = $1",
      [id, computePaperExitSourceSnapshotHash(snapshot)]);
    const read = await request(reviewer, `/api/v1/execution/governance/exit-reviews/${id}?workspace_id=${workspaceId}`);
    expect(read.statusCode).toBe(200);
    const data = read.json().data;
    expect(data.eligibility).toMatchObject({ can_approve: false, can_extend_observation: true, can_reject: true });
    const pins = data.decision_context;
    expect(pins).toMatchObject({ gate: "PAPER_EXIT", evidence_hashes: hashes,
      availability: { state: "AVAILABLE", reason_code: null } });
    const body = { schema_version: pins.request_schema_version, workspace_id: pins.workspace_id,
      request_key: "gov-cont:paper-safe", command_type: pins.command_type, command_version: 1,
      target: { review_id: pins.review_id }, expected_review_version: pins.expected_review_version,
      payload: { decision: "EXTEND_OBSERVATION", extension_days: 14,
        reason: "Extend local observation; missing source cannot authorize promotion.", evidence_hashes: pins.evidence_hashes } };
    const mismatch = await plan(reviewer, { ...body, request_key: "gov-cont:paper-wrong-hashes",
      payload: { ...body.payload, evidence_hashes: [HASHES[0]] } });
    expect(mismatch.json().blockers).toContainEqual({ code: "EVIDENCE_HASH_MISMATCH" });
    expect(mismatch.json().apply_token).toBeNull();
    const planned = await plan(reviewer, body);
    expect(planned.statusCode).toBe(201);
    expect(planned.json().blockers).toEqual([]);
    const applyBody = { schema_version: "governance.paper-exit-decision-apply-request.v1",
      workspace_id: workspaceId, apply_token: planned.json().apply_token };
    const path = `/api/v1/execution/operations/${planned.json().operation_id}/apply`;
    if (scenario === "APPENDED_EVIDENCE") {
      await ctx.pool.query(
        `INSERT INTO governance_approval_evidence
          (evidence_id, approval_id, ordinal, kind, label, display_value, sha256,
           schema_version, source_authority, captured_at, retention_class, access_policy)
         VALUES ($1,$2,4,'REPORT','TECHNICAL_SYNTHETIC','Tampered after planning',$3,
           'technical.synthetic.v1','RESEARCH',now(),'GOVERNANCE_LONG_TERM','WORKSPACE_APPROVER')`,
        [`${id}_appended`, id, `sha256:${"e".repeat(64)}`],
      );
      const rejected = await mutate(reviewer, path, applyBody);
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json().error.code).toBe("EVIDENCE_MANIFEST_INTEGRITY_FAILED");
      expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM governance_paper_exit_decisions")).rows[0].count).toBe(0);
      return;
    }
    const staleActor = (await auth.users.findByUsername(reviewer.username))!;
    const paperService = ctx.app.get(PaperExitService);
    if (scenario === "ROLE_REMOVED_BEFORE_APPLY") {
      await ctx.pool.query("UPDATE portal_users SET role = 'USER' WHERE user_id = $1", [reviewer.userId]);
      try {
        // Bypass the HTTP guard deliberately: the repository must reject a
        // role that changed after a request had already loaded its actor.
        await expect(paperService.apply(staleActor, workspaceId, planned.json().operation_id,
          applyBody.apply_token, "gov-cont:paper-stale-admin")).rejects.toMatchObject({
          code: "APPROVER_ROLE_REQUIRED", status: 403,
        });
        await expect(paperService.plan(staleActor, {
          workspaceId, requestKey: body.request_key, reviewId: id,
          expectedReviewVersion: pins.expected_review_version, decision: "EXTEND_OBSERVATION",
          reason: body.payload.reason, extensionDays: 14, evidenceHashes: pins.evidence_hashes,
        }, "gov-cont:paper-stale-plan")).rejects.toMatchObject({ code: "APPROVER_ROLE_REQUIRED", status: 403 });
        expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM governance_paper_exit_decisions")).rows[0].count).toBe(0);
      } finally {
        await ctx.pool.query("UPDATE portal_users SET role = 'ADMIN' WHERE user_id = $1", [reviewer.userId]);
      }
      return;
    }
    expect((await mutate(reviewer, path, applyBody)).statusCode).toBe(202);
    expect((await mutate(reviewer, path, applyBody)).json().replayed).toBe(true);
    if (scenario === "ROLE_REMOVED_AFTER_APPLY") {
      await ctx.pool.query("UPDATE portal_users SET role = 'USER' WHERE user_id = $1", [reviewer.userId]);
      try {
        await expect(paperService.apply(staleActor, workspaceId, planned.json().operation_id,
          applyBody.apply_token, "gov-cont:paper-replay-stale-admin")).rejects.toMatchObject({
          code: "APPROVER_ROLE_REQUIRED", status: 403,
        });
        await expect(paperService.operationOrNull(staleActor, workspaceId, planned.json().operation_id))
          .rejects.toMatchObject({ code: "APPROVER_ROLE_REQUIRED", status: 403 });
        expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM governance_paper_exit_decisions")).rows[0].count).toBe(1);
      } finally {
        await ctx.pool.query("UPDATE portal_users SET role = 'ADMIN' WHERE user_id = $1", [reviewer.userId]);
      }
    }
    expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM governance_promotion_authority_grants")).rows[0].count).toBe(0);
    expect((await ctx.pool.query("SELECT count(*)::integer AS count FROM outbox_messages WHERE event_type LIKE 'execution.%'")).rows[0].count).toBe(0);
  });
});
