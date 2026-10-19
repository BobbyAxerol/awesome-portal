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

  describe("profile flag", () => {
    it("moves the Access self-view to Carbon only when `profile` is on", async () => {
      let mode = await load();
      expect(mode(null, "/administration/profile-access")).toBe("research-light");
      vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
      vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "profile");
      vi.resetModules();
      mode = await load();
      expect(mode(null, "/administration/profile-access")).toBe("execution-carbon");
      expect(mode(null, "/administration/users")).toBe("research-light");
    });
  });

  describe("request flag", () => {
    it("moves the New request page, and only it, to Carbon when `request` is on: the shell follows the V2 page's own surface", async () => {
      let mode = await load();
      expect(mode(null, "/governance/approvals/new")).toBe("governance-light");
      vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
      vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "request");
      vi.resetModules();
      mode = await load();
      for (const path of ["/governance/approvals/new", "/governance/approvals/new/"]) expect(mode(null, path), path).toBe("execution-carbon");
      // Everything else under Governance stays light with only `request` on.
      for (const path of ["/governance/approvals", "/governance/approvals/AP-201/r1", "/governance/approvals/newer", "/governance/waivers", "/governance"]) {
        expect(mode(null, path), path).toBe("governance-light");
      }
    });

    it("with the cockpit on and `request` off the page stays light", async () => {
      vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
      vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "cockpit");
      vi.resetModules();
      const mode = await load();
      expect(mode(null, "/governance/approvals/new")).toBe("governance-light");
    });
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
