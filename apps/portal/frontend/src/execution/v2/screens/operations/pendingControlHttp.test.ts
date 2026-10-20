/**
 * RV-10 · `previewPendingControl` through the real HTTP client with a stubbed `fetch`: the route, the headers, the exact body, and
 * what each answer becomes. Lane: FIXTURE_LAB (nothing reaches a network).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CSRF_COOKIE, CSRF_HEADER, createHttpApi } from "../../../api/httpApi";
import type { DeliveryPolicy } from "../../../profile";
import { readPendingRecallDiscoveryV1 } from "../../readers/pendingRecallDiscovery";
import { loadCanonical } from "../../testkit/loadCanonical";
import { buildPendingControlIntent, type PendingControlIntentWire } from "./pendingControlIntent";

type Draft = any;
const CURRENCY = loadCanonical<Record<string, Draft>>("execution-pending-control-currency.synthetic");
const CONTROL = loadCanonical<Record<string, Draft>>("execution-pending-control.synthetic");
const DENIED = loadCanonical<Draft>("execution-command-apply-denied.valid.json");

const POLICY: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true,
  paperCommandsEnabled: true, sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
const api = () => createHttpApi({ policy: POLICY, readScope: {} });

function intent(operation: "APPLY_PENDING" | "CANCEL_REMAINING" = "APPLY_PENDING"): PendingControlIntentWire {
  const read = readPendingRecallDiscoveryV1(CURRENCY.discovery_open);
  if (read === null || read.kind !== "pending_recall_discovery") throw new Error("fixture does not read");
  const built = buildPendingControlIntent({
    target: { workspaceId: "ws_TEST_ONLY", resource: { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" }, environment: "paper", recall: read.discovery.items[0]!, policyRevision: "TEST_ONLY:portal-policy" },
    operation, reason: "Release the remainder", idempotencyKey: "pending_control:0123456789abcdef",
  });
  if (!built.ok) throw new Error(built.reason);
  return built.intent;
}

interface Seen { url: string; init: RequestInit }
function serve(status: number, body: unknown): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return seen;
}

beforeEach(() => {
  Object.defineProperty(document, "cookie", { value: `${CSRF_COOKIE}=tok123`, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "cookie");
});

describe("the request", () => {
  it("POSTs the intent to /pending-recalls/preview with the session token and the matching idempotency header", async () => {
    const seen = serve(200, CONTROL.preview_allowed);
    const wire = intent();
    const result = await api().previewPendingControl(wire);
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("/api/v1/execution/pending-recalls/preview");
    expect(seen[0]!.init.method).toBe("POST");
    const headers = seen[0]!.init.headers as Record<string, string>;
    expect(headers[CSRF_HEADER]).toBe("tok123");
    expect(headers["x-portal-idempotency-key"]).toBe("pending_control:0123456789abcdef");
    expect(headers["x-portal-idempotency-key"]).toBe(wire.business_payload.idempotency_key);
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual(wire);
    // The counters leave as strings: the body text carries them with quotes, above 2^53 too.
    expect(String(seen[0]!.init.body)).toContain('"budget":"9007199254740993"');
  });

  it("without a session token nothing is sent", async () => {
    Object.defineProperty(document, "cookie", { value: "", configurable: true });
    const seen = serve(200, CONTROL.preview_allowed);
    const result = await api().previewPendingControl(intent());
    expect(seen).toHaveLength(0);
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    expect(!result.ok && result.reason).toMatch(/^SESSION_REQUIRED: /);
  });

  it("a network failure is unavailable, with no body of the request in the words", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("network down"); });
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    expect(!result.ok && result.reason).not.toContain("Release the remainder");
  });
});

describe("the answer", () => {
  it("an allowed preview reads and answers this operation and recall", async () => {
    serve(200, CONTROL.preview_allowed);
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: true, value: { kind: "pending_control_preview", preview: { allowed: true, operation: "APPLY_PENDING" } } });
  });

  it("a preview that is not allowed is still an answer (200), typed", async () => {
    serve(200, CONTROL.preview_blocked);
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: true, value: { preview: { allowed: false, reasonCode: "PENDING_CONTROL_NOT_QUALIFIED" } } });
  });

  it("a preview of another operation than the one asked is not shown", async () => {
    serve(200, CONTROL.preview_cancel);
    const result = await api().previewPendingControl(intent("APPLY_PENDING"));
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    expect(!result.ok && result.reason).toMatch(/another operation or recall/);
  });

  it("a preview of another recall than the one asked is not shown", async () => {
    serve(200, { ...CONTROL.preview_allowed, original_recall_id: "TEST_ONLY:another" });
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("a body that does not read is unavailable, never an allowed preview", async () => {
    serve(200, { ...CONTROL.preview_allowed, business_applied: true });
    expect(await api().previewPendingControl(intent())).toMatchObject({ ok: false, status: "unavailable" });
    serve(200, "not json");
    expect(await api().previewPendingControl(intent())).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("another schema is a shape this build does not read", async () => {
    serve(200, { schema_version: "portal.execution.pending-recall-status.v1" });
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    expect(!result.ok && result.reason).toMatch(/shape this build does not read/);
  });
});

describe("the refusals", () => {
  const problem = (code: string, message = "server free text") => ({ error: { code, message }, request_id: "req-1" });

  it("a typed refusal is its closed code and the Portal's own sentence, never the server's text", async () => {
    serve(400, problem("PENDING_CONTROL_PREVIEW_CHANGED", "SECRET server text"));
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/^PENDING_CONTROL_PREVIEW_CHANGED: /);
    expect(result.reason).not.toContain("SECRET");
  });

  it("a 403 is denied", async () => {
    serve(403, problem("ACCESS_DENIED"));
    expect(await api().previewPendingControl(intent())).toMatchObject({ ok: false, status: "denied" });
  });

  it("a code outside the closed vocabulary is not printed as a code", async () => {
    serve(400, problem("SOMETHING_NEW"));
    const result = await api().previewPendingControl(intent());
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).not.toContain("SOMETHING_NEW");
    expect(result.reason).toMatch(/HTTP 400/);
  });

  it("a 409 relay denial is read with its two facts: nothing reached the source, and retrying is refused identically", async () => {
    serve(409, DENIED);
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: false, status: "denied" });
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toContain("nothing reached the Trading System");
    expect(result.reason).toContain("refused identically");
  });

  it("a denial after a request reached the source is terminal and says do not reissue", async () => {
    serve(409, { ...DENIED, details: { ...DENIED.details, source_request_sent: true } });
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: false, status: "terminal" });
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/do not reissue/i);
  });

  it("a 409 that is a typed idempotency conflict stays a typed refusal", async () => {
    serve(409, problem("PENDING_CONTROL_IDEMPOTENCY_CONFLICT"));
    const result = await api().previewPendingControl(intent());
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/^PENDING_CONTROL_IDEMPOTENCY_CONFLICT: /);
  });

  it("a 500 with an unreadable body does not complete", async () => {
    serve(500, "<html>");
    const result = await api().previewPendingControl(intent());
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
  });
});
