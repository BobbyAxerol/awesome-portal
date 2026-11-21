/**
 * BE-P7 · the self-context read as a port: the shell's `readContext` and the execution API's `getSelfContext`.
 * Lane: FIXTURE_LAB (canonical fixture bodies) over a BFF_DOUBLE (an in-test fetch).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHttpApi } from "../../api/httpApi";
import { createFixtureApi } from "../../api/fixtureApi";
import type { DeliveryPolicy } from "../../profile";
import { loadCanonical } from "../testkit/loadCanonical";
import { httpSelfNavigationPort } from "./selfNavigationPort";

type Draft = any;
const FIXTURE = loadCanonical<{ self_context_cases: { case_name: string; value: Draft }[] }>("execution-access.synthetic");
const BODY = (name: string): Draft => FIXTURE.self_context_cases.find((entry) => entry.case_name === name)!.value;
const RESOLVED = BODY("RESOLVED_SOLE_MEMBERSHIP");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const portOf = (answer: () => Response | Promise<Response>) => {
  const fetchImpl = vi.fn(async () => answer());
  return { fetchImpl, port: httpSelfNavigationPort(fetchImpl as unknown as typeof fetch) };
};
const ask = (port: ReturnType<typeof httpSelfNavigationPort>) => port.readContext!({ sessionKey: "sess_1" }, new AbortController().signal);

describe("the shell port · readContext", () => {
  it("GETs the published path with NO query, same-origin, no-store; the session key never leaves", async () => {
    const { fetchImpl, port } = portOf(() => json(200, RESOLVED));
    await ask(port);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/profile-access/v2/self-context");
    expect(url).not.toContain("sess_1");
    expect(init).toMatchObject({ credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    expect(init.method ?? "GET").toBe("GET");
  });

  it("a published body reads, and the context is the typed one", async () => {
    const outcome = await ask(portOf(() => json(200, RESOLVED)).port);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.context.defaultWorkspace).toEqual({ state: "RESOLVED", workspaceId: "ws_TEST_ONLY_personal", rule: "SOLE_MEMBERSHIP" });
  });

  it("401 and 403 are denied with their status, code and request id; other statuses are unavailable, never 'denied'", async () => {
    expect(await ask(portOf(() => json(403, { error: { code: "ACCESS_DENIED", request_id: "req_1" } })).port)).toEqual({ kind: "denied", status: 403, code: "ACCESS_DENIED", requestId: "req_1" });
    expect(await ask(portOf(() => json(401, {})).port)).toMatchObject({ kind: "denied", status: 401 });
    expect(await ask(portOf(() => json(500, { error: { code: "INTERNAL_ERROR" } })).port)).toMatchObject({ kind: "unavailable", status: 500, reason: "The Portal answered 500.", code: "INTERNAL_ERROR" });
    expect(await ask(portOf(() => json(409, {})).port)).toMatchObject({ kind: "unavailable", status: 409 });
  });

  it("an unreadable, other-shape or malformed body is unavailable, never a guessed workspace", async () => {
    expect(await ask(portOf(() => new Response("<html>", { status: 200 })).port)).toMatchObject({ kind: "unavailable", reason: "The answer was not readable." });
    expect(await ask(portOf(() => json(200, { ...RESOLVED, schema_version: "portal.self-context.v2" })).port)).toMatchObject({ kind: "unavailable", reason: "The answer is portal.self-context.v2, which this build does not read." });
    expect(await ask(portOf(() => json(200, { ...RESOLVED, role: "ADMIN" })).port)).toMatchObject({ kind: "unavailable", reason: "The answer did not match the published self-context contract." });
  });

  it("a network failure and an abort resolve (never reject) as unavailable", async () => {
    expect(await ask(portOf(() => { throw new TypeError("Failed to fetch"); }).port)).toMatchObject({ kind: "unavailable", reason: "The Portal could not be reached." });
  });
});

describe("the execution API · getSelfContext", () => {
  const OPEN: DeliveryPolicy = {
    policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true,
    paperCommandsEnabled: true, sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
  };
  afterEach(() => vi.unstubAllGlobals());
  const stub = (answer: () => Response) => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => answer());
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("reads the canonical body, with no query", async () => {
    const fetchMock = stub(() => json(200, RESOLVED));
    const result = await createHttpApi({ policy: OPEN }).getSelfContext();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/profile-access/v2/self-context");
    expect(result.ok && result.value.kind === "self_context" && result.value.context.accountOperations[0].reasonClass).toBe("COMMAND_FAMILY_NOT_COMMISSIONED");
  });

  it("another schema, a malformed body and an HTTP failure are typed unavailable (never a default workspace)", async () => {
    stub(() => json(200, { ...RESOLVED, schema_version: "portal.self-context.v2" }));
    expect(await createHttpApi({ policy: OPEN }).getSelfContext()).toMatchObject({ ok: false, status: "unavailable", reason: expect.stringContaining("does not read") });
    stub(() => json(200, { ...RESOLVED, default_workspace: { state: "RESOLVED" } }));
    expect(await createHttpApi({ policy: OPEN }).getSelfContext()).toMatchObject({ ok: false, status: "unavailable" });
    stub(() => json(503, { error: { code: "POLICY_NOT_READY", message: "later" } }));
    expect(await createHttpApi({ policy: OPEN }).getSelfContext()).toMatchObject({ ok: false });
  });

  it("the fixture port does not serve it: unavailable", async () => {
    expect(await createFixtureApi().getSelfContext()).toMatchObject({ ok: false, status: "unavailable" });
  });
});
