import { describe, expect, it, vi } from "vitest";
import { ExecutionAnalyticsProxy } from "../src/execution/analytics.proxy";
import { technicalDiagnosticsSchema, technicalHealthSchema } from "../src/execution-v2/technical-read.contract";
import { ExecutionDurableMirrorIntegrityController } from "../src/execution/durable-mirror-integrity.controller";
import { testConfig } from "./harness";

// Boundary units only; mocked authority is not a minted scope or runtime proof.
const principal = { user: { userId: "u", role: "VIEWER", sessionVersion: 1 },
  session: { sessionId: "s", userId: "u", sessionVersion: 1 }, workspaceId: "w" };
function proxy(modes: string[]) {
  const selectionMode = vi.fn(); modes.forEach(mode => selectionMode.mockResolvedValueOnce(mode));
  const issueReadAssertion = vi.fn(async () => "test-only"), sendRequest = vi.fn(async () => ({ facts: "legacy" }));
  const release = vi.fn();
  const value = Object.assign(Object.create(ExecutionAnalyticsProxy.prototype), {
    readScopes: { selectionMode }, delegation: { issueReadAssertion }, tls: {},
    bulkhead: { acquire: vi.fn(async () => release) }, getSession: vi.fn(async () => ({})), sendRequest,
  });
  return { value, issueReadAssertion, sendRequest, release };
}

describe("ELP2-04 remote and technical boundaries (unit, not source acceptance)", () => {
  it("refuses only unqualified V2 analytics transport before delegation/network", async () => {
    const f = proxy(["SCOPED_V2"]);
    await expect(f.value.request(principal, "GET", "/fixed", "alpha:test"))
      .rejects.toMatchObject({ code: "ANALYTICS_SCOPED_TRANSPORT_NOT_COMMISSIONED", status: 503 });
    expect(f.issueReadAssertion).not.toHaveBeenCalled(); expect(f.sendRequest).not.toHaveBeenCalled();
  });
  it("preserves explicitly legacy proxy responses", async () => {
    const f = proxy(["LEGACY_COMPATIBILITY", "LEGACY_COMPATIBILITY"]);
    await expect(f.value.request(principal, "GET", "/fixed", "alpha:test")).resolves.toEqual({ facts: "legacy" });
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("does not deliver legacy remote bytes after policy activation", async () => {
    const f = proxy(["LEGACY_COMPATIBILITY", "SCOPED_V2"]);
    await expect(f.value.request(principal, "GET", "/fixed", "alpha:test"))
      .rejects.toMatchObject({ code: "ANALYTICS_ACCESS_CHANGED", status: 409 });
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("returns only the approved finite integrity health fields after exact technical authorization", async () => {
    const integrity = vi.fn(async () => ({ state: "PARTIAL", reason_code: "FINDINGS", measured_revision: "r", measured_at_ms: 123,
      total_findings: 9001, findings: [{ secret: true }] }));
    const authorizeTechnicalProfile = vi.fn(async () => ({ marker: "mock-only" }));
    const deliver = vi.fn(async (_scope, read) => read());
    const controller = new ExecutionDurableMirrorIntegrityController({ integrity } as any, { canReadExecution: async () => true } as any,
      testConfig({ EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "w", EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_TEST" }),
      { selectionMode: async () => "SCOPED_V2", authorizeTechnicalProfile, deliver } as any);
    const result = await controller.integrity({ portalUser: principal.user, portalSession: principal.session, portalWorkspaceId: "w" } as any, {});
    expect(technicalHealthSchema.parse(result).state).toBe("PARTIAL");
    expect(JSON.stringify(result)).not.toMatch(/9001|secret|findings/);
    expect(authorizeTechnicalProfile).toHaveBeenCalledOnce(); expect(deliver).toHaveBeenCalledOnce();
  });
  it("does not read integrity when maintenance authority is denied", async () => {
    const integrity = vi.fn();
    const controller = new ExecutionDurableMirrorIntegrityController({ integrity } as any, { canReadExecution: async () => true } as any,
      testConfig({ EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "w", EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_TEST" }),
      { selectionMode: async () => "SCOPED_V2", authorizeTechnicalProfile: async () => { throw new Error("denied"); } } as any);
    await expect(controller.integrity({ portalUser: principal.user, portalSession: principal.session, portalWorkspaceId: "w" } as any, {})).rejects.toThrow("denied");
    expect(integrity).not.toHaveBeenCalled();
  });
  it("diagnostics cannot carry global source counts, topology or oversized state", () => {
    const profile = { environment: "paper", profile_id: "PAPER_TEST", component: "LOCAL_PROJECTION", state: "IDLE",
      health: "OBSERVED", lag_ms: 0, last_error_code: null };
    const valid = { schema_version: "portal.execution.technical-diagnostics.v1", read_scope: "TECHNICAL_AUTHORIZED", profiles: [profile] };
    expect(technicalDiagnosticsSchema.safeParse(valid).success).toBe(true);
    for (const extra of [{ host: "private" }, { global_count: 99 }, { state: "x".repeat(257) }, { lag_ms: -1 }])
      expect(technicalDiagnosticsSchema.safeParse({ ...valid, profiles: [{ ...profile, ...extra }] }).success).toBe(false);
  });
});
