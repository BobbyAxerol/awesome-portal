/**
 * RV-10 follow-up: the R2 parent of a deployment, as the PAPER_EXIT_CREATE capture context. In-memory lane (no PostgreSQL, no Docker):
 * the service's authority order and what it hands to the one context producer, the repository's SQL shape, and the closed contract.
 * The ordering of the SQL on real rows is `paper-exit-parent.pg.spec.ts` (written, NOT run in this lane).
 */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { EffectiveAccess } from "../src/auth/owner-access.service";
import type { AuthSession, PortalUser } from "../src/domain";
import { GovernanceError, GovernanceService } from "../src/governance/governance.service";
import { GovernanceRepository, type ApprovalRecord, type R2ApprovalDetailRecord } from "../src/governance/governance.repository";
import { paperExitParent, paperExitParentOutcome, paperExitParentQuery } from "../src/governance/paper-exit-parent";
import { blockedCapture, CaptureContextSchema } from "../src/governance/review-context";

const WS = "ws_TEST_ONLY";
const DEPLOYMENT = "deployment_TEST_ONLY";
const HASH = (c: string) => `sha256:${c.repeat(64)}`;
const user = { userId: "usr_TEST_ONLY", username: "reviewer", role: "ADMIN", sessionVersion: 4 } as PortalUser;
const session = { sessionId: "ses_TEST_ONLY", userId: user.userId, sessionVersion: 4 } as AuthSession;
const access = (capabilities: string[], scopes: Record<string, Array<string | null>> = {}, isOwner = false): EffectiveAccess =>
  ({ userId: user.userId, isOwner, capabilities: capabilities as never, ownerState: isOwner ? "OWNER" : "NOT_OWNER", scopes: scopes as never });
const R2_READ = access(["governance.r2.read"], { "governance.r2.read": [null] });

const approval = { approvalId: "apr_TEST_ONLY_r2", workspaceId: WS, gate: "R2", subjectId: DEPLOYMENT, approvalVersion: 3, status: "APPROVED" } as ApprovalRecord;
const lineage = { r1ApprovalId: "apr_TEST_ONLY_r1", r1Status: "APPROVED" } as R2ApprovalDetailRecord["lineage"];
const detail = (patch: Partial<R2ApprovalDetailRecord> = {}): R2ApprovalDetailRecord => ({
  approval, scope: { approvalId: approval.approvalId, workspaceId: WS, portfolioId: "portfolio_TEST_ONLY", currency: "USDT" },
  lineage, evidence: [], parentEvidence: [], ...patch,
});
const available = () => CaptureContextSchema.parse({ ...blockedCapture(approval, "PAPER_EXIT_CREATE", "CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND"),
  availability: { state: "AVAILABLE", reason_code: null }, expected_projection_digest: HASH("c"),
  candidates: [{ deployment_id: DEPLOYMENT, portfolio_id: "portfolio_TEST_ONLY", risk_grant_id: null, currency: "USDT" }] });

function harness(options: { access?: EffectiveAccess; found?: R2ApprovalDetailRecord | null; approvalId?: string | null; member?: boolean[]; captures?: boolean; context?: ReturnType<typeof available> } = {}) {
  const members = [...(options.member ?? [true, true])];
  const pool = { query: vi.fn(async () => ({ rows: members.length === 0 ? [] : [{ member: members.shift() }] })) };
  const repository = {
    pool,
    r2ParentOfDeployment: vi.fn(async () => (options.approvalId === undefined ? approval.approvalId : options.approvalId)),
    r2Detail: vi.fn(async () => (options.found === undefined ? detail() : options.found)),
  };
  const captures = { context: vi.fn(async () => options.context ?? blockedCapture(approval, "PAPER_EXIT_CREATE", "ADMIN_ROLE_REQUIRED")) };
  const service = Object.create(GovernanceService.prototype) as GovernanceService;
  Object.assign(service, { repository, ownerAccess: { effectiveAccess: vi.fn(async () => options.access ?? R2_READ) }, captures: options.captures === false ? undefined : captures });
  return { service, repository, captures, pool };
}
const refusal = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error as GovernanceError; } throw new Error("expected a refusal"); };

