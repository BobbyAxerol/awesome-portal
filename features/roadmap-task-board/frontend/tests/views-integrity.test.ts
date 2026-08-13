import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { VIEW_PANELS } from "../src/content/views";
import { BASE_TASKS_SEED, ROADMAP_PHASES_SEED } from "../src/content/seed";
import viewManifest from "../src/content/content-integrity-views.json";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("view panel integrity", () => {
  it("exposes exactly the view panels recorded in the contract", () => {
    expect(VIEW_PANELS.length).toBe(viewManifest.views.length);
    for (const v of VIEW_PANELS) {
      const stored = viewManifest.views.find((m: { id: string }) => m.id === v.id);
      expect(stored, v.id).toBeDefined();
      expect(stored.sha256, v.id).toBe(v.sha256);
      expect(sha256(v.html), v.id).toBe(v.sha256);
    }
  });

  it("seed data matches the golden constants", () => {
    expect(BASE_TASKS_SEED.length).toBe(viewManifest.seed.BASE_TASKS.count);
    expect(ROADMAP_PHASES_SEED.length).toBe(viewManifest.seed.ROADMAP_PHASES.count);
    expect(BASE_TASKS_SEED[0].id).toBe("ACQ-001");
    expect(ROADMAP_PHASES_SEED[0].id).toBe("P0");
  });

  it("viewport: every view id is a valid route", () => {
    const valid = new Set(["docs", "roadmap", "board", "reports", "evidence", "portal"]);
    for (const v of VIEW_PANELS) expect(valid.has(v.id.replace("view-", "")), v.id).toBe(true);
  });
});
