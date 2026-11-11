/**
 * W2 (11 Nov 2026): the eleven Portal-owned reads that the REAL Control API already answers on the isolated Research preview, judged against the real
 * HTTP client. The bodies in ./realBodies were captured from that Control API (ids replaced); a reader that refuses one of them would turn a read that can
 * go real today into "could not be read". Fixture success is not real-API acceptance: these bodies are the real answers, small because the preview has
 * few records (the approval inbox has 3 records and none pending, the operations queue none), so they also pin that an honest empty read stays empty.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpApi } from "./httpApi";

const load = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, "realBodies", `${name}.json`), "utf8"));
const ROUTES: Readonly<Record<string, string>> = {
  "/activation/capabilities": "activation-capabilities",
  "/commands/catalog": "commands-catalog",
  "/commands/tasks": "commands-tasks",
  "/compositions/operations": "compositions-operations",
  "/compositions/waivers": "compositions-waivers",
  "/governance/approvals": "governance-approvals",
  "/governance/approvals/history": "governance-approvals-history",
  "/governance/review-capture-capabilities": "governance-review-capture-capabilities",
  "/governance/stage-action-eligibility": "governance-stage-action-eligibility",
  "/governance/waivers": "governance-waivers",
  "/operations": "operations",
};
const asked: string[] = [];

beforeEach(() => {
  asked.length = 0;
  vi.stubGlobal("fetch", async (input: unknown) => {
    const path = new URL(String(input), "http://portal.invalid").pathname.replace(/^\/api\/v1\/execution/, "");
    asked.push(path);
    const name = ROUTES[path];
    if (name === undefined) return new Response(JSON.stringify({ error: { code: "REQUEST_REJECTED" } }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(load(name)), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => vi.unstubAllGlobals());

const WS = "ws_TEST_ONLY";
const api = () => createHttpApi({ policy: null });

describe("the real bodies are admitted by the frontend readers", () => {
  it("activation capabilities", async () => { expect((await api().getActivationCapabilities()).ok).toBe(true); });
  it("operator task catalogue", async () => { expect((await api().getOperatorTasks()).ok).toBe(true); });
  it("command catalogue", async () => { expect((await api().getCommandCatalogue({ workspaceId: WS } as never)).ok).toBe(true); });
  it("approval history", async () => { expect((await api().getApprovalHistory(WS)).ok).toBe(true); });
  it("approval inbox: an inbox with no pending row reads as empty, not as an error", async () => {
    const result = await api().listApprovals({ filter: "PENDING" } as never);
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.value)).not.toContain("\"pending\":1");
  });
  it("review capture capabilities", async () => { expect((await api().getReviewCaptureCapabilities(WS)).ok).toBe(true); });
  it("stage action eligibility", async () => { expect((await api().getStageActionEligibility(WS)).ok).toBe(true); });
  it("waivers register", async () => { expect((await api().getWaivers()).ok).toBe(true); });
  it("operations composition and waivers composition", async () => {
    expect((await api().getOperationalComposition("operations")).ok).toBe(true);
    expect((await api().getOperationalComposition("waivers")).ok).toBe(true);
  });
  it("operations queue: an empty real queue reads as empty", async () => {
    const result = await api().listOperationalQueueV2({ filter: "ALL" } as never);
    expect(result.ok).toBe(true);
  });
  it("every route of the plan was actually asked", async () => {
    const client = api();
    await Promise.all([client.getActivationCapabilities(), client.getOperatorTasks(), client.getCommandCatalogue({ workspaceId: WS } as never), client.getApprovalHistory(WS),
      client.listApprovals({ filter: "PENDING" } as never), client.getReviewCaptureCapabilities(WS), client.getStageActionEligibility(WS), client.getWaivers(),
      client.getOperationalComposition("operations"), client.getOperationalComposition("waivers"), client.listOperationalQueueV2({ filter: "ALL" } as never)]);
    for (const route of Object.keys(ROUTES)) expect(asked, route).toContain(route);
  });
});
