/**
 * `getPaperExitParent` through the real HTTP client against the governance e2e double (BFF_DOUBLE lane): the request that goes out, the
 * typed answers, and the refusal of a well-formed body that answers another question. The bodies are the published canonical fixtures.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerGovernance, STAGE_ACTION_DOUBLE_WORKSPACES } from "../../../../e2e/bffDoubleGovernance";
import { createHttpApi } from "../../api/httpApi";
import type { DeliveryPolicy } from "../../profile";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
afterEach(() => vi.unstubAllGlobals());

function serve(override?: (path: string, search: URLSearchParams) => { status: number; body: unknown } | null) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const parsed = new URL(url, "http://portal.test");
    const path = parsed.pathname.replace(/^\/api\/v1\/execution/, "");
    const answer = override?.(path, parsed.searchParams) ?? answerGovernance("GET", path, parsed.searchParams) ?? { status: 501, body: { error: { code: "bff_double_gap", message: path } } };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  return { calls, api: createHttpApi({ policy: OPEN, readScope: {} }) };
}

describe("getPaperExitParent", () => {
  it("asks for the deployment in the workspace and reads the published context for exactly that pair", async () => {
    const { api, calls } = serve();
    const result = await api.getPaperExitParent({ deploymentId: "dep_a", workspaceId: "ws_a" });
    expect(calls).toEqual(["/api/v1/execution/governance/paper-exit/parent?deployment_id=dep_a&workspace_id=ws_a"]);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== "paper_exit_parent") throw new Error("expected a parent");
    expect(result.value.parent).toMatchObject({ workspaceId: "ws_a", deploymentId: "dep_a", state: "FOUND" });
    expect(result.value.parent.context).toMatchObject({ kind: "ok", value: { action: "PAPER_EXIT_CREATE", workspaceId: "ws_a", candidates: [{ deploymentId: "dep_a" }] } });
  });

  it("a deployment with no R2 is a published NONE, not a failure; a blocked context keeps its typed reason", async () => {
    const { api } = serve();
    const none = await api.getPaperExitParent({ deploymentId: "dep_exit_none", workspaceId: "ws_a" });
    expect(none.ok && none.value.kind === "paper_exit_parent" && none.value.parent.state).toBe("NONE");
    const blocked = await api.getPaperExitParent({ deploymentId: "dep_exit_expired", workspaceId: "ws_a" });
    expect(blocked.ok && blocked.value.kind === "paper_exit_parent" && blocked.value.parent.context).toMatchObject({ kind: "ok", value: { availability: { available: false, reasonCode: "APPROVAL_EXPIRED" } } });
  });

  it("a refusal is a typed status, never a context", async () => {
    const { api } = serve();
    const denied = await api.getPaperExitParent({ deploymentId: "dep_a", workspaceId: STAGE_ACTION_DOUBLE_WORKSPACES.denied });
    expect(denied).toMatchObject({ ok: false, status: "denied" });
    const down = await api.getPaperExitParent({ deploymentId: "dep_a", workspaceId: STAGE_ACTION_DOUBLE_WORKSPACES.unavailable });
    expect(down.ok).toBe(false);
  });

  it("a query the Portal would refuse sends nothing", async () => {
    const { api, calls } = serve();
    for (const bad of [{ deploymentId: "" }, { deploymentId: "a b" }, { deploymentId: "dep_a", workspaceId: "ab" }]) {
      expect(await api.getPaperExitParent(bad)).toMatchObject({ ok: false, status: "unavailable" });
    }
    expect(calls).toEqual([]);
  });

  it("a well-formed body for another deployment or workspace is not an answer", async () => {
    const wrongDeployment = serve((path) => (path === "/governance/paper-exit/parent" ? { status: 200, body: answerGovernance("GET", path, new URLSearchParams("deployment_id=dep_other&workspace_id=ws_a"))!.body } : null));
    expect(await wrongDeployment.api.getPaperExitParent({ deploymentId: "dep_a", workspaceId: "ws_a" })).toMatchObject({ ok: false, status: "unavailable", reason: expect.stringContaining("another deployment or workspace") });
    const wrongWorkspace = serve((path) => (path === "/governance/paper-exit/parent" ? { status: 200, body: answerGovernance("GET", path, new URLSearchParams("deployment_id=dep_a&workspace_id=ws_other"))!.body } : null));
    expect(await wrongWorkspace.api.getPaperExitParent({ deploymentId: "dep_a", workspaceId: "ws_a" })).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("a body the reader refuses is unavailable (a context for another deployment is never bound)", async () => {
    const poisoned = serve((path, search) => {
      if (path !== "/governance/paper-exit/parent") return null;
      const body = structuredClone(answerGovernance("GET", path, search)!.body) as { capture_context: { candidates: { deployment_id: string }[] } };
      body.capture_context.candidates[0]!.deployment_id = "dep_somewhere_else";
      return { status: 200, body };
    });
    expect(await poisoned.api.getPaperExitParent({ deploymentId: "dep_a", workspaceId: "ws_a" })).toMatchObject({ ok: false, status: "unavailable" });
  });
});
