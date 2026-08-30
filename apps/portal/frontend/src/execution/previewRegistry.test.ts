import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXECUTION_PREVIEW_EXTRA_ROUTES,
  EXECUTION_PREVIEW_FEATURE_DEFAULTS,
  EXECUTION_PREVIEW_SCREEN_IDS,
  hasExecutionPreview,
} from "./previewRegistry";

const registry = JSON.parse(
  readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"),
) as {
  features: { id: string; canonical_route: string }[];
  screens: {
    screen_id: string;
    feature_id: string;
    route: string;
    delivery_profile: string | null;
    delivery_policy: Record<string, unknown> | null;
  }[];
};

describe("Execution integration preview registry", () => {
  it("covers every reviewed Execution screen exactly once", () => {
    const declared = registry.screens
      .map((screen) => screen.screen_id)
      .filter((screenId) => screenId.startsWith("EXECUTION_"));
    // The three owner-commissioned screens (2026-08-30) have no registry rows
    // yet — HOTFIX_REQUEST_2026-08-30 §2 asks codex for them. Until they land,
    // the preview claims their paths via EXECUTION_PREVIEW_EXTRA_ROUTES and
    // this test names the difference precisely instead of loosening.
    const pendingRegistryRows = EXECUTION_PREVIEW_EXTRA_ROUTES.map((r) => r.screenId).sort();
    expect(pendingRegistryRows).toEqual([
      "EXECUTION_GATE_LIVE_REVIEW_SCREEN",
      "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN",
      "EXECUTION_WAIVERS_REGISTER_SCREEN",
    ]);
    expect(
      [...EXECUTION_PREVIEW_SCREEN_IDS].filter((id) => !pendingRegistryRows.includes(id)).sort(),
    ).toEqual(declared.sort());
    expect(declared.every(hasExecutionPreview)).toBe(true);
  });

  it("mounts only fixture-profile screens whose capability policy remains dark", () => {
    for (const screen of registry.screens.filter((entry) => hasExecutionPreview(entry.screen_id))) {
      expect(screen.delivery_profile, screen.screen_id).toBe("fixture");
      expect(screen.delivery_policy, screen.screen_id).not.toBeNull();
      for (const [key, value] of Object.entries(screen.delivery_policy ?? {})) {
        if (key.endsWith("_enabled")) expect(value, `${screen.screen_id}.${key}`).toBe(false);
      }
    }
  });

  it("gives every dynamic-only sidebar feature a safe canonical-cast default", () => {
    for (const [featureId, screenId] of Object.entries(EXECUTION_PREVIEW_FEATURE_DEFAULTS)) {
      expect(registry.features.some((feature) => feature.id === featureId), featureId).toBe(true);
      expect(hasExecutionPreview(screenId), screenId).toBe(true);
    }
  });
});
