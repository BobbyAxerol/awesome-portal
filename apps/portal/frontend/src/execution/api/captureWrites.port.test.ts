/**
 * `createPaperExit` and `captureR2` over HTTP: which failures say "not recorded" and which say "unknown" (DEBT-UXM07-033).
 *
 * Same classes as `captureSandboxNote` (see `captureSandboxNote.port.test.ts`): a definite 4xx is the server's typed refusal; a fetch
 * that threw after the send, a 408 or 5xx, a 2xx that is not JSON and a 2xx that is not this request's answer leave the outcome
 * unknown, and the reason carries `REVIEW_CAPTURE_OUTCOME_UNKNOWN`. The 4xx bodies below are the ones the fixture BFF serves for the
 * Paper exit create (`e2e/bffDoubleGovernance.ts`: DENIED, REFUSE, STALE).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import EXIT from "../../../../../../packages/contracts/fixtures/execution-governance.review-capture.paper-exit.valid.json";
import R2 from "../../../../../../packages/contracts/fixtures/execution-governance.review-capture.r2.valid.json";
import type { DeliveryPolicy } from "../profile";
import { createHttpApi } from "./httpApi";
import { isOutcomeUnknownReason } from "./reviewCapture";

afterEach(() => vi.unstubAllGlobals());

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

const EXIT_INPUT = {
  workspace_id: EXIT.workspace_id,
  request_key: "paper_exit:k1",
  summary: "Thirty observation days, fills reconcile",
  r2_approval_id: "apr_example",
  expected_r2_version: 2,
  deployment_id: "dep_TEST_ONLY_a",
  expected_projection_digest: `sha256:${"a".repeat(64)}`,
};
const R2_INPUT = {
  workspace_id: R2.workspace_id,
  request_key: "r2:k1",
  summary: "Operator review without a source verdict.",
  r1_approval_id: "r1",
  expected_r1_version: 1,
  portfolio_id: "pf",
  currency: "USDT",
  deployment_id: "dep",
  risk_grant_id: "risk",
  expected_projection_digest: `sha256:${"a".repeat(64)}`,
};

const respond = (body: string, status: number) =>
  vi.stubGlobal("fetch", async () => new Response(body, { status, headers: { "content-type": "application/json" } }));
const problemBody = (code: string, message: string) => JSON.stringify({ error: { code, message } });

const CASES = [
  { name: "createPaperExit", good: EXIT, call: () => createHttpApi({ policy: OPEN }).createPaperExit(EXIT_INPUT as never) },
  { name: "captureR2", good: R2, call: () => createHttpApi({ policy: OPEN }).captureR2(R2_INPUT as never) },
] as const;

describe.each(CASES)("$name: not recorded vs unknown", ({ good, call }) => {
  it("a 2xx the contract accepts is recorded", async () => {
    respond(JSON.stringify(good), 201);
    expect((await call()).ok).toBe(true);
  });

  it("a fetch that throws after the send is unknown, not a thrown error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network");
    });
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it.each([500, 502, 503, 504, 408])("a %i is unknown and keeps the server's words", async (status) => {
    respond(problemBody("UPSTREAM", "upstream"), status);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
    if (!result.ok) expect(result.reason).toContain("UPSTREAM: upstream");
  });

  it("a 5xx whose body is not JSON is still unknown", async () => {
    respond("<html>bad gateway</html>", 502);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it("a 2xx whose body is not JSON is unknown", async () => {
    respond("<html>proxy</html>", 200);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it("a 2xx the reader refuses is unknown and keeps the contract reason", async () => {
    respond(JSON.stringify({ ...good, source_verdict: "PASS" }), 200);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
    if (!result.ok) expect(result.reason).toContain("REVIEW_CAPTURE_CONTRACT_INVALID");
  });

  it("a 2xx for another workspace is unknown", async () => {
    respond(JSON.stringify({ ...good, workspace_id: "ws_TEST_ONLY_other" }), 200);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it("a 2xx for another kind of review is unknown", async () => {
    respond(JSON.stringify(good.action === "R2_CREATE" ? EXIT : R2), 200);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it.each([400, 403, 404, 422, 429])("a definite %i is a refusal and is NOT marked unknown", async (status) => {
    respond(problemBody("REFUSED", "no"), status);
    const result = await call();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(isOutcomeUnknownReason(result.reason)).toBe(false);
      expect(result.reason).toBe("REFUSED: no");
    }
  });
});

describe("createPaperExit: the fixture BFF's typed refusals", () => {
  const call = () => createHttpApi({ policy: OPEN }).createPaperExit(EXIT_INPUT as never);

  it.each([
    ["APPROVAL_VERSION_CONFLICT", "The R2 approval moved to another version; read it again before requesting an exit review."],
    ["CAPTURE_PROJECTION_VERSION_CONFLICT", "The Paper projection moved since the request was prepared; read it again."],
  ])("a 409 %s is the typed refusal, not unknown", async (code, message) => {
    respond(problemBody(code, message), 409);
    const result = await call();
    expect(result).toEqual({ ok: false, status: "unavailable", reason: `${code}: ${message}` });
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(false);
  });

  it("a 403 ADMIN_ROLE_REQUIRED is denied, not unknown", async () => {
    respond(problemBody("ADMIN_ROLE_REQUIRED", "Requesting a Paper exit review needs the admin role in this workspace."), 403);
    const result = await call();
    expect(result).toMatchObject({ ok: false, status: "denied" });
    expect(!result.ok && result.reason.startsWith("ADMIN_ROLE_REQUIRED: ")).toBe(true);
  });

  it("a replayed 201 is recorded and says so", async () => {
    respond(JSON.stringify({ ...EXIT, replayed: true }), 201);
    const result = await call();
    expect(result.ok && result.value.replayed).toBe(true);
  });
});
