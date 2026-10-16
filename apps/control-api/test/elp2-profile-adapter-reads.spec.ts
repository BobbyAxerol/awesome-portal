import { describe, expect, it, vi } from "vitest";
import { ExecutionProfileReadAdapterService, scopedAdapterFieldsSchema, scopedAdapterResponseSchema } from "../src/execution/profile-read-adapter.service";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { ExecutionReadScopeError, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { testConfig } from "./harness";

describe("ELP2-04 adapter closed public DTO boundaries", () => {
  it.each(["physical_balance", "external_account_ref", "private_key", "credential_state", "host", "source_cursor"])("never publishes %s", field => {
    expect(scopedAdapterFieldsSchema.safeParse({ alpha_id: "own", [field]: "hidden" }).success).toBe(false);
  });
  it("preserves exact decimal/null/zero without coercion or sentinel conversion", () => {
    const value = { equity: "9007199254740993.0000000001", quantity: "0", net_pnl: null, timestamp_ms: 1800000000000 };
    expect(scopedAdapterFieldsSchema.parse(value)).toEqual(value);
    for (const invalid of [1, "1\n", "1e4", "1".repeat(129)]) expect(scopedAdapterFieldsSchema.safeParse({ equity: invalid }).success).toBe(false);
    expect(scopedAdapterFieldsSchema.safeParse({ timestamp_ms: "2026-01-01T00:00:00Z" }).success).toBe(false);
  });
  it("keeps public group selectors finite and forbids the global projection metadata envelope", () => {
    const value = { schema_version: "portal.execution.profile-read-adapter.v2", capability_id: "admin.inspect", authority: "PORTAL_SGP_PROJECTION",
      workspace_id: "workspace", environment: "paper", profile_id: "paper", visibility: "SCOPED", coverage: "AUTHORIZED_ONLY",
      policy_revision: "revision", bounds: { maximum_rows_per_relation: 200, maximum_response_bytes: 1048576 }, relations: {} };
    expect(scopedAdapterResponseSchema.safeParse(value).success).toBe(true);
    expect(scopedAdapterResponseSchema.safeParse({ ...value, projection: { payload_digest: "global" } }).success).toBe(false);
    expect(scopedAdapterResponseSchema.safeParse({ ...value, relations: { "manager.anything:secret": {} } }).success).toBe(false);
  });
  it("mounted authorized entry cannot drop its trusted identity and enter legacy raw reads", async () => {
    const repository = { snapshot: vi.fn() } as unknown as ExecutionProfileProjectionRepository;
    const adapter = new ExecutionProfileReadAdapterService(testConfig(), repository);
    await expect(adapter.readAuthorized({} as ReadScopePrincipal, "paper", "admin.inspect"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(repository.snapshot).not.toHaveBeenCalled();
  });

  // TEST_ONLY wrapper/dispatch checks. Real current-source membership and
  // command audit are covered by execution-operations.spec.ts on PostgreSQL.
  function taskWrapper() {
    const principal = { user: { userId: "actor", role: "ADMIN", sessionVersion: 1 },
      session: { sessionId: "lease", userId: "actor", sessionVersion: 1 }, workspaceId: "core-workspace" } as ReadScopePrincipal;
    const mode = vi.fn(async () => "LEGACY_COMPATIBILITY");
    const adapter = new ExecutionProfileReadAdapterService({ ...testConfig(), EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "source-workspace", EXECUTION_EDGE_PAPER_PROFILE_ID: "TEST_ONLY-paper" },
      {} as ExecutionProfileProjectionRepository, { coreSelectionMode: mode } as never);
    const sourceRead = vi.spyOn(adapter, "readAuthorized").mockImplementation(async (_principal, _env, _capability, _filters, complete) =>
      complete!({ data: "authorized-source" }));
    return { principal, mode, adapter, sourceRead };
  }

  it("routes R0 to configured source while preserving a snapshot of the trusted Core actor", async () => {
    const f = taskWrapper();
    const result = await f.adapter.readTaskAuthorized(f.principal, "paper", "admin.inspect", { alpha_id: "alpha" }, async value => {
      f.principal.workspaceId = "caller-mutated"; f.principal.user.role = "USER";
      return { result: value };
    });
    expect(result).toEqual({ result: { data: "authorized-source" } });
    expect(f.sourceRead.mock.calls[0][0]).toMatchObject({ workspaceId: "source-workspace", viewerWorkspaceId: "core-workspace",
      user: { userId: "actor", role: "ADMIN" }, session: { sessionId: "lease" } });
    for (const [core] of f.mode.mock.calls as unknown as [ReadScopePrincipal][])
      expect(core).toMatchObject({ workspaceId: "core-workspace", user: { role: "ADMIN" } });
  });

  it("does not fall back when source access is absent", async () => {
    const f = taskWrapper();
    f.sourceRead.mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404));
    const legacy = vi.spyOn(f.adapter, "read"), audit = vi.fn(async value => value);
    await expect(f.adapter.readTaskAuthorized(f.principal, "paper", "admin.inspect", {}, audit))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(legacy).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled();
  });

  it("refuses Core membership/session revoke during completion/audit", async () => {
    const f = taskWrapper();
    await expect(f.adapter.readTaskAuthorized(f.principal, "paper", "admin.inspect", {}, async value => {
      f.mode.mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404));
      return value;
    })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
  });

  it("does not record successful completion when Core access disappears during the source read", async () => {
    const f = taskWrapper(), audit = vi.fn(async value => value);
    f.sourceRead.mockImplementation(async (_principal, _env, _capability, _filters, complete) => {
      f.mode.mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404));
      return complete!({ data: "authorized-source" });
    });
    await expect(f.adapter.readTaskAuthorized(f.principal, "paper", "admin.inspect", {}, audit))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    expect(audit).not.toHaveBeenCalled();
  });

  it("refuses Core policy cutover during completion/audit", async () => {
    const f = taskWrapper();
    await expect(f.adapter.readTaskAuthorized(f.principal, "paper", "admin.inspect", {}, async value => {
      f.mode.mockResolvedValue("SCOPED_V2"); return value;
    })).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("retains the original viewer workspace in the legacy adapter DTO", async () => {
    const f = taskWrapper();
    const source = { ...f.principal, workspaceId: "source-workspace", viewerWorkspaceId: "core-workspace" };
    const adapter = new ExecutionProfileReadAdapterService({ ...testConfig(), EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "source-workspace", EXECUTION_EDGE_PAPER_PROFILE_ID: "TEST_ONLY-paper" },
      { snapshotMetadata: async () => null } as never, { authorize: async () => ({ mode: "LEGACY_COMPATIBILITY", viewerWorkspaceId: "core-workspace" }),
        deliver: async (_scope: unknown, action: () => Promise<unknown>) => action() } as never);
    const read = vi.spyOn(adapter, "read").mockImplementation(async workspace => ({ viewer_workspace_id: workspace }) as never);
    expect(await adapter.readAuthorized(source, "paper", "admin.inspect")).toEqual({ viewer_workspace_id: "core-workspace" });
    expect(read).toHaveBeenCalledWith("core-workspace", "paper", "admin.inspect", {});
  });
});
