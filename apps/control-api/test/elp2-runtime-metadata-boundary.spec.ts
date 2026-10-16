import { describe, expect, it, vi } from "vitest";
import { ExecutionRuntimeManifestController } from "../src/execution/runtime-manifest.controller";

function fixture(modes: string[]) {
  const manifest = vi.fn(() => ({ schema_version: "portal.execution.runtime-manifest.v1", technical: "legacy-config" }));
  const coreSelectionMode = vi.fn(); modes.forEach(mode => coreSelectionMode.mockResolvedValueOnce(mode));
  const controller = new ExecutionRuntimeManifestController({ manifest } as any,
    { canReadExecution: async () => true } as any, { coreSelectionMode } as any);
  const request = { portalUser: { userId: "test-only" }, portalSession: { sessionId: "s" }, portalWorkspaceId: "core" } as any;
  return { controller, manifest, request };
}
describe("ELP2-04 runtime metadata is not implicit business permission", () => {
  it("refuses the unqualified mixed technical DTO before assembly", async () => {
    const f = fixture(["SCOPED_V2"]);
    await expect(f.controller.manifest(f.request, {})).rejects.toMatchObject({
      code: "RUNTIME_MANIFEST_TECHNICAL_FIELDS_NOT_COMMISSIONED", status: 503 });
    expect(f.manifest).not.toHaveBeenCalled();
  });
  it("preserves legacy metadata and fences policy activation", async () => {
    const good = fixture(["LEGACY_COMPATIBILITY", "LEGACY_COMPATIBILITY"]);
    await expect(good.controller.manifest(good.request, {})).resolves.toMatchObject({ technical: "legacy-config" });
    const changed = fixture(["LEGACY_COMPATIBILITY", "SCOPED_V2"]);
    await expect(changed.controller.manifest(changed.request, {})).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
});
