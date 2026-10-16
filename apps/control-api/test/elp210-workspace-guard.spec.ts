/** Composition-only synthetic tests. Real Core/source-state correctness is
 * exercised separately in elp210-workspace-authority.spec.ts. */
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthError, type AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import type { CurrentHumanWorkspaceProvisioner } from "../src/execution-v2/current-human-workspace";
import { SessionGuard } from "../src/facade/session.guard";
import type { WorkspacesRepository } from "../src/repos/workspaces";

function fixture() {
  const user = { userId: "TEST_ONLY-guard-human", username: "TEST_ONLY-guard-name", status: "ACTIVE",
    mustChangePassword: false };
  const session = { userId: user.userId, sessionId: "TEST_ONLY-guard-session", sessionVersion: 7, state: "ACTIVE" };
  const sessionFromToken = vi.fn().mockResolvedValue(session), findById = vi.fn().mockResolvedValue(user);
  const ensurePersonal = vi.fn().mockResolvedValue("TEST_ONLY-legacy-workspace");
  const ensure = vi.fn().mockResolvedValue("TEST_ONLY-fenced-workspace"), header = vi.fn();
  const request: Record<string, unknown> = { url: "/api/v1/execution/resources/alphas/a?user_id=foreign&session_generation=99",
    method: "GET", cookies: { [SESSION_COOKIE]: "TEST_ONLY-cookie" }, query: { user_id: "foreign", session_generation: 99 } };
  const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header }) }) } as ExecutionContext;
  const guard = (candidate = true) => new SessionGuard({ sessionFromToken, users: { findById } } as unknown as AuthService,
    { ensurePersonal } as unknown as WorkspacesRepository, undefined,
    candidate ? { ensure } as unknown as CurrentHumanWorkspaceProvisioner : undefined);
  return { user, session, sessionFromToken, findById, ensurePersonal, ensure, header, request, context, guard };
}

describe("ELP2-10 SessionGuard optional workspace composition", () => {
  it("passes only authenticated server actor/session/generation and attaches its returned workspace", async () => {
    const f = fixture();
    await expect(f.guard().canActivate(f.context)).resolves.toBe(true);
    expect(f.ensure).toHaveBeenCalledExactlyOnceWith({ user_id: f.user.userId,
      session_id: f.session.sessionId, session_generation: f.session.sessionVersion });
    expect(f.ensurePersonal).not.toHaveBeenCalled();
    expect(f.request).toMatchObject({ portalUser: f.user, portalSession: f.session,
      portalWorkspaceId: "TEST_ONLY-fenced-workspace", portalViewerWorkspaceId: "TEST_ONLY-fenced-workspace" });
    expect(f.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it.each([401, 409, 503])("preserves typed %s refusal with no legacy fallback or attached authority", async status => {
    const f = fixture(), error = new AuthError(status === 401 ? "SESSION_REQUIRED" : status === 409
      ? "WORKSPACE_PROVISIONING_CONFLICT" : "PORTAL_AUTHORITY_UNAVAILABLE", "TEST_ONLY public refusal", status);
    f.ensure.mockRejectedValueOnce(error);
    await expect(f.guard().canActivate(f.context)).rejects.toBe(error);
    expect(f.ensurePersonal).not.toHaveBeenCalled();
    expect(f.request).not.toHaveProperty("portalUser");
    expect(f.request).not.toHaveProperty("portalWorkspaceId");
    expect(f.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("rejects an invalid session before provisioning, never fabricating a current actor", async () => {
    const f = fixture(); f.sessionFromToken.mockResolvedValueOnce(null);
    await expect(f.guard().canActivate(f.context)).rejects.toMatchObject({ status: 401 });
    expect(f.findById).not.toHaveBeenCalled(); expect(f.ensure).not.toHaveBeenCalled();
    expect(f.ensurePersonal).not.toHaveBeenCalled(); expect(f.request).not.toHaveProperty("portalSession");
  });

  it("leaves default unmounted runtime composition on its existing repository path", async () => {
    const f = fixture();
    await expect(f.guard(false).canActivate(f.context)).resolves.toBe(true);
    expect(f.ensure).not.toHaveBeenCalled();
    expect(f.ensurePersonal).toHaveBeenCalledExactlyOnceWith(f.user.userId, f.user.username);
    expect(f.request).toMatchObject({ portalWorkspaceId: "TEST_ONLY-legacy-workspace" });
  });
});
