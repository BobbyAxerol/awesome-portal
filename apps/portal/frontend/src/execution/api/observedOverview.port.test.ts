/**
 * `ExecutionApi.getObservedOverview` through the real HTTP client (lane BFF_DOUBLE: `fetch` is stubbed and answers from the PUBLISHED
 * canonical fixture `execution-observed-read.synthetic.valid.json`, TEST_ONLY). Proves the route, the typed refusals staying apart
 * (404 lane off, 409 SCOPED_V2, others) and the fail-closed mapping. Not a live Core.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeliveryPolicy } from "../profile";
import { loadCanonical } from "../v2/testkit/loadCanonical";
import { OBSERVED_CODES, classifyObservedFailure } from "../v2/readers/observedOverview";
import { createFixtureApi } from "./fixtureApi";
import { createHttpApi } from "./httpApi";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
afterEach(() => vi.unstubAllGlobals());
const api = () => createHttpApi({ policy: OPEN, readScope: {} });
const fixture = loadCanonical<{ cases: Record<string, unknown> }>("execution-observed-read.synthetic.valid.json").cases;

function serve(body: unknown, status = 200): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}
const problemBody = (code: string) => ({ error: { code, message: "refused" }, request_id: "req_TEST" });

describe("getObservedOverview", () => {
  it("reads the populated case from /observed/overview?environment=paper", async () => {
    const calls = serve(fixture.paper);
    const result = await api().getObservedOverview({ environment: "paper" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/\/observed\/overview\?environment=paper$/);
    if (result.ok) expect(result.value.trust.qualified).toBe(false);
  });

  it("keeps null as null through the port", async () => {
    serve(fixture.unavailable);
    const result = await api().getObservedOverview({ environment: "paper" });
    expect(result.ok).toBe(true);
    if (result.ok) for (const f of result.value.figures) expect(f.value).toBeNull();
  });

  it("404 lane off keeps its status and code", async () => {
    serve(problemBody(OBSERVED_CODES.laneOff), 404);
    const result = await api().getObservedOverview({ environment: "paper" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result).toMatchObject({ httpStatus: 404, code: OBSERVED_CODES.laneOff });
      expect(classifyObservedFailure(result)).toBe("lane_off");
    }
  });

  it("404 without a JSON body (route absent) is a lane-off, with a synthetic code", async () => {
    serve("<html>not found</html>", 404);
    const result = await api().getObservedOverview({ environment: "paper" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(classifyObservedFailure(result)).toBe("lane_off");
  });

  it("409 SCOPED_V2 and 409 access-changed stay apart from each other and from 404", async () => {
    serve(problemBody(OBSERVED_CODES.scoped), 409);
    const scoped = await api().getObservedOverview({ environment: "paper" });
    serve(problemBody(OBSERVED_CODES.accessChanged), 409);
    const changed = await api().getObservedOverview({ environment: "paper" });
    expect(scoped.ok || changed.ok).toBe(false);
    if (!scoped.ok && !changed.ok) {
      expect(scoped.httpStatus).toBe(409);
      expect(classifyObservedFailure(scoped)).toBe("scoped");
      expect(classifyObservedFailure(changed)).toBe("access_changed");
    }
  });

  it.each([400, 401, 403, 503])("%i is classed other and carries its status", async (status) => {
    serve(problemBody("SOME_CODE"), status);
    const result = await api().getObservedOverview({ environment: "paper" });
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.httpStatus).toBe(status); expect(classifyObservedFailure(result)).toBe("other"); }
  });

  it("a malformed 200 and a qualified:true 200 are unavailable, never a partial read", async () => {
    serve({ schema_version: "portal.execution.observed-read.v1" });
    const malformed = await api().getObservedOverview({ environment: "paper" });
    const upgraded = structuredClone(fixture.paper) as { trust: { qualified: boolean } };
    upgraded.trust.qualified = true;
    serve(upgraded);
    const qualified = await api().getObservedOverview({ environment: "paper" });
    for (const r of [malformed, qualified]) { expect(r.ok).toBe(false); if (!r.ok) expect(r.status).toBe("unavailable"); }
  });

  it("a network failure is unavailable", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    const result = await api().getObservedOverview({ environment: "paper" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("unavailable");
  });

  it("the fixture api answers unavailable", async () => {
    const result = await createFixtureApi().getObservedOverview({ environment: "paper" });
    expect(result.ok).toBe(false);
  });
});
