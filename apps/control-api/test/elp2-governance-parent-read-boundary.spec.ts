import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { CanaryService } from "../src/canary/canary.service";
import { LiveOperationsService } from "../src/live/live-operations.service";
import { SandboxCertificationService } from "../src/sandbox/sandbox-certification.service";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";

// Pure boundary units only. Parent field authority is NOT commissioned by these mocks.
const user = { userId: "TEST-u", role: "USER" } as any;
const session = { sessionId: "TEST-s" } as any;
const families = ["CANARY", "LIVE", "SANDBOX"] as const;
function fixture(family: typeof families[number], modes: string[]) {
  const selectionMode = vi.fn(); modes.forEach(mode => selectionMode.mockResolvedValueOnce(mode));
  const effectiveAccess = vi.fn().mockResolvedValue({ isOwner: true });
  const parentRead = vi.fn().mockResolvedValue({ parent: "legacy-only" });
  const snapshot = vi.fn().mockResolvedValue({ source: "legacy-only" });
  const liveOperations = vi.fn().mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503));
  const scopes = { coreSelectionMode: selectionMode } as any;
  let service: CanaryService | LiveOperationsService | SandboxCertificationService;
  if (family === "CANARY") {
    service = new CanaryService({ latestByDeployment: parentRead, lineageFor: async () => [] } as any,
      { snapshot } as any, { effectiveAccess } as any, scopes);
    vi.spyOn(service as any, "publicDetail").mockReturnValue({ parent: "legacy-only" });
  } else if (family === "LIVE") {
    service = new LiveOperationsService({ latestByDeployment: parentRead } as any,
      { snapshot, liveOperations } as any, {} as any, { effectiveAccess } as any, scopes);
    vi.spyOn(service as any, "detailLegacy").mockImplementation(parentRead);
  } else {
    service = new SandboxCertificationService({ detailByDeployment: parentRead } as any, { snapshot } as any, scopes);
    vi.spyOn(service as any, "publicDetail").mockReturnValue({ parent: "legacy-only" });
  }
  return { read: () => service.detail(user, session, "TEST-w", "TEST-deployment", "TEST-viewer"),
    parentRead, snapshot, liveOperations, selectionMode, effectiveAccess };
}

describe("ELP2-04 gate parent field authority boundary", () => {
  it.each(["CANARY", "SANDBOX"] as const)("%s V2 refuses before parent evidence or child data I/O", async family => {
    const f = fixture(family, ["SCOPED_V2"]);
    await expect(f.read()).rejects.toMatchObject({ code: `${family}_SCOPED_PARENT_NOT_COMMISSIONED`, status: 503 });
    expect(f.parentRead).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled();
    expect(f.selectionMode).toHaveBeenCalledWith({ user, session, workspaceId: "TEST-w", viewerWorkspaceId: "TEST-viewer" });
  });
  it("LIVE V2 preserves the independent source reader's typed authority refusal without legacy I/O", async () => {
    const f = fixture("LIVE", ["SCOPED_V2"]);
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(f.liveOperations).toHaveBeenCalledExactlyOnceWith(
      { user, session, workspaceId: "TEST-w", viewerWorkspaceId: "TEST-viewer" }, "TEST-deployment", undefined, {});
    expect(f.parentRead).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled();
    expect(f.effectiveAccess).not.toHaveBeenCalled();
  });
  it("LIVE V2 returns only the scoped source reader result, without inventing Canary ancestry", async () => {
    const f = fixture("LIVE", ["SCOPED_V2"]), value = { source: "TEST_ONLY-scoped-source-wiring" };
    f.liveOperations.mockResolvedValueOnce(value);
    await expect(f.read()).resolves.toBe(value);
    expect(f.parentRead).not.toHaveBeenCalled(); expect(f.snapshot).not.toHaveBeenCalled();
    expect(f.effectiveAccess).not.toHaveBeenCalled();
    // This mock proves dispatch only; actual grants, source qualification and
    // final disclosure fences are covered by elp2-product-reads real-PG cases.
  });
  it.each(families)("%s preserves explicit legacy payload", async family => {
    const f = fixture(family, ["LEGACY_COMPATIBILITY", "LEGACY_COMPATIBILITY"]);
    await expect(f.read()).resolves.toEqual({ parent: "legacy-only" });
    expect(f.parentRead).toHaveBeenCalledOnce();
  });
  it.each(families)("%s rejects policy activation during legacy I/O", async family => {
    const f = fixture(family, ["LEGACY_COMPATIBILITY", "SCOPED_V2"]);
    await expect(f.read()).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
  it.each(["CANARY", "LIVE"] as const)("%s rechecks gate grant at delivery", async family => {
    const f = fixture(family, ["LEGACY_COMPATIBILITY", "LEGACY_COMPATIBILITY"]);
    f.effectiveAccess.mockResolvedValueOnce({ isOwner: true }).mockResolvedValueOnce({ isOwner: false, capabilities: [], scopes: {} });
    await expect(f.read()).rejects.toMatchObject({ code: "GOVERNANCE_CAPABILITY_REQUIRED", status: 403 });
  });
});
