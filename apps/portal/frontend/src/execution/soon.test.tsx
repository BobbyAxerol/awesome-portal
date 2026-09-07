/**
 * "Soon" (owner ruling 2026-09-07): a capability the source will publish reads
 * as a schedule, not as a fault — and nothing else may borrow that word.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PanelState } from "./components/states";
import { isSourcePending, soonEmptyLine, soonReason, soonTitle } from "./soon";

afterEach(cleanup);

describe("source-pending classification", () => {
  it("recognises the named source gaps and nothing else", () => {
    for (const code of [
      "BR-EX-50", "BR-EX-79", "BR-EX-80", "BR-EX-81",
      "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED",
      "EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED",
      "MARKET_CANDLES_SOURCE_NOT_WIRED",
      "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
      "N17B_SOURCE_REJECTED",
      "N23_SCREEN_OUTSIDE_RELEASE",
      "EDS10_AUTHORITATIVE_REPLAY_SOURCE_GAP_CONFIRMED",
    ]) {
      expect(isSourcePending(code)).toBe(true);
    }
    // A denial, a fault, a permission and an unknown code are not "Soon".
    for (const code of [
      "ADMIN_ROLE_REQUIRED", "QUERY_FORBIDDEN", "WORKSPACE_NOT_FOUND",
      "PHASE2_PROJECTION_STALE_CEILING_EXCEEDED", "N31_PROFILE_PROJECTION_DOCUMENT_INVALID",
      "SOMETHING_NOBODY_CLASSIFIED_YET", "", null, undefined,
    ]) {
      expect(isSourcePending(code)).toBe(false);
    }
  });

  it("keeps the code, collapses the envelope's doubled code, and never prefixes twice", () => {
    expect(soonReason("BR-EX-50")).toBe("Soon · BR-EX-50");
    expect(soonReason("MANAGER_V2_SOURCE_CONTRACT_REJECTED: MANAGER_V2_SOURCE_CONTRACT_REJECTED")).toBe("Soon · MANAGER_V2_SOURCE_CONTRACT_REJECTED");
    expect(soonReason("Soon · BR-EX-81")).toBe("Soon · BR-EX-81");
    expect(soonReason("ADMIN_ROLE_REQUIRED")).toBe("ADMIN_ROLE_REQUIRED");
    expect(soonReason(null)).toBeNull();
  });

  it("renames only the states where a source gap is a possible reading", () => {
    expect(soonTitle("unavailable", "BR-EX-50", "Unavailable")).toBe("Soon");
    expect(soonTitle("insufficient_data", "N17B_SOURCE_REJECTED", "Insufficient data")).toBe("Soon");
    expect(soonTitle("empty", "MANAGER_V2_SOURCE_CONTRACT_REJECTED", "Nothing to show")).toBe("Soon");
    // A withheld panel is a permission fact and a failed one is a fault: both
    // keep their own word even if a source code travels with them.
    expect(soonTitle("denied", "BR-EX-50", "Withheld")).toBe("Withheld");
    expect(soonTitle("terminal", "BR-EX-50", "Failed")).toBe("Failed");
    expect(soonTitle("stale", "BR-EX-50", "Stale")).toBe("Stale");
    expect(soonTitle("unavailable", "PHASE2_PROJECTION_STALE_CEILING_EXCEEDED", "Unavailable")).toBe("Unavailable");
  });

  it("says what the page does hold, so an empty list is never mistaken for an empty world", () => {
    expect(soonEmptyLine("approval requests")).toBe("Soon · the source has published no approval requests for this profile yet");
    expect(soonEmptyLine("operations", { rows: 812, label: "orders" }))
      .toBe("Soon · the source has published no operations for this profile yet · the retained page holds 812 orders");
  });
});

describe("PanelState", () => {
  it("reads Soon for a source gap and keeps the code", () => {
    const { container } = render(<PanelState status="unavailable" reason="EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED" />);
    expect(screen.getByText("Soon")).toBeTruthy();
    expect(screen.getByText("Soon · EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED")).toBeTruthy();
    expect(container.querySelector('[data-soon="true"]')).not.toBeNull();
    expect(container.querySelector('[data-status="unavailable"]')).not.toBeNull();
  });

  it("keeps Unavailable for a fault and Withheld for a denial", () => {
    const { container, unmount } = render(<PanelState status="unavailable" reason="PHASE2_PROJECTION_STALE_CEILING_EXCEEDED" />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(container.querySelector('[data-soon="true"]')).toBeNull();
    unmount();
    render(<PanelState status="denied" reason="ADMIN_ROLE_REQUIRED" />);
    expect(screen.getByText("Withheld")).toBeTruthy();
  });
});