describe("GovernanceService.paperExitParent", () => {
  it("a deployment with no R2 answers NONE with no context, and asks the context producer nothing", async () => {
    const h = harness({ approvalId: null });
    const out = await h.service.paperExitParent(user, session, WS, DEPLOYMENT);
    expect(out).toMatchObject({ schema_version: "governance.paper-exit-parent.v1", workspace_id: WS, deployment_id: DEPLOYMENT, state: "NONE", capture_context: null });
    expect(h.repository.r2ParentOfDeployment).toHaveBeenCalledWith(WS, DEPLOYMENT);
    expect(h.repository.r2Detail).not.toHaveBeenCalled();
    expect(h.captures.context).not.toHaveBeenCalled();
    expect(paperExitParent.safeParse(out).success).toBe(true);
  });

  it("an R2 that cannot be read back is NONE too, never a guessed context", async () => {
    const h = harness({ found: null });
    expect((await h.service.paperExitParent(user, session, WS, DEPLOYMENT)).state).toBe("NONE");
    expect(h.captures.context).not.toHaveBeenCalled();
  });

  it("FOUND is the context producer's own answer for that R2, given the lineage with the scope's portfolio", async () => {
    const h = harness({ context: available() });
    const out = await h.service.paperExitParent(user, session, WS, DEPLOYMENT);
    expect(h.repository.r2Detail).toHaveBeenCalledWith(WS, approval.approvalId, "R2");
    expect(h.captures.context).toHaveBeenCalledWith(user, "PAPER_EXIT_CREATE", approval, { ...lineage, portfolioId: "portfolio_TEST_ONLY" });
    expect(out).toMatchObject({ state: "FOUND", capture_context: { action: "PAPER_EXIT_CREATE", parent_approval_id: approval.approvalId, expected_parent_version: 3,
      availability: { state: "AVAILABLE" }, expected_projection_digest: HASH("c") } });
  });

  it("a blocked context is published with its typed reason (not a 403 with none); an R2 with no lineage or scope passes null, as the R2 review does", async () => {
    const h = harness({ found: detail({ lineage: null, scope: null }) });
    const out = await h.service.paperExitParent(user, session, WS, DEPLOYMENT);
    expect(h.captures.context).toHaveBeenCalledWith(user, "PAPER_EXIT_CREATE", approval, null);
    expect(out).toMatchObject({ state: "FOUND", capture_context: { availability: { state: "BLOCKED", reason_code: "ADMIN_ROLE_REQUIRED" }, expected_projection_digest: null, candidates: [] } });
  });

  it("is refused without the R2 read authority before anything is read; an owner and a workspace-scoped grant pass, another workspace's grant does not", async () => {
    for (const denied of [access([]), access(["governance.r2.read"], { "governance.r2.read": ["ws_OTHER"] })]) {
      const h = harness({ access: denied });
      const error = await refusal(h.service.paperExitParent(user, session, WS, DEPLOYMENT));
      expect(error).toBeInstanceOf(GovernanceError);
      expect(error.status).toBe(403);
      expect(h.repository.r2ParentOfDeployment).not.toHaveBeenCalled();
    }
    expect((await harness({ access: access([], {}, true), approvalId: null }).service.paperExitParent(user, session, WS, DEPLOYMENT)).state).toBe("NONE");
  });

  it("proves the exact session and membership before the reads and again after the last await: a membership revoked in between publishes nothing, and an unproven session is a 401", async () => {
    const h = harness({ member: [true, false] });
    const error = await refusal(h.service.paperExitParent(user, session, WS, DEPLOYMENT));
    expect(error).toMatchObject({ code: "WORKSPACE_ACCESS_DENIED", status: 403 });
    expect(h.pool.query).toHaveBeenCalledTimes(2);
    expect(h.repository.r2Detail).toHaveBeenCalled();
    const first = await refusal(harness({ member: [] }).service.paperExitParent(user, session, WS, DEPLOYMENT));
    expect(first).toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    const other = await refusal(harness().service.paperExitParent(user, { ...session, userId: "usr_other" } as AuthSession, WS, DEPLOYMENT));
    expect(other.status).toBe(401);
  });

  it("is a typed 503 when review capture is not configured, never an empty answer", async () => {
    const error = await refusal(harness({ captures: false }).service.paperExitParent(user, session, WS, DEPLOYMENT));
    expect(error).toMatchObject({ code: "REVIEW_CAPTURE_NOT_CONFIGURED", status: 503 });
  });
});

