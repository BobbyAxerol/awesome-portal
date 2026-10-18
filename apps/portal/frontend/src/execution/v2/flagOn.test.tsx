/** UXM-07 S0 · with the shell flag on, PreviewFrame mounts the V2 context bar and keeps the rest of the frame. */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", "shell");
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("V2 shell flag on", () => {
  it("renders the context bar inside the surface, after the banner, before the children", async () => {
    const { PreviewFrame } = await import("../ExecutionPreviewRoute");
    let container!: HTMLElement;
    await act(async () => {
      container = render(
        <MemoryRouter initialEntries={["/execution/fleet?env=paper"]}>
          <PreviewFrame screenId="alpha_fleet"><p data-testid="child">child</p></PreviewFrame>
        </MemoryRouter>,
      ).container;
    });
    await waitFor(() => expect(container.querySelector(".exec-ctxbar")).not.toBeNull());
    const surface = container.querySelector(".exec-surface")!;
    expect(surface.contains(container.querySelector(".exec-ctxbar"))).toBe(true);
    const order = [...surface.children].map((el) => el.className || el.tagName);
    expect(order.findIndex((c) => String(c).includes("exec-preview-banner")))
      .toBeLessThan(order.findIndex((c) => String(c).includes("exec-ctxbar")));
    expect(screen.getByTestId("child")).toBeTruthy();
  });
});
