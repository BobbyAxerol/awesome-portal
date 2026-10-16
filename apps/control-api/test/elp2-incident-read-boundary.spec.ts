import { describe, expect, it, vi } from "vitest";
import { IncidentService } from "../src/operations/incident.service";

const user = { userId: "test-reader", role: "ADMIN" } as any;
const principal = { user, workspaceId: "test-core", session: { sessionId: "test-session" } } as any;
function fixture(modes: string[]) {
  const detail = vi.fn(async () => ({ private: "legacy-record" }));
  const coreSelectionMode = vi.fn();
  modes.forEach(mode => coreSelectionMode.mockResolvedValueOnce(mode));
  const service = new IncidentService({ detail } as any, { coreSelectionMode } as any);
  // Isolate the authority boundary; existing Incident tests cover DTO mapping.
  vi.spyOn(service as any, "publicDetail").mockImplementation(value => value);
  return { service, detail, coreSelectionMode };
}
describe("ELP2-04 Incident parent read commissioning boundary", () => {
  it("refuses V2 before lookup, even for an ADMIN or guessed ID", async () => {
    const f = fixture(["SCOPED_V2"]);
    await expect(f.service.detail(user, "test-core", "hidden-or-unknown", principal))
      .rejects.toMatchObject({ code: "INCIDENT_SCOPED_PARENT_NOT_COMMISSIONED", status: 503 });
    expect(f.detail).not.toHaveBeenCalled();
  });
  it("requires a matching trusted principal when the runtime boundary is installed", async () => {
    const f = fixture([]);
    for (const p of [undefined, { ...principal, workspaceId: "wrong-core" }])
      await expect(f.service.detail(user, "test-core", "id", p))
        .rejects.toMatchObject({ code: "EXECUTION_READ_SCOPE_REQUIRED" });
    expect(f.detail).not.toHaveBeenCalled();
  });
  it("preserves explicit legacy detail and its existing ADMIN requirement", async () => {
    const f = fixture(["LEGACY_COMPATIBILITY", "LEGACY_COMPATIBILITY"]);
    await expect(f.service.detail(user, "test-core", "id", principal)).resolves.toEqual({ private: "legacy-record" });
    await expect(f.service.detail({ ...user, role: "USER" }, "test-core", "id", principal))
      .rejects.toMatchObject({ code: "ADMIN_ROLE_REQUIRED" });
  });
  it("fences policy activation after the legacy record is read", async () => {
    const f = fixture(["LEGACY_COMPATIBILITY", "SCOPED_V2"]);
    await expect(f.service.detail(user, "test-core", "id", principal))
      .rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });
});
