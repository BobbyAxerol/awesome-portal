import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { computeEvidenceManifestHash } from "../src/governance/governance.service";
import { EvidenceRecord } from "../src/governance/governance.repository";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const CORPUS_SIZE = 182_000;

interface Actor {
  userId: string;
  username: string;
  cookie: string;
  csrf: string;
}

function cookies(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0])
    .join("; ");
}

function csrfCookie(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  const value = values.find(
    (item): item is string =>
      typeof item === "string" && item.startsWith("__Host-portal_csrf="),
  );
  if (!value) throw new Error("csrf cookie missing");
  return value.split(";")[0].split("=")[1];
}

describe("EX-BE-05a governance/evidence/approval repository and API", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let bobby: Actor;
  let lan: Actor;
  let stan: Actor;
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
    bobby = await createActor("bobby", "ADMIN");
    lan = await createActor("lan", "ADMIN");
    stan = await createActor("stan", "USER");

    const workspaces = await inject(bobby, "/api/workspaces");
    workspaceId = workspaces.json().workspaces[0].workspace_id;
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'MEMBER'), ($1, $3, 'MEMBER')`,
      [workspaceId, lan.userId, stan.userId],
    );
  }, 30_000);

  afterAll(async () => {
    await teardownApp(ctx);
  });

  beforeEach(async () => {
    await ctx.pool.query(
      `TRUNCATE governance_approval_decisions, governance_decision_plans,
        governance_approval_findings, governance_approval_evidence,
        governance_approval_requests, outbox_messages, product_audit_events CASCADE`,
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
    await admin.createUser({ username, displayName: username[0].toUpperCase() + username.slice(1), role });
    const user = await auth.users.findByUsername(username);
    const { activationToken } = await admin.resetCredential(user!.userId);
    const first = await rawInject("/api/auth/login", {
      method: "POST",
      headers: { "x-dev-access-email": `${username}@azdag.com` },
      payload: { username, credential: activationToken },
    });
    const firstCsrf = csrfCookie(first);
    const password = `cedar-river-${username}-governance-2026-safe`;
    const changed = await rawInject("/api/auth/change-password", {
      method: "POST",
      headers: {
        cookie: cookies(first),
        "x-portal-csrf": firstCsrf,
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

  async function seedApproval(input: {
    approvalId: string;
    requester?: Actor;
    creator?: Actor;
    quorumRequired?: number;
    blocker?: boolean;
    evidenceComplete?: boolean;
  }) {
    const requester = input.requester ?? stan;
    const creator = input.creator ?? stan;
    const capturedAt = new Date("2026-08-21T10:00:00.000Z");
    const evidence: EvidenceRecord[] = [
      {
        evidenceId: `${input.approvalId}-ev-1`,
        ordinal: 0,
        kind: "ALPHA_ARTIFACT",
        label: "alpha version",
        displayValue: "av_2041",
        note: "supersedes av_1988",
        verification: "verified",
        artifactId: "artifact_2041",
        sha256: HASH_A,
        sizeBytes: "2048",
        mediaType: "application/json",
        schemaVersion: "alpha-artifact.v1",
        sourceAuthority: "RESEARCH",
        sourceReference: "run_5512",
        required: true,
        capturedAt,
        retentionClass: "GOVERNANCE_LONG_TERM",
        accessPolicy: "WORKSPACE_APPROVER",
      },
      {
        evidenceId: `${input.approvalId}-ev-2`,
        ordinal: 1,
        kind: "DATASET_MANIFEST",
        label: "datasets",
        displayValue: "3 snapshots · universe univ_88",
        note: null,
        verification: "PASS",
        artifactId: "dataset_manifest_88",
        sha256: HASH_B,
        sizeBytes: "4096",
        mediaType: "application/json",
        schemaVersion: "dataset-manifest.v1",
        sourceAuthority: "RESEARCH",
        sourceReference: "univ_88",
        required: true,
        capturedAt,
        retentionClass: "GOVERNANCE_LONG_TERM",
        accessPolicy: "WORKSPACE_APPROVER",
      },
    ];
    const manifestHash = computeEvidenceManifestHash(evidence);
    const blocker = input.blocker ?? false;
    await ctx.pool.query(
      `INSERT INTO governance_approval_requests
         (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
          release_candidate, environment, target_label, requester_user_id,
          requester_username, artifact_creator_user_id, artifact_creator_username,
          status, policy_version, quorum_required, evidence_set_hash,
          evidence_complete, blocker_count, blocker_summary, sla_due_at, expires_at,
          created_at, updated_at)
       VALUES ($1, $2, 'R1', 'ALPHA_VERSION', 'av_2041', 'RSI v1.7', 'RC-41',
               'RESEARCH', 'R1', $3, $4, $5, $6, 'PENDING', 'approval.v3', $7,
               $8, $9, $10, $11, now() + interval '6 hours', now() + interval '48 hours',
               now() - interval '2 hours', now())`,
      [
        input.approvalId, workspaceId, requester.userId, requester.username,
        creator.userId, creator.username, input.quorumRequired ?? 1, manifestHash,
        input.evidenceComplete ?? true, blocker ? 1 : 0,
        blocker ? "holdout policy failed" : null,
      ],
    );
    for (const item of evidence) {
      await ctx.pool.query(
        `INSERT INTO governance_approval_evidence
           (evidence_id, approval_id, ordinal, kind, label, display_value, note,
            verification, artifact_id, sha256, size_bytes, media_type, schema_version,
            source_authority, source_reference, required, captured_at,
            retention_class, access_policy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19)`,
        [
          item.evidenceId, input.approvalId, item.ordinal, item.kind, item.label,
          item.displayValue, item.note, item.verification, item.artifactId, item.sha256,
          item.sizeBytes, item.mediaType, item.schemaVersion, item.sourceAuthority,
          item.sourceReference, item.required, item.capturedAt, item.retentionClass,
          item.accessPolicy,
        ],
      );
    }
    await ctx.pool.query(
      `INSERT INTO governance_approval_findings
         (finding_id, approval_id, ordinal, label, outcome, suggestion, blocking,
          policy_version, formula_version, basis_hashes, evaluated_at)
       VALUES
         ($1, $2, 0, 'exact engine and data pinned', 'PASS', NULL, false,
          'approval.v3', 'reproducibility.v1', $3, now()),
         ($4, $2, 1, $5, $6, $7, $8,
          'approval.v3', 'capacity.v1', $3, now())`,
      [
        `${input.approvalId}-finding-1`, input.approvalId, [HASH_A, HASH_B],
        `${input.approvalId}-finding-2`,
        blocker ? "outer OOS policy failed" : "capacity evidence limited",
        blocker ? "FAIL" : "WATCH",
        blocker ? null : "approve with a capacity condition",
        blocker,
      ],
    );
    return { manifestHash, evidenceHashes: [HASH_A, HASH_B] };
  }

  function planPayload(approvalId: string, evidenceHashes: string[], overrides: Record<string, unknown> = {}) {
    return {
      schema_version: "governance.r1-decision-plan-request.v1",
      workspace_id: workspaceId,
      request_key: `r1:${approvalId}:approve`,
      command_type: "GOVERNANCE_R1_DECISION",
      command_version: 1,
      target: { approval_id: approvalId },
      expected_approval_version: 1,
      payload: {
        decision: "APPROVE",
        reason: "Independent review confirms the immutable evidence package.",
        evidence_hashes: evidenceHashes,
      },
      ...overrides,
    };
  }

  async function plan(actor: Actor, payload: Record<string, unknown>) {
    return mutation(actor, "/api/v1/execution/commands/plans", payload);
  }

  async function apply(actor: Actor, operationId: string, applyToken: string, headers: Record<string, string> = {}) {
    return mutation(
      actor,
      `/api/v1/execution/operations/${operationId}/apply`,
      {
        schema_version: "governance.r1-decision-apply-request.v1",
        workspace_id: workspaceId,
        apply_token: applyToken,
      },
      headers,
    );
  }

  it("requires a valid session and hides non-member workspace scope", async () => {
    expect((await rawInject("/api/v1/execution/governance/approvals")).statusCode).toBe(401);
    const lanWorkspaces = await inject(lan, "/api/workspaces");
    const otherWorkspace = lanWorkspaces
      .json()
      .workspaces.find((item: { owner_user_id: string }) => item.owner_user_id === lan.userId);
    expect(otherWorkspace).toBeDefined();
    const otherWorkspaceId = otherWorkspace.workspace_id;
    const denied = await inject(bobby, `/api/v1/execution/governance/approvals?workspace_id=${otherWorkspaceId}`);
    expect(denied.statusCode).toBe(404);
    expect(denied.json().error.code).toBe("WORKSPACE_NOT_FOUND");
  });

  it("serves a real 182k Approval Inbox with exact count and bidirectional keysets", async () => {
    await ctx.pool.query(
      `INSERT INTO governance_approval_requests
         (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
          environment, target_label, requester_user_id, requester_username,
          artifact_creator_user_id, artifact_creator_username, status, policy_version,
          quorum_required, evidence_set_hash, evidence_complete, blocker_count,
          blocker_summary, sla_due_at, expires_at, created_at, updated_at)
       SELECT
         'AP-BULK-' || lpad(item::text, 6, '0'), $1, 'R1', 'ALPHA_VERSION',
         'av_' || item::text, 'Bulk alpha ' || item::text, 'RESEARCH', 'R1',
         $2, 'stan', $2, 'stan', 'PENDING', 'approval.v3', 1,
         'sha256:' || repeat('0', 64), false, 1, 'evidence not loaded',
         timestamptz '2026-09-01T00:00:00Z' + item * interval '1 second',
         timestamptz '2027-01-01T00:00:00Z',
         timestamptz '2026-08-01T00:00:00Z' + item * interval '1 millisecond', now()
       FROM generate_series(1, $3::integer) item`,
      [workspaceId, stan.userId, CORPUS_SIZE],
    );
    const first = await inject(
      bobby,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&limit=25`,
    );
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.record_authority).toBe("PORTAL");
    expect(body.delivery_profile).toBe("fixture");
    expect(body.counts.pending).toBe(CORPUS_SIZE);
    expect(body.page.total_count).toBe(CORPUS_SIZE);
    expect(body.page.filtered_count).toBe(CORPUS_SIZE);
    expect(body.page.rows).toHaveLength(25);
    expect(body.page.next_cursor).toMatch(/^kc1\./);
    const second = await inject(
      bobby,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&limit=25&after=${encodeURIComponent(body.page.next_cursor)}`,
    );
    expect(second.statusCode).toBe(200);
    expect(second.json().page.prev_cursor).toMatch(/^kc1\./);
    expect(second.json().page.rows[0].id).not.toBe(body.page.rows[0].id);
  }, 30_000);

  it("returns immutable R1 evidence and honest unavailable linked panels", async () => {
    const seeded = await seedApproval({ approvalId: "AP-DETAIL" });
    const response = await inject(
      bobby,
      `/api/v1/execution/governance/approvals/AP-DETAIL/r1?workspace_id=${workspaceId}`,
    );
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.approval.evidence_set_hash).toBe(seeded.manifestHash);
    expect(body.data.evidence_manifest.entries).toHaveLength(2);
    expect(body.data.checklist.map((item: { outcome: string }) => item.outcome)).toEqual(["pass", "watch"]);
    expect(body.data.eligibility).toMatchObject({ can_approve: true, separation_of_duties: "OK" });
    expect(body.data.linked_panels).toHaveLength(2);
    expect(body.data.linked_panels.every((panel: { panel_state: string }) => panel.panel_state === "unavailable")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("EXECUTION_CELL");
  });

  it("removes expired requests from Inbox while preserving them as explicit records", async () => {
    await seedApproval({ approvalId: "AP-REQUEST-EXPIRED" });
    await ctx.pool.query(
      `UPDATE governance_approval_requests
       SET created_at = now() - interval '10 hours',
           sla_due_at = now() - interval '2 hours',
           expires_at = now() - interval '1 hour'
       WHERE approval_id = 'AP-REQUEST-EXPIRED'`,
    );
    const inbox = await inject(
      bobby,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&view=INBOX`,
    );
    expect(inbox.statusCode).toBe(200);
    expect(inbox.json().page.rows).toEqual([]);
    expect(inbox.json().counts.pending).toBe(0);

    const all = await inject(
      bobby,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&view=ALL`,
    );
    expect(all.json().page.rows[0]).toMatchObject({ id: "AP-REQUEST-EXPIRED", status: "EXPIRED" });
    const detail = await inject(
      bobby,
      `/api/v1/execution/governance/approvals/AP-REQUEST-EXPIRED/r1?workspace_id=${workspaceId}`,
    );
    expect(detail.json().data.approval.status).toBe("EXPIRED");
    expect(detail.json().data.eligibility).toMatchObject({
      can_approve: false,
      can_approve_with_condition: false,
      can_deny: false,
    });
  });

  it("fails closed when the stored evidence-set digest does not match immutable entries", async () => {
    await seedApproval({ approvalId: "AP-TAMPER" });
    await ctx.pool.query(
      `UPDATE governance_approval_requests SET evidence_set_hash = $2 WHERE approval_id = $1`,
      ["AP-TAMPER", `sha256:${"c".repeat(64)}`],
    );
    const response = await inject(
      bobby,
      `/api/v1/execution/governance/approvals/AP-TAMPER/r1?workspace_id=${workspaceId}`,
    );
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("EVIDENCE_MANIFEST_INTEGRITY_FAILED");
  });

  it("enforces CSRF/origin and keeps USER read-only", async () => {
    const seeded = await seedApproval({ approvalId: "AP-SECURITY" });
    const payload = planPayload("AP-SECURITY", seeded.evidenceHashes);
    const missingCsrf = await inject(bobby, "/api/v1/execution/commands/plans", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
      },
      payload,
    });
    expect(missingCsrf.statusCode).toBe(403);
    expect(missingCsrf.json().error.code).toBe("CSRF_INVALID");
    const badOrigin = await mutation(bobby, "/api/v1/execution/commands/plans", payload, {
      origin: "https://attacker.example",
    });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.json().error.code).toBe("ORIGIN_DENIED");
    const userRead = await inject(stan, `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}`);
    expect(userRead.statusCode).toBe(200);
    const userPlan = await plan(stan, payload);
    expect(userPlan.statusCode).toBe(403);
    expect(userPlan.json().error.code).toBe("APPROVER_ROLE_REQUIRED");
  });

  it("makes request-key replay deterministic and rejects payload conflicts", async () => {
    const seeded = await seedApproval({ approvalId: "AP-IDEMPOTENT" });
    const payload = planPayload("AP-IDEMPOTENT", seeded.evidenceHashes);
    const first = await plan(bobby, payload);
    const replay = await plan(bobby, payload);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(first.json().operation_id).toBe(replay.json().operation_id);
    expect(first.json().apply_token).toBe(replay.json().apply_token);
    expect(replay.json().replayed).toBe(true);

    const conflictPayload = {
      ...payload,
      payload: {
        ...(payload.payload as Record<string, unknown>),
        reason: "A different review intent must not reuse this request key.",
      },
    };
    const conflict = await plan(bobby, conflictPayload);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("REQUEST_KEY_PAYLOAD_CONFLICT");
    const audit = await ctx.pool.query<{ result: string }>(
      `SELECT result FROM product_audit_events WHERE reason_code = 'REQUEST_KEY_PAYLOAD_CONFLICT'`,
    );
    expect(audit.rows[0].result).toBe("CONFLICT");
  });

  it("approves through plan/apply, writes decision+audit+outbox atomically, and replays apply", async () => {
    const seeded = await seedApproval({ approvalId: "AP-APPROVE" });
    const planned = await plan(bobby, planPayload("AP-APPROVE", seeded.evidenceHashes));
    expect(planned.statusCode).toBe(201);
    expect(planned.json().blockers).toEqual([]);
    const applied = await apply(bobby, planned.json().operation_id, planned.json().apply_token);
    expect(applied.statusCode).toBe(202);
    expect(applied.json()).toMatchObject({ status: "PENDING", replayed: false });
    const terminal = await inject(
      bobby,
      `/api/v1/execution/operations/${planned.json().operation_id}?workspace_id=${workspaceId}`,
    );
    expect(terminal.statusCode).toBe(200);
    expect(terminal.json()).toMatchObject({ status: "SUCCEEDED", approval_id: "AP-APPROVE" });
    const replay = await apply(bobby, planned.json().operation_id, planned.json().apply_token);
    expect(replay.statusCode).toBe(202);
    expect(replay.json().replayed).toBe(true);

    const state = await ctx.pool.query<{ status: string; approval_version: number }>(
      `SELECT status, approval_version FROM governance_approval_requests WHERE approval_id = 'AP-APPROVE'`,
    );
    expect(state.rows[0]).toMatchObject({ status: "APPROVED", approval_version: 2 });
    expect(Number((await ctx.pool.query(`SELECT COUNT(*) FROM governance_approval_decisions WHERE approval_id = 'AP-APPROVE'`)).rows[0].count)).toBe(1);
    expect(Number((await ctx.pool.query(`SELECT COUNT(*) FROM product_audit_events WHERE aggregate_id = 'AP-APPROVE' AND event_type = 'governance.r1_decision.applied'`)).rows[0].count)).toBe(1);
    expect(Number((await ctx.pool.query(`SELECT COUNT(*) FROM outbox_messages WHERE aggregate_id = 'AP-APPROVE' AND event_type = 'governance.r1_decision.applied'`)).rows[0].count)).toBe(1);
  });

  it("blocks self-approval while allowing the same reviewer to deny", async () => {
    const self = await seedApproval({ approvalId: "AP-SELF", requester: bobby, creator: bobby });
    const approvePlan = await plan(bobby, planPayload("AP-SELF", self.evidenceHashes));
    expect(approvePlan.json().blockers).toContainEqual({ code: "SELF_APPROVAL_PROHIBITED" });
    const blocked = await apply(bobby, approvePlan.json().operation_id, approvePlan.json().apply_token);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("OPERATION_BLOCKED");

    const denyPayload = planPayload("AP-SELF", self.evidenceHashes, {
      request_key: "r1:AP-SELF:deny",
      payload: {
        decision: "DENY",
        reason: "The requester is allowed to refuse and withdraw unsafe evidence.",
        evidence_hashes: self.evidenceHashes,
      },
    });
    const denyPlan = await plan(bobby, denyPayload);
    expect(denyPlan.json().blockers).toEqual([]);
    const denied = await apply(bobby, denyPlan.json().operation_id, denyPlan.json().apply_token);
    expect(denied.statusCode).toBe(202);
    const state = await ctx.pool.query<{ status: string }>(
      `SELECT status FROM governance_approval_requests WHERE approval_id = 'AP-SELF'`,
    );
    expect(state.rows[0].status).toBe("DENIED");
  });

  it("binds plans to exact evidence hashes and refuses a forged apply token", async () => {
    const seeded = await seedApproval({ approvalId: "AP-HASH" });
    const mismatch = await plan(
      bobby,
      planPayload("AP-HASH", [HASH_A, `sha256:${"d".repeat(64)}`]),
    );
    expect(mismatch.json().blockers).toContainEqual({ code: "EVIDENCE_HASH_MISMATCH" });
    const good = await plan(
      bobby,
      planPayload("AP-HASH", seeded.evidenceHashes, { request_key: "r1:AP-HASH:good" }),
    );
    const tokenParts = good.json().apply_token.split(".");
    tokenParts[3] = `${tokenParts[3][0] === "A" ? "B" : "A"}${tokenParts[3].slice(1)}`;
    const forged = tokenParts.join(".");
    const response = await apply(bobby, good.json().operation_id, forged);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("APPLY_TOKEN_INVALID");
  });

  it("detects concurrent approval-version changes and records the conflict", async () => {
    const seeded = await seedApproval({ approvalId: "AP-CONCURRENT", quorumRequired: 2 });
    const firstPlan = await plan(
      bobby,
      planPayload("AP-CONCURRENT", seeded.evidenceHashes, { request_key: "r1:concurrent:bobby" }),
    );
    const secondPlan = await plan(
      lan,
      planPayload("AP-CONCURRENT", seeded.evidenceHashes, { request_key: "r1:concurrent:lan" }),
    );
    expect(firstPlan.json().required_approvers).toEqual([{ role: "ADMIN", count: 2 }]);
    expect((await apply(bobby, firstPlan.json().operation_id, firstPlan.json().apply_token)).statusCode).toBe(202);
    const conflicted = await apply(lan, secondPlan.json().operation_id, secondPlan.json().apply_token);
    expect(conflicted.statusCode).toBe(409);
    expect(conflicted.json().error.code).toBe("APPROVAL_VERSION_CONFLICT");
    const state = await ctx.pool.query<{ quorum_met: number; status: string }>(
      `SELECT quorum_met, status FROM governance_approval_requests WHERE approval_id = 'AP-CONCURRENT'`,
    );
    expect(state.rows[0]).toMatchObject({ quorum_met: 1, status: "PENDING" });
    const audit = await ctx.pool.query<{ result: string }>(
      `SELECT result FROM product_audit_events WHERE reason_code = 'APPROVAL_VERSION_CONFLICT'`,
    );
    expect(audit.rows[0].result).toBe("CONFLICT");

    const current = await plan(
      lan,
      planPayload("AP-CONCURRENT", seeded.evidenceHashes, {
        request_key: "r1:concurrent:lan:v2",
        expected_approval_version: 2,
      }),
    );
    expect(current.json().blockers).toEqual([]);
    expect((await apply(lan, current.json().operation_id, current.json().apply_token)).statusCode).toBe(202);
    const terminal = await ctx.pool.query<{ quorum_met: number; status: string }>(
      `SELECT quorum_met, status FROM governance_approval_requests WHERE approval_id = 'AP-CONCURRENT'`,
    );
    expect(terminal.rows[0]).toMatchObject({ quorum_met: 2, status: "APPROVED" });
  });

  it("preserves an approval condition as immutable decision evidence", async () => {
    const seeded = await seedApproval({ approvalId: "AP-CONDITION" });
    const planned = await plan(
      bobby,
      planPayload("AP-CONDITION", seeded.evidenceHashes, {
        request_key: "r1:AP-CONDITION:conditional",
        payload: {
          decision: "APPROVE_WITH_CONDITION",
          reason: "The evidence is sufficient only within the reviewed capacity envelope.",
          condition: "Keep notional below the reviewed capacity ceiling until a new R1 review.",
          evidence_hashes: seeded.evidenceHashes,
        },
      }),
    );
    expect(planned.json().blockers).toEqual([]);
    expect((await apply(bobby, planned.json().operation_id, planned.json().apply_token)).statusCode).toBe(202);
    const state = await ctx.pool.query<{ status: string; decision: string; condition: string }>(
      `SELECT request.status, decision.decision, decision.condition
       FROM governance_approval_requests request
       JOIN governance_approval_decisions decision USING (approval_id)
       WHERE request.approval_id = 'AP-CONDITION'`,
    );
    expect(state.rows[0]).toMatchObject({
      status: "APPROVED_WITH_CONDITION",
      decision: "APPROVE_WITH_CONDITION",
      condition: "Keep notional below the reviewed capacity ceiling until a new R1 review.",
    });
  });

  it("expires a stale plan durably and audits the rejected apply", async () => {
    const seeded = await seedApproval({ approvalId: "AP-PLAN-EXPIRED" });
    const planned = await plan(bobby, planPayload("AP-PLAN-EXPIRED", seeded.evidenceHashes));
    await ctx.pool.query(
      `UPDATE governance_decision_plans
       SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 minute'
       WHERE operation_id = $1`,
      [planned.json().operation_id],
    );
    const response = await apply(bobby, planned.json().operation_id, planned.json().apply_token);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("OPERATION_EXPIRED");
    const state = await ctx.pool.query<{ status: string }>(
      `SELECT status FROM governance_decision_plans WHERE operation_id = $1`,
      [planned.json().operation_id],
    );
    expect(state.rows[0].status).toBe("EXPIRED");
    const audit = await ctx.pool.query<{ result: string }>(
      `SELECT result FROM product_audit_events
       WHERE aggregate_id = 'AP-PLAN-EXPIRED' AND reason_code = 'OPERATION_EXPIRED'`,
    );
    expect(audit.rows[0].result).toBe("DENIED");
  });

  it("keeps evidence, findings, and decisions append-only in PostgreSQL", async () => {
    const seeded = await seedApproval({ approvalId: "AP-IMMUTABLE" });
    await expect(
      ctx.pool.query(
        `UPDATE governance_approval_evidence SET display_value = 'tampered' WHERE approval_id = 'AP-IMMUTABLE'`,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      ctx.pool.query(`DELETE FROM governance_approval_findings WHERE approval_id = 'AP-IMMUTABLE'`),
    ).rejects.toThrow(/append-only/);
    const planned = await plan(bobby, planPayload("AP-IMMUTABLE", seeded.evidenceHashes));
    await apply(bobby, planned.json().operation_id, planned.json().apply_token);
    await expect(
      ctx.pool.query(`UPDATE governance_approval_decisions SET reason = 'rewritten' WHERE approval_id = 'AP-IMMUTABLE'`),
    ).rejects.toThrow(/append-only/);
  });
});
