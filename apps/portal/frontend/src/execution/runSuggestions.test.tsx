/** Slice C · the new-request entry offers completed Research runs, keeps ids editable, and says what the usual way in is. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewApprovalRequestScreen } from "./screens/NewApprovalRequest";
import { readRunOptions } from "./runSuggestions";

afterEach(cleanup);

const LIST = {
  items: [
    { run_id: "rrun_a", status: "COMPLETED", created_at_utc_ms: 1791468697699, binding: { alpha_id: "alpha_rsi", alpha_name: "RSI v1.7" } },
    { run_id: "rrun_b", status: "RUNNING", binding: { alpha_id: "alpha_x" } },
    { run_id: "rrun_c", status: "COMPLETED", binding: { alpha_id: "" } },
    { run_id: "rrun_d", status: "COMPLETED" },
    { status: "COMPLETED", binding: { alpha_id: "alpha_y" } },
  ],
};

describe("readRunOptions", () => {
  it("keeps only completed runs that name their alpha; unknown shapes are skipped, never guessed", () => {
    expect(readRunOptions(LIST)).toEqual([{ runId: "rrun_a", alphaId: "alpha_rsi", alphaName: "RSI v1.7", createdMs: 1791468697699 }]);
    expect(readRunOptions(null)).toEqual([]);
    expect(readRunOptions({ items: "x" })).toEqual([]);
  });
});

describe("New approval request entry", () => {
  const base = { onSubmit: vi.fn(), outcome: null, submitting: false, onReset: vi.fn() } as const;

  it("says the usual way in is Research, and links the Run Library", () => {
    render(<NewApprovalRequestScreen {...base} />);
    expect(document.querySelector("[data-entry-hint]")!.textContent).toMatch(/publish a Release Candidate/);
    expect(document.querySelector('[data-entry-hint] a')!.getAttribute("href")).toBe("/research/quantbt/runs");
  });

  it("picking a run fills the run and its alpha together, and both stay editable", () => {
    render(<NewApprovalRequestScreen {...base} runOptions={readRunOptions(LIST)} />);
    fireEvent.change(screen.getByLabelText("Pick a completed run from Research"), { target: { value: "rrun_a" } });
    expect((screen.getByLabelText("Evidence run (from the run library)") as HTMLInputElement).value).toBe("rrun_a");
    expect((screen.getByLabelText("Alpha (from the alpha registry)") as HTMLInputElement).value).toBe("alpha_rsi");
    fireEvent.change(screen.getByLabelText("Evidence run (from the run library)"), { target: { value: "rrun_other" } });
    expect((screen.getByLabelText("Pick a completed run from Research") as HTMLSelectElement).value).toBe("");
  });

  it("a link from Research can name the ids; an unreadable list is stated, not hidden", () => {
    render(<NewApprovalRequestScreen {...base} initial={{ alphaId: "alpha_rsi", runId: "rrun_a", claimId: "clm_31" }} runOptionsReason="The Research run list could not be read, so no run is offered — type the ids instead." />);
    expect((screen.getByLabelText("Methodology claim") as HTMLInputElement).value).toBe("clm_31");
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });
});
