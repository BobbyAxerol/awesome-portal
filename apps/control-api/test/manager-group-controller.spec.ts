/** Package 5: HTTP string parsing into the real Manager query schema.
 * No database, provider or product-runtime acceptance is claimed. */
import { describe, expect, it, vi } from "vitest";
import { ManagerModelController } from "../src/execution-v2/manager-model.controller";
import { managerModelQuery } from "../src/execution-v2/manager-model.contract";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";

function fixture(allowed = true) {
  const canReadExecution = vi.fn().mockResolvedValue(allowed);
  const read = vi.fn(async (_principal: unknown, _surface: unknown, raw: unknown) => {
    const parsed = managerModelQuery.safeParse(raw);
    if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    return parsed.data;
  });
  const controller = new ManagerModelController({ read,shouldUseNativeCurrent:()=>false } as any, { canReadExecution } as any);
  const request = { portalUser: { userId: "TEST_ONLY:viewer" }, portalSession: {},
    portalWorkspaceId: "TEST_ONLY:source", portalViewerWorkspaceId: "TEST_ONLY:viewer-workspace" } as any;
  return { controller, request, read, canReadExecution };
}

describe("Manager group HTTP query boundary", () => {
  it("parses group_limit independently of the row limit and preserves trusted workspace context", async () => {
    const f = fixture();
    const result = await f.controller.fund(f.request, { environment: "paper", group_by: "alpha_id", limit: "1", group_limit: "150" });
    expect(result).toMatchObject({ group_by: ["alpha_id"], limit: 1, group_limit: 150 });
    expect(f.canReadExecution).toHaveBeenCalledWith("TEST_ONLY:source", "TEST_ONLY:viewer");
    expect(f.read.mock.calls[0][0]).toMatchObject({ workspaceId: "TEST_ONLY:source", viewerWorkspaceId: "TEST_ONLY:viewer-workspace" });
    expect(f.canReadExecution.mock.invocationCallOrder[0]).toBeLessThan(f.read.mock.invocationCallOrder[0]);
  });

  it.each(["wat", "1.5", "-1", "1e2", "1000", "", " 20"])("invalid lexical group limit %j becomes NaN and fails the service schema", async group_limit => {
    const f = fixture();
    await expect(f.controller.fund(f.request, { environment: "paper", group_by: "alpha_id", group_limit }))
      .rejects.toMatchObject({ status: 400 });
    expect((f.read.mock.calls[0][2] as Record<string, unknown>).group_limit).toBeNaN();
  });

  it.each(["0", "201"])("schema rejects out-of-bounds group limit %s", async group_limit => {
    const f = fixture();
    await expect(f.controller.fund(f.request, { environment: "paper", group_by: "alpha_id", group_limit }))
      .rejects.toMatchObject({ status: 400 });
  });

  it.each(["group_after", "group_before"])("passes opaque %s intact alongside the independent row cursor", async direction => {
    const f = fixture(), cursor = "TEST_ONLY:opaque.key-signature_123";
    const result = await f.controller.fund(f.request, { environment: "paper", group_by: "alpha_id", after: "TEST_ONLY:row", [direction]: cursor });
    expect(result).toMatchObject({ [direction]: cursor, after: "TEST_ONLY:row" });
  });

  it("does not call the model reader before workspace permission succeeds", async () => {
    const f = fixture(false);
    await expect(f.controller.fund(f.request, { environment: "paper", workspace_id: "TEST_ONLY:other", group_by: "alpha_id", group_limit: "10" }))
      .rejects.toMatchObject({ status: 404 });
    expect(f.canReadExecution).toHaveBeenCalledWith("TEST_ONLY:other", "TEST_ONLY:viewer");
    expect(f.read).not.toHaveBeenCalled();
  });

  it("rejects competing group cursors through the shared schema", async () => {
    const f = fixture();
    await expect(f.controller.fund(f.request, { environment: "paper", group_by: "alpha_id", group_after: "a", group_before: "b" }))
      .rejects.toMatchObject({ status: 400 });
  });
});
