// @vitest-environment node
/**
 * The Paper exit request (RV-10) through the product's own reading path, served by the fixture BFF double (lane FIXTURE_LAB /
 * BFF_DOUBLE; a fixture is never a source acceptance, and nothing here enables the dark `command` flag or any Live/command route).
 *
 * The REAL http client and the REAL readers over a fixture server booted in this process: the capabilities row that opens the
 * control, the canonical positive parent that binds it, the request built from the served pins (`expected_r2_version`, the projection
 * digest), the typed success and denial answers, and the read-back of the review the success names. A body the screens would not read
 * comes back as a refusal here.
 */
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PAPER_EXIT_OFF_WORKSPACE, PAPER_EXIT_OPEN_WORKSPACE } from "../../e2e/bffDoubleGovernance";
import { createHttpApi } from "../execution/api/httpApi";
import type { ExecutionApi, Result } from "../execution/api/ports";
import type { DeliveryPolicy } from "../execution/profile";
import { bindExitParent, checkCapture, exitStatusOf, type ExitReviewBinding } from "../execution/v2/screens/workbench/exitReviewRequest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";

const OPEN: DeliveryPolicy = {
  policyRevision: 4,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: true,
  governanceWriteEnabled: true,
  paperCommandsEnabled: true,
  sandboxCommandsEnabled: true,
  liveProtectiveCommandsEnabled: true,
  liveRiskIncreasingCommandsEnabled: true,
};

let server: import("node:http").Server;
let api: ExecutionApi;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "small" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) =>
    realFetch(typeof input === "string" && input.startsWith("/") ? `${origin}${input}` : input, init));
  api = createHttpApi({ policy: OPEN, readScope: {} });
}, 30_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
});

async function value<T>(call: Promise<Result<T>>): Promise<T> {
  const result = await call;
  if (!result.ok) throw new Error(`refused: ${result.status}: ${result.reason}`);
  return result.value;
}
async function refusal<T>(call: Promise<Result<T>>): Promise<{ status: string; reason: string }> {
  const result = await call;
  if (result.ok) throw new Error("expected a refusal, got a value");
  return result;
}

const DEPLOYMENT = "dep_paper_01";
const WS = PAPER_EXIT_OPEN_WORKSPACE;

/** The binding the Exit control builds, from what the double serves and nothing else. */
async function served(deploymentId = DEPLOYMENT, workspaceId = WS): Promise<ExitReviewBinding> {
  const read = await value(api.getPaperExitParent({ deploymentId, workspaceId }));
  const bind = bindExitParent({ parent: { state: "read", read }, workspaceId, deploymentId });
  if (bind.state !== "bound") throw new Error(`not bound: ${bind.code}`);
  return bind.binding;
}
const request = (binding: ExitReviewBinding, summary: string, key = "paper_exit:fixture-1") => ({
  workspace_id: binding.workspaceId,
  request_key: key,
  summary,
  r2_approval_id: binding.parentApprovalId,
  expected_r2_version: binding.expectedParentVersion,
  deployment_id: binding.deploymentId,
  expected_projection_digest: binding.projectionDigest,
});

describe("the Exit control opens from what the double serves", () => {
  it("the capabilities row is AVAILABLE in the shared workspace and UNAVAILABLE where the server does not open it", async () => {
    const open = await value(api.getReviewCaptureCapabilities(WS));
    expect(open.actions.find((a) => a.id === "PAPER_EXIT_CREATE")).toEqual({ id: "PAPER_EXIT_CREATE", state: "AVAILABLE", inputs: "PINNED_R2_AND_PAPER_DEPLOYMENT", path: "/api/v1/execution/governance/paper-exit/create" });
    for (const id of ["R2_EXECUTION_GRANT", "PAPER_EXIT_PROMOTE", "SANDBOX_CERTIFY_SOURCE"]) expect(open.actions.find((a) => a.id === id)?.state).toBe("UNAVAILABLE");
    const off = await value(api.getReviewCaptureCapabilities(PAPER_EXIT_OFF_WORKSPACE));
    expect(off.actions.find((a) => a.id === "PAPER_EXIT_CREATE")).toMatchObject({ state: "UNAVAILABLE", reason_code: "PAPER_EXIT_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE" });
    // The V1-era answer for any other workspace stays what it was: the request is shut there.
    const other = await value(api.getReviewCaptureCapabilities("workspace_execution_manager"));
    expect(other.actions.find((a) => a.id === "PAPER_EXIT_CREATE")?.state).toBe("UNAVAILABLE");
  });

  it("the positive parent binds the request to the served approval, version and digest, for the deployment and workspace asked", async () => {
    const binding = await served();
    expect(binding).toEqual({
      workspaceId: WS, parentApprovalId: "apr_TEST_ONLY_r2", expectedParentVersion: 3, projectionDigest: `sha256:${"c".repeat(64)}`, deploymentId: DEPLOYMENT,
    });
  });

  it("a deployment with no R2, or a blocked R2, leaves the control shut with the server's typed reason", async () => {
    const none = await value(api.getPaperExitParent({ deploymentId: "dep_exit_none", workspaceId: WS }));
    expect(bindExitParent({ parent: { state: "read", read: none }, workspaceId: WS, deploymentId: "dep_exit_none" })).toMatchObject({ state: "shut" });
    const blocked = await value(api.getPaperExitParent({ deploymentId: "dep_exit_not_approved", workspaceId: WS }));
    expect(bindExitParent({ parent: { state: "read", read: blocked }, workspaceId: WS, deploymentId: "dep_exit_not_approved" })).toMatchObject({ state: "shut", code: "R2_APPROVAL_REQUIRED" });
  });
});

