/**
 * `postSessionStepUp` over HTTP (FE-015/060, BE-P7): what is sent, where the password goes, and how each answer is typed.
 *
 * The password is an input of the call and lives in exactly one place: the JSON body of the POST to the step-up route. The headers
 * carry CSRF and a fresh idempotency key (the browser adds `Origin`); the URL carries nothing. Lane: BFF_DOUBLE (a stubbed `fetch`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeliveryPolicy } from "../profile";
import { createHttpApi } from "./httpApi";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true,
  paperCommandsEnabled: true, sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
const SECRET = "TEST_ONLY_hunter2-pw";
const INPUT = { workspaceId: "ws_TEST_ONLY", family: "CAPITAL_COMMAND", password: SECRET } as const;
const GOOD = { schema_version: "portal.access-step-up.v1", state: "ACTIVE", family: "CAPITAL_COMMAND", expires_at_ms: 1792094403000 };
const problem = (code: string) => JSON.stringify({ error: { code, message: "refused", request_id: "req_1" } });

function stub(answer: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => answer());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const withCsrf = () => { vi.spyOn(document, "cookie", "get").mockReturnValue("a=1; __Host-portal_csrf=csrf_TEST_ONLY"); };
const call = (input: Parameters<ReturnType<typeof createHttpApi>["postSessionStepUp"]>[0] = INPUT) => createHttpApi({ policy: OPEN }).postSessionStepUp(input);

describe("postSessionStepUp · the request", () => {
  it("POSTs the step-up route with the family named, CSRF and a fresh idempotency key; the password is only in the body", async () => {
    withCsrf();
    const fetchMock = stub(() => new Response(JSON.stringify(GOOD), { status: 200 }));
    await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/profile-access/v2/step-up");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-portal-csrf"]).toBe("csrf_TEST_ONLY");
    expect(headers["x-portal-idempotency-key"]).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(JSON.parse(init?.body as string)).toEqual({ workspace_id: "ws_TEST_ONLY", password: SECRET, family: "CAPITAL_COMMAND" });
    // Nowhere else: not the URL, not a header value.
    expect(url).not.toContain(SECRET);
    expect(Object.values(headers).join("|")).not.toContain(SECRET);
  });

  it("each attempt is a new intent: the idempotency key is never reused", async () => {
    withCsrf();
    const fetchMock = stub(() => new Response(JSON.stringify(GOOD), { status: 200 }));
    await call();
    await call();
    const keys = fetchMock.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)["x-portal-idempotency-key"]);
    expect(new Set(keys).size).toBe(2);
  });

  it("the ACCESS_ADMIN family is named too, never omitted", async () => {
    withCsrf();
    const fetchMock = stub(() => new Response(JSON.stringify({ ...GOOD, family: "ACCESS_ADMIN" }), { status: 200 }));
    await call({ ...INPUT, family: "ACCESS_ADMIN" });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string).family).toBe("ACCESS_ADMIN");
  });

  it("an input the strict schema would refuse sends nothing", async () => {
    withCsrf();
    const fetchMock = stub(() => new Response("{}", { status: 200 }));
    expect(await call({ ...INPUT, password: "" })).toMatchObject({ kind: "unavailable" });
    expect(await call({ ...INPUT, family: "OWNER" as never })).toMatchObject({ kind: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without the CSRF cookie nothing is sent (the 403 would only be misread as a wrong token)", async () => {
    const fetchMock = stub(() => new Response("{}", { status: 200 }));
    expect(await call()).toMatchObject({ kind: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("postSessionStepUp · the answer", () => {
  it("a 200 for the family asked is ok, with the end time", async () => {
    withCsrf();
    stub(() => new Response(JSON.stringify(GOOD), { status: 200 }));
    expect(await call()).toEqual({ kind: "ok", stepUp: { state: "ACTIVE", family: "CAPITAL_COMMAND", expiresAtMs: 1792094403000 } });
  });

  it("a 200 for the OTHER family is not an answer to this request", async () => {
    withCsrf();
    stub(() => new Response(JSON.stringify({ ...GOOD, family: "ACCESS_ADMIN" }), { status: 200 }));
    expect(await call()).toMatchObject({ kind: "unavailable", reason: expect.stringContaining("another proof family") });
  });

  it("a 200 without a family (the old shape), another schema, or not JSON is unavailable", async () => {
    withCsrf();
    for (const body of [JSON.stringify({ schema_version: GOOD.schema_version, state: "ACTIVE", expires_at_ms: 1 }), JSON.stringify({ ...GOOD, schema_version: "x" }), "not json"]) {
      stub(() => new Response(body, { status: 200 }));
      expect(await call()).toMatchObject({ kind: "unavailable" });
    }
  });

  it.each(["STEP_UP_REJECTED", "ACCESS_DENIED", "CURRENT_ACTOR_AUTHORITY_REQUIRED"])("%s is a typed refusal carrying the code and the status", async (code) => {
    withCsrf();
    stub(() => new Response(problem(code), { status: 403 }));
    expect(await call()).toEqual({ kind: "refused", status: 403, code });
  });

  it("a refusal whose body is not a problem keeps its status and no code", async () => {
    withCsrf();
    stub(() => new Response("<html>", { status: 502 }));
    expect(await call()).toEqual({ kind: "refused", status: 502, code: null });
  });

  it("a network failure is unavailable (the outcome may be unknown), never a refusal", async () => {
    withCsrf();
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    expect(await call()).toMatchObject({ kind: "unavailable" });
  });

  it("no answer, refusal or reason ever contains the password", async () => {
    withCsrf();
    for (const make of [() => new Response(problem("STEP_UP_REJECTED"), { status: 401 }), () => new Response(JSON.stringify(GOOD), { status: 200 }), () => new Response("x", { status: 500 })]) {
      stub(make);
      expect(JSON.stringify(await call())).not.toContain(SECRET);
    }
  });
});
