import { afterEach, describe, expect, it, vi } from "vitest";
import type { ControlApiConfig } from "../src/config";
import type { PortalUser } from "../src/domain";
import { PortalProxyService, type ProxyInput } from "../src/facade/proxy.service";

const now = new Date("2026-11-03T00:00:00.000Z");
const user: PortalUser = { userId: "test-user", username: "test-user", displayName: "Test", role: "ADMIN",
  status: "ACTIVE", mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: now, updatedAt: now, disabledAt: null, accountRevision: 1, archivedAt: null };
const config = { PORTAL_API_BASE_URL: "http://portal-api:8000",
  INTERNAL_PRINCIPAL_SECRET: "TEST_ONLY-principal-secret-0123456789" } as ControlApiConfig;
const input = (body: string | Buffer | undefined): ProxyInput => ({ method: "POST", path: "/api/runs",
  query: undefined, body, contentType: "application/octet-stream", requestId: "test-request", traceparent: "test-trace",
  user, workspaceId: "test-workspace", idempotencyKey: undefined });

afterEach(() => vi.unstubAllGlobals());

describe("Node fetch facade body", () => {
  it.each([Buffer.from([0, 255, 128, 13, 10]), "test body", undefined])
    ("forwards the original body without conversion", async body => {
      const fetch = vi.fn(async (_url: URL, _init: { body?: unknown }) =>
        new Response("upstream response", { status: 202, headers: { etag: '"test"' } }));
      vi.stubGlobal("fetch", fetch);
      const service = new PortalProxyService(config, {} as never, {} as never, {} as never, {} as never);
      const result = await service.proxy(input(body));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][0].href).toBe("http://portal-api:8000/api/runs");
      expect(fetch.mock.calls[0][1].body).toBe(body ?? null);
      expect(result.status).toBe(202);
      expect(result.body.toString()).toBe("upstream response");
      expect(result.headers.etag).toBe('"test"');
    });
});
