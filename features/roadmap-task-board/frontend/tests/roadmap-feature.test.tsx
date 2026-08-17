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

describe("timeline row affordances", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does not print the internal tone enum next to the phase swatch", async () => {
    // The tone chip contradicted the colour beside it on every seeded phase:
    // the swatch comes from the workstream ramp, the chip printed `tone`.
    render(<ToastProvider><RoadmapFeature apiMode="local" /></ToastProvider>);
    const row = await screen.findByTestId("roadmap-phase-P2");
    expect(within(row).queryByText("purple")).toBeNull();
    // The identity that IS shown stays: phase code plus name.
    expect(within(row).getByText("P2")).toBeInTheDocument();
  });

  it("keeps the destructive action out of the row (v0.5 §13)", async () => {
    render(<ToastProvider><RoadmapFeature apiMode="local" /></ToastProvider>);
    const row = await screen.findByTestId("roadmap-phase-P0");
    expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("drops a bar label it cannot fit, keeping the range on the fact line", async () => {
    render(<ToastProvider><RoadmapFeature apiMode="local" /></ToastProvider>);
    // P0 spans one week of twenty-four, so the in-bar label would clip to "W…".
    const short = await screen.findByTestId("roadmap-phase-P0");
    expect(short.querySelector(".phase-bar-label")).toBeNull();
    expect(within(short).getByText(/W1→W1/)).toBeInTheDocument();
    // P5 spans nine weeks and keeps its label.
    const long = screen.getByTestId("roadmap-phase-P5");
    expect(long.querySelector(".phase-bar-label")?.textContent).toContain("W16");
  });
});
