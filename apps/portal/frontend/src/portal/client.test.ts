/**
 * Transport tests for the Portal control-plane client.
 *
 * These pin the cache semantics documented in FRONTEND_HANDOFF §1, because
 * getting them wrong is invisible in the UI until a user acts on a stale
 * snapshot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PortalRequestError,
  __resetPortalClientCaches,
  fetchRegistry,
  fetchSummary,
} from "./client";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit & { etag?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.etag) headers.set("ETag", init.etag);
  return new Response(JSON.stringify(body), { ...init, headers });
}

beforeEach(() => {
  __resetPortalClientCaches();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("registry transport", () => {
  it("sends no If-None-Match on the first call and stores the ETag", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ revision: 1 }, { etag: '"sha256:abc"' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchRegistry();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("If-None-Match")).toBeNull();
  });

  it("revalidates with If-None-Match and reuses the cached document on 304", async () => {
    const document = { revision: 7 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(document, { etag: '"sha256:abc"' }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await fetchRegistry();
    const second = await fetchRegistry();

    expect(second).toEqual(first);
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("If-None-Match")).toBe('"sha256:abc"');
  });

  it("re-fetches unconditionally if a 304 arrives with no cached copy", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(jsonResponse({ revision: 2 }, { etag: '"sha256:def"' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchRegistry()).resolves.toEqual({ revision: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the typed error envelope and its request id", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        { error: { code: "SUMMARY_CONTRACT_FAILURE", message: "aggregator failed" }, request_id: "req-1" },
        { status: 500, headers: { "X-Request-ID": "req-1" } },
      )) as unknown as typeof fetch;

    const error = await fetchRegistry().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PortalRequestError);
    const portalError = error as PortalRequestError;
    expect(portalError.code).toBe("SUMMARY_CONTRACT_FAILURE");
    expect(portalError.message).toBe("aggregator failed");
    expect(portalError.requestId).toBe("req-1");
    expect(portalError.retryable).toBe(true);
  });

  it("marks a 403 as non-retryable so the UI does not loop on denial", async () => {
    globalThis.fetch = (async () => jsonResponse({}, { status: 403 })) as unknown as typeof fetch;
    const error = (await fetchRegistry().catch((e: unknown) => e)) as PortalRequestError;
    expect(error.retryable).toBe(false);
  });
});

describe("summary transport", () => {
  it("bypasses the HTTP cache entirely", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ schema_version: "portal.summary.v1" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchSummary();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/portal/summary");
    expect(init.cache).toBe("no-store");
  });

  it("never sends an If-None-Match for the summary", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchSummary();
    await fetchSummary();

    for (const call of fetchMock.mock.calls) {
      const init = (call as unknown as [string, RequestInit])[1];
      expect(new Headers(init.headers).get("If-None-Match")).toBeNull();
    }
  });

  it("does not retry internally — one call per invocation", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, { status: 503 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchSummary().catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