describe("the request and its typed answers", () => {
  it("success: the pins built from the parent are accepted; the answer names the review, in this workspace, and reads back for this deployment", async () => {
    const binding = await served();
    const capture = await value(api.createPaperExit(request(binding, "Ready after the observation window.")));
    expect(capture).toMatchObject({ action: "PAPER_EXIT_CREATE", workspace_id: WS, replayed: false, source_verdict: "NOT_ASSERTED", source_side_effect_requested: false, captured_projection_digest: binding.projectionDigest });
    const checked = checkCapture(capture, binding);
    expect(checked).toMatchObject({ ok: true });
    if (!checked.ok) return;
    expect(checked.reviewId).toMatch(/^pexit_fx_dep_paper_01_[0-9a-f]{8}$/);
    const read = await value(api.getGovernanceParent("exit", checked.reviewId, WS));
    expect(exitStatusOf(read, { reviewId: checked.reviewId, workspaceId: WS, deploymentId: DEPLOYMENT })).toMatchObject({ kind: "ok", reviewId: checked.reviewId });
  });

  it("the same key names the same review; REPLAY says it matched an earlier request", async () => {
    const binding = await served();
    const first = await value(api.createPaperExit(request(binding, "Ready after the observation window.", "paper_exit:fixture-2")));
    const again = await value(api.createPaperExit(request(binding, "REPLAY of the first request.", "paper_exit:fixture-2")));
    expect(again.review_id).toBe(first.review_id);
    expect(again.replayed).toBe(true);
  });

  it("denials are typed: DENIED 403, REFUSE and STALE 409, a pin that is not the parent's 404/409, another workspace 403", async () => {
    const binding = await served();
    const denied = await refusal(api.createPaperExit(request(binding, "DENIED for this admin.")));
    expect(denied.status).toBe("denied");
    expect(denied.reason).toContain("ADMIN_ROLE_REQUIRED");
    expect((await refusal(api.createPaperExit(request(binding, "REFUSE this request please.")))).reason).toContain("APPROVAL_VERSION_CONFLICT");
    expect((await refusal(api.createPaperExit(request(binding, "STALE projection please.")))).reason).toContain("CAPTURE_PROJECTION_VERSION_CONFLICT");
    expect((await refusal(api.createPaperExit({ ...request(binding, "Ready after the window."), expected_r2_version: 4 }))).reason).toContain("APPROVAL_VERSION_CONFLICT");
    expect((await refusal(api.createPaperExit({ ...request(binding, "Ready after the window."), expected_projection_digest: `sha256:${"d".repeat(64)}` }))).reason).toContain("CAPTURE_PROJECTION_VERSION_CONFLICT");
    expect((await refusal(api.createPaperExit({ ...request(binding, "Ready after the window."), r2_approval_id: "apr_OTHER" }))).reason).toContain("APPROVAL_NOT_FOUND");
    expect((await refusal(api.createPaperExit({ ...request(binding, "Ready after the window."), workspace_id: PAPER_EXIT_OFF_WORKSPACE }))).reason).toContain("PAPER_EXIT_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE");
  });

  it("a deployment whose R2 is blocked cannot be requested even with the pins of another", async () => {
    const binding = await served();
    const result = await refusal(api.createPaperExit({ ...request(binding, "Ready after the window."), deployment_id: "dep_exit_not_approved" }));
    expect(result.reason).toContain("R2_APPROVAL_REQUIRED");
  });
});
