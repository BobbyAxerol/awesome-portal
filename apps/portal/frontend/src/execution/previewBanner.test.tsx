/** EL-V2-09 — the preview banner says the registry's delivery profile, never a hard-coded word. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewBanner } from "./ExecutionPreviewRoute";
import { screenDeliveryProfile } from "./profile";

afterEach(cleanup);

describe("PreviewBanner", () => {
  it.each([
    ["http", "PORTAL READS · SAME-ORIGIN", /same-origin Portal BFF call/],
    ["shadow", "SHADOW PROJECTION", /not the live source/],
    ["source", "SOURCE · READ-ONLY", /commands remain disabled/],
  ])("%s says %s", (profile, title, line) => {
    const { container } = render(<PreviewBanner profile={profile} />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(line)).toBeTruthy();
    expect(container.querySelector("[data-execution-preview]")?.getAttribute("data-execution-preview")).toBe(profile);
  });
  it("a null profile (registry publishes none) states the same-origin transport; an unknown profile is named and treated as not live", () => {
    // N29: the transport is same-origin HTTP unconditionally — a missing
    // registry word cannot demote the banner to a fixture claim.
    render(<PreviewBanner profile={null} />);
    expect(screen.getByText("PORTAL READS · SAME-ORIGIN")).toBeTruthy();
    cleanup();
    const { container } = render(<PreviewBanner profile="mystery" />);
    expect(screen.getByText("PROFILE MYSTERY")).toBeTruthy();
    expect(container.querySelector("[data-execution-preview]")?.getAttribute("data-execution-preview")).toBe("unknown");
  });
  it("reads the registry screen's delivery_profile through the same reader the envelopes use", () => {
    expect(screenDeliveryProfile({ delivery_profile: "shadow" })).toBe("shadow");
    expect(screenDeliveryProfile({ delivery_profile: null })).toBeNull();
  });
});
