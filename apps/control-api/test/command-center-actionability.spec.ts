import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { PortalUser } from "../src/domain";
import type { ControlApiConfig } from "../src/config";
import type { EffectiveAccess } from "../src/auth/owner-access.service";
import { OwnerAccessService } from "../src/auth/owner-access.service";
import { CommandCenterRepository } from "../src/command-center/command-center.repository";
import { commandCenterGovernanceActionableSql, commandCenterGovernanceGates } from "../src/command-center/governance-actionability";
import type { ExecutionReadScopes, ReadScopePrincipal } from "../src/execution-v2/read-scope";

const workspace = "ws_TEST_ONLY_cockpit", userId = "usr_TEST_ONLY_reviewer";
const actor = (role: "ADMIN" | "USER" = "USER") => ({ userId, role } as PortalUser);
const access = (capabilities: EffectiveAccess["capabilities"], scopedWorkspace: string | null = workspace): EffectiveAccess => ({
  userId, isOwner: false, capabilities, ownerState: "NOT_OWNER",
  scopes: Object.fromEntries(capabilities.map(capability => [capability, [scopedWorkspace]])),
});

describe("C5 legacy cockpit current decision gates (SYNTHETIC only)", () => {
  it("does not substitute readable R1/R2 for actionable decisions or generic ADMIN", () => {
    const read = access(["governance.r1.read", "governance.r2.read", "governance.live.read"]);
    expect(commandCenterGovernanceGates(actor(), read, workspace)).toEqual({
      readable: ["R1", "R2", "LIVE_GATE"], actionable: [],
    });
    expect(commandCenterGovernanceGates(actor("ADMIN"), read, workspace).actionable).toEqual(["PAPER_EXIT"]);
  });
  it("uses actual delegated decide grants, their workspace and R2's ADMIN constraint", () => {
    const grants = access(["governance.r1.read", "governance.r1.decide", "governance.r2.read", "governance.r2.decide"]);
    expect(commandCenterGovernanceGates(actor(), grants, workspace).actionable).toEqual(["R1"]);
    expect(commandCenterGovernanceGates(actor("ADMIN"), grants, workspace).actionable).toEqual(["R1", "R2", "PAPER_EXIT"]);
    expect(commandCenterGovernanceGates(actor(), grants, "ws_TEST_ONLY_foreign").actionable).toEqual([]);
  });
  it("keeps Live/Sandbox uncommissioned even for the owner and does not infer a permit", () => {
    const owner = { ...access([]), isOwner: true, ownerState: "OWNER" as const };
    expect(commandCenterGovernanceGates(actor("ADMIN"), owner, workspace).actionable).toEqual(["R1", "R2", "PAPER_EXIT"]);
  });
});

function mockedRead(before: EffectiveAccess, after = before, scopes?: ExecutionReadScopes) {
  // Only scalar COUNT queries return a scalar row. A page's count(*) OVER()
  // does not manufacture an incident/operation row in an empty population.
  const query = vi.fn(async (sql: string, _parameters?: unknown[]) => ({ rows:
    /^\s*SELECT\s+count\s*\(/i.test(sql) ? [{ count: "0", total_count: "0" }] : [] }));
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })), query: vi.fn() } as unknown as Pool;
  const effectiveAccess = vi.fn().mockResolvedValueOnce(before).mockImplementationOnce(async () => {
    expect(release).toHaveBeenCalledOnce();
    return after;
  });
  const owner = { effectiveAccess } as unknown as OwnerAccessService;
  const repository = new CommandCenterRepository(pool, {} as ControlApiConfig, pool, undefined, undefined, owner, scopes);
  return { repository, query, release, pool, effectiveAccess };
}

describe("C5 cockpit page/count and last current-grant fence", () => {
  it("passes decision gates to page AND count, read gates only to Today, using identical SQL", async () => {
    const f = mockedRead(access(["governance.r1.read"]));
    const result = await f.repository.read(workspace, actor(), new Date("2026-10-18T12:00:00Z"));
    const population = f.query.mock.calls.filter(([sql]) => sql.includes(commandCenterGovernanceActionableSql));
    expect(population).toHaveLength(2);
    for (const [sql, parameters] of population as unknown as Array<[string, unknown[]]>) {
      expect(sql).toContain("FROM governance_approval_decision_inbox request");
      expect(parameters[3]).toEqual([]);
    }
    expect(result.triageSources[0].exact_total_count).toBe(0);
    expect(result.triageSources[1].items).toEqual([]);
    expect(result.triageSources[2].items).toEqual([]);
    expect(f.effectiveAccess).toHaveBeenCalledTimes(2);
    expect(f.query.mock.calls.find(([sql]) => sql.includes("WITH upcoming"))?.[1]).toEqual([
      workspace, new Date("2026-10-18T12:00:00Z"), ["R1"],
    ]);
  });
  it("does not deliver after decide revocation even while the read grant remains", async () => {
    const f = mockedRead(access(["governance.r1.read", "governance.r1.decide"]), access(["governance.r1.read"]));
    await expect(f.repository.read(workspace, actor(), new Date())).rejects.toMatchObject({
      code: "EXECUTION_READ_ACCESS_CHANGED", status: 409,
    });
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("does not deliver after read-scope revocation", async () => {
    const f = mockedRead(access(["governance.r1.read"]), access(["governance.r1.read"], "ws_TEST_ONLY_other"));
    await expect(f.repository.read(workspace, actor(), new Date())).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it("does not deliver after the owner anchor is removed", async () => {
    const before = { ...access([]), isOwner: true, ownerState: "OWNER" as const };
    const f = mockedRead(before, access([]));
    await expect(f.repository.read(workspace, actor(), new Date())).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it("never fills a SCOPED_V2 Core gap with legacy SQL or legacy authority", async () => {
    const scopes = { coreSelectionMode: vi.fn(async () => "SCOPED_V2") } as unknown as ExecutionReadScopes;
    const f = mockedRead(access([]), access([]), scopes);
    const principal = { user: actor(), session: {}, workspaceId: workspace, viewerWorkspaceId: workspace } as ReadScopePrincipal;
    const result = await f.repository.readAuthorized(principal, new Date(), (input, scoped) => ({ input, scoped }));
    expect(result.scoped).toBe(true);
    expect(result.input.triageSources[0].status.reason).toBe("PORTAL_WORKFLOW_TARGET_LINEAGE_NOT_PUBLISHED");
    expect(f.pool.connect).not.toHaveBeenCalled();
    expect(f.effectiveAccess).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled();
  });
});
