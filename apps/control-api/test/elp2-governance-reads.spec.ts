import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { ControlApiConfig } from "../src/config";
import type { PortalUser, AuthSession } from "../src/domain";
import type { EffectiveAccess, OwnerAccessService } from "../src/auth/owner-access.service";
import { OperationalCompositionService } from "../src/execution/operational-composition.service";
import { GovernanceService, computeEvidenceManifestHash, assertGovernanceReadSession } from "../src/governance/governance.service";
import { PaperExitRepository, type PaperExitSnapshot } from "../src/governance/paper-exit.repository";
import { PaperExitService, computePaperExitSourceSnapshotHash } from "../src/governance/paper-exit.service";
import { GovernanceController } from "../src/governance/governance.controller";

// TEST_ONLY: service-boundary proof. Existing paper-exit.spec.ts supplies the
// real PostgreSQL/HTTP positive read, including USER member read-only access.
const config = {
  GOVERNANCE_APPLY_ACTIVE_KEY_ID: "test",
  GOVERNANCE_APPLY_KEYS_JSON: JSON.stringify({ test: "elp2-governance-test-only-key-material-32-bytes" }),
  QUERY_CURSOR_ACTIVE_KEY_ID: "test",
  QUERY_CURSOR_KEYS_JSON: JSON.stringify({ test: "elp2-governance-test-only-key-material-32-bytes" }),
  QUERY_CURSOR_TTL_SECONDS: 300,
} as ControlApiConfig;
const user = { userId: "reader", username: "reader", role: "USER", sessionVersion: 7 } as PortalUser;
const principal = { user, session: { sessionId: "lease", userId: user.userId, sessionVersion: 7 } as AuthSession, workspaceId: "ws_a" };

