import { describe, expect, it, vi } from "vitest";
import { SessionGuard } from "../src/facade/session.guard";
import { ResourceReadController } from "../src/resource-read/resource-read.controller";
import { MaximumDataOperationController } from "../src/execution/maximum-data-operation.controller";
import { PaperReadController } from "../src/paper-read/paper-read.controller";
import { ProfileReadController } from "../src/profile-read/profile-read.controller";
import { OperationalCompositionController } from "../src/execution/operational-composition.controller";

// Controller-only regression: server-attached viewer context must not be
// replaced by the retained source workspace (or by browser query parameters).
function fixture() {
  const request = { portalUser: { userId: "TEST_ONLY-viewer" }, portalSession: {},
    portalWorkspaceId: "source", portalViewerWorkspaceId: "viewer", headers: {},
    url: "/api/v1/execution/compositions/command-center" } as any;
  const workspaces = { canReadExecution: vi.fn().mockResolvedValue(true), isMember: vi.fn().mockResolvedValue(true) } as any;
  const config = { EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "source" } as any;
  const read = vi.fn().mockResolvedValue({ schema_version: "TEST_ONLY.v1" });
  return { request, workspaces, config, read };
}
const principal = { workspaceId: "source", viewerWorkspaceId: "viewer" };

describe("ELP2-04 trusted controller context and HTTP cache isolation", () => {
  it.each([true, false])("Execution success/auth refusal stays no-store (authenticated=%s)", async authenticated => {
    const session = { userId: "TEST_ONLY-viewer", state: "ACTIVE" };
    const guard = new SessionGuard({ sessionFromToken: async () => session,
      users: { findById: async () => ({ userId: session.userId, status: "ACTIVE", username: "viewer" }) } } as any,
      { ensurePersonal: async () => "viewer" } as any);
    const request = { url: "/api/v1/execution/resources/alphas/a", method: "GET",
      cookies: authenticated ? { "__Host-portal_session": "test" } : {} };
    const header = vi.fn();
    const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header }) }) } as any;
    if (authenticated) await expect(guard.canActivate(context)).resolves.toBe(true);
    else await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    expect(header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it("resource readers preserve the trusted viewer workspace", async () => {
    const f = fixture();
    await new ResourceReadController({ read: f.read } as any, f.workspaces, f.config).alpha(f.request, "alpha", {});
    expect(f.read.mock.calls[0][0]).toMatchObject(principal);
  });
  it.each(["deployments", "named"])("%s reader preserves the trusted viewer workspace", async route => {
    const f = fixture();
    const controller = new MaximumDataOperationController({ deploymentPage: f.read, relationPage: f.read } as any, f.workspaces);
    if (route === "deployments") await controller.deployments(f.request, {});
    else await controller.currentRelation(f.request, "orders", {});
    expect(f.read.mock.calls[0][0]).toMatchObject(principal);
  });
  it("Paper's shared principal preserves the trusted viewer workspace", async () => {
    const f = fixture();
    await new PaperReadController({ overview: f.read } as any, f.workspaces).overview(f.request, {});
    expect(f.read.mock.calls[0][0]).toMatchObject(principal);
  });
  it.each(["overview", "account"])("Profile %s preserves the trusted viewer workspace", async route => {
    const f = fixture();
    const controller = new ProfileReadController({ overview: f.read, accountBroker: f.read } as any, f.workspaces);
    if (route === "overview") await controller.sandbox(f.request, {});
    else await controller.account(f.request, "account", { environment: "paper" });
    expect(f.read.mock.calls[0][0]).toMatchObject(principal);
  });
  it("composition preserves the trusted viewer workspace", async () => {
    const f = fixture();
    await new OperationalCompositionController({ commandCenterSnapshot: f.read } as any, f.workspaces, f.config)
      .commandCenter(f.request, { workspace_id: "source" });
    expect(f.read.mock.calls[0][0]).toMatchObject(principal);
  });
  it("a browser cannot set viewerWorkspaceId through a query", async () => {
    const f = fixture();
    await expect(new MaximumDataOperationController({ relationPage: f.read } as any, f.workspaces)
      .currentRelation(f.request, "orders", { viewerWorkspaceId: "victim" }))
      .rejects.toMatchObject({ code: "EDS11R_OPERATION_QUERY_INVALID" });
    expect(f.read).not.toHaveBeenCalled();
  });
});