describe("GovernanceRepository.r2ParentOfDeployment", () => {
  function repository(rows: Array<{ approval_id: string }>) {
    const query = vi.fn(async (..._args: unknown[]) => ({ rows }));
    return { repo: new GovernanceRepository({ query } as unknown as Pool), query };
  }
  it("binds workspace and deployment as parameters, reads only the R2 gate, prefers an approved unexpired R2 and then the newest", async () => {
    const { repo, query } = repository([{ approval_id: "apr_1" }]);
    expect(await repo.r2ParentOfDeployment(WS, DEPLOYMENT)).toBe("apr_1");
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([WS, DEPLOYMENT]);
    expect(sql).toContain("FROM governance_approval_requests");
    expect(sql).toMatch(/workspace_id = \$1 AND gate = 'R2' AND subject_id = \$2/);
    expect(sql).toMatch(/ORDER BY \(status IN \('APPROVED', 'APPROVED_WITH_CONDITION'\) AND expires_at > now\(\)\) DESC,\s+created_at DESC, approval_id DESC\s+LIMIT 1/);
    expect(sql).not.toContain(DEPLOYMENT);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });
  it("no row is null", async () => {
    expect(await repository([]).repo.r2ParentOfDeployment(WS, DEPLOYMENT)).toBeNull();
  });
});

describe("paper-exit-parent contract", () => {
  it("the query is closed: a deployment id, an optional workspace and nothing else", () => {
    expect(paperExitParentQuery.safeParse({ deployment_id: DEPLOYMENT }).success).toBe(true);
    expect(paperExitParentQuery.safeParse({ deployment_id: DEPLOYMENT, workspace_id: WS }).success).toBe(true);
    for (const bad of [{}, { deployment_id: "" }, { deployment_id: "a b" }, { deployment_id: DEPLOYMENT, approval_id: "apr_1" }, { deployment_id: "x".repeat(193) }])
      expect(paperExitParentQuery.safeParse(bad).success).toBe(false);
  });
  it("state and context agree; the context is a PAPER_EXIT_CREATE context of this workspace listing only this deployment", () => {
    const found = paperExitParentOutcome({ workspaceId: WS, deploymentId: DEPLOYMENT, context: available() });
    expect(found.state).toBe("FOUND");
    expect(paperExitParent.safeParse({ ...found, state: "NONE" }).success).toBe(false);
    expect(paperExitParent.safeParse({ ...found, capture_context: null }).success).toBe(false);
    expect(paperExitParent.safeParse({ ...found, extra: 1 }).success).toBe(false);
    expect(() => paperExitParentOutcome({ workspaceId: "ws_OTHER", deploymentId: DEPLOYMENT, context: available() })).toThrow();
    expect(() => paperExitParentOutcome({ workspaceId: WS, deploymentId: "deployment_OTHER", context: available() })).toThrow();
    const r2 = CaptureContextSchema.parse({ ...available(), action: "R2_CREATE", candidates: [{ deployment_id: DEPLOYMENT, portfolio_id: "p", risk_grant_id: "risk_1", currency: "USDT" }] });
    expect(() => paperExitParentOutcome({ workspaceId: WS, deploymentId: DEPLOYMENT, context: r2 })).toThrow();
  });
});
