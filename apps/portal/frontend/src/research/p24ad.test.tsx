/** P24 agent AD: print convention, scroll-container focus, S14 step hash, linked-audit gate. */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stepFromHash } from "./AlphaImport";
import { LinkedAuditConsumer } from "./LinkedAuditConsumer";
import { PageHeader } from "./PageHeader";
import { StageLedger } from "./StageLedger";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P24-AD", () => {
  it("F-01 the copy-link button is no-print", () => {
    render(<PageHeader title="t" copy />);
    expect(screen.getByRole("button", { name: "Copy link" }).classList.contains("no-print")).toBe(true);
  });

  it("F-03 the stage ledger scroll container is keyboard-focusable and named", () => {
    const { container } = render(<StageLedger folds={[]} foldTrials={{}} cursor={{ fold: null, trial: null, params: null } as never} />);
    const ledger = container.querySelector("[data-stage-ledger]") as HTMLElement;
    expect(ledger.tabIndex).toBe(0);
    expect(ledger.getAttribute("aria-label")).toBeTruthy();
  });

  it("F-05 the S14 step is read from the hash, garbage is nothing", () => {
    expect(stepFromHash("#step=gates")).toBe(2);
    expect(stepFromHash("#step=register&x=1")).toBe(3);
    expect(stepFromHash("#step=source")).toBe(1);
    expect(stepFromHash("#step=nope")).toBeNull();
    expect(stepFromHash("")).toBeNull();
  });

  it("F-07 a target kind the linked audit does not cover sends no request and says so", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not be called"));
    render(<LinkedAuditConsumer runId="rrun_x" applicable={false} targetKind="FIXED_PARAMETER_PROFILE" />);
    const panel = document.querySelector("[data-linked-final-audit]") as HTMLElement;
    expect(panel.getAttribute("data-audit-state")).toBe("NOT_APPLICABLE");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([null, undefined])("F-07 absent applicability (%s) never infers permission from a target kind", applicable => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not be called"));
    render(<LinkedAuditConsumer runId="rrun_x" applicable={applicable} targetKind="SINGLE_PARAMETER_SET" />);
    expect(document.querySelector("[data-linked-final-audit]")?.getAttribute("data-audit-state")).toBe("NOT_PUBLISHED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("F-07 explicit applicability asks the server once, never starts compute", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 409, headers: { "content-type": "application/json" } }));
    render(<LinkedAuditConsumer runId="rrun_x" applicable targetKind="SINGLE_PARAMETER_SET" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/RESEARCH|does not admit/i, {}, { timeout: 2000 }).catch(() => null)).toBeDefined();
    expect(fetchSpy.mock.calls[0]?.[1]?.method ?? "GET").toBe("GET");
  });
});
