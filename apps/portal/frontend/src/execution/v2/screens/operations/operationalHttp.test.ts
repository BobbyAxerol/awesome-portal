/**
 * The two V2 reads through the real HTTP client, against the e2e BFF double
 * (which serves the contract fixture). The same pattern analyticsPort.test.tsx
 * uses: stub `fetch`, call the port method, assert the route and the result.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerOperationsV2 } from "../../../../../e2e/bffDoubleV2";
import { createHttpApi } from "../../../api/httpApi";
import type { DeliveryPolicy } from "../../../profile";

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

afterEach(() => vi.unstubAllGlobals());

/** Routes fetch to the double; anything it does not know is a 501 so a wrong path fails loudly. */
function serveDouble() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const parsed = new URL(url, "http://portal.test");
    const path = parsed.pathname.replace(/^\/api\/v1\/execution/, "");
    const answer = answerOperationsV2("GET", path, parsed.searchParams) ?? { status: 501, body: { error: { code: "gap", message: path } } };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

function serveBody(body: unknown, status = 200) {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

const api = () => createHttpApi({ policy: OPEN, readScope: {} });

describe("listOperationalQueueV2", () => {
  it("GETs /operations and reads the V2 queue", async () => {
    const calls = serveDouble();
    const result = await api().listOperationalQueueV2({});
    if (!result.ok) throw new Error(result.reason);
    expect(calls[0]).toBe("/api/v1/execution/operations");
    if (result.value.kind !== "queue") throw new Error("expected a queue");
    const page = result.value.queue.page;
    expect(page.rows[0].operationId).toBe("op_01K3COMMANDPLAN000000000000");
    expect(page.totalCount).toBe(13); // WP-B2-S3: the world holds 13 operations (the dry-run reconcile of Carry A's Live deployment is the 13th)
  });

  it("forwards every filter, with the environment UPPERCASE on the wire", async () => {
    const calls = serveDouble();
    const result = await api().listOperationalQueueV2({
      workspaceId: "ws 1", limit: 25, triageState: "UNACKNOWLEDGED", environment: "sandbox", severity: "CRITICAL",
      verificationResult: "UNCERTAIN", targetType: "PORTFOLIO", commandKey: "portfolio/adjust-target-budget",
    });
    if (!result.ok) throw new Error(result.reason);
    const query = new URL(calls[0], "http://portal.test").searchParams;
    expect(Object.fromEntries(query)).toEqual({
      workspace_id: "ws 1", limit: "25", triage_state: "UNACKNOWLEDGED", environment: "SANDBOX", severity: "CRITICAL",
      verification_result: "UNCERTAIN", target_type: "PORTFOLIO", command_key: "portfolio/adjust-target-budget",
    });
    if (result.value.kind !== "queue") throw new Error("expected a queue");
    expect(result.value.queue.page.rows.map((r) => r.operationId)).toEqual(["op_TEST_ONLY_s01"]);
    expect(result.value.queue.page.filteredCount).toBe(1);
    expect(result.value.queue.page.totalCount).toBe(13); // WP-B2-S3: the world holds 13 operations (the dry-run reconcile of Carry A's Live deployment is the 13th)
  });

  it("pages with the opaque cursor the server issued, and ends without one", async () => {
    serveDouble();
    const first = await api().listOperationalQueueV2({ limit: 5 });
    if (!first.ok || first.value.kind !== "queue") throw new Error("first page");
    const p1 = first.value.queue.page;
    expect(p1.rows).toHaveLength(5);
    expect(p1.hasMore).toBe(true);
    const second = await api().listOperationalQueueV2({ limit: 5, after: p1.nextCursor ?? "" });
    if (!second.ok || second.value.kind !== "queue") throw new Error("second page");
    const p2 = second.value.queue.page;
    expect(p2.hasPrevious).toBe(true);
    const third = await api().listOperationalQueueV2({ limit: 5, after: p2.nextCursor ?? "" });
    if (!third.ok || third.value.kind !== "queue") throw new Error("third page");
    const p3 = third.value.queue.page;
    expect(p3.hasMore).toBe(false);
    expect(p3.nextCursor).toBeNull();
    const ids = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.operationId);
    expect(new Set(ids).size).toBe(13); // WP-B2-S3: the world holds 13 operations (the dry-run reconcile of Carry A's Live deployment is the 13th)
  });

  it("a cursor issued under other filters is a 409 the screen can recognise", async () => {
    serveDouble();
    const first = await api().listOperationalQueueV2({ limit: 2 });
    if (!first.ok || first.value.kind !== "queue") throw new Error("first page");
    const stale = await api().listOperationalQueueV2({ limit: 2, severity: "INFO", after: first.value.queue.page.nextCursor ?? "" });
    if (stale.ok) throw new Error("a cursor from other filters must be refused");
    expect(stale.reason).toContain("OPERATIONAL_READ_CHANGED");
  });

  it("refuses both directions at once without a request", async () => {
    const calls = serveDouble();
    const result = await api().listOperationalQueueV2({ after: "a", before: "b" });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("the double answers 400 for assigned_to, as the server does", () => {
    const answer = answerOperationsV2("GET", "/operations", new URLSearchParams("assigned_to=me"));
    expect(answer?.status).toBe(400);
    expect(JSON.stringify(answer?.body)).toContain("OPERATIONAL_READ_FILTER_NOT_SUPPORTED");
  });

  it("answers unsupported_shape for the legacy queue instead of mis-reading it", async () => {
    serveBody({ schema_version: "execution.operations-queue.v1", page: { rows: [], total_count: 0 } });
    const result = await api().listOperationalQueueV2({});
    expect(result).toEqual({ ok: true, value: { kind: "unsupported_shape", schemaVersion: "execution.operations-queue.v1" } });
  });

  it("is unavailable, not a guess, for a malformed V2 body", async () => {
    serveBody({ schema_version: "portal.execution.operational-queue.v2", page: {} });
    const result = await api().listOperationalQueueV2({});
    expect(result.ok).toBe(false);
  });

  it("maps a refusal to a typed status and keeps the server's code", async () => {
    serveBody({ error: { code: "OPERATIONAL_READ_AUTHORITY_REQUIRED", message: "no" } }, 403);
    const result = await api().listOperationalQueueV2({});
    expect(result).toMatchObject({ ok: false, status: "denied" });
    if (!result.ok) expect(result.reason).toContain("OPERATIONAL_READ_AUTHORITY_REQUIRED");
  });

  it("is unavailable when the request never arrives", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    const result = await api().listOperationalQueueV2({});
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
  });
});

describe("getIncidentRootV2", () => {
  it("GETs the encoded incident route with the workspace and reads the root", async () => {
    const calls = serveDouble();
    const result = await api().getIncidentRootV2("inc_1", "ws_1");
    if (!result.ok || result.value.kind !== "incident") throw new Error("expected an incident");
    expect(calls[0]).toBe("/api/v1/execution/operations/incidents/inc_1?workspace_id=ws_1");
    expect(result.value.incident.incidentId).toBe("inc_1");
    expect(result.value.incident.historicalChildren.reasonCode).toBe("ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED");
  });

  it("encodes the id in the path, and a root whose id is outside the schema's Identifier pattern is not read (F5c OQ-2)", async () => {
    const calls = serveDouble();
    const result = await api().getIncidentRootV2("inc 1/2", "ws_1");
    expect(calls[0]).toBe("/api/v1/execution/operations/incidents/inc%201%2F2?workspace_id=ws_1");
    // The double echoes the requested id; `inc 1/2` is not ^[A-Za-z0-9._:-]{1,191}$, so the body is refused whole.
    expect(result.ok && result.value.kind === "incident").toBe(false);
  });

  it("answers unsupported_shape for the legacy incident detail", async () => {
    serveDouble();
    const result = await api().getIncidentRootV2("inc_LEGACY_SHAPE");
    expect(result).toMatchObject({ ok: true, value: { kind: "unsupported_shape", schemaVersion: "execution.incident-detail.v1" } });
  });

  it("keeps the 404 code for an unknown incident", async () => {
    serveDouble();
    const result = await api().getIncidentRootV2("inc_NOT_FOUND");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("OPERATIONAL_READ_NOT_FOUND");
  });
});
