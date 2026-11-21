/**
 * W1 · the HTTP self-navigation port. Lane: FIXTURE_LAB (canonical fixture bodies) over a BFF_DOUBLE (an in-test fetch).
 */
import { describe, expect, it, vi } from "vitest";

import { loadCanonical } from "../testkit/loadCanonical";
import { httpSelfNavigationPort } from "./selfNavigationPort";

type Draft = any;
const FIXTURE = loadCanonical<{ cases: { type: string; case_name: string; value: Draft }[] }>("execution-access.synthetic");
const BODY: Draft = FIXTURE.cases.find((entry) => entry.type === "AccessSelfNavigation" && entry.case_name === "APP_ONLY_NOT_SOURCE_AUTHORITY")!.value;

const QUESTION = { workspaceId: "ws_TEST_ONLY", environment: "paper" as const, sessionKey: "sess_1" };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const portOf = (answer: () => Response | Promise<Response>) => {
  const fetchImpl = vi.fn(async () => answer());
  return { fetchImpl, port: httpSelfNavigationPort(fetchImpl as unknown as typeof fetch) };
};
const read = (port: ReturnType<typeof httpSelfNavigationPort>) => port.read(QUESTION, new AbortController().signal);

describe("the request", () => {
  it("is the published path with exactly workspace_id and environment, same-origin, no-store, and never carries the session key", async () => {
    const { fetchImpl, port } = portOf(() => json(200, BODY));
    await read(port);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/profile-access/v2/self-navigation?workspace_id=ws_TEST_ONLY&environment=paper");
    expect(url).not.toContain("sess_1");
    expect(init).toMatchObject({ credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    expect(init.method ?? "GET").toBe("GET");
  });

  it("a workspace id the server's strict query would reject is not sent", async () => {
    const { fetchImpl, port } = portOf(() => json(200, BODY));
    const outcome = await port.read({ ...QUESTION, workspaceId: "   " }, new AbortController().signal);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: "unavailable", status: null });
  });
});

describe("outcomes", () => {
  it("a published body reads", async () => {
    const outcome = await read(portOf(() => json(200, BODY)).port);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.navigation).toMatchObject({ workspaceId: "ws_TEST_ONLY", environment: "paper", validUntilMs: 1792094405000 });
  });

  it("409 is a conflict (the hook's one retry), carrying the code and request id", async () => {
    const outcome = await read(portOf(() => json(409, { error: { code: "ACCESS_CONFLICT", request_id: "req_9" } })).port);
    expect(outcome).toEqual({ kind: "conflict", code: "ACCESS_CONFLICT", requestId: "req_9" });
  });

  it.each([401, 403] as const)("%s is denied and keeps its status", async (status) => {
    const outcome = await read(portOf(() => json(status, { error: { code: "ACCESS_DENIED" }, request_id: "req_1" })).port);
    expect(outcome).toEqual({ kind: "denied", status, code: "ACCESS_DENIED", requestId: "req_1" });
  });

  it("a 500 is unavailable, says only what the Portal said, and takes the request id from the header when the body has none", async () => {
    const outcome = await read(portOf(() => new Response("upstream down", { status: 500, headers: { "x-request-id": "req_h" } })).port);
    expect(outcome).toEqual({ kind: "unavailable", reason: "The Portal answered 500.", status: 500, code: null, requestId: "req_h" });
  });

  it("a code outside the closed grammar is dropped, not printed", async () => {
    const outcome = await read(portOf(() => json(500, { error: { code: "not a code <script>" } })).port);
    expect(outcome).toMatchObject({ kind: "unavailable", code: null });
  });

  it("an unreadable 200 body is unavailable", async () => {
    const outcome = await read(portOf(() => new Response("<html>spa shell</html>", { status: 200 })).port);
    expect(outcome).toMatchObject({ kind: "unavailable", reason: "The answer was not readable." });
  });

  it("a 200 body that fails the strict reader is unavailable, whole (one bad row voids the read)", async () => {
    const bad = { ...BODY, features: BODY.features.slice(0, 3) };
    const outcome = await read(portOf(() => json(200, bad)).port);
    expect(outcome).toMatchObject({ kind: "unavailable", reason: "The answer did not match the published navigation contract." });
  });

  it("an extra key (the contract is closed) voids the read", async () => {
    const outcome = await read(portOf(() => json(200, { ...BODY, ttl_ms: 60000 })).port);
    expect(outcome).toMatchObject({ kind: "unavailable" });
  });

  it("another schema version is named, not read", async () => {
    const outcome = await read(portOf(() => json(200, { ...BODY, schema_version: "portal.self-navigation.v2" })).port);
    expect(outcome).toMatchObject({ kind: "unavailable", reason: "The answer is portal.self-navigation.v2, which this build does not read." });
  });

  it("a network failure and an abort resolve (never reject) as unavailable", async () => {
    const down = await read(portOf(() => { throw new TypeError("Failed to fetch"); }).port);
    expect(down).toMatchObject({ kind: "unavailable", reason: "The Portal could not be reached.", status: null });
    const controller = new AbortController();
    controller.abort();
    const aborted = await httpSelfNavigationPort((async () => { throw new DOMException("aborted", "AbortError"); }) as unknown as typeof fetch).read(QUESTION, controller.signal);
    expect(aborted.kind).toBe("unavailable");
  });
});
