import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { computeEvidenceManifestHash } from "../src/governance/governance.service";
import { EvidenceRecord } from "../src/governance/governance.repository";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { GovernanceGrantsRepository } from "../src/repos/governance-grants";

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
    /*
     * A4-3 · the R1/R2 gates are capabilities now, not roles.
     *
     * Before this, every ADMIN could read and decide every approval in every
     * workspace. §20.2 rule 3 narrows that to the owner plus whoever the owner
     * explicitly delegated, so this cast has to say which each actor is.
     *
     * `lan` is the case the phase exists for: an ADMIN whose authority to
     * decide now comes from a grant rather than from the role. `stan` begins
     * ungranted; individual cases may deliberately add a narrow read grant
     * when that is the behavior under test.
     */
    // The anchor is a singleton and specs share a database: clear it first so
    // this file's owner is this file's owner, whichever spec ran before it.
    await ctx.pool.query("DELETE FROM portal_owner_anchor");
    await new OwnerAccessRepository(ctx.pool).claimOwner({
      userId: bobby.userId,
      claimedBy: "governance-spec",
    });
    const __grants = new GovernanceGrantsRepository(ctx.pool);
    for (const capability of ["governance.r1.decide", "governance.r2.decide"] as const) {
      await __grants.insertGrant({
        grantId: `grn_governance-spec_${capability.replaceAll(".", "_")}`,
        granteeUserId: lan.userId,
        capability,
        workspaceId: null,
        issuedBy: bobby.userId,
      });
    }

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
      `TRUNCATE governance_approval_analytics_scopes,
        governance_approval_decisions, governance_decision_plans,
        governance_approval_findings, governance_approval_evidence,
        governance_approval_requests, outbox_messages, product_audit_events CASCADE`,
    );
  });

  async function rawInject(url: string, options: Record<string, unknown> = {}) {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) headers["x-dev-access-email"] = "dev@azdag.com";
    // A browser attaches `Origin` to every non-GET request; so does this.
    const requestMethod = String(options.method ?? "GET").toUpperCase();
    if (requestMethod !== "GET" && requestMethod !== "HEAD" && !("origin" in headers)) {
      headers.origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
    }
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

  async function seedR2CapitalScope(
    approvalId: string,
    targetWorkspaceId = workspaceId,
    withLineage = true,
  ) {
    const r1ApprovalId = `${approvalId}-R1`;
    let r1ManifestHash: string | null = null;
    if (withLineage && targetWorkspaceId === workspaceId) {
      const r1 = await seedApproval({ approvalId: r1ApprovalId });
      r1ManifestHash = r1.manifestHash;
      await ctx.pool.query(
        `UPDATE governance_approval_requests
            SET status = 'APPROVED', quorum_met = 1, approval_version = 2,
                decision_actor_ids = ARRAY[$2], decided_at = now(),
                decided_by_user_id = $2, updated_at = now()
          WHERE approval_id = $1`,
        [r1ApprovalId, lan.userId],
      );
    }
    await ctx.pool.query(
      `INSERT INTO governance_approval_requests
         (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
          environment, target_label, requester_user_id, requester_username,
          artifact_creator_user_id, artifact_creator_username, status,
          policy_version, quorum_required, evidence_set_hash, evidence_complete,
          blocker_count, sla_due_at, expires_at)
       VALUES ($1, $2, 'R2', 'DEPLOYMENT', 'deployment-paper-1', 'Paper deployment',
               'PAPER', 'R2 capital review', $3, $4, $3, $4, 'PENDING',
               'approval.v3', 1, $5, true, 0,
               now() + interval '6 hours', now() + interval '48 hours')`,
      [approvalId, targetWorkspaceId, stan.userId, stan.username, HASH_A],
    );
    await ctx.pool.query(
      `INSERT INTO governance_approval_analytics_scopes
         (approval_id, workspace_id, portfolio_id, currency)
       VALUES ($1, $2, 'PF_R2_1', 'USDT')`,
      [approvalId, targetWorkspaceId],
    );
    if (r1ManifestHash !== null) {
      await ctx.pool.query(
        `INSERT INTO governance_r2_lineage
           (r2_approval_id, workspace_id, r1_approval_id, grant_id, grant_name,
            approver_role, plan_author_user_id, plan_author_username)
         VALUES ($1, $2, $3, $4, 'paper_activation_authorization',
                 'ADMIN', $5, $6)`,
        [approvalId, targetWorkspaceId, r1ApprovalId, `${approvalId}-grant`, stan.userId, stan.username],
      );
    }
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
  // This is a correctness/scale corpus, not a 30-second latency SLO. Clean or
  // shared CI hosts can spend most of the original budget inserting 182k real
  // PostgreSQL rows; endpoint latency is benchmarked separately with EXPLAIN.
  }, 60_000);

  it("returns immutable R1 evidence and honest unavailable linked panels", async () => {
    const seeded = await seedApproval({ approvalId: "AP-DETAIL" });
    await ctx.pool.query(
      `INSERT INTO governance_approval_known_limitations
         (limitation_id, approval_id, ordinal, kind, label, statement, expires_at)
       VALUES ('limit-ap-detail-1', 'AP-DETAIL', 0, 'RESTRICTION',
               'Capacity envelope',
               'Paper notional must remain inside the reviewed capacity envelope.',
               now() + interval '30 days')`,
    );
    const response = await inject(
      bobby,
      `/api/v1/execution/governance/approvals/AP-DETAIL/r1?workspace_id=${workspaceId}`,
    );
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.approval.evidence_set_hash).toBe(seeded.manifestHash);
    expect(body.data.evidence_manifest.entries).toHaveLength(2);
    expect(body.data.evidence_manifest.entries[0]).toMatchObject({
      evidence_id: "AP-DETAIL-ev-1",
      ordinal: 0,
      label: "alpha version",
      display_value: "av_2041",
      verification: "verified",
      artifact_id: "artifact_2041",
      size_bytes: "2048",
      source_reference: "run_5512",
      required: true,
      retention_class: "GOVERNANCE_LONG_TERM",
      access_policy: "WORKSPACE_APPROVER",
    });
    expect(body.data.checklist.map((item: { outcome: string }) => item.outcome)).toEqual(["pass", "watch"]);
    expect(body.data.known_limitations).toMatchObject([{
      limitation_id: "limit-ap-detail-1",
      kind: "restriction",
      label: "Capacity envelope",
    }]);
    expect(body.data.eligibility).toMatchObject({ can_approve: true, separation_of_duties: "OK" });
    expect(body.data.linked_panels).toHaveLength(2);
    expect(body.data.linked_panels.every((panel: { panel_state: string }) => panel.panel_state === "unavailable")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("EXECUTION_CELL");
    await expect(ctx.pool.query(
      `UPDATE governance_approval_known_limitations
          SET statement = 'Forbidden rewrite.'
        WHERE limitation_id = 'limit-ap-detail-1'`,
    )).rejects.toThrow(/append-only/i);
  });

  it("closes REQUEST_CHANGES as one immutable attempt and exposes keyset approval history", async () => {
    const changes = await seedApproval({
      approvalId: "AP-REQUEST-CHANGES",
      blocker: true,
      evidenceComplete: false,
    });
    const missingRemediation = await plan(
      bobby,
      planPayload("AP-REQUEST-CHANGES", changes.evidenceHashes, {
        request_key: "r1:AP-REQUEST-CHANGES:invalid",
        payload: {
          decision: "REQUEST_CHANGES",
          reason: "The current package needs a concrete remediation before another review.",
          evidence_hashes: changes.evidenceHashes,
        },
      }),
    );
    expect(missingRemediation.statusCode).toBe(400);
    expect(missingRemediation.json().error.code).toBe("INVALID_DECISION_PLAN");

    const remediation = [{
      text: "Publish a complete capacity report and start a new immutable approval attempt.",
      owner: "research-team",
      deadline: "2026-09-15",
      expires_at: "2026-09-30",
      blocking: true,
    }];
    const planned = await plan(
      bobby,
      planPayload("AP-REQUEST-CHANGES", changes.evidenceHashes, {
        request_key: "r1:AP-REQUEST-CHANGES:valid",
        payload: {
          decision: "REQUEST_CHANGES",
          reason: "The incomplete package must return to research with bounded remediation.",
          conditions: remediation,
          evidence_hashes: changes.evidenceHashes,
        },
      }),
    );
    expect(planned.statusCode).toBe(201);
    expect(planned.json().blockers).toEqual([]);
    expect((await apply(bobby, planned.json().operation_id, planned.json().apply_token)).statusCode)
      .toBe(202);

    const state = await ctx.pool.query<{
      status: string;
      decision: string;
      conditions: unknown[];
      requests: string;
      supersedes_approval_id: string | null;
    }>(
      `SELECT request.status, request.supersedes_approval_id,
              decision.decision, decision.conditions,
              (SELECT count(*) FROM governance_approval_requests
                WHERE subject_id = request.subject_id)::text AS requests
         FROM governance_approval_requests request
         JOIN governance_approval_decisions decision USING (approval_id)
        WHERE request.approval_id = 'AP-REQUEST-CHANGES'`,
    );
    expect(state.rows[0]).toMatchObject({
      status: "CHANGES_REQUESTED",
      decision: "REQUEST_CHANGES",
      conditions: remediation,
      requests: "1",
      supersedes_approval_id: null,
    });

    const deniedSeed = await seedApproval({ approvalId: "AP-HISTORY-DENIED" });
    const deniedPlan = await plan(
      lan,
      planPayload("AP-HISTORY-DENIED", deniedSeed.evidenceHashes, {
        request_key: "r1:AP-HISTORY-DENIED:deny",
        payload: {
          decision: "DENY",
          reason: "Independent review rejected this immutable approval attempt.",
          evidence_hashes: deniedSeed.evidenceHashes,
        },
      }),
    );
    expect((await apply(lan, deniedPlan.json().operation_id, deniedPlan.json().apply_token)).statusCode)
      .toBe(202);

    const first = await inject(
      lan,
      `/api/v1/execution/governance/approvals/history?workspace_id=${workspaceId}&gate=R1&subject=RSI&limit=1`,
    );
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      schema_version: "governance.approval-history.v1",
      record_authority: "PORTAL",
      page: { total_count: 2, filtered_count: 2, rows: [expect.any(Object)] },
    });
    expect(first.json().page.next_cursor).toMatch(/^kc1\./);
    const second = await inject(
      lan,
      `/api/v1/execution/governance/approvals/history?workspace_id=${workspaceId}&gate=R1&subject=RSI&limit=1&after=${encodeURIComponent(first.json().page.next_cursor)}`,
    );
    expect(second.statusCode).toBe(200);
    expect(second.json().page.prev_cursor).toMatch(/^kc1\./);
    expect(new Set([
      first.json().page.rows[0].outcome,
      second.json().page.rows[0].outcome,
    ])).toEqual(new Set(["CHANGES_REQUESTED", "DENIED"]));
    expect((await ctx.pool.query(
      `SELECT count(*)::text AS count FROM outbox_messages
        WHERE aggregate_id IN ('AP-REQUEST-CHANGES', 'AP-HISTORY-DENIED')
          AND event_type = 'governance.r1_decision.applied'`,
    )).rows[0].count).toBe("2");
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

  it("fails closed when a deprecated inbox filter selector would otherwise become INBOX", async () => {
    const response = await inject(
      bobby,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&filter=OVERDUE`,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("FILTER_NOT_ALLOWED");
  });

  it("supports the canonical R2 inbox view without conflating it with PAPER", async () => {
    await seedApproval({ approvalId: "AP-R1-VIEW" });
    await seedR2CapitalScope("AP-R2-VIEW");
    const response = await inject(
      bobby,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&view=R2`,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().page.rows.map((row: { id: string }) => row.id)).toEqual([
      "AP-R2-VIEW",
    ]);
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
    // A4-3: the refusal names the capability, not the role — the role is no
    // longer what was missing.
    expect(userPlan.json().error.code).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
  });

  it("binds Inbox rows, counts and cursors to the caller's exact read grants", async () => {
    await seedApproval({ approvalId: "AP-R1-VISIBILITY" });
    await seedR2CapitalScope("AP-R2-VISIBILITY");

    // An ungranted workspace member learns neither the rows nor their counts.
    const ungranted = await inject(stan, `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}`);
    expect(ungranted.statusCode).toBe(200);
    expect(ungranted.json().page.rows).toEqual([]);
    expect(ungranted.json().counts).toEqual({ pending: 0, overdue: 0, due_soon: 0 });

    // Lan has both R1/R2 grants.  The cursor issued for that broader policy
    // must never be accepted after it is copied into Stan's narrower context.
    const broader = await inject(
      lan,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&limit=1`,
    );
    expect(broader.statusCode).toBe(200);
    expect(broader.json().page.next_cursor).toBeTruthy();
    const narrowReader = await createActor("visibility-reader", "USER");
    await ctx.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
      [workspaceId, narrowReader.userId],
    );
    const grantRepo = new GovernanceGrantsRepository(ctx.pool);
    await grantRepo.insertGrant({
      grantId: "grn_stan_r1_visibility",
      granteeUserId: narrowReader.userId,
      capability: "governance.r1.read",
      workspaceId: null,
      issuedBy: bobby.userId,
    });
    const narrowed = await inject(
      narrowReader,
      `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&after=${encodeURIComponent(broader.json().page.next_cursor)}`,
    );
    expect(narrowed.statusCode).toBe(400);
    expect(narrowed.json().error.code).toBe("CURSOR_CONTEXT_MISMATCH");

    const r1Only = await inject(narrowReader, `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}`);
    expect(r1Only.statusCode).toBe(200);
    expect(r1Only.json().page.rows.map((row: { gate: string }) => row.gate)).toEqual(["R1"]);
    expect(r1Only.json().counts.pending).toBe(1);
  });

  it("serves an active R2 review with its immutable workspace-bound capital scope", async () => {
    await seedR2CapitalScope("AP-R2-DETAIL");
    const path = `/api/v1/execution/governance/approvals/AP-R2-DETAIL/r2?workspace_id=${workspaceId}`;

    const response = await inject(bobby, path);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schema_version: "governance.r2-review.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      data: {
        approval: {
          approval_id: "AP-R2-DETAIL",
          gate: "R2",
          portfolio_id: "PF_R2_1",
          currency: "USDT",
        },
        r1_reference: {
          approval_id: "AP-R2-DETAIL-R1",
          state: "APPROVED",
          digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          decided_by: "lan",
        },
        r1_state: "APPROVED",
        r1_id: "AP-R2-DETAIL-R1",
        grant_id: "AP-R2-DETAIL-grant",
        grant_name: "paper_activation_authorization",
        approver_role: "ADMIN",
        plan_author: "stan",
        evidence_manifest: { complete: true, entries: expect.any(Array) },
        eligibility: { can_approve: true, locks: [] },
      },
    });

    /*
     * A4-3 · workspace membership is not a Governance grant.
     *
     * This asserted that any member of the workspace could read the R2 review.
     * §20.2 rule 4 separates the two: membership says where somebody may be,
     * a grant says what they may do there. An ungranted member is refused, and
     * the SAME member reads it the moment the owner grants `governance.r2.read`
     * — which is the whole point of the phase, so both halves are asserted.
     */
    const ungrantedRead = await inject(stan, path);
    expect(ungrantedRead.statusCode).toBe(403);
    expect(ungrantedRead.json().error.code).toBe("GOVERNANCE_CAPABILITY_REQUIRED");
    // Refused without leaking what the review contains.
    expect(JSON.stringify(ungrantedRead.json())).not.toContain("PF_R2_1");

    await new GovernanceGrantsRepository(ctx.pool).insertGrant({
      grantId: `grn_r2_read_${Date.now()}`,
      granteeUserId: stan.userId,
      capability: "governance.r2.read",
      workspaceId: null,
      issuedBy: bobby.userId,
    });
    // No cache to invalidate: the next request reads the grants as they now
    // stand, which is how §20.5 item 1's "takes effect immediately" is kept.
    const memberRead = await inject(stan, path);
    expect(memberRead.statusCode).toBe(200);
    expect(memberRead.json().data.approval).toMatchObject({
      portfolio_id: "PF_R2_1",
      currency: "USDT",
    });
    // Read, never decide: the grant was `.read` and the eligibility says so.
    expect(memberRead.json().data.eligibility.locks).toContain("NOT_ELIGIBLE");

    const storedR1Hash = response.json().data.r1_reference.digest;
    await ctx.pool.query(
      `UPDATE governance_approval_requests
          SET evidence_set_hash = $1
        WHERE approval_id = 'AP-R2-DETAIL-R1'`,
      [`sha256:${"c".repeat(64)}`],
    );
    const tampered = await inject(bobby, path);
    expect(tampered.statusCode).toBe(409);
    expect(tampered.json().error.code).toBe("R1_EVIDENCE_MANIFEST_INTEGRITY_FAILED");
    await ctx.pool.query(
      `UPDATE governance_approval_requests
          SET evidence_set_hash = $1,
              sla_due_at = now() - interval '2 minutes',
              expires_at = now() - interval '1 minute'
        WHERE approval_id = 'AP-R2-DETAIL-R1'`,
      [storedR1Hash],
    );
    const r1Expired = await inject(bobby, path);
    expect(r1Expired.statusCode).toBe(200);
    expect(r1Expired.json().data.eligibility).toMatchObject({
      can_approve: false,
      locks: expect.arrayContaining(["R1_EXPIRED"]),
    });
    await ctx.pool.query(
      `UPDATE governance_approval_requests
          SET sla_due_at = now() + interval '24 hours',
              expires_at = now() + interval '48 hours'
        WHERE approval_id = 'AP-R2-DETAIL-R1'`,
    );

    const lanWorkspaces = await inject(lan, "/api/workspaces");
    const otherWorkspace = lanWorkspaces
      .json()
      .workspaces.find((item: { owner_user_id: string }) => item.owner_user_id === lan.userId);
    expect(otherWorkspace).toBeDefined();
    await seedR2CapitalScope("AP-R2-OTHER-WORKSPACE", otherWorkspace.workspace_id);
    const isolated = await inject(
      bobby,
      `/api/v1/execution/governance/approvals/AP-R2-OTHER-WORKSPACE/r2?workspace_id=${workspaceId}`,
    );
    expect(isolated.statusCode).toBe(404);
    expect(isolated.json().error.code).toBe("APPROVAL_NOT_FOUND");

    await ctx.pool.query(
      `UPDATE governance_approval_requests
          SET created_at = now() - interval '3 minutes',
              sla_due_at = now() - interval '2 minutes',
              expires_at = now() - interval '1 minute'
        WHERE approval_id = 'AP-R2-DETAIL'`,
    );
    const expired = await inject(bobby, path);
    expect(expired.statusCode).toBe(404);
    expect(expired.json().error.code).toBe("APPROVAL_NOT_FOUND");
  });

  it("publishes an explicit fail-closed R2 state when no R1 lineage was captured", async () => {
    await seedR2CapitalScope("AP-R2-NO-LINEAGE", workspaceId, false);
    const response = await inject(
      bobby,
      `/api/v1/execution/governance/approvals/AP-R2-NO-LINEAGE/r2?workspace_id=${workspaceId}`,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      r1_reference: null,
      r1_state: "MISSING",
      r1_id: null,
      evidence_manifest: null,
      eligibility: {
        can_approve: false,
        locks: expect.arrayContaining(["R1_LINEAGE_UNPUBLISHED"]),
      },
    });
  });

  it("binds R2 capital preview to ADMIN and an immutable approval scope", async () => {
    await seedR2CapitalScope("AP-R2-CAPITAL");
    const path = "/api/v1/execution/approvals/AP-R2-CAPITAL/capital-preview";
    const body = {
      portfolio_id: "PF_R2_1",
      requested_amount: "125.250000000000000001",
      currency: "USDT",
    };

    const userDenied = await mutation(stan, path, body);
    expect(userDenied.statusCode).toBe(403);
    expect(userDenied.json().error.code).toBe("ANALYTICS_APPROVAL_REVIEW_FORBIDDEN");

    const scopeDenied = await mutation(bobby, path, {
      ...body,
      portfolio_id: "PF_OTHER",
    });
    expect(scopeDenied.statusCode).toBe(403);
    expect(scopeDenied.json().error.code).toBe("ANALYTICS_APPROVAL_SCOPE_MISMATCH");

    const allowedButDark = await mutation(bobby, path, body);
    expect(allowedButDark.statusCode).toBe(404);
    expect(allowedButDark.json().error.code).toBe("ANALYTICS_DISABLED");

    await expect(ctx.pool.query(
      `UPDATE governance_approval_analytics_scopes
          SET portfolio_id = 'PF_REBOUND'
        WHERE approval_id = 'AP-R2-CAPITAL'`,
    )).rejects.toThrow(/append-only/i);
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
    expect(terminal.json()).toMatchObject({
      status: "SUCCEEDED",
      verification_result: "SUCCEEDED",
      approval_id: "AP-APPROVE",
    });
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
    const state = await ctx.pool.query<{ status: string; decision: string; condition: string; conditions: unknown[] }>(
      `SELECT request.status, decision.decision, decision.condition, decision.conditions
       FROM governance_approval_requests request
       JOIN governance_approval_decisions decision USING (approval_id)
       WHERE request.approval_id = 'AP-CONDITION'`,
    );
    expect(state.rows[0]).toMatchObject({
      status: "APPROVED_WITH_CONDITION",
      decision: "APPROVE_WITH_CONDITION",
      condition: "Keep notional below the reviewed capacity ceiling until a new R1 review.",
      conditions: [{
        text: "Keep notional below the reviewed capacity ceiling until a new R1 review.",
        owner: bobby.userId,
        deadline: null,
        expires_at: null,
        blocking: true,
      }],
    });
  });

  it("persists multiple typed conditions as the canonical immutable decision evidence", async () => {
    const seeded = await seedApproval({ approvalId: "AP-TYPED-CONDITIONS" });
    const conditions = [
      {
        text: "Keep gross notional below the reviewed paper capacity.",
        owner: "risk-team",
        deadline: "2026-09-01",
        expires_at: "2026-09-30",
        blocking: true,
      },
      {
        text: "Publish the observation report before the next review.",
        owner: "research-team",
        deadline: null,
        expires_at: null,
        blocking: false,
      },
    ];
    const planned = await plan(
      bobby,
      planPayload("AP-TYPED-CONDITIONS", seeded.evidenceHashes, {
        request_key: "r1:AP-TYPED-CONDITIONS:conditional",
        payload: {
          decision: "APPROVE_WITH_CONDITION",
          reason: "The evidence is sufficient under two explicit operational conditions.",
          conditions,
          evidence_hashes: seeded.evidenceHashes,
        },
      }),
    );
    expect(planned.statusCode).toBe(201);
    expect((await apply(bobby, planned.json().operation_id, planned.json().apply_token)).statusCode).toBe(202);
    const persisted = await ctx.pool.query<{ conditions: unknown[] }>(
      "SELECT conditions FROM governance_approval_decisions WHERE approval_id = 'AP-TYPED-CONDITIONS'",
    );
    expect(persisted.rows[0].conditions).toEqual(conditions);
    await expect(ctx.pool.query(
      `UPDATE governance_approval_decisions SET conditions = '[]'::jsonb
       WHERE approval_id = 'AP-TYPED-CONDITIONS'`,
    )).rejects.toThrow(/append-only/);
  });

  it("rejects ambiguous aliases and typed-condition expiry before deadline", async () => {
    const seeded = await seedApproval({ approvalId: "AP-CONDITION-INVALID" });
    const base = {
      decision: "APPROVE_WITH_CONDITION" as const,
      reason: "The evidence is sufficient only when explicit conditions remain enforceable.",
      evidence_hashes: seeded.evidenceHashes,
    };
    const mixed = await plan(
      bobby,
      planPayload("AP-CONDITION-INVALID", seeded.evidenceHashes, {
        request_key: "r1:AP-CONDITION-INVALID:mixed",
        payload: {
          ...base,
          condition: "Legacy aliases cannot coexist with canonical typed conditions.",
          conditions: [{
            text: "Keep gross notional below the reviewed paper capacity.",
            owner: "risk-team",
            deadline: null,
            expires_at: null,
            blocking: true,
          }],
        },
      }),
    );
    expect(mixed.statusCode).toBe(400);
    expect(mixed.json().error.code).toBe("INVALID_DECISION_PLAN");

    const invalidExpiry = await plan(
      bobby,
      planPayload("AP-CONDITION-INVALID", seeded.evidenceHashes, {
        request_key: "r1:AP-CONDITION-INVALID:expiry",
        payload: {
          ...base,
          conditions: [{
            text: "Keep gross notional below the reviewed paper capacity.",
            owner: "risk-team",
            deadline: "2026-09-30",
            expires_at: "2026-09-01",
            blocking: true,
          }],
        },
      }),
    );
    expect(invalidExpiry.statusCode).toBe(400);
    expect(invalidExpiry.json().error.code).toBe("INVALID_DECISION_PLAN");
    expect((await ctx.pool.query(
      "SELECT 1 FROM governance_decision_plans WHERE approval_id = 'AP-CONDITION-INVALID'",
    )).rowCount).toBe(0);
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

  /**
   * A4-D14 · the `needs you` badge is the inbox's triage signal.
   *
   * It used to read `actor.role === "ADMIN"` for all five gates, which stopped
   * being true the moment A4-3 moved four of them onto capabilities. The two
   * failures that caused are opposites, and both are tested here: a delegated
   * decider whose queue looked empty, and an ADMIN pointed at a gate that would
   * refuse them.
   *
   * Rows are isolated by a unique subject token rather than by gate, because a
   * sibling spec seeds a 182k-row R1 corpus into this same database.
   */
  describe("A4-D14 · needs_you follows the authority the server actually enforces", () => {
    const GATES = ["R1", "R2", "LIVE_GATE", "PAPER_EXIT", "SANDBOX_EXIT"] as const;
    const TOKEN = "D14ROW";
    let dara: Actor;
    let ungranted: Actor;

    beforeAll(async () => {
      // A USER who holds a decide grant — the case A4-3 exists for, and the
      // one the old predicate could never report as `true`.
      dara = await createActor("dara", "USER");
      await ctx.pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
        [workspaceId, dara.userId],
      );
      await new GovernanceGrantsRepository(ctx.pool).insertGrant({
        grantId: "grn_a4d14_r1_decide",
        granteeUserId: dara.userId,
        capability: "governance.r1.decide",
        workspaceId: null,
        issuedBy: bobby.userId,
      });

      // This actor must stay grant-free for the whole D14 block. `stan` is
      // intentionally granted R2 read by an earlier detail-view test, so
      // reusing it here would make this negative case depend on test order.
      ungranted = await createActor("d14-ungranted", "USER");
      await ctx.pool.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
        [workspaceId, ungranted.userId],
      );

    }, 30_000);

    /*
     * Seeded per test, not once.
     *
     * The suite's own `beforeEach` truncates `governance_approval_requests`,
     * so rows created in a `beforeAll` are gone before the first assertion
     * runs. The grant and the account survive — neither table is truncated.
     */
    beforeEach(async () => {
      for (const gate of GATES) {
        await ctx.pool.query(
          `INSERT INTO governance_approval_requests
             (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
              environment, target_label, requester_user_id, requester_username,
              artifact_creator_user_id, artifact_creator_username, status, policy_version,
              quorum_required, evidence_set_hash, evidence_complete, blocker_count,
              blocker_summary, sla_due_at, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, 'ALPHA_VERSION', $4, $4,
                   'RESEARCH', $3, $5, 'stan', $5, 'stan', 'PENDING', 'approval.v3', 1,
                   $6, true, 0, NULL,
                   timestamptz '2026-09-01T00:00:00Z', timestamptz '2027-01-01T00:00:00Z',
                   timestamptz '2026-08-01T00:00:00Z', now())`,
          [
            `AP-${TOKEN}-${gate}`,
            workspaceId,
            gate,
            `${TOKEN} ${gate}`,
            // Requested by stan so that nobody reading below is the requester:
            // a self row is inert, and inert rows need nobody regardless.
            stan.userId,
            `sha256:${"0".repeat(64)}`,
          ],
        );
      }
    });

    async function needsYouByGate(
      actor: Actor,
      expectedGates: readonly (typeof GATES)[number][],
    ): Promise<Record<string, boolean>> {
      const response = await inject(
        actor,
        `/api/v1/execution/governance/approvals?workspace_id=${workspaceId}&view=ALL&subject=${TOKEN}&limit=50`,
      );
      expect(response.statusCode).toBe(200);
      const rows = response.json().page.rows as { id: string; gate: string; needs_you: boolean }[];
      const seen = rows.filter((row) => row.id.startsWith(`AP-${TOKEN}-`));
      expect(seen.map((row) => row.gate).sort()).toEqual([...expectedGates].sort());
      return Object.fromEntries(seen.map((row) => [row.gate, row.needs_you]));
    }

    it("tells a delegated USER that the gate they hold needs them", async () => {
      const needs = await needsYouByGate(dara, ["R1"]);
      // The whole point of A4-3, and previously invisible: dara's role is USER.
      expect(needs.R1).toBe(true);
      // A grant for one gate is not a grant to learn the other rows at all.
      expect(needs).not.toHaveProperty("R2");
      expect(needs).not.toHaveProperty("LIVE_GATE");
    });

    it("does not send an ADMIN to a gate that would refuse them", async () => {
      // `lan` is ADMIN and holds r1/r2 decide, but was never granted live.
      const needs = await needsYouByGate(lan, ["R1", "R2", "PAPER_EXIT"]);
      expect(needs.R1).toBe(true);
      expect(needs.R2).toBe(true);
      // The Live row is not merely inert: it is not disclosed to a caller who
      // lacks the matching read capability.
      expect(needs).not.toHaveProperty("LIVE_GATE");
    });

    it("gives the owner every gate the namespace covers", async () => {
      const needs = await needsYouByGate(bobby, GATES);
      expect(needs.R1).toBe(true);
      expect(needs.R2).toBe(true);
      expect(needs.LIVE_GATE).toBe(true);
    });

    it("keeps PAPER_EXIT on the role its own service still enforces", async () => {
      // paper-exit.service.ts throws APPROVER_ROLE_REQUIRED for a non-ADMIN,
      // so for this gate the role IS the right question. A capability rewrite
      // here would have newly broken a gate that was working.
      expect((await needsYouByGate(bobby, GATES)).PAPER_EXIT).toBe(true);
      expect((await needsYouByGate(lan, ["R1", "R2", "PAPER_EXIT"])).PAPER_EXIT).toBe(true);
      expect(await needsYouByGate(dara, ["R1"])).not.toHaveProperty("PAPER_EXIT");
    });

    it("never claims a SANDBOX_EXIT row needs anybody, because nothing can decide one", async () => {
      // The gate is legal in the schema and no code path creates or decides
      // one. Fail closed rather than invent an approver.
      expect((await needsYouByGate(bobby, GATES)).SANDBOX_EXIT).toBe(false);
      expect(await needsYouByGate(lan, ["R1", "R2", "PAPER_EXIT"])).not.toHaveProperty("SANDBOX_EXIT");
      expect(await needsYouByGate(dara, ["R1"])).not.toHaveProperty("SANDBOX_EXIT");
    });

    it("gives an ungranted USER nothing to do", async () => {
      expect(await needsYouByGate(ungranted, [])).toEqual({});
    });
  });
});
