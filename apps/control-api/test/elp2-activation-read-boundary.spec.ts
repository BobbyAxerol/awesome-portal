import { describe, expect, it, vi } from "vitest";
import { ActivationController } from "../src/activation/activation.controller";
import { testConfig } from "./harness";

// Pure controller boundary units, not source or runtime qualification.
function fixture(modes: string[]) {
  const capabilities = vi.fn(async () => ({ capabilities: ["legacy-only"] }));
  const detail = vi.fn(async () => ({ evidence_refs: ["legacy-only"] }));
  const selectionMode = vi.fn(); modes.forEach(value => selectionMode.mockResolvedValueOnce(value));
  const controller = new ActivationController({ capabilities, detail } as any,
    { isMember: async () => true } as any, testConfig(), { coreSelectionMode: selectionMode } as any);
  const request = { portalWorkspaceId: "w", portalUser: { userId: "u" }, portalSession: { sessionId: "s" } } as any;
  return { controller, request, capabilities, detail };
}
describe("ELP2-04 Activation GET field-policy commissioning", () => {
  it.each(["capabilities", "detail"] as const)("does not read %s evidence under a health-only V2 policy", async method => {
    const f = fixture(["SCOPED_V2"]);
    const pending = method === "detail" ? f.controller.detail(f.request, "unknown-or-hidden") : f.controller.capabilities(f.request);
    await expect(pending).rejects.toMatchObject({ code: "ACTIVATION_TECHNICAL_FIELDS_NOT_COMMISSIONED", status: 503 });
    expect(f.capabilities).not.toHaveBeenCalled(); expect(f.detail).not.toHaveBeenCalled();
  });
  it("preserves explicit legacy plan detail", async () => {
    const f = fixture(["LEGACY_COMPATIBILITY", "LEGACY_COMPATIBILITY"]);
    await expect(f.controller.detail(f.request, "legacy-plan")).resolves.toEqual({ evidence_refs: ["legacy-only"] });
  });
  it("does not deliver legacy evidence after policy activation", async () => {
    const f = fixture(["LEGACY_COMPATIBILITY", "SCOPED_V2"]);
    await expect(f.controller.detail(f.request, "legacy-plan")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
});
