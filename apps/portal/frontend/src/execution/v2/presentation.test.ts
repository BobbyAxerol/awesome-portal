/** UXM-07 S1 · the workspace theme follows the cockpit only when its flag is on, and only on its own routes. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const load = async () => (await import("../../app/presentation")).presentationModeFor;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("presentationModeFor with the cockpit", () => {
  it("keeps every governance route on the light review room when the flag is off", async () => {
    const mode = await load();
    for (const path of ["/governance/approvals", "/governance/approvals/AP-201/r1", "/governance/exit-reviews/EX-771", "/governance/waivers"]) {
      expect(mode(null, path), path).toBe("governance-light");
    }
  });

  describe("flag on", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
      vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "cockpit");
      vi.resetModules();
    });

    it("moves the approval and review routes to Carbon", async () => {
      const mode = await load();
      for (const path of ["/governance/approvals", "/governance/approvals/", "/governance/approvals/AP-201/r1", "/governance/approvals/AP-352/r2", "/governance/approvals/AP-311/live", "/governance/exit-reviews", "/governance/exit-reviews/EX-771"]) {
        expect(mode(null, path), path).toBe("execution-carbon");
      }
    });

    it("leaves the screens without a V2 version on the light surface", async () => {
      const mode = await load();
      for (const path of ["/governance/approvals/new", "/governance/waivers", "/governance"]) {
        expect(mode(null, path), path).toBe("governance-light");
      }
    });
  });
});
