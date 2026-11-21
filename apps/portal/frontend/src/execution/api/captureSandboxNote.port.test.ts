/**
 * `captureSandboxNote` over HTTP: which failures say "not recorded" and which say "unknown".
 *
 * A definite 4xx is a refusal: the server read the request and said no. A fetch that threw after the
 * send, a 408 or 5xx, a 2xx that is not JSON, and a 2xx that fails the contract check leave the
 * outcome unknown: the note may exist, and the reason carries `REVIEW_CAPTURE_OUTCOME_UNKNOWN`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

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

const INPUT = {
  workspace_id: "ws_TEST_ONLY_a",
  request_key: "sandbox_note:k1",
  summary: "Checked the account.",
  certification_id: "cert_TEST_ONLY_a",
  expected_workflow_version: 3,
};

const GOOD = {
  schema_version: "governance.review-capture.v1",
  authority: "PORTAL",
  workspace_id: INPUT.workspace_id,
  action: "SANDBOX_NOTE",
  replayed: false,
  source_side_effect_requested: false,
  aggregate_id: INPUT.certification_id,
  workflow_version: 4,
  source_verdict: "NOT_ASSERTED",
  certification_id: INPUT.certification_id,
  deployment_id: "dep_TEST_ONLY_a",
  read_path: "/api/v1/execution/deployments/dep_TEST_ONLY_a/certification",
  decision_reason_code: "ACCEPTED_SANDBOX_STEP_EVIDENCE_UNAVAILABLE",
};

const respond = (body: string, status: number) =>
  vi.stubGlobal("fetch", async () => new Response(body, { status, headers: { "content-type": "application/json" } }));
const call = () => createHttpApi({ policy: OPEN }).captureSandboxNote(INPUT as never);

describe("captureSandboxNote: not recorded vs unknown", () => {
  it("a 2xx the contract accepts is recorded", async () => {
    respond(JSON.stringify(GOOD), 200);
    const result = await call();
    expect(result.ok).toBe(true);
  });

  it("a fetch that throws after the send is unknown, not a thrown error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network");
    });
    const result = await call();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it("an abort after the send is unknown", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it("a 2xx whose body is not JSON is unknown", async () => {
    respond("<html>proxy</html>", 200);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it("a 2xx that fails the contract check (wrong workspace) is unknown and keeps the contract reason", async () => {
    respond(JSON.stringify({ ...GOOD, workspace_id: "ws_TEST_ONLY_other" }), 200);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
    if (!result.ok) expect(result.reason).toContain("REVIEW_CAPTURE_CONTRACT_INVALID");
  });

  it.each([500, 502, 503, 504, 408])("a %i is unknown", async (status) => {
    respond(JSON.stringify({ code: "UPSTREAM", message: "upstream" }), status);
    const result = await call();
    expect(!result.ok && isOutcomeUnknownReason(result.reason)).toBe(true);
  });

  it.each([400, 403, 404, 409, 422, 429])("a definite %i is a refusal and is NOT marked unknown", async (status) => {
    respond(JSON.stringify({ code: "REFUSED", message: "no" }), status);
    const result = await call();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isOutcomeUnknownReason(result.reason)).toBe(false);
  });
});
