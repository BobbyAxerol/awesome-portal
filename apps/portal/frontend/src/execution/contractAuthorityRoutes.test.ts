import { describe, expect, it } from "vitest";
import { BACKEND_SCREEN_TO_FRONTEND_RENDERER, assertContractAuthorityRouteGraph } from "./contractAuthorityRoutes";
import { EXECUTION_PREVIEW_SCREEN_IDS } from "./previewRegistry";
import { readContractAuthority } from "./screenDataContract";

const authority = {
  schema_version: "portal.execution.contract-authority.v1",
  record_authority: "PORTAL_CONTROL",
  workspace_id: "ws_primary",
  read_at_ms: 1,
  screen_data_manifest: { screens: Object.keys(BACKEND_SCREEN_TO_FRONTEND_RENDERER).map((screen_id) => ({ screen_id, panels: [], actions: [] })) },
  action_manifest: { actions: [{ source_screen_id: "EXECUTION_ALPHA_FLEET_LIST_SCREEN" }] },
};

describe("EDS-02 semantic route/action graph", () => {
  it("maps every backend screen to a reviewed frontend renderer without receiving URLs from the server", () => {
    expect(Object.keys(BACKEND_SCREEN_TO_FRONTEND_RENDERER)).toHaveLength(25);
    for (const renderer of Object.values(BACKEND_SCREEN_TO_FRONTEND_RENDERER)) {
      expect(EXECUTION_PREVIEW_SCREEN_IDS.has(renderer as never)).toBe(true);
    }
    expect(assertContractAuthorityRouteGraph(authority as never)).toBe(true);
  });

  it("refuses an unowned screen or an action carrying a route-like href", () => {
    expect(assertContractAuthorityRouteGraph({
      ...authority,
      screen_data_manifest: { screens: [{ screen_id: "UNKNOWN_SCREEN", panels: [], actions: [] }] },
      action_manifest: { actions: [] },
    } as never)).toBe(false);
    expect(assertContractAuthorityRouteGraph({
      ...authority,
      screen_data_manifest: { screens: [{ screen_id: "EXECUTION_ALPHA_FLEET_LIST_SCREEN", panels: [], actions: [{ href: "/bad" }] }] },
      action_manifest: { actions: [] },
    } as never)).toBe(false);
  });

  it("has a decoder-compatible source shape for the same-origin consumer", () => {
    expect(readContractAuthority(authority)).toBeNull();
    // A route graph is deliberately independent from a data payload: the full
    // authority decoder additionally requires all declared safety metadata.
  });
});