function composition(governance: GovernanceService) {
  if (typeof governance.assertReadAuthority !== "function") Object.assign(governance, { assertReadAuthority: vi.fn(async () => undefined) });
  const quality = vi.fn(async () => ({ state: "AVAILABLE" }));
  const service = new OperationalCompositionService(config,
    { sourceHealth: vi.fn(async () => ({ input_digest: "source" })), deploymentQuality: quality } as never,
    {} as never, governance, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { service, quality };
}

describe("ELP2 Governance read boundaries", () => {
  it("routes Live through its own reader while retaining the composition backbone", async () => {
    const backbone = { data: { approval: { subject_id: "deployment_a", gate: "LIVE_GATE" } } };
    const liveDetail = vi.fn(async () => ({ governance_backbone: backbone }));
    const r2Detail = vi.fn();
    const { service, quality } = composition({ liveDetail, r2Detail } as unknown as GovernanceService);
    const result = await service.approval(principal, "approval_live", "live");
    expect(liveDetail).toHaveBeenCalledWith(user, principal.session, "ws_a", "approval_live");
    expect(r2Detail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ data: { governance: backbone, accepted_manager_facts: { state: "AVAILABLE" } } });
    expect(quality).toHaveBeenCalledWith({ ...principal, viewerWorkspaceId: principal.workspaceId }, "deployment_a", "live");
  });

  it.each(["r1", "r2"] as const)("preserves %s's distinct reader", async view => {
    const detail = vi.fn(async () => ({ data: {} }));
    const r2Detail = vi.fn(async () => ({ data: {} }));
    const liveDetail = vi.fn();
    const { service, quality } = composition({ detail, r2Detail, liveDetail } as unknown as GovernanceService);
    await service.approval(principal, "approval", view);
    expect(view === "r1" ? detail : r2Detail).toHaveBeenCalledWith(user, "ws_a", "approval", principal.session);
    expect(liveDetail).not.toHaveBeenCalled();
    expect(quality).not.toHaveBeenCalled();
  });

  function actualGovernance(capability: "governance.r2.read" | "governance.live.read", workspace = "ws_a") {
    const lookup = vi.fn(async () => null);
    const access: EffectiveAccess = { userId: user.userId, isOwner: false, ownerState: "NOT_OWNER",
      capabilities: [capability], scopes: { [capability]: [workspace] } };
    const governance = new GovernanceService({ pool: { query: async () => ({ rows: [{ member: true, policy_seen: false }] }) }, r2Detail: lookup } as never, config, {} as never,
      { effectiveAccess: async () => access } as OwnerAccessService);
    return { ...composition(governance), lookup };
  }

  it("R2-only authority cannot read a Live composition or consult its approval", async () => {
    const { service, lookup, quality } = actualGovernance("governance.r2.read");
    await expect(service.approval(principal, "approval_live", "live"))
      .rejects.toMatchObject({ code: "GOVERNANCE_CAPABILITY_REQUIRED", status: 403 });
    expect(lookup).not.toHaveBeenCalled();
    expect(quality).not.toHaveBeenCalled();
  });

  it("Live-only authority queries the LIVE_GATE record and keeps a wrong-gate id not found", async () => {
    const { service, lookup } = actualGovernance("governance.live.read");
    await expect(service.approval(principal, "approval_r2", "live"))
      .rejects.toMatchObject({ code: "APPROVAL_NOT_FOUND", status: 404 });
    expect(lookup).toHaveBeenCalledWith("ws_a", "approval_r2", "LIVE_GATE");
  });

  it("Live authority in another workspace cannot read the composition", async () => {
    const { service, lookup } = actualGovernance("governance.live.read", "ws_b");
    await expect(service.approval(principal, "approval_live", "live"))
      .rejects.toMatchObject({ code: "GOVERNANCE_SCOPE_MISMATCH", status: 403 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("fences a gate-only revoke after the source composition awaits", async () => {
    let revoked = false;
    const assertReadAuthority = vi.fn(async (_user: PortalUser, _session: AuthSession, workspace: string, gate: string) => {
      expect(workspace).toBe("ws_a"); expect(gate).toBe("live");
      if (revoked) throw Object.assign(new Error("Access denied"), { code: "GOVERNANCE_CAPABILITY_REQUIRED", status: 403 });
    });
    const governance = { liveDetail: vi.fn(async () => ({ governance_backbone: { data: {} } })), assertReadAuthority };
    const service = new OperationalCompositionService(config, { sourceHealth: async () => {
      revoked = true; return { input_digest: "source" };
    } } as never, {} as never, governance as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await expect(service.approval(principal, "approval_live", "live"))
      .rejects.toMatchObject({ code: "GOVERNANCE_CAPABILITY_REQUIRED", status: 403 });
    expect(assertReadAuthority).toHaveBeenCalledOnce();
  });

  it("read-session fence checks exact lease and workspace, independently of role grants", async () => {
    const lease = { sessionId: "lease", userId: user.userId, sessionVersion: 7 } as AuthSession;
    const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [{ member: true }] }));
    await assertGovernanceReadSession({ query } as unknown as Pick<Pool, "query">, user, lease, "ws_a");
    expect(query.mock.calls[0]?.[1]).toEqual([user.userId, 7, "lease", "ws_a", "USER"]);
    expect(query.mock.calls[0]?.[0]).toContain("s.absolute_expires_at>clock_timestamp()");
    query.mockResolvedValueOnce({ rows: [{ member: false }] });
    await expect(assertGovernanceReadSession({ query } as unknown as Pick<Pool, "query">, user, lease, "ws_b"))
      .rejects.toMatchObject({ code: "WORKSPACE_ACCESS_DENIED" });
  });

  function commissionedParentFixture(options: { policy?: boolean; member?: boolean; revoked?: boolean } = {}) {
    const authority = { policy: options.policy ?? false, member: options.member ?? true, revoked: options.revoked ?? false };
    const query = vi.fn(async (sql: string, _values?: unknown[]) => ({ rows: sql.includes("AS policy_seen")
      ? [{ policy_seen: authority.policy }] : authority.revoked ? [] : [{ member: authority.member }] }));
    const parentRead = vi.fn(async () => null);
    const ownerAccess = { effectiveAccess: async () => ({ userId: user.userId, isOwner: true,
      ownerState: "OWNER", capabilities: [], scopes: {} }) } as unknown as OwnerAccessService;
    const service = new GovernanceService({ pool: { query }, detail: parentRead, r2Detail: parentRead } as never,
      { ...config, EXECUTION_READ_PROFILE: "retained_review_v1", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "source_ws" },
      {} as never, ownerAccess);
    return { service, authority, query, parentRead };
  }

  it.each(["list", "history", "conditions", "r1", "r2", "live"] as const)(
    "refuses the uncommissioned V2 %s parent before any record/count query", async branch => {
      const f = commissionedParentFixture({ policy: true });
      const call = branch === "list" || branch === "history" || branch === "conditions"
        ? f.service[branch](user, "ws_a", {}, principal.session)
        : branch === "live" ? f.service.liveDetail(user, principal.session, "ws_a", "approval")
          : f.service[branch === "r1" ? "detail" : "r2Detail"](user, "ws_a", "approval", principal.session);
      await expect(call).rejects.toMatchObject({ code: "ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED", status: 503,
        details: { dependency: "QUALIFIED_TARGET_LINEAGE_AND_FIELD_PUBLICATION_REQUIRED" } });
      expect(f.parentRead).not.toHaveBeenCalled();
      expect(f.query.mock.calls.every(([sql]) => sql.includes("AS policy_seen") || sql.includes("auth_sessions"))).toBe(true);
      expect(f.query.mock.calls.find(([sql]) => sql.includes("AS policy_seen"))?.[1]).toEqual(["ws_a"]);
    });

  it("keeps Core compatibility separate from retained source workspace and checks exact session", async () => {
    const f = commissionedParentFixture();
    await expect(f.service.r2Detail(user, "ws_a", "approval", principal.session))
      .rejects.toMatchObject({ code: "APPROVAL_NOT_FOUND" });
    expect(f.parentRead).toHaveBeenCalledWith("ws_a", "approval", "R2");
    f.authority.member = false;
    await expect(f.service.r2Detail(user, "source_ws", "approval", principal.session))
      .rejects.toMatchObject({ code: "WORKSPACE_ACCESS_DENIED" });
    f.authority.member = true; f.authority.revoked = true;
    await expect(f.service.r2Detail(user, "ws_a", "approval", principal.session))
      .rejects.toMatchObject({ code: "SESSION_REQUIRED" });
  });

  it("does not let the sessionless internal Research mirror select legacy under V2", async () => {
    const f = commissionedParentFixture({ policy: true });
    await expect(f.service.detail(user, "ws_a", "approval"))
      .rejects.toMatchObject({ code: "ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED" });
    expect(f.parentRead).not.toHaveBeenCalled();
    expect(f.query.mock.calls.every(([sql]) => !sql.includes("auth_sessions"))).toBe(true);
  });

  it("rechecks sticky policy after reading a legacy parent", async () => {
    const f = commissionedParentFixture();
    vi.spyOn(f.service as unknown as { r2Payload(): Promise<object> }, "r2Payload")
      .mockImplementation(async () => { f.authority.policy = true; return { data: { secret: "do-not-deliver" } }; });
    await expect(f.service.r2Detail(user, "ws_a", "approval", principal.session))
      .rejects.toMatchObject({ code: "ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED" });
  });

  const currentActor = () => ({ status: "ACTIVE", archived_at: null, session_version: 7,
    must_change_password: false, role: "USER", member: true });
  function readRepository(current: unknown) {
    const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: current === null ? [] : [current] }));
    return { query, repository: new PaperExitRepository({ query } as unknown as Pool) };
  }

  it("Paper Exit keeps current USER workspace-member reads separate from ADMIN decisions", async () => {
    const { repository, query } = readRepository(currentActor());
    await expect(repository.assertReadAuthority(user, "ws_a")).resolves.toBeUndefined();
    expect(query.mock.calls[0]?.[1]).toEqual(["reader", "ws_a"]);
  });

  it.each([
    ["missing", null, "SESSION_REQUIRED", 401],
    ["disabled", { ...currentActor(), status: "DISABLED" }, "SESSION_REQUIRED", 401],
    ["archived", { ...currentActor(), archived_at: new Date() }, "SESSION_REQUIRED", 401],
    ["old generation", { ...currentActor(), session_version: 8 }, "SESSION_REQUIRED", 401],
    ["changed role", { ...currentActor(), role: "ADMIN" }, "SESSION_REQUIRED", 401],
    ["password reset", { ...currentActor(), must_change_password: true }, "PASSWORD_CHANGE_REQUIRED", 403],
    ["removed membership", { ...currentActor(), member: false }, "WORKSPACE_ACCESS_DENIED", 403],
  ])("refuses Paper Exit %s before loading evidence", async (_name, current, code, status) => {
    const { repository } = readRepository(current);
    const detail = vi.spyOn(repository, "detail");
    const service = new PaperExitService(repository, config);
    await expect(service.detail(user, "ws_a", "hidden_or_unknown"))
      .rejects.toMatchObject({ code, status });
    expect(detail).not.toHaveBeenCalled();
  });

  it("checks current read authority again after the snapshot await", async () => {
    const snapshot = { approval: { evidenceSetHash: computeEvidenceManifestHash([]) },
      review: {}, evidence: [], lineage: [], panels: [], findings: [], decisions: [], promotionGrant: null } as unknown as PaperExitSnapshot;
    snapshot.review.sourceSnapshotHash = computePaperExitSourceSnapshotHash(snapshot);
    const assertReadAuthority = vi.fn().mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error("revoked"), { governanceCode: "WORKSPACE_ACCESS_DENIED", status: 403 }));
    const detail = vi.fn(async () => snapshot);
    const service = new PaperExitService({ assertReadAuthority, detail,
      pool: { query: async () => ({ rows: [{ policy_seen: false }] }) } } as unknown as PaperExitRepository, config);
    await expect(service.detail(user, "ws_a", "review")).rejects.toMatchObject({ code: "WORKSPACE_ACCESS_DENIED", status: 403 });
    expect(assertReadAuthority).toHaveBeenCalledTimes(2);
    expect(detail).toHaveBeenCalledOnce();
  });

  it("refuses V2 Paper Exit before stored parent bytes, keeping legacy USER member reads", async () => {
    let policy = true;
    const query = vi.fn(async (sql: string) => ({ rows: [sql.includes("AS policy_seen") ? { policy_seen: policy } : currentActor()] }));
    const repository = new PaperExitRepository({ query } as unknown as Pool);
    const detail = vi.spyOn(repository, "detail");
    const service = new PaperExitService(repository, config);
    await expect(service.detail(user, "ws_a", "review", principal.session))
      .rejects.toMatchObject({ code: "ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED", details: { branch: "PAPER_EXIT" } });
    expect(detail).not.toHaveBeenCalled();
    policy = false;
    await expect(service.assertReadAuthority(user, "ws_a", principal.session)).resolves.toBeUndefined();
  });

  it("refuses Paper Exit if policy activates during snapshot loading", async () => {
    let policy = false;
    const snapshot = { approval: { evidenceSetHash: computeEvidenceManifestHash([]) },
      review: {}, evidence: [], lineage: [], panels: [], findings: [], decisions: [], promotionGrant: null } as unknown as PaperExitSnapshot;
    snapshot.review.sourceSnapshotHash = computePaperExitSourceSnapshotHash(snapshot);
    const service = new PaperExitService({ assertReadAuthority: async () => undefined,
      pool: { query: async (sql: string) => ({ rows: [sql.includes("AS policy_seen") ? { policy_seen: policy } : currentActor()] }) },
      detail: async () => { policy = true; return snapshot; } } as unknown as PaperExitRepository, config);
    await expect(service.detail(user, "ws_a", "review", principal.session))
      .rejects.toMatchObject({ code: "ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED" });
  });

  function operationController() {
    const mode = vi.fn(async () => "SCOPED_V2");
    const record = vi.fn(async () => ({ operation_id: "operation" }));
    const queue = vi.fn(async () => ({ page: { rows: [] } }));
    const controller = new GovernanceController({} as never, {} as never, {} as never,
      { operationOrNull: record } as never, { list: queue } as never,
      { isMember: async () => true } as never, config, { coreSelectionMode: mode } as never);
    const request = { portalUser: user, portalSession: principal.session, portalWorkspaceId: "ws_a" } as never;
    return { controller, request, mode, record, queue };
  }

  it.each(["queue", "detail"] as const)("refuses V2 operation %s without fetching parents", async branch => {
    const f = operationController();
    const call = branch === "queue" ? f.controller.operationsQueue(f.request, {}) : f.controller.operation(f.request, "operation");
    await expect(call).rejects.toMatchObject({ code: "OPERATIONS_SCOPED_PARENT_NOT_COMMISSIONED", status: 503 });
    expect(f.queue).not.toHaveBeenCalled(); expect(f.record).not.toHaveBeenCalled();
    expect(f.mode).toHaveBeenCalledWith({ ...principal, viewerWorkspaceId: "ws_a" });
  });

  it("keeps legacy operation detail but blocks a V2 cutover while reading it", async () => {
    const f = operationController();
    f.mode.mockResolvedValue("LEGACY_COMPATIBILITY");
    await expect(f.controller.operation(f.request, "operation")).resolves.toEqual({ operation_id: "operation" });
    f.mode.mockResolvedValueOnce("LEGACY_COMPATIBILITY").mockResolvedValueOnce("SCOPED_V2");
    await expect(f.controller.operation(f.request, "operation"))
      .rejects.toMatchObject({ code: "OPERATIONS_SCOPED_PARENT_NOT_COMMISSIONED" });
  });

  it("fences operation composition before parent reads and after source awaits", async () => {
    let scoped = true;
    const coreSelectionMode = vi.fn(async () => scoped ? "SCOPED_V2" : "LEGACY_COMPATIBILITY");
    const list = vi.fn(async () => ({ page: { items: ["private-operation"] } }));
    const sourceHealth = vi.fn(async () => { scoped = true; return { input_digest: "source" }; });
    const service = new OperationalCompositionService(config, { sourceHealth } as never, {} as never,
      {} as never, {} as never, { list } as never, {} as never, {} as never, {} as never,
      undefined, { coreSelectionMode } as never);
    await expect(service.operationsQueue(principal)).rejects.toMatchObject({ code: "OPERATIONS_SCOPED_PARENT_NOT_COMMISSIONED" });
    expect(list).not.toHaveBeenCalled(); expect(sourceHealth).not.toHaveBeenCalled();
    scoped = false;
    await expect(service.operationsQueue(principal)).rejects.toMatchObject({ code: "OPERATIONS_SCOPED_PARENT_NOT_COMMISSIONED" });
    expect(list).toHaveBeenCalledOnce(); expect(sourceHealth).toHaveBeenCalledOnce();
  });

  it("does not misclassify static ADMIN task metadata as a scoped parent or grant", async () => {
    const coreSelectionMode = vi.fn(async () => "SCOPED_V2");
    const taskCatalogue = vi.fn(() => ({ tasks: [{ task_id: "static-task" }] }));
    const service = new OperationalCompositionService(config, { sourceHealth: async () => ({ input_digest: "source" }) } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { taskCatalogue } as never,
      undefined, { coreSelectionMode } as never);
    const admin = { ...principal, user: { ...user, role: "ADMIN" as const } };
    const result = await service.adminActionDrawer(admin);
    expect(taskCatalogue).toHaveBeenCalledWith(admin.user, admin.workspaceId);
    expect(coreSelectionMode).not.toHaveBeenCalled();
    expect(result).toMatchObject({ data: { command_authority: { state: "FAIL_CLOSED", relay_active: false,
      source_side_effect_requested: false } } });
  });
});
