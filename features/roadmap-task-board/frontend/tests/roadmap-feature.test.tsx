import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../src/components/ui";
import { ROADMAP_PHASES_SEED } from "../src/content/seed";
import { RoadmapFeature } from "../src/features/roadmap/RoadmapFeature";
import { LS_PHASES } from "../src/lib/storage";

describe("RoadmapFeature", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("adds a phase and persists it under the existing key", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><RoadmapFeature apiMode="local" /></ToastProvider>);

    await user.click(screen.getByRole("button", { name: "+ Add phase" }));
    await user.clear(screen.getByLabelText("Phase name"));
    await user.type(screen.getByLabelText("Phase name"), "Portal integration");
    await user.click(screen.getByRole("button", { name: "Save phase" }));

    expect(await screen.findByText(/P6 · Portal integration/)).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(LS_PHASES) ?? "[]") as Array<{ id: string; name: string }>;
    expect(stored).toHaveLength(ROADMAP_PHASES_SEED.length + 1);
    expect(stored).toEqual(expect.arrayContaining([expect.objectContaining({ id: "P6", name: "Portal integration" })]));
  });
});
