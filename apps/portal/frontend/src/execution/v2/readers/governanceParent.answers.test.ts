/** `getGovernanceParent` refuses a well-formed V2 body that answers another workspace or another request (R-B browser case "gate body for another workspace"). */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHttpApi } from "../../api/httpApi";
import type { DeliveryPolicy } from "../../profile";
import { loadCanonical } from "../testkit/loadCanonical";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
afterEach(() => vi.unstubAllGlobals());

const fixture = loadCanonical<Record<string, any>>("execution-positive-parent.synthetic");
function api(body: unknown) {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  return createHttpApi({ policy: OPEN, readScope: {} });
}
const WS = fixture.live.workspace_id as string;
const ID = fixture.live.approval.approval_id as string;

describe("getGovernanceParent answers the question asked", () => {
  it("accepts the body for the workspace and request asked", async () => {
    expect((await api(fixture.live).getGovernanceParent("live", ID, WS)).ok).toBe(true);
  });
  it("refuses a body for another workspace", async () => {
    const result = await api({ ...fixture.live, workspace_id: "ws_OTHER" }).getGovernanceParent("live", ID, WS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/another workspace/);
  });
  it("refuses a body for another request", async () => {
    const result = await api(fixture.live).getGovernanceParent("live", "apr_OTHER", WS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/another request/);
  });
  it("names no workspace: the body's own is not compared", async () => {
    expect((await api(fixture.live).getGovernanceParent("live", ID)).ok).toBe(true);
  });
});
