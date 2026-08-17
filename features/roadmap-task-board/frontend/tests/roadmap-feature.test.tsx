import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../src/components/ui";
import { ROADMAP_PHASES_SEED } from "../src/content/seed";
import { RoadmapFeature } from "../src/features/roadmap/RoadmapFeature";
import { LS_PHASES, LS_TASKS } from "../src/lib/storage";

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

    // The row is addressed by its stable test id; the phase code and name are
    // separate elements now, because the code carries the identity colour.
    const row = await screen.findByTestId("roadmap-phase-P6");
    expect(within(row).getByText("P6")).toBeInTheDocument();
    expect(within(row).getByText(/Portal integration/)).toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem(LS_PHASES) ?? "[]") as Array<{ id: string; name: string }>;
    expect(stored).toHaveLength(ROADMAP_PHASES_SEED.length + 1);
    expect(stored).toEqual(expect.arrayContaining([expect.objectContaining({ id: "P6", name: "Portal integration" })]));
  });

  it("reports delivery from real tasks, and says so when a phase has none", async () => {
    window.localStorage.setItem(
      LS_TASKS,
      JSON.stringify([
        { id: "T-1", title: "a", workstream: "QuantBT", phase: "P0", priority: "P1", owner: "x", status: "Done", depends: [], notes: "", created: "" },
        { id: "T-2", title: "b", workstream: "QuantBT", phase: "P0", priority: "P1", owner: "x", status: "Ready", depends: [], notes: "", created: "" },
      ]),
    );
    render(<ToastProvider><RoadmapFeature apiMode="local" /></ToastProvider>);

    const withTasks = await screen.findByTestId("roadmap-phase-P0");
    expect(within(withTasks).getByText("1/2")).toBeInTheDocument();

    // P1 has no tasks: unknown delivery must not render as 0/0 or 0%.
    const withoutTasks = screen.getByTestId("roadmap-phase-P1");
    expect(within(withoutTasks).getByText(/chưa có task gán vào phase/)).toBeInTheDocument();
    expect(within(withoutTasks).queryByText("0/0")).toBeNull();
  });

  it("summarises the program from the phases actually loaded", async () => {
    render(<ToastProvider><RoadmapFeature apiMode="local" /></ToastProvider>);
    const summary = await screen.findByTestId("program-summary");
    // Seed phases run W1..W24 with P3/P4 overlapping, so the horizon and the
    // peak-concurrency reading are both derived, not hard-coded.
    expect(within(summary).getByText("W1–W24")).toBeInTheDocument();
    expect(within(summary).getByText(String(ROADMAP_PHASES_SEED.length))).toBeInTheDocument();
  });
});
