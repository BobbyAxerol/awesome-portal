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
    expect(EXECUTION_PREVIEW_EXTRA_ROUTES).toEqual([]);
    expect([...EXECUTION_PREVIEW_SCREEN_IDS].sort()).toEqual(declared.sort());
    expect(declared.every(hasExecutionPreview)).toBe(true);
  });

  it("publishes the exact BR-EX-72 shadow policy while keeping legacy screens dark", () => {
    const shadowPolicies: Record<string, string[]> = {
      EXECUTION_ALPHA_FLEET_LIST_SCREEN: ["projection_ingestion_enabled", "query_enabled"],
      EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN: ["projection_ingestion_enabled", "query_enabled"],
      EXECUTION_NEW_APPROVAL_REQUEST_SCREEN: ["governance_write_enabled"],
      EXECUTION_GATE_LIVE_REVIEW_SCREEN: ["query_enabled"],
      EXECUTION_WAIVERS_REGISTER_SCREEN: ["query_enabled"],
    };
    for (const screen of registry.screens.filter((entry) => hasExecutionPreview(entry.screen_id))) {
      const enabled = Object.entries(screen.delivery_policy ?? {})
        .filter(([key, value]) => key.endsWith("_enabled") && value === true)
        .map(([key]) => key)
        .sort();
      if (screen.screen_id in shadowPolicies) {
        expect(screen.delivery_profile, screen.screen_id).toBe("shadow");
        expect(enabled, screen.screen_id).toEqual(shadowPolicies[screen.screen_id]);
        continue;
      }
      expect(screen.delivery_profile, screen.screen_id).toBe("fixture");
      expect(screen.delivery_policy, screen.screen_id).not.toBeNull();
      expect(enabled, screen.screen_id).toEqual([]);
    }
  });

  it("gives every dynamic-only sidebar feature a safe canonical-cast default", () => {
    for (const [featureId, screenId] of Object.entries(EXECUTION_PREVIEW_FEATURE_DEFAULTS)) {
      expect(registry.features.some((feature) => feature.id === featureId), featureId).toBe(true);
      expect(hasExecutionPreview(screenId), screenId).toBe(true);
    }
  });
});
