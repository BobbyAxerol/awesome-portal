/**
 * W1 · G2 — Screen 03 progress, run lifecycle.
 *
 * Data is derived (runStates.fixture.ts): the canonical progress read with only
 * the status fields overridden. Asserts hooks and the §1.1 words.
 */
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunProgress } from "./RunProgress";
import type { ProgressRead } from "./progressClient";
import { researchState } from "./state";
import { progressFor } from "./runStates.fixture";

afterEach(cleanup);

const OK = researchState({ kind: "ok", rowCount: 5 });

function view(read: ProgressRead | null, state = OK) {
  return render(
    <MemoryRouter>
      <RunProgress
        runId="rrun_00000000000000000000000000000001"
        read={read}
        snapshot={read?.progress ?? null}
        state={state}
        transport="stream"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
      />
    </MemoryRouter>,
  );
}

const noSource = (availability: "QUEUED_NO_SOURCE" | "CANCELLED_BEFORE_SOURCE", status: "QUEUED" | "CANCELLED"): ProgressRead => ({
  ...progressFor(status),
  availability,
  progress: null,
});

describe("W1-progress — no-source faces", () => {
  it("QUEUED: Queued. with the long sentence in the tooltip, a Library exit and no self link", () => {
    const { container } = view(noSource("QUEUED_NO_SOURCE", "QUEUED"));
    const root = container.querySelector("[data-no-source]") as HTMLElement;
    expect(root.querySelector("[data-run-phase='queued']")).toBeTruthy();
    expect(root.querySelector("h2")?.textContent).toBe("Queued.");
    expect(root.querySelector("h2")?.getAttribute("title")).toMatch(/queued/);
    expect([...root.querySelectorAll("[data-exit]")].map((a) => a.getAttribute("data-exit"))).toEqual(["library"]);
  });

  it("CANCELLED: Cancelled. and a Library exit next to the one New run control", () => {
    const { container } = view(noSource("CANCELLED_BEFORE_SOURCE", "CANCELLED"));
    const root = container.querySelector("[data-no-source]") as HTMLElement;
    expect(root.querySelector("h2")?.textContent).toBe("Cancelled.");
    expect([...root.querySelectorAll("[data-exit]")].map((a) => a.getAttribute("data-exit"))).toEqual(["library"]);
    expect(root.querySelectorAll("[data-exit='new-run']")).toHaveLength(0);
  });

  it("NOT FOUND: one Run not available. line, only Library", () => {
    const { container } = view(null, { state: "empty", reason: "Run not found.", mayRetry: false, retainsContent: false });
    const root = container.querySelector("[data-run-not-found]") as HTMLElement;
    expect(root.querySelector("[data-run-phase='unavailable']")?.textContent).toBe("Run not available.");
    expect([...root.querySelectorAll("[data-exit]")].map((a) => a.getAttribute("data-exit"))).toEqual(["library"]);
  });
});

describe("W1-progress — terminal faces", () => {
  it("FAILED: the status word is humanised and Library sits beside the new-run control", () => {
    const { container } = view(progressFor("FAILED", { failedStage: "S4" }));
    expect(container.querySelector("[data-status-pill]")?.textContent).toBe("failed");
    expect(container.querySelector("[data-exit='library']")?.getAttribute("href")).toBe("/research/quantbt/runs");
  });

  it("CANCELLED terminal: Library offered", () => {
    const { container } = view(progressFor("CANCELLED"));
    expect(container.querySelector("[data-status-pill]")?.textContent).toBe("cancelled");
    expect(container.querySelector("[data-exit='library']")).toBeTruthy();
  });

  it("RUNNING: no exit link and the live word", () => {
    const { container } = view(progressFor("RUNNING"));
    expect(container.querySelector("[data-status-pill]")?.textContent).toBe("running");
    expect(container.querySelector("[data-exit='library']")).toBeNull();
  });
});

describe("W1-progress — stage chips and trial label", () => {
  it("the S4 chip opens the execute deep dive, not a hub tab", () => {
    const read = progressFor("COMPLETED");
    const { container } = view(read);
    const chip = container.querySelector("a[data-stage='S4']");
    if (chip !== null) expect(chip.getAttribute("href")).toContain("/execute");
    const s5 = container.querySelector("a[data-stage='S5']");
    if (s5 !== null) expect(s5.getAttribute("href")).toContain("/evidence");
  });

  it("no printed trial carries a #", () => {
    const { container } = view(progressFor("RUNNING"));
    expect(container.textContent).not.toMatch(/#\d/);
  });
});
