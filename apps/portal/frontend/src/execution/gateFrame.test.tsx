/** Gate frame refinements: the "Not yet" menu closes like a menu, and unavailable gates speak in words with a way back. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyRecordFrame, plainReason } from "./components/EmptyRecordFrame";
import { GateDecisionActions } from "./components/gateFrame";

afterEach(cleanup);

const action = (label: string) => ({ label, locked: false, onClick: vi.fn() });
const frame = (conditionCount = 0) => (
  <div>
    <GateDecisionActions conditionCount={conditionCount} approve={action("Approve")} condition={action("Approve with condition")} deny={action("Deny")} requestChanges={action("Request changes")} />
    <button type="button">elsewhere</button>
  </div>
);
const menu = () => document.querySelector(".exec-gf-more") as HTMLDetailsElement;

describe("the Not yet menu", () => {
  it("closes on Escape, on a press elsewhere and when a verb is chosen", () => {
    render(frame());
    menu().open = true;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu().open).toBe(false);
    menu().open = true;
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(menu().open).toBe(false);
    menu().open = true;
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(menu().open).toBe(false);
  });
  it("stays open when the press is inside it", () => {
    render(frame());
    menu().open = true;
    fireEvent.pointerDown(screen.getByRole("button", { name: "Request changes" }));
    expect(menu().open).toBe(true);
  });
  it("makes Approve with condition the primary once a condition is attached, and keeps plain Approve reachable", () => {
    render(frame(1));
    const primary = document.querySelector(".exec-gf-actions > button")!;
    expect(primary.textContent).toBe("Approve with condition");
    expect(document.querySelector(".exec-gf-menu")!.textContent).toContain("Approve");
  });
});

describe("an unavailable gate", () => {
  it("puts known codes into words, keeps the code for whoever quotes it, and leaves unknown text alone", () => {
    expect(plainReason("WORKSPACE_NOT_FOUND: Workspace not found.")).toBe("This record is not in the workspace named in the link (WORKSPACE_NOT_FOUND: Workspace not found.)");
    expect(plainReason("SOMETHING_ELSE_ENTIRELY: x")).toBe("SOMETHING_ELSE_ENTIRELY: x");
    expect(plainReason("plain sentence")).toBe("plain sentence");
  });
  it("offers a way back to the Approval Inbox on R1, R2 and Live", () => {
    render(<EmptyRecordFrame screen="gate-r1" status="unavailable" reason="APPROVAL_NOT_FOUND: Approval not found." />);
    expect(screen.getByText(/No approval with this id is visible to you/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to the Approval Inbox/ }).getAttribute("href")).toBe("/governance/approvals");
  });
});
