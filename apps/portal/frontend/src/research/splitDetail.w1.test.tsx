/**
 * W1 · G2 — S05-S08 stage pages: the run's face when a lane has no evidence.
 *
 * StageRunBar is shared by split, search, freeze and execute. The Library read is
 * made only when `active`; its answer goes through runTerminalState. Library rows
 * are derived (runStates.fixture.ts), not hand-built.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunNotFound, StageRunBar } from "./SplitDetail";
import { StageDenied } from "./StageDenied";
import { runLibraryApi } from "./runLibraryClient";
import { libraryPage, libraryRow, type RunStatusWireFixture } from "./runStates.fixture";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const RUN = "rrun_00000000000000000000000000000001";

function bar(active: boolean) {
  return render(
    <MemoryRouter>
      <StageRunBar runId={RUN} active={active} />
    </MemoryRouter>,
  );
}

function answer(rows: ReturnType<typeof libraryRow>[]) {
  return vi.spyOn(runLibraryApi, "list").mockResolvedValue(libraryPage(rows));
}

const exits = (c: HTMLElement) => [...c.querySelectorAll("[data-exit]")].map((a) => a.getAttribute("data-exit"));

describe("W1-stages — StageRunBar", () => {
  it("makes no Library read while a lane has data (active=false)", () => {
    const list = answer([]);
    const { container } = bar(false);
    expect(list).not.toHaveBeenCalled();
    expect(container.querySelector("[data-stage-run-bar]")).toBeNull();
  });

  const cases: [RunStatusWireFixture, string, string, string[]][] = [
    ["QUEUED", "queued", "Queued.", ["progress", "library"]],
    ["RUNNING", "running", "Running.", ["progress", "library"]],
    ["FAILED", "failed", "Failed.", ["progress", "new-run", "library"]],
    ["CANCELLED", "cancelled", "Cancelled.", ["progress", "new-run", "library"]],
  ];
  for (const [status, phase, banner, expected] of cases) {
    it(`${status}: ${banner} with ${expected.join(", ")}`, async () => {
      answer([libraryRow(status, { runId: RUN })]);
      const { container } = bar(true);
      await waitFor(() => expect(container.querySelector(`[data-stage-run-bar='${phase}']`)).toBeTruthy());
      expect(container.querySelector("[data-run-exit-bar] span[data-run-phase]")?.textContent).toBe(banner);
      expect(exits(container)).toEqual(expected);
      expect(container.querySelector("[data-run-exit-bar] span[data-run-phase]")?.getAttribute("title")).toBeTruthy();
    });
  }

  it("COMPLETED: nothing is added (the lane's own typed absence stays the only message)", async () => {
    const list = answer([libraryRow("COMPLETED", { runId: RUN })]);
    const { container } = bar(true);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-stage-run-bar='completed']")).toBeTruthy());
    expect(container.querySelector("[data-exit]")).toBeNull();
  });

  it("not listed in the workspace: one Run not available. line, only Library", async () => {
    answer([]);
    const { container } = bar(true);
    await waitFor(() => expect(container.querySelector("[data-stage-run-bar='unavailable']")).toBeTruthy());
    expect(container.querySelector("[data-run-exit-bar] span[data-run-phase]")?.textContent).toBe("Run not available.");
    expect(exits(container)).toEqual(["library"]);
  });
});

describe("W1-stages — 404/403", () => {
  it("RunNotFound is the banner and Library only; the F-04 sentence is the tooltip", () => {
    const { container } = render(
      <MemoryRouter>
        <RunNotFound runId={RUN} />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-run-exit-bar] span[data-run-phase]")?.textContent).toBe("Run not available.");
    expect(container.querySelector("[data-run-exit-bar] span[data-run-phase]")?.getAttribute("title")).toMatch(/./);
    expect(exits(container)).toEqual(["library"]);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("StageDenied keeps the crumb and shows no stage chrome", () => {
    const { container } = render(
      <MemoryRouter>
        <StageDenied runId={RUN} stage="Stage 3 · Freeze" screen="freeze-detail" />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-stage-denied]")).toBeTruthy();
    expect(exits(container)).toEqual(["library"]);
  });
});
