/**
 * New request V2: how the HTTP port's answers to `POST /governance/approvals` are classified, end to end through
 * `failureKind`. The question is only "may the request exist?": a dropped network, a timeout (408), any 5xx and a 2xx with
 * an unreadable body are UNCERTAIN (the key must be kept); a typed 4xx refusal is definite (the server did not create it).
 *
 * Lane: FIXTURE_LAB (unit). `fetch` is stubbed; nothing here proves the real server's answers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHttpApi } from "../../../api/httpApi";
import type { ApprovalCreateOutcome } from "../../../api/ports";
import type { DeliveryPolicy } from "../../../profile";
import { failureKind } from "./model";

const OPEN: DeliveryPolicy = {
  policyRevision: 9,
  queryEnabled: true,
  projectionIngestionEnabled: false,
  sseEnabled: false,
  governanceWriteEnabled: true,
  paperCommandsEnabled: false,
  sandboxCommandsEnabled: false,
  liveProtectiveCommandsEnabled: false,
  liveRiskIncreasingCommandsEnabled: false,
};
const INPUT = { requestKey: "rk_http_cls_1", alphaId: "carry", evidenceRunId: "run_5512", methodologyClaimId: "clm_31", summary: "Long enough summary." };

afterEach(() => vi.unstubAllGlobals());

async function answer(make: () => Response | Promise<Response>): Promise<ApprovalCreateOutcome> {
  vi.stubGlobal("fetch", async () => make());
  return createHttpApi({ policy: OPEN }).createApprovalRequest(INPUT);
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const kindOf = (o: ApprovalCreateOutcome) => (o.kind === "failed" ? failureKind(o) : o.kind);

describe("POST /governance/approvals: what may have been created", () => {
  it.each([500, 502, 503, 504, 408])("HTTP %i with a typed body is uncertain", async (status) => {
    const out = await answer(() => json(status, { error: { code: "UPSTREAM_FAILED", message: "gateway said no" } }));
    expect(kindOf(out)).toBe("uncertain");
    expect(out).toMatchObject({ kind: "failed", offline: true });
  });

  it.each([502, 504])("HTTP %i with no body at all is uncertain", async (status) => {
    expect(kindOf(await answer(() => new Response("<html>bad gateway</html>", { status })))).toBe("uncertain");
  });

  it("a 2xx whose body is not JSON is uncertain: the server answered, so the request may exist", async () => {
    const out = await answer(() => new Response("not json", { status: 200 }));
    expect(kindOf(out)).toBe("uncertain");
  });

  it("a 2xx whose JSON is not a created approval is uncertain", async () => {
    expect(kindOf(await answer(() => json(201, { hello: "world" })))).toBe("uncertain");
  });

  it("a dropped network is uncertain", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(kindOf(await createHttpApi({ policy: OPEN }).createApprovalRequest(INPUT))).toBe("uncertain");
  });

  it.each([
    [400, "INVALID_APPROVAL_CREATE_REQUEST", "refused"],
    [404, "EVIDENCE_RUN_NOT_FOUND", "refused"],
    [409, "REQUEST_KEY_CONFLICT", "refused"],
    [422, "UNKNOWN_REGISTRY_ID", "refused"],
    [403, "WORKSPACE_ACCESS_DENIED", "denied"],
    [401, "SESSION_REQUIRED", "denied"],
  ])("HTTP %i %s is definite (%s): no offline flag, the key may be replaced", async (status, code, kind) => {
    const out = await answer(() => json(status, { error: { code, message: "as stated" } }));
    expect(kindOf(out)).toBe(kind);
    expect(out).not.toHaveProperty("offline");
  });

  it("a 4xx without a typed code is 'could not send', still definite", async () => {
    const out = await answer(() => new Response("", { status: 404 }));
    expect(kindOf(out)).toBe("unavailable");
    expect(out).not.toHaveProperty("offline");
  });

  it("the policy refusing before any request is definite: nothing was sent", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("must not be called");
    });
    const blocked = await createHttpApi({ policy: { ...OPEN, governanceWriteEnabled: false } }).createApprovalRequest(INPUT);
    expect(kindOf(blocked)).toBe("unavailable");
  });
});
