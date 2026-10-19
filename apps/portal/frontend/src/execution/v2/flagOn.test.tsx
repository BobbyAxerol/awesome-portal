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

  async function frame(manifest: string, screenId: string, entry = "/execution/orders?env=paper") {
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", manifest);
    vi.resetModules();
    const { PreviewFrame } = await import("../ExecutionPreviewRoute");
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[entry]}>
          <PreviewFrame screenId={screenId}><p>child</p></PreviewFrame>
        </MemoryRouter>,
      );
    });
    await waitFor(() => expect(document.querySelector(".exec-ctxbar")).not.toBeNull());
  }

  it("locks the environment on the V2 Blotter, with the reason, and only there", async () => {
    await frame("shell,blotter", "EXECUTION_FULL_BLOTTER_SCREEN");
    const paper = screen.getByRole("button", { name: "Paper" }) as HTMLButtonElement;
    expect(paper.disabled).toBe(true);
    const why = document.getElementById(paper.getAttribute("aria-describedby") ?? "");
    expect(why?.textContent).toContain("Not published (FE-052)");
  });

  it("leaves the environment live on the Blotter while the blotter flag is off, and on other screens", async () => {
    await frame("shell", "EXECUTION_FULL_BLOTTER_SCREEN");
    expect((screen.getByRole("button", { name: "Paper" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    await frame("shell,blotter", "alpha_fleet");
    expect((screen.getByRole("button", { name: "Paper" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Operations states why the window is off (its own Range, FE-025) without a fixed-window chip", async () => {
    await frame("shell,ops", "EXECUTION_OPERATIONS_QUEUE_SCREEN", "/execution/operations?env=paper");
    const group = screen.getByRole("group", { name: "Window" });
    const buttons = [...group.querySelectorAll("button")] as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    const why = document.getElementById(buttons[0].getAttribute("aria-describedby") ?? "");
    expect(why?.textContent).toContain("Operations has its own Range control below. The server takes no window (FE-025).");
    expect(document.querySelector(".exec-ctxbar-lock")).toBeNull();
  });

  it("another screen keeps the generic window reason, and Operations with its flag off does too", async () => {
    await frame("shell,ops", "alpha_fleet", "/execution/fleet?env=paper");
    const generic = (): string | null | undefined => {
      const btn = screen.getByRole("group", { name: "Window" }).querySelector("button")!;
      return document.getElementById(btn.getAttribute("aria-describedby") ?? "")?.textContent;
    };
    expect(generic()).toContain("Window applies when the server supports it.");
    cleanup();
    await frame("shell", "EXECUTION_OPERATIONS_QUEUE_SCREEN", "/execution/operations?env=paper");
    expect(generic()).toContain("Window applies when the server supports it.");
  });
});
